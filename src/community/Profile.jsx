// Public / private profile (designs 13–14) and «ملفي» with its settings.
// Counters are public on a public profile; the lists of people are friends-only
// (docs/ROOMS-DECISIONS.md §2). Minors: always private, no friend/message buttons (§5).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capi } from './api';
import { setMe, toast } from './store';
import { useT, n } from './format';
import { errText } from './errors';
import { useLoad } from './hooks';
import { RIcon, Avatar, Spinner, Sheet, Seg, Toggle, Confirm, ActionList, ErrorBox, BackButton, Empty, css as s } from './ui';
import ReportSheet from './Report';

function CoverPattern() {
  return (
    <svg className={s.coverPat} aria-hidden="true">
      <defs>
        <pattern id="pfStars" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M14 14h16v16H14z M22 10.7 33.3 22 22 33.3 10.7 22z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pfStars)" />
    </svg>
  );
}

const KINDS = [
  ['claps_sent', 'سقفات أرسلها', null],
  ['claps_received', 'سقفات استقبلها', 'clappers'],
  ['friends', 'الأصدقاء', 'friends'],
  ['followers', 'المتابعون', 'followers'],
];

function PeopleList({ open, onClose, kind, userId, isMe }) {
  const t = useT();
  const navigate = useNavigate();
  const titles = { friends: t('الأصدقاء'), followers: t('المتابعون'), following: t('يتابعهم'), clappers: t('من سقّف له') };
  const list = useLoad(() => (open && kind ? capi.get(isMe ? `/me/social/${kind}?per_page=100` : `/people/${userId}/${kind}?per_page=100`) : Promise.resolve(null)), [open, kind, userId]);
  return (
    <Sheet open={open} onClose={onClose} title={titles[kind] || ''} tall>
      {list.loading ? <Spinner /> : list.error ? <ErrorBox text={list.error.status === 403 ? t('قائمة الأشخاص تظهر للأصدقاء فقط.') : errText(t, list.error)} /> : (
        !list.data || !list.data.items.length ? <p className={s.muted}>{t('لا أحد هنا بعد.')}</p> : (
          <ul className={s.list} style={{ gap: 0 }}>
            {list.data.items.map(u => (
              <li key={u.id} className={s.personRow}>
                <button type="button" className={s.personBtn} onClick={() => { onClose(); navigate(`/people/${u.id}`); }}>
                  <Avatar user={u} size={42} />
                  <span className={s.grow}><b dir="auto">{u.name}</b>{u.claps ? <small>{t('{n} سقفة', { n: n(u.claps, t.lang) })}</small> : null}</span>
                </button>
                {isMe && kind === 'followers' && <RemoveFollower id={u.id} onDone={() => list.reload(true)} />}
              </li>
            ))}
          </ul>
        )
      )}
    </Sheet>
  );
}

function RemoveFollower({ id, onDone }) {
  const t = useT();
  return <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={async () => {
    try { await capi.del(`/me/followers/${id}`); onDone(); } catch (e) { toast(errText(t, e), 'error'); }
  }}>{t('إزالة')}</button>;
}

function EditSheet({ open, onClose, me }) {
  const t = useT();
  const p = me.profile || {};
  const [bio, setBio] = useState(p.bio || '');
  const [fb, setFb] = useState(p.facebook_url || '');
  const [ig, setIg] = useState(p.instagram_url || '');
  const [priv, setPriv] = useState(!!p.is_private);
  const [dm, setDm] = useState(p.dm_policy || 'everyone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (open) { setBio(p.bio || ''); setFb(p.facebook_url || ''); setIg(p.instagram_url || ''); setPriv(!!p.is_private); setDm(p.dm_policy || 'everyone'); setErr(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { bio: bio.trim(), facebook_url: fb.trim() || null, instagram_url: ig.trim() || null };
      if (!p.private_forced) { body.is_private = priv; body.dm_policy = dm; }
      const d = await capi.patch('/me/community-profile', body);
      setMe(d); toast(t('تم الحفظ.')); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('تعديل ملفي')} tall
      footer={<button type="button" className={`${s.btn} ${s.btnGold} ${s.btnBlock}`} disabled={busy} onClick={save}>{busy ? t('جارٍ الحفظ…') : t('حفظ')}</button>}>
      <label className={s.field}><span className={s.label}>{t('نبذة عنك')}</span>
        <textarea className={s.textarea} value={bio} maxLength={300} dir="auto" onChange={e => setBio(e.target.value)} placeholder={t('سطران عنك وعن اهتمامك بالقرآن')} />
        <span className={s.counter}>{n(bio.length, t.lang)} / {n(300, t.lang)} · {t('بلا روابط')}</span>
      </label>
      <label className={s.field}><span className={s.label}>{t('فيسبوك')} <small>({t('اختياري')})</small></span>
        <input className={s.input} type="url" inputMode="url" dir="ltr" value={fb} onChange={e => setFb(e.target.value)} placeholder="https://facebook.com/…" />
      </label>
      <label className={s.field}><span className={s.label}>{t('إنستجرام')} <small>({t('اختياري')})</small></span>
        <input className={s.input} type="url" inputMode="url" dir="ltr" value={ig} onChange={e => setIg(e.target.value)} placeholder="https://instagram.com/…" />
      </label>
      <div className={s.setRow}>
        <span><b id="privL">{t('بروفايل خاص')}</b><small>{p.private_forced ? t('بروفايل من هم دون ١٨ سنة خاص دائماً.') : t('النبذة والروابط والعدّادات تظهر لأصدقائك فقط.')}</small></span>
        <Toggle checked={p.private_forced ? true : priv} disabled={p.private_forced} onChange={setPriv} label={t('بروفايل خاص')} />
      </div>
      {!me.is_minor && (
        <div className={s.field}>
          <span className={s.label}>{t('من يراسلني')}</span>
          <Seg label={t('من يراسلني')} value={dm} onChange={setDm} options={[
            { value: 'everyone', label: t('الجميع') }, { value: 'same_gender', label: t('نفس الجنس فقط') }, { value: 'friends', label: t('الأصدقاء فقط') },
          ]} />
        </div>
      )}
      <p className={s.note}><RIcon name="image" size={16} /><span>{t('لتغيير صورتك افتح')} <Link className={s.link} to="/settings#account" onClick={onClose}>{t('الإعدادات')}</Link></span></p>
      {err && <ErrorBox text={errText(t, err)} />}
    </Sheet>
  );
}

function RequestsSheet({ open, onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const r = useLoad(() => (open ? capi.get('/me/friend-requests') : Promise.resolve(null)), [open]);
  const act = async (fn) => { try { await fn(); r.reload(true); } catch (e) { toast(errText(t, e), 'error'); } };
  return (
    <Sheet open={open} onClose={onClose} title={t('طلبات الصداقة')} tall>
      {r.loading ? <Spinner /> : r.error ? <ErrorBox text={errText(t, r.error)} /> : r.data && (
        <>
          <h3 className={s.secTitle}>{t('وصلتك')}</h3>
          {r.data.incoming.length === 0 ? <p className={s.faint}>{t('لا توجد طلبات جديدة.')}</p> : (
            <ul className={s.list} style={{ gap: 0 }}>{r.data.incoming.map(u => (
              <li key={u.id} className={s.personRow}>
                <button type="button" className={s.personBtn} onClick={() => { onClose(); navigate(`/people/${u.id}`); }}><Avatar user={u} size={40} /><span className={s.grow}><b dir="auto">{u.name}</b></span></button>
                <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => act(() => capi.post(`/me/friend-requests/${u.id}/decline`))}>{t('رفض')}</button>
                <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={() => act(() => capi.post(`/me/friend-requests/${u.id}/accept`))}>{t('قبول')}</button>
              </li>))}</ul>
          )}
          <h3 className={s.secTitle}>{t('أرسلتها')}</h3>
          {r.data.outgoing.length === 0 ? <p className={s.faint}>{t('لا توجد طلبات معلّقة.')}</p> : (
            <ul className={s.list} style={{ gap: 0 }}>{r.data.outgoing.map(u => (
              <li key={u.id} className={s.personRow}>
                <Avatar user={u} size={40} /><span className={s.grow}><b dir="auto">{u.name}</b></span>
                <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => act(() => capi.del(`/people/${u.id}/friend-request`))}>{t('إلغاء الطلب')}</button>
              </li>))}</ul>
          )}
        </>
      )}
    </Sheet>
  );
}

function BlocksSheet({ open, onClose }) {
  const t = useT();
  const r = useLoad(() => (open ? capi.get('/me/blocks') : Promise.resolve(null)), [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t('المحظورون')}>
      {r.loading ? <Spinner /> : r.error ? <ErrorBox text={errText(t, r.error)} /> : (!r.data || !r.data.items.length) ? <p className={s.faint}>{t('لم تحظر أحداً.')}</p> : (
        <ul className={s.list} style={{ gap: 0 }}>{r.data.items.map(u => (
          <li key={u.id} className={s.personRow}>
            <Avatar user={u} size={40} /><span className={s.grow}><b dir="auto">{u.name}</b></span>
            <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={async () => { try { await capi.del(`/people/${u.id}/block`); r.reload(true); } catch (e) { toast(errText(t, e), 'error'); } }}>{t('إلغاء الحظر')}</button>
          </li>))}</ul>
      )}
    </Sheet>
  );
}

export default function Profile({ params, profile: me }) {
  const t = useT();
  const navigate = useNavigate();
  const myId = me.user ? me.user.id : null;
  const id = params.id === 'me' ? myId : params.id;
  const isMe = String(id) === String(myId);
  const prof = useLoad(() => capi.get(`/people/${id}`), [id, me]);
  const [sheet, setSheet] = useState(null);
  const [list, setList] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);

  if (prof.loading && !prof.data) return <Spinner />;
  if (prof.error) {
    return <div className={s.page}><header className={s.topbar}><BackButton /></header>
      {prof.error.code === 'not_found' ? <Empty icon="user" title={t('هذا البروفايل غير متاح')} body={t('ربما حُذف الحساب، أو أن أحدكما حظر الآخر.')} /> : <ErrorBox text={errText(t, prof.error)} onRetry={() => prof.reload()} />}
    </div>;
  }
  const p = prof.data;
  const rel = p.relation || {};
  const full = !!p.counters;
  const c = p.counters || {};

  async function act(fn, ok) {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); await prof.reload(true); } catch (e) { toast(errText(t, e), 'error'); } finally { setBusy(false); }
  }
  const openUrl = (u) => import('../native/browser').then(m => m.openExternal(u)).catch(() => window.open(u, '_blank'));

  let friendBtn = null;
  if (!isMe) {
    if (rel.is_friend) friendBtn = <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={busy} onClick={() => setAsk('unfriend')}><RIcon name="check" size={18} />{t('أصدقاء')}</button>;
    else if (rel.request_received && p.can_friend !== false) friendBtn = <button type="button" className={`${s.btn} ${s.btnGold}`} disabled={busy} onClick={() => act(() => capi.post(`/me/friend-requests/${p.id}/accept`), t('أصبحتما صديقين.'))}><RIcon name="userPlus" size={18} />{t('قبول الصداقة')}</button>;
    else if (rel.request_sent) friendBtn = <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={busy} onClick={() => act(() => capi.del(`/people/${p.id}/friend-request`), t('ألغيت طلب الصداقة.'))}>{t('تم إرسال الطلب')}</button>;
    else if (p.can_friend) friendBtn = <button type="button" className={`${s.btn} ${s.btnGold}`} disabled={busy} onClick={() => act(() => capi.post(`/people/${p.id}/friend-request`), t('أرسلت طلب الصداقة.'))}><RIcon name="userPlus" size={18} />{t('إضافة صديق')}</button>;
  }
  const followBtn = !isMe && (
    <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={busy} aria-pressed={!!rel.i_follow}
      onClick={() => act(() => (rel.i_follow ? capi.del(`/people/${p.id}/follow`) : capi.post(`/people/${p.id}/follow`)), rel.i_follow ? null : t('ستصلك تنبيهات غرفه.'))}>
      {rel.i_follow ? t('تتابعه') : t('متابعة')}
    </button>
  );
  const msgBtn = !isMe && p.can_message && (
    <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => navigate(`/messages/new?user=${p.id}`)}><RIcon name="chat" size={18} />{t('مراسلة')}</button>
  );

  return (
    <div className={s.page}>
      <div className={s.cover}>
        <CoverPattern />
        <div className={s.coverBar}>
          <BackButton />
          {isMe ? <button type="button" className={s.iconBtn} aria-label={t('تعديل ملفي')} onClick={() => setSheet('edit')}><RIcon name="pen" /></button> : <span />}
        </div>
      </div>
      <div className={s.profHead}>
        <Avatar user={p} size={120} />
        {p.in_room && (
          <button type="button" className={s.inRoom} onClick={() => navigate(`/rooms/${p.in_room.id}`)}>
            <span className={s.liveDot} aria-hidden="true" /><span dir="auto">{t('في غرفة الآن · {title}', { title: p.in_room.title })}</span>
          </button>
        )}
      </div>
      <div className={s.field} style={{ gap: 6 }}>
        <h1 className={s.h1} dir="auto">{p.name}</h1>
        {!p.avatar_url && <p className={s.faint}>{isMe ? t('لم ترفع صورة · يظهر أول حرف من اسمك') : t('لم يرفع صورة · يظهر أول حرف من الاسم')}</p>}
        {full && p.bio && <p className={s.bio} dir="auto">{p.bio}</p>}
      </div>

      {full && (p.facebook_url || p.instagram_url) && (
        <div className={s.social}>
          {p.facebook_url && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => openUrl(p.facebook_url)}><RIcon name="facebook" size={18} style={{ color: 'var(--gold)' }} />{t('فيسبوك')}</button>}
          {p.instagram_url && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => openUrl(p.instagram_url)}><RIcon name="instagram" size={18} style={{ color: 'var(--gold)' }} />{t('إنستجرام')}</button>}
        </div>
      )}

      {!full && (
        <div className={`${s.mushaf}`}><div className={`${s.mushafIn} ${s.lockCard}`}>
          <span className={s.emptyIco}><RIcon name="lock" size={28} /></span>
          <h2 className={s.h3}>{t('بروفايل خاص — للأصدقاء فقط')}</h2>
          <p className={s.muted}>{p.can_friend ? t('النبذة والروابط والعدّادات تظهر لك بعد أن يقبل {name} طلب الصداقة.', { name: p.name }) : t('النبذة والروابط والعدّادات لا تظهر في هذا البروفايل.')}</p>
        </div></div>
      )}

      <div className={s.counters}>
        {KINDS.map(([k, label, listKind]) => (
          <button key={k} type="button" className={`${s.counter4}${full ? '' : ' ' + s.counterOff}`} disabled={!full}
            onClick={() => {
              if (!listKind) return;
              if (!p.lists_visible) { toast(t('قائمة الأشخاص تظهر للأصدقاء فقط.')); return; }
              setList(listKind);
            }}>
            <b className="nq-num">{full ? n(c[k] || 0, t.lang) : '—'}</b><small>{t(label)}</small>
          </button>
        ))}
      </div>

      {!isMe && (
        <div className={s.profActs} style={{ gridTemplateColumns: `${[friendBtn, followBtn, msgBtn].filter(Boolean).map((b, i) => (i === 0 && friendBtn ? 'minmax(0,1.25fr)' : 'minmax(0,1fr)')).join(' ')} auto` }}>
          {friendBtn}{followBtn}{msgBtn}
          <button type="button" className={s.iconBtn} style={{ width: 48, height: 48 }} aria-label={t('المزيد')} onClick={() => setSheet('more')}><RIcon name="dots" /></button>
        </div>
      )}
      {!isMe && !p.can_message && !rel.is_friend && (p.can_friend || rel.request_sent) && <p className={s.faint} style={{ textAlign: 'center' }}>{t('زر المراسلة يظهر حسب إعداد «من يراسلني» لدى {name}.', { name: p.name })}</p>}

      {isMe && (
        <section className={s.field} style={{ gap: 8 }}>
          <ActionList items={[
            { icon: 'pen', label: t('تعديل ملفي'), sub: t('النبذة والروابط والخصوصية ومن يراسلني'), onClick: () => setSheet('edit') },
            { icon: 'userPlus', label: t('طلبات الصداقة'), hidden: me.is_minor, onClick: () => setSheet('requests') },
            { icon: 'users', label: t('يتابعهم'), onClick: () => setList('following') },
            { icon: 'bell', label: t('إعدادات الإشعارات'), onClick: () => navigate('/notifications#prefs') },
            { icon: 'block', label: t('المحظورون'), onClick: () => setSheet('blocks') },
          ]} />
          {me.is_minor && <p className={s.note}><RIcon name="shieldCheck" size={16} />{t('حسابك لمن هم دون ١٨ سنة: لا رسائل خاصة ولا صداقات، وبروفايلك خاص دائماً. يمكنك متابعة الأشخاص والجروبات لتصلك تنبيهات غرفهم.')}</p>}
        </section>
      )}

      {isMe && <EditSheet open={sheet === 'edit'} onClose={() => setSheet(null)} me={me} />}
      {isMe && <RequestsSheet open={sheet === 'requests'} onClose={() => { setSheet(null); prof.reload(true); }} />}
      {isMe && <BlocksSheet open={sheet === 'blocks'} onClose={() => setSheet(null)} />}
      <PeopleList open={!!list} kind={list} userId={p.id} isMe={isMe} onClose={() => setList(null)} />
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={p.name}>
        <ActionList items={[
          { icon: 'userPlus', label: t('رفض طلب الصداقة'), hidden: !rel.request_received, onClick: () => { setSheet(null); act(() => capi.post(`/me/friend-requests/${p.id}/decline`)); } },
          { icon: 'xCircle', label: t('إلغاء الصداقة'), hidden: !rel.is_friend, onClick: () => { setSheet(null); setAsk('unfriend'); } },
          { icon: 'block', label: t('حظر'), sub: t('لن يرى أحدكما الآخر في الغرف والرسائل'), onClick: () => { setSheet(null); setAsk('block'); } },
          { icon: 'flag', danger: true, label: t('إبلاغ'), onClick: () => setSheet('report') },
        ]} />
      </Sheet>
      <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} targets={[{ type: 'user', id: p.id, preview: p.name }, p.avatar_url && { type: 'photo', id: p.id }]} />
      <Confirm open={ask === 'unfriend'} title={t('إلغاء الصداقة مع {name}؟', { name: p.name })} confirm={t('إلغاء الصداقة')} cancel={t('رجوع')} danger
        onAnswer={(ok) => { setAsk(null); if (ok) act(() => capi.del(`/people/${p.id}/friend`)); }} />
      <Confirm open={ask === 'block'} title={t('حظر {name}؟', { name: p.name })} body={t('تُلغى الصداقة والمتابعة بينكما، ولن يرى أحدكما بروفايل الآخر أو رسائله أو غرفه.')} confirm={t('حظر')} cancel={t('رجوع')} danger
        onAnswer={async (ok) => { setAsk(null); if (ok) { try { await capi.post(`/people/${p.id}/block`); toast(t('تم الحظر.')); navigate(-1); } catch (e) { toast(errText(t, e), 'error'); } } }} />
    </div>
  );
}

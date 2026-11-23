// A community group (design 15): join / request / follow, its rooms, members,
// requests, invites, moderators and their permissions.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capi } from './api';
import { toast } from './store';
import { useT, n } from './format';
import { errText } from './errors';
import { useLoad } from './hooks';
import { RIcon, Avatar, Spinner, Sheet, Toggle, Confirm, ActionList, ErrorBox, BackButton, ScopePill, Empty, Seg, css as s } from './ui';
import { ScheduledCard } from './cards';
import ReportSheet from './Report';

export const PERMS = [
  ['open_rooms', 'فتح غرف باسم الجروب'],
  ['schedule_rooms', 'جدولة غرف'],
  ['accept_members', 'قبول طلبات الانضمام'],
  ['kick', 'طرد الأعضاء'],
  ['edit_info', 'تعديل البيانات والصورة'],
  ['assign_moderators', 'تعيين المشرفين'],
];
const roleText = (t, r) => (r === 'founder' ? t('المؤسس') : r === 'moderator' ? t('مشرف') : t('عضو'));

function MemberSheet({ open, onClose, group, member, onChanged }) {
  const t = useT();
  const navigate = useNavigate();
  const [perms, setPerms] = useState(member ? member.perms || [] : []);
  const [ask, setAsk] = useState(null);
  useEffect(() => { if (member) setPerms(member.perms || []); }, [member]);
  if (!open || !member) return null;
  const mine = group.my_perms || [];
  const founder = group.my_role === 'founder';
  const canAssign = mine.includes('assign_moderators') && member.role !== 'founder' && (founder || !(member.perms || []).includes('assign_moderators'));
  const canKick = mine.includes('kick') && member.role === 'member' || (founder && member.role !== 'founder');
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); onChanged(); } catch (e) { toast(errText(t, e), 'error'); } };
  const setPerm = async (k, on) => {
    const next = on ? [...perms, k] : perms.filter(x => x !== k);
    setPerms(next);
    await run(() => capi.put(`/community/groups/${group.id}/moderators/${member.id}`, { perms: next }));
  };
  return (
    <Sheet open={open} onClose={onClose} title={member.name} sub={roleText(t, member.role)} tall={member.role === 'moderator'}>
      {member.role === 'moderator' && canAssign && (
        <section className={s.card} aria-labelledby="permH">
          <h3 id="permH" className={s.secTitle}>{t('صلاحيات المشرف: {name}', { name: member.name })}</h3>
          <p className={s.faint}>{founder ? t('يراها ويعدّلها المؤسس فقط') : t('يمكنك منح الصلاحيات التي تملكها فقط')}</p>
          {PERMS.map(([k, label]) => {
            const allowed = founder || (mine.includes(k) && k !== 'assign_moderators');
            return (
              <div key={k} className={s.setRow}>
                <b id={`pm-${k}`}>{t(label)}</b>
                <Toggle checked={perms.includes(k)} disabled={!allowed} onChange={(v) => setPerm(k, v)} label={t(label)} />
              </div>
            );
          })}
        </section>
      )}
      <ActionList items={[
        { icon: 'user', label: t('عرض البروفايل'), onClick: () => { onClose(); navigate(`/people/${member.id}`); } },
        { icon: 'shieldCheck', label: t('تعيين مشرفاً'), hidden: !(canAssign && member.role === 'member'), onClick: () => run(() => capi.put(`/community/groups/${group.id}/moderators/${member.id}`, { perms: ['open_rooms', 'schedule_rooms'].filter(p => founder || mine.includes(p)) }), t('أصبح {name} مشرفاً.', { name: member.name })) },
        { icon: 'shield', label: t('إلغاء الإشراف'), hidden: !(canAssign && member.role === 'moderator'), onClick: () => run(() => capi.del(`/community/groups/${group.id}/moderators/${member.id}`)) },
        { icon: 'users', label: t('نقل إدارة الجروب إليه'), hidden: !(founder && member.role !== 'founder'), onClick: () => setAsk('transfer') },
        { icon: 'xCircle', danger: true, label: t('إخراج من الجروب'), hidden: !canKick, onClick: () => setAsk('kick') },
      ]} />
      <Confirm open={ask === 'kick'} danger title={t('إخراج {name} من الجروب؟', { name: member.name })} confirm={t('إخراج')} cancel={t('رجوع')}
        onAnswer={(ok) => { setAsk(null); if (ok) { onClose(); run(() => capi.del(`/community/groups/${group.id}/members/${member.id}`)); } }} />
      <Confirm open={ask === 'transfer'} title={t('نقل إدارة الجروب إلى {name}؟', { name: member.name })} body={t('ستصبح مشرفاً بكل الصلاحيات، ويصبح هو المؤسس.')} confirm={t('نقل الإدارة')} cancel={t('رجوع')}
        onAnswer={(ok) => { setAsk(null); if (ok) { onClose(); run(() => capi.post(`/community/groups/${group.id}/transfer`, { user_id: member.id })); } }} />
    </Sheet>
  );
}

function InviteSheet({ open, onClose, group }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [sent, setSent] = useState({});
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); return undefined; }
    timer.current = setTimeout(() => { capi.get(`/people?q=${encodeURIComponent(q.trim())}`).then(d => setRes(d.items || [])).catch(() => setRes([])); }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);
  return (
    <Sheet open={open} onClose={onClose} title={t('دعوة إلى الجروب')} tall>
      <input className={s.input} type="search" data-autofocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث بالاسم…')} aria-label={t('ابحث بالاسم…')} />
      <ul className={s.list} style={{ gap: 0 }}>
        {res.map(u => (
          <li key={u.id} className={s.personRow}>
            <Avatar user={u} size={40} /><span className={s.grow}><b dir="auto">{u.name}</b></span>
            <button type="button" className={`${s.btn} ${s.btnSm} ${sent[u.id] ? s.btnGhost : s.btnGold}`} disabled={!!sent[u.id]}
              onClick={async () => { try { await capi.post(`/community/groups/${group.id}/invites`, { user_id: u.id }); setSent(x => ({ ...x, [u.id]: true })); } catch (e) { toast(errText(t, e), 'error'); } }}>
              {sent[u.id] ? t('تمت الدعوة') : t('دعوة')}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function RequestsSheet({ open, onClose, group, onChanged }) {
  const t = useT();
  const r = useLoad(() => (open ? capi.get(`/community/groups/${group.id}/requests`) : Promise.resolve(null)), [open]);
  const act = async (fn) => { try { await fn(); r.reload(true); onChanged(); } catch (e) { toast(errText(t, e), 'error'); } };
  return (
    <Sheet open={open} onClose={onClose} title={t('طلبات الانضمام')} tall>
      {r.loading ? <Spinner /> : r.error ? <ErrorBox text={errText(t, r.error)} /> : (!r.data || !r.data.items.length) ? <p className={s.faint}>{t('لا توجد طلبات الآن.')}</p> : (
        <ul className={s.list} style={{ gap: 0 }}>{r.data.items.map(u => (
          <li key={u.id} className={s.personRow}>
            <Avatar user={u} size={40} /><span className={s.grow}><b dir="auto">{u.name}</b></span>
            <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => act(() => capi.post(`/community/groups/${group.id}/requests/${u.id}/decline`))}>{t('رفض')}</button>
            <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={() => act(() => capi.post(`/community/groups/${group.id}/requests/${u.id}/accept`))}>{t('قبول')}</button>
          </li>))}</ul>
      )}
    </Sheet>
  );
}

export function GroupForm({ group, onSaved, submitLabel }) {
  const t = useT();
  const [name, setName] = useState(group ? group.name : '');
  const [desc, setDesc] = useState(group ? group.description || '' : '');
  const [privacy, setPrivacy] = useState(group ? group.privacy : 'public');
  const [scope, setScope] = useState(group ? group.gender_scope : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <form className={s.field} style={{ gap: 16 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await onSaved({ name: name.trim(), description: desc.trim(), privacy, gender_scope: scope }); } catch (x) { setErr(x); } finally { setBusy(false); }
    }}>
      <label className={s.field}><span className={s.label}>{t('اسم الجروب')}</span>
        <input className={s.input} value={name} maxLength={80} dir="auto" onChange={e => setName(e.target.value)} required />
      </label>
      <label className={s.field}><span className={s.label}>{t('الوصف')} <small>({t('اختياري')})</small></span>
        <textarea className={s.textarea} value={desc} maxLength={500} dir="auto" onChange={e => setDesc(e.target.value)} />
      </label>
      <div className={s.field}><span className={s.label}>{t('الخصوصية')}</span>
        <Seg label={t('الخصوصية')} value={privacy} onChange={setPrivacy} options={[{ value: 'public', label: t('جروب عام') }, { value: 'private', label: t('جروب خاص') }]} />
        <p className={s.faint}>{privacy === 'public' ? t('يظهر في «اكتشف الجروبات» ويستطيع أي شخص من النوع المناسب الانضمام مباشرة.') : t('لا يظهر في البحث، والانضمام بدعوة أو بطلب يوافق عليه المشرفون.')}</p>
      </div>
      {!group && (
        <div className={s.field}><span className={s.label}>{t('نوع الجروب')}</span>
          <Seg label={t('نوع الجروب')} value={scope} onChange={setScope} options={[{ value: 'own', label: t('لنوعي فقط') }, { value: 'mixed', label: t('مختلط') }]} />
          <p className={s.faint}>{t('لا يمكن تغيير نوع الجروب بعد إنشائه.')}</p>
        </div>
      )}
      {err && <ErrorBox text={errText(t, err)} />}
      <button type="submit" className={`${s.btn} ${s.btnGold} ${s.btnBlock}`} disabled={busy || name.trim().length < 3 || (!group && !scope)}>{busy ? t('لحظة…') : submitLabel}</button>
    </form>
  );
}

export default function Group({ params, profile }) {
  const t = useT();
  const navigate = useNavigate();
  const id = params.id;
  const g = useLoad(() => capi.get(`/community/groups/${id}`), [id]);
  const members = useLoad(() => capi.get(`/community/groups/${id}/members?per_page=100`), [id]);
  const [sheet, setSheet] = useState(null);
  const [member, setMember] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  if (g.loading && !g.data) return <Spinner />;
  if (g.error) return <div className={s.page}><header className={s.topbar}><BackButton /></header>
    {g.error.code === 'not_found' ? <Empty icon="users" title={t('الجروب غير متاح')} body={t('ربما حُذف، أو أنه ليس متاحاً لك.')} /> : <ErrorBox text={errText(t, g.error)} onRetry={() => g.reload()} />}</div>;
  const G = g.data;
  const perms = G.my_perms || [];
  const member_ = !!G.my_role;
  const reload = () => { g.reload(true); members.reload(true); };
  async function act(fn, ok) {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok); reload(); return r; } catch (e) { toast(errText(t, e), 'error'); return null; } finally { setBusy(false); }
  }
  const memberList = (members.data && members.data.items) || [];
  const canManage = perms.includes('kick') || perms.includes('assign_moderators') || G.my_role === 'founder';
  const live = (G.rooms || []).filter(r => r.status === 'open');
  const sched = (G.rooms || []).filter(r => r.status === 'scheduled');

  let main = null;
  if (member_) {
    main = (perms.includes('open_rooms') || perms.includes('schedule_rooms'))
      ? <button type="button" className={`${s.btn} ${s.btnGold} ${s.grow}`} onClick={() => navigate(`/rooms/new?group=${G.id}`)}><RIcon name="plus" />{t('افتح غرفة للجروب')}</button>
      : <span className={`${s.btn} ${s.btnGhost} ${s.grow}`} aria-disabled="true"><RIcon name="check" />{t('أنت عضو')}</span>;
  } else if (G.invited) {
    main = <button type="button" className={`${s.btn} ${s.btnGold} ${s.grow}`} disabled={busy} onClick={() => act(() => capi.post(`/community/groups/${G.id}/join`), t('انضممت إلى الجروب.'))}>{t('قبول الدعوة')}</button>;
  } else if (G.request_pending) {
    main = <span className={`${s.btn} ${s.btnGhost} ${s.grow}`} aria-disabled="true">{t('تم إرسال طلب الانضمام')}</span>;
  } else {
    main = <button type="button" className={`${s.btn} ${s.btnGold} ${s.grow}`} disabled={busy}
      onClick={() => act(async () => { const r = await capi.post(`/community/groups/${G.id}/join`); toast(r.status === 'member' ? t('انضممت إلى الجروب.') : t('أرسلنا طلبك، وسيصلك تنبيه عند الموافقة.')); })}>
      {G.privacy === 'private' ? t('اطلب الانضمام') : t('انضم للجروب')}</button>;
  }

  return (
    <div className={s.page}>
      <div className={s.cover} style={{ height: 170 }}>
        {G.photo_url ? <img src={G.photo_url} alt="" /> : (
          <svg className={s.coverPat} aria-hidden="true"><defs><pattern id="gpStars" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M14 14h16v16H14z M22 10.7 33.3 22 22 33.3 10.7 22z" fill="none" stroke="currentColor" strokeWidth="1.2" /></pattern></defs><rect width="100%" height="100%" fill="url(#gpStars)" /></svg>
        )}
        <div className={s.coverBar}><BackButton /><button type="button" className={s.iconBtn} aria-label={t('المزيد')} onClick={() => setSheet('more')}><RIcon name="dots" /></button></div>
      </div>

      <div className={s.field} style={{ gap: 8 }}>
        <h1 className={s.h1} dir="auto">{G.name}</h1>
        <div className={s.row} style={{ gap: 6 }}>
          <ScopePill scope={G.gender_scope} />
          <span className={s.pill}><RIcon name={G.privacy === 'private' ? 'lock' : 'globe'} size={14} />{G.privacy === 'private' ? t('جروب خاص') : t('جروب عام')}</span>
          <span className={s.faint}>{t('{n} عضواً', { n: n(G.member_count, t.lang) })}</span>
        </div>
        {G.description && <p className={s.bio} dir="auto">{G.description}</p>}
      </div>

      <div className={s.row} style={{ flexWrap: 'nowrap' }}>
        {main}
        {!member_ && G.privacy === 'public' && (
          <button type="button" className={`${s.btn} ${s.btnOutline}`} disabled={busy} aria-pressed={!!G.is_following}
            onClick={() => act(() => (G.is_following ? capi.del(`/community/groups/${G.id}/follow`) : capi.post(`/community/groups/${G.id}/follow`)), G.is_following ? null : t('ستصلك تنبيهات غرف الجروب.'))}>
            {G.is_following ? t('تتابعه') : t('متابعة')}
          </button>
        )}
      </div>
      {!member_ && G.privacy === 'private' && !G.invited && <p className={s.faint}>{t('في الجروب الخاص يتحول الزر إلى «طلب انضمام» ينتظر موافقة المشرفين.')}</p>}

      {(perms.includes('accept_members')) && (
        <div className={s.row}>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setSheet('requests')}>
            <RIcon name="userPlus" size={18} />{t('طلبات الانضمام')}{G.pending_requests > 0 && <span className={s.count}>{n(G.pending_requests, t.lang)}</span>}
          </button>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setSheet('invite')}><RIcon name="plus" size={18} />{t('دعوة أشخاص')}</button>
        </div>
      )}

      <section aria-labelledby="grH" className={s.field} style={{ gap: 10 }}>
        <h2 id="grH" className={s.secTitle} style={{ color: 'var(--text)' }}>{t('غرف الجروب')}</h2>
        {live.length + sched.length === 0 && <p className={s.muted}>{t('لا توجد غرف مفتوحة أو مجدولة الآن.')}</p>}
        {live.map(r => (
          <Link key={r.id} to={`/rooms/${r.id}`} className={`${s.card} ${s.cardLink}`} style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'color-mix(in srgb,var(--danger) 35%,var(--line))' }}>
            <span className={s.liveDot} aria-hidden="true" />
            <span className={s.grow}><b dir="auto" style={{ display: 'block' }}>{r.title}</b><small className={s.faint}>{t('مباشر الآن · {n} مستمعاً', { n: n(r.listener_count, t.lang) })}</small></span>
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{t('ادخل')}</span>
          </Link>
        ))}
        {sched.map(r => <ScheduledCard key={r.id} room={r} showGroup={false} />)}
      </section>

      <section aria-labelledby="gmH" className={s.field} style={{ gap: 4 }}>
        <div className={s.secHead}>
          <h2 id="gmH" className={s.secTitle} style={{ color: 'var(--text)' }}>{t('الأعضاء')} <span className={s.faint}>{n(G.member_count, t.lang)}</span></h2>
          {memberList.length > 5 && <button type="button" className={s.link} onClick={() => setSheet('members')}>{t('عرض الكل')}</button>}
        </div>
        {members.error ? <p className={s.faint}>{members.error.status === 403 ? t('قائمة الأعضاء متاحة لأعضاء الجروب فقط.') : errText(t, members.error)}</p> : (
          <ul className={s.card} style={{ listStyle: 'none', margin: 0, padding: '0 14px' }}>
            {memberList.slice(0, 5).map(m => (
              <li key={m.id} className={s.personRow}>
                <button type="button" className={s.personBtn} onClick={() => { if (canManage && m.id !== (profile.user && profile.user.id)) { setMember(m); setSheet('member'); } else navigate(`/people/${m.id}`); }}>
                  <Avatar user={m} size={44} ring={m.role === 'founder'} /><span className={s.grow}><b dir="auto">{m.name}</b></span>
                </button>
                <span className={`${s.pill} ${m.role === 'founder' ? s.pillGold : m.role === 'moderator' ? s.pillGreen : ''}`}>{roleText(t, m.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={sheet === 'members'} onClose={() => setSheet(null)} title={t('الأعضاء')} tall>
        <ul className={s.list} style={{ gap: 0 }}>
          {memberList.map(m => (
            <li key={m.id} className={s.personRow}>
              <button type="button" className={s.personBtn} onClick={() => { if (canManage && m.id !== (profile.user && profile.user.id)) { setMember(m); setSheet('member'); } else { setSheet(null); navigate(`/people/${m.id}`); } }}>
                <Avatar user={m} size={40} /><span className={s.grow}><b dir="auto">{m.name}</b></span>
              </button>
              <span className={`${s.pill} ${m.role === 'founder' ? s.pillGold : m.role === 'moderator' ? s.pillGreen : ''}`}>{roleText(t, m.role)}</span>
            </li>
          ))}
        </ul>
      </Sheet>
      <MemberSheet open={sheet === 'member'} onClose={() => setSheet(null)} group={G} member={member} onChanged={reload} />
      <RequestsSheet open={sheet === 'requests'} onClose={() => setSheet(null)} group={G} onChanged={reload} />
      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} group={G} />
      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title={t('تعديل الجروب')} tall>
        <GroupForm group={G} submitLabel={t('حفظ')} onSaved={async (b) => { await capi.patch(`/community/groups/${G.id}`, { name: b.name, description: b.description, privacy: b.privacy }); toast(t('تم الحفظ.')); setSheet(null); reload(); }} />
        <div className={s.row}>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => fileRef.current && fileRef.current.click()}><RIcon name="image" size={18} />{G.photo_url ? t('تغيير الصورة') : t('إضافة صورة')}</button>
          {G.photo_url && <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={() => act(() => capi.del(`/community/groups/${G.id}/photo`))}>{t('حذف الصورة')}</button>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) { toast(t('حجم الصورة كبير جداً (الحد الأقصى ٥ ميغابايت).'), 'error'); return; }
            const fd = new FormData(); fd.append('photo', f);
            await act(() => capi.post(`/community/groups/${G.id}/photo`, fd), t('تم تحديث الصورة.'));
          }} />
        </div>
      </Sheet>
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={G.name}>
        <ActionList items={[
          { icon: 'pen', label: t('تعديل الجروب'), hidden: !perms.includes('edit_info'), onClick: () => setSheet('edit') },
          { icon: 'leave', label: t('مغادرة الجروب'), hidden: !member_, onClick: () => { setSheet(null); setAsk('leave'); } },
          { icon: 'trash', danger: true, label: t('حذف الجروب'), hidden: G.my_role !== 'founder', onClick: () => { setSheet(null); setAsk('delete'); } },
          { icon: 'flag', danger: true, label: t('إبلاغ عن الجروب'), hidden: G.my_role === 'founder', onClick: () => setSheet('report') },
        ]} />
      </Sheet>
      <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} targets={[{ type: 'group', id: G.id, preview: G.name }, G.photo_url && { type: 'group_photo', id: G.id }]} />
      <Confirm open={ask === 'leave'} title={t('مغادرة الجروب؟')} confirm={t('مغادرة')} cancel={t('رجوع')} danger
        onAnswer={(ok) => { setAsk(null); if (ok) act(async () => { await capi.del(`/community/groups/${G.id}/membership`); navigate('/rooms', { replace: true }); }); }} />
      <Confirm open={ask === 'delete'} title={t('حذف الجروب نهائياً؟')} body={t('تُحذف بيانات الجروب وعضوياته، وتُغلق غرفه المفتوحة والمجدولة.')} confirm={t('حذف')} cancel={t('رجوع')} danger
        onAnswer={(ok) => { setAsk(null); if (ok) act(async () => { await capi.del(`/community/groups/${G.id}`); navigate('/rooms', { replace: true }); }); }} />
    </div>
  );
}

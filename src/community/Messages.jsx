// «الرسائل» — inbox (design 16) with «من يراسلني». Polls with ETag / 304.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capi } from './api';
import { setMe, toast, unread } from './store';
import { useT, n, fmtShort } from './format';
import { errText } from './errors';
import { usePoll } from './hooks';
import { RIcon, Avatar, Spinner, Sheet, Seg, ErrorBox, TopBar, Empty, css as s } from './ui';

function NewMessageSheet({ open, onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes(null); return undefined; }
    timer.current = setTimeout(() => capi.get(`/people?q=${encodeURIComponent(q.trim())}`).then(d => setRes(d.items || [])).catch(() => setRes([])), 350);
    return () => clearTimeout(timer.current);
  }, [q]);
  return (
    <Sheet open={open} onClose={onClose} title={t('رسالة جديدة')} tall>
      <input className={s.input} type="search" data-autofocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث بالاسم…')} aria-label={t('ابحث بالاسم…')} />
      {res && res.length === 0 && <p className={s.faint}>{t('لا نتائج.')}</p>}
      <ul className={s.list} style={{ gap: 0 }}>
        {(res || []).map(u => (
          <li key={u.id} className={s.personRow}>
            <button type="button" className={s.personBtn} onClick={() => { onClose(); navigate(`/messages/new?user=${u.id}`); }}>
              <Avatar user={u} size={42} /><span className={s.grow}><b dir="auto">{u.name}</b>{u.is_friend && <small>{t('صديق')}</small>}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className={s.faint}>{t('تصل رسالتك إن كان الشخص يستقبل الرسائل منك حسب إعداد «من يراسلني» لديه.')}</p>
    </Sheet>
  );
}

export default function Messages({ profile }) {
  const t = useT();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);
  const etag = useRef('');
  const minor = !!profile.is_minor;
  const p = profile.profile || {};

  usePoll(async () => {
    if (minor) return;
    try {
      const r = await capi.poll('/me/conversations', etag.current);
      if (r.notModified) return;
      etag.current = r.etag || '';
      const list = (r.data && r.data.items) || [];
      setItems(list); setErr(null);
      unread.set(v => ({ ...v, messages: list.reduce((a, c) => a + (c.unread || 0), 0) }));
    } catch (e) { setErr(e); }
  }, 10000, [minor]);

  const shown = useMemo(() => {
    if (!items) return null;
    const k = q.trim().toLowerCase();
    return k ? items.filter(c => String(c.other.name || '').toLowerCase().includes(k) || String((c.last_message && c.last_message.body) || '').toLowerCase().includes(k)) : items;
  }, [items, q]);

  async function setPolicy(v) {
    setBusy(true);
    try { setMe(await capi.patch('/me/community-profile', { dm_policy: v })); toast(t('تم الحفظ.')); }
    catch (e) { toast(errText(t, e), 'error'); } finally { setBusy(false); }
  }

  if (minor) {
    return (
      <div className={s.page}>
        <TopBar title={t('الرسائل')} backTo="/rooms" />
        <Empty icon="shieldCheck" title={t('الرسائل الخاصة غير متاحة')} body={t('حمايةً لمن هم دون ١٨ سنة، لا تصلهم رسائل خاصة ولا طلبات صداقة. يمكنك المشاركة في الغرف وشاتها، ومتابعة الأشخاص والجروبات.')} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <TopBar title={t('الرسائل')} backTo="/rooms">
        <button type="button" className={s.iconBtn} aria-label={t('رسالة جديدة')} onClick={() => setCompose(true)}><RIcon name="pen" /></button>
      </TopBar>

      <section className={`${s.card} ${s.cardGold}`} aria-labelledby="dmPolH" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 id="dmPolH" className={s.h3} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RIcon name="shield" style={{ color: 'var(--gold)' }} />{t('من يراسلني')}</h2>
        <Seg label={t('من يراسلني')} value={p.dm_policy || 'everyone'} disabled={busy} onChange={setPolicy} options={[
          { value: 'everyone', label: t('الجميع') }, { value: 'same_gender', label: t('نفس الجنس فقط') }, { value: 'friends', label: t('الأصدقاء فقط') },
        ]} />
        <p className={s.muted}>{t('الأصدقاء يستطيعون مراسلتك دائماً، ومن بدأت أنت معه محادثة يستطيع الرد عليك.')}</p>
        <p className={s.note}><RIcon name="info" size={16} />{t('من هم دون ١٨ سنة لا يرسلون ولا يستقبلون رسائل خاصة.')}</p>
      </section>

      <label className={s.field}>
        <span className="nq-sr">{t('ابحث في المحادثات')}</span>
        <input className={s.input} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث في المحادثات')} />
      </label>

      {err && !items ? <ErrorBox text={errText(t, err)} /> : !shown ? <Spinner /> : shown.length === 0 ? (
        <Empty icon="chat" title={q ? t('لا نتائج.') : t('لا محادثات بعد')} body={q ? null : t('ابدأ محادثة من بروفايل صديق، أو من زر الرسالة الجديدة.')} />
      ) : (
        <ul className={s.list} style={{ gap: 0 }}>
          {shown.map(c => {
            const lm = c.last_message;
            const preview = lm ? (lm.from_me ? t('أنت: {text}', { text: `\u2068${lm.body}\u2069` }) : lm.body) : t('محادثة جديدة');
            return (
              <li key={c.id}>
                <Link to={`/messages/${c.id}`} className={`${s.convo}${c.unread ? ' ' + s.convoUnread : ''}`}
                  aria-label={`${c.other.name}${c.unread ? ' — ' + t('{n} غير مقروءة', { n: n(c.unread, t.lang) }) : ''}`}>
                  <Avatar user={c.other} size={52} />
                  <span style={{ minWidth: 0 }}><b dir="auto">{c.other.name}</b><p dir="auto">{preview}</p></span>
                  <span className={s.convoSide}>
                    <span>{fmtShort((lm && lm.created_at) || c.updated_at, t)}</span>
                    {c.unread > 0 && <span className={s.count} aria-hidden="true">{n(c.unread, t.lang)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <NewMessageSheet open={compose} onClose={() => setCompose(false)} />
    </div>
  );
}

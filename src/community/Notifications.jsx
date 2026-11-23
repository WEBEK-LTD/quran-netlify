// «الإشعارات» — the community notification list and push preferences (design 19).
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { capi } from './api';
import { toast, unread } from './store';
import { useT, fmtAgo } from './format';
import { errText, suspensionText } from './errors';
import { usePoll, useLoad } from './hooks';
import { RIcon, Spinner, Toggle, ErrorBox, TopBar, Empty, css as s } from './ui';

const ICON = {
  room_opened: 'live', room_scheduled: 'calendar', group_room: 'users', reminder_soon: 'clock', reminder_started: 'live',
  reminder_changed: 'calendar', reminder_cancelled: 'xCircle', speak_invite: 'mic', friend_request: 'userPlus',
  friend_accept: 'userPlus', dm: 'chat', join_request: 'users', suspension: 'lock',
};
const LABEL = {
  room_opened: 'فتح غرفة الآن', room_scheduled: 'جدول غرفة', group_room: 'غرفة في جروبك', reminder_soon: 'تبدأ بعد قليل',
  reminder_started: 'بدأت الغرفة الآن', reminder_changed: 'تغيّر موعد غرفة', reminder_cancelled: 'أُلغيت غرفة مجدولة',
  speak_invite: 'دعوة للتحدث', friend_request: 'طلب صداقة', friend_accept: 'قبل طلب الصداقة', dm: 'رسالة جديدة',
  join_request: 'طلب انضمام إلى جروب', suspension: 'إيقاف في المجتمع',
};
const PREF_ROWS = [
  ['غرف يفتحها أصدقائي ومن أتابعهم', ['room_opened', 'room_scheduled']],
  ['غرف جروباتي', ['group_room']],
  ['تذكيرات الغرف', ['reminder_soon', 'reminder_started', 'reminder_changed', 'reminder_cancelled']],
  ['دعوات التحدث', ['speak_invite']],
  ['الصداقة', ['friend_request', 'friend_accept'], true],
  ['الرسائل الخاصة', ['dm'], true],
  ['طلبات الانضمام للجروبات', ['join_request']],
];

function Prefs({ minor }) {
  const t = useT();
  const prefs = useLoad(() => capi.get('/me/notification-prefs'), []);
  const [perm, setPerm] = useState(null);
  useEffect(() => { import('../native/push').then(m => m.pushPermission()).then(setPerm).catch(() => setPerm('off')); }, []);
  if (prefs.loading) return <Spinner />;
  if (prefs.error) return <ErrorBox text={errText(t, prefs.error)} onRetry={() => prefs.reload()} />;
  const muted = new Set(prefs.data.types.filter(x => x.muted).map(x => x.type));
  const known = new Set(prefs.data.types.map(x => x.type));
  async function set(types, on) {
    const next = new Set(muted);
    types.forEach(ty => (on ? next.delete(ty) : next.add(ty)));
    prefs.setData(d => ({ types: d.types.map(x => ({ ...x, muted: next.has(x.type) })) }));
    try { await capi.put('/me/notification-prefs', { muted: [...next].filter(x => known.has(x)) }); }
    catch (e) { toast(errText(t, e), 'error'); prefs.reload(true); }
  }
  return (
    <section id="prefs" className={`${s.card} ${s.cardGold}`} aria-labelledby="prefH">
      <h2 id="prefH" className={s.h2}>{t('إعدادات الإشعارات')}</h2>
      {perm && perm !== 'granted' && perm !== 'off' && (
        <div className={s.banner} style={{ marginTop: 12 }}>
          <RIcon name="bell" />
          <span className={s.grow}>{perm === 'denied' ? t('التنبيهات متوقفة لهذا التطبيق. فعّلها من إعدادات الجهاز لتصلك.') : t('اسمح بالتنبيهات ليصلك بدء الغرف والدعوات حتى والتطبيق مغلق.')}</span>
          {perm !== 'denied' && <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={async () => { const m = await import('../native/push'); await m.askForPush(); setPerm(await m.pushPermission()); }}>{t('السماح')}</button>}
        </div>
      )}
      {PREF_ROWS.filter(([, , adult]) => !(adult && minor)).map(([label, types]) => {
        const present = types.filter(x => known.has(x));
        if (!present.length) return null;
        const on = present.some(x => !muted.has(x));
        return (
          <div key={label} className={s.setRow}>
            <b id={`pr-${types[0]}`}>{t(label)}</b>
            <Toggle checked={on} onChange={(v) => set(present, v)} label={t(label)} />
          </div>
        );
      })}
      <Link to="/prayer-times" className={s.setRow} style={{ color: 'inherit' }}>
        <b>{t('الأذان والتذكير قبل الصلاة')}</b><RIcon name="back" flip />
      </Link>
      <p className={s.faint} style={{ marginTop: 10 }}>{t('الأنواع المكتومة تبقى في هذه القائمة لكنها لا تصل كتنبيه على الهاتف. تنبيهات الإيقاف لا يمكن كتمها.')}</p>
    </section>
  );
}

export default function Notifications({ profile }) {
  const t = useT();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState({});
  const etag = useRef('');

  usePoll(async () => {
    try {
      const r = await capi.poll('/me/notifications?limit=60', etag.current);
      if (r.notModified) return;
      etag.current = r.etag || '';
      setItems(r.data.items); setErr(null);
      unread.set(v => ({ ...v, notifications: r.data.unread || 0 }));
    } catch (e) { setErr(e); }
  }, 30000, []);
  useEffect(() => { if (hash === '#prefs') setTimeout(() => { const el = document.getElementById('prefs'); if (el) el.scrollIntoView({ block: 'start' }); }, 300); }, [hash, items]);

  async function read(ids) {
    setItems(list => list && list.map(x => (ids === 'all' || ids.includes(x.id) ? { ...x, read: true } : x)));
    try { await capi.post('/me/notifications/read', ids === 'all' ? { all: true } : { ids }); etag.current = ''; } catch {}
    unread.set(v => ({ ...v, notifications: ids === 'all' ? 0 : Math.max(0, v.notifications - ids.length) }));
  }
  const open = (nf) => {
    read([nf.id]);
    const d = nf.data || {};
    if (d.room_id) navigate(`/rooms/${d.room_id}`);
    else if (d.conversation_id) navigate(`/messages/${d.conversation_id}`);
    else if (d.group_id) navigate(`/groups/${d.group_id}`);
    else if (d.user_id) navigate(`/people/${d.user_id}`);
  };
  async function friend(nf, accept) {
    const uid = nf.data && nf.data.user_id;
    try {
      await capi.post(`/me/friend-requests/${uid}/${accept ? 'accept' : 'decline'}`);
      setDone(x => ({ ...x, [nf.id]: accept ? 'accepted' : 'declined' }));
      read([nf.id]);
    } catch (e) { toast(errText(t, e), 'error'); }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const groups = [[t('اليوم'), (items || []).filter(x => new Date(x.created_at) >= today)], [t('سابقاً'), (items || []).filter(x => new Date(x.created_at) < today)]];

  return (
    <div className={s.page}>
      <TopBar title={t('الإشعارات')} backTo="/rooms">
        {items && items.some(x => !x.read) && <button type="button" className={s.link} style={{ textDecoration: 'none', fontWeight: 600 }} onClick={() => read('all')}>{t('تحديد الكل كمقروء')}</button>}
      </TopBar>
      {profile.suspension && (
        <div className={s.banner} role="status"><RIcon name="lock" />{suspensionText(t, profile.suspension.scope === 'rooms' ? 'rooms_banned' : 'community_suspended', profile.suspension)}</div>
      )}
      {err && !items ? <ErrorBox text={errText(t, err)} /> : !items ? <Spinner /> : items.length === 0 ? (
        <Empty icon="bell" title={t('لا إشعارات بعد')} body={t('تابع أصحابك وجروباتك لتصلك مواعيد غرفهم.')} />
      ) : groups.map(([h, list]) => list.length > 0 && (
        <section key={h} aria-label={h}>
          <h2 className={s.faint} style={{ fontWeight: 600 }}>{h}</h2>
          <ul className={s.list} style={{ gap: 0 }}>
            {list.map(nf => {
              const d = nf.data || {};
              const roomBtn = d.room_id && ['room_opened', 'group_room', 'reminder_soon', 'reminder_started', 'speak_invite'].includes(nf.type);
              return (
                <li key={nf.id} className={s.notif}>
                  <span className={s.notifIco}><RIcon name={ICON[nf.type] || 'bell'} /></span>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" className={s.notifBody} onClick={() => open(nf)}>
                      <b>{t(LABEL[nf.type] || 'إشعار')}{nf.title && nf.title !== LABEL[nf.type] && nf.title !== t(LABEL[nf.type] || '') ? <> · <bdi style={{ fontWeight: 600 }}>{nf.title}</bdi></> : null}</b>
                      {nf.body && <span dir="auto">{nf.body}</span>}
                      <small>{fmtAgo(nf.created_at, t.lang)}</small>
                    </button>
                    {roomBtn && <div><button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={() => open(nf)}>{nf.type === 'speak_invite' ? t('انضم متحدثاً') : t('ادخل الغرفة')}</button></div>}
                    {nf.type === 'friend_request' && d.user_id && !profile.is_minor && (
                      done[nf.id] ? <span className={s.faint}>{done[nf.id] === 'accepted' ? t('أصبحتما صديقين.') : t('رفضت الطلب.')}</span> : (
                        <div className={s.row}>
                          <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={() => friend(nf, true)}>{t('قبول')}</button>
                          <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => friend(nf, false)}>{t('رفض')}</button>
                        </div>
                      )
                    )}
                    {nf.type === 'join_request' && d.group_id && <div><button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => open(nf)}>{t('عرض الطلبات')}</button></div>}
                  </div>
                  {!nf.read ? <span className={s.unreadDot} aria-label={t('غير مقروء')} /> : <span />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Prefs minor={!!profile.is_minor} />
    </div>
  );
}

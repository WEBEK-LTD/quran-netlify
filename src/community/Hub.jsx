// «الغرف» — live and scheduled rooms, my groups, discover groups (design 07).
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capi, qs } from './api';
import { useT, n } from './format';
import { errText, suspensionText } from './errors';
import { usePoll, useLoad, useUnread } from './hooks';
import { RIcon, Avatar, Spinner, Empty, ErrorBox, css as s } from './ui';
import { LiveRoomCard, ScheduledCard, GroupTile, GroupRow } from './cards';

export default function Hub({ profile }) {
  const t = useT();
  const navigate = useNavigate();
  const mine = profile.gender === 'female' ? 'women' : 'men';
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [live, setLive] = useState(null);
  const [liveErr, setLiveErr] = useState(null);
  const minor = !!profile.is_minor;
  const badges = useUnread(minor);
  const roomsBan = profile.suspension && profile.suspension.scope === 'rooms' ? profile.suspension : null;

  const tab = filter === 'groups' ? 'groups' : 'live';
  usePoll(async () => {
    try {
      const d = await capi.get(`/rooms${qs({ tab, q: q.trim().length >= 2 ? q.trim() : '', per_page: 50 })}`);
      setLive(d.items || []); setLiveErr(null);
    } catch (e) { setLiveErr(e); }
  }, 20000, [tab, q]);

  const sched = useLoad(() => capi.get(`/rooms${qs({ tab: 'scheduled', per_page: 20, q: q.trim().length >= 2 ? q.trim() : '' })}`).then(d => d.items || []), [q]);
  const groups = useLoad(() => capi.get('/community/groups/mine'), []);
  const discover = useLoad(() => capi.get('/community/groups?per_page=8').then(d => d.items || []), []);
  const friends = useLoad(() => capi.get('/me/friends/activity').then(d => d.items || []), []);

  const shown = useMemo(() => {
    if (!live) return null;
    if (filter === 'men' || filter === 'women' || filter === 'mixed') return live.filter(r => r.gender_scope === filter);
    return live;
  }, [live, filter]);
  const liveNow = shown ? shown.filter(r => r.status === 'open') : null;
  const schedShown = useMemo(() => {
    const list = filter === 'groups' ? (live || []).filter(r => r.status === 'scheduled') : (sched.data || []);
    if (filter === 'men' || filter === 'women' || filter === 'mixed') return list.filter(r => r.gender_scope === filter);
    return list;
  }, [filter, live, sched.data]);

  const filters = [
    ['all', t('الكل')],
    [mine, mine === 'women' ? t('النساء') : t('الرجال')],
    ['mixed', t('مختلطة')],
    ['groups', t('من جروباتي')],
  ];

  return (
    <div className={s.page}>
      <header className={s.hubHead}>
        <h1 className={s.h1}>{t('الغرف')}</h1>
        <button type="button" className={s.iconBtn} aria-label={t('ابحث في الغرف')} aria-expanded={searchOpen} onClick={() => setSearchOpen(v => !v)}>
          <RIcon name="search" />
        </button>
        <button type="button" className={`${s.btn} ${s.btnGold}`} disabled={!!roomsBan} onClick={() => navigate('/rooms/new')}>
          <RIcon name="plus" />{t('افتح غرفة')}
        </button>
      </header>

      <nav className={s.grid3} aria-label={t('المجتمع')}>
        <Link to="/messages" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} style={{ position: 'relative' }}>
          <RIcon name="chat" size={18} />{t('الرسائل')}
          {badges.messages > 0 && <span className={s.count} aria-label={t('{n} غير مقروءة', { n: n(badges.messages, t.lang) })}>{n(badges.messages, t.lang)}</span>}
        </Link>
        <Link to="/notifications" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
          <RIcon name="bell" size={18} />{t('الإشعارات')}
          {badges.notifications > 0 && <span className={s.count} aria-label={t('{n} غير مقروءة', { n: n(badges.notifications, t.lang) })}>{n(badges.notifications, t.lang)}</span>}
        </Link>
        <Link to="/people/me" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
          <RIcon name="user" size={18} />{t('ملفي')}
        </Link>
      </nav>

      {searchOpen && (
        <label className={s.field}>
          <span className="nq-sr">{t('ابحث في الغرف')}</span>
          <input className={s.input} type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث باسم الغرفة…')} maxLength={60} />
        </label>
      )}

      {roomsBan && <div className={s.banner} role="status"><RIcon name="lock" />{suspensionText(t, 'rooms_banned', roomsBan)}</div>}

      <p className={s.scopeNote}><RIcon name="user" size={18} />
        {mine === 'women' ? t('تظهر لك غرف النساء والغرف المختلطة فقط.') : t('تظهر لك غرف الرجال والغرف المختلطة فقط.')}
      </p>

      <div className={s.filters} role="group" aria-label={t('تصفية الغرف')}>
        {filters.map(([v, l]) => <button key={v} type="button" className={s.chip} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>

      <section aria-labelledby="liveH" className={s.field} style={{ gap: 12 }}>
        <div className={s.secHead}>
          <h2 id="liveH" className={s.secTitle} style={{ color: 'var(--text)' }}><span className={s.liveDot} aria-hidden="true" />{t('مباشر الآن')}</h2>
          {liveNow && <span className={s.faint}>{t('{n} غرف', { n: n(liveNow.length, t.lang) })}</span>}
        </div>
        {liveErr && !live ? <ErrorBox text={errText(t, liveErr)} /> : !liveNow ? <Spinner /> : liveNow.length === 0 ? (
          <Empty icon="live" title={t('لا توجد غرف مباشرة الآن')} body={t('افتح غرفة وادعُ أصحابك، أو انتظر غرف جروباتك.')} />
        ) : (
          <ul className={s.list}>{liveNow.map(r => <li key={r.id}><LiveRoomCard room={r} /></li>)}</ul>
        )}
      </section>

      {friends.data && friends.data.length > 0 && (
        <section aria-labelledby="frH" className={s.field} style={{ gap: 4 }}>
          <h2 id="frH" className={s.secTitle}>{t('أصدقاؤك في الغرف الآن')}</h2>
          <ul className={s.list} style={{ gap: 0 }}>
            {friends.data.map(f => (
              <li key={f.id} className={s.personRow}>
                <Avatar user={f} size={40} />
                <span className={s.grow}><b dir="auto">{f.name}</b><small dir="auto">{f.room.title}</small></span>
                <Link to={`/rooms/${f.room.id}`} className={`${s.btn} ${s.btnSm} ${s.btnOutline}`}>{t('ادخل')}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {schedShown.length > 0 && (
        <section aria-labelledby="schH" className={s.field} style={{ gap: 12 }}>
          <h2 id="schH" className={s.secTitle} style={{ color: 'var(--text)' }}>{t('قريباً')}</h2>
          <ul className={s.list}>{schedShown.map(r => <li key={r.id}><ScheduledCard room={r} /></li>)}</ul>
        </section>
      )}

      <section aria-labelledby="myG" className={s.field} style={{ gap: 12 }}>
        <div className={s.secHead}>
          <h2 id="myG" className={s.secTitle} style={{ color: 'var(--text)' }}>{t('جروباتي')}</h2>
          <Link to="/groups/new" className={s.link}>{t('أنشئ جروباً')}</Link>
        </div>
        {groups.loading ? <Spinner /> : groups.error ? <ErrorBox text={errText(t, groups.error)} onRetry={() => groups.reload()} /> : (
          (groups.data.items.length + groups.data.invites.length) === 0
            ? <p className={s.muted}>{t('لم تنضم لأي جروب بعد. اكتشف الجروبات العامة بالأسفل أو أنشئ جروباً لأهلك وأصحابك.')}</p>
            : <div className={s.hscroll}>
                {groups.data.invites.map(g => <GroupTile key={'i' + g.id} group={g} invite />)}
                {groups.data.items.map(g => <GroupTile key={g.id} group={g} />)}
              </div>
        )}
      </section>

      <section aria-labelledby="disG" className={s.field} style={{ gap: 4 }}>
        <h2 id="disG" className={s.secTitle} style={{ color: 'var(--text)' }}>{t('اكتشف الجروبات')}</h2>
        {discover.loading ? <Spinner /> : discover.error ? <ErrorBox text={errText(t, discover.error)} onRetry={() => discover.reload()} /> : (
          discover.data.length === 0 ? <p className={s.muted}>{t('لا توجد جروبات عامة بعد.')}</p> : (
            <>
              <ul className={s.list} style={{ gap: 0 }}>{discover.data.map(g => <li key={g.id}><GroupRow group={g} /></li>)}</ul>
              <Link to="/groups/discover" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>{t('عرض كل الجروبات')}</Link>
            </>
          )
        )}
      </section>
    </div>
  );
}

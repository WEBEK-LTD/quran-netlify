// App only: while a voice room is connected and you browse elsewhere (the reader after
// «افتحها في مصحفي», the prayer page…), a small pill brings you back to the room.
// It listens to the 'nq-room-session' event that src/community/live.js dispatches.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTr } from '../l10n';

export default function RoomPill() {
  const tr = useTr();
  const { pathname } = useLocation();
  const [st, setSt] = useState(null);
  useEffect(() => {
    const on = (e) => setSt(e.detail || null);
    window.addEventListener('nq-room-session', on);
    return () => window.removeEventListener('nq-room-session', on);
  }, []);
  if (!st || !st.active || !st.roomId || pathname === `/rooms/${st.roomId}`) return null;
  // community screens have no site header; elsewhere sit just under it
  const noHeader = /^\/(rooms|messages|people|groups|notifications)(\/|$)/.test(pathname);
  return (
    <Link to={`/rooms/${st.roomId}`} role="status" aria-label={tr('أنت في غرفة صوتية — عودة إلى الغرفة')}
      style={{
        position: 'fixed', zIndex: 70, insetInline: 12, top: noHeader ? 'auto' : 'calc(env(safe-area-inset-top, 0px) + var(--header-h, 72px) + 6px)',
        bottom: noHeader ? 'calc(env(safe-area-inset-bottom, 0px) + 84px)' : 'auto', margin: '0 auto', maxWidth: 460,
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, minHeight: 44,
        background: 'var(--raise)', color: 'var(--text)', border: 'var(--bw) solid var(--line2)', boxShadow: 'var(--shadow-sm)', fontSize: '.88rem',
      }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">
        {tr('أنت في غرفة صوتية')}{st.title ? ` · ${st.title}` : ''}
      </span>
      <b style={{ color: 'var(--gold)', flex: 'none' }}>{tr('عودة')}</b>
    </Link>
  );
}

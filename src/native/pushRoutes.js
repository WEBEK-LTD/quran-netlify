// Pure helpers for push payloads (no Capacitor imports, so `npm run test:native` can load them).
// FCM hands us `data` as flat strings {type, room_id, …}; APNs gives the whole payload
// (top-level `type`, nested `data`). Either way → one flat object.
export function flattenPushData(raw) {
  if (!raw || typeof raw !== 'object') return {};
  let inner = raw.data;
  if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch { inner = null; } }
  const out = { ...raw, ...(inner && typeof inner === 'object' ? inner : {}) };
  delete out.aps;
  return out;
}

const ID = /^\d{1,12}$/;
/** Community push payload (docs/API.md «Push») → the app route it should open. */
export function routeForPush(raw) {
  const d = flattenPushData(raw);
  const id = (k) => (d[k] !== undefined && ID.test(String(d[k])) ? String(d[k]) : null);
  switch (d.type) {
    case 'dm': return id('conversation_id') ? `/messages/${id('conversation_id')}` : '/messages';
    case 'room_opened': case 'room_scheduled': case 'group_room': case 'speak_invite':
    case 'reminder_soon': case 'reminder_started': case 'reminder_changed':
      return id('room_id') ? `/rooms/${id('room_id')}` : '/rooms';
    case 'reminder_cancelled': return '/notifications';
    case 'friend_request': case 'friend_accept': return id('user_id') ? `/people/${id('user_id')}` : '/notifications';
    case 'join_request': return id('group_id') ? `/groups/${id('group_id')}` : '/notifications';
    case 'suspension': return '/notifications';
    default: break;
  }
  if (d.type) return '/notifications';
  return null;
}

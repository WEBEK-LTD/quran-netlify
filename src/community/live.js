// ─── The live audio session (LiveKit) ────────────────────────────────────────
// One session at a time, kept outside React so it survives navigation inside
// the app («افتحها في مصحفي» opens the reader while the room keeps playing).
//
//   join(roomId)  POST /rooms/{id}/join → {url, token, role, room, me} → Room.connect()
//   audio only: we publish the microphone (stage roles) and play remote audio tracks
//   data packets come from the API only (clients have canPublishData:false); they
//   are re-emitted to the screen as { topic, msg } (topics chat | reaction | page | room)
//   role changes arrive as LiveKit permission/metadata updates on the same connection
//
// livekit-client is imported lazily on the first join, so neither the website nor the
// rooms hub ever download it.
import { capi } from './api';
import { setAudioMode } from './audioMode';

const STAGE = ['owner', 'moderator', 'speaker'];

const initial = () => ({
  status: 'idle',          // idle | connecting | connected | reconnecting | ended
  ended: null,             // left | closed | kicked | lost | elsewhere | suspended | error
  roomId: null,
  title: '',
  role: null,
  me: null,
  mic: false,              // my microphone is publishing and unmuted
  micBusy: false,
  micError: null,          // denied | unavailable | null
  speaking: [],            // identities (user ids as strings) speaking now
  muted: {},               // identity → true when their mic track is muted
  audioBlocked: false,     // autoplay blocked: needs a tap (startAudio)
  error: null,
});

let state = initial();
const subs = new Set();
const dataSubs = new Set();
let lk = null;             // the livekit-client module
let room = null;
let audioHost = null;
let leaving = false;

function emit(patch) {
  state = { ...state, ...patch };
  subs.forEach(f => { try { f(state); } catch {} });
  try {
    window.dispatchEvent(new CustomEvent('nq-room-session', {
      detail: { active: state.status === 'connected' || state.status === 'reconnecting' || state.status === 'connecting', roomId: state.roomId, title: state.title },
    }));
  } catch {}
}

export const getSession = () => state;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function onData(fn) { dataSubs.add(fn); return () => dataSubs.delete(fn); }

function host() {
  if (!audioHost) {
    audioHost = document.createElement('div');
    audioHost.setAttribute('aria-hidden', 'true');
    audioHost.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(audioHost);
  }
  return audioHost;
}

function roleFromMeta(p) {
  try { const m = JSON.parse(p.metadata || '{}'); return m && m.role ? String(m.role) : null; } catch { return null; }
}

function refreshMuted() {
  if (!room) return;
  const muted = {};
  const all = [room.localParticipant, ...room.remoteParticipants.values()];
  for (const p of all) {
    const pub = p.getTrackPublication && lk ? p.getTrackPublication(lk.Track.Source.Microphone) : null;
    muted[p.identity] = !pub || pub.isMuted;
  }
  const lp = room.localParticipant;
  const myPub = lp && lk ? lp.getTrackPublication(lk.Track.Source.Microphone) : null;
  emit({ muted, mic: !!(myPub && !myPub.isMuted && lp.isMicrophoneEnabled) });
}

function endWith(kind) {
  emit({ status: 'ended', ended: kind, mic: false, speaking: [], audioBlocked: false });
  if (audioHost) audioHost.innerHTML = '';
  room = null;
  setAudioMode('media');
}

function wire(r) {
  const E = lk.RoomEvent;
  r.on(E.TrackSubscribed, (track) => {
    if (track.kind !== 'audio') return;
    const el = track.attach();
    el.setAttribute('data-nq-room', '1');
    host().appendChild(el);
    refreshMuted();
  });
  r.on(E.TrackUnsubscribed, (track) => { track.detach().forEach(el => el.remove()); refreshMuted(); });
  r.on(E.TrackMuted, refreshMuted);
  r.on(E.TrackUnmuted, refreshMuted);
  r.on(E.LocalTrackPublished, refreshMuted);
  r.on(E.LocalTrackUnpublished, refreshMuted);
  r.on(E.ParticipantConnected, refreshMuted);
  r.on(E.ParticipantDisconnected, refreshMuted);
  r.on(E.ActiveSpeakersChanged, (list) => emit({ speaking: list.map(p => p.identity) }));
  r.on(E.AudioPlaybackStatusChanged, () => emit({ audioBlocked: !r.canPlaybackAudio }));
  r.on(E.Reconnecting, () => emit({ status: 'reconnecting' }));
  r.on(E.SignalReconnecting, () => emit({ status: 'reconnecting' }));
  r.on(E.Reconnected, () => { emit({ status: 'connected' }); refreshMuted(); dataSubs.forEach(f => { try { f({ topic: '_reconnected', msg: {} }); } catch {} }); });
  r.on(E.ParticipantPermissionsChanged, (_prev, p) => {
    if (p !== r.localParticipant) return;
    const can = !!(p.permissions && p.permissions.canPublish);
    if (!can) { stopMic(true); }
    const role = roleFromMeta(p) || (can ? (STAGE.includes(state.role) ? state.role : 'speaker') : 'listener');
    emit({ role });
  });
  r.on(E.ParticipantMetadataChanged, (_prev, p) => {
    if (p !== r.localParticipant) return;
    const role = roleFromMeta(p);
    if (role) { emit({ role }); if (!STAGE.includes(role)) stopMic(true); }
  });
  r.on(E.DataReceived, (payload, participant, _kind, topic) => {
    if (participant) return;                       // only the server sends data (canPublishData:false)
    let msg = null;
    try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
    if (!msg || (state.roomId && msg.room_id && String(msg.room_id) !== String(state.roomId))) return;
    if (topic === 'room' && msg.type === 'closed') { leaving = true; }
    dataSubs.forEach(f => { try { f({ topic: topic || '', msg }); } catch {} });
  });
  r.on(E.MediaDevicesError, (e) => {
    const name = e && e.name;
    emit({ micError: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable', micBusy: false });
  });
  r.on(E.Disconnected, (reason) => {
    const R = lk.DisconnectReason || {};
    if (leaving && state.ended) return;
    let kind = 'lost';
    if (reason === R.CLIENT_INITIATED) kind = 'left';
    else if (reason === R.ROOM_DELETED) kind = 'closed';
    else if (reason === R.PARTICIPANT_REMOVED) kind = state.pendingEnd || 'kicked';
    else if (reason === R.DUPLICATE_IDENTITY) kind = 'elsewhere';
    if (state.pendingEnd) kind = state.pendingEnd;
    endWith(kind);
  });
}

/** Join a room. Throws the API error (kicked, room_locked, room_full…) to the caller. */
export async function join(roomId) {
  if (room && String(state.roomId) === String(roomId) && (state.status === 'connected' || state.status === 'reconnecting' || state.status === 'connecting')) return state;
  if (room) await leave({ quiet: true });
  leaving = false;
  state = initial();
  emit({ status: 'connecting', roomId: String(roomId) });
  let j;
  try {
    j = await capi.post(`/rooms/${roomId}/join`);
  } catch (e) {
    emit({ status: 'idle', roomId: null, error: e });
    throw e;
  }
  emit({ role: j.role, me: j.me, title: (j.room && j.room.title) || '' });
  try {
    if (!lk) lk = await import('livekit-client');
    const r = new lk.Room({
      adaptiveStream: false,
      dynacast: false,
      disconnectOnPageLeave: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    room = r;
    wire(r);
    await r.connect(j.url, j.token, { autoSubscribe: true });
    emit({ status: 'connected', audioBlocked: !r.canPlaybackAudio });
    refreshMuted();
    return { ...state, join: j };
  } catch (e) {
    try { if (room) await room.disconnect(); } catch {}
    room = null;
    // the API marked us present: undo quietly so counts stay true
    capi.post(`/rooms/${roomId}/leave`, { quiet: true }).catch(() => {});
    emit({ status: 'ended', ended: 'error', error: e });
    throw Object.assign(new Error('connect_failed'), { code: 'connect_failed', cause: e });
  }
}

/** Leave: the API first (quiet = «مغادرة بهدوء», no chat line), then the connection. */
export async function leave({ quiet = false } = {}) {
  const id = state.roomId;
  leaving = true;
  const r = room;
  emit({ pendingEnd: 'left' });
  if (id) { try { await capi.post(`/rooms/${id}/leave`, quiet ? { quiet: true } : {}); } catch {} }
  if (r) { try { await r.disconnect(); } catch {} }
  if (state.status !== 'ended') endWith('left');
  setAudioMode('media');
}

/** The server told us the room ended / we were removed: stop without calling /leave. */
export async function endBy(kind) {
  leaving = true;
  emit({ pendingEnd: kind });
  const r = room;
  if (r) { try { await r.disconnect(); } catch {} }
  if (state.status !== 'ended' || state.ended !== kind) endWith(kind);
}

export function reset() { if (!room) { state = initial(); emit({}); } }

async function stopMic(silent) {
  if (!room) return;
  try { await room.localParticipant.setMicrophoneEnabled(false); } catch {}
  emit({ mic: false, micBusy: false });
  setAudioMode('media');
  if (!silent) refreshMuted();
}

/** Turn my microphone on/off (stage roles only). Returns false when the OS refused. */
export async function setMic(on) {
  if (!room) return false;
  if (!on) { await stopMic(false); return true; }
  if (!STAGE.includes(state.role)) return false;
  emit({ micBusy: true, micError: null });
  await setAudioMode('voice');
  try {
    await room.localParticipant.setMicrophoneEnabled(true);
    emit({ micBusy: false });
    refreshMuted();
    return true;
  } catch (e) {
    const name = e && e.name;
    emit({ micBusy: false, mic: false, micError: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable' });
    setAudioMode('media');
    return false;
  }
}

/** After an autoplay block: must be called from a tap. */
export async function startAudio() {
  if (!room) return;
  try { await room.startAudio(); } catch {}
  emit({ audioBlocked: !room.canPlaybackAudio });
}

export function setRole(role) {
  emit({ role });
  if (!STAGE.includes(role)) stopMic(true);
}

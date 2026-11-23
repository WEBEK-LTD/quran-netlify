// ─── Android: mirror the page's Media Session into a native one ─────────────
// Starts/updates NQNative's media-playback foreground service (notification with
// previous / play-pause / next, lock-screen and Bluetooth controls) while audio
// plays, so Android keeps the process alive with the screen off. See mediaShim.js.
import { NQNative } from './nqNative';
import { subscribeMedia, runMediaAction } from './mediaShim';

let lastSent = '';
let timer = null;

function snapshot(s) {
  const m = s.metadata;
  if (!m || s.playbackState === 'none') return null;
  const p = s.position;
  const actions = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto']
    .filter(a => s.handlers[a]);
  return {
    title: String(m.title || ''), artist: String(m.artist || ''), album: String(m.album || ''),
    playing: s.playbackState === 'playing',
    duration: p && isFinite(p.duration) ? Math.round(p.duration * 1000) : -1,
    position: p && isFinite(p.position) ? Math.round(p.position * 1000) : -1,
    rate: p && isFinite(p.playbackRate) ? p.playbackRate : 1,
    actions,
  };
}

function push(s) {
  const snap = snapshot(s);
  const key = JSON.stringify(snap && { ...snap, position: Math.round((snap.position || 0) / 5000) });
  if (key === lastSent) return;
  lastSent = key;
  if (!snap) NQNative.mediaClear().catch(() => {});
  else NQNative.mediaUpdate(snap).catch(() => {});
}

export function initMediaBridge() {
  NQNative.addListener('mediaAction', (e) => {
    const action = e && e.action;
    if (!action) return;
    runMediaAction(action, typeof e.seekTime === 'number' ? { seekTime: e.seekTime / 1000 } : {});
  }).catch(() => {});
  subscribeMedia((s) => {
    clearTimeout(timer);
    timer = setTimeout(() => push(s), 120);   // coalesce bursts (metadata + state + position)
  });
}

// ─── Lock-screen controls while a radio station plays ────────────────────────
// The Mushaf player (src/audio/mediaSession.js) owns the Media Session the rest of
// the time; radio takes it over while a station is on and hands it back on stop.
import { engine, toggleAudio } from '../../audio/controller';

const ART = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
];
const ms = () => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null);
const set = (m, action, fn) => { try { m.setActionHandler(action, fn); } catch {} };

/** handlers: { play, stop, next, prev } */
export function claimMediaSession({ title, artist, album }, handlers) {
  const m = ms();
  if (!m) return;
  try {
    m.metadata = new window.MediaMetadata({
      title, artist, album,
      artwork: ART.map(a => ({ ...a, src: new URL(a.src, location.origin).href })),
    });
  } catch {}
  set(m, 'play', handlers.play);
  set(m, 'pause', handlers.stop);
  set(m, 'stop', handlers.stop);
  set(m, 'nexttrack', handlers.next);
  set(m, 'previoustrack', handlers.prev);
  // a live stream can't seek
  set(m, 'seekbackward', null);
  set(m, 'seekforward', null);
  set(m, 'seekto', null);
  try { m.setPositionState && m.setPositionState(); } catch {}
}

export function radioPlaybackState(state) {
  const m = ms();
  if (m) try { m.playbackState = state; } catch {}
}

/** Give the lock screen back to the Mushaf player (same handlers as src/audio/controller.js). */
export function releaseMediaSession() {
  const m = ms();
  if (!m) return;
  try { m.metadata = null; m.playbackState = 'none'; } catch {}
  set(m, 'play', () => { if (!engine.resume()) toggleAudio(); });
  set(m, 'pause', () => engine.pause());
  set(m, 'stop', () => engine.pause());
  set(m, 'previoustrack', () => engine.prev());
  set(m, 'nexttrack', () => engine.next());
  set(m, 'seekbackward', d => engine.seekBy(-((d && d.seekOffset) || 10)));
  set(m, 'seekforward', d => engine.seekBy((d && d.seekOffset) || 10));
  set(m, 'seekto', d => { if (d && typeof d.seekTime === 'number') engine.seek(d.seekTime); });
}

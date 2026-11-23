// ─── Full adhan playback inside the app ─────────────────────────────────────
// Used by the adhan screen: on iOS always (the notification itself may only carry
// a ≤ 30 s sound), on Android when the visitor opened the app from the
// notification (tapping it dismisses the notification and stops its sound).
// Any recitation / radio that is playing is paused first.
import { fullAdhanUrl } from './muezzins';

const playing = new Set();
let patched = false;
let el = null;

/** Remember every media element that starts playing (recitation engine, radio, …). */
export function trackMedia() {
  if (patched || typeof HTMLMediaElement === 'undefined') return;
  patched = true;
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(...args) {
    if (this !== el) playing.add(this);
    return orig.apply(this, args);
  };
}

function pauseOthers() {
  playing.forEach(a => { try { if (!a.paused) a.pause(); } catch {} });
}

/** Play the full adhan from `offset` seconds (skipped when the recording is already over). */
export function playAdhan(recordingId, offset = 0) {
  stopAdhan();
  if (!recordingId) return null;
  pauseOthers();
  el = new Audio(fullAdhanUrl(recordingId));
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  const start = Math.max(0, offset || 0);
  if (start > 0) {
    el.addEventListener('loadedmetadata', () => {
      if (isFinite(el.duration) && start >= el.duration - 1) { stopAdhan(); return; }
      try { el.currentTime = start; } catch {}
    }, { once: true });
  }
  el.play().catch(() => {});
  return el;
}

export function stopAdhan() {
  if (!el) return;
  try { el.pause(); el.removeAttribute('src'); el.load(); } catch {}
  el = null;
}

export const isAdhanPlaying = () => !!(el && !el.paused);
export const adhanElement = () => el;

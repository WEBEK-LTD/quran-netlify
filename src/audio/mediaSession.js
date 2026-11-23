// ─── Lock screen / notification controls (Media Session API) ────────────────
// Metadata follows the recited ayah in the visitor's language; position state is
// refreshed on discontinuities (new file, seek, rate, play/pause) and once a
// second at most — the OS extrapolates in between.
import { READERS } from '../data';
import { getLang } from '../i18n';
import { num, surahName } from '../l10n';
import { coreTrNow } from '../locales/core';
import { displayNumber } from '../components/reader/ayahItems';
import { readerName } from '../components/reader/readerNames';

const ART = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
];

let api = null;
let lastMeta = '';
let lastPos = { at: 0, key: '' };

export function mediaTitle(c) {
  const name = surahName(c.surah);
  const shown = c.basmala ? null : displayNumber(c.surah, c.ayah);
  return shown === null
    ? coreTrNow('سورة {name} · البسملة', { name })
    : coreTrNow('سورة {name} · الآية {n}', { name, n: num(shown) });
}

function update(engine, force = false) {
  const ms = navigator.mediaSession;
  const x = engine.getSnapshot();
  const c = x.cursor;
  try { ms.playbackState = c ? (x.playing ? 'playing' : 'paused') : 'none'; } catch {}
  if (!c) return;
  const key = `${x.reader}|${c.surah}|${c.ayah}|${c.basmala ? 1 : 0}|${getLang()}`;
  if (force || key !== lastMeta) {
    lastMeta = key;
    const r = READERS.find(rd => rd.id === x.reader);
    try {
      ms.metadata = new window.MediaMetadata({
        title: mediaTitle(c),
        artist: r ? readerName(r) : coreTrNow('القرآن الكريم'),
        album: coreTrNow('نور القرآن'),
        artwork: ART.map(a => ({ ...a, src: new URL(a.src, location.origin).href })),
      });
    } catch {}
  }
  if (!ms.setPositionState) return;
  const d = x.duration;
  if (!(d > 0)) return;
  const now = performance.now();
  const posKey = `${key}|${d.toFixed(1)}|${x.rate}|${x.playing}`;
  // expected position if the OS extrapolated since the last update
  const drift = lastPos.key === posKey ? Math.abs(lastPos.t + ((now - lastPos.at) / 1000) * (x.playing ? x.rate : 0) - x.time) : Infinity;
  if (!force && posKey === lastPos.key && drift < 1.5 && now - lastPos.at < 1000) return;
  lastPos = { at: now, key: posKey, t: x.time };
  try { ms.setPositionState({ duration: d, playbackRate: x.rate, position: Math.min(d, Math.max(0, x.time)) }); } catch {}
}

/** handlers: { play, pause, prev, next } — play may need to start a session */
export function attachMediaSession(engine, handlers) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch {} };
  set('play', () => handlers.play());
  set('pause', () => handlers.pause());
  set('stop', () => handlers.pause());
  set('previoustrack', () => handlers.prev());
  set('nexttrack', () => handlers.next());
  set('seekbackward', d => engine.seekBy(-((d && d.seekOffset) || 10)));
  set('seekforward', d => engine.seekBy((d && d.seekOffset) || 10));
  set('seekto', d => { if (d && typeof d.seekTime === 'number') engine.seek(d.seekTime); });
  api = engine;
  engine.subscribe(() => update(engine));
}

// Language changed: rewrite the metadata.
export function refreshMediaSession() {
  if (api && typeof navigator !== 'undefined' && 'mediaSession' in navigator) update(api, true);
}

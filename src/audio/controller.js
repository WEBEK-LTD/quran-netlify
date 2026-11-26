// ─── Glue between the recitation engine and the app store ───────────────────
// Store → engine (synchronously, so play() stays inside the visitor's gesture):
//   playTrigger  start at (playSurah || currentSurah, audioAyah)
//   reader       same ayah, new reciter
//   showAudio    closing the dock pauses
// Engine → store (batched in a microtask): isPlaying, audioSurah, audioAyah,
//   audioBasmala, audioBuffering — the reader highlights and follows these.
// The `nq:audio-toggle` window event (reader bar, ayah tools) toggles playback.
import { engine } from './engine';
import { attachMediaSession } from './mediaSession';
import { subscribe, getGlobal, setGlobal } from '../store';
import { coreTrNow } from '../locales/core';
import { num, surahName } from '../l10n';
import { displayNumber } from '../components/reader/ayahItems';

let ready = false;
let pending = null;

function publish(patch) {
  if (!pending) {
    pending = {};
    queueMicrotask(() => {
      const p = pending;
      pending = null;
      const g = getGlobal();
      const diff = {};
      Object.keys(p).forEach(k => { if (g[k] !== p[k]) diff[k] = p[k]; });
      if (Object.keys(diff).length) setGlobal(diff);
    });
  }
  Object.assign(pending, patch);
}

function ayahRef(c) {
  if (!c) return '';
  const shown = c.basmala ? null : displayNumber(c.surah, c.ayah);
  return shown === null ? coreTrNow('البسملة') : coreTrNow('الآية {n}', { n: num(shown) });
}

/** Play / pause from any control; starts at the reader's ayah when nothing was played yet. */
export function toggleAudio() {
  if (engine.cursor && engine.toggle()) return;
  setGlobal({ showAudio: true, playTrigger: Date.now() });
}

export function initAudio() {
  if (ready || typeof window === 'undefined') return engine;
  ready = true;
  const s0 = getGlobal();
  engine.setReader(s0.reader);
  const last = { playTrigger: s0.playTrigger, reader: s0.reader, showAudio: s0.showAudio };

  subscribe(s => {
    if (s.reader !== last.reader) { last.reader = s.reader; engine.setReader(s.reader); }
    if (s.showAudio !== last.showAudio) { last.showAudio = s.showAudio; if (!s.showAudio) engine.pause(); }
    if (s.playTrigger && s.playTrigger !== last.playTrigger) {
      last.playTrigger = s.playTrigger;
      const surah = s.playSurah >= 1 && s.playSurah <= 114 ? s.playSurah : s.currentSurah;
      engine.start(surah, s.audioAyah || 1);
      if (s.playSurah) publish({ playSurah: null });
    }
  });

  engine.subscribe(() => {
    const x = engine.getSnapshot();
    const c = x.cursor;
    const patch = { isPlaying: x.playing, audioBuffering: !!(x.buffering && x.playing) };
    if (c) Object.assign(patch, { audioSurah: c.surah, audioAyah: c.ayah, audioBasmala: !!c.basmala });
    publish(patch);
  });

  engine.onEvent(ev => {
    let toast = null;
    if (ev.type === 'skip') toast = coreTrNow('تعذّر تحميل {ref} — انتقلنا إلى ما بعدها', { ref: ayahRef(ev.cursor) });
    else if (ev.type === 'reader-fail') toast = coreTrNow('تعذّر تحميل تلاوة هذا القارئ، جرّب قارئاً آخر');
    else if (ev.type === 'net-stop') toast = coreTrNow('تعذّر تحميل التلاوة — تحقّق من اتصالك بالإنترنت');
    else if (ev.type === 'finished' && ev.cursor) toast = coreTrNow('انتهت سورة {name}', { name: surahName(ev.cursor.surah) });
    else if (ev.type === 'sleep-done') toast = coreTrNow('انتهى مؤقّت النوم — أُوقفت التلاوة');
    else if (ev.type === 'needs-tap') toast = coreTrNow('اضغط «تشغيل» لمتابعة التلاوة');
    else if (ev.type === 'room-busy') toast = coreTrNow('التلاوة متوقفة وأنت في غرفة صوتية — غادر الغرفة لتشغيلها');
    else if (ev.type === 'degraded' && import.meta.env.DEV) console.info('[audio] single-element mode');
    if (toast) publish({ toast });
  });

  window.addEventListener('nq:audio-toggle', toggleAudio);

  attachMediaSession(engine, {
    play: () => { if (!engine.resume()) setGlobal({ showAudio: true, playTrigger: Date.now() }); },
    pause: () => engine.pause(),
    prev: () => engine.prev(),
    next: () => engine.next(),
  });
  return engine;
}

export { engine };

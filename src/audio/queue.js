// ─── What plays next: pure playlist logic for the recitation engine ─────────
// A "cursor" is one position in the listening session:
//   { surah, ayah, basmala, rep, pass }
//     surah / ayah — Kufi numbers (audio files always use the Kufi count)
//     basmala      — true for the basmala played before ayah 1 of a surah (≠ 1, ≠ 9);
//                    the file is everyayah's 001001. In Al-Fatiha Kufi 1 IS the
//                    basmala, so it is an ordinary ayah there.
//     rep          — how many times this ayah has been played already (repeat mode)
//     pass         — how many passes of the range are done (range mode)
// Settings (see DEFAULT_SETTINGS):
//   mode       'single' | 'surah' | 'repeat' (each ayah ×repeatN) | 'range' (from–to ×rangeN)
//   afterSurah 'next' (continue into the next surah) | 'repeat' (loop the surah) | 'stop'
//   repeatN / rangeN — 0 means "without end"
import { SURAHS_META } from '../data';

export const DEFAULT_SETTINGS = {
  mode: 'surah',
  repeatN: 3,
  rangeFrom: null,
  rangeTo: null,
  rangeN: 3,
  afterSurah: 'next',
};

export const ayahCount = s => (SURAHS_META[s - 1] ? SURAHS_META[s - 1][2] : 0);
export const hasBasmala = s => s !== 1 && s !== 9;

// The file a cursor plays: [surah, ayah] of the everyayah MP3.
export function fileOf(c) {
  return c.basmala ? [1, 1] : [c.surah, c.ayah];
}

export function sameTrack(a, b) {
  return !!a && !!b && a.surah === b.surah && a.ayah === b.ayah && !!a.basmala === !!b.basmala;
}

// Where playback starts when the visitor asks for (surah, ayah).
export function firstCursor(surah, ayah, settings = DEFAULT_SETTINGS) {
  const a = Math.max(1, Math.min(ayahCount(surah) || 1, ayah || 1));
  const basmala = a === 1 && hasBasmala(surah) && settings.mode !== 'single';
  return { surah, ayah: a, basmala, rep: 0, pass: 0 };
}

function rangeOf(surah, settings) {
  const count = ayahCount(surah);
  let from = Math.max(1, Math.min(count, settings.rangeFrom || 1));
  let to = Math.max(1, Math.min(count, settings.rangeTo || count));
  if (to < from) [from, to] = [to, from];
  return [from, to];
}

const startOf = (surah, ayah) => ({ surah, ayah, basmala: ayah === 1 && hasBasmala(surah), rep: 0, pass: 0 });

/**
 * The cursor after `c`, or null when playback should stop.
 * opts.skip — the visitor pressed "next": ignore the remaining repetitions of this ayah.
 * opts.stopAtSurahEnd — the sleep timer is set to "end of the surah".
 */
export function nextCursor(c, settings = DEFAULT_SETTINGS, opts = {}) {
  if (!c) return null;
  const { mode } = settings;
  const count = ayahCount(c.surah);

  // the basmala always leads into ayah 1 of the same surah
  if (c.basmala) return { surah: c.surah, ayah: 1, basmala: false, rep: 0, pass: c.pass };

  if (mode === 'single') {
    if (!opts.skip) return null;
    // "next" in single mode moves one ayah (and plays only that one)
    if (c.ayah < count) return { surah: c.surah, ayah: c.ayah + 1, basmala: false, rep: 0, pass: 0 };
    return c.surah < 114 ? { surah: c.surah + 1, ayah: 1, basmala: false, rep: 0, pass: 0 } : null;
  }

  if (mode === 'repeat' && !opts.skip) {
    const n = settings.repeatN;
    if (n === 0 || c.rep + 1 < n) return { ...c, rep: c.rep + 1 };
  }

  if (mode === 'range') {
    const [from, to] = rangeOf(c.surah, settings);
    if (c.ayah >= from && c.ayah < to) return { surah: c.surah, ayah: c.ayah + 1, basmala: false, rep: 0, pass: c.pass };
    if (c.ayah === to) { // one pass of the range is done
      const n = settings.rangeN;
      if (n === 0 || c.pass + 1 < n) return { ...startOf(c.surah, from), pass: c.pass + 1 };
      return null;
    }
    // playing outside the range (it was just set): jump into it
    return { ...startOf(c.surah, from), pass: c.pass };
  }

  // surah / repeat: the next ayah, then what to do at the end of the surah
  if (c.ayah < count) return { surah: c.surah, ayah: c.ayah + 1, basmala: false, rep: 0, pass: 0 };
  if (opts.stopAtSurahEnd) return null;
  if (settings.afterSurah === 'repeat') return startOf(c.surah, 1);
  if (settings.afterSurah === 'next' && c.surah < 114) return startOf(c.surah + 1, 1);
  return null; // end of the surah (or of the Quran)
}

// The cursor before `c` ("previous" button).
export function prevCursor(c, settings = DEFAULT_SETTINGS) {
  if (!c) return null;
  if (c.basmala) {
    if (c.surah <= 1) return null;
    const s = c.surah - 1;
    return { surah: s, ayah: ayahCount(s), basmala: false, rep: 0, pass: 0 };
  }
  if (c.ayah > 1) return { surah: c.surah, ayah: c.ayah - 1, basmala: false, rep: 0, pass: c.pass };
  if (hasBasmala(c.surah) && settings.mode !== 'single') return { surah: c.surah, ayah: 1, basmala: true, rep: 0, pass: c.pass };
  if (c.surah <= 1) return null;
  const s = c.surah - 1;
  return { surah: s, ayah: ayahCount(s), basmala: false, rep: 0, pass: 0 };
}

// The next `n` distinct files after `c` (for prefetching).
export function upcoming(c, settings, n = 4, opts = {}) {
  const out = [];
  const seen = new Set();
  let cur = c;
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    cur = nextCursor(cur, settings, opts);
    if (!cur) break;
    const f = fileOf(cur);
    const k = f.join(':');
    if (c && fileOf(c).join(':') === k) continue;
    if (!seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

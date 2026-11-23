// ─── From API ayahs (Kufi count) to the items the reader displays ──────────
// Every displayed item keeps its Kufi number (`kufi`): audio files, tafsir,
// bookmarks, progress, reading log, notes, share and the assistant all use it.
// Only the number shown in the rosette (`label`) can differ — in Al-Fatiha,
// which is displayed with the Madani count (the basmala is not an ayah):
//   Madani 1–5 = Kufi 2–6
//   Kufi 7 is split after the first «عليهم» into Madani 6 and Madani 7.

export const BASMALA_TEXT = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

// Remove diacritics / Quranic marks / tatweel / invisible marks and unify letter
// forms so different editions (uthmani, imlaei) compare equal word by word.
export function normWord(str) {
  return String(str || '')
    .replace(/[﻿​-‏⁠]/g, '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g, '')
    .replace(/[آأإٱٲٳ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^ء-ي]/g, '');
}

const BASMALA_WORDS = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

// Strip the basmala from the start of ayah 1 ONLY if the text really starts with it
// (alquran.cloud includes it, quran.com does not).
export function stripBasmala(text) {
  const tokens = String(text || '').trim().split(/\s+/);
  if (tokens.length <= BASMALA_WORDS.length) return text;
  const starts = BASMALA_WORDS.every((w, i) => normWord(tokens[i]) === w);
  if (!starts) return text;
  return tokens.slice(BASMALA_WORDS.length).join(' ').trim() || text;
}

function isBasmala(text) {
  const t = String(text || '').trim().split(/\s+/).map(normWord).filter(Boolean);
  return t.length === 4 && BASMALA_WORDS.every((w, i) => t[i] === w);
}

// Split Kufi Fatiha 7 after the first «عليهم». null when not found.
export function splitFatiha7(text) {
  const tokens = String(text || '').trim().split(/\s+/);
  const i = tokens.findIndex(t => normWord(t) === 'عليهم');
  if (i < 1 || i >= tokens.length - 1) return null;
  return [tokens.slice(0, i + 1).join(' '), tokens.slice(i + 1).join(' ')];
}

/**
 * @returns {{ basmala: boolean, basmalaKufi: number|null, items: Array<{
 *   uid: string, kufi: number, label: string|number, text: string,
 *   fullText: string, showTrans: boolean, anchor: boolean }>
 * }}
 *  basmalaKufi — the Kufi ayah the basmala line stands for (1 in Al-Fatiha), else null
 *  anchor      — this item carries the DOM id `ayah-<kufi>` (scroll target)
 */
export function buildItems(surah, ayahs) {
  if (surah !== 1) {
    return {
      basmala: surah !== 9,
      basmalaKufi: null,
      items: ayahs.map(a => {
        const text = a.number === 1 && surah !== 9 ? stripBasmala(a.text) : a.text;
        return { uid: String(a.number), kufi: a.number, label: a.number, text, fullText: text, showTrans: true, anchor: true };
      }),
    };
  }

  // Al-Fatiha — Madani count
  const items = [];
  let rest = ayahs;
  let shift = 0;
  const first = ayahs.find(a => a.number === 1);
  if (first && isBasmala(first.text)) { rest = ayahs.filter(a => a.number !== 1); shift = 1; }
  else if (first) {
    // An edition without the basmala as ayah 1 (should not happen with Kufi data):
    // keep whatever follows it after stripping.
    rest = ayahs.map(a => a.number === 1 ? { ...a, text: stripBasmala(a.text) } : a);
  }

  rest.forEach(a => {
    if (a.number === 7) {
      const parts = splitFatiha7(a.text);
      if (parts) {
        items.push({ uid: '7a', kufi: 7, label: 6, text: parts[0], fullText: a.text, showTrans: false, anchor: true });
        items.push({ uid: '7b', kufi: 7, label: 7, text: parts[1], fullText: a.text, showTrans: true, anchor: false });
      } else {
        items.push({ uid: '7', kufi: 7, label: '6–7', text: a.text, fullText: a.text, showTrans: true, anchor: true });
      }
      return;
    }
    const label = a.number - shift;
    items.push({ uid: String(a.number), kufi: a.number, label, text: a.text, fullText: a.text, showTrans: true, anchor: true });
  });

  return { basmala: true, basmalaKufi: 1, items };
}

// The number a reader sees for a Kufi ayah (Al-Fatiha shows Madani).
export function displayNumber(surah, kufi) {
  if (surah !== 1) return kufi;
  if (kufi <= 1) return null;          // the basmala — not numbered
  if (kufi === 7) return '6–7';
  return kufi - 1;
}

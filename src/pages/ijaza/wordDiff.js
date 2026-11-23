// ─── Word-by-word comparison of two riwayat texts ────────────────────────────
// The raw strings are compared, word by word, letters and harakat included: a
// diacritics-insensitive comparison would hide real differences (مَلِكِ /
// مَٰلِكِ, يُؤۡمِنُونَ / يُومِنُونَ…). Only what is not part of the word's
// reading is set aside:
//  - pause signs (ۖ ۗ ۘ ۙ ۚ ۛ ۜ) and the hizb mark ۞, which each mushaf places
//    by its own tradition;
//  - the same sign encoded two ways: the sukun (U+0652 in the Warsh/Qalun texts,
//    U+06E1 in the others) and the hamzat al-wasl (ٱ, or ا + vowel + ۬ / ۪ in
//    the Maghribi-dabt texts).
// What is shown is always the original text.
export const compareKey = w => w
  .replace(/[\u06D6-\u06DC\u06DE\u06E9]/g, '')
  .replace(/\u06E1/g, '\u0652')
  .replace(/\u0627[\u064E-\u0650]?[\u06EA\u06EC]/g, '\u0671');
const key = compareKey;

// → { a: [{ w, diff }], b: [{ w, diff }], count } — words not in the longest
// common subsequence are marked as different on each side.
export function diffWords(textA, textB) {
  const A = textA ? textA.split(' ') : [];
  const B = textB ? textB.split(' ') : [];
  const ka = A.map(key), kb = B.map(key);
  const n = A.length, m = B.length;
  // LCS table (ayahs are at most ~130 words, so this stays small)
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const a = A.map(w => ({ w, diff: true }));
  const b = B.map(w => ({ w, diff: true }));
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) { a[i].diff = false; b[j].diff = false; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const count = Math.max(a.filter(x => x.diff).length, b.filter(x => x.diff).length);
  return { a, b, count };
}

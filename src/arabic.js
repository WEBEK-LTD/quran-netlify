// أدوات نصوص عربية مشتركة

// تشكيل وعلامات قرآنية: U+064B–U+065F، الألف الخنجرية U+0670، علامات المصحف U+06D6–U+06ED، التطويل U+0640
const DIACRITICS_RE = /[ً-ٰٟۖ-ۭـ]/g;

// تطبيع للبحث: إزالة التشكيل وتوحيد أشكال الحروف (أإآٱ→ا، ى→ي، ة→ه، ؤ→و، ئ→ي)
export function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .replace(DIACRITICS_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

// يطبّع النص مع خريطة من كل حرف في الناتج إلى موضعه في النص الأصلي،
// لتلوين نتيجة البحث على النص الأصلي المشكول.
export function normalizeWithMap(text) {
  const src = String(text || '');
  let out = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const n = normalizeArabic(src[i]);
    for (let k = 0; k < n.length; k++) { out += n[k]; map.push(i); }
  }
  return { text: out, map };
}

// يعيد مقاطع [{ text, match }] للنص الأصلي مع تمييز مواضع ظهور الاستعلام (بعد التطبيع)
export function highlightSegments(original, query) {
  const src = String(original || '');
  const q = normalizeArabic(query).trim();
  if (!q) return [{ text: src, match: false }];
  const { text: norm, map } = normalizeWithMap(src);
  const segs = [];
  let last = 0, from = 0, idx;
  while ((idx = norm.indexOf(q, from)) !== -1) {
    const start = map[idx];
    let end = map[idx + q.length - 1] + 1;
    // ضمّ علامات التشكيل اللاحقة للحرف الأخير
    while (end < src.length && normalizeArabic(src[end]) === '') end++;
    if (start > last) segs.push({ text: src.slice(last, start), match: false });
    segs.push({ text: src.slice(start, end), match: true });
    last = end;
    from = idx + q.length;
  }
  if (last < src.length) segs.push({ text: src.slice(last), match: false });
  return segs;
}

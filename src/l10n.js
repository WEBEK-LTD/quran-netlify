// ─── Localisation for the redesigned site ────────────────────────────────────
// Source strings are written in Arabic directly in the components and wrapped:
//
//   const tr = useTr();
//   <h1>{tr('مواقيت الصلاة')}</h1>
//   tr('بقي {n} دقيقة', { n: num(5) })
//
// Translations live in src/locales/<area>.js, keyed by the exact Arabic source
// string: export default { en: { 'مواقيت الصلاة': 'Prayer times' }, tr: {…}, fr: {…}, ur: {…}, id: {…} }
// Missing entries fall back to Arabic, so nothing ever shows a raw key.
//
// Never translate: Quran text, ayah references inside Quranic quotes, du'a in Arabic
// (show its meaning separately if needed), the brand wordmark image.
import { useLang, getLang, LANGS } from './i18n';
import { SURAHS_META } from './data';

const modules = import.meta.glob('./locales/*.js', { eager: true });
const DICT = { en: {}, tr: {}, fr: {}, ur: {}, id: {} };
for (const m of Object.values(modules)) {
  const d = m.default || {};
  for (const lang of Object.keys(DICT)) Object.assign(DICT[lang], d[lang] || {});
}

function fill(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (all, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : all));
}

export function translate(lang, ar, vars) {
  const s = (lang !== 'ar' && DICT[lang] && DICT[lang][ar]) || ar;
  return fill(s, vars);
}

// Hook: re-renders on language change.
export function useTr() {
  const lang = useLang();
  const tr = (ar, vars) => translate(lang, ar, vars);
  tr.lang = lang;
  tr.dir = LANGS.find(l => l.code === lang)?.dir || 'rtl';
  return tr;
}

// Non-hook (event handlers, toasts, utilities).
export function trNow(ar, vars) { return translate(getLang(), ar, vars); }

// Digits: Arabic-Indic for Arabic, Extended Arabic-Indic for Urdu, Latin otherwise.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const UR_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function num(n, lang = getLang()) {
  const s = String(n);
  if (lang === 'ar') return s.replace(/\d/g, d => AR_DIGITS[d]);
  if (lang === 'ur') return s.replace(/\d/g, d => UR_DIGITS[d]);
  return s.replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[۰-۹]/g, d => UR_DIGITS.indexOf(d));
}

// Surah name for display: Arabic script for ar/ur, transliteration otherwise.
export function surahName(n, lang = getLang()) {
  const m = SURAHS_META[n - 1];
  if (!m) return '';
  return lang === 'ar' || lang === 'ur' ? m[0] : m[1];
}

// Makki / Madani label.
export function revelationLabel(typeAr, lang = getLang()) {
  return translate(lang, typeAr === 'مدنية' ? 'مدنية' : 'مكية');
}

// BCP-47 locale for Intl (dates, numbers).
export function intlLocale(lang = getLang()) {
  return { ar: 'ar-EG', en: 'en-GB', tr: 'tr-TR', fr: 'fr-FR', ur: 'ur-PK', id: 'id-ID' }[lang] || 'ar-EG';
}

export function isRtl(lang = getLang()) {
  return lang === 'ar' || lang === 'ur';
}

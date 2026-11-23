// Small display helpers: times, dates, counts — always in the reader's language and digits.
import { useTr, num, intlLocale } from '../l10n';
import { roomsTr, roomsTrNow } from '../locales/rooms';

/** const t = useT();  t('مباشر الآن') — rooms strings first, then the shared dictionary. */
// Arabic «لـ{name}»: لـ + الشيخ → «للشيخ», لـ + أحمد → «لأحمد».
const lam = (s) => s.replace(/لـال/g, 'لل').replace(/لـ(?=\S)/g, 'ل');
export function useT() {
  const base = roomsTr(useTr());
  if (base.lang !== 'ar') return base;
  const f = (ar, vars) => (ar.includes('لـ{') ? lam(base(ar, vars)) : base(ar, vars));
  f.lang = base.lang; f.dir = base.dir;
  return f;
}
export const tNow = roomsTrNow;

const d = (iso) => (iso ? new Date(iso) : null);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function fmtTime(iso, lang) {
  const x = d(iso); if (!x || isNaN(x)) return '';
  try { return num(new Intl.DateTimeFormat(intlLocale(lang), { hour: 'numeric', minute: '2-digit' }).format(x), lang); } catch { return ''; }
}

export function fmtDate(iso, lang, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const x = d(iso); if (!x || isNaN(x)) return '';
  try { return num(new Intl.DateTimeFormat(intlLocale(lang), opts).format(x), lang); } catch { return ''; }
}

/** «اليوم» / «غداً» / weekday + date */
export function fmtDay(iso, t) {
  const x = d(iso); if (!x || isNaN(x)) return '';
  const now = new Date();
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (sameDay(x, now)) return t('اليوم');
  if (sameDay(x, tom)) return t('غداً');
  return fmtDate(iso, t.lang, { weekday: 'long', day: 'numeric', month: 'short' });
}

/** «٢:١٠ م» today, «أمس», weekday this week, else a short date (inbox / chat). */
export function fmtShort(iso, t) {
  const x = d(iso); if (!x || isNaN(x)) return '';
  const now = new Date();
  if (sameDay(x, now)) return fmtTime(iso, t.lang);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(x, y)) return t('أمس');
  if (now - x < 6 * 86400e3) return fmtDate(iso, t.lang, { weekday: 'long' });
  return fmtDate(iso, t.lang, { day: 'numeric', month: 'short' });
}

export function fmtAgo(iso, lang) {
  const x = d(iso); if (!x || isNaN(x)) return '';
  const s = Math.round((x - Date.now()) / 1000);
  const abs = Math.abs(s);
  const [v, u] = abs < 60 ? [s, 'second'] : abs < 3600 ? [Math.round(s / 60), 'minute'] : abs < 86400 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day'];
  try { return num(new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: 'auto' }).format(v, u), lang); } catch { return ''; }
}

export const n = (v, lang) => num(v ?? 0, lang);

/** First letter of a name for the letter avatar (skips «ال», keeps Latin uppercase). */
export function initialOf(name) {
  const s = String(name || '').trim().replace(/^(ال)(?=\S{2,})/, '');
  const ch = Array.from(s)[0] || '·';
  return ch.toLocaleUpperCase();
}

/** stable 0..5 tint for a user/group id */
export const tintOf = (id) => Math.abs(parseInt(id, 10) || 0) % 6;

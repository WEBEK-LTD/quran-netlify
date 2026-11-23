// ─── Prayer times ────────────────────────────────────────────────────────────
// Mihrab hero → next prayer with the sun's path + qibla card → the five prayers
// as mihrab windows (each with its adhan alarm) → settings → the week ahead.
// Times come from api.aladhan.com in the city's own time zone.
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import styles from './PrayerTimesPage.module.css';
import { PageHero, Icon, Badge8, Pattern, Corners, toAr } from '../components/ornaments/Ornaments';
import QiblaRose, { calcQibla, calcDistance, fmtKm } from './qibla/QiblaRose';
import { useTr, trNow, num, intlLocale, isRtl, surahName } from '../l10n';
import { getLang } from '../i18n';
import { HIJRI_MONTHS } from '../locales/worship';
import { isNative } from '../native/platform';

// Native app only: adhan notifications, muezzins, reminders (src/native/NativeAdhanSettings.jsx)
const NativeAdhanSettings = lazy(() => import('../native/NativeAdhanSettings'));
const NATIVE = isNative();

const PRAYERS_INFO = [
  { key: 'Fajr',    name: 'الفجر',  icon: 'moon' },
  { key: 'Sunrise', name: 'الشروق', icon: 'sun' },
  { key: 'Dhuhr',   name: 'الظهر',  icon: 'sun' },
  { key: 'Asr',     name: 'العصر',  icon: 'sun' },
  { key: 'Maghrib', name: 'المغرب', icon: 'sun' },
  { key: 'Isha',    name: 'العشاء', icon: 'moon' },
];
const FIVE = PRAYERS_INFO.filter(p => p.key !== 'Sunrise');

// معرّفات طرق الحساب حسب api.aladhan.com
const METHODS = [
  { id: '5',  name: 'الهيئة المصرية العامة للمساحة' },
  { id: '4',  name: 'جامعة أم القرى — السعودية' },
  { id: '3',  name: 'رابطة العالم الإسلامي' },
  { id: '9',  name: 'الكويت' },
  { id: '10', name: 'قطر' },
  { id: '16', name: 'دبي — الإمارات' },
  { id: '8',  name: 'منطقة الخليج' },
  { id: '13', name: 'رئاسة الشؤون الدينية — تركيا' },
  { id: '2',  name: 'الجمعية الإسلامية لأمريكا الشمالية' },
  { id: '12', name: 'اتحاد المنظمات الإسلامية — فرنسا' },
  { id: '21', name: 'المغرب', tkey: 'المملكة المغربية' }, // «المغرب» alone is also the prayer name
  { id: '18', name: 'تونس' },
  { id: '19', name: 'الجزائر' },
  { id: '23', name: 'وزارة الأوقاف الأردنية' },
  { id: '1',  name: 'جامعة العلوم الإسلامية — كراتشي' },
];

// الإصدار القديم كان يخزّن معرّفات خاطئة — نحوّلها للمعرّف الصحيح للدولة نفسها
const OLD_METHOD_MAP = { '5':'5','4':'4','3':'3','8':'9','9':'10','7':'8','12':'13','2':'2','11':'12','20':'21','17':'18','22':'3','1':'1' };

function loadSavedMethod() {
  try {
    const v2 = localStorage.getItem('nq_pray_method_v2');
    if (v2 && METHODS.some(m => m.id === v2)) return v2;
    const old = localStorage.getItem('nq_pray_method');
    if (old && OLD_METHOD_MAP[old]) return OLD_METHOD_MAP[old];
  } catch {}
  return null;
}

// اقتراح طريقة حساب تلقائي حسب المنطقة الزمنية
function suggestMethod(tzOverride) {
  const tz = tzOverride || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (tz.includes('Cairo'))      return '5';  // Egypt
  if (tz.includes('Riyadh'))     return '4';  // Saudi
  if (tz.includes('Kuwait'))     return '9';  // Kuwait
  if (tz.includes('Qatar'))      return '10'; // Qatar
  if (tz.includes('Dubai'))      return '16'; // Dubai
  if (tz.includes('Bahrain') || tz.includes('Muscat')) return '8'; // Gulf Region
  if (tz.includes('Istanbul'))   return '13'; // Turkey (Diyanet)
  if (tz.includes('Baghdad'))    return '3';  // Iraq → MWL
  if (tz.includes('Amman'))      return '23'; // Jordan
  if (tz.includes('Beirut'))     return '3';  // Lebanon → MWL
  if (tz.includes('Damascus'))   return '3';  // Syria → MWL
  if (tz.includes('Casablanca')) return '21'; // Morocco
  if (tz.includes('Tunis'))      return '18'; // Tunisia
  if (tz.includes('Algiers'))    return '19'; // Algeria
  if (tz.includes('Gaza') || tz.includes('Hebron')) return '3'; // Palestine → MWL (لا توجد طريقة خاصة)
  if (tz.includes('Paris'))      return '12'; // France (UOIF)
  if (tz.includes('London'))     return '3';  // UK → MWL
  if (tz.includes('America/'))   return '2';  // Americas → ISNA
  return '3'; // default: MWL
}

function parseHM(t) {
  if (!t) return { h: 0, m: 0 };
  const clean = t.trim().split(' ')[0];
  const parts = clean.split(':');
  return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
}

function fmt24(t) {
  if (!t) return '--:--';
  const { h, m } = parseHM(t);
  return toAr(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
}

// Arabic and English read prayer times on a 12-hour clock; Turkish, French,
// Urdu and Indonesian timetables use the 24-hour clock.
const uses12h = (lang = getLang()) => lang === 'ar' || lang === 'en';

// { t: '٥:٠١', ap: 'ص' | 'م', long: 'صباحاً' | 'مساءً' } — ap/long are empty on a 24-hour clock
function fmt12(t) {
  if (!t) return { t: '--:--', ap: '', long: '' };
  const { h, m } = parseHM(t);
  if (!uses12h()) return { t: fmt24(t), ap: '', long: '' };
  return {
    t: toAr(`${h % 12 || 12}:${String(m).padStart(2, '0')}`),
    ap: trNow(h < 12 ? 'ص' : 'م'),
    long: trNow(h < 12 ? 'صباحاً' : 'مساءً'),
  };
}
const fmt12s = t => { const f = fmt12(t); return f.ap ? `${f.t} ${f.ap}` : f.t; };

function toMins(t) {
  const { h, m } = parseHM(t);
  return h * 60 + m;
}

const DEVICE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();

// الوقت الحالي "على ساعة المدينة" — aladhan يعيد المواعيد بتوقيت المدينة لا الجهاز
function zonedNow(tz, date = new Date()) {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      }).formatToParts(date).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
      const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return {
        y: +parts.year, mo: +parts.month, d: +parts.day,
        h: (+parts.hour) % 24, mi: +parts.minute, s: +parts.second,
        dow: WD[parts.weekday] ?? date.getDay(),
      };
    } catch {}
  }
  return {
    y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(),
    h: date.getHours(), mi: date.getMinutes(), s: date.getSeconds(), dow: date.getDay(),
  };
}

// تاريخ تقويمي (بدون توقيت) + إزاحة أيام — نستخدم UTC لتجنّب مشاكل التوقيت الصيفي
function addDays({ y, mo, d }, n) {
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
const dateKey = ({ y, mo, d }) => `${y}-${mo}-${d}`;

// الصلاة القادمة والوقت المتبقي (بالثواني) حسب ساعة المدينة.
// الشروق ليس صلاة فلا يُعدّ "الصلاة القادمة" (كما في شريط الصفحة الرئيسية).
// بعد العشاء: العدّ التنازلي لفجر الغد.
function getNextPrayer(times, tomorrowTimes, cn) {
  const nowSecs = cn.h * 3600 + cn.mi * 60 + cn.s;
  for (const p of FIVE) {
    if (!times[p.key]) continue;
    const target = toMins(times[p.key]) * 60;
    if (target > nowSecs) return { key: p.key, time: times[p.key], secsLeft: target - nowSecs, tomorrow: false };
  }
  const fajr = tomorrowTimes?.Fajr || times.Fajr;
  if (!fajr) return null;
  return { key: 'Fajr', time: fajr, secsLeft: 86400 - nowSecs + toMins(fajr) * 60, tomorrow: true };
}

function fmtLeft(secs) {
  if (secs == null || secs <= 0) return null;
  const diff = Math.ceil(secs / 60);
  if (diff < 60) return trNow('{n} دقيقة', { n: toAr(diff) });
  const h = Math.floor(diff / 60), m = diff % 60;
  return m ? trNow('{h} س {m} د', { h: toAr(h), m: toAr(m) }) : trNow('{h} س', { h: toAr(h) });
}

function fmtClock(secs) {
  const s = Math.max(0, Math.floor(secs));
  const p = n => String(n).padStart(2, '0');
  return toAr(`${p(Math.floor(s / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}`);
}

async function geocodeCity(name) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1&accept-language=${getLang()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('تعذّر البحث عن المدينة، حاول مرة أخرى');
  const data = await res.json();
  if (!data.length) throw new Error('لم نجد هذه المدينة، جرّب كتابة اسمها بالإنجليزية');
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name?.split('،')[0]?.split(',')[0] || name,
  };
}

// dateParts = { y, mo, d } — تاريخ المدينة
async function fetchDayTimes(lat, lon, method, dateParts) {
  const { y, mo, d } = dateParts;
  const url = `https://api.aladhan.com/v1/timings/${d}-${mo}-${y}?latitude=${lat}&longitude=${lon}&method=${method}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('تعذّر جلب المواقيت');
  const json = await res.json();
  if (json.code !== 200) throw new Error('تعذّر جلب المواقيت');
  return json.data;
}

// إشعار يعمل على Android Chrome (يتطلب Service Worker) مع رجوع إلى Notification
async function showPrayerNotification(title, options) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) { await reg.showNotification(title, options); return; }
    }
  } catch {}
  try { new Notification(title, options); } catch {}
}

function readTz() {
  try { return localStorage.getItem('nq_pray_tz') || ''; } catch { return ''; }
}

const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// Weekday name in the visitor's language (1 Jan 2023 was a Sunday).
function dayName(dow, lang = getLang()) {
  if (lang === 'ar') return DAYS_AR[dow];
  try { return new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow))); }
  catch { return DAYS_AR[dow]; }
}

// "الأحد ٢٣ نوفمبر ٢٠٢٦" / "Sunday 23 November 2026" for the city's calendar date
function fmtDateLine({ y, mo, d, dow }, lang = getLang()) {
  if (lang === 'ar') return `${DAYS_AR[dow]} ${toAr(d)} ${MONTHS_AR[mo - 1]} ${toAr(y)}`;
  try {
    return num(new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, mo - 1, d))), lang);
  } catch { return `${DAYS_AR[dow]} ${toAr(d)} ${MONTHS_AR[mo - 1]} ${toAr(y)}`; }
}

// Hijri date from aladhan's gToH: Arabic month name as given, translated names otherwise
function fmtHijri(h, lang = getLang()) {
  if (!h) return '';
  if (lang === 'ar') return `${toAr(h.day)} ${h.month.ar} ${toAr(h.year)} هـ`;
  const loc = HIJRI_MONTHS[lang];
  const month = loc?.months[(+h.month.number || 0) - 1] || h.month.en || h.month.ar;
  return `${num(parseInt(h.day, 10) || h.day, lang)} ${month} ${num(h.year, lang)}${loc?.era ? ' ' + loc.era : ''}`;
}

// Ayah reference for the hero: Arabic as written; other languages add "An-Nisa 4:103"
function heroRef(ar, s, a, lang = getLang()) {
  if (lang === 'ar' || lang === 'ur') return ar;
  return <><bdi lang="ar">{ar}</bdi> · <bdi>{surahName(s, lang)} {s}:{a}</bdi></>;
}

// Rough text width in SVG units (to keep the sun-path labels inside the card)
const textW = (s, fs) => [...String(s)].length * fs * (isRtl() ? 0.46 : 0.56);
const clampX = (x, w) => Math.min(640 - w / 2 - 4, Math.max(w / 2 + 4, x));
// Split a long label in two lines at the space nearest the middle
function splitLabel(s) {
  if (s.length <= 9 || !s.includes(' ')) return [s];
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return [s.slice(0, best), s.slice(best + 1)];
}

// ── sun path: sunrise (right) → maghrib (left), the sun at the city's "now" ──
function SunArc({ times, nowMins }) {
  const tr = useTr();
  const lang = tr.lang;
  const sr = toMins(times.Sunrise), mg = toMins(times.Maghrib);
  const cx = 320, cy = 215, rx = 250, ry = 170;
  // RTL: sunrise on the right, maghrib on the left; LTR mirrors it so the day reads left → right
  const rtl = isRtl(lang);
  const X = x => (rtl ? x : 2 * cx - x);
  const sweep = rtl ? 0 : 1;
  const span = Math.max(1, mg - sr);
  const pos = m => {
    const th = Math.PI * Math.min(1, Math.max(0, (m - sr) / span));
    return [X(cx + rx * Math.cos(th)), cy - ry * Math.sin(th)];
  };
  const day = nowMins > sr && nowMins < mg;
  const sun = day ? pos(nowMins) : null;
  const marks = ['Sunrise', 'Dhuhr', 'Asr', 'Maghrib'].map(k => ({ k, p: pos(toMins(times[k])), info: PRAYERS_INFO.find(x => x.key === k) }));
  const fit = (x, s, fs) => (lang === 'ar' ? x : clampX(x, textW(s, fs)));
  const fajrTxt = `${tr('الفجر')} ${fmt12s(times.Fajr)}`;
  const ishaTxt = `${tr('العشاء')} ${fmt12s(times.Isha)}`;
  const arcFrom = `M${X(cx + rx)} ${cy} A${rx} ${ry} 0 0 ${sweep}`;
  return (
    <svg className={styles.arc} viewBox="0 0 640 292" role="img"
      aria-label={tr('مسار الشمس اليوم: الشروق {sr} والمغرب {mg}', { sr: fmt12s(times.Sunrise), mg: fmt12s(times.Maghrib) })}>
      <line x1="20" y1={cy} x2="620" y2={cy} style={{ stroke: 'var(--line2)' }} strokeDasharray="4 6" />
      <path d={`${arcFrom} ${X(cx - rx)} ${cy}`} fill="none" style={{ stroke: 'var(--line2)' }} strokeWidth="1.4" strokeDasharray="2 5" />
      {sun && (
        <path d={`${arcFrom} ${sun[0].toFixed(1)} ${sun[1].toFixed(1)}`} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth="2" />
      )}
      {!sun && nowMins >= mg && (
        <path d={`${arcFrom} ${X(cx - rx)} ${cy}`} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth="1.6" strokeOpacity=".7" />
      )}
      {sun && (
        <g>
          <circle cx={sun[0].toFixed(1)} cy={sun[1].toFixed(1)} r="20" style={{ fill: 'var(--glow)' }} />
          <circle cx={sun[0].toFixed(1)} cy={sun[1].toFixed(1)} r="9" style={{ fill: 'var(--gold2)', stroke: 'var(--surface)' }} strokeWidth="2" />
        </g>
      )}
      {marks.map(({ k, p, info }) => {
        // the two ends sit on the horizon: put their labels outside the arc
        const dx = (k === 'Sunrise' ? 34 : k === 'Maghrib' ? -34 : 0) * (rtl ? 1 : -1);
        const end = dx !== 0;
        const name = tr(info.name);
        // long names (e.g. "Lever du soleil") go on two lines, stacked upwards
        const lines = lang === 'ar' ? [name] : splitLabel(name);
        const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
        const lx = fit(p[0] + dx, longest, 26);
        const ly = p[1] - (end ? 10 : 14);
        const tm = fmt12s(times[k]);
        return (
          <g key={k}>
            <circle cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="5" style={{ fill: 'var(--surface)', stroke: 'var(--gold)' }} strokeWidth="1.6" />
            <text className={styles.arcLbl} x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor="middle">
              {lines.length === 1 ? name : lines.map((l, i) => (
                <tspan key={i} x={lx.toFixed(1)} dy={i === 0 ? `${-1.1 * (lines.length - 1)}em` : '1.1em'}>{l}</tspan>
              ))}
            </text>
            <text className={styles.arcTm} x={fit(p[0] + dx, tm, 21).toFixed(1)} y={(p[1] + (end ? 22 : 26)).toFixed(1)} textAnchor="middle">{tm}</text>
          </g>
        );
      })}
      <circle cx={X(600)} cy="258" r="4" style={{ fill: 'var(--muted)' }} />
      <text className={styles.arcTm} x={fit(X(600), fajrTxt, 21).toFixed(1)} y="282" textAnchor="middle">{fajrTxt}</text>
      <circle cx={X(40)} cy="258" r="4" style={{ fill: 'var(--muted)' }} />
      <text className={styles.arcTm} x={fit(X(40), ishaTxt, 21).toFixed(1)} y="282" textAnchor="middle">{ishaTxt}</text>
    </svg>
  );
}

// Window outline (drawn in the arch shape the mask cuts)
function WinLine() {
  return (
    <svg className={styles.wl} viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 150V54C1 31.5 28 13 50 1.2 72 13 99 31.5 99 54V150" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 150V57C7 37 31 20 50 9 69 20 93 37 93 57V150" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1" />
    </svg>
  );
}

export default function PrayerTimesPage() {
  const tr = useTr();
  const [cityInput, setCityInput] = useState('');
  const [city,      setCity]      = useState(() => localStorage.getItem('nq_pray_city') || '');
  const [coords,    setCoords]    = useState(() => {
    const lat = localStorage.getItem('nq_pray_lat');
    const lon = localStorage.getItem('nq_pray_lon');
    return lat && lon ? { lat: +lat, lon: +lon } : null;
  });
  const [method,  setMethod]  = useState(() => loadSavedMethod() || suggestMethod());
  const [tz,      setTz]      = useState(readTz); // منطقة المدينة الزمنية (من aladhan meta)
  const [times,   setTimes]   = useState(null);
  const [tomorrowTimes, setTomorrowTimes] = useState(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [alarms,  setAlarms]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('nq_pray_alarms') || '{}'); } catch { return {}; }
  });
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [weekly,  setWeekly]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [weekLoad,setWeekLoad]= useState(false);
  const [error,   setError]   = useState('');
  const [hijriData, setHijriData] = useState(null);
  const [now,     setNow]     = useState(new Date());
  const [showDay, setShowDay] = useState('today'); // today | tomorrow (نوافذ الصلوات)
  const runRef   = useRef(0);          // معرّف آخر عملية تحميل — لتجاهل نتائج العمليات القديمة
  const firedRef = useRef(new Set());  // منبّهات أُطلقت بالفعل
  const cityRef  = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // "الآن" بتوقيت المدينة (أو الجهاز إن لم تُعرف المدينة بعد)
  const cn = zonedNow(tz, now);
  const todayKey = dateKey(cn);
  const minuteKey = `${todayKey} ${cn.h}:${cn.mi}`;

  // التاريخ الهجري لتاريخ المدينة — يُعاد عند تغيّر اليوم
  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.aladhan.com/v1/gToH?date=${cn.d}-${cn.mo}-${cn.y}`)
      .then(r => r.json())
      .then(d => { const h = d.data?.hijri; if (h && !cancelled) setHijriData(h); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [todayKey]); // eslint-disable-line

  const loadTimes = useCallback(async (lat, lon, methodId) => {
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    setLoading(true); setError('');
    let zone = readTz();
    let base = zonedNow(zone);
    let rows = [];
    try {
      let day = await fetchDayTimes(lat, lon, methodId, base);
      if (stale()) return;
      const metaTz = day.meta?.timezone;
      if (metaTz && metaTz !== zone) {
        zone = metaTz;
        try { localStorage.setItem('nq_pray_tz', zone); } catch {}
        const cityToday = zonedNow(zone);
        if (dateKey(cityToday) !== dateKey(base)) {
          base = cityToday;
          day = await fetchDayTimes(lat, lon, methodId, base);
          if (stale()) return;
        }
      }
      setTz(zone);
      setTimes(day.timings);
      setLoadedKey(dateKey(base));
      rows = [{ date: addDays(base, 0), timings: day.timings }];
      setWeekly([...rows]);
    } catch (e) {
      if (stale()) return;
      setError(e.message || 'تعذّر جلب المواقيت');
      setLoading(false);
      return;
    }
    setLoading(false);
    // الغد أولاً (لعدّ فجر الغد بعد العشاء) ثم بقية الأسبوع في الخلفية
    setWeekLoad(true);
    for (let i = 1; i < 7; i++) {
      const dp = addDays(base, i);
      try {
        const dd = await fetchDayTimes(lat, lon, methodId, dp);
        if (stale()) return;
        if (i === 1) setTomorrowTimes(dd.timings);
        rows.push({ date: dp, timings: dd.timings });
        setWeekly([...rows]);
      } catch {
        if (stale()) return;
      }
    }
    setWeekLoad(false);
  }, []);

  // Auto-load saved location
  useEffect(() => {
    if (coords) loadTimes(coords.lat, coords.lon, method);
  }, []); // eslint-disable-line

  // تجاوز منتصف الليل (الصفحة مفتوحة) — إعادة جلب مواعيد اليوم الجديد
  useEffect(() => {
    if (coords && loadedKey && todayKey !== loadedKey) {
      setTomorrowTimes(null);
      setShowDay('today');
      loadTimes(coords.lat, coords.lon, method);
    }
  }, [todayKey]); // eslint-disable-line

  function toggleAlarm(prayerKey) {
    setAlarms(prev => {
      const next = { ...prev, [prayerKey]: !prev[prayerKey] };
      try { localStorage.setItem('nq_pray_alarms', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function requestNotifPermission() {
    if (typeof Notification === 'undefined') return;
    try {
      const perm = await Notification.requestPermission();
      setNotifPerm(perm);
    } catch {}
  }

  // فحص المنبّهات عند بداية كل دقيقة (بتوقيت المدينة)
  useEffect(() => {
    if (!times || notifPerm !== 'granted') return;
    PRAYERS_INFO.forEach(p => {
      if (!alarms[p.key] || !times[p.key]) return;
      const { h, m } = parseHM(times[p.key]);
      const id = `${todayKey}-${p.key}`;
      if (h === cn.h && m === cn.mi && !firedRef.current.has(id)) {
        firedRef.current.add(id);
        const pName = trNow(p.name);
        const where = city === 'موقعك' ? trNow('موقعك') : city;
        showPrayerNotification(trNow('حان وقت صلاة {p}', { p: pName }), {
          body: where ? trNow('حان الآن موعد صلاة {p} في {city}', { p: pName, city: where }) : trNow('حان الآن موعد صلاة {p}', { p: pName }),
          icon: '/icons/icon-192.png',
          tag: id,
        });
      }
    });
  }, [minuteKey, times, alarms, notifPerm]); // eslint-disable-line

  async function handleSearch() {
    if (!cityInput.trim()) return;
    runRef.current++; // أوقف أي تحميل سابق
    setLoading(true); setError(''); setTimes(null); setTomorrowTimes(null); setWeekly([]); setWeekLoad(false); setShowDay('today');
    try {
      const geo = await geocodeCity(cityInput.trim());
      const newCoords = { lat: geo.lat, lon: geo.lon };
      setCoords(newCoords);
      setCity(geo.displayName);
      localStorage.setItem('nq_pray_city', geo.displayName);
      localStorage.setItem('nq_pray_lat', geo.lat);
      localStorage.setItem('nq_pray_lon', geo.lon);
      setCityInput('');
      await loadTimes(geo.lat, geo.lon, method);
    } catch (e) {
      setError(e.message || 'لم نجد هذه المدينة');
      setLoading(false);
    }
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('متصفحك لا يدعم تحديد الموقع'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const newCoords = { lat, lon };
        runRef.current++;
        setTimes(null); setTomorrowTimes(null); setWeekly([]); setWeekLoad(false); setShowDay('today');
        setCoords(newCoords);
        localStorage.setItem('nq_pray_lat', lat);
        localStorage.setItem('nq_pray_lon', lon);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=${getLang()}`);
          if (r.ok) {
            const d = await r.json();
            const name = d.address?.city || d.address?.town || d.address?.village || 'موقعك';
            setCity(name); localStorage.setItem('nq_pray_city', name);
          } else {
            setCity('موقعك'); localStorage.setItem('nq_pray_city', 'موقعك');
          }
        } catch {}
        await loadTimes(lat, lon, method);
      },
      err => {
        const msg =
          err?.code === 1 ? 'رُفض إذن الموقع. اسمح بالوصول إلى الموقع من إعدادات المتصفح أو اكتب اسم مدينتك' :
          err?.code === 2 ? 'تعذّر تحديد موقعك حالياً. تأكّد من تشغيل خدمة الموقع أو اكتب اسم مدينتك' :
          err?.code === 3 ? 'انتهت مهلة تحديد الموقع. حاول مرة أخرى أو اكتب اسم مدينتك' :
                            'تعذّر تحديد الموقع، اكتب اسم مدينتك';
        setError(msg); setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
    );
  }

  function handleMethodChange(newMethod) {
    setMethod(newMethod);
    try { localStorage.setItem('nq_pray_method_v2', newMethod); } catch {}
    if (coords) { setTimes(null); setTomorrowTimes(null); setWeekly([]); setShowDay('today'); loadTimes(coords.lat, coords.lon, newMethod); }
  }

  function goToCity() {
    settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => cityRef.current?.focus({ preventScroll: true }), 350);
  }

  const next = times ? getNextPrayer(times, tomorrowTimes, cn) : null;
  const nextInfo = next ? PRAYERS_INFO.find(x => x.key === next.key) : null;
  const suggested = suggestMethod(tz || undefined);
  const mName = m => (m ? (tr.lang === 'ar' ? m.name : tr(m.tkey || m.name)) : '');
  const methodName = mName(METHODS.find(m => m.id === method));
  const cityName = city === 'موقعك' ? tr('موقعك') : city; // the GPS fallback is stored in Arabic
  const hijri = fmtHijri(hijriData, tr.lang);
  const notifSupported = notifPerm !== 'unsupported';
  const anyAlarm = PRAYERS_INFO.some(p => alarms[p.key]);
  const nowSecs = cn.h * 3600 + cn.mi * 60 + cn.s;
  const nowMins = cn.h * 60 + cn.mi + cn.s / 60;
  const qibla = coords ? calcQibla(coords.lat, coords.lon) : null;
  const dist = coords ? calcDistance(coords.lat, coords.lon) : null;
  const viewTomorrow = showDay === 'tomorrow' && tomorrowTimes;
  const shown = viewTomorrow ? tomorrowTimes : times;
  const dateLine = fmtDateLine(cn, tr.lang);
  const nowClock = fmt12s(`${cn.h}:${cn.mi}`);

  const settings = (
    <section ref={settingsRef} id="pt-settings" className={styles.sec} aria-labelledby="pt-settings-h">
      <div className={styles.secHead}>
        <span className="nq-eyebrow">{tr('الإعدادات')}</span>
        <h2 id="pt-settings-h" className="nq-h-sec">{tr('المدينة وطريقة الحساب')}</h2>
      </div>
      <div className={`nq-card ${styles.settings}`}>
        <div className={styles.setRow}>
          <span className={styles.setLbl}><Icon name="pin" />{tr('المدينة')}</span>
          <div className={styles.setCtl}>
            <div className={styles.cityRow}>
              <label className={`nq-input ${styles.cityInput}`}>
                <Icon name="search" />
                <span className="nq-sr">{tr('اسم المدينة')}</span>
                <input
                  ref={cityRef}
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={city ? tr('المدينة الحالية: {city}', { city: cityName }) : tr('اكتب اسم مدينتك: القاهرة، الرياض، دبي…')}
                  dir={tr.dir}
                  enterKeyHint="search"
                />
              </label>
              <button type="button" className="nq-btn gold" onClick={handleSearch} disabled={loading || !cityInput.trim()}>
                {loading && cityInput.trim() ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name="search" />}
                {tr('بحث')}
              </button>
            </div>
            <button type="button" className="nq-btn ghost sm" onClick={handleGPS} disabled={loading}>
              <Icon name="compass" />{tr('استخدم موقعي الحالي')}
            </button>
          </div>
        </div>

        <div className={styles.setRow}>
          <label className={styles.setLbl} htmlFor="pt-method"><Icon name="gear" />{tr('طريقة الحساب')}</label>
          <div className={styles.setCtl}>
            <div className={styles.selectWrap}>
              <select id="pt-method" className={styles.select} value={method} onChange={e => handleMethodChange(e.target.value)}>
                {METHODS.map(m => <option key={m.id} value={m.id}>{mName(m)}</option>)}
              </select>
              <Icon name="chev" />
            </div>
            {method !== suggested && (
              <p className={styles.hint}>
                {tr('الطريقة المعتمدة في منطقتك:')}{' '}
                <button type="button" className={styles.linkBtn} onClick={() => handleMethodChange(suggested)}>
                  {mName(METHODS.find(m => m.id === suggested)) || suggested}
                </button>
              </p>
            )}
          </div>
        </div>

        <div className={styles.setRow}>
          <span className={styles.setLbl}><Icon name="bell" />{tr('تنبيه الأذان')}</span>
          <div className={styles.setCtl}>
            <div className={styles.pills}>
              {FIVE.map(p => (
                <button key={p.key} type="button" className={`nq-pill ${styles.pillBtn} ${alarms[p.key] ? 'on' : ''}`}
                  aria-pressed={!!alarms[p.key]} onClick={() => toggleAlarm(p.key)}
                  aria-label={tr('تنبيه أذان {p}', { p: tr(p.name) })}>
                  {alarms[p.key] && <Icon name="check" />}{tr(p.name)}
                </button>
              ))}
            </div>
            {NATIVE && (
              <Suspense fallback={null}>
                <NativeAdhanSettings alarms={alarms} onToggle={toggleAlarm} coords={coords} method={method} tz={tz} city={city} />
              </Suspense>
            )}
            {!NATIVE && notifSupported && notifPerm === 'default' && (
              <div className={styles.notice}>
                <Icon name="bell" />
                <span>{tr('فعّل الإشعارات ليصلك تنبيه عند دخول وقت الصلاة التي فعّلت أذانها (أثناء فتح هذه الصفحة).')}</span>
                <button type="button" className="nq-btn gold sm" onClick={requestNotifPermission}>{tr('تفعيل الإشعارات')}</button>
              </div>
            )}
            {!NATIVE && notifSupported && notifPerm === 'denied' && (
              <div className={`${styles.notice} ${styles.noticeWarn}`}>
                <Icon name="bell" /><span>{tr('الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ليعمل التنبيه.')}</span>
              </div>
            )}
            {!NATIVE && notifSupported && notifPerm === 'granted' && (
              <p className={styles.hint}><Icon name="check" /> {anyAlarm ? tr('الإشعارات مفعّلة.') : tr('الإشعارات مفعّلة، اختر الصلوات التي تريد التنبيه لها.')}</p>
            )}
            {!NATIVE && !notifSupported && anyAlarm && (
              <div className={`${styles.notice} ${styles.noticeWarn}`}>
                <Icon name="bell" /><span>{tr('هذا المتصفح لا يدعم الإشعارات، لذلك لن يعمل التنبيه.')}</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.setRow}>
          <span className={styles.setLbl}><Icon name="calendar" />{tr('التاريخ')}</span>
          <div className={`${styles.setCtl} ${styles.pills}`}>
            <span className="nq-pill">{dateLine}</span>
            {hijri && <span className="nq-pill on">{hijri}</span>}
            {tz && tz !== DEVICE_TZ && <span className="nq-pill"><Icon name="timer" />{tr('بتوقيت المدينة:')} <bdi dir="ltr">{tz}</bdi></span>}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={city ? `${cityName} · ${methodName}` : methodName}
        title={tr('مواقيت الصلاة')}
        ayah="إِنَّ ٱلصَّلَوٰةَ كَانَتْ عَلَى ٱلْمُؤْمِنِينَ كِتَٰبًا مَّوْقُوتًا"
        ayahRef={heroRef('سورة النساء · ١٠٣', 4, 103, tr.lang)}
        sub={`${dateLine}${hijri ? ` · ${hijri}` : ''}`}
      >
        <button type="button" className="nq-btn ghost sm" onClick={goToCity}><Icon name="pin" />{city ? tr('تغيير المدينة') : tr('اختر مدينتك')}</button>
        <button type="button" className="nq-btn ghost sm" onClick={handleGPS} disabled={loading}><Icon name="compass" />{tr('موقعي الحالي')}</button>
      </PageHero>

      <div className={`nq-wrap ${styles.wrap}`}>
        {error && <div className={styles.error} role="alert"><Icon name="x" />{tr(error)}</div>}

        {loading && !times && (
          <div className={`nq-card ${styles.state}`} role="status">
            <span className={styles.spinnerLg} aria-hidden="true" />
            <p>{tr('جارٍ جلب مواقيت الصلاة…')}</p>
          </div>
        )}

        {!times && !loading && (
          <div className={`nq-card ${styles.state}`}>
            <Pattern />
            <Badge8 icon="mosque" size={72} />
            <h2 className={styles.stateTitle}>{tr('اختر مدينتك لعرض المواقيت')}</h2>
            <p className={styles.stateSub}>{tr('اكتب اسم مدينتك أو استخدم موقعك الحالي، وسنعرض مواقيت اليوم والأسبوع بطريقة الحساب المعتمدة في بلدك.')}</p>
            <div className={styles.stateActs}>
              <button type="button" className="nq-btn gold" onClick={goToCity}><Icon name="search" />{tr('ابحث عن مدينتك')}</button>
              <button type="button" className="nq-btn ghost" onClick={handleGPS}><Icon name="compass" />{tr('استخدم موقعي')}</button>
            </div>
          </div>
        )}

        {!times && settings}

        {times && next && nextInfo && (
          <section className={styles.pgrid} aria-label={tr('الصلاة القادمة والقبلة')}>
            <div className={`nq-card ${styles.nextp}`}>
              <Pattern />
              <span className="nq-eyebrow">{next.tomorrow ? tr('الصلاة القادمة · غداً') : tr('الصلاة القادمة')}</span>
              <div className={styles.nextRow}>
                <div>
                  <div className={styles.big}>{tr(nextInfo.name)}</div>
                  <div className={styles.nextAt}>{tr('عند {t}', { t: fmt12s(next.time) })}</div>
                </div>
                <div className={styles.cdBox}>
                  <small>{tr('بعد')}</small>
                  <div className={`${styles.cd} nq-num`} role="timer" aria-live="off" aria-label={tr('بعد {left}', { left: fmtLeft(next.secsLeft) || '' })}>{fmtClock(next.secsLeft)}</div>
                </div>
              </div>
              <SunArc times={times} nowMins={nowMins} />
              <div className={styles.nextFoot}>
                <span className="nq-pill"><Icon name="timer" />{tr('الآن')} {nowClock}</span>
                <span className="nq-pill"><Icon name="sun" />{tr('الشروق')} {fmt12s(times.Sunrise)}</span>
                {hijri && <span className="nq-pill on"><Icon name="moon" />{hijri}</span>}
              </div>
            </div>

            <Link to="/qibla" className={`nq-card ${styles.qibla}`} aria-label={qibla != null ? tr('اتجاه القبلة {deg} درجة من الشمال — افتح البوصلة', { deg: toAr(Math.round(qibla)) }) : tr('اتجاه القبلة — افتح البوصلة')}>
              <span className="nq-eyebrow">{tr('اتجاه القبلة')}</span>
              <QiblaRose bearing={qibla} className={styles.rose} />
              {qibla != null && (
                <div>
                  <b className={styles.qDeg}>{tr('{deg}° من الشمال', { deg: toAr(Math.round(qibla)) })}</b>
                  <p className={styles.qSub}>{tr('{km} كم إلى الكعبة المشرّفة · بالشمال الحقيقي', { km: fmtKm(dist) })}</p>
                </div>
              )}
              <span className={styles.qGo}>{tr('افتح البوصلة')} <Icon name="back" className={styles.flip} /></span>
            </Link>
          </section>
        )}

        {times && (
          <section className={styles.sec} aria-labelledby="pt-five-h">
            <div className={styles.fiveHead}>
              <div className={styles.secHeadStart}>
                <span className="nq-eyebrow">{viewTomorrow ? tr('مواقيت الغد') : tr('مواقيت اليوم')}</span>
                <h2 id="pt-five-h" className="nq-h-sec">{tr('الصلوات الخمس')}</h2>
              </div>
              <div className="nq-seg" role="group" aria-label={tr('اليوم أو الغد')}>
                <button type="button" aria-pressed={!viewTomorrow} onClick={() => setShowDay('today')}>{tr('اليوم')}</button>
                <button type="button" aria-pressed={!!viewTomorrow} onClick={() => setShowDay('tomorrow')} disabled={!tomorrowTimes}
                  title={!tomorrowTimes ? tr('جارٍ تحميل مواقيت الغد') : undefined}>{tr('غداً')}</button>
              </div>
            </div>
            <div className={styles.windows}>
              {FIVE.map(p => {
                const isNext = !viewTomorrow ? (p.key === next?.key && !next?.tomorrow) : (next?.tomorrow && p.key === 'Fajr');
                const past = !viewTomorrow && !isNext && toMins(shown[p.key]) * 60 <= nowSecs;
                const f = fmt12(shown[p.key]);
                const left = isNext ? fmtLeft(next.secsLeft) : null;
                return (
                  <div key={p.key} className={`${styles.win} ${isNext ? styles.now : ''} ${past ? styles.past : ''}`}>
                    <WinLine />
                    <Badge8 icon={p.icon} className={styles.wBadge} />
                    <span className={styles.wName}>{tr(p.name)}</span>
                    <span className={`${styles.wTime} nq-num`}>{f.t}{f.long && <small>{f.long}</small>}</span>
                    {isNext
                      ? <span className="nq-pill on">{left ? tr('بعد {left}', { left }) : tr('الصلاة القادمة')}</span>
                      : <span className={`nq-pill ${styles.wState}`}>{past ? tr('انقضى وقتها') : tr('لم يحن بعد')}</span>}
                    <span className={styles.adh}>
                      <span aria-hidden="true">{tr('الأذان')}</span>
                      <button type="button" role="switch" className={styles.tog} aria-checked={!!alarms[p.key]}
                        aria-label={tr('تنبيه أذان {p}', { p: tr(p.name) })}
                        onClick={() => toggleAlarm(p.key)} />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {times && settings}

        {(weekly.length > 0 || weekLoad) && (
          <section className={styles.sec} aria-labelledby="pt-week-h">
            <div className={styles.secHead}>
              <span className="nq-eyebrow">{tr('الأيام السبعة القادمة')}</span>
              <h2 id="pt-week-h" className="nq-h-sec">{tr('مواقيت الأسبوع')}</h2>
            </div>
            <div className={`nq-card ${styles.week}`}>
              <div className={styles.weekScroll}>
                <table className={styles.weekTable}>
                  <thead>
                    <tr>
                      <th scope="col">{tr('اليوم')}</th>
                      {PRAYERS_INFO.map(p => <th key={p.key} scope="col">{tr(p.name)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {weekly.map((day, i) => (
                      <tr key={i} className={i === 0 ? styles.today : i === 1 ? styles.tomorrow : ''}>
                        <th scope="row">
                          <span className={styles.wDay}>{i === 0 ? tr('اليوم') : i === 1 ? tr('غداً') : dayName(day.date.dow, tr.lang)}</span>
                          <span className={styles.wDate}>{i < 2 ? `${dayName(day.date.dow, tr.lang)} ` : ''}{toAr(`${day.date.d}/${day.date.mo}`)}</span>
                        </th>
                        {PRAYERS_INFO.map(p => (
                          <td key={p.key} className="nq-num">{fmt24(day.timings[p.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {weekLoad && <p className={styles.weekLoad} role="status"><span className={styles.spinner} aria-hidden="true" />{tr('جارٍ تحميل بقية الأسبوع…')}</p>}
            </div>
          </section>
        )}

        {times && (
          <section className={styles.sec} aria-labelledby="pt-dua-h">
            <div className={styles.secHead}>
              <span className="nq-eyebrow">{tr('من السنّة')}</span>
              <h2 id="pt-dua-h" className="nq-h-sec">{tr('أدعية بعد الأذان')}</h2>
            </div>
            <div className={styles.duas}>
              {[
                { name: 'الدعاء بعد الأذان', ar: 'اللهمّ ربَّ هذه الدعوةِ التامّة والصلاةِ القائمة، آتِ محمداً الوسيلةَ والفضيلة، وابعثه مقاماً محموداً الذي وعدته', src: 'رواه البخاري' },
                { name: 'الصلاة على النبي ﷺ', ar: 'اللهمّ صلِّ وسلِّم وبارك على سيدنا محمد وعلى آل سيدنا محمد', src: 'يُستحب بعد الأذان · رواه مسلم' },
              ].map((d, i) => (
                <figure key={i} className={`nq-card ${styles.dua}`}>
                  <Corners />
                  <figcaption className={styles.duaName}>{tr(d.name)}</figcaption>
                  <blockquote className={styles.duaAr} lang="ar" dir="rtl">{d.ar}</blockquote>
                  {/* the du'a stays in Arabic; its meaning is shown under it in other languages */}
                  {tr.lang !== 'ar' && tr(d.ar) !== d.ar && <p className={styles.duaMean}>{tr(d.ar)}</p>}
                  <p className={styles.duaSrc}>{tr(d.src)}</p>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

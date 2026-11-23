// ─── Prayer times ────────────────────────────────────────────────────────────
// Mihrab hero → next prayer with the sun's path + qibla card → the five prayers
// as mihrab windows (each with its adhan alarm) → settings → the week ahead.
// Times come from api.aladhan.com in the city's own time zone.
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './PrayerTimesPage.module.css';
import { PageHero, Icon, Badge8, Pattern, Corners, toAr } from '../components/ornaments/Ornaments';
import QiblaRose, { calcQibla, calcDistance, fmtKm } from './qibla/QiblaRose';

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
  { id: '21', name: 'المغرب' },
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

// ١٢ ساعة: { t: '٥:٠١', ap: 'ص' | 'م' }
function fmt12(t) {
  if (!t) return { t: '--:--', ap: '' };
  const { h, m } = parseHM(t);
  return { t: toAr(`${h % 12 || 12}:${String(m).padStart(2, '0')}`), ap: h < 12 ? 'ص' : 'م' };
}
const fmt12s = t => { const f = fmt12(t); return `${f.t} ${f.ap}`; };

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
  if (diff < 60) return `${toAr(diff)} دقيقة`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return `${toAr(h)} س ${m ? toAr(m) + ' د' : ''}`.trim();
}

function fmtClock(secs) {
  const s = Math.max(0, Math.floor(secs));
  const p = n => String(n).padStart(2, '0');
  return toAr(`${p(Math.floor(s / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}`);
}

async function geocodeCity(name) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1&accept-language=ar`;
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

// ── sun path: sunrise (right) → maghrib (left), the sun at the city's "now" ──
function SunArc({ times, nowMins }) {
  const sr = toMins(times.Sunrise), mg = toMins(times.Maghrib);
  const cx = 320, cy = 215, rx = 250, ry = 170;
  const span = Math.max(1, mg - sr);
  const pos = m => {
    const th = Math.PI * Math.min(1, Math.max(0, (m - sr) / span));
    return [cx + rx * Math.cos(th), cy - ry * Math.sin(th)];
  };
  const day = nowMins > sr && nowMins < mg;
  const sun = day ? pos(nowMins) : null;
  const marks = ['Sunrise', 'Dhuhr', 'Asr', 'Maghrib'].map(k => ({ k, p: pos(toMins(times[k])), info: PRAYERS_INFO.find(x => x.key === k) }));
  return (
    <svg className={styles.arc} viewBox="0 0 640 292" role="img"
      aria-label={`مسار الشمس اليوم: الشروق ${fmt12s(times.Sunrise)} والمغرب ${fmt12s(times.Maghrib)}`}>
      <line x1="20" y1={cy} x2="620" y2={cy} style={{ stroke: 'var(--line2)' }} strokeDasharray="4 6" />
      <path d={`M${cx + rx} ${cy} A${rx} ${ry} 0 0 0 ${cx - rx} ${cy}`} fill="none" style={{ stroke: 'var(--line2)' }} strokeWidth="1.4" strokeDasharray="2 5" />
      {sun && (
        <path d={`M${cx + rx} ${cy} A${rx} ${ry} 0 0 0 ${sun[0].toFixed(1)} ${sun[1].toFixed(1)}`} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth="2" />
      )}
      {!sun && nowMins >= mg && (
        <path d={`M${cx + rx} ${cy} A${rx} ${ry} 0 0 0 ${cx - rx} ${cy}`} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth="1.6" strokeOpacity=".7" />
      )}
      {sun && (
        <g>
          <circle cx={sun[0].toFixed(1)} cy={sun[1].toFixed(1)} r="20" style={{ fill: 'var(--glow)' }} />
          <circle cx={sun[0].toFixed(1)} cy={sun[1].toFixed(1)} r="9" style={{ fill: 'var(--gold2)', stroke: 'var(--surface)' }} strokeWidth="2" />
        </g>
      )}
      {marks.map(({ k, p, info }) => {
        // the two ends sit on the horizon: put their labels outside the arc
        const dx = k === 'Sunrise' ? 34 : k === 'Maghrib' ? -34 : 0;
        const end = dx !== 0;
        return (
          <g key={k}>
            <circle cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="5" style={{ fill: 'var(--surface)', stroke: 'var(--gold)' }} strokeWidth="1.6" />
            <text className={styles.arcLbl} x={(p[0] + dx).toFixed(1)} y={(p[1] - (end ? 10 : 14)).toFixed(1)} textAnchor="middle">{info.name}</text>
            <text className={styles.arcTm} x={(p[0] + dx).toFixed(1)} y={(p[1] + (end ? 22 : 26)).toFixed(1)} textAnchor="middle">{fmt12s(times[k])}</text>
          </g>
        );
      })}
      <circle cx="600" cy="258" r="4" style={{ fill: 'var(--muted)' }} />
      <text className={styles.arcTm} x="600" y="282" textAnchor="middle">الفجر {fmt12s(times.Fajr)}</text>
      <circle cx="40" cy="258" r="4" style={{ fill: 'var(--muted)' }} />
      <text className={styles.arcTm} x="40" y="282" textAnchor="middle">العشاء {fmt12s(times.Isha)}</text>
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
  const [hijri,   setHijri]   = useState('');
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
      .then(d => { const h = d.data?.hijri; if (h && !cancelled) setHijri(`${toAr(h.day)} ${h.month.ar} ${toAr(h.year)} هـ`); })
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
        showPrayerNotification(`حان وقت صلاة ${p.name}`, {
          body: `حان الآن موعد صلاة ${p.name}${city ? ` في ${city}` : ''}`,
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
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ar`);
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
  const methodName = METHODS.find(m => m.id === method)?.name || '';
  const notifSupported = notifPerm !== 'unsupported';
  const anyAlarm = PRAYERS_INFO.some(p => alarms[p.key]);
  const nowSecs = cn.h * 3600 + cn.mi * 60 + cn.s;
  const nowMins = cn.h * 60 + cn.mi + cn.s / 60;
  const qibla = coords ? calcQibla(coords.lat, coords.lon) : null;
  const dist = coords ? calcDistance(coords.lat, coords.lon) : null;
  const viewTomorrow = showDay === 'tomorrow' && tomorrowTimes;
  const shown = viewTomorrow ? tomorrowTimes : times;
  const dateLine = `${DAYS_AR[cn.dow]} ${toAr(cn.d)} ${MONTHS_AR[cn.mo - 1]} ${toAr(cn.y)}`;
  const nowClock = fmt12s(`${cn.h}:${cn.mi}`);

  const settings = (
    <section ref={settingsRef} id="pt-settings" className={styles.sec} aria-labelledby="pt-settings-h">
      <div className={styles.secHead}>
        <span className="nq-eyebrow">الإعدادات</span>
        <h2 id="pt-settings-h" className="nq-h-sec">المدينة وطريقة الحساب</h2>
      </div>
      <div className={`nq-card ${styles.settings}`}>
        <div className={styles.setRow}>
          <span className={styles.setLbl}><Icon name="pin" />المدينة</span>
          <div className={styles.setCtl}>
            <div className={styles.cityRow}>
              <label className={`nq-input ${styles.cityInput}`}>
                <Icon name="search" />
                <span className="nq-sr">اسم المدينة</span>
                <input
                  ref={cityRef}
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={city ? `المدينة الحالية: ${city}` : 'اكتب اسم مدينتك: القاهرة، الرياض، دبي…'}
                  dir="rtl"
                  enterKeyHint="search"
                />
              </label>
              <button type="button" className="nq-btn gold" onClick={handleSearch} disabled={loading || !cityInput.trim()}>
                {loading && cityInput.trim() ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name="search" />}
                بحث
              </button>
            </div>
            <button type="button" className="nq-btn ghost sm" onClick={handleGPS} disabled={loading}>
              <Icon name="compass" />استخدم موقعي الحالي
            </button>
          </div>
        </div>

        <div className={styles.setRow}>
          <label className={styles.setLbl} htmlFor="pt-method"><Icon name="gear" />طريقة الحساب</label>
          <div className={styles.setCtl}>
            <div className={styles.selectWrap}>
              <select id="pt-method" className={styles.select} value={method} onChange={e => handleMethodChange(e.target.value)}>
                {METHODS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Icon name="chev" />
            </div>
            {method !== suggested && (
              <p className={styles.hint}>
                الطريقة المعتمدة في منطقتك:{' '}
                <button type="button" className={styles.linkBtn} onClick={() => handleMethodChange(suggested)}>
                  {METHODS.find(m => m.id === suggested)?.name || suggested}
                </button>
              </p>
            )}
          </div>
        </div>

        <div className={styles.setRow}>
          <span className={styles.setLbl}><Icon name="bell" />تنبيه الأذان</span>
          <div className={styles.setCtl}>
            <div className={styles.pills}>
              {FIVE.map(p => (
                <button key={p.key} type="button" className={`nq-pill ${styles.pillBtn} ${alarms[p.key] ? 'on' : ''}`}
                  aria-pressed={!!alarms[p.key]} onClick={() => toggleAlarm(p.key)}
                  aria-label={`تنبيه أذان ${p.name}`}>
                  {alarms[p.key] && <Icon name="check" />}{p.name}
                </button>
              ))}
            </div>
            {notifSupported && notifPerm === 'default' && (
              <div className={styles.notice}>
                <Icon name="bell" />
                <span>فعّل الإشعارات ليصلك تنبيه عند دخول وقت الصلاة التي فعّلت أذانها (أثناء فتح هذه الصفحة).</span>
                <button type="button" className="nq-btn gold sm" onClick={requestNotifPermission}>تفعيل الإشعارات</button>
              </div>
            )}
            {notifSupported && notifPerm === 'denied' && (
              <div className={`${styles.notice} ${styles.noticeWarn}`}>
                <Icon name="bell" /><span>الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ليعمل التنبيه.</span>
              </div>
            )}
            {notifSupported && notifPerm === 'granted' && (
              <p className={styles.hint}><Icon name="check" /> الإشعارات مفعّلة{anyAlarm ? '' : '، اختر الصلوات التي تريد التنبيه لها'}.</p>
            )}
            {!notifSupported && anyAlarm && (
              <div className={`${styles.notice} ${styles.noticeWarn}`}>
                <Icon name="bell" /><span>هذا المتصفح لا يدعم الإشعارات، لذلك لن يعمل التنبيه.</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.setRow}>
          <span className={styles.setLbl}><Icon name="calendar" />التاريخ</span>
          <div className={`${styles.setCtl} ${styles.pills}`}>
            <span className="nq-pill">{dateLine}</span>
            {hijri && <span className="nq-pill on">{hijri}</span>}
            {tz && tz !== DEVICE_TZ && <span className="nq-pill"><Icon name="timer" />بتوقيت المدينة: <bdi dir="ltr">{tz}</bdi></span>}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={city ? `${city} · ${methodName}` : methodName}
        title="مواقيت الصلاة"
        ayah="إِنَّ ٱلصَّلَوٰةَ كَانَتْ عَلَى ٱلْمُؤْمِنِينَ كِتَٰبًا مَّوْقُوتًا"
        ayahRef="سورة النساء · ١٠٣"
        sub={`${dateLine}${hijri ? ` · ${hijri}` : ''}`}
      >
        <button type="button" className="nq-btn ghost sm" onClick={goToCity}><Icon name="pin" />{city ? 'تغيير المدينة' : 'اختر مدينتك'}</button>
        <button type="button" className="nq-btn ghost sm" onClick={handleGPS} disabled={loading}><Icon name="compass" />موقعي الحالي</button>
      </PageHero>

      <div className={`nq-wrap ${styles.wrap}`}>
        {error && <div className={styles.error} role="alert"><Icon name="x" />{error}</div>}

        {loading && !times && (
          <div className={`nq-card ${styles.state}`} role="status">
            <span className={styles.spinnerLg} aria-hidden="true" />
            <p>جارٍ جلب مواقيت الصلاة…</p>
          </div>
        )}

        {!times && !loading && (
          <div className={`nq-card ${styles.state}`}>
            <Pattern />
            <Badge8 icon="mosque" size={72} />
            <h2 className={styles.stateTitle}>اختر مدينتك لعرض المواقيت</h2>
            <p className={styles.stateSub}>اكتب اسم مدينتك أو استخدم موقعك الحالي، وسنعرض مواقيت اليوم والأسبوع بطريقة الحساب المعتمدة في بلدك.</p>
            <div className={styles.stateActs}>
              <button type="button" className="nq-btn gold" onClick={goToCity}><Icon name="search" />ابحث عن مدينتك</button>
              <button type="button" className="nq-btn ghost" onClick={handleGPS}><Icon name="compass" />استخدم موقعي</button>
            </div>
          </div>
        )}

        {!times && settings}

        {times && next && nextInfo && (
          <section className={styles.pgrid} aria-label="الصلاة القادمة والقبلة">
            <div className={`nq-card ${styles.nextp}`}>
              <Pattern />
              <span className="nq-eyebrow">{next.tomorrow ? 'الصلاة القادمة · غداً' : 'الصلاة القادمة'}</span>
              <div className={styles.nextRow}>
                <div>
                  <div className={styles.big}>{nextInfo.name}</div>
                  <div className={styles.nextAt}>عند {fmt12s(next.time)}</div>
                </div>
                <div className={styles.cdBox}>
                  <small>بعد</small>
                  <div className={`${styles.cd} nq-num`} role="timer" aria-live="off" aria-label={`بعد ${fmtLeft(next.secsLeft) || ''}`}>{fmtClock(next.secsLeft)}</div>
                </div>
              </div>
              <SunArc times={times} nowMins={nowMins} />
              <div className={styles.nextFoot}>
                <span className="nq-pill"><Icon name="timer" />الآن {nowClock}</span>
                <span className="nq-pill"><Icon name="sun" />الشروق {fmt12s(times.Sunrise)}</span>
                {hijri && <span className="nq-pill on"><Icon name="moon" />{hijri}</span>}
              </div>
            </div>

            <Link to="/qibla" className={`nq-card ${styles.qibla}`} aria-label={`اتجاه القبلة ${qibla != null ? toAr(Math.round(qibla)) + ' درجة من الشمال' : ''} — افتح البوصلة`}>
              <span className="nq-eyebrow">اتجاه القبلة</span>
              <QiblaRose bearing={qibla} className={styles.rose} />
              {qibla != null && (
                <div>
                  <b className={styles.qDeg}>{toAr(Math.round(qibla))}° من الشمال</b>
                  <p className={styles.qSub}>{fmtKm(dist)} كم إلى الكعبة المشرّفة · بالشمال الحقيقي</p>
                </div>
              )}
              <span className={styles.qGo}>افتح البوصلة <Icon name="back" className={styles.flip} /></span>
            </Link>
          </section>
        )}

        {times && (
          <section className={styles.sec} aria-labelledby="pt-five-h">
            <div className={styles.fiveHead}>
              <div className={styles.secHeadStart}>
                <span className="nq-eyebrow">{viewTomorrow ? 'مواقيت الغد' : 'مواقيت اليوم'}</span>
                <h2 id="pt-five-h" className="nq-h-sec">الصلوات الخمس</h2>
              </div>
              <div className="nq-seg" role="group" aria-label="اليوم أو الغد">
                <button type="button" aria-pressed={!viewTomorrow} onClick={() => setShowDay('today')}>اليوم</button>
                <button type="button" aria-pressed={!!viewTomorrow} onClick={() => setShowDay('tomorrow')} disabled={!tomorrowTimes}
                  title={!tomorrowTimes ? 'جارٍ تحميل مواقيت الغد' : undefined}>غداً</button>
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
                    <span className={styles.wName}>{p.name}</span>
                    <span className={`${styles.wTime} nq-num`}>{f.t}<small>{f.ap === 'ص' ? 'صباحاً' : 'مساءً'}</small></span>
                    {isNext
                      ? <span className="nq-pill on">{left ? `بعد ${left}` : 'الصلاة القادمة'}</span>
                      : <span className={`nq-pill ${styles.wState}`}>{past ? 'انقضى وقتها' : 'لم يحن بعد'}</span>}
                    <span className={styles.adh}>
                      <span aria-hidden="true">الأذان</span>
                      <button type="button" role="switch" className={styles.tog} aria-checked={!!alarms[p.key]}
                        aria-label={`تنبيه أذان ${p.name}`}
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
              <span className="nq-eyebrow">الأيام السبعة القادمة</span>
              <h2 id="pt-week-h" className="nq-h-sec">مواقيت الأسبوع</h2>
            </div>
            <div className={`nq-card ${styles.week}`}>
              <div className={styles.weekScroll}>
                <table className={styles.weekTable}>
                  <thead>
                    <tr>
                      <th scope="col">اليوم</th>
                      {PRAYERS_INFO.map(p => <th key={p.key} scope="col">{p.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {weekly.map((day, i) => (
                      <tr key={i} className={i === 0 ? styles.today : i === 1 ? styles.tomorrow : ''}>
                        <th scope="row">
                          <span className={styles.wDay}>{i === 0 ? 'اليوم' : i === 1 ? 'غداً' : DAYS_AR[day.date.dow]}</span>
                          <span className={styles.wDate}>{i < 2 ? `${DAYS_AR[day.date.dow]} ` : ''}{toAr(`${day.date.d}/${day.date.mo}`)}</span>
                        </th>
                        {PRAYERS_INFO.map(p => (
                          <td key={p.key} className="nq-num">{fmt24(day.timings[p.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {weekLoad && <p className={styles.weekLoad} role="status"><span className={styles.spinner} aria-hidden="true" />جارٍ تحميل بقية الأسبوع…</p>}
            </div>
          </section>
        )}

        {times && (
          <section className={styles.sec} aria-labelledby="pt-dua-h">
            <div className={styles.secHead}>
              <span className="nq-eyebrow">من السنّة</span>
              <h2 id="pt-dua-h" className="nq-h-sec">أدعية بعد الأذان</h2>
            </div>
            <div className={styles.duas}>
              {[
                { name: 'الدعاء بعد الأذان', ar: 'اللهمّ ربَّ هذه الدعوةِ التامّة والصلاةِ القائمة، آتِ محمداً الوسيلةَ والفضيلة، وابعثه مقاماً محموداً الذي وعدته', src: 'رواه البخاري' },
                { name: 'الصلاة على النبي ﷺ', ar: 'اللهمّ صلِّ وسلِّم وبارك على سيدنا محمد وعلى آل سيدنا محمد', src: 'يُستحب بعد الأذان · رواه مسلم' },
              ].map((d, i) => (
                <figure key={i} className={`nq-card ${styles.dua}`}>
                  <Corners />
                  <figcaption className={styles.duaName}>{d.name}</figcaption>
                  <blockquote className={styles.duaAr}>{d.ar}</blockquote>
                  <p className={styles.duaSrc}>{d.src}</p>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

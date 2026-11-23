import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './PrayerTimesPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

const PRAYERS_INFO = [
  { key: 'Fajr',    name: 'الفجر',  icon: '🌙', color: '#6366f1' },
  { key: 'Sunrise', name: 'الشروق', icon: '🌅', color: '#f59e0b' },
  { key: 'Dhuhr',   name: 'الظهر',  icon: '☀️', color: '#c9a84c' },
  { key: 'Asr',     name: 'العصر',  icon: '🌤', color: '#10b981' },
  { key: 'Maghrib', name: 'المغرب', icon: '🌇', color: '#f97316' },
  { key: 'Isha',    name: 'العشاء', icon: '🌃', color: '#8b5cf6' },
];

// معرّفات طرق الحساب حسب api.aladhan.com
const METHODS = [
  { id: '5',  name: '🇪🇬 الهيئة المصرية العامة للمساحة' },
  { id: '4',  name: '🕌 جامعة أم القرى - السعودية' },
  { id: '3',  name: '🌍 رابطة العالم الإسلامي' },
  { id: '9',  name: '🇰🇼 الكويت' },
  { id: '10', name: '🇶🇦 قطر' },
  { id: '16', name: '🇦🇪 دبي - الإمارات' },
  { id: '8',  name: '🌊 منطقة الخليج' },
  { id: '13', name: '🇹🇷 رئاسة الشؤون الدينية تركيا' },
  { id: '2',  name: '🇺🇸 الجمعية الإسلامية أمريكا الشمالية' },
  { id: '12', name: '🇫🇷 الاتحاد الإسلامي فرنسا' },
  { id: '21', name: '🇲🇦 المغرب' },
  { id: '18', name: '🇹🇳 تونس' },
  { id: '19', name: '🇩🇿 الجزائر' },
  { id: '23', name: '🇯🇴 وزارة الأوقاف الأردنية' },
  { id: '1',  name: '🌐 جامعة العلوم الإسلامية كراتشي' },
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

function toAr(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
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
// بعد العشاء: العدّ التنازلي لفجر الغد.
function getNextPrayer(times, tomorrowTimes, cn) {
  const nowSecs = cn.h * 3600 + cn.mi * 60 + cn.s;
  for (const p of PRAYERS_INFO) {
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

async function geocodeCity(name) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1&accept-language=ar`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('تعذّر البحث عن المدينة — حاول مرة أخرى');
  const data = await res.json();
  if (!data.length) throw new Error('المدينة غير موجودة — جرب باللغة الإنجليزية');
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
  if (!res.ok) throw new Error('فشل جلب المواعيد');
  const json = await res.json();
  if (json.code !== 200) throw new Error('فشل جلب المواعيد');
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

export default function PrayerTimesPage() {
  const t = useT();
  const dir = useDir();
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
  const runRef   = useRef(0);          // معرّف آخر عملية تحميل — لتجاهل نتائج العمليات القديمة
  const firedRef = useRef(new Set());  // منبّهات أُطلقت بالفعل

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
      setError(e.message || 'خطأ في جلب المواعيد');
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
        showPrayerNotification(`حان وقت ${p.name} 🕌`, {
          body: `حان موعد صلاة ${p.name}`,
          icon: '/icons/icon-192.png',
          tag: id,
        });
      }
    });
  }, [minuteKey, times, alarms, notifPerm]); // eslint-disable-line

  async function handleSearch() {
    if (!cityInput.trim()) return;
    runRef.current++; // أوقف أي تحميل سابق
    setLoading(true); setError(''); setTimes(null); setTomorrowTimes(null); setWeekly([]); setWeekLoad(false);
    try {
      const geo = await geocodeCity(cityInput.trim());
      const newCoords = { lat: geo.lat, lon: geo.lon };
      setCoords(newCoords);
      setCity(geo.displayName);
      localStorage.setItem('nq_pray_city', geo.displayName);
      localStorage.setItem('nq_pray_lat', geo.lat);
      localStorage.setItem('nq_pray_lon', geo.lon);
      await loadTimes(geo.lat, geo.lon, method);
    } catch (e) {
      setError(e.message || 'لم يتم العثور على المدينة');
      setLoading(false);
    }
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('المتصفح لا يدعم GPS'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const newCoords = { lat, lon };
        runRef.current++;
        setTimes(null); setTomorrowTimes(null); setWeekly([]); setWeekLoad(false);
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
          err?.code === 1 ? 'رُفض إذن الموقع — اسمح بالوصول للموقع من إعدادات المتصفح أو اكتب اسم مدينتك' :
          err?.code === 2 ? 'تعذّر تحديد موقعك حالياً — تأكد من تشغيل GPS أو اكتب اسم مدينتك' :
          err?.code === 3 ? 'انتهت مهلة تحديد الموقع — حاول مرة أخرى أو اكتب اسم مدينتك' :
                            'تعذّر تحديد الموقع — اكتب اسم مدينتك';
        setError(msg); setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
    );
  }

  function handleMethodChange(newMethod) {
    setMethod(newMethod);
    try { localStorage.setItem('nq_pray_method_v2', newMethod); } catch {}
    if (coords) { setTimes(null); setTomorrowTimes(null); setWeekly([]); loadTimes(coords.lat, coords.lon, newMethod); }
  }

  const next = times ? getNextPrayer(times, tomorrowTimes, cn) : null;
  const nextPrayer = next?.key || null;
  const suggested = suggestMethod(tz || undefined);
  const notifSupported = notifPerm !== 'unsupported';
  const anyAlarm = PRAYERS_INFO.some(p => alarms[p.key]);
  const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>{t('back')}</Link>
        <h1 className={styles.pageTitle}>{t('prayerTimesTitle')}</h1>
        <LangSwitcher compact={true} />
      </div>

      <div className={styles.clockCard}>
        <div className={styles.clockTime}>
          {toAr(String(cn.h).padStart(2,'0'))}
          <span className={styles.clockColon}>:</span>
          {toAr(String(cn.mi).padStart(2,'0'))}
          <span className={styles.clockColon}>:</span>
          {toAr(String(cn.s).padStart(2,'0'))}
        </div>
        <div className={styles.clockDate}>{DAYS_AR[cn.dow]}، {toAr(cn.d)} {MONTHS_AR[cn.mo - 1]} {toAr(cn.y)}</div>
        {tz && tz !== DEVICE_TZ && <div className={styles.hijriDate}>🕓 بتوقيت المدينة ({tz})</div>}
        {hijri && <div className={styles.hijriDate}>{hijri}</div>}
        {city && <div className={styles.cityBadge}>📍 {city}</div>}
      </div>

      {times && next && (() => {
        const p = PRAYERS_INFO.find(x => x.key === nextPrayer);
        const left = fmtLeft(next.secsLeft);
        return (
          <div className={styles.nextBanner} style={{ '--accent': p.color }}>
            <div className={styles.nextIcon}>{p.icon}</div>
            <div className={styles.nextInfo}>
              <div className={styles.nextLabel}>{t('nextPrayer')}</div>
              <div className={styles.nextName}>{p.name}</div>
            </div>
            <div className={styles.nextTime}>
              <div className={styles.nextTimeVal}>{fmt24(next.time)}</div>
              {left && <div className={styles.nextLeft}>{t('after')} {left}</div>}
            </div>
          </div>
        );
      })()}

      <div className={styles.locationCard}>
        <div className={styles.cityRow}>
          <input
            className={styles.cityInput}
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="اكتب اسم مدينتك... القاهرة، الرياض، دبي..."
            dir="rtl"
          />
          <button className={styles.cityBtn} onClick={handleSearch} disabled={loading || !cityInput.trim()}>
            {loading ? <span className={styles.spin}>⟳</span> : '🔍'}
          </button>
        </div>
        <button className={styles.gpsBtn} onClick={handleGPS} disabled={loading}>
          📡 تحديد موقعي تلقائياً
        </button>
        <div className={styles.methodRow}>
          <label className={styles.methodLabel}>{t('calcMethod')}:</label>
          <select className={styles.methodSelect} value={method} onChange={e => handleMethodChange(e.target.value)}>
            {METHODS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {method !== suggested && (
          <div className={styles.methodHint}>
            💡 الطريقة المقترحة لمنطقتك: <button className={styles.methodHintBtn}
              onClick={() => handleMethodChange(suggested)}>
              {METHODS.find(m => m.id === suggested)?.name || suggested}
            </button>
          </div>
        )}
      </div>

      {error && <div className={styles.errorMsg}>⚠️ {error}</div>}

      {loading && !times && (
        <div className={styles.loadingState}><div className={styles.loadSpinner}/><p>{t('fetchingTimes')}</p></div>
      )}

      {!times && !loading && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🕌</div>
          <p>{t('enterCityFirst')}</p>
        </div>
      )}

      {times && (
        <div className={styles.prayersGrid}>
          {PRAYERS_INFO.map(p => {
            const isNext = p.key === nextPrayer && !next?.tomorrow;
            const left = isNext ? fmtLeft(next.secsLeft) : null;
            return (
              <div key={p.key} className={`${styles.prayerCard} ${isNext ? styles.prayerCardNext : ''}`}
                style={{ '--accent': p.color }}>
                {isNext && <div className={styles.prayerGlow} style={{ background: p.color }}/>}
                <div className={styles.prayerIcon}>{p.icon}</div>
                <div className={styles.prayerName}>{p.name}</div>
                <div className={styles.prayerTime}>{fmt24(times[p.key])}</div>
                {isNext && left && <div className={styles.prayerBadge}>{t('after')} {left}</div>}
                {p.key !== 'Sunrise' && (
                  <button
                    type="button"
                    className={`${styles.alarmBtn} ${alarms[p.key] ? styles.alarmOn : ''}`}
                    onClick={() => toggleAlarm(p.key)}
                    aria-pressed={!!alarms[p.key]}
                    aria-label={alarms[p.key] ? `إيقاف منبّه ${p.name}` : `تشغيل منبّه ${p.name}`}
                    title={alarms[p.key] ? 'المنبّه مفعّل' : 'تفعيل المنبّه'}
                  >
                    {alarms[p.key] ? '🔔' : '🔕'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notification permission */}
      {times && notifSupported && notifPerm === 'default' && (
        <div className={styles.notifBanner}>
          <span>🔔</span>
          <span>فعّل الإشعارات لتلقّي تنبيه عند دخول وقت الصلاة التي فعّلت جرسها (أثناء فتح هذه الصفحة)</span>
          <button className={styles.notifBtn} onClick={requestNotifPermission}>تفعيل</button>
        </div>
      )}
      {times && notifSupported && notifPerm === 'denied' && (
        <div className={styles.notifBanner}>
          <span>🔕</span>
          <span>الإشعارات محظورة لهذا الموقع — فعّلها من إعدادات المتصفح ليعمل المنبّه</span>
        </div>
      )}
      {times && !notifSupported && anyAlarm && (
        <div className={styles.notifBanner}>
          <span>🔕</span>
          <span>هذا المتصفح لا يدعم الإشعارات، لذلك لن يعمل المنبّه</span>
        </div>
      )}

      {(weekly.length > 0 || weekLoad) && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            📅 مواعيد الأسبوع
            {weekLoad && <span className={styles.spin} style={{ marginRight:8, fontSize:14, display:'inline-block' }}>⟳</span>}
          </h3>
          {weekly.length > 0 && (
            <div className={styles.weekTable}>
              <div className={styles.weekHeader}>
                <div className={styles.weekCell}>{t('today')}</div>
                {PRAYERS_INFO.map(p => <div key={p.key} className={styles.weekCell}>{p.name}</div>)}
              </div>
              {weekly.map((day, i) => (
                <div key={i} className={`${styles.weekRow} ${i === 0 ? styles.weekRowToday : ''}`}>
                  <div className={styles.weekCell}>
                    <div className={styles.weekDay}>{DAYS_AR[day.date.dow]}</div>
                    <div className={styles.weekDate}>{toAr(`${day.date.d}/${day.date.mo}`)}</div>
                  </div>
                  {PRAYERS_INFO.map(p => (
                    <div key={p.key} className={styles.weekCell}>
                      <span className={styles.weekTime}>{fmt24(day.timings[p.key])}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {times && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>🤲 أدعية بعد الأذان</h3>
          <div className={styles.dhikrList}>
            {[
              { name: 'دعاء بعد الأذان', ar: 'اللهم رب هذه الدعوة التامة والصلاة القائمة آتِ محمداً الوسيلة والفضيلة وابعثه مقاماً محموداً الذي وعدته' },
              { name: 'الصلاة على النبي ﷺ', ar: 'اللهم صلِّ وسلِّم وبارك على سيدنا محمد وعلى آل سيدنا محمد' },
            ].map((d, i) => (
              <div key={i} className={styles.dhikrItem}>
                <div className={styles.dhikrName}>{d.name}</div>
                <div className={styles.dhikrAr}>{d.ar}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

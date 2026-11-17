import { useState, useEffect, useCallback } from 'react';
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

const METHODS = [
  { id: '5',  name: '🇪🇬 الهيئة المصرية العامة للمساحة' },
  { id: '4',  name: '🕌 جامعة أم القرى - السعودية' },
  { id: '3',  name: '🌍 رابطة العالم الإسلامي' },
  { id: '8',  name: '🇰🇼 الكويت' },
  { id: '9',  name: '🇶🇦 قطر' },
  { id: '7',  name: '🌊 منطقة الخليج' },
  { id: '12', name: '🇹🇷 رئاسة الشؤون الدينية تركيا' },
  { id: '2',  name: '🇺🇸 الجمعية الإسلامية أمريكا الشمالية' },
  { id: '11', name: '🇫🇷 الاتحاد الإسلامي فرنسا' },
  { id: '20', name: '🇲🇦 المغرب' },
  { id: '17', name: '🇹🇳 تونس' },
  { id: '22', name: '🇵🇸 وزارة الأوقاف غزة' },
  { id: '1',  name: '🌐 جامعة العلوم الإسلامية كراتشي' },
];

// اقتراح طريقة حساب تلقائي حسب المنطقة الزمنية
function suggestMethod() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (tz.includes('Cairo') || tz.includes('Africa/Cairo'))          return '5';  // Egypt
  if (tz.includes('Riyadh') || tz.includes('Asia/Riyadh'))          return '4';  // Saudi
  if (tz.includes('Kuwait'))                                          return '8';  // Kuwait
  if (tz.includes('Qatar') || tz.includes('Asia/Qatar'))             return '9';  // Qatar
  if (tz.includes('Dubai') || tz.includes('Asia/Dubai'))             return '7';  // Gulf
  if (tz.includes('Istanbul') || tz.includes('Europe/Istanbul'))     return '12'; // Turkey
  if (tz.includes('Baghdad') || tz.includes('Asia/Baghdad'))         return '3';  // Iraq → MWL
  if (tz.includes('Amman') || tz.includes('Asia/Amman'))             return '3';  // Jordan → MWL
  if (tz.includes('Beirut') || tz.includes('Asia/Beirut'))           return '3';  // Lebanon → MWL
  if (tz.includes('Damascus') || tz.includes('Asia/Damascus'))       return '3';  // Syria → MWL
  if (tz.includes('Casablanca') || tz.includes('Africa/Casablanca')) return '20'; // Morocco
  if (tz.includes('Tunis') || tz.includes('Africa/Tunis'))           return '17'; // Tunisia
  if (tz.includes('Algiers') || tz.includes('Africa/Algiers'))       return '3';  // Algeria → MWL
  if (tz.includes('Gaza') || tz.includes('Asia/Gaza'))               return '22'; // Palestine
  if (tz.includes('Paris') || tz.includes('Europe/Paris'))           return '11'; // France
  if (tz.includes('London') || tz.includes('Europe/London'))         return '3';  // UK → MWL
  if (tz.includes('America/'))                                        return '2';  // Americas → ISNA
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

function getNextPrayer(times) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const p of PRAYERS_INFO) {
    if (!times[p.key]) continue;
    if (toMins(times[p.key]) > nowMins) return p.key;
  }
  return 'Fajr';
}

function getTimeLeft(t) {
  if (!t) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const diff = toMins(t) - nowMins;
  if (diff <= 0) return null;
  if (diff < 60) return `${toAr(diff)} دقيقة`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return `${toAr(h)} س ${m ? toAr(m) + ' د' : ''}`.trim();
}

async function geocodeCity(name) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1&accept-language=ar`;
  const res = await fetch(url, { headers: { 'User-Agent': 'NurAlQuran/1.0' } });
  const data = await res.json();
  if (!data.length) throw new Error('المدينة غير موجودة — جرب باللغة الإنجليزية');
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name?.split('،')[0]?.split(',')[0] || name,
  };
}

async function fetchDayTimes(lat, lon, method, dateObj) {
  const d = dateObj.getDate();
  const m = dateObj.getMonth() + 1;
  const y = dateObj.getFullYear();
  // بدون timezonestring — الـ API يحسب التوقيت المحلي تلقائياً من الإحداثيات
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${lat}&longitude=${lon}&method=${method}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.code !== 200) throw new Error('فشل جلب المواعيد');
  return json.data;
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
  const [method,  setMethod]  = useState(() => localStorage.getItem('nq_pray_method') || suggestMethod());
  const [times,   setTimes]   = useState(null);
  const [alarms,  setAlarms]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('nq_pray_alarms') || '{}'); } catch { return {}; }
  });
  const [notifPerm, setNotifPerm] = useState(() => 
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [weekly,  setWeekly]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [weekLoad,setWeekLoad]= useState(false);
  const [error,   setError]   = useState('');
  const [hijri,   setHijri]   = useState('');
  const [now,     setNow]     = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const today = new Date();
    fetch(`https://api.aladhan.com/v1/gToH?date=${today.getDate()}-${today.getMonth()+1}-${today.getFullYear()}`)
      .then(r => r.json())
      .then(d => { const h = d.data?.hijri; if (h) setHijri(`${toAr(h.day)} ${h.month.ar} ${toAr(h.year)} هـ`); })
      .catch(() => {});
  }, []);

  const loadTimes = useCallback(async (lat, lon, methodId) => {
    setLoading(true); setError('');
    try {
      const day = await fetchDayTimes(lat, lon, methodId, new Date());
      setTimes(day.timings);
    } catch (e) {
      setError(e.message || 'خطأ في جلب المواعيد');
    } finally {
      setLoading(false);
    }
    // weekly in background
    setWeekLoad(true);
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(new Date().getDate() + i);
      try {
        const dd = await fetchDayTimes(lat, lon, methodId, d);
        rows.push({ date: new Date(d), timings: dd.timings });
        setWeekly([...rows]);
      } catch {}
    }
    setWeekLoad(false);
  }, []);

  // Auto-load saved location
  useEffect(() => {
    if (coords) loadTimes(coords.lat, coords.lon, method);
  }, []); // eslint-disable-line

  function toggleAlarm(prayerKey) {
    setAlarms(prev => {
      const next = { ...prev, [prayerKey]: !prev[prayerKey] };
      localStorage.setItem('nq_pray_alarms', JSON.stringify(next));
      return next;
    });
  }

  async function requestNotifPermission() {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  }

  // Check and fire alarms every minute
  useEffect(() => {
    if (!times) return;
    const check = () => {
      const now = new Date();
      const hh = now.getHours(), mm = now.getMinutes();
      PRAYERS_INFO.forEach(p => {
        if (!alarms[p.key] || !times[p.key]) return;
        const { h, m } = parseHM(times[p.key]);
        if (h === hh && m === mm && notifPerm === 'granted') {
          new Notification(`حان وقت ${p.name} 🕌`, {
            body: `حان موعد صلاة ${p.name}`,
            icon: '/icons/icon-192.png',
          });
        }
      });
    };
    const t = setInterval(check, 60000);
    check();
    return () => clearInterval(t);
  }, [times, alarms, notifPerm]);

  async function handleSearch() {
    if (!cityInput.trim()) return;
    setLoading(true); setError(''); setTimes(null); setWeekly([]);
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
        setCoords(newCoords);
        localStorage.setItem('nq_pray_lat', lat);
        localStorage.setItem('nq_pray_lon', lon);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ar`, { headers: { 'User-Agent': 'NurAlQuran/1.0' } });
          const d = await r.json();
          const name = d.address?.city || d.address?.town || d.address?.village || 'موقعك';
          setCity(name); localStorage.setItem('nq_pray_city', name);
        } catch {}
        await loadTimes(lat, lon, method);
      },
      () => { setError('رُفض إذن الموقع — اكتب اسم مدينتك'); setLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleMethodChange(newMethod) {
    setMethod(newMethod);
    localStorage.setItem('nq_pray_method', newMethod);
    if (coords) { setTimes(null); setWeekly([]); loadTimes(coords.lat, coords.lon, newMethod); }
  }

  const nextPrayer = times ? getNextPrayer(times) : null;
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
          {toAr(String(now.getHours()).padStart(2,'0'))}
          <span className={styles.clockColon}>:</span>
          {toAr(String(now.getMinutes()).padStart(2,'0'))}
          <span className={styles.clockColon}>:</span>
          {toAr(String(now.getSeconds()).padStart(2,'0'))}
        </div>
        <div className={styles.clockDate}>{DAYS_AR[now.getDay()]}، {toAr(now.getDate())} {MONTHS_AR[now.getMonth()]} {toAr(now.getFullYear())}</div>
        {hijri && <div className={styles.hijriDate}>{hijri}</div>}
        {city && <div className={styles.cityBadge}>📍 {city}</div>}
      </div>

      {times && nextPrayer && (() => {
        const p = PRAYERS_INFO.find(x => x.key === nextPrayer);
        const left = getTimeLeft(times[nextPrayer]);
        return (
          <div className={styles.nextBanner} style={{ '--accent': p.color }}>
            <div className={styles.nextIcon}>{p.icon}</div>
            <div className={styles.nextInfo}>
              <div className={styles.nextLabel}>{t('nextPrayer')}</div>
              <div className={styles.nextName}>{p.name}</div>
            </div>
            <div className={styles.nextTime}>
              <div className={styles.nextTimeVal}>{fmt24(times[nextPrayer])}</div>
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
        {method !== suggestMethod() && (
          <div className={styles.methodHint}>
            💡 الطريقة المقترحة لمنطقتك: <button className={styles.methodHintBtn}
              onClick={() => handleMethodChange(suggestMethod())}>
              {METHODS.find(m => m.id === suggestMethod())?.name || suggestMethod()}
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
            const isNext = p.key === nextPrayer;
            const left = getTimeLeft(times[p.key]);
            return (
              <div key={p.key} className={`${styles.prayerCard} ${isNext ? styles.prayerCardNext : ''}`}
                style={{ '--accent': p.color }}>
                {isNext && <div className={styles.prayerGlow} style={{ background: p.color }}/>}
                <div className={styles.prayerIcon}>{p.icon}</div>
                <div className={styles.prayerName}>{p.name}</div>
                <div className={styles.prayerTime}>{fmt24(times[p.key])}</div>
                {isNext && left && <div className={styles.prayerBadge}>{t('after')} {left}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Notification permission */}
      {notifPerm !== 'granted' && times && (
        <div className={styles.notifBanner}>
          <span>🔔</span>
          <span>فعّل الإشعارات لتلقّي منبّه قبل كل صلاة</span>
          <button className={styles.notifBtn} onClick={requestNotifPermission}>تفعيل</button>
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
                    <div className={styles.weekDay}>{DAYS_AR[day.date.getDay()]}</div>
                    <div className={styles.weekDate}>{toAr(`${day.date.getDate()}/${day.date.getMonth()+1}`)}</div>
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
          <h3 className={styles.sectionTitle}>{t('morning')}</h3>
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

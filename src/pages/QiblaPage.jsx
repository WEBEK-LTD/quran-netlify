import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './QiblaPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

// الكعبة المشرفة
const KAABA = { lat: 21.4225, lon: 39.8262 };

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function calcQibla(lat, lon) {
  const φ1 = toRad(lat),   λ1 = toRad(lon);
  const φ2 = toRad(KAABA.lat), λ2 = toRad(KAABA.lon);
  const Δλ = λ2 - λ1;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function calcDistance(lat, lon) {
  const R = 6371;
  const φ1 = toRad(lat), φ2 = toRad(KAABA.lat);
  const Δφ = toRad(KAABA.lat - lat), Δλ = toRad(KAABA.lon - lon);
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function toArabicNums(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

export default function QiblaPage() {
  const t = useT();
  const dir = useDir();
  const [location,  setLocation]  = useState(null);
  const [heading,   setHeading]   = useState(null); // compass heading
  const [qibla,     setQibla]     = useState(null); // qibla direction (true north)
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [distance,  setDistance]  = useState(null);
  const [accuracy,  setAccuracy]  = useState(null);
  const [aligned,   setAligned]   = useState(false);
  const compassRef  = useRef(null);
  const needleRef   = useRef(null);
  const orientRef   = useRef(null);

  function requestLocation() {
    setLoading(true); setError('');
    if (!navigator.geolocation) {
      setError('متصفحك لا يدعم تحديد الموقع'); setLoading(false); return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
        setLocation({ lat, lon });
        setAccuracy(Math.round(acc));
        const q = calcQibla(lat, lon);
        const d = calcDistance(lat, lon);
        setQibla(q);
        setDistance(d);
        setLoading(false);
      },
      err => {
        setError('تعذّر تحديد موقعك — تأكد من تفعيل إذن الموقع');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Device orientation for compass
  useEffect(() => {
    function handleOrientation(e) {
      let h = null;
      if (e.webkitCompassHeading !== undefined) {
        h = e.webkitCompassHeading; // iOS
      } else if (e.alpha !== null) {
        h = (360 - e.alpha) % 360; // Android
      }
      if (h !== null) setHeading(h);
    }

    if (window.DeviceOrientationEvent) {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+
        orientRef.current = () => {
          DeviceOrientationEvent.requestPermission()
            .then(perm => {
              if (perm === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
              }
            }).catch(() => {});
        };
      } else {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    }
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  // Check alignment
  useEffect(() => {
    if (heading === null || qibla === null) return;
    const diff = Math.abs(((heading - qibla + 540) % 360) - 180);
    setAligned(diff < 5);
  }, [heading, qibla]);

  // Compass visual: needle points to qibla relative to device heading
  const needleRotation = heading !== null && qibla !== null
    ? (qibla - heading + 360) % 360
    : qibla ?? 0;

  const compassRotation = heading !== null ? -heading : 0;

  function handleRequestCompassPermission() {
    if (orientRef.current) orientRef.current();
    else setError('بوصلة الجهاز غير متاحة على هذا المتصفح');
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>{t('back')}</Link>
        <h1 className={styles.pageTitle}>{t('qiblaTitle')}</h1>
        <LangSwitcher compact={true} />
      </div>

      {/* Info card */}
      <div className={styles.infoCard}>
        <div className={styles.kaabaIcon}>🕋</div>
        <div>
          <div className={styles.infoTitle}>{t('qiblaTitle')}</div>
          <div className={styles.infoSub}>{t('qiblaDesc')}</div>
        </div>
        {distance && (
          <div className={styles.distanceBadge}>
            🗺 {toArabicNums(distance.toLocaleString())} كم
          </div>
        )}
      </div>

      {/* Compass */}
      <div className={styles.compassWrap}>
        <div
          className={`${styles.compass} ${aligned ? styles.compassAligned : ''}`}
          ref={compassRef}
          style={{ transform: `rotate(${compassRotation}deg)` }}
        >
          {/* Cardinal directions */}
          <div className={`${styles.cardinal} ${styles.cardinalN}`}>N</div>
          <div className={`${styles.cardinal} ${styles.cardinalS}`}>S</div>
          <div className={`${styles.cardinal} ${styles.cardinalE}`}>NE</div>
          <div className={`${styles.cardinal} ${styles.cardinalW}`}>W</div>

          {/* Degree marks */}
          {Array.from({ length: 36 }).map((_, i) => (
            <div key={i} className={`${styles.tick} ${i % 9 === 0 ? styles.tickMajor : ''}`}
              style={{ transform: `rotate(${i * 10}deg) translateY(-calc(50% - 10px))` }} />
          ))}

          {/* Qibla needle */}
          {qibla !== null && (
            <div
              className={`${styles.needle} ${aligned ? styles.needleAligned : ''}`}
              ref={needleRef}
              style={{ transform: `rotate(${needleRotation}deg)` }}
            >
              <div className={styles.needleHead}>🕋</div>
              <div className={styles.needleLine} />
              <div className={styles.needleTail} />
            </div>
          )}

          {/* Center dot */}
          <div className={styles.centerDot} />
        </div>

        {/* Alignment indicator */}
        {qibla !== null && (
          <div className={`${styles.alignBadge} ${aligned ? styles.alignBadgeOn : ''}`}>
            {aligned ? t('qiblaFacing') : `اتجه ${Math.round(needleRotation)}° نحو القبلة`}
          </div>
        )}
      </div>

      {/* Stats */}
      {qibla !== null && (
        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <div className={styles.statVal}>{Math.round(qibla)}°</div>
            <div className={styles.statLabel}>{t('qiblaTitle')}</div>
          </div>
          {heading !== null && (
            <div className={styles.statBox}>
              <div className={styles.statVal}>{Math.round(heading)}°</div>
              <div className={styles.statLabel}>{t('deviceDirection')}</div>
            </div>
          )}
          {accuracy !== null && (
            <div className={styles.statBox}>
              <div className={styles.statVal}>{toArabicNums(accuracy)}م</div>
              <div className={styles.statLabel}>{t('locationAccuracy')}</div>
            </div>
          )}
        </div>
      )}

      {/* Buttons */}
      <div className={styles.btnRow}>
        {!location ? (
          <button className={styles.mainBtn} onClick={requestLocation} disabled={loading}>
            {loading
              ? <><span className={styles.spin}>⟳</span> جاري التحديد...</>
              : '📡 تحديد موقعي'}
          </button>
        ) : (
          <button className={styles.secondaryBtn} onClick={requestLocation}>
            🔄 تحديث الموقع
          </button>
        )}
        <button className={styles.compassBtn} onClick={handleRequestCompassPermission}>
          🧭 تفعيل البوصلة
        </button>
      </div>

      {error && <div className={styles.errorMsg}>⚠️ {error}</div>}

      {/* Instructions */}
      <div className={styles.instructionCard}>
        <h3 className={styles.instrTitle}>{t('howToUse')}</h3>
        <div className={styles.instrList}>
          <div className={styles.instrStep}>
            <span className={styles.instrNum}>١</span>
            اضغط "تحديد موقعي" للحصول على موقعك الجغرافي
          </div>
          <div className={styles.instrStep}>
            <span className={styles.instrNum}>٢</span>
            اضغط "تفعيل البوصلة" للسماح بالوصول للبوصلة (خاصةً على iOS)
          </div>
          <div className={styles.instrStep}>
            <span className={styles.instrNum}>٣</span>
            أدر هاتفك حتى يشير السهم الذهبي 🕋 مباشرة للأمام
          </div>
          <div className={styles.instrStep}>
            <span className={styles.instrNum}>٤</span>
            عند مواجهة القبلة ستظهر رسالة خضراء تأكيداً ✅
          </div>
        </div>
      </div>

      {/* Dua */}
      <div className={styles.duaCard}>
        <div className={styles.duaText}>{t('qibla_dua')}</div>
      </div>
    </div>
  );
}

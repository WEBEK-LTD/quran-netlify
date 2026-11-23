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
  // idle | needs-permission | listening | active | unavailable | denied
  const [compassStatus, setCompassStatus] = useState('idle');
  const compassRef  = useRef(null);
  const needleRef   = useRef(null);
  const stopRef     = useRef(null);   // يزيل مستمعي الحساسات الحاليين
  const gotHeading  = useRef(false);

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
        setError(
          err?.code === 1 ? 'رُفض إذن الموقع — اسمح بالوصول للموقع من إعدادات المتصفح' :
          err?.code === 2 ? 'تعذّر تحديد موقعك حالياً — تأكد من تشغيل GPS' :
          err?.code === 3 ? 'انتهت مهلة تحديد الموقع — حاول مرة أخرى' :
                            'تعذّر تحديد موقعك — تأكد من تفعيل إذن الموقع'
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Device orientation for compass
  function screenAngle() {
    const a = (window.screen && window.screen.orientation && window.screen.orientation.angle);
    if (typeof a === 'number') return a;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  function startCompass() {
    if (stopRef.current) stopRef.current();
    gotHeading.current = false;
    setCompassStatus('listening');

    const useAbsoluteEvent = 'ondeviceorientationabsolute' in window;

    function handleOrientation(e) {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
        h = e.webkitCompassHeading + screenAngle();            // iOS: already true-ish north
      } else if (e.alpha != null && (e.absolute === true || e.type === 'deviceorientationabsolute')) {
        h = 360 - e.alpha + screenAngle();                     // Android / others: absolute alpha
      }
      // alpha نسبي (غير مرتبط بالشمال) لا يصلح كبوصلة — نتجاهله
      if (h === null) return;
      h = ((h % 360) + 360) % 360;
      gotHeading.current = true;
      setCompassStatus('active');
      setHeading(h);
    }

    const evName = useAbsoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, handleOrientation, true);
    const timer = setTimeout(() => {
      if (!gotHeading.current) setCompassStatus('unavailable');
    }, 3000);
    stopRef.current = () => {
      clearTimeout(timer);
      window.removeEventListener(evName, handleOrientation, true);
    };
  }

  const needsIOSPermission =
    typeof window !== 'undefined' && window.DeviceOrientationEvent &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function';

  useEffect(() => {
    if (!window.DeviceOrientationEvent) {
      setCompassStatus('unavailable');
    } else if (needsIOSPermission) {
      setCompassStatus('needs-permission'); // iOS 13+: يجب أن يضغط المستخدم الزر
    } else {
      startCompass();
    }
    return () => { if (stopRef.current) stopRef.current(); };
  }, []); // eslint-disable-line

  // Check alignment
  useEffect(() => {
    if (heading === null || qibla === null) return;
    const diff = Math.abs(((heading - qibla + 540) % 360) - 180);
    setAligned(diff < 5);
  }, [heading, qibla]);

  // The dial is rotated by -heading (north stays north on screen); the needle
  // lives inside the dial, so it only needs the qibla bearing from north.
  const needleRotation = qibla ?? 0;
  // زاوية القبلة بالنسبة لاتجاه الجهاز (لعرض النص فقط)
  const relativeQibla = heading !== null && qibla !== null
    ? (qibla - heading + 360) % 360
    : qibla ?? 0;

  const compassRotation = heading !== null ? -heading : 0;

  function handleRequestCompassPermission() {
    setError('');
    if (!window.DeviceOrientationEvent) { setCompassStatus('unavailable'); return; }
    if (needsIOSPermission) {
      window.DeviceOrientationEvent.requestPermission()
        .then(perm => {
          if (perm === 'granted') startCompass();
          else setCompassStatus('denied');
        })
        .catch(() => setCompassStatus('denied'));
      return;
    }
    startCompass();
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
          <div className={`${styles.cardinal} ${styles.cardinalE}`}>E</div>
          <div className={`${styles.cardinal} ${styles.cardinalS}`}>S</div>
          <div className={`${styles.cardinal} ${styles.cardinalW}`}>W</div>

          {/* Degree marks */}
          {Array.from({ length: 36 }).map((_, i) => (
            <div key={i} className={`${styles.tick} ${i % 9 === 0 ? styles.tickMajor : ''}`}
              style={{ transform: `rotate(${i * 10}deg)` }} />
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
            {aligned ? t('qiblaFacing') : `اتجه ${Math.round(relativeQibla)}° نحو القبلة`}
          </div>
        )}

        {/* Compass sensor status */}
        {compassStatus === 'unavailable' && (
          <div className={styles.sensorNote}>
            🧭 لا يوجد مستشعر بوصلة في هذا الجهاز/المتصفح — القرص ثابت والشمال للأعلى. استخدم زاوية القبلة{qibla !== null ? ` (${Math.round(qibla)}° من الشمال)` : ''} مع بوصلة حقيقية.
          </div>
        )}
        {compassStatus === 'denied' && (
          <div className={styles.sensorNote}>🧭 تم رفض إذن البوصلة — يمكنك السماح به من إعدادات المتصفح ثم الضغط على "تفعيل البوصلة".</div>
        )}
        {compassStatus === 'listening' && (
          <div className={styles.sensorNote}>🧭 جاري قراءة البوصلة… حرّك الهاتف على شكل رقم ٨ للمعايرة</div>
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
        {compassStatus !== 'active' && (
          <button className={styles.compassBtn} onClick={handleRequestCompassPermission}>
            🧭 تفعيل البوصلة
          </button>
        )}
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

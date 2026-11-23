// ─── Qibla ───────────────────────────────────────────────────────────────────
// A large compass rose (32-point star, Arabic cardinal letters, the Kaaba on
// the bearing, emerald needle). With a compass sensor the dial turns with the
// device; without one it stays north-up and the bearing is shown in degrees.
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './QiblaPage.module.css';
import { PageHero, Icon, Badge8, Corners, toAr } from '../components/ornaments/Ornaments';
import QiblaRose, { calcQibla, calcDistance, fmtKm } from './qibla/QiblaRose';
import { useTr, surahName } from '../l10n';

// المدينة المحفوظة في صفحة المواقيت — لعرض القبلة فوراً قبل طلب الموقع
function savedPlace() {
  try {
    const lat = parseFloat(localStorage.getItem('nq_pray_lat'));
    const lon = parseFloat(localStorage.getItem('nq_pray_lon'));
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon, name: localStorage.getItem('nq_pray_city') || '' };
  } catch { return null; }
}

const DUA = 'اللهمّ بلّغنا الكعبة المشرّفة، وارزقنا زيارة بيتك الحرام';

export default function QiblaPage() {
  const tr = useTr();
  const [saved] = useState(savedPlace);
  const [location,  setLocation]  = useState(null);   // من GPS
  const [heading,   setHeading]   = useState(null);   // compass heading
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [accuracy,  setAccuracy]  = useState(null);
  const [aligned,   setAligned]   = useState(false);
  // idle | needs-permission | listening | active | unavailable | denied
  const [compassStatus, setCompassStatus] = useState('idle');
  const stopRef     = useRef(null);   // يزيل مستمعي الحساسات الحاليين
  const gotHeading  = useRef(false);

  const place = location || saved;
  const qibla = place ? calcQibla(place.lat, place.lon) : null;          // من الشمال الحقيقي
  const distance = place ? calcDistance(place.lat, place.lon) : null;

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
        setLoading(false);
      },
      err => {
        setError(
          err?.code === 1 ? 'رُفض إذن الموقع. اسمح بالوصول إلى الموقع من إعدادات المتصفح' :
          err?.code === 2 ? 'تعذّر تحديد موقعك حالياً. تأكّد من تشغيل خدمة الموقع' :
          err?.code === 3 ? 'انتهت مهلة تحديد الموقع. حاول مرة أخرى' :
                            'تعذّر تحديد موقعك. تأكّد من تفعيل إذن الموقع'
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

  // زاوية القبلة بالنسبة لاتجاه الجهاز (موجبة = إلى اليمين)
  const relativeQibla = heading !== null && qibla !== null
    ? (qibla - heading + 360) % 360
    : qibla ?? 0;
  const turnText = (() => {
    if (heading === null || qibla === null) return null;
    const r = Math.round(relativeQibla);
    return r <= 180 ? tr('استدر {deg}° إلى اليمين', { deg: toAr(r) }) : tr('استدر {deg}° إلى اليسار', { deg: toAr(360 - r) });
  })();

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

  const savedName = saved?.name === 'موقعك' ? tr('موقعك') : saved?.name; // the GPS fallback is stored in Arabic
  const placeLabel = location ? tr('موقعك الحالي') : saved ? (savedName || tr('مدينتك المحفوظة')) : '';
  const deg = qibla != null ? toAr(Math.round(qibla)) : '';
  const heroRef = tr.lang === 'ar' || tr.lang === 'ur'
    ? 'سورة البقرة · ١٤٤'
    : <><bdi lang="ar">سورة البقرة · ١٤٤</bdi> · <bdi>{surahName(2, tr.lang)} 2:144</bdi></>;

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('اتجاه الكعبة المشرّفة')}
        title={tr('القبلة')}
        ayah="فَوَلِّ وَجْهَكَ شَطْرَ ٱلْمَسْجِدِ ٱلْحَرَامِ"
        ayahRef={heroRef}
        sub={tr('حدّد موقعك ليُحسب اتجاه القبلة بالدرجة من الشمال الحقيقي، وفعّل البوصلة ليدور القرص مع هاتفك.')}
      >
        <button type="button" className="nq-btn gold sm" onClick={requestLocation} disabled={loading}>
          {loading ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name="pin" />}
          {loading ? tr('جارٍ تحديد الموقع…') : location ? tr('تحديث موقعي') : tr('تحديد موقعي')}
        </button>
        {compassStatus !== 'active' && (
          <button type="button" className="nq-btn ghost sm" onClick={handleRequestCompassPermission}>
            <Icon name="compass" />{tr('تفعيل البوصلة')}
          </button>
        )}
      </PageHero>

      <div className={`nq-wrap ${styles.wrap}`}>
        {error && <div className={styles.error} role="alert"><Icon name="x" />{tr(error)}</div>}

        <div className={styles.grid}>
          <section className={`nq-card ${styles.roseCard} ${aligned ? styles.isAligned : ''}`} aria-label={tr('بوصلة القبلة')}>
            <Corners />
            <div className={styles.roseWrap}>
              <QiblaRose bearing={qibla} heading={heading} large aligned={aligned} className={styles.rose}
                label={qibla != null
                  ? (heading != null
                    ? tr('القبلة {deg} درجة من الشمال، والجهاز يتجه {h} درجة', { deg, h: toAr(Math.round(heading)) })
                    : tr('القبلة {deg} درجة من الشمال', { deg }))
                  : tr('بوصلة القبلة — حدّد موقعك أولاً')} />
            </div>

            <div className={styles.status} aria-live="polite">
              {qibla === null ? (
                <span className={styles.badge}><Icon name="pin" />{tr('حدّد موقعك لمعرفة اتجاه القبلة')}</span>
              ) : aligned ? (
                <span className={`${styles.badge} ${styles.badgeOk}`}><Icon name="check" />{tr('أنت الآن مستقبل القبلة')}</span>
              ) : turnText ? (
                <span className={styles.badge}><Icon name="compass" />{turnText}</span>
              ) : (
                <span className={styles.badge}><Icon name="compass" />{tr('القبلة {deg}° من الشمال باتجاه عقارب الساعة', { deg })}</span>
              )}
            </div>

            {compassStatus === 'unavailable' && (
              <p className={styles.note}>{qibla !== null
                ? tr('لا يوجد مستشعر بوصلة في هذا الجهاز أو المتصفح، لذا يبقى القرص ثابتاً والشمال إلى الأعلى. استخدم زاوية القبلة ({deg}° من الشمال) مع بوصلة حقيقية.', { deg })
                : tr('لا يوجد مستشعر بوصلة في هذا الجهاز أو المتصفح، لذا يبقى القرص ثابتاً والشمال إلى الأعلى. استخدم زاوية القبلة مع بوصلة حقيقية.')}</p>
            )}
            {compassStatus === 'denied' && (
              <p className={styles.note}>{tr('رُفض إذن البوصلة. اسمح به من إعدادات المتصفح ثم اضغط «تفعيل البوصلة».')}</p>
            )}
            {compassStatus === 'needs-permission' && (
              <p className={styles.note}>{tr('يحتاج جهازك إلى إذنك لقراءة البوصلة. اضغط «تفعيل البوصلة».')}</p>
            )}
            {compassStatus === 'listening' && (
              <p className={styles.note}>{tr('جارٍ قراءة البوصلة… حرّك الهاتف على شكل الرقم ٨ لمعايرتها.')}</p>
            )}
          </section>

          <div className={styles.side}>
            <div className={`nq-card ${styles.bearing}`}>
              <span className="nq-eyebrow">{tr('زاوية القبلة')}</span>
              <b className={`${styles.big} nq-num`}>{qibla != null ? `${toAr(Math.round(qibla))}°` : '—'}</b>
              <span className={styles.muted}>{qibla != null ? tr('من الشمال الحقيقي باتجاه عقارب الساعة') : tr('لم يُحدَّد الموقع بعد')}</span>
              {placeLabel && <span className="nq-pill on"><Icon name="pin" />{placeLabel}</span>}
              {!location && saved && (
                <button type="button" className={styles.linkBtn} onClick={requestLocation} disabled={loading}>{tr('استخدم موقعي الحالي بدلاً منها')}</button>
              )}
            </div>

            <div className={styles.stats}>
              <div className={`nq-card ${styles.stat}`}>
                <Badge8 icon="globe" size={44} />
                <div>
                  <b className="nq-num">{distance != null ? tr('{n} كم', { n: fmtKm(distance) }) : '—'}</b>
                  <span>{tr('إلى الكعبة المشرّفة')}</span>
                </div>
              </div>
              <div className={`nq-card ${styles.stat}`}>
                <Badge8 icon="compass" size={44} />
                <div>
                  <b className="nq-num">{heading !== null ? `${toAr(Math.round(heading))}°` : '—'}</b>
                  <span>{tr('اتجاه الجهاز')}</span>
                </div>
              </div>
              {accuracy !== null && (
                <div className={`nq-card ${styles.stat}`}>
                  <Badge8 icon="pin" size={44} />
                  <div>
                    <b className="nq-num">{tr('{n} م', { n: toAr(accuracy) })}</b>
                    <span>{tr('دقة الموقع')}</span>
                  </div>
                </div>
              )}
            </div>

            <Link to="/prayer-times" className={`nq-card ${styles.toPrayer}`}>
              <Badge8 icon="mosque" size={44} />
              <span><b>{tr('مواقيت الصلاة')}</b><small>{tr('مواقيت مدينتك والصلاة القادمة')}</small></span>
              <Icon name="back" className={styles.flip} />
            </Link>
          </div>
        </div>

        <section className={styles.sec} aria-labelledby="qb-how">
          <div className={styles.secHead}>
            <span className="nq-eyebrow">{tr('خطوات قليلة')}</span>
            <h2 id="qb-how" className="nq-h-sec">{tr('كيف تستخدم البوصلة')}</h2>
          </div>
          <ol className={styles.steps}>
            {[
              ['تحديد الموقع', 'اضغط «تحديد موقعي» لنحسب اتجاه القبلة من موقعك الجغرافي بدقة.'],
              ['تفعيل البوصلة', 'اضغط «تفعيل البوصلة» للسماح بقراءة اتجاه الهاتف (مطلوب على أجهزة iOS).'],
              ['الاستدارة', 'أمسك الهاتف أفقياً وأدِره حتى تصبح الكعبة تحت المؤشّر الذهبي أعلى القرص.'],
              ['الاستقبال', 'عند مواجهة القبلة يتحوّل المؤشّر إلى اللون الأخضر وتظهر رسالة التأكيد.'],
            ].map(([h, p], i) => (
              <li key={i} className={`nq-card ${styles.step}`}>
                <Badge8 size={48}>{toAr(i + 1)}</Badge8>
                <h3>{tr(h)}</h3>
                <p>{tr(p)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.sec}>
          <figure className={`nq-card ${styles.dua}`}>
            <Corners />
            <figcaption className="nq-eyebrow">{tr('دعاء')}</figcaption>
            <blockquote className={styles.duaText} lang="ar" dir="rtl">{DUA}</blockquote>
            {/* the du'a stays in Arabic; its meaning is shown under it in other languages */}
            {tr.lang !== 'ar' && tr(DUA) !== DUA && <p className={styles.duaMean}>{tr(DUA)}</p>}
          </figure>
        </section>
      </div>
    </div>
  );
}

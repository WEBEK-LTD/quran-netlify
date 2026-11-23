// ─── Qibla ───────────────────────────────────────────────────────────────────
// A large compass rose (32-point star, Arabic cardinal letters, the Kaaba on
// the bearing, emerald needle). With a compass sensor the dial turns with the
// device; without one it stays north-up and the bearing is shown in degrees.
import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import styles from './QiblaPage.module.css';
import { PageHero, Icon, Badge8, Corners, toAr } from '../components/ornaments/Ornaments';
import QiblaRose, { calcQibla, calcDistance, fmtKm } from './qibla/QiblaRose';
import { useCompass } from './qibla/useCompass';
import { angleDiff, isAligned } from './qibla/compass';
import { declination } from './qibla/wmm';
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

// figure-8 calibration gesture: a phone travelling along a lemniscate
function Figure8() {
  return (
    <svg className={styles.fig8} viewBox="-60 -30 120 60" aria-hidden="true">
      <path id="nq-fig8" d="M0 0 C 18 -26 52 -26 52 0 C 52 26 18 26 0 0 C -18 -26 -52 -26 -52 0 C -52 26 -18 26 0 0 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" />
      <g className={styles.fig8Phone}>
        <rect x="-6" y="-10" width="12" height="20" rx="3" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
        <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto"><mpath href="#nq-fig8" /></animateMotion>
      </g>
    </svg>
  );
}

const DUA = 'اللهمّ بلّغنا الكعبة المشرّفة، وارزقنا زيارة بيتك الحرام';

export default function QiblaPage() {
  const tr = useTr();
  const [saved] = useState(savedPlace);
  const [location,  setLocation]  = useState(null);   // من GPS
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [accuracy,  setAccuracy]  = useState(null);

  const place = location || saved;
  const qibla = place ? calcQibla(place.lat, place.lon) : null;          // من الشمال الحقيقي
  const distance = place ? calcDistance(place.lat, place.lon) : null;
  // the sensors give magnetic north; the bearing is from true north
  const decl = useMemo(() => (place ? declination(place.lat, place.lon) : 0), [place?.lat, place?.lon]); // eslint-disable-line
  const { status: compassStatus, heading, calibrate, enable } = useCompass(decl);

  // facing the Qibla (with hysteresis, so the confirmation doesn't flicker)
  const alignedRef = useRef(false);
  const aligned = alignedRef.current = isAligned(heading, qibla, alignedRef.current);
  const [pulse, setPulse] = useState(0);
  useEffect(() => { if (aligned) setPulse(p => p + 1); }, [aligned]);

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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  // No place yet but location access was already granted: locate without asking.
  useEffect(() => {
    if (saved || !navigator.permissions || !navigator.geolocation) return;
    let alive = true;
    navigator.permissions.query({ name: 'geolocation' })
      .then(p => { if (alive && p.state === 'granted') requestLocation(); })
      .catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // turn needed to face the Qibla (positive = to the right)
  const turn = heading !== null && qibla !== null ? angleDiff(qibla, heading) : null;
  const turnText = (() => {
    if (turn === null) return null;
    const r = Math.round(Math.abs(turn));
    return turn >= 0 ? tr('استدر {deg}° إلى اليمين', { deg: toAr(r) }) : tr('استدر {deg}° إلى اليسار', { deg: toAr(r) });
  })();

  function handleRequestCompassPermission() {
    setError('');
    enable();
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
        {(compassStatus === 'needs-permission' || compassStatus === 'denied') && (
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
              {aligned && <span key={pulse} className={styles.pulse} aria-hidden="true" />}
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

            {compassStatus === 'active' && calibrate && (
              <div className={styles.calib} role="status">
                <Figure8 />
                <span>
                  <b>{tr('البوصلة تحتاج إلى معايرة')}</b>
                  <small>{tr('حرّك الهاتف في الهواء على شكل الرقم ٨ مرتين أو ثلاثاً، وابتعد عن المعادن والمغناطيس والأجهزة الكهربائية.')}</small>
                </span>
              </div>
            )}
            {compassStatus === 'active' && !calibrate && place && Math.abs(decl) >= 0.5 && (
              <p className={styles.note}>{tr('الاتجاه مُصحَّح بالانحراف المغناطيسي لموقعك ({d}°).', { d: toAr(Math.abs(decl).toFixed(1)).replace('.', '٫') })}</p>
            )}
            {compassStatus === 'unavailable' && (
              <div className={styles.nosensor} role="status">
                <Badge8 icon="compass" size={48} />
                <span>
                  <b>{tr('لا يوجد حسّاس بوصلة')}</b>
                  <small>{qibla !== null
                    ? tr('لا يوجد مستشعر بوصلة في هذا الجهاز أو المتصفح، لذا يبقى القرص ثابتاً والشمال إلى الأعلى. استخدم زاوية القبلة ({deg}° من الشمال) مع بوصلة حقيقية.', { deg })
                    : tr('لا يوجد مستشعر بوصلة في هذا الجهاز أو المتصفح، لذا يبقى القرص ثابتاً والشمال إلى الأعلى. استخدم زاوية القبلة مع بوصلة حقيقية.')}</small>
                  <button type="button" className={styles.linkBtn} onClick={handleRequestCompassPermission}>{tr('إعادة المحاولة')}</button>
                </span>
              </div>
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

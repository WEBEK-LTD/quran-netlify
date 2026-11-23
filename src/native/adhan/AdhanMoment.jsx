// ─── The adhan moment: full screen when the prayer time comes ───────────────
// Prayer name, city and time, the ayah of An-Nisa 103, «إيقاف الأذان» and
// «تذكير بعد ٥ دقائق». The Quranic text is never translated (its reference is).
import { useEffect, useRef } from 'react';
import { useTr, num, surahName } from '../../l10n';
import { Badge8, Pattern, Icon } from '../../components/ornaments/Ornaments';
import { RECORDINGS, recordingName } from './muezzins';
import styles from './AdhanMoment.module.css';

const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
const AYAH = 'إِنَّ ٱلصَّلَوٰةَ كَانَتْ عَلَى ٱلْمُؤْمِنِينَ كِتَٰبًا مَّوْقُوتًا';

function fmtTime(hm, lang) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm || '');
  if (!m) return '';
  const h = +m[1], mi = m[2];
  if (lang === 'ar' || lang === 'en') {
    const ap = h < 12 ? (lang === 'ar' ? 'ص' : 'AM') : (lang === 'ar' ? 'م' : 'PM');
    return num(`${h % 12 || 12}:${mi}`, lang) + ' ' + ap;
  }
  return num(`${String(h).padStart(2, '0')}:${mi}`, lang);
}

export default function AdhanMoment({ prayer, time, city, recording, onStop, onSnooze, onClose }) {
  const tr = useTr();
  const stopRef = useRef(null);
  const rec = RECORDINGS.find(r => r.id === recording);

  useEffect(() => {
    const prev = document.activeElement;
    stopRef.current && stopRef.current.focus();
    const onBack = (e) => { e.preventDefault(); onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('nq-native-back', onBack);
    window.addEventListener('keydown', onKey);
    document.documentElement.classList.add('nq-adhan-open');
    return () => {
      window.removeEventListener('nq-native-back', onBack);
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('nq-adhan-open');
      try { prev && prev.focus && prev.focus(); } catch {}
    };
  }, [onClose]);

  const pName = tr(PRAYER_AR[prayer] || 'الصلاة');
  const where = city ? (city === 'موقعك' ? tr('موقعك') : city) : '';
  const ref = tr.lang === 'ar' || tr.lang === 'ur' ? 'النساء ١٠٣' : `${surahName(4, tr.lang)} 4:103`;

  return (
    <div className={styles.wrap} role="alertdialog" aria-modal="true" aria-labelledby="nq-adhan-title" aria-describedby="nq-adhan-sub" dir={tr.dir}>
      <Pattern />
      <button type="button" className={styles.close} onClick={onClose} aria-label={tr('إغلاق')}><Icon name="x" /></button>
      <div className={styles.inner}>
        <Badge8 icon="mosque" size={84} />
        <p className={styles.eyebrow}>{tr('حان وقت الصلاة')}</p>
        <h1 id="nq-adhan-title" className={styles.title}>{tr('صلاة {p}', { p: pName })}</h1>
        <p id="nq-adhan-sub" className={styles.sub}>
          {where && <span><Icon name="pin" />{where}</span>}
          {time && <span><Icon name="timer" /><bdi>{fmtTime(time, tr.lang)}</bdi></span>}
        </p>
        <figure className={styles.ayah}>
          <blockquote lang="ar" dir="rtl">﴿{AYAH}﴾</blockquote>
          <figcaption><bdi>{ref}</bdi></figcaption>
        </figure>
        <div className={styles.actions}>
          <button ref={stopRef} type="button" className="nq-btn gold" onClick={onStop}><Icon name="x" />{tr('إيقاف الأذان')}</button>
          <button type="button" className="nq-btn ghost" onClick={onSnooze}><Icon name="bell" />{tr('تذكير بعد ٥ دقائق')}</button>
        </div>
        {rec && <p className={styles.credit}>{tr('بصوت: {name}', { name: recordingName(rec, tr.lang) })}</p>}
      </div>
    </div>
  );
}

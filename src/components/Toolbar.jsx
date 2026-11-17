import { Link } from 'react-router-dom';
import { useStore, setGlobal } from '../store';
import { SURAHS_META, TRANSLATIONS, READERS } from '../data';
import { useHifz } from '../hifzStore';
import styles from './Toolbar.module.css';

export default function Toolbar() {
  const [state] = useStore();
  const { hifz, markWardDone, todayDone, streak } = useHifz();
  const meta = SURAHS_META[state.currentSurah - 1];

  function changeFont(delta) {
    const next = Math.max(16, Math.min(48, state.fontSize + delta));
    setGlobal({ fontSize: next });
    localStorage.setItem('nq_fontSize', next);
    document.documentElement.style.setProperty('--font-size', next + 'px');
  }

  function setFontStyle(style) {
    setGlobal({ fontStyle: style });
    localStorage.setItem('nq_fontStyle', style);
  }

  const ward = hifz.dailyWard;
  const wardName = ward ? SURAHS_META[ward.surah - 1]?.[0] : null;

  return (
    <div className={styles.toolbar}>
      {/* Font controls */}
      <span className={styles.label}>حجم الخط:</span>
      <div className={styles.group}>
        <button className={styles.btn} onClick={() => changeFont(-2)}>أ−</button>
        <span className={styles.sizeDisplay}>{state.fontSize}</span>
        <button className={styles.btn} onClick={() => changeFont(2)}>أ+</button>
      </div>

      <div className={styles.sep} />

      <span className={styles.label}>الخط:</span>
      <button className={`${styles.btn} ${state.fontStyle === 'uthmani' ? styles.active : ''}`}
        onClick={() => setFontStyle('uthmani')}>عثماني</button>
      <button className={`${styles.btn} ${state.fontStyle === 'simple' ? styles.active : ''}`}
        onClick={() => setFontStyle('simple')}>مبسط</button>

      <div className={styles.sep} />

      <span className={styles.toolLabel}>ترجمة:</span>
      <select
        className={styles.transSelect}
        value={state.translation || 'none'}
        title="الترجمة"
        onChange={e => {
          setGlobal({ translation: e.target.value });
          localStorage.setItem('nq_translation', e.target.value);
        }}
      >
        {TRANSLATIONS.map(t => (
          <option key={t.id} value={t.id}>{t.flag} {t.lang}</option>
        ))}
      </select>

      <span className={styles.toolLabel}>قارئ:</span>
      <select
        className={styles.transSelect}
        value={state.reader || 'Alafasy_128kbps'}
        title="القارئ"
        onChange={e => {
          setGlobal({ reader: e.target.value });
          localStorage.setItem('nq_reader', e.target.value);
          if (state.isPlaying) setGlobal({ playTrigger: Date.now() });
        }}
      >
        {READERS.map(r => (
          <option key={r.id} value={r.id}>{r.country} {r.name}</option>
        ))}
      </select>

      <div className={styles.sep} />

      {/* Quick links */}
      <Link to="/search" className={styles.quickLink}>🔍 بحث</Link>
      <Link to="/notes"  className={styles.quickLink}>📝 ملاحظات</Link>
      <Link to="/hifz"   className={styles.quickLink}>📚 حفظ</Link>

      <div className={styles.spacer} />

      {/* Ward widget */}
      {ward ? (
        <div className={styles.wardWidget}>
          {streak > 0 && <span className={styles.streak}>🔥 {streak}</span>}
          <span className={styles.wardInfo}>
            {wardName} {ward.startAyah}–{ward.endAyah}
          </span>
          <button
            className={`${styles.wardBtn} ${todayDone ? styles.wardDone : ''}`}
            onClick={markWardDone}
            disabled={todayDone}
            title="الورد اليومي"
          >
            {todayDone ? '✓ تم' : '☑ وردي'}
          </button>
        </div>
      ) : (
        <Link to="/hifz" className={styles.setWardBtn}>+ ورد يومي</Link>
      )}

      <span className={styles.meta}>{meta[0]} • {meta[2]} آية • {meta[3]}</span>
    </div>
  );
}

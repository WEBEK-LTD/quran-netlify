import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styles from './TasbihPage.module.css';

const PRESETS = [
  { id: 'subhan',  label: 'سبحان الله',              ar: 'سُبْحَانَ اللهِ',              target: 33,  color: '#52b788' },
  { id: 'alhamd',  label: 'الحمد لله',               ar: 'الْحَمْدُ لِلَّهِ',              target: 33,  color: '#c9a84c' },
  { id: 'akbar',   label: 'الله أكبر',               ar: 'اللهُ أَكْبَرُ',                target: 34,  color: '#f97316' },
  { id: 'lailla',  label: 'لا إله إلا الله',         ar: 'لَا إِلَهَ إِلَّا اللهُ',       target: 100, color: '#6366f1' },
  { id: 'astaghf', label: 'أستغفر الله',             ar: 'أَسْتَغْفِرُ اللهَ',             target: 100, color: '#8b5cf6' },
  { id: 'salah',   label: 'الصلاة على النبي',         ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', target: 100, color: '#f59e0b' },
  { id: 'hawqala', label: 'حوقلة',                   ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ', target: 100, color: '#10b981' },
  { id: 'custom',  label: 'مخصص',                    ar: '',                              target: 100, color: '#94a3b8' },
];

function toAr(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function loadState() {
  try { return JSON.parse(localStorage.getItem('nq_tasbih') || '{}'); } catch { return {}; }
}
function saveState(s) { localStorage.setItem('nq_tasbih', JSON.stringify(s)); }

export default function TasbihPage() {
  const [activeId,  setActiveId]  = useState('subhan');
  const [counts,    setCounts]    = useState(() => loadState());
  const [sessions,  setSessions]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('nq_tasbih_sessions') || '[]'); } catch { return []; }
  });
  const [vibrate,   setVibrate]   = useState(() => localStorage.getItem('nq_tasbih_vib') !== 'off');
  const [customText,setCustomText]= useState('');
  const [editCustom,setEditCustom]= useState(false);
  const [flash,     setFlash]     = useState(false);
  const [rings,     setRings]     = useState(0); // times target reached

  const preset = PRESETS.find(p => p.id === activeId) || PRESETS[0];
  const count   = counts[activeId] || 0;
  const target  = preset.target;
  const pct     = Math.min(100, Math.round((count % (target || 1)) / (target || 1) * 100));
  const completed = Math.floor(count / target);

  // ── Count ──────────────────────────────────────────────────────────────────
  const increment = useCallback(() => {
    setCounts(prev => {
      const next = { ...prev, [activeId]: (prev[activeId] || 0) + 1 };
      saveState(next);
      const newCount = next[activeId];
      // Reached target?
      if (newCount % target === 0) {
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
        setRings(r => r + 1);
        // Save session
        const session = {
          id: Date.now(),
          preset: preset.label,
          count: target,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
        };
        setSessions(prev2 => {
          const next2 = [session, ...prev2].slice(0, 50);
          localStorage.setItem('nq_tasbih_sessions', JSON.stringify(next2));
          return next2;
        });
      }
      return next;
    });
    // Vibrate
    if (vibrate && navigator.vibrate) navigator.vibrate(30);
  }, [activeId, target, preset.label, vibrate]);

  // Keyboard & swipe support
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault(); increment();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [increment]);

  function reset() {
    setCounts(prev => {
      const next = { ...prev, [activeId]: 0 };
      saveState(next);
      return next;
    });
    setRings(0);
  }

  function switchPreset(id) {
    setActiveId(id);
    setRings(0);
  }

  const totalToday = sessions
    .filter(s => s.date === new Date().toISOString().split('T')[0])
    .reduce((sum, s) => sum + s.count, 0);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>← رجوع</Link>
        <h1 className={styles.pageTitle}>📿 السبحة الإلكترونية</h1>
        <button className={styles.vibBtn}
          onClick={() => { setVibrate(v => !v); localStorage.setItem('nq_tasbih_vib', vibrate ? 'off' : 'on'); }}
          title={vibrate ? 'إيقاف الاهتزاز' : 'تفعيل الاهتزاز'}>
          {vibrate ? '📳' : '🔕'}
        </button>
      </div>

      {/* Today stats */}
      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <div className={styles.statVal}>{toAr(totalToday)}</div>
          <div className={styles.statLabel}>تسبيحات اليوم</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statVal}>{toAr(sessions.filter(s => s.date === new Date().toISOString().split('T')[0]).length)}</div>
          <div className={styles.statLabel}>جلسات اليوم</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statVal}>{toAr(sessions.length)}</div>
          <div className={styles.statLabel}>إجمالي الجلسات</div>
        </div>
      </div>

      {/* Preset selector */}
      <div className={styles.presets}>
        {PRESETS.map(p => (
          <button key={p.id}
            className={`${styles.presetBtn} ${activeId === p.id ? styles.presetActive : ''}`}
            style={{ '--pc': p.color }}
            onClick={() => switchPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom text input */}
      {activeId === 'custom' && (
        <div className={styles.customWrap}>
          <input className={styles.customInput}
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="اكتب ذكرك المخصص..."
            dir="rtl" />
        </div>
      )}

      {/* Main counter */}
      <div className={`${styles.counterWrap} ${flash ? styles.counterFlash : ''}`}
           style={{ '--cc': preset.color }}>

        {/* Circular progress */}
        <div className={styles.ring}>
          <svg viewBox="0 0 200 200" className={styles.ringsvg}>
            <circle cx="100" cy="100" r="88" className={styles.ringBg} />
            <circle cx="100" cy="100" r="88" className={styles.ringFill}
              style={{
                strokeDasharray: `${2 * Math.PI * 88}`,
                strokeDashoffset: `${2 * Math.PI * 88 * (1 - pct / 100)}`,
                stroke: preset.color,
              }} />
          </svg>

          {/* Tap button */}
          <button className={styles.tapBtn} onClick={increment}
            style={{ '--cc': preset.color }}>
            <div className={styles.tapCount}>{toAr(count % target || (count > 0 ? target : 0))}</div>
            <div className={styles.tapLabel}>
              {activeId === 'custom' ? (customText || 'اضغط') : preset.ar || preset.label}
            </div>
            {completed > 0 && (
              <div className={styles.tapCompleted}>× {toAr(completed)}</div>
            )}
          </button>
        </div>

        {/* Progress text */}
        <div className={styles.progress}>
          <span className={styles.progressCurrent}>{toAr(count % target || (count > 0 ? target : 0))}</span>
          <span className={styles.progressSep}>/</span>
          <span className={styles.progressTarget}>{toAr(target)}</span>
        </div>

        {/* Completed rounds */}
        {completed > 0 && (
          <div className={styles.completedBadge} style={{ color: preset.color }}>
            ✅ أكملت {toAr(completed)} {completed === 1 ? 'دورة' : 'دورات'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.resetBtn} onClick={reset}>↺ إعادة</button>
        <div className={styles.targetRow}>
          <span className={styles.targetLabel}>الهدف:</span>
          {[33, 34, 99, 100, 1000].map(t => (
            <button key={t}
              className={`${styles.targetBtn} ${target === t ? styles.targetActive : ''}`}
              style={{ '--pc': preset.color }}
              onClick={() => {
                const idx = PRESETS.findIndex(p => p.id === activeId);
                if (idx !== -1) PRESETS[idx].target = t;
                setCounts(c => ({ ...c })); // force re-render
              }}>
              {toAr(t)}
            </button>
          ))}
        </div>
      </div>

      {/* Tap hint */}
      <div className={styles.hint}>
        اضغط على الدائرة أو اضغط Space/Enter للتسبيح
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div className={styles.sessions}>
          <h3 className={styles.sessionsTitle}>📊 آخر الجلسات</h3>
          <div className={styles.sessionsList}>
            {sessions.slice(0, 10).map(s => (
              <div key={s.id} className={styles.sessionRow}>
                <span className={styles.sessionPreset}>{s.preset}</span>
                <span className={styles.sessionCount}>{toAr(s.count)} مرة</span>
                <span className={styles.sessionTime}>{s.date} {s.time}</span>
              </div>
            ))}
          </div>
          {sessions.length > 10 && (
            <p className={styles.moreHint}>+ {toAr(sessions.length - 10)} جلسة أخرى</p>
          )}
        </div>
      )}
    </div>
  );
}

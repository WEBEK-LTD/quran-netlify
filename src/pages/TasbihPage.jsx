// ─── Tasbih ──────────────────────────────────────────────────────────────────
// One large tap target ringed by the progress to the target (beads light up
// as you count), presets, targets, today's totals and the recent sessions.
// Space / Enter count too. Everything is kept on the device.
import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './TasbihPage.module.css';
import { PageHero, Icon, Badge8, Corners, toAr } from '../components/ornaments/Ornaments';

const PRESETS = [
  { id: 'subhan',  label: 'سبحان الله',        ar: 'سُبْحَانَ اللهِ',              target: 33  },
  { id: 'alhamd',  label: 'الحمد لله',         ar: 'الْحَمْدُ لِلَّهِ',              target: 33  },
  { id: 'akbar',   label: 'الله أكبر',         ar: 'اللهُ أَكْبَرُ',                target: 34  },
  { id: 'lailla',  label: 'لا إله إلا الله',   ar: 'لَا إِلَهَ إِلَّا اللهُ',       target: 100 },
  { id: 'astaghf', label: 'أستغفر الله',       ar: 'أَسْتَغْفِرُ اللهَ',             target: 100 },
  { id: 'salah',   label: 'الصلاة على النبي',  ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', target: 100 },
  { id: 'hawqala', label: 'الحوقلة',           ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ', target: 100 },
  { id: 'custom',  label: 'ذكر مخصّص',         ar: '',                              target: 100 },
];
const TARGETS = [33, 34, 99, 100, 1000];

// ring geometry (viewBox -170..170)
const R = 138;
const CIRC = 2 * Math.PI * R;


function loadState() {
  try { return JSON.parse(localStorage.getItem('nq_tasbih') || '{}'); } catch { return {}; }
}
function saveState(s) { try { localStorage.setItem('nq_tasbih', JSON.stringify(s)); } catch {} }

// تاريخ اليوم بالتوقيت المحلي (وليس UTC)
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadTargets() {
  const defaults = Object.fromEntries(PRESETS.map(p => [p.id, p.target]));
  try {
    const saved = JSON.parse(localStorage.getItem('nq_tasbih_targets') || '{}');
    for (const k of Object.keys(saved)) if (Number(saved[k]) > 0) defaults[k] = Number(saved[k]);
  } catch {}
  return defaults;
}

function loadTodayTaps() {
  try {
    const t = JSON.parse(localStorage.getItem('nq_tasbih_today') || 'null');
    if (t && t.date === localDay()) return Number(t.taps) || 0;
  } catch {}
  return 0;
}

export default function TasbihPage() {
  const [activeId,  setActiveId]  = useState('subhan');
  const [counts,    setCounts]    = useState(() => loadState());
  const [sessions,  setSessions]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('nq_tasbih_sessions') || '[]'); } catch { return []; }
  });
  const [vibrate,   setVibrate]   = useState(() => localStorage.getItem('nq_tasbih_vib') !== 'off');
  const [customText,setCustomText]= useState(() => { try { return localStorage.getItem('nq_tasbih_custom') || ''; } catch { return ''; } });
  const [targets,   setTargets]   = useState(loadTargets);
  const [todayTaps, setTodayTaps] = useState(loadTodayTaps);
  const countsRef = useRef(counts);
  const tapsRef   = useRef({ date: localDay(), taps: todayTaps });
  const [editCustom,setEditCustom]= useState(false);
  const [flash,     setFlash]     = useState(false);
  const [rings,     setRings]     = useState(0); // times target reached

  const preset = PRESETS.find(p => p.id === activeId) || PRESETS[0];
  const count   = counts[activeId] || 0;
  const target  = targets[activeId] || preset.target;
  const pct     = Math.min(100, Math.round((count % (target || 1)) / (target || 1) * 100));
  const completed = Math.floor(count / target);

  // ── Count ──────────────────────────────────────────────────────────────────
  // التحديث خارج دالة setState حتى لا تتكرر الآثار الجانبية (StrictMode)
  const increment = useCallback(() => {
    const prev = countsRef.current;
    const newCount = (prev[activeId] || 0) + 1;
    const next = { ...prev, [activeId]: newCount };
    countsRef.current = next;
    setCounts(next);
    saveState(next);

    // كل ضغطة تُحسب في "تسبيحات اليوم"
    const today = localDay();
    const tp = tapsRef.current.date === today ? tapsRef.current.taps + 1 : 1;
    tapsRef.current = { date: today, taps: tp };
    setTodayTaps(tp);
    try { localStorage.setItem('nq_tasbih_today', JSON.stringify(tapsRef.current)); } catch {}

    // Reached target?
    if (newCount % target === 0) {
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
      setRings(r => r + 1);
      const label = activeId === 'custom' ? (customText.trim() || preset.label) : preset.label;
      const session = {
        id: Date.now(),
        preset: label,
        count: target,
        date: today,
        time: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
      };
      setSessions(prev2 => {
        const next2 = [session, ...prev2].slice(0, 50);
        try { localStorage.setItem('nq_tasbih_sessions', JSON.stringify(next2)); } catch {}
        return next2;
      });
    }
    // Vibrate
    if (vibrate && navigator.vibrate) { try { navigator.vibrate(30); } catch {} }
  }, [activeId, target, preset.label, vibrate, customText]);

  // Keyboard & swipe support
  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      // لا نعترض الكتابة في الحقول ولا تفعيل الأزرار بلوحة المفاتيح
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || (el && el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      e.preventDefault(); increment();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [increment]);

  function reset() {
    const next = { ...countsRef.current, [activeId]: 0 };
    countsRef.current = next;
    setCounts(next);
    saveState(next);
    setRings(0);
  }

  function setTarget(t) {
    setTargets(prev => {
      const next = { ...prev, [activeId]: t };
      try { localStorage.setItem('nq_tasbih_targets', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function updateCustomText(v) {
    setCustomText(v);
    try { localStorage.setItem('nq_tasbih_custom', v); } catch {}
  }

  function switchPreset(id) {
    setActiveId(id);
    setRings(0);
  }

  const todayStr = localDay();
  const totalToday = tapsRef.current.date === todayStr ? todayTaps : 0;
  const sessionsToday = sessions.filter(s => s.date === todayStr).length;

  function toggleVibrate() {
    setVibrate(v => !v);
    try { localStorage.setItem('nq_tasbih_vib', vibrate ? 'off' : 'on'); } catch {}
  }

  const shownCount = count % target || (count > 0 ? target : 0);
  const ringFrac = count > 0 && count % target === 0 ? 1 : pct / 100;
  const phrase = activeId === 'custom' ? (customText.trim() || 'اكتب ذكرك أعلاه') : (preset.ar || preset.label);
  const beads = target <= 100 ? target : 0;
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDay(d); })();
  const dayLabel = d => d === todayStr ? 'اليوم' : d === yesterday ? 'أمس' : toAr(d.split('-').reverse().join('/'));

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="الذكر"
        title="السبحة"
        sub="عدّاد تسبيح بأهداف ودورات، يحفظ جلساتك على جهازك. اضغط الدائرة أو مفتاح المسافة للعدّ."
      >
        <button type="button" className="nq-btn ghost sm" onClick={toggleVibrate} aria-pressed={vibrate}>
          <Icon name={vibrate ? 'phone' : 'x'} />{vibrate ? 'الاهتزاز مفعّل' : 'الاهتزاز متوقف'}
        </button>
      </PageHero>

      <div className={`nq-wrap ${styles.wrap}`}>
        <div className={styles.grid}>
          <section className={`nq-card ${styles.main}`} aria-label="العدّاد">
            <Corners />
            <div className={styles.presets} role="group" aria-label="الذكر">
              {PRESETS.map(p => (
                <button key={p.id} type="button" className={`nq-pill ${styles.preset} ${activeId === p.id ? 'on' : ''}`}
                  aria-pressed={activeId === p.id} onClick={() => switchPreset(p.id)}>
                  {p.id === 'custom' && <Icon name="pen" />}{p.label}
                </button>
              ))}
            </div>

            {activeId === 'custom' && (
              <label className={`nq-input ${styles.custom}`}>
                <Icon name="pen" />
                <span className="nq-sr">نص الذكر المخصّص</span>
                <input value={customText} onChange={e => updateCustomText(e.target.value)} placeholder="اكتب ذكرك المخصّص…" dir="rtl" />
              </label>
            )}

            <div className={`${styles.counterWrap} ${flash ? styles.flash : ''}`}>
              <svg className={styles.ring} viewBox="-170 -170 340 340" aria-hidden="true">
                <circle r="160" className={styles.halo} />
                <circle r={R} className={styles.track} />
                <circle r={R} className={styles.fill} transform="rotate(-90)"
                  style={{ strokeDasharray: CIRC, strokeDashoffset: CIRC * (1 - ringFrac) }} />
                {beads > 0 && Array.from({ length: beads }, (_, i) => {
                  const a = (i / beads) * 2 * Math.PI - Math.PI / 2;
                  const on = i < shownCount;
                  return <circle key={i} cx={(156 * Math.cos(a)).toFixed(1)} cy={(156 * Math.sin(a)).toFixed(1)}
                    r={beads > 40 ? 2.6 : 4} className={on ? styles.beadOn : styles.bead} />;
                })}
              </svg>
              <button type="button" className={styles.tap} onClick={increment}
                aria-label={`سبّح: ${activeId === 'custom' ? (customText.trim() || preset.label) : preset.label}، العدد ${toAr(shownCount)} من ${toAr(target)}`}>
                <svg className={styles.star} viewBox="0 0 40 40" aria-hidden="true"><use href="#nq-star8" /></svg>
                <span className={`${styles.count} nq-num`} aria-hidden="true">{toAr(shownCount)}</span>
                <span className={styles.phrase} aria-hidden="true">{phrase}</span>
                <span className={styles.of} aria-hidden="true">من {toAr(target)}</span>
              </button>
            </div>

            <div className={styles.under} aria-live="polite">
              {completed > 0
                ? <span className="nq-pill on"><Icon name="check" />أكملت {toAr(completed)} {completed === 1 ? 'دورة' : completed === 2 ? 'دورتين' : 'دورات'}</span>
                : <span className={styles.hint}>اضغط الدائرة أو مفتاح المسافة أو Enter للتسبيح</span>}
            </div>

            <div className={styles.controls}>
              <div className={styles.targetRow}>
                <span className={styles.lbl}>الهدف</span>
                <div className="nq-seg" role="group" aria-label="الهدف">
                  {TARGETS.map(t => (
                    <button key={t} type="button" aria-pressed={target === t} onClick={() => setTarget(t)}>{toAr(t)}</button>
                  ))}
                </div>
              </div>
              <button type="button" className="nq-btn ghost sm" onClick={reset} disabled={count === 0}>
                <Icon name="repeat" />تصفير العدّاد
              </button>
            </div>
          </section>

          <aside className={styles.side}>
            <div className={styles.stats}>
              <div className={`nq-card ${styles.stat} ${styles.statWide}`}>
                <Badge8 icon="beads" size={52} />
                <div><b className="nq-num">{toAr(totalToday)}</b><span>تسبيحة اليوم</span></div>
              </div>
              <div className={`nq-card ${styles.stat}`}>
                <div><b className="nq-num">{toAr(sessionsToday)}</b><span>جلسات اليوم</span></div>
              </div>
              <div className={`nq-card ${styles.stat}`}>
                <div><b className="nq-num">{toAr(sessions.length)}</b><span>كل الجلسات</span></div>
              </div>
            </div>

            <section className={`nq-card ${styles.history}`} aria-labelledby="tb-hist">
              <h2 id="tb-hist" className={styles.hTitle}><Icon name="list" />آخر الجلسات</h2>
              {sessions.length === 0 ? (
                <p className={styles.emptyH}>تظهر هنا كل دورة تكملها، مع الذكر ووقت إتمامه.</p>
              ) : (
                <ol className={styles.sessions}>
                  {sessions.slice(0, 10).map(s => (
                    <li key={s.id} className={styles.session}>
                      <span className={styles.sName}>{s.preset}</span>
                      <span className={`${styles.sCount} nq-num`}>{toAr(s.count)}</span>
                      <span className={styles.sTime}>{dayLabel(s.date)} · {s.time}</span>
                    </li>
                  ))}
                </ol>
              )}
              {sessions.length > 10 && (
                <p className={styles.moreH}>و{toAr(sessions.length - 10)} جلسة أخرى محفوظة</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

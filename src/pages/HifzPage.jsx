import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useHifz, localDateStr } from '../hifzStore';
import { useAuth } from '../hooks/useAuth';
import { SURAHS_META, toArabicNum } from '../data';
import { SURAH_AYAH_COUNT, JUZ_DATA, ACHIEVEMENTS, TOTAL_AYAHS, juzSurahRanges } from '../hifzData';
import { setGlobal } from '../store';
import styles from './HifzPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

const STATUS_LABELS = {
  none:       { label: 'لم يبدأ',    color: '#6b7c65', bg: 'rgba(107,124,101,0.1)' },
  inProgress: { label: 'قيد الحفظ',  color: '#c9a84c', bg: 'rgba(201,168,76,0.12)' },
  completed:  { label: 'محفوظ ✓',    color: '#52b788', bg: 'rgba(82,183,136,0.12)' },
  review:     { label: 'للمراجعة',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
};

const NEXT_STATUS = { none: 'inProgress', inProgress: 'completed', completed: 'review', review: 'none' };

// Advance `n` ayahs from (surah, ayah) across surah boundaries → last ayah of the range
function advanceAyahs(surah, ayah, n) {
  let s = surah, a = ayah, left = n - 1;
  while (left > 0) {
    const max = SURAH_AYAH_COUNT[s - 1];
    const room = max - a;
    if (left <= room) { a += left; left = 0; }
    else if (s >= 114) { a = max; left = 0; }
    else { left -= room + 1; s += 1; a = 1; }
  }
  return { endSurah: s, endAyah: a };
}

// Number of ayahs from (s1,a1) to (s2,a2) inclusive
function countAyahs(s1, a1, s2, a2) {
  if (s1 === s2) return a2 - a1 + 1;
  let n = SURAH_AYAH_COUNT[s1 - 1] - a1 + 1;
  for (let s = s1 + 1; s < s2; s++) n += SURAH_AYAH_COUNT[s - 1];
  return n + a2;
}

// Human-readable ward range (handles single-surah and multi-surah wards)
function wardRangeText(w) {
  const name = n => SURAHS_META[n - 1]?.[0] || '';
  const endSurah = w.endSurah || w.surah;
  if (endSurah === w.surah) {
    return `سورة ${name(w.surah)}: الآية ${w.startAyah} → ${w.endAyah}`;
  }
  return `من ${name(w.surah)} ${w.startAyah} إلى ${name(endSurah)} ${w.endAyah}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BigProgressRing({ pct }) {
  const r = 54; const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className={styles.ring}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="10"/>
      <circle cx="70" cy="70" r={r} fill="none"
        stroke="url(#ringGrad)" strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transform:'rotate(-90deg)', transformOrigin:'center', transition:'stroke-dashoffset 1s ease' }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--green2)"/>
          <stop offset="100%" stopColor="var(--gold)"/>
        </linearGradient>
      </defs>
      <text x="70" y="66" textAnchor="middle" fill="var(--gold)" fontSize="18" fontWeight="700" fontFamily="Cairo">{pct}%</text>
      <text x="70" y="84" textAnchor="middle" fill="var(--text3)" fontSize="10" fontFamily="Cairo"></text>
    </svg>
  );
}

function MiniBar({ pct, color = 'var(--gold)' }) {
  return (
    <div className={styles.miniBar}>
      <div className={styles.miniBarFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function AchievementBadge({ achievement, unlocked }) {
  return (
    <div className={`${styles.badge} ${unlocked ? styles.badgeUnlocked : styles.badgeLocked}`}
      title={achievement.desc}>
      <span className={styles.badgeIcon}>{achievement.icon}</span>
      <span className={styles.badgeTitle}>{achievement.title}</span>
      {!unlocked && <div className={styles.badgeLock}>🔒</div>}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function HifzPage() {
  const t = useT();
  const dir = useDir();
  const { user } = useAuth();
  const {
    hifz, setSurahStatus, setDailyWard, markWardDone,
    completedSurahs, inProgressSurahs, memorizedAyahs, progressPct, todayDone, streak, bestStreak
  } = useHifz(user?.id);

  const [activeTab,  setActiveTab]  = useState('tracker');  // tracker | ward | stats | achievements
  const [viewMode,   setViewMode]   = useState('surahs');   // surahs | juz
  const [wardForm,   setWardForm]   = useState({ surah: 1, startAyah: 1, endAyah: 7, mode: 'surah', juz: 1, count: 5 });
  const [wardError,  setWardError]  = useState('');
  const [notification, setNotification] = useState(null);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      setNotification('default');
    }
  }, []);

  async function requestNotifications() {
    if (!('Notification' in window)) { setNotification('unsupported'); return; }
    let perm;
    try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
    setNotification(perm);
    if (perm === 'granted') {
      await showTestNotification();
    }
  }

  // Shows a single confirmation notification. Android Chrome forbids
  // `new Notification()` — use the service worker registration when available.
  // NOTE: no daily schedule exists yet; we only confirm notifications work.
  async function showTestNotification() {
    const title = 'نور القرآن 🌙';
    const opts  = { body: 'تم تفعيل الإشعارات — تذكّر وردك اليومي من القرآن الكريم', icon: '/icon.svg' };
    try {
      if ('serviceWorker' in navigator) {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(r => setTimeout(() => r(null), 3000)),
        ]);
        if (reg?.showNotification) { await reg.showNotification(title, opts); }
        else { new Notification(title, opts); }
      } else {
        new Notification(title, opts);
      }
      setGlobal({ toast: '✅ تم تفعيل الإشعارات على هذا الجهاز' });
    } catch {
      setGlobal({ toast: '⚠️ تعذّر عرض الإشعار على هذا المتصفح' });
    }
  }

  function handleSurahStatusClick(surahNum) {
    const current = hifz.surahStatus[surahNum] || 'none';
    setSurahStatus(surahNum, NEXT_STATUS[current]);
  }

  function saveWard() {
    setWardError('');
    const mode = wardForm.mode;
    let ward;

    if (mode === 'juz') {
      const juz = parseInt(wardForm.juz, 10);
      const row = JUZ_DATA[juz - 1];
      if (!row) { setWardError('اختر جزءاً صحيحاً (1–30)'); return; }
      const [, s1, a1, s2, a2] = row;
      ward = { mode: 'juz', juz, surah: s1, startAyah: a1, endSurah: s2, endAyah: a2,
               ayahCount: countAyahs(s1, a1, s2, a2) };
    } else {
      const s1  = parseInt(wardForm.surah, 10);
      const max = SURAH_AYAH_COUNT[s1 - 1];
      const a1  = parseInt(wardForm.startAyah, 10);
      if (!max) { setWardError('اختر سورة صحيحة'); return; }
      if (!Number.isFinite(a1) || a1 < 1 || a1 > max) {
        setWardError(`آية البداية يجب أن تكون بين 1 و ${max}`); return;
      }
      if (mode === 'ayahs') {
        const n = parseInt(wardForm.count, 10);
        if (!Number.isFinite(n) || n < 1 || n > 50) { setWardError('عدد الآيات يجب أن يكون بين 1 و 50'); return; }
        const { endSurah, endAyah } = advanceAyahs(s1, a1, n);
        ward = { mode: 'ayahs', surah: s1, startAyah: a1, endSurah, endAyah,
                 ayahCount: countAyahs(s1, a1, endSurah, endAyah) };
      } else {
        const a2 = parseInt(wardForm.endAyah, 10);
        if (!Number.isFinite(a2) || a2 < a1 || a2 > max) {
          setWardError(`آية النهاية يجب أن تكون بين ${a1} و ${max}`); return;
        }
        ward = { mode: 'surah', surah: s1, startAyah: a1, endSurah: s1, endAyah: a2, ayahCount: a2 - a1 + 1 };
      }
    }

    setDailyWard(ward);
    setGlobal({ toast: '✅ تم تحديد وردك اليومي' });
  }

  function setWardField(field, raw) {
    const v = parseInt(raw, 10);
    setWardError('');
    setWardForm(w => ({ ...w, [field]: Number.isFinite(v) ? v : '' }));
  }

  const surahMax = SURAH_AYAH_COUNT[wardForm.surah - 1] || 7;
  const wardSurahCount = wardForm.endAyah - wardForm.startAyah + 1;
  const juzPreview = (() => {
    const row = JUZ_DATA[(wardForm.juz || 1) - 1];
    if (!row) return null;
    const [, s1, a1, s2, a2] = row;
    return { surah: s1, startAyah: a1, endSurah: s2, endAyah: a2, ayahCount: countAyahs(s1, a1, s2, a2) };
  })();

  // Ward history chart (last 14 days)
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const dateStr = localDateStr(d);
    const rec = hifz.wardHistory?.find(h => h.date === dateStr);
    return { dateStr, completed: !!rec?.completed, ayahs: rec?.wardAyahs || 0 };
  });

  // Stats
  // Per-juz progress by ayah ranges: ayahs of completed surahs that fall
  // inside the juz ÷ total ayahs of the juz
  const juzProgress = JUZ_DATA.map(([juz]) => {
    let done = 0, total = 0;
    for (const { surah, from, to } of juzSurahRanges(juz)) {
      const n = to - from + 1;
      total += n;
      if (hifz.surahStatus[surah] === 'completed') done += n;
    }
    const pct = total ? Math.floor((done / total) * 100) : 0;
    return { juz, done, total, pct: done === total && total ? 100 : pct };
  });

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('reader')}</Link>
        <h1>{t('hifzTitle')}</h1>
        <LangSwitcher compact={true} />
        <Link to="/dashboard" className={styles.backBtn}>{t('dashboard')}</Link>
      </div>

      {/* Hero stats */}
      <div className={styles.heroCard}>
        <BigProgressRing pct={progressPct} />
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroVal}>{completedSurahs}</span>
            <span className={styles.heroLbl}>{t('memorized_surahs')}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroVal}>{memorizedAyahs.toLocaleString('ar')}</span>
            <span className={styles.heroLbl}>{t('memorized_ayahs')}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroVal} style={{ color: '#f97316' }}>{streak} 🔥</span>
            <span className={styles.heroLbl}>يوم متتالي</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroVal} style={{ color: 'var(--green3)' }}>{inProgressSurahs}</span>
            <span className={styles.heroLbl}>قيد الحفظ</span>
          </div>
        </div>

        {/* Ward status */}
        {hifz.dailyWard && (
          <div className={styles.wardStatus}>
            <div className={styles.wardInfo}>
              <span>الورد اليومي: {hifz.dailyWard.mode === 'juz' ? `الجزء ${toArabicNum(hifz.dailyWard.juz)}` : `سورة ${SURAHS_META[hifz.dailyWard.surah - 1]?.[0] || ''}`}</span>
              <small>{wardRangeText(hifz.dailyWard)} ({hifz.dailyWard.ayahCount} آية)</small>
            </div>
            <button
              className={`${styles.wardDoneBtn} ${todayDone ? styles.wardDoneDone : ''}`}
              onClick={markWardDone}
              disabled={todayDone}
            >
              {todayDone ? '✅ تم اليوم' : '☑ أنهيت وردي'}
            </button>
          </div>
        )}
      </div>

      {/* Notification banner */}
      {notification === 'default' && (
        <div className={styles.notifBanner}>
          <span>🔔 فعّل الإشعارات على هذا الجهاز (التذكير اليومي التلقائي غير متاح بعد)</span>
          <button onClick={requestNotifications}>تفعيل</button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {[
          { id: 'tracker',      label: '📋 المتابعة' },
          { id: 'ward',         label: '☀️ الورد اليومي' },
          { id: 'stats',        label: '📊 الإحصائيات' },
          { id: 'achievements', label: '🏆 الإنجازات' },
        ].map(tk => (
          <button
            key={tk.id}
            className={`${styles.tab} ${activeTab === tk.id ? styles.activeTab : ''}`}
            onClick={() => setActiveTab(tk.id)}
          >{tk.label}</button>
        ))}
      </div>

      {/* ── TRACKER TAB ── */}
      {activeTab === 'tracker' && (
        <div className={styles.trackerTab}>
          <div className={styles.trackerControls}>
            <div className={styles.viewToggle}>
              <button className={`${styles.vtBtn} ${viewMode === 'surahs' ? styles.vtActive : ''}`}
                onClick={() => setViewMode('surahs')}>{t('surahs_view')}</button>
              <button className={`${styles.vtBtn} ${viewMode === 'juz' ? styles.vtActive : ''}`}
                onClick={() => setViewMode('juz')}>{t('juz_view')}</button>
              <button
                className={`${styles.vtBtn} ${viewMode === 'map' ? styles.vtActive : ''}`}
                onClick={() => setViewMode('map')}>🗺 خريطة</button>
            </div>
            <div className={styles.legend}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <span key={k} className={styles.legendItem}>
                  <span style={{ background: v.color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                  {v.label}
                </span>
              ))}
            </div>
          </div>

          {viewMode === 'surahs' ? (
            <div className={styles.surahGrid}>
              {SURAHS_META.map((meta, i) => {
                const num = i + 1;
                const status = hifz.surahStatus[num] || 'none';
                const sl = STATUS_LABELS[status];
                return (
                  <div
                    key={num}
                    className={styles.surahCard}
                    style={{ borderColor: sl.color + '44', background: sl.bg }}
                    onClick={() => handleSurahStatusClick(num)}
                    title={`اضغط لتغيير حالة الحفظ — ${sl.label}`}
                  >
                    <div className={styles.scNum} style={{ color: sl.color }}>{num}</div>
                    <div className={styles.scName}>{meta[0]}</div>
                    <div className={styles.scAyahs}>{meta[2]} آية</div>
                    <div className={styles.scStatus} style={{ color: sl.color, background: sl.bg }}>
                      {sl.label}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'map' ? (
            /* خريطة الحفظ البصرية */
        <div style={{ marginBottom: 24 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(52px,1fr))', gap:4, direction:'rtl' }}>
            {Array.from({ length: 114 }, (_, i) => {
              const num = i + 1;
              const status = hifz.surahStatus[num] || 'none';
              const clr = { none:'transparent', inProgress:'#c9a84c', completed:'#52b788', review:'#60a5fa' }[status];
              return (
                <button key={num}
                  title={SURAHS_META[i][0]}
                  onClick={() => setSurahStatus(num,
                    status==='none'?'inProgress':status==='inProgress'?'completed':status==='completed'?'review':'none')}
                  style={{
                    padding:'6px 2px', borderRadius:8, cursor:'pointer',
                    border:'1px solid ' + (status==='none'?'var(--border)':clr),
                    background: status==='none'?'var(--surface)': clr+'22',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:2, transition:'all .2s',
                  }}>
                  <span style={{fontSize:9,color:'var(--text3)'}}>{num}</span>
                  <span style={{fontSize:8,fontWeight:700,color:status==='none'?'var(--text3)':clr,lineHeight:1.2,textAlign:'center'}}>
                    {SURAHS_META[i][0].slice(0,5)}
                  </span>
                  <span style={{fontSize:10}}>
                    {status==='completed'?'✓':status==='inProgress'?'◑':status==='review'?'↺':''}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{display:'flex',gap:12,marginTop:14,flexWrap:'wrap',fontSize:12,color:'var(--text3)'}}>
            {[['var(--border)','لم يبدأ'],['#c9a84c','قيد الحفظ'],['#52b788','محفوظ'],['#60a5fa','للمراجعة']].map(([clr,lbl])=>(
              <span key={lbl} style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{width:12,height:12,borderRadius:3,background:clr+'44',border:`1px solid ${clr}`,display:'inline-block'}}/>
                {lbl}
              </span>
            ))}
          </div>
        </div>
          ) : (
            <div className={styles.juzList}>
              {juzProgress.map(({ juz, done, total, pct }) => (
                <div key={juz} className={styles.juzRow}>
                  <div className={styles.juzNum}>
                    <span>{juz}</span>
                    <small>الجزء</small>
                  </div>
                  <div className={styles.juzInfo}>
                    <div className={styles.juzHeader}>
                      <span>الجزء {toArabicNum(juz)}</span>
                      <span className={styles.juzPct}>{done}/{total} آية</span>
                    </div>
                    <MiniBar pct={pct}
                      color={pct === 100 ? 'var(--green3)' : pct > 0 ? 'var(--gold)' : 'var(--border)'} />
                  </div>
                  <div className={styles.juzPctBig}
                    style={{ color: pct === 100 ? 'var(--green3)' : 'var(--gold)' }}>
                    {pct}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── WARD TAB ── */}
      {activeTab === 'ward' && (
        <div className={styles.wardTab}>
          <div className={styles.wardFormCard}>
            <h3>تحديد الورد اليومي</h3>

            <div className={styles.wardModes}>
              {['surah', 'juz', 'ayahs'].map(m => (
                <button
                  key={m}
                  className={`${styles.wardModeBtn} ${wardForm.mode === m ? styles.wardModeBtnActive : ''}`}
                  onClick={() => setWardForm(w => ({ ...w, mode: m }))}
                >
                  {m === 'surah' ? '📖 بالسورة' : m === 'juz' ? '📕 بالجزء' : '🔢 بعدد الآيات'}
                </button>
              ))}
            </div>

            {(wardForm.mode === 'surah' || wardForm.mode === 'ayahs') && (
              <div className={styles.wardFields}>
                <div className={styles.wardField}>
                  <label>{wardForm.mode === 'ayahs' ? 'البداية من سورة' : 'السورة'}</label>
                  <select value={wardForm.surah}
                    onChange={e => {
                      const s = parseInt(e.target.value, 10);
                      setWardError('');
                      setWardForm(w => ({ ...w, surah: s, startAyah: 1, endAyah: SURAH_AYAH_COUNT[s-1] }));
                    }}>
                    {SURAHS_META.map((m, i) => (
                      <option key={i+1} value={i+1}>{i+1}. {m[0]}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.wardFieldRow}>
                  <div className={styles.wardField}>
                    <label>من الآية</label>
                    <input type="number" min="1" max={surahMax}
                      value={wardForm.startAyah}
                      onChange={e => setWardField('startAyah', e.target.value)} />
                  </div>
                  {wardForm.mode === 'surah' && (
                    <div className={styles.wardField}>
                      <label>إلى الآية</label>
                      <input type="number" min={wardForm.startAyah || 1} max={surahMax}
                        value={wardForm.endAyah}
                        onChange={e => setWardField('endAyah', e.target.value)} />
                    </div>
                  )}
                </div>
                {wardForm.mode === 'surah' && (
                  <div className={styles.wardSummary}>
                    عدد الآيات: <strong>{Number.isFinite(wardSurahCount) ? Math.max(0, wardSurahCount) : 0} آية</strong>
                    {' '}من سورة {SURAHS_META[wardForm.surah-1][0]}
                  </div>
                )}
              </div>
            )}

            {wardForm.mode === 'juz' && (
              <div className={styles.wardFields}>
                <div className={styles.wardField}>
                  <label>الجزء</label>
                  <select value={wardForm.juz}
                    onChange={e => { setWardError(''); setWardForm(w => ({ ...w, juz: parseInt(e.target.value, 10) })); }}>
                    {Array.from({ length: 30 }, (_, i) => (
                      <option key={i+1} value={i+1}>الجزء {toArabicNum(i+1)}</option>
                    ))}
                  </select>
                </div>
                {juzPreview && (
                  <div className={styles.wardSummary}>
                    {wardRangeText(juzPreview)} — <strong>{juzPreview.ayahCount} آية</strong>
                  </div>
                )}
                <div className={styles.wardSummary}>
                  حفظ ربع جزء يومياً يُكمل القرآن في 4 أشهر 🎯
                </div>
              </div>
            )}

            {wardForm.mode === 'ayahs' && (
              <div className={styles.wardFields} style={{ marginTop: 14 }}>
                <div className={styles.wardField}>
                  <label>عدد الآيات يومياً</label>
                  <input type="number" min="1" max="50"
                    value={wardForm.count}
                    onChange={e => setWardField('count', e.target.value)} />
                </div>
                <div className={styles.wardSuggestions}>
                  {[3, 5, 10, 20].map(n => (
                    <button key={n}
                      className={`${styles.suggBtn} ${wardForm.count === n ? styles.suggActive : ''}`}
                      onClick={() => { setWardError(''); setWardForm(w => ({ ...w, count: n })); }}>
                      {n} آيات
                    </button>
                  ))}
                </div>
                {wardForm.count >= 1 && (
                  <div className={styles.wardSummary}>
                    بـ {wardForm.count} آيات يومياً ستُنهي القرآن في{' '}
                    <strong>{Math.ceil(TOTAL_AYAHS / wardForm.count)} يوم</strong>
                  </div>
                )}
              </div>
            )}

            {wardError && (
              <div className={styles.wardError} role="alert">⚠️ {wardError}</div>
            )}

            <button className={styles.saveWardBtn} onClick={saveWard}>
              💾 حفظ الورد اليومي
            </button>
          </div>

          {/* Ward history */}
          <div className={styles.wardHistoryCard}>
            <h3>{t('days_record')} — {t('last_14_days')}</h3>
            <div className={styles.wardCalendar}>
              {last14.map((d, i) => (
                <div key={i}
                  className={`${styles.calDay} ${d.completed ? styles.calDone : ''}`}
                  title={d.dateStr}>
                  <span>{d.completed ? '✓' : '·'}</span>
                </div>
              ))}
            </div>
            <div className={styles.wardCalLegend}>
              <span className={styles.calDone2}>✓ تم</span>
              <span>· لم يتم</span>
              <span className={styles.streakBadge}>🔥 {streak} يوم متواصل</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STATS TAB ── */}
      {activeTab === 'stats' && (
        <div className={styles.statsTab}>
          {/* Progress bars by status */}
          <div className={styles.statsCard}>
            <h3>توزيع الحفظ</h3>
            {Object.entries(STATUS_LABELS).map(([k, v]) => {
              const count = Object.values(hifz.surahStatus).filter(s => s === k).length;
              const pct = Math.round((count / 114) * 100);
              return (
                <div key={k} className={styles.distRow}>
                  <span style={{ color: v.color, minWidth: 80 }}>{v.label}</span>
                  <div className={styles.distBar}>
                    <div style={{ width: `${pct}%`, background: v.color, height: '100%', borderRadius: 4, transition: 'width 0.8s ease' }} />
                  </div>
                  <span className={styles.distCount}>{count} سورة ({pct}%)</span>
                </div>
              );
            })}
          </div>

          {/* Summary stats */}
          <div className={styles.statsSummaryGrid}>
            <div className={styles.statsSummaryCard}>
              <div className={styles.ssIcon}>📖</div>
              <div className={styles.ssVal}>{memorizedAyahs.toLocaleString()}</div>
              <div className={styles.ssLbl}>{t('memorized_ayahs')}</div>
              <div className={styles.ssSub}>من أصل {TOTAL_AYAHS.toLocaleString()}</div>
            </div>
            <div className={styles.statsSummaryCard}>
              <div className={styles.ssIcon}>📚</div>
              <div className={styles.ssVal}>{completedSurahs}</div>
              <div className={styles.ssLbl}>سورة مكتملة</div>
              <div className={styles.ssSub}>من 114 سورة</div>
            </div>
            <div className={styles.statsSummaryCard}>
              <div className={styles.ssIcon}>🔥</div>
              <div className={styles.ssVal}>{bestStreak}</div>
              <div className={styles.ssLbl}>أيام متواصلة</div>
              <div className={styles.ssSub}>أفضل انجاز لك</div>
            </div>
            <div className={styles.statsSummaryCard}>
              <div className={styles.ssIcon}>🎯</div>
              <div className={styles.ssVal}>{progressPct}%</div>
              <div className={styles.ssLbl}>نسبة الإنجاز</div>
              <div className={styles.ssSub}>من القرآن الكريم</div>
            </div>
          </div>

          {/* Juz breakdown */}
          <div className={styles.statsCard}>
            <h3>تقدم الأجزاء</h3>
            <div className={styles.juzGrid}>
              {juzProgress.map(({ juz, pct }) => (
                <div key={juz}
                  className={styles.juzCell}
                  style={{
                    background: pct === 100 ? 'rgba(82,183,136,0.2)' : pct > 0 ? 'rgba(201,168,76,0.1)' : 'var(--surface2)',
                    borderColor: pct === 100 ? 'var(--green3)' : pct > 0 ? 'var(--gold)' : 'var(--border)',
                  }}>
                  <span style={{ fontSize: 11, color: pct === 100 ? 'var(--green3)' : pct > 0 ? 'var(--gold)' : 'var(--text3)' }}>
                    {juz}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text3)' }}>{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ACHIEVEMENTS TAB ── */}
      {activeTab === 'achievements' && (
        <div className={styles.achievementsTab}>
          <div className={styles.achieveHeader}>
            <span>🏆 {hifz.unlockedAchievements?.length || 0} / {ACHIEVEMENTS.length} إنجازات مكتسبة</span>
            <MiniBar pct={Math.round(((hifz.unlockedAchievements?.length || 0) / ACHIEVEMENTS.length) * 100)} color="var(--gold)" />
          </div>
          <div className={styles.badgesGrid}>
            {ACHIEVEMENTS.map(a => (
              <AchievementBadge
                key={a.id}
                achievement={a}
                unlocked={hifz.unlockedAchievements?.includes(a.id)}
              />
            ))}
          </div>
          <div className={styles.achieveTip}>
            💡 اضغط على بطاقات السور في تبويب المتابعة لتغيير حالة الحفظ وفتح الإنجازات
          </div>
        </div>
      )}
    </div>
  );
}

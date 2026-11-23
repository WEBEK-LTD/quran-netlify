import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, displayNameOf, avatarOf } from '../hooks/useAuth';
import { loadProgress, loadBookmarks, loadNotes, loadStats, getBroadcasts } from '../backend';
import { SURAHS_META } from '../data';
import { useHifz, localDateStr } from '../hifzStore';
import styles from './DashboardPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

function StatCard({ icon, label, value, sub }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statInfo}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {sub && <div className={styles.statSub}>{sub}</div>}
      </div>
    </div>
  );
}

// All dates are LOCAL 'YYYY-MM-DD' strings
function todayStr() { return localDateStr(); }
function prevDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); // local noon to avoid DST issues
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}
function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const dateset = new Set(sessions.map(s => s.date));
  let streak = 0;
  let cur = todayStr();
  // allow today OR yesterday as starting point (user might not have read today yet)
  if (!dateset.has(cur)) cur = prevDay(cur);
  while (dateset.has(cur)) {
    streak++;
    cur = prevDay(cur);
  }
  return streak;
}

function last7Days(sessions) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dateStr = localDateStr(d);
    const count = sessions.filter(s => s.date === dateStr).reduce((a, b) => a + (b.ayah_count || 0), 0);
    return { count, label: ['أح','اث','ثل','أر','خم','جم','سب'][d.getDay()] };
  });
}

export default function DashboardPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { completedSurahs, memorizedAyahs, progressPct, streak: hifzStreak } = useHifz(user?.id);

  const [progress,  setProgress]  = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [notes,     setNotes]     = useState([]);
  const [sessions,    setSessions]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [syncErr,     setSyncErr]     = useState(false);
  const [broadcasts,  setBroadcasts]  = useState([]);
  const [dismissedBC, setDismissedBC] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nq_dismissed_bc') || '[]'); } catch { return []; }
  });

  // Local fallbacks
  const localBookmarks = JSON.parse(localStorage.getItem('nq_bookmarks') || '[]');
  const localNotes     = JSON.parse(localStorage.getItem('nq_notes')     || '[]');
  const localLastRead  = JSON.parse(localStorage.getItem('nq_lastRead')  || '{"surah":1,"ayah":1}');
  const khatmat = JSON.parse(localStorage.getItem('nq_khatmat') || '[]');

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    // Broadcasts for everyone (signed in or not)
    getBroadcasts().then(list => { if (alive) setBroadcasts(list || []); }).catch(() => {});
    if (user) {
      setSyncErr(false);
      Promise.allSettled([
        loadProgress(user.id),
        loadBookmarks(user.id),
        loadNotes(user.id),
        loadStats(user.id),
      ]).then(([prog, bkm, nts, sess]) => {
        if (!alive) return;
        const val = (r, d) => (r.status === 'fulfilled' ? r.value : d);
        setProgress(val(prog, null));
        const b = val(bkm, []), n = val(nts, []);
        setBookmarks(b?.length ? b : localBookmarks);
        setNotes(n?.length ? n : localNotes);
        setSessions(val(sess, []) || []);
        setSyncErr([prog, bkm, nts, sess].some(r => r.status === 'rejected'));
        setLoading(false);
      });
    } else {
      setBookmarks(localBookmarks);
      setNotes(localNotes);
      setLoading(false);
    }
    return () => { alive = false; };
  }, [user, authLoading]);

  const displayBookmarks = bookmarks.length ? bookmarks : localBookmarks;
  const displayNotes     = notes.length     ? notes     : localNotes;
  // استخرج الـ streak المحلي من localStorage كـ fallback
  const localReadDates = (() => {
    try { return JSON.parse(localStorage.getItem('nq_read_dates') || '[]'); } catch { return []; }
  })();
  const localSessions = localReadDates.map(date => ({ date }));
  const remoteStreak = calcStreak(sessions);
  const localStreak  = calcStreak(localSessions);
  const streak = Math.max(hifzStreak, remoteStreak, localStreak);
  // دمج الجلسات المحلية مع بيانات الحساب للرسم البياني
  const mergedSessions = (() => {
    const all = [...sessions];
    for (const d of localReadDates) {
      if (!all.find(s => s.date === d)) all.push({ date: d, ayah_count: 1 });
    }
    return all;
  })();
  const chartDays = last7Days(mergedSessions);
  const chartMax      = Math.max(...chartDays.map(d => d.count), 1);
  // عدد أيام القراءة (لا تتوفر أعداد آيات حقيقية — الجلسات تسجّل أياماً لا آيات)
  const readingDays = new Set(mergedSessions.map(s => s.date).filter(Boolean)).size;
  const lastSurah        = progress
    ? SURAHS_META[progress.surah - 1]?.[0]
    : SURAHS_META[localLastRead.surah - 1]?.[0] || '—';
  const lastAyah         = progress?.ayah || localLastRead.ayah;

  const displayName  = displayNameOf(user, 'الزائر');
  const avatarUrl    = avatarOf(user);
  const avatarLetter = displayName[0]?.toUpperCase() || '؟';

  function dismissBroadcast(id) {
    const next = [...dismissedBC, id];
    setDismissedBC(next);
    localStorage.setItem('nq_dismissed_bc', JSON.stringify(next));
  }

  const visibleBroadcasts = broadcasts.filter(b => !dismissedBC.includes(b.id));

  if (authLoading || loading) return <div className={styles.loadingPage}><div className={styles.spinner} /></div>;

  const BC_ICONS = { info: 'ℹ️', warning: '⚠️', success: '✅', error: '🚨' };
  const BC_COLORS = { info: 'var(--gold)', warning: '#f59e0b', success: '#52b788', error: '#f87171' };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/reader" className={styles.backBtn}>{t('reader')}</Link>
        <h1 className={styles.pageTitle}>{t('dashboardTitle')}</h1>
        <LangSwitcher compact={true} />
        {user
          ? <button className={styles.signOutBtn} onClick={async () => { await signOut(); navigate('/'); }}>{t('logout')}</button>
          : <Link to="/login" className={styles.signOutBtn}>{t('login')}</Link>
        }
      </div>

      {/* Broadcast banners */}
      {visibleBroadcasts.map(bc => (
        <div key={bc.id} style={{
          margin:'0 0 12px',
          padding:'12px 16px',
          borderRadius:10,
          background: (BC_COLORS[bc.type] || BC_COLORS.info) + '18',
          border: `1px solid ${BC_COLORS[bc.type] || BC_COLORS.info}44`,
          display:'flex', alignItems:'flex-start', gap:10,
          direction:'rtl',
        }}>
          <span style={{ fontSize:18, flexShrink:0 }}>{BC_ICONS[bc.type] || 'ℹ️'}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, color:'var(--text)', fontSize:14, marginBottom:2 }}>{bc.title}</div>
            <div style={{ color:'var(--text2)', fontSize:13, lineHeight:1.5 }}>{bc.body}</div>
          </div>
          <button
            onClick={() => dismissBroadcast(bc.id)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:18, lineHeight:1, padding:0, flexShrink:0 }}
            title="إغلاق"
          >×</button>
        </div>
      ))}

      {syncErr && (
        <p role="alert" style={{ color:'#f87171', fontSize:13, textAlign:'center', margin:'0 0 12px' }}>
          ⚠️ تعذّر تحميل بعض بيانات حسابك — تُعرض البيانات المحفوظة على هذا الجهاز
        </p>
      )}

      {/* Greeting */}
      <div className={styles.greeting}>
        <div className={styles.avatar}>
          {avatarUrl ? <img src={avatarUrl} alt="avatar" /> : <span>{avatarLetter}</span>}
        </div>
        <div>
          <h2>أهلاً، {displayName} 🌿</h2>
          <p>{user ? user.email : 'البيانات محفوظة محلياً على جهازك'}</p>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <StatCard icon="📖" label={t('lastRead')}      value={lastSurah}       sub={`${t('ayah_label')} ${lastAyah}`} />
        <StatCard icon="🔥" label={t('streak')}       value={`${streak} ${t('day_unit')}`} />
        <StatCard icon="📚" label={t('hifzProgress')} value={completedSurahs} sub={`${progressPct}% ${t('of_quran')}`} />
        <StatCard icon="✨" label="أيام القراءة"   value={readingDays.toLocaleString('ar')} />
        <StatCard icon="🔖" label={t('favoritesTitle')} value={displayBookmarks.length} />
        <StatCard icon="📝" label={t('notesTitle')}   value={displayNotes.length} />
      </div>

      {/* Chart */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('reading_activity')} — {t('last_7_days')}</h3>
        <div className={styles.chartWrap}>
          {chartDays.map((d, i) => (
            <div key={i} className={styles.chartBar}>
              <div className={styles.barWrap}>
                <div className={styles.bar}
                  style={{ height: `${(d.count / chartMax) * 100}%`,
                    background: d.count > 0 ? 'var(--green2)' : 'var(--border)' }} />
              </div>
              <span className={styles.barLabel}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('quick_actions')}</h3>
        <div className={styles.actionsGrid}>
          <Link to="/hifz"      className={styles.actionCard}><span>📚</span><span>نظام الحفظ</span><small>{completedSurahs} سورة</small></Link>
          <Link to="/reader"          className={styles.actionCard}><span>📖</span><span>متابعة القراءة</span><small>سورة {lastSurah}</small></Link>
          <Link to="/favorites" className={styles.actionCard}><span>🔖</span><span>المفضلة</span><small>{displayBookmarks.length} آية</small></Link>
          <Link to="/notes"     className={styles.actionCard}><span>📝</span><span>ملاحظاتي</span><small>{displayNotes.length} ملاحظة</small></Link>
          <Link to="/search"      className={styles.actionCard}><span>🔍</span><span>البحث</span><small>في كل القرآن</small></Link>
          <Link to="/khatma"     className={styles.actionCard}><span>📿</span><span>الختمات</span><small>{khatmat.length} ختمة</small></Link>
          <Link to="/leaderboard" className={styles.actionCard}><span>🏆</span><span>المتصدرون</span><small>تحدّ الآخرين</small></Link>
          <Link to="/support"      className={styles.actionCard}><span>💬</span><span>الدعم</span><small>تواصل معنا</small></Link>
          <Link to="/prayer-times" className={styles.actionCard}><span>🕌</span><span>أوقات الصلاة</span><small>مواعيد اليوم</small></Link>
          <Link to="/qibla"        className={styles.actionCard}><span>🧭</span><span>القبلة</span><small>اتجاه الكعبة</small></Link>
          <Link to="/adhkar"       className={styles.actionCard}><span>📿</span><span>أذكاري</span><small>صباح ومساء</small></Link>
          <Link to="/radio"         className={styles.actionCard}><span>📻</span><span>الراديو</span><small>بث إسلامي</small></Link>
          <Link to="/tasbih"        className={styles.actionCard}><span>📿</span><span>السبحة</span><small>عدّاد التسبيح</small></Link>
          <Link to="/daily-ayah"    className={styles.actionCard}><span>✨</span><span>آية اليوم</span><small>تأمل يومي</small></Link>
          <Link to="/report"          className={styles.actionCard}><span>📊</span><span>تقريري</span><small>إحصائياتك</small></Link>
          <Link to="/settings"   className={styles.actionCard}><span>⚙️</span><span>الإعدادات</span><small>تخصيص العرض</small></Link>
        </div>
      </div>

      {displayBookmarks.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>🔖 آخر المحفوظات</h3>
          <div className={styles.bookmarkList}>
            {displayBookmarks.slice(0, 5).map((b, i) => {
              const meta = SURAHS_META[b.surah - 1];
              return (
                <Link key={i} to={`/reader?surah=${b.surah}&ayah=${b.ayah}`} className={styles.bookmarkItem}>
                  <div className={styles.bmIcon}>🔖</div>
                  <div><strong>{meta?.[0]}</strong><span> — الآية {b.ayah}</span></div>
                  <span className={styles.bmRef}>{b.surah}:{b.ayah}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {displayNotes.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>📝 آخر الملاحظات</h3>
          <div className={styles.notesList}>
            {displayNotes.slice(0, 3).map((n, i) => (
              <div key={i} className={styles.noteItem}>
                <div className={styles.noteRef}>{SURAHS_META[n.surah-1]?.[0]} — الآية {n.ayah}</div>
                <div className={styles.noteText}>{n.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { loadStats } from '../supabase';
import { useHifz, localDateStr, parseLocalDate } from '../hifzStore';
import { SURAHS_META } from '../data';
import styles from './ReportPage.module.css';

function toAr(n) {
  return String(Math.round(n)).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// 'YYYY-MM-DD' parsed as a LOCAL date (new Date('YYYY-MM-DD') is UTC midnight
// and shifts to the previous day west of Greenwich)
function getMonthSessions(sessions, year, month) {
  return sessions.filter(s => {
    const d = parseLocalDate(s.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });
}

function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const dates = new Set(sessions.map(s => s.date));
  let streak = 0, cur = new Date();
  const fmt = d => localDateStr(d);
  if (!dates.has(fmt(cur))) { cur.setDate(cur.getDate() - 1); }
  while (dates.has(fmt(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export default function ReportPage() {
  const { user } = useAuth();
  const { hifz, completedSurahs, memorizedAyahs, progressPct } = useHifz(user?.id);
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selMonth, setSelMonth] = useState(() => new Date().getMonth());
  const [selYear,  setSelYear]  = useState(() => new Date().getFullYear());

  // Guests (and offline users) see local reading days from this device
  const localSessions = (() => {
    try {
      const dates = JSON.parse(localStorage.getItem('nq_read_dates') || '[]');
      return Array.isArray(dates) ? dates.map(date => ({ date, ayah_count: 0 })) : [];
    } catch { return []; }
  })();
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    if (!user) { setSessions(localSessions); setLoading(false); return; }
    let alive = true;
    setLoadErr(false);
    loadStats(user.id)
      .then(data => { if (alive) setSessions(data?.length ? data : localSessions); })
      .catch(() => { if (alive) { setSessions(localSessions); setLoadErr(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user]);

  // Month stats
  const monthSess   = getMonthSessions(sessions, selYear, selMonth);
  const totalAyahs  = monthSess.reduce((s, r) => s + (r.ayah_count || 0), 0);
  const activeDays  = new Set(monthSess.map(s => s.date)).size;
  const avgPerDay   = activeDays ? totalAyahs / activeDays : 0;
  const bestDay     = monthSess.reduce((best, r) => r.ayah_count > (best?.ayah_count || 0) ? r : best, null);
  const streak      = calcStreak(sessions);

  // Days in month grid
  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const firstDay    = new Date(selYear, selMonth, 1).getDay();
  const dateMap     = {};
  monthSess.forEach(s => { dateMap[s.date] = (dateMap[s.date] || 0) + (s.ayah_count || 0); });
  const maxAyahs = Math.max(...Object.values(dateMap), 1);
  const activeDates = new Set(monthSess.map(s => s.date));

  // All-time totals
  const allAyahs = sessions.reduce((s, r) => s + (r.ayah_count || 0), 0);
  const allDays  = new Set(sessions.map(s => s.date)).size;

  // Ward history
  const wardDays = (hifz.wardHistory || []).filter(h => h.completed).length;

  // Print / export
  function printReport() { window.print(); }

  if (loading) return (
    <div className={styles.center}><div className={styles.spinner}/></div>
  );


  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>← رجوع</Link>
        <h1 className={styles.pageTitle}>📊 التقرير الشهري</h1>
        <button className={styles.printBtn} onClick={printReport}>🖨️</button>
      </div>

      {!user && (
        <div className={styles.notice}>
          🔐 تعرض هذه الصفحة البيانات المحفوظة على هذا الجهاز فقط.{' '}
          <Link to="/login" className={styles.noticeLink}>سجّل الدخول</Link> لمزامنة تقريرك.
        </div>
      )}
      {loadErr && (
        <div className={styles.notice}>⚠️ تعذّر تحميل بياناتك من الخادم — تُعرض البيانات المحلية</div>
      )}

      {/* Month selector */}
      <div className={styles.monthSelector}>
        <button className={styles.navBtn}
          onClick={() => {
            if (selMonth === 0) { setSelMonth(11); setSelYear(y => y-1); }
            else setSelMonth(m => m-1);
          }}>‹</button>
        <div className={styles.monthLabel}>
          {MONTHS_AR[selMonth]} {toAr(selYear)}
        </div>
        <button className={styles.navBtn}
          onClick={() => {
            if (selMonth === 11) { setSelMonth(0); setSelYear(y => y+1); }
            else setSelMonth(m => m+1);
          }}
          disabled={selYear === new Date().getFullYear() && selMonth === new Date().getMonth()}>
          ›
        </button>
      </div>

      {/* Month stats cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} style={{'--sc':'#52b788'}}>
          <div className={styles.scIcon}>📖</div>
          <div className={styles.scVal}>{toAr(totalAyahs)}</div>
          <div className={styles.scLabel}>آية مقروءة</div>
        </div>
        <div className={styles.statCard} style={{'--sc':'#c9a84c'}}>
          <div className={styles.scIcon}>📅</div>
          <div className={styles.scVal}>{toAr(activeDays)}</div>
          <div className={styles.scLabel}>يوم نشاط</div>
        </div>
        <div className={styles.statCard} style={{'--sc':'#f97316'}}>
          <div className={styles.scIcon}>⚡</div>
          <div className={styles.scVal}>{toAr(avgPerDay)}</div>
          <div className={styles.scLabel}>آية/يوم متوسط</div>
        </div>
        <div className={styles.statCard} style={{'--sc':'#8b5cf6'}}>
          <div className={styles.scIcon}>🔥</div>
          <div className={styles.scVal}>{toAr(streak)}</div>
          <div className={styles.scLabel}>أيام متتالية</div>
        </div>
      </div>

      {/* Calendar heatmap */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>📅 خريطة القراءة</h3>
        <div className={styles.calendar}>
          {/* Day headers */}
          {['أح','اث','ثل','أر','خم','جم','سب'].map(d => (
            <div key={d} className={styles.calHeader}>{d}</div>
          ))}
          {/* Empty cells before first day */}
          {Array.from({length: firstDay}, (_, i) => (
            <div key={'e'+i} className={styles.calEmpty} />
          ))}
          {/* Day cells */}
          {Array.from({length: daysInMonth}, (_, i) => {
            const day  = i + 1;
            const date = `${selYear}-${String(selMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const cnt  = dateMap[date] || 0;
            const active = activeDates.has(date);
            const pct  = cnt / maxAyahs;
            const isToday = date === localDateStr();
            return (
              <div key={day} className={`${styles.calDay} ${isToday ? styles.calToday : ''}`}
                title={cnt ? `${day} — ${cnt} آية` : String(day)}
                style={{
                  background: active
                    ? `rgba(82,183,136,${0.15 + pct * 0.75})`
                    : 'var(--surface)',
                  borderColor: active ? `rgba(82,183,136,${0.3 + pct*0.4})` : undefined,
                }}>
                <span className={styles.calDayNum}>{toAr(day)}</span>
                {cnt > 0 && <span className={styles.calCount}>{toAr(cnt)}</span>}
              </div>
            );
          })}
        </div>
        {bestDay && (
          <p className={styles.bestDay}>
            🏆 أفضل يوم: {parseLocalDate(bestDay.date)?.toLocaleDateString('ar', {day:'numeric',month:'long'})} — {toAr(bestDay.ayah_count)} آية
          </p>
        )}
      </div>

      {/* All-time stats */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>🌟 الإحصائيات الكاملة</h3>
        <div className={styles.allTimeGrid}>
          {[
            { icon:'📖', label:'إجمالي الآيات المقروءة', val: toAr(allAyahs) },
            { icon:'📅', label:'أيام القراءة', val: toAr(allDays) },
            { icon:'📚', label:'سور محفوظة', val: toAr(completedSurahs) },
            { icon:'✨', label:'آيات محفوظة', val: toAr(memorizedAyahs) },
            { icon:'📊', label:'نسبة الحفظ', val: `${toAr(progressPct)}%` },
            { icon:'📿', label:'أيام الورد المكتملة', val: toAr(wardDays) },
          ].map(({ icon, label, val }) => (
            <div key={label} className={styles.allTimeRow}>
              <span className={styles.atIcon}>{icon}</span>
              <span className={styles.atLabel}>{label}</span>
              <span className={styles.atVal}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ward history chart */}
      {hifz.wardHistory?.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>📿 سجل الورد — آخر 14 يوم</h3>
          <div className={styles.wardChart}>
            {(hifz.wardHistory || []).slice(-14).map((w, i) => (
              <div key={i} className={styles.wardBar} title={w.date}>
                <div className={styles.wardTrack}>
                  <div className={`${styles.wardBarFill} ${w.completed ? styles.wardDone : styles.wardMiss}`}
                    style={{ height: w.completed ? '100%' : '20%' }} />
                </div>
                <span className={styles.wardLabel}>
                  {parseLocalDate(w.date)?.getDate()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share / print */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={printReport}>
          🖨️ طباعة / PDF
        </button>
      </div>
    </div>
  );
}

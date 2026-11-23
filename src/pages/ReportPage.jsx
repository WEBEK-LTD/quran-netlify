// ─── Monthly report ──────────────────────────────────────────────────────────
// Reading days from /me/stats (signed in) or this device's `nq_read_dates`
// (guests / offline), plus hifz figures from useHifz. Month navigation, a
// heat-map calendar, a daily bar chart, all-time figures and the ward record.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { loadStats } from '../backend';
import { useHifz, localDateStr, parseLocalDate } from '../hifzStore';
import { PageHero, Icon, Badge8, toAr as toArRaw } from '../components/ornaments/Ornaments';
import { useTr, num, intlLocale, isRtl } from '../l10n';
import styles from './ReportPage.module.css';

const toAr = n => toArRaw(Math.round(n));

// Month and weekday names in the visitor's language (ar-EG gives يناير… / الأحد…)
const monthName = m => new Date(2024, m, 1).toLocaleDateString(intlLocale(), { month: 'long' });
// [full name, column label] for Sunday…Saturday (7 Jan 2024 is a Sunday)
function weekDays() {
  const loc = intlLocale();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i);
    const full = d.toLocaleDateString(loc, { weekday: 'long' });
    const short = loc === 'ar-EG' ? full.replace('ال', '').slice(0, 2) : d.toLocaleDateString(loc, { weekday: 'short' });
    return [full, short];
  });
}

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
  let streak = 0;
  const cur = new Date();
  const fmt = d => localDateStr(d);
  if (!dates.has(fmt(cur))) { cur.setDate(cur.getDate() - 1); }
  while (dates.has(fmt(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

// heat level 0–4 for a day's ayah count
function level(cnt, active, max) {
  if (!active) return 0;
  if (!cnt) return 1;
  const p = cnt / max;
  return p > 0.75 ? 4 : p > 0.5 ? 3 : p > 0.25 ? 2 : 1;
}

export default function ReportPage() {
  const tr = useTr();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const dateOf = day => `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const today = localDateStr();

  // All-time totals
  const allAyahs = sessions.reduce((s, r) => s + (r.ayah_count || 0), 0);
  const allDays  = new Set(sessions.map(s => s.date)).size;

  // Ward record: completed days and the last 14 calendar days
  const wardDays = (hifz.wardHistory || []).filter(h => h.completed).length;
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const ds = localDateStr(d);
    const rec = (hifz.wardHistory || []).find(h => h.date === ds);
    return { d, ds, done: !!rec?.completed, ayahs: rec?.wardAyahs || 0 };
  });

  const now = new Date();
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth();
  function prevMonth() {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  }

  function printReport() { window.print(); }

  const hero = (
    <PageHero eyebrow={tr('تقريرك')} title={tr('التقرير الشهري')} sub={tr('صورة هادئة لقراءتك وحفظك، شهراً بعد شهر.')}>
      <button type="button" className="nq-btn ghost" onClick={printReport}><Icon name="download" />{tr('طباعة أو حفظ PDF')}</button>
      <Link className="nq-btn ghost" to="/dashboard"><Icon name="chart" />{tr('لوحة التقدّم')}</Link>
    </PageHero>
  );

  if (loading) return (
    <div className={styles.page}>
      {hero}
      <div className={styles.center} role="status" aria-label={tr('جارٍ التحميل')}><div className={styles.spinner} /></div>
    </div>
  );

  const hasMonthData = monthSess.length > 0;
  const MONTH = monthName(selMonth);
  const WEEK = weekDays();

  return (
    <div className={styles.page}>
      {hero}

      <div className="nq-wrap">
        {!user && (
          <p className={styles.notice}>
            <Icon name="lock" />
            <span>{tr('تعرض هذه الصفحة البيانات المحفوظة على هذا الجهاز فقط.')} <Link to="/login">{tr('سجّل الدخول')}</Link> {tr('لمزامنة تقريرك.')}</span>
          </p>
        )}
        {loadErr && <p className={`${styles.notice} ${styles.noticeErr}`}>{tr('تعذّر تحميل بياناتك من الخادم، تُعرض البيانات المحلية.')}</p>}

        {/* ── month selector ── */}
        <div className={styles.month}>
          <button type="button" className="nq-ibtn" onClick={prevMonth} aria-label={tr('الشهر السابق')}><Icon name="back" className={styles.icoBack} /></button>
          <div className={styles.monthLbl} aria-live="polite">
            <span className={styles.monthName}>{isRtl() ? MONTH : MONTH.charAt(0).toLocaleUpperCase(intlLocale()) + MONTH.slice(1)}</span>
            <span className={`nq-num ${styles.monthYear}`}>{toAr(selYear)}</span>
          </div>
          <button type="button" className="nq-ibtn" onClick={nextMonth} disabled={isCurrentMonth} aria-label={tr('الشهر التالي')}>
            <Icon name="back" className={styles.icoNext} />
          </button>
        </div>

        {/* ── KPIs ── */}
        <div className={styles.kpis}>
          {[
            { icon: 'book', v: totalAyahs, l: tr('آية مقروءة'), s: tr('في هذا الشهر') },
            { icon: 'calendar', v: activeDays, l: tr('يوم قراءة'), s: tr('من {n} يوماً', { n: toAr(daysInMonth) }) },
            { icon: 'chart', v: avgPerDay, l: tr('آية في اليوم'), s: tr('متوسط أيام القراءة') },
            { icon: 'timer', v: streak, l: tr('أيام متتالية'), s: tr('حتى اليوم') },
          ].map(k => (
            <div key={k.l} className={`nq-card ${styles.kpi}`}>
              <Badge8 icon={k.icon} size={44} />
              <b className="nq-num">{toAr(k.v)}</b>
              <span>{k.l}</span>
              <small>{k.s}</small>
            </div>
          ))}
        </div>

        <div className={`${styles.grid} ${styles.gridTop}`}>
          {/* ── heat-map calendar ── */}
          <section className={`nq-card ${styles.card}`} aria-labelledby="rp-cal">
            <h2 id="rp-cal" className={styles.h3}>{tr('خريطة القراءة')}</h2>
            <div className={styles.cal} role="grid" aria-label={tr('أيام القراءة في {m}', { m: MONTH })}>
              {WEEK.map(([full, short]) => <div key={full} className={styles.calHead} role="columnheader" title={full}>{short}</div>)}
              {Array.from({ length: firstDay }, (_, i) => <div key={'e' + i} aria-hidden="true" />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const date = dateOf(day);
                const cnt = dateMap[date] || 0;
                const active = activeDates.has(date);
                const lv = level(cnt, active, maxAyahs);
                return (
                  <div key={day} role="gridcell"
                    className={`${styles.day} ${styles['l' + lv]} ${date === today ? styles.today : ''}`}
                    title={cnt ? `${toAr(day)} — ${tr('{n} آية', { n: toAr(cnt) })}` : toAr(day)}
                    aria-label={`${toAr(day)} ${MONTH}: ${active ? (cnt ? tr('{n} آية', { n: toAr(cnt) }) : tr('يوم قراءة')) : tr('لا قراءة')}`}>
                    <span className={styles.dayN}>{toAr(day)}</span>
                    {cnt > 0 && <span className={styles.dayC}>{toAr(cnt)}</span>}
                  </div>
                );
              })}
            </div>
            <div className={styles.legend} aria-hidden="true">
              <span>{tr('أقل')}</span>
              {[0, 1, 2, 3, 4].map(l => <i key={l} className={styles['l' + l]} />)}
              <span>{tr('أكثر')}</span>
            </div>
            {bestDay && (
              <p className={styles.best}>
                <Icon name="trophy" />{tr('أفضل يوم:')} {num(parseLocalDate(bestDay.date)?.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' }) || '')} · {tr('{n} آية', { n: toAr(bestDay.ayah_count) })}
              </p>
            )}
          </section>

          {/* ── daily bars ── */}
          <section className={`nq-card ${styles.card}`} aria-labelledby="rp-bars">
            <div className={styles.cardHead}>
              <h2 id="rp-bars" className={styles.h3}>{tr('القراءة اليومية')}</h2>
              {hasMonthData && <span className={styles.meta}>{tr('أعلى يوم: {n} آية', { n: toAr(maxAyahs) })}</span>}
            </div>
            {hasMonthData ? (
              <>
                <div className={styles.bars} role="img"
                  aria-label={tr('قرأت {a} آية في {d} يوماً من {m}', { a: toAr(totalAyahs), d: toAr(activeDays), m: MONTH })}>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const date = dateOf(day);
                    const cnt = dateMap[date] || 0;
                    const active = activeDates.has(date);
                    const h = cnt ? Math.max(6, (cnt / maxAyahs) * 100) : active ? 4 : 0;
                    return (
                      <div key={day} className={styles.barCol} title={`${toAr(day)} ${MONTH}: ${tr('{n} آية', { n: toAr(cnt) })}`}>
                        <span className={`${styles.bar} ${date === today ? styles.barToday : ''}`} style={{ height: `${h}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className={styles.axis} aria-hidden="true">
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <span key={i}>{(i + 1) === 1 || (i + 1) % 5 === 0 ? toAr(i + 1) : ''}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.emptyChart}>
                <Badge8 icon="book" size={52} />
                <p>{tr('لا قراءة مسجّلة في {m} {y}.', { m: MONTH, y: toAr(selYear) })}</p>
                <Link className="nq-btn gold sm" to="/reader"><Icon name="book" />{tr('ابدأ القراءة')}</Link>
              </div>
            )}
          </section>
        </div>

        <div className={styles.grid}>
          {/* ── all-time ── */}
          <section className={`nq-card ${styles.card}`} aria-labelledby="rp-all">
            <h2 id="rp-all" className={styles.h3}>{tr('الإحصاءات الكاملة')}</h2>
            <dl className={styles.all}>
              {[
                { icon: 'book',     label: 'إجمالي الآيات المقروءة', val: toAr(allAyahs) },
                { icon: 'calendar', label: 'أيام القراءة',            val: toAr(allDays) },
                { icon: 'list',     label: 'سور محفوظة',              val: toAr(completedSurahs) },
                { icon: 'star',     label: 'آيات محفوظة',             val: toAr(memorizedAyahs) },
                { icon: 'chart',    label: 'نسبة الحفظ',              val: tr('{n}٪', { n: toArRaw(isRtl() ? String(progressPct).replace('.', '٫') : String(progressPct)) }) },
                { icon: 'sun',      label: 'أيام الورد المكتملة',     val: toAr(wardDays) },
              ].map(({ icon, label, val }) => (
                <div key={label} className={styles.allRow}>
                  <dt><Icon name={icon} />{tr(label)}</dt>
                  <dd className="nq-num">{val}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── ward record ── */}
          <section className={`nq-card ${styles.card}`} aria-labelledby="rp-ward">
            <div className={styles.cardHead}>
              <h2 id="rp-ward" className={styles.h3}>{tr('سجل الورد · آخر {n} يوماً', { n: toAr(14) })}</h2>
              <Link to="/hifz" className={styles.meta}>{tr('إدارة الورد')}</Link>
            </div>
            <div className={styles.ward} role="img"
              aria-label={tr('أتممت الورد في {a} من آخر {n} يوماً', { a: toAr(last14.filter(w => w.done).length), n: toAr(14) })}>
              {last14.map(w => (
                <div key={w.ds} className={styles.wardCol} title={w.ds}>
                  <span className={styles.wardTrack}><span className={`${styles.wardFill} ${w.done ? styles.wardDone : ''}`} /></span>
                  <small className="nq-num">{toAr(w.d.getDate())}</small>
                </div>
              ))}
            </div>
            <div className={styles.wardLgd} aria-hidden="true">
              <span><i className={styles.wardDone} />{tr('أتممت الورد')}</span>
              <span><i />{tr('لم يُسجَّل')}</span>
            </div>
          </section>
        </div>

        <div className={`${styles.actions} ${styles.noPrint}`}>
          <button type="button" className="nq-btn gold" onClick={printReport}><Icon name="download" />{tr('طباعة أو حفظ PDF')}</button>
        </div>
      </div>
    </div>
  );
}

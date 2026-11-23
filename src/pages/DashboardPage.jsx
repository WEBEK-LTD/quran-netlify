// ─── لوحتي ───────────────────────────────────────────────────────────────────
// Where you stopped, your streak and reading activity, hifz and khatmat, and
// a way into every feature. Works for guests from this device's data.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, displayNameOf, avatarOf } from '../hooks/useAuth';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { loadProgress, loadBookmarks, loadNotes, loadStats, getBroadcasts } from '../backend';
import { SURAHS_META, JUZ_DATA } from '../data';
import { visibleGroups } from '../features';
import { useHifz, localDateStr } from '../hifzStore';
import { PageHero, Icon, Badge8, Corners, Pattern, Divider, toAr } from '../components/ornaments/Ornaments';
import { useTr, num, surahName, intlLocale } from '../l10n';
import { trCount } from '../locales/library';
import styles from './DashboardPage.module.css';

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
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

const TOTAL_AYAHS = 6236;
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const AR_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const WEEKS = 53;

// Month / weekday names: the original Arabic lists for ar, Intl for the rest.
function monthLabel(m, lang) {
  if (lang === 'ar') return AR_MONTHS[m];
  try { return new Intl.DateTimeFormat(intlLocale(lang), { month: 'short' }).format(new Date(2024, m, 15)); } catch { return AR_MONTHS[m]; }
}
function dayLabel(dow, lang, style = 'long') {
  if (lang === 'ar' && style === 'long') return AR_DAYS[dow];
  try { return new Intl.DateTimeFormat(intlLocale(lang), { weekday: style }).format(new Date(2024, 0, 7 + dow)); } catch { return AR_DAYS[dow]; }
}
// Row labels of the heat map (Saturday → Friday; every other row labelled)
function dowLabels(lang) {
  if (lang === 'ar') return ['س', '', 'إ', '', 'خ', '', ''];
  return [6, 1, 3].flatMap(d => [dayLabel(d, lang, 'narrow'), '']).concat(['']).slice(0, 7);
}

// Weeks (Saturday → Friday) ending with the current week; each day { date, count, future }
function buildHeat(byDate) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 1) % 7) - (WEEKS - 1) * 7); // back to a Saturday
  const weeks = [];
  for (let w = 0; w < WEEKS; w++) {
    const days = [];
    let month = null;
    for (let d = 0; d < 7; d++) {
      const x = new Date(start); x.setDate(start.getDate() + w * 7 + d);
      const ds = localDateStr(x);
      if (x.getDate() === 1 && w > 0) month = x.getMonth();
      days.push({ date: ds, dow: x.getDay(), count: byDate.get(ds) || 0, future: x > today });
    }
    weeks.push({ days, month });
  }
  return weeks;
}

function levelOf(count, max) {
  if (!count) return 0;
  const r = count / Math.max(max, 1);
  return r > .75 ? 4 : r > .5 ? 3 : r > .25 ? 2 : 1;
}

// Curated quick links (respecting the admin's feature switches)
const QUICK = [
  ['hifz', 'الحفظ'], ['khatma', 'الختمات'], ['favorites', 'المفضلة'], ['notes', 'ملاحظاتي'],
  ['search', 'البحث'], ['group', 'الختمة الجماعية'], ['report', 'تقريري'], ['leaderboard', 'المتصدرون'],
  ['prayer', 'مواقيت الصلاة'], ['qibla', 'القبلة'], ['adhkar', 'الأذكار'], ['tasbih', 'السبحة'],
  ['daily', 'آية اليوم'], ['radio', 'الإذاعة'], ['support', 'الدعم'], ['settings', 'الإعدادات'],
];

const BC_STYLE = { info: 'info', warning: 'warn', success: 'ok', error: 'danger' };
const BC_ICON = { info: 'bell', warning: 'bell', success: 'check', error: 'x' };

export default function DashboardPage() {
  const tr = useTr();
  const trc = (key, n, vars) => trCount(tr, key, n, vars);
  const trn = (key, n, vars) => trc(key, n, { n: toAr(n), ...vars });
  const pct = v => (tr.lang === 'ar' ? `${toAr(v)}٪` : `${num(v)}%`);
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const settings = usePublicSettings();
  const { completedSurahs, progressPct, streak: hifzStreak } = useHifz(user?.id);

  const [progress,  setProgress]  = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [notes,     setNotes]     = useState([]);
  const [sessions,    setSessions]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [syncErr,     setSyncErr]     = useState(false);
  const [broadcasts,  setBroadcasts]  = useState([]);
  const [dismissedBC, setDismissedBC] = useState(() => readJSON('nq_dismissed_bc', []));

  // Local fallbacks
  const localBookmarks = readJSON('nq_bookmarks', []);
  const localNotes     = readJSON('nq_notes', []);
  const localLastRead  = readJSON('nq_lastRead', { surah: 1, ayah: 1 });
  const khatmat        = readJSON('nq_khatmat', []);
  const localReadDates = readJSON('nq_read_dates', []);

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
        setBookmarks(b?.length ? b : readJSON('nq_bookmarks', []));
        setNotes(n?.length ? n : readJSON('nq_notes', []));
        setSessions(val(sess, []) || []);
        setSyncErr([prog, bkm, nts, sess].some(r => r.status === 'rejected'));
        setLoading(false);
      });
    } else {
      setBookmarks(readJSON('nq_bookmarks', []));
      setNotes(readJSON('nq_notes', []));
      setLoading(false);
    }
    return () => { alive = false; };
  }, [user, authLoading]);

  const displayBookmarks = bookmarks.length ? bookmarks : localBookmarks;
  const displayNotes     = notes.length     ? notes     : localNotes;
  // الـ streak المحلي من localStorage كـ fallback
  const localSessions = (Array.isArray(localReadDates) ? localReadDates : []).map(date => ({ date }));
  const streak = Math.max(hifzStreak || 0, calcStreak(sessions), calcStreak(localSessions));
  // دمج الجلسات المحلية مع بيانات الحساب للرسم
  const mergedSessions = useMemo(() => {
    const all = [...sessions];
    for (const d of localSessions) if (!all.find(s => s.date === d.date)) all.push({ date: d.date, ayah_count: 1 });
    return all;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, localReadDates.length]);
  // عدد أيام القراءة (الجلسات المحلية تسجّل أياماً لا آيات)
  const readingDays = new Set(mergedSessions.map(s => s.date).filter(Boolean)).size;
  const ayahsRead = sessions.reduce((a, s) => a + (s.ayah_count || 0), 0);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const s of mergedSessions) if (s.date) m.set(s.date, (m.get(s.date) || 0) + (s.ayah_count || 0));
    return m;
  }, [mergedSessions]);
  const heat = useMemo(() => buildHeat(byDate), [byDate]);
  const heatMax = Math.max(1, ...[...byDate.values()]);
  const weekTotal = heat[heat.length - 1].days.reduce((a, d) => a + d.count, 0);
  const activeThisMonth = (() => { const p = todayStr().slice(0, 7); let n = 0; byDate.forEach((v, k) => { if (k.startsWith(p) && v > 0) n++; }); return n; })();

  const lastS = progress?.surah || localLastRead.surah || 1;
  const lastA = progress?.ayah || localLastRead.ayah || 1;
  const lastSurah = surahName(lastS, tr.lang) || '—';
  const position = useMemo(() => {
    let n = 0; for (let i = 0; i < lastS - 1; i++) n += SURAHS_META[i][2];
    return Math.min(100, Math.round(((n + lastA) / TOTAL_AYAHS) * 1000) / 10);
  }, [lastS, lastA]);
  const juz = juzOf(lastS, lastA);

  const displayName  = displayNameOf(user, tr('الزائر'));
  const avatarUrl    = avatarOf(user);
  const avatarLetter = displayName[0]?.toUpperCase() || '؟';

  const items = useMemo(() => Object.fromEntries(visibleGroups(settings, user).flatMap(g => g.items).map(i => [i.key, i])), [settings, user]);
  const quickSub = {
    hifz: trn('{n} سورة', completedSurahs), khatma: trn('{n} ختمة', khatmat.length),
    favorites: trn('{n} آية', displayBookmarks.length), notes: trn('{n} ملاحظة', displayNotes.length),
  };

  function dismissBroadcast(id) {
    const next = [...dismissedBC, id];
    setDismissedBC(next);
    try { localStorage.setItem('nq_dismissed_bc', JSON.stringify(next)); } catch {}
  }
  const visibleBroadcasts = broadcasts.filter(b => !dismissedBC.includes(b.id));
  const busy = authLoading || loading;

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('لوحتي')}
        title={user ? tr('أهلاً، {name}', { name: displayName }) : tr('أهلاً بك في نور القرآن')}
        sub={user ? tr('تابع وردك من حيث توقفت، وانظر ما قطعته في رحلتك مع القرآن.') : tr('ملخّص قراءتك وحفظك على هذا الجهاز.')}
      >
        {user ? (
          <>
            <span className={styles.who}>
              <span className={styles.avatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{avatarLetter}</span>}</span>
              <span className={styles.email}>{user.email}</span>
            </span>
            <button type="button" className="nq-btn ghost sm" onClick={async () => { await signOut(); navigate('/'); }}>
              <Icon name="logout" />{tr('تسجيل الخروج')}
            </button>
          </>
        ) : !authLoading && (
          <>
            <Link to="/login" className="nq-btn gold sm"><Icon name="user" />{tr('تسجيل الدخول')}</Link>
            <Link to="/signup" className="nq-btn ghost sm">{tr('إنشاء حساب')}</Link>
          </>
        )}
      </PageHero>

      <div className={`nq-wrap ${styles.body}`}>
        {/* ── notices ── */}
        {(visibleBroadcasts.length > 0 || syncErr) && (
          <div className={styles.notices}>
            {visibleBroadcasts.map(bc => (
              <div key={bc.id} className={`${styles.bc} ${styles['bc_' + (BC_STYLE[bc.type] || 'info')]}`} role="status">
                <Icon name={BC_ICON[bc.type] || 'bell'} className={styles.bcIcon} />
                <div className={styles.bcText}>
                  <b>{bc.title}</b>
                  {bc.body && <span>{bc.body}</span>}
                </div>
                <button type="button" className={styles.bcX} onClick={() => dismissBroadcast(bc.id)} aria-label={tr('إغلاق التنبيه')}><Icon name="x" /></button>
              </div>
            ))}
            {syncErr && (
              <p className={`${styles.bc} ${styles.bc_warn}`} role="alert">
                <Icon name="bell" className={styles.bcIcon} />
                <span className={styles.bcText}>{tr('تعذّر تحميل بعض بيانات حسابك، فنعرض البيانات المحفوظة على هذا الجهاز.')}</span>
              </p>
            )}
          </div>
        )}

        {/* ── continue + hifz ── */}
        <section className={styles.top} aria-label={tr('متابعة')}>
          <Link to={`/reader?surah=${lastS}&ayah=${lastA}`} className={`nq-card ${styles.cont}`}>
            <Pattern />
            <Corners />
            <div className={styles.contIn}>
              <span className="nq-eyebrow">{tr('تابع القراءة')}</span>
              <div className={styles.contMain}>
                <Badge8 size={78}>{toAr(lastS)}</Badge8>
                <div>
                  <h2 className={styles.contSurah}>{tr('سورة {name}', { name: lastSurah })}</h2>
                  <p className={styles.contMeta}>{tr('الآية {n}', { n: toAr(lastA) })} · {tr('الجزء {n}', { n: toAr(juz) })}</p>
                </div>
              </div>
              <div className={styles.track} role="img" aria-label={tr('موضعك في المصحف: {p}', { p: pct(position) })}>
                <div className={styles.trackBar}><i style={{ width: `${position}%` }} /></div>
                <span className="nq-num">{tr('{p} من المصحف', { p: pct(position) })}</span>
              </div>
              <span className={`nq-btn gold ${styles.contBtn}`}><Icon name="book" />{lastS === 1 && lastA === 1 ? tr('ابدأ القراءة') : tr('تابع من حيث توقفت')}</span>
            </div>
          </Link>

          <Link to="/hifz" className={`nq-card ${styles.hifz}`}>
            <span className="nq-eyebrow">{tr('الحفظ')}</span>
            <div className={styles.ring} style={{ '--p': Math.min(100, progressPct || 0) }} role="img" aria-label={tr('نسبة الحفظ {p}', { p: pct(progressPct || 0) })}>
              <b className="nq-num">{pct(progressPct || 0)}</b>
            </div>
            <p className={styles.hifzTxt}><b className="nq-num">{toAr(completedSurahs)}</b> {trc('سورة محفوظة', completedSurahs)}</p>
            <span className={styles.more}>{tr('خطة الحفظ والمراجعة')} <Icon name="back" className={styles.go} /></span>
          </Link>
        </section>

        {/* ── KPIs ── */}
        <section aria-label={tr('إحصاءاتك')} className={styles.kpis}>
          <Kpi icon="timer" value={toAr(streak)} unit={streak === 1 ? tr('يوم') : trc('يوماً', streak)} label={tr('أيام متتالية')} sub={streak ? tr('حافظ على وردك اليوم') : tr('ابدأ سلسلتك اليوم')} busy={busy} />
          {user
            ? <Kpi icon="book" value={tr.lang === 'ar' ? toAr(ayahsRead.toLocaleString('en').replace(/,/g, '٬')) : num(ayahsRead.toLocaleString(intlLocale(tr.lang)))} unit={trc('آية', ayahsRead)} label={tr('قرأتها هذا العام')} sub={trn('في {n} يوماً', readingDays)} busy={busy} />
            : <Kpi icon="calendar" value={toAr(readingDays)} unit={trc('يوماً', readingDays)} label={tr('أيام القراءة')} sub={tr('على هذا الجهاز')} busy={busy} />}
          <Kpi icon="grid" value={pct(progressPct || 0)} label={tr('نسبة الحفظ')} sub={tr('{n} سورة من {total}', { n: toAr(completedSurahs), total: toAr(114) })} busy={busy} />
          <Kpi icon="check" value={toAr(khatmat.length)} unit={khatmat.length === 1 ? tr('ختمة') : tr('ختمات')} label={tr('ختماتي')} sub={<Link to="/khatma" className={styles.kLink}>{tr('سجلّ الختمات')}</Link>} busy={busy} />
        </section>

        {/* ── activity heat map ── */}
        <section className={`nq-card ${styles.heatCard}`} aria-labelledby="heat-h">
          <header className={styles.heatHead}>
            <div>
              <span className="nq-eyebrow">{tr('نشاط القراءة')}</span>
              <h2 id="heat-h" className={styles.h2}>{tr('عامٌ من القراءة')}</h2>
            </div>
            <div className={styles.heatStats}>
              <span><b className="nq-num">{toAr(weekTotal)}</b> {trc(user ? 'آية هذا الأسبوع' : 'يوم قراءة هذا الأسبوع', weekTotal)}</span>
              <span><b className="nq-num">{toAr(activeThisMonth)}</b> {trc('يوماً هذا الشهر', activeThisMonth)}</span>
            </div>
          </header>
          <div className={styles.heatWrap}>
            <div className={styles.dows} aria-hidden="true">
              {dowLabels(tr.lang).map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className={styles.heat} role="img"
              aria-label={trn('خريطة نشاط القراءة: {n} يوم قراءة خلال العام الماضي', readingDays)}>
              {heat.map((w, wi) => (
                <div key={wi} className={styles.wk}>
                  <span className={styles.mLabel}>{w.month != null && wi < WEEKS - 2 ? monthLabel(w.month, tr.lang) : ''}</span>
                  {w.days.map(d => (
                    <i key={d.date} className={`${styles.cell} ${d.future ? styles.future : styles['l' + levelOf(d.count, heatMax)]}`}
                      title={d.future ? undefined : `${dayLabel(d.dow, tr.lang)} ${toAr(d.date.split('-').reverse().join('/'))}: ${d.count ? (user ? trn('{n} آية', d.count) : tr('قرأت')) : tr('لا قراءة')}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.legend} aria-hidden="true">
            <span>{tr('أقل')}</span>
            {[0, 1, 2, 3, 4].map(l => <i key={l} className={`${styles.cell} ${styles['l' + l]}`} />)}
            <span>{tr('أكثر')}</span>
          </div>
          {!user && !busy && (
            <p className={styles.heatNote}>{tr('تُسجَّل أيام القراءة على هذا الجهاز. سجّل الدخول ليُحسب عدد الآيات ويُحفظ نشاطك على كل أجهزتك.')}</p>
          )}
        </section>

        {/* ── guest: why sign in ── */}
        {!user && !authLoading && (
          <section className={`nq-card ${styles.guest}`} aria-labelledby="guest-h">
            <Pattern />
            <div className={styles.guestText}>
              <span className="nq-eyebrow">{tr('حسابك في نور القرآن')}</span>
              <h2 id="guest-h" className="nq-h-sec">{tr('احفظ رحلتك مع القرآن')}</h2>
              <p className="nq-lead">{tr('حسابٌ مجاني يحفظ تقدّمك ويجمعه على كل أجهزتك.')}</p>
              <div className={styles.guestActs}>
                <Link to="/signup" className="nq-btn gold"><Icon name="user" />{tr('أنشئ حساباً مجانياً')}</Link>
                <Link to="/login" className="nq-btn ghost">{tr('لديّ حساب')}</Link>
              </div>
            </div>
            <ul className={styles.benefits}>
              {[
                ['book', 'موضع القراءة يتبعك', 'تبدأ على الجوال وتكمل على الحاسوب من الآية نفسها.'],
                ['chart', 'إحصاءات حقيقية', 'عدد الآيات التي قرأتها كل يوم، وسلسلة أيامك المتتالية.'],
                ['bookmark', 'مفضلتك وملاحظاتك محفوظة', 'لا تضيع إذا غيّرت جهازك أو مسحت بيانات المتصفح.'],
                ['users', 'الختمة الجماعية والمتصدرون', 'شارك أهلك ختمة واحدة، وتنافس في الخير.'],
              ].map(([ic, t, d]) => (
                <li key={t}><Badge8 icon={ic} size={46} /><div><b>{tr(t)}</b><span>{tr(d)}</span></div></li>
              ))}
            </ul>
          </section>
        )}

        {/* ── quick links ── */}
        <section aria-labelledby="quick-h" className={styles.sec}>
          <div className={styles.secHead}>
            <Divider />
            <h2 id="quick-h" className="nq-h-sec">{tr('إلى أين اليوم؟')}</h2>
          </div>
          <div className={styles.quick}>
            {QUICK.filter(([k]) => items[k]).map(([k, label]) => (
              <Link key={k} to={items[k].path} className={`nq-card ${styles.q}`}>
                <Badge8 icon={items[k].icon} size={46} />
                <span className={styles.qText}>
                  <b>{tr(label)}</b>
                  <small>{quickSub[k] || items[k].desc}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── recent ── */}
        {(displayBookmarks.length > 0 || displayNotes.length > 0) && (
          <section className={styles.recent} aria-label={tr('آخر ما حفظته')}>
            {displayBookmarks.length > 0 && (
              <div className={`nq-card ${styles.recentCard}`}>
                <header className={styles.recentHead}>
                  <h2 className={styles.h3}><Icon name="bookmark" />{tr('آخر المحفوظات')}</h2>
                  <Link to="/favorites" className={styles.all}>{tr('الكل ({n})', { n: toAr(displayBookmarks.length) })}</Link>
                </header>
                <ul className={styles.rList}>
                  {displayBookmarks.slice(-5).reverse().map(b => {
                    return (
                      <li key={`${b.surah}:${b.ayah}`}>
                        <Link to={`/reader?surah=${b.surah}&ayah=${b.ayah}`} className={styles.rItem}>
                          <Badge8 size={38}>{toAr(b.surah)}</Badge8>
                          <span className={styles.rName}>{tr('سورة {name}', { name: surahName(b.surah, tr.lang) })}</span>
                          <span className={styles.rRef}>{tr('الآية {n}', { n: toAr(b.ayah) })}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {displayNotes.length > 0 && (
              <div className={`nq-card ${styles.recentCard}`}>
                <header className={styles.recentHead}>
                  <h2 className={styles.h3}><Icon name="pen" />{tr('آخر الملاحظات')}</h2>
                  <Link to="/notes" className={styles.all}>{tr('الكل ({n})', { n: toAr(displayNotes.length) })}</Link>
                </header>
                <ul className={styles.rList}>
                  {displayNotes.slice(0, 3).map(n => (
                    <li key={`${n.surah}:${n.ayah}`}>
                      <Link to={`/reader?surah=${n.surah}&ayah=${n.ayah}`} className={styles.nItem}>
                        <span className={styles.nRef}>{tr('سورة {name}', { name: surahName(n.surah, tr.lang) })} · {tr('الآية {n}', { n: toAr(n.ayah) })}</span>
                        <span className={styles.nText} dir="auto">{n.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, value, unit, label, sub, busy }) {
  const tr = useTr();
  return (
    <div className={`nq-card ${styles.kpi}`}>
      <Badge8 icon={icon} size={44} />
      <div className={styles.kpiVal}>
        {busy ? <span className={styles.kpiWait} aria-label={tr('جارٍ التحميل')} /> : <><b className="nq-num">{value}</b>{unit && <span>{unit}</span>}</>}
      </div>
      <span className={styles.kpiLabel}>{label}</span>
      {sub && <small className={styles.kpiSub}>{sub}</small>}
    </div>
  );
}

// Juz number for a position
function juzOf(s, a) {
  let j = 1;
  for (const z of JUZ_DATA) {
    if (s > z.surah || (s === z.surah && a >= z.ayah)) j = z.juz; else break;
  }
  return j;
}

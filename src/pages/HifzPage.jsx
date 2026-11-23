// ─── Hifz ────────────────────────────────────────────────────────────────────
// Hero ﴿ولقد يسرنا القرآن للذكر﴾, KPIs, 30 juz rings, the 114-surah heat map
// (status by colour AND glyph in colour-blind / contrast modes), today's review
// queue, the daily ward (form + 14-day record), distribution and achievements.
// Data: useHifz (localStorage `nq_hifz`, synced to the account when signed in).
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useHifz, localDateStr } from '../hifzStore';
import { useAuth } from '../hooks/useAuth';
import { SURAHS_META, JUZ_DATA as JUZ_NAMES } from '../data';
import { SURAH_AYAH_COUNT, JUZ_DATA, ACHIEVEMENTS, TOTAL_AYAHS, juzSurahRanges } from '../hifzData';
import { setGlobal } from '../store';
import { PageHero, Icon, Badge8, Pattern, Divider, toAr } from '../components/ornaments/Ornaments';
import { num, surahName, revelationLabel, intlLocale, isRtl } from '../l10n';
import { useHifzTr, hifzTrNow } from '../locales/hifz';
import styles from './HifzPage.module.css';

// status → label, css class, glyph (glyph shows only with data-cb="on" / contrast)
const STATUS = {
  completed:  { label: 'محفوظة',       cls: 'mem',   glyph: '✓' },
  review:     { label: 'تحتاج مراجعة', cls: 'rev',   glyph: '↻' },
  inProgress: { label: 'قيد الحفظ',    cls: 'learn', glyph: '✎' },
  none:       { label: 'لم تبدأ',      cls: 'none',  glyph: '' },
};
const STATUS_ORDER = ['completed', 'review', 'inProgress', 'none'];

const ACH_ICON = {
  first_surah: 'bookmark', short_surahs: 'star', five_surahs: 'list', ten_surahs: 'grid',
  half_quran: 'book', full_quran: 'trophy', week_streak: 'calendar', month_streak: 'moon',
  hundred_ayahs: 'doc', five_hundred: 'scroll', daily_ward: 'sun',
};

// Decimal separator: Arabic comma for ar/ur, a dot otherwise
const arNum = n => toAr(isRtl() ? String(n).replace('.', '٫') : String(n));
const sName = n => surahName(n);
// Ayah reference under the hero ayah: Arabic line, plus a transliterated reference in LTR languages
const ayahRefLine = (ar, s, a) => (isRtl() ? ar : `${ar} — ${surahName(s)} ${s}:${a}`);

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
  const endSurah = w.endSurah || w.surah;
  if (endSurah === w.surah) return hifzTrNow('سورة {s}: الآيات {a}–{b}', { s: sName(w.surah), a: toAr(w.startAyah), b: toAr(w.endAyah) });
  return hifzTrNow('من {s1} {a1} إلى {s2} {a2}', { s1: sName(w.surah), a1: toAr(w.startAyah), s2: sName(endSurah), a2: toAr(w.endAyah) });
}
function wardShort(w) {
  if (w.mode === 'juz') return hifzTrNow('الجزء {n}', { n: toAr(w.juz) });
  const endSurah = w.endSurah || w.surah;
  if (endSurah === w.surah) return `${sName(w.surah)} ${toAr(w.startAyah)}–${toAr(w.endAyah)}`;
  return `${sName(w.surah)} ${toAr(w.startAyah)} ${isRtl() ? '←' : '→'} ${sName(endSurah)} ${toAr(w.endAyah)}`;
}

export default function HifzPage() {
  const tr = useHifzTr();
  const { user } = useAuth();
  const {
    hifz, setSurahStatus, setDailyWard, markWardDone,
    completedSurahs, inProgressSurahs, memorizedAyahs, progressPct, todayDone, streak, bestStreak,
  } = useHifz(user?.id);

  const [mapView,    setMapView]    = useState('map');       // map | list
  const [picked,     setPicked]     = useState(null);        // surah number in the status sheet
  const [queueAll,   setQueueAll]   = useState(false);
  const [wardOpen,   setWardOpen]   = useState(false);
  const [wardForm,   setWardForm]   = useState({ surah: 1, startAyah: 1, endAyah: 7, mode: 'surah', juz: 1, count: 5 });
  const [wardError,  setWardError]  = useState('');
  const [notification, setNotification] = useState(null);
  const wardRef = useRef(null);

  // Offer to enable notifications on this device
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') setNotification('default');
  }, []);

  async function requestNotifications() {
    if (!('Notification' in window)) { setNotification('unsupported'); return; }
    let perm;
    try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
    setNotification(perm);
    if (perm === 'granted') await showTestNotification();
  }

  // Shows a single confirmation notification. Android Chrome forbids
  // `new Notification()` — use the service worker registration when available.
  // NOTE: no daily schedule exists yet; we only confirm notifications work.
  async function showTestNotification() {
    const title = tr('نور القرآن');
    const opts  = { body: tr('تم تفعيل الإشعارات — تذكّر وردك اليومي من القرآن الكريم'), icon: '/icon.svg' };
    try {
      if ('serviceWorker' in navigator) {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(r => setTimeout(() => r(null), 3000)),
        ]);
        if (reg?.showNotification) await reg.showNotification(title, opts);
        else new Notification(title, opts);
      } else {
        new Notification(title, opts);
      }
      setGlobal({ toast: tr('تم تفعيل الإشعارات على هذا الجهاز') });
    } catch {
      setGlobal({ toast: tr('تعذّر عرض الإشعار على هذا المتصفح') });
    }
  }

  function saveWard() {
    setWardError('');
    const mode = wardForm.mode;
    let ward;

    if (mode === 'juz') {
      const juz = parseInt(wardForm.juz, 10);
      const row = JUZ_DATA[juz - 1];
      if (!row) { setWardError(tr('اختر جزءاً صحيحاً ({a}–{b})', { a: toAr(1), b: toAr(30) })); return; }
      const [, s1, a1, s2, a2] = row;
      ward = { mode: 'juz', juz, surah: s1, startAyah: a1, endSurah: s2, endAyah: a2, ayahCount: countAyahs(s1, a1, s2, a2) };
    } else {
      const s1  = parseInt(wardForm.surah, 10);
      const max = SURAH_AYAH_COUNT[s1 - 1];
      const a1  = parseInt(wardForm.startAyah, 10);
      if (!max) { setWardError(tr('اختر سورة صحيحة')); return; }
      if (!Number.isFinite(a1) || a1 < 1 || a1 > max) { setWardError(tr('آية البداية يجب أن تكون بين {a} و{b}', { a: toAr(1), b: toAr(max) })); return; }
      if (mode === 'ayahs') {
        const n = parseInt(wardForm.count, 10);
        if (!Number.isFinite(n) || n < 1 || n > 50) { setWardError(tr('عدد الآيات يجب أن يكون بين {a} و{b}', { a: toAr(1), b: toAr(50) })); return; }
        const { endSurah, endAyah } = advanceAyahs(s1, a1, n);
        ward = { mode: 'ayahs', surah: s1, startAyah: a1, endSurah, endAyah, ayahCount: countAyahs(s1, a1, endSurah, endAyah) };
      } else {
        const a2 = parseInt(wardForm.endAyah, 10);
        if (!Number.isFinite(a2) || a2 < a1 || a2 > max) { setWardError(tr('آية النهاية يجب أن تكون بين {a} و{b}', { a: toAr(a1), b: toAr(max) })); return; }
        ward = { mode: 'surah', surah: s1, startAyah: a1, endSurah: s1, endAyah: a2, ayahCount: a2 - a1 + 1 };
      }
    }
    setDailyWard(ward);
    setWardOpen(false);
    setGlobal({ toast: tr('تم تحديد وردك اليومي') });
  }

  function setWardField(field, raw) {
    const v = parseInt(raw, 10);
    setWardError('');
    setWardForm(w => ({ ...w, [field]: Number.isFinite(v) ? v : '' }));
  }

  function goToWard() {
    setWardOpen(true);
    requestAnimationFrame(() => wardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const surahMax = SURAH_AYAH_COUNT[wardForm.surah - 1] || 7;
  const wardSurahCount = wardForm.endAyah - wardForm.startAyah + 1;
  const juzPreview = (() => {
    const row = JUZ_DATA[(wardForm.juz || 1) - 1];
    if (!row) return null;
    const [, s1, a1, s2, a2] = row;
    return { surah: s1, startAyah: a1, endSurah: s2, endAyah: a2, ayahCount: countAyahs(s1, a1, s2, a2) };
  })();

  // Ward record: last 14 days
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const dateStr = localDateStr(d);
    const rec = hifz.wardHistory?.find(h => h.date === dateStr);
    return { d, dateStr, completed: !!rec?.completed, ayahs: rec?.wardAyahs || 0 };
  });
  const done14 = last14.filter(d => d.completed).length;

  // Per-juz progress by ayah ranges: ayahs of completed surahs inside the juz ÷ ayahs of the juz
  const juzProgress = useMemo(() => JUZ_DATA.map(([juz]) => {
    let done = 0, total = 0;
    for (const { surah, from, to } of juzSurahRanges(juz)) {
      const n = to - from + 1;
      total += n;
      if (hifz.surahStatus[surah] === 'completed') done += n;
    }
    const pct = total ? Math.floor((done / total) * 100) : 0;
    return { juz, done, total, pct: done === total && total ? 100 : pct };
  }), [hifz.surahStatus]);
  const fullJuz = juzProgress.filter(j => j.pct === 100).length;

  const counts = useMemo(() => {
    const c = { completed: 0, review: 0, inProgress: 0, none: 0 };
    for (let n = 1; n <= 114; n++) c[hifz.surahStatus[n] || 'none'] = (c[hifz.surahStatus[n] || 'none'] || 0) + 1;
    return c;
  }, [hifz.surahStatus]);

  // Today's queue: the ward, then surahs to review, then surahs being memorised
  const queue = useMemo(() => {
    const q = [];
    for (let n = 1; n <= 114; n++) if (hifz.surahStatus[n] === 'review') q.push({ n, kind: 'review' });
    for (let n = 1; n <= 114; n++) if (hifz.surahStatus[n] === 'inProgress') q.push({ n, kind: 'learn' });
    return q;
  }, [hifz.surahStatus]);
  const queueShown = queueAll ? queue : queue.slice(0, hifz.dailyWard ? 4 : 5);
  const todayCount = queue.length + (hifz.dailyWard && !todayDone ? 1 : 0);

  const ward = hifz.dailyWard;
  const unlocked = hifz.unlockedAchievements || [];

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('رحلة الحفظ')}
        title={tr('ما حفظته، وما ينتظرك')}
        ayah="وَلَقَدْ يَسَّرْنَا ٱلْقُرْءَانَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ"
        ayahRef={ayahRefLine('سورة القمر · ١٧', 54, 17)}
        sub={tr('خطوة كل يوم، ومراجعة لا تنقطع.')}
      >
        {ward ? (
          <Link className="nq-btn gold" to={`/reader?surah=${ward.surah}&ayah=${ward.startAyah}`}>
            <Icon name="book" />{tr('ورد اليوم: {w}', { w: wardShort(ward) })}
          </Link>
        ) : (
          <button type="button" className="nq-btn gold" onClick={goToWard}><Icon name="sun" />{tr('حدّد وردك اليومي')}</button>
        )}
        <Link className="nq-btn ghost" to="/dashboard"><Icon name="chart" />{tr('لوحة التقدّم')}</Link>
      </PageHero>

      <div className="nq-wrap">
        {/* ── KPIs ── */}
        <div className={styles.kpis}>
          <div className={`nq-card ${styles.kpi}`}>
            <b className="nq-num">{toAr(completedSurahs)}</b>
            <span>{tr('سورة محفوظة')}</span>
            <small>{tr('{a} آية من {b}', { a: toAr(memorizedAyahs), b: toAr(TOTAL_AYAHS) })}</small>
          </div>
          <div className={`nq-card ${styles.kpi}`}>
            <b className="nq-num">{tr('{n}٪', { n: arNum(progressPct) })}</b>
            <span>{tr('من القرآن الكريم')}</span>
            <span className={styles.kpiBar} aria-hidden="true"><i style={{ width: `${Math.min(100, progressPct)}%` }} /></span>
          </div>
          <div className={`nq-card ${styles.kpi}`}>
            <b className="nq-num">{toAr(streak)}</b>
            <span>{streak === 1 ? tr('يوم ورد') : tr('يوماً متتالياً')}</span>
            <small>{tr('أفضلها {n}', { n: toAr(bestStreak) })}</small>
          </div>
          <div className={`nq-card ${styles.kpi}`}>
            <b className="nq-num">{toAr(todayCount)}</b>
            <span>{tr('في قائمة اليوم')}</span>
            <small>{tr('{a} للمراجعة · {b} قيد الحفظ', { a: toAr(counts.review), b: toAr(inProgressSurahs) })}</small>
          </div>
        </div>

        {notification === 'default' && (
          <div className={`nq-card ${styles.notif}`}>
            <Badge8 icon="bell" size={44} />
            <p>{tr('فعّل الإشعارات على هذا الجهاز.')} <small>{tr('التذكير اليومي التلقائي غير متاح بعد.')}</small></p>
            <button type="button" className="nq-btn ghost sm" onClick={requestNotifications}>{tr('تفعيل')}</button>
          </div>
        )}

        {/* ── Juz ── */}
        <section className={styles.sec} aria-labelledby="hz-juz">
          <div className={styles.secHead}>
            <h2 id="hz-juz" className={styles.h2}>{tr('الأجزاء')}</h2>
            <span className={styles.secMeta}>{tr('{n} من {t} جزءاً مكتمل الحفظ', { n: toAr(fullJuz), t: toAr(30) })}</span>
          </div>
          <ul className={styles.juzgrid}>
            {juzProgress.map(({ juz, done, total, pct }) => (
              <li key={juz} className={`nq-card ${styles.juz} ${pct === 100 ? styles.juzFull : ''}`}>
                <span className={styles.ring} style={{ '--p': pct }} role="img" aria-label={tr('محفوظ {p}', { p: tr('{n}٪', { n: toAr(pct) }) })}>
                  <b className="nq-num">{tr('{n}٪', { n: toAr(pct) })}</b>
                </span>
                <span className={styles.juzTxt}>
                  <span className={styles.nm}>{tr('الجزء {n}', { n: toAr(juz) })}</span>
                  <small><bdi>{JUZ_NAMES[juz - 1]?.name}</bdi> · {tr('{a}/{b} آية', { a: toAr(done), b: toAr(total) })}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Surah map + today's queue ── */}
        <div className={styles.hgrid}>
          <section className={`nq-card ${styles.mapCard}`} aria-labelledby="hz-map">
            <div className={styles.mapHead}>
              <h2 id="hz-map" className={styles.h2}>{tr('خريطة السور')}</h2>
              <div className="nq-seg" role="group" aria-label={tr('طريقة العرض')}>
                <button type="button" aria-pressed={mapView === 'map'} onClick={() => setMapView('map')}>{tr('خريطة')}</button>
                <button type="button" aria-pressed={mapView === 'list'} onClick={() => setMapView('list')}>{tr('قائمة')}</button>
              </div>
            </div>
            <div className={styles.lgd}>
              {STATUS_ORDER.map(k => (
                <span key={k}>
                  <i className={`${styles.sw} ${styles[STATUS[k].cls]}`} aria-hidden="true"><b className={styles.g}>{STATUS[k].glyph}</b></i>
                  {tr(STATUS[k].label)} <em className="nq-num">{toAr(counts[k] || 0)}</em>
                </span>
              ))}
            </div>
            {mapView === 'map' ? (
              <div className={styles.hmap}>
                {SURAHS_META.map((m, i) => {
                  const n = i + 1;
                  const st = STATUS[hifz.surahStatus[n] || 'none'];
                  return (
                    <button key={n} type="button" className={`${styles.cell} ${styles[st.cls]}`}
                      onClick={() => setPicked(n)} title={`${sName(n)} — ${tr(st.label)}`}
                      aria-label={`${toAr(n)} ${sName(n)}: ${tr(st.label)}`}>
                      <span className={styles.n}>{toAr(n)}</span>
                      {st.glyph && <span className={styles.g} aria-hidden="true">{st.glyph}</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.slist}>
                {SURAHS_META.map((m, i) => {
                  const n = i + 1;
                  const key = hifz.surahStatus[n] || 'none';
                  const st = STATUS[key];
                  return (
                    <button key={n} type="button" className={styles.srow} onClick={() => setPicked(n)}
                      aria-label={`${sName(n)}: ${tr(st.label)}. ${tr('غيّر الحالة')}`}>
                      <Badge8 size={38}>{toAr(n)}</Badge8>
                      <span className={styles.srowTxt}>
                        <span className={styles.srowName}>{sName(n)}</span>
                        <small>{revelationLabel(m[3])} · {tr('{n} آية', { n: toAr(m[2]) })}</small>
                      </span>
                      <span className={`${styles.stag} ${styles[st.cls]}`}><b className={styles.g}>{st.glyph}</b>{tr(st.label)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className={styles.hint}>{tr('اضغط على أي سورة لتحديد حالة حفظها.')}</p>
          </section>

          <section className={`nq-card ${styles.queue}`} aria-labelledby="hz-q">
            <h2 id="hz-q" className={styles.h2}>{tr('مراجعة اليوم')}</h2>
            {ward && (
              <div className={`${styles.qitem} ${styles.qWard}`}>
                <Badge8 size={42}>{toAr(ward.surah)}</Badge8>
                <div className={styles.qtxt}>
                  <span className={styles.nm}>{wardShort(ward)}</span>
                  <small>{todayDone ? tr('أتممت وردك اليوم، بارك الله فيك') : tr('ورد اليوم · {n} آية', { n: toAr(ward.ayahCount) })}</small>
                </div>
                <div className={styles.qacts}>
                  <Link className="nq-btn ghost sm" to={`/reader?surah=${ward.surah}&ayah=${ward.startAyah}`}>{tr('اقرأ')}</Link>
                  <button type="button" className={`nq-btn sm ${todayDone ? 'ghost' : 'gold'}`} onClick={markWardDone} disabled={todayDone}>
                    <Icon name="check" />{todayDone ? tr('تمّ اليوم') : tr('أنهيت وردي')}
                  </button>
                </div>
              </div>
            )}
            {queueShown.map(({ n, kind }) => (
              <div key={n} className={styles.qitem}>
                <Badge8 size={42}>{toAr(n)}</Badge8>
                <div className={styles.qtxt}>
                  <span className={styles.nm}>{sName(n)}</span>
                  <small><i className={`${styles.qdot} ${styles[kind === 'review' ? 'rev' : 'learn']}`} aria-hidden="true" />{kind === 'review' ? tr('تحتاج مراجعة') : tr('قيد الحفظ')} · {tr('{n} آية', { n: toAr(SURAH_AYAH_COUNT[n - 1]) })}</small>
                </div>
                <div className={styles.qacts}>
                  <Link className="nq-btn ghost sm" to={`/reader?surah=${n}&ayah=1`}>{kind === 'review' ? tr('راجع') : tr('تابع')}</Link>
                  <button type="button" className="nq-btn ghost sm" onClick={() => setSurahStatus(n, 'completed')}
                    aria-label={kind === 'review' ? tr('راجعت سورة {s}', { s: sName(n) }) : tr('أتممت حفظ سورة {s}', { s: sName(n) })}>
                    <Icon name="check" />{kind === 'review' ? tr('راجعتها') : tr('حفظتها')}
                  </button>
                </div>
              </div>
            ))}
            {queue.length > queueShown.length && (
              <button type="button" className={`nq-btn ghost sm ${styles.qmore}`} onClick={() => setQueueAll(true)}>
                {tr('عرض الكل ({n})', { n: toAr(queue.length) })}
              </button>
            )}
            {!ward && queue.length === 0 && (
              <div className={styles.qempty}>
                <Divider />
                <p>{tr('لا شيء في قائمة اليوم. حدّد وردك اليومي، أو علّم سورة بأنها «قيد الحفظ» أو «تحتاج مراجعة» من الخريطة.')}</p>
                <button type="button" className="nq-btn gold sm" onClick={goToWard}><Icon name="sun" />{tr('حدّد وردك')}</button>
              </div>
            )}
          </section>
        </div>

        {/* ── Daily ward ── */}
        <section className={styles.sec} aria-labelledby="hz-ward" ref={wardRef}>
          <div className={styles.secHead}>
            <h2 id="hz-ward" className={styles.h2}>{tr('الورد اليومي')}</h2>
            <span className={styles.secMeta}>{tr('قليلٌ دائم خيرٌ من كثيرٍ منقطع')}</span>
          </div>
          <div className={styles.wgrid}>
            <div className={`nq-card ${styles.wardCard}`}>
              <Pattern />
              {ward && !wardOpen && (
                <div className={styles.wardNow}>
                  <span className="nq-eyebrow">{tr('وردك الحالي')}</span>
                  <p className={styles.wardName}>{ward.mode === 'juz' ? tr('الجزء {n}', { n: toAr(ward.juz) }) : tr('سورة {s}', { s: sName(ward.surah) })}</p>
                  <p className={styles.wardRange}>{wardRangeText(ward)} · {tr('{n} آية', { n: toAr(ward.ayahCount) })}</p>
                  <div className={styles.wardActs}>
                    <button type="button" className={`nq-btn ${todayDone ? 'ghost' : 'gold'}`} onClick={markWardDone} disabled={todayDone}>
                      <Icon name="check" />{todayDone ? tr('تمّ ورد اليوم') : tr('أنهيت وردي')}
                    </button>
                    <button type="button" className="nq-btn ghost" onClick={() => setWardOpen(true)}><Icon name="pen" />{tr('تغيير الورد')}</button>
                  </div>
                </div>
              )}
              {(!ward || wardOpen) && (
                <div className={styles.wardForm}>
                  <h3 className={styles.h3}>{ward ? tr('تغيير الورد اليومي') : tr('حدّد وردك اليومي')}</h3>
                  <div className="nq-seg" role="group" aria-label={tr('طريقة تحديد الورد')}>
                    {[['surah', 'بالسورة'], ['juz', 'بالجزء'], ['ayahs', 'بعدد الآيات']].map(([m, l]) => (
                      <button key={m} type="button" aria-pressed={wardForm.mode === m}
                        onClick={() => { setWardError(''); setWardForm(w => ({ ...w, mode: m })); }}>{tr(l)}</button>
                    ))}
                  </div>

                  {(wardForm.mode === 'surah' || wardForm.mode === 'ayahs') && (
                    <div className={styles.fields}>
                      <label className={styles.field}>
                        <span>{wardForm.mode === 'ayahs' ? tr('البداية من سورة') : tr('السورة')}</span>
                        <select className={styles.ctl} value={wardForm.surah}
                          onChange={e => {
                            const s = parseInt(e.target.value, 10);
                            setWardError('');
                            setWardForm(w => ({ ...w, surah: s, startAyah: 1, endAyah: SURAH_AYAH_COUNT[s - 1] }));
                          }}>
                          {SURAHS_META.map((m, i) => <option key={i + 1} value={i + 1}>{toAr(i + 1)}. {sName(i + 1)}</option>)}
                        </select>
                      </label>
                      <div className={styles.fieldRow}>
                        <label className={styles.field}>
                          <span>{tr('من الآية')}</span>
                          <input className={styles.ctl} type="number" inputMode="numeric" min="1" max={surahMax}
                            value={wardForm.startAyah} onChange={e => setWardField('startAyah', e.target.value)} />
                        </label>
                        {wardForm.mode === 'surah' && (
                          <label className={styles.field}>
                            <span>{tr('إلى الآية')}</span>
                            <input className={styles.ctl} type="number" inputMode="numeric" min={wardForm.startAyah || 1} max={surahMax}
                              value={wardForm.endAyah} onChange={e => setWardField('endAyah', e.target.value)} />
                          </label>
                        )}
                        {wardForm.mode === 'ayahs' && (
                          <label className={styles.field}>
                            <span>{tr('عدد الآيات يومياً')}</span>
                            <input className={styles.ctl} type="number" inputMode="numeric" min="1" max="50"
                              value={wardForm.count} onChange={e => setWardField('count', e.target.value)} />
                          </label>
                        )}
                      </div>
                      {wardForm.mode === 'ayahs' && (
                        <div className={styles.sugg} role="group" aria-label={tr('اقتراحات')}>
                          {[3, 5, 10, 20].map(n => (
                            <button key={n} type="button" className={`nq-pill ${wardForm.count === n ? 'on' : ''}`} aria-pressed={wardForm.count === n}
                              onClick={() => { setWardError(''); setWardForm(w => ({ ...w, count: n })); }}>
                              {tr('{n} آيات', { n: toAr(n) })}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className={styles.summary}>
                        {wardForm.mode === 'surah'
                          ? <>{tr('عدد الآيات:')} <strong>{toAr(Number.isFinite(wardSurahCount) ? Math.max(0, wardSurahCount) : 0)}</strong> {tr('من سورة {s}', { s: sName(wardForm.surah) })}</>
                          : wardForm.count >= 1
                            ? <>{tr('بـ{n} آيات يومياً تُتمّ القرآن في نحو', { n: toAr(wardForm.count) })} <strong>{tr('{n} يوماً', { n: toAr(Math.ceil(TOTAL_AYAHS / wardForm.count)) })}</strong></>
                            : tr('أدخل عدد الآيات')}
                      </p>
                    </div>
                  )}

                  {wardForm.mode === 'juz' && (
                    <div className={styles.fields}>
                      <label className={styles.field}>
                        <span>{tr('الجزء')}</span>
                        <select className={styles.ctl} value={wardForm.juz}
                          onChange={e => { setWardError(''); setWardForm(w => ({ ...w, juz: parseInt(e.target.value, 10) })); }}>
                          {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{tr('الجزء {n}', { n: toAr(i + 1) })} — {JUZ_NAMES[i]?.name}</option>)}
                        </select>
                      </label>
                      {juzPreview && <p className={styles.summary}>{wardRangeText(juzPreview)} · <strong>{tr('{n} آية', { n: toAr(juzPreview.ayahCount) })}</strong></p>}
                      <p className={styles.summary}>{tr('حفظ ربع جزء يومياً يُتمّ القرآن في نحو أربعة أشهر.')}</p>
                    </div>
                  )}

                  {wardError && <p className={styles.err} role="alert">{wardError}</p>}
                  <div className={styles.wardActs}>
                    <button type="button" className="nq-btn gold" onClick={saveWard}><Icon name="check" />{tr('حفظ الورد')}</button>
                    {ward && <button type="button" className="nq-btn ghost" onClick={() => { setWardOpen(false); setWardError(''); }}>{tr('إلغاء')}</button>}
                  </div>
                </div>
              )}
            </div>

            <div className={`nq-card ${styles.histCard}`}>
              <h3 className={styles.h3}>{tr('سجل الأيام · آخر {n} يوماً', { n: toAr(14) })}</h3>
              <ol className={styles.cal}>
                {last14.map(d => (
                  <li key={d.dateStr} className={`${styles.day} ${d.completed ? styles.dayDone : ''} ${d.dateStr === localDateStr() ? styles.dayToday : ''}`}
                    title={d.dateStr}>
                    <small>{num(d.d.toLocaleDateString(intlLocale(), { weekday: 'short' }))}</small>
                    <b className="nq-num">{toAr(d.d.getDate())}</b>
                    <span className={styles.dayMark} aria-hidden="true">{d.completed ? <Icon name="check" /> : null}</span>
                    <span className="nq-sr">{d.completed ? tr('أتممت الورد') : tr('لم يُسجَّل ورد')}</span>
                  </li>
                ))}
              </ol>
              <div className={styles.histFoot}>
                <span><b className="nq-num">{toAr(done14)}</b> {tr('من {n} يوماً', { n: toAr(14) })}</span>
                <span><b className="nq-num">{toAr(streak)}</b> {streak === 1 ? tr('يوم متواصل') : tr('أيام متواصلة')}</span>
                <span>{tr('الأفضل')} <b className="nq-num">{toAr(bestStreak)}</b></span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Distribution + achievements ── */}
        <section className={styles.sec} aria-labelledby="hz-ach">
          <div className={styles.secHead}>
            <h2 id="hz-ach" className={styles.h2}>{tr('الإحصاءات والإنجازات')}</h2>
            <span className={styles.secMeta}>{tr('{a} من {b} إنجازاً', { a: toAr(unlocked.length), b: toAr(ACHIEVEMENTS.length) })}</span>
          </div>
          <div className={styles.sgrid}>
            <div className={`nq-card ${styles.distCard}`}>
              <h3 className={styles.h3}>{tr('توزيع الحفظ')}</h3>
              {STATUS_ORDER.map(k => {
                const c = counts[k] || 0;
                const pct = Math.round((c / 114) * 100);
                return (
                  <div key={k} className={styles.dist}>
                    <span className={styles.distLbl}><i className={`${styles.sw} ${styles[STATUS[k].cls]}`} aria-hidden="true"><b className={styles.g}>{STATUS[k].glyph}</b></i>{tr(STATUS[k].label)}</span>
                    <span className={styles.distBar} aria-hidden="true"><i className={styles[STATUS[k].cls]} style={{ width: `${pct}%` }} /></span>
                    <span className={`nq-num ${styles.distN}`}>{tr('{n} سورة', { n: toAr(c) })} · {tr('{n}٪', { n: toAr(pct) })}</span>
                  </div>
                );
              })}
              <div className={styles.distFoot}>
                <div><b className="nq-num">{toAr(memorizedAyahs)}</b><small>{tr('آية محفوظة من {n}', { n: toAr(TOTAL_AYAHS) })}</small></div>
                <div><b className="nq-num">{toAr(bestStreak)}</b><small>{tr('أطول سلسلة ورد')}</small></div>
              </div>
            </div>
            <div className={`nq-card ${styles.achCard}`}>
              <ul className={styles.ach}>
                {ACHIEVEMENTS.map(a => {
                  const on = unlocked.includes(a.id);
                  return (
                    <li key={a.id} className={`${styles.badge} ${on ? styles.badgeOn : ''}`}>
                      <span className={styles.badgeIco}>
                        <Badge8 icon={on ? (ACH_ICON[a.id] || 'star') : 'lock'} size={56} />
                      </span>
                      <b>{tr(a.title)}</b>
                      <small>{toAr(tr(a.desc))}</small>
                      <span className="nq-sr">{on ? tr('مكتسب') : tr('غير مكتسب بعد')}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {picked && (
        <SurahSheet
          n={picked}
          status={hifz.surahStatus[picked] || 'none'}
          onPick={st => { setSurahStatus(picked, st); setPicked(null); }}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}

// Choose a surah's memorisation status
function SurahSheet({ n, status, onPick, onClose }) {
  const tr = useHifzTr();
  const boxRef = useRef(null);
  const m = SURAHS_META[n - 1];
  useEffect(() => {
    const prev = document.activeElement;
    boxRef.current?.querySelector('[aria-pressed="true"]')?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [n]);
  return (
    <div className="nq-overlay" role="presentation">
      <div className="nq-scrim" onClick={onClose} />
      <div className={`nq-card ${styles.sheet}`} role="dialog" aria-modal="true" aria-labelledby="hz-sheet-t" ref={boxRef}>
        <button type="button" className={`nq-ibtn ${styles.sheetX}`} onClick={onClose} aria-label={tr('إغلاق')}><Icon name="x" /></button>
        <div className={styles.sheetHead}>
          <Badge8 size={54}>{toAr(n)}</Badge8>
          <div>
            <h2 id="hz-sheet-t" className={styles.sheetName}>{tr('سورة {s}', { s: sName(n) })}</h2>
            <small>{revelationLabel(m[3])} · {tr('{n} آية', { n: toAr(m[2]) })}</small>
          </div>
        </div>
        <div className={styles.sheetOpts} role="group" aria-label={tr('حالة الحفظ')}>
          {STATUS_ORDER.map(k => (
            <button key={k} type="button" className={styles.opt} aria-pressed={status === k} onClick={() => onPick(k)}>
              <i className={`${styles.sw} ${styles[STATUS[k].cls]}`} aria-hidden="true"><b className={styles.g}>{STATUS[k].glyph}</b></i>
              {tr(STATUS[k].label)}
              {status === k && <Icon name="check" className={styles.optOn} />}
            </button>
          ))}
        </div>
        <Link className="nq-btn ghost" to={`/reader?surah=${n}&ayah=1`}><Icon name="book" />{tr('افتحها في المصحف')}</Link>
      </div>
    </div>
  );
}

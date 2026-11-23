// ─── App home (inside the iOS/Android app only) ──────────────────────────────
// The first screen of the app: greeting and Hijri date, the next prayer with a
// live countdown, «تابع القراءة», a big grid of sections, today's reminder from
// the Book of Allah (the /tadhkira gift, same logic as the website) and the verse
// of the day. The website keeps its own home (WelcomePage). Light by design: it is
// on screen while the app starts, so it renders from local data first and fills
// the network parts (ayah text, aladhan times) after the first paint.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './AppHome.module.css';
import { Icon, Badge8, Pattern, Corners, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { openPalette } from '../components/shell/Shell';
import { usePublicSettings, featureOn } from '../hooks/usePublicSettings';
import { useAuth, displayNameOf } from '../hooks/useAuth';
import { useStore } from '../store';
import { useTr, num, surahName, intlLocale, isRtl } from '../l10n';
import { coreTr } from '../locales/core';
import { SURAHS_META } from '../data';
import { savedCity, loadTodayTimes, cityNow, nextPrayer, fmt12, PRAYER_NAMES, PRAYER_ORDER } from '../prayerToday';
import { getDailyAyah } from './DailyAyahPage';
import { tadTr } from '../locales/tadhkira';
import Gift from '../tadhkira/Gift';
import { useTadhkira, useTadhkiraEntry, refLabel } from '../tadhkira/useTadhkira';

// Sections grid. `flag` = admin feature switch (settings.features).
const TILES = [
  { path: '/reader', icon: 'book', label: 'المصحف' },
  { path: '/listen', icon: 'head', label: 'التلاوات' },
  { path: '/tafsir', icon: 'doc', label: 'التفسير' },
  { path: '/prayer-times', icon: 'mosque', label: 'مواقيت الصلاة' },
  { path: '/qibla', icon: 'compass', label: 'القبلة' },
  { path: '/adhkar', icon: 'moon', label: 'الأذكار' },
  { path: '/tasbih', icon: 'beads', label: 'التسبيح' },
  { path: '/radio', icon: 'radio', label: 'الإذاعة' },
  { path: '/rooms', icon: 'live', label: 'الغرف', flag: 'rooms' },
  { path: '/hifz', icon: 'grid', label: 'الحفظ', flag: 'hifz' },
  { path: '/khatma-group', icon: 'users', label: 'الختمة الجماعية', flag: 'khatma_group' },
  { path: '/search', icon: 'search', label: 'البحث', flag: 'search' },
];

// Today's dates. The first Islamic-calendar formatter of a launch loads ICU data
// (tens of ms on a mid-range phone), so the strings are kept for the day and the
// formatting itself runs after the first paint.
const DATE_CACHE = 'nq_home_dates';
function formatDates(lang) {
  let hijri = '', greg = '';
  try {
    hijri = new Intl.DateTimeFormat(`${intlLocale(lang)}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    if (lang !== 'ar') hijri = num(hijri, lang);
  } catch {}
  try { greg = new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); } catch {}
  return { hijri, greg };
}
const dayKey = (lang) => { const d = new Date(); return `${lang}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function useTodayDates(lang) {
  const key = dayKey(lang);
  const [v, setV] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(DATE_CACHE) || 'null'); if (c && c.key === key) return c; } catch {}
    return null;
  });
  useEffect(() => {
    if (v && v.key === key) return;
    const id = setTimeout(() => {
      const next = { key, ...formatDates(lang) };
      try { localStorage.setItem(DATE_CACHE, JSON.stringify(next)); } catch {}
      setV(next);
    }, 0);
    return () => clearTimeout(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v && v.key === key ? v : { hijri: '\u00a0', greg: '\u00a0' };
}

export default function AppHome() {
  const tr = coreTr(useTr());
  const settings = usePublicSettings();
  const { user } = useAuth();
  const tiles = useMemo(() => TILES.filter(t => !t.flag || featureOn(settings, t.flag)), [settings]);
  const hour = new Date().getHours();
  const name = user ? displayNameOf(user, '').split(/\s+/)[0] : '';
  const dates = useTodayDates(tr.lang);

  return (
    <div className={styles.home} data-home-ready="1">
      {/* ── greeting ── */}
      <section className={styles.hello} aria-labelledby="ah-hello">
        <Pattern />
        <div className={styles.helloIn}>
          <p className={styles.salam} id="ah-hello">
            {name ? tr('السلام عليكم، {name}', { name }) : tr('السلام عليكم')}
          </p>
          <p className={styles.hijri}>{dates.hijri}</p>
          <p className={styles.greg}>{dates.greg}{dates.greg.trim() && ' · '}{hour < 12 ? tr('صباح الخير') : tr('مساء الخير')}</p>
        </div>
        <button type="button" className={styles.search} onClick={openPalette} aria-label={tr('ابحث عن سورة أو ميزة…')}>
          <Icon name="search" />
          <span>{tr('ابحث عن سورة أو ميزة…')}</span>
        </button>
      </section>

      <div className={styles.body}>
        <NextPrayer tr={tr} />
        <ContinueReading tr={tr} />

        {/* ── sections ── */}
        <section aria-labelledby="ah-sections">
          <h2 className={styles.h2} id="ah-sections">{tr('الأقسام')}</h2>
          <nav className={styles.grid} aria-label={tr('الأقسام')}>
            {tiles.map(t => (
              <Link key={t.path} to={t.path} className={styles.tile}>
                <span className={styles.tileIco}><Icon name={t.icon} /></span>
                <span className={styles.tileLabel}>{tr(t.label)}</span>
              </Link>
            ))}
          </nav>
        </section>

        <Tadhkira />
        <DailyAyah tr={tr} />
      </div>
    </div>
  );
}

// ── next prayer + countdown ─────────────────────────────────────────────────
function NextPrayer({ tr }) {
  const city = useMemo(savedCity, []);
  const [times, setTimes] = useState(null);
  const [now, setNow] = useState(() => cityNow(city?.tz).secs);
  useEffect(() => {
    if (!city) return;
    let alive = true;
    loadTodayTimes(city).then(t => { if (alive) setTimes(t); }).catch(() => {});
    const id = setInterval(() => setNow(cityNow(city.tz).secs), 1000);
    return () => { alive = false; clearInterval(id); };
  }, [city]);

  if (!city) {
    return (
      <Link to="/prayer-times" className={`nq-card ${styles.prayer} ${styles.prayerEmpty}`}>
        <Badge8 icon="mosque" size={50} />
        <span className={styles.prayerEmptyText}>
          <b>{tr('مواقيت الصلاة في مدينتك')}</b>
          <small>{tr('حدّد مدينتك مرة واحدة، وتظهر المواقيت هنا كل يوم.')}</small>
        </span>
        <span className="nq-btn gold sm"><Icon name="pin" />{tr('حدّد مدينتك')}</span>
      </Link>
    );
  }

  const nx = times ? nextPrayer(times, now) : null;
  const pad = n => String(n).padStart(2, '0');
  const cd = nx ? toAr(`${pad(Math.floor(nx.left / 3600))}:${pad(Math.floor(nx.left % 3600 / 60))}:${pad(nx.left % 60)}`) : '--:--:--';
  const at = nx ? fmt12(times[nx.key]) : null;
  return (
    <Link to="/prayer-times" className={`nq-card ${styles.prayer}`} aria-label={tr('مواقيت الصلاة اليوم')}>
      <Pattern />
      <div className={styles.prayerTop}>
        <span className={styles.prayerLabel}>
          <small><Icon name="pin" />{city.name || tr('مدينتك')}</small>
          <b>{tr('الصلاة القادمة: {name}', { name: nx ? tr(PRAYER_NAMES[nx.key]) : '…' })}</b>
          {at && <span className={styles.prayerAt}><span className="nq-num">{toAr(at.t)}</span> {tr(at.ap)}</span>}
        </span>
        <span className={styles.countdown}>
          <small>{tr('متبقٍّ')}</small>
          <span className="nq-num" aria-live="off">{cd}</span>
        </span>
      </div>
      <div className={styles.prayerRow}>
        {PRAYER_ORDER.filter(k => k !== 'Sunrise').map(k => {
          const f = times ? fmt12(times[k]) : { t: '--:--' };
          const isNext = nx && nx.key === k;
          return (
            <span key={k} className={isNext ? styles.prayerNow : ''}>
              <small>{tr(PRAYER_NAMES[k])}</small>
              <b className="nq-num">{toAr(f.t)}</b>
            </span>
          );
        })}
      </div>
    </Link>
  );
}

// ── «تابع القراءة» ─────────────────────────────────────────────────────────
function ContinueReading({ tr }) {
  const [state] = useStore();
  const s = state.currentSurah || 1, a = state.currentAyah || 1;
  const fresh = s === 1 && a === 1;
  const total = (SURAHS_META[s - 1] || [])[2] || 1;
  const pct = Math.max(2, Math.min(100, Math.round(a / total * 100)));
  return (
    <Link to={`/reader?surah=${s}&ayah=${a}`} className={`nq-card ${styles.cont}`}>
      <Badge8 size={52}>{toAr(s)}</Badge8>
      <span className={styles.contText}>
        <small className="nq-eyebrow">{fresh ? tr('ابدأ القراءة') : tr('تابع القراءة')}</small>
        <b>{tr('سورة {name}', { name: surahName(s) })}</b>
        <span className={styles.contMeta}>{tr('الآية {n} من {t}', { n: num(a), t: num(total) })}</span>
        <span className={styles.bar} aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      </span>
      <Icon name="back" className={styles.fwd} />
    </Link>
  );
}

// ── «تذكرة من كتاب الله لقلبك اليوم» — the same gift and route as the website ──
function Tadhkira() {
  const tr = tadTr(coreTr(useTr()));
  const t = useTadhkira();
  if (!t.opened) {
    return (
      <Link to="/tadhkira?open=1" className={`nq-card ${styles.tadh}`} aria-label={`${tr('تذكرة من كتاب الله لقلبك اليوم')} — ${tr('اضغط لتفتح تذكرتك اليوم')}`}>
        <Pattern />
        <span className={styles.tadhGift}><Gift /></span>
        <span className={styles.tadhText}>
          <span className="nq-eyebrow">{tr('تذكرتك اليوم')}</span>
          <span className={styles.tadhTitle}>{tr('تذكرة من كتاب الله لقلبك اليوم')}</span>
          <span className={styles.tadhHint}><Icon name="heart" />{tr('اضغط لتفتح تذكرتك اليوم')}</span>
        </span>
      </Link>
    );
  }
  return <TadhkiraOpened tr={tr} t={t} />;
}

function TadhkiraOpened({ tr, t }) {
  const { entry } = useTadhkiraEntry(t.ref, 'ar');
  return (
    <Link to="/tadhkira" className={`nq-card ${styles.tadh} ${styles.tadhOpen}`}>
      <Corners />
      <span className={styles.tadhText}>
        <span className={styles.tadhTop}>
          <span className="nq-eyebrow">{tr('تذكرتك اليوم')}</span>
          <span className="nq-pill on"><Icon name="heart" />{tr(t.themeName)}</span>
        </span>
        <span className={`nq-q ${styles.tadhQ}`} lang="ar" dir="rtl">
          {entry ? entry.seg.map(([n, text, whole]) => <span key={n}>{text}{whole !== 0 && <>{' '}<AyahMark n={n} /></>}{' '}</span>) : '…'}
        </span>
        <span className={styles.tadhRef}>{refLabel(tr, t.ref, entry?.part)}</span>
      </span>
    </Link>
  );
}

// ── آية اليوم (text cached for the day, so the next launch shows it at once) ──
const AYAH_CACHE = 'nq_home_daily_ayah';
function DailyAyah({ tr }) {
  const d = useMemo(getDailyAyah, []);
  const key = `${d.surah}:${d.ayah}`;
  const [text, setText] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(AYAH_CACHE) || 'null'); return c && c.key === key ? c.text : ''; } catch { return ''; }
  });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (text) return;
    let alive = true;
    fetch(`https://api.alquran.cloud/v1/ayah/${key}/ar.uthmani`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then(j => {
        const t = String(j?.data?.text || '').replace(/^﻿/, '');
        if (!t) throw new Error('empty');
        try { localStorage.setItem(AYAH_CACHE, JSON.stringify({ key, text: t })); } catch {}
        if (alive) setText(t);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line
  return (
    <section className={`nq-card ${styles.daily}`} aria-labelledby="ah-daily">
      <Corners />
      <h2 className="nq-eyebrow" id="ah-daily">{tr('آية اليوم')}</h2>
      {text
        ? <p className={`nq-q ${styles.dailyQ}`} lang="ar" dir="rtl">{text} <AyahMark n={d.ayah} /></p>
        : <p className={`nq-q ${styles.dailyQ} ${styles.dailyWait}`} {...(isRtl() ? { lang: 'ar', dir: 'rtl' } : {})}>{failed ? tr(d.reason) : '…'}</p>}
      <p className={styles.dailyRef}>{tr('سورة {name} · الآية {n}', { name: surahName(d.surah), n: num(d.ayah) })}</p>
      <div className={styles.dailyActs}>
        <Link className="nq-btn ghost sm" to={`/reader?surah=${d.surah}&ayah=${d.ayah}`}><Icon name="book" />{tr('اقرأ في المصحف')}</Link>
        <Link className="nq-btn ghost sm" to="/daily-ayah"><Icon name="doc" />{tr('التفسير')}</Link>
      </div>
    </section>
  );
}

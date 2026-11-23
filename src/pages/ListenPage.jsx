// ─── /listen «التلاوات»: choose a reciter, then a surah ──────────────────────
// A tap on a surah recites it in full in the app-wide player (src/audio engine +
// AudioPlayer dock): it keeps going on other pages and on the lock screen
// (mediaSession). Tapping the surah being recited pauses / resumes it.
import { memo, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { SURAHS_META, READERS } from '../data';
import { useStoreKeys, setGlobal, savePref } from '../store';
import { engine, toggleAudio } from '../audio/controller';
import { preconnectAudio } from '../audio/offline';
import { Icon, Badge8, PageHero, toAr } from '../components/ornaments/Ornaments';
import { readerName } from '../components/reader/readerNames';
import { displayNumber } from '../components/reader/ayahItems';
import { normalizeArabic } from '../arabic';
import { useTr, num, surahName, revelationLabel } from '../l10n';
import { quranTr } from '../locales/quran';
import styles from './ListenPage.module.css';

const COUNTRY = { '🇪🇬': 'مصر', '🇸🇦': 'السعودية', '🇰🇼': 'الكويت' };
const KEYS = ['reader', 'showAudio'];

// What the engine is reciting — re-renders only when the surah / ayah / play state
// changes, not on every progress tick.
let nowCache = null;
function nowSnapshot() {
  const x = engine.getSnapshot();
  const c = x.cursor;
  const key = c ? `${c.surah}:${c.ayah}:${c.basmala ? 1 : 0}:${x.playing ? 1 : 0}:${x.buffering ? 1 : 0}` : '';
  if (!nowCache || nowCache.key !== key) {
    nowCache = { key, surah: c ? c.surah : null, ayah: c ? c.ayah : null, basmala: !!(c && c.basmala), playing: !!x.playing, buffering: !!(x.playing && x.buffering) };
  }
  return nowCache;
}
const useNowPlaying = () => useSyncExternalStore(engine.subscribe, nowSnapshot, nowSnapshot);

const toLatinDigits = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const INDEX = SURAHS_META.map((m, i) => ({ n: i + 1, ar: normalizeArabic(m[0]), lat: m[1].toLowerCase().replace(/[^a-z0-9]/g, '') }));

function matches(q) {
  const raw = q.trim();
  if (!raw) return null;
  const digits = toLatinDigits(raw);
  if (/^\d{1,3}$/.test(digits)) return new Set([+digits]);
  const ar = normalizeArabic(raw).replace(/^سوره\s*/, '');
  const lat = raw.toLowerCase().replace(/^(surah|sura|sourate|sure)\s+/, '').replace(/[^a-z0-9]/g, '');
  return new Set(INDEX.filter(x => (ar && x.ar.includes(ar)) || (lat && x.lat.includes(lat))).map(x => x.n));
}

const SurahRow = memo(function SurahRow({ n, state, lang }) {
  const tr = quranTr(useTr());
  const m = SURAHS_META[n - 1];
  const name = surahName(n, lang);
  const isNow = state !== null;
  const label = state === 'playing'
    ? tr('إيقاف سورة {name} مؤقتاً', { name })
    : state === 'paused' ? tr('متابعة سورة {name}', { name }) : tr('استمع إلى سورة {name} كاملة', { name });
  return (
    <li className={`${styles.row} ${isNow ? styles.rowNow : ''}`}>
      <button type="button" className={styles.rowBtn} data-n={n} aria-label={label} aria-current={isNow ? 'true' : undefined}>
        <Badge8 size={40}>{toAr(n)}</Badge8>
        <span className={styles.rowTxt}>
          <b>{name}</b>
          <small>{revelationLabel(m[3], lang)} · {tr('{n} آية', { n: num(m[2], lang) })}</small>
        </span>
        {lang !== 'ar' && lang !== 'ur' ? <span className={styles.rowAr} lang="ar" dir="rtl">{m[0]}</span> : <span className={styles.rowAr} dir="ltr">{m[1]}</span>}
        <span className={`${styles.rowPlay} ${state === 'playing' ? styles.eq : ''} ${state === 'loading' ? styles.rowLoading : ''}`} aria-hidden="true">
          {state === 'playing' ? <><i /><i /><i /></> : state === 'loading' ? null : <Icon name="play" fill />}
        </span>
      </button>
      <Link to={`/reader?surah=${n}&ayah=1`} className={styles.rowRead} aria-label={tr('اقرأ سورة {name} في المصحف', { name })} title={tr('اقرأها في المصحف')}>
        <Icon name="book" />
      </Link>
    </li>
  );
});

export default function ListenPage() {
  const tr = quranTr(useTr());
  const state = useStoreKeys(KEYS);
  const now = useNowPlaying();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const reader = READERS.find(r => r.id === state.reader) || READERS[0];

  useEffect(() => { preconnectAudio(); }, []);

  const hits = useMemo(() => matches(dq), [dq]);
  const list = useMemo(() => (hits ? [...hits].sort((a, b) => a - b) : SURAHS_META.map((_, i) => i + 1)), [hits]);

  const groups = useMemo(() => READERS.reduce((acc, r) => {
    const g = COUNTRY[r.country] || 'قرّاء آخرون';
    (acc[g] = acc[g] || []).push(r);
    return acc;
  }, {}), []);

  const active = state.showAudio && now.surah ? now.surah : null;
  const rowState = n => {
    if (n !== active) return null;
    if (now.buffering) return 'loading';
    return now.playing ? 'playing' : 'paused';
  };

  function playSurah(n) {
    if (active === n) { toggleAudio(); return; }
    const mode = engine.settings.mode;
    if (mode === 'single' || mode === 'range') engine.configure({ mode: 'surah' });
    setGlobal({ playSurah: n, audioAyah: 1, showAudio: true, playTrigger: Date.now() });
  }

  function chooseReader(id) {
    if (id === state.reader) return;
    setGlobal({ reader: id });          // a recitation in progress switches reciter at the same ayah
    savePref('nq_reader', id);
  }

  // one delegated handler for the 114 rows
  function onListClick(e) {
    const b = e.target instanceof Element ? e.target.closest('button[data-n]') : null;
    if (b) playSurah(Number(b.getAttribute('data-n')));
  }

  const nowName = now.surah ? surahName(now.surah) : '';
  const shown = now.surah ? (now.basmala ? null : displayNumber(now.surah, now.ayah)) : null;
  const nowAyah = now.surah ? (shown === null ? tr('البسملة') : tr('الآية {n}', { n: num(shown) })) : '';

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('استمع إلى كتاب الله')}
        title={tr('التلاوات')}
        sub={tr('اختر القارئ، ثم اضغط على السورة لتستمع إليها كاملة. تبقى التلاوة مستمرة وأنت تتنقّل في التطبيق.')}
      />

      <div className={`nq-wrap ${styles.body}`}>
        {/* ── now playing ── */}
        {active ? (
          <section className={`nq-card ${styles.now}`} aria-label={tr('يُتلى الآن')}>
            <span className={`${styles.nowEq} ${now.playing && !now.buffering ? styles.eqOn : ''}`} aria-hidden="true"><i /><i /><i /><i /></span>
            <div className={styles.nowTxt}>
              <small>{now.buffering ? tr('جارٍ التحميل…') : now.playing ? tr('يُتلى الآن') : tr('متوقف')}</small>
              <b>{tr('سورة {name}', { name: nowName })} · <span>{nowAyah}</span></b>
              <small className={styles.nowReader}>{readerName(reader, tr.lang)}</small>
            </div>
            <div className={styles.nowActs}>
              <button type="button" className={styles.nowPlay} onClick={toggleAudio}
                aria-label={now.playing ? tr('إيقاف مؤقت') : tr('تشغيل')}>
                <Icon name={now.playing ? 'pause' : 'play'} fill />
              </button>
              <Link className="nq-btn ghost sm" to={`/reader?surah=${now.surah}&ayah=${now.ayah || 1}`}>
                <Icon name="book" />{tr('اقرأ مع التلاوة')}
              </Link>
            </div>
          </section>
        ) : null}

        {/* ── reciters ── */}
        <section className={styles.sec} aria-labelledby="nq-listen-readers">
          <div className={styles.secHead}>
            <h2 id="nq-listen-readers">{tr('القارئ')}</h2>
            <span className={styles.secNote}>{readerName(reader, tr.lang)}</span>
          </div>
          <div className={styles.readers} role="group" aria-labelledby="nq-listen-readers">
            {Object.entries(groups).map(([g, rs]) => (
              <div key={g} className={styles.rGroup}>
                <span className={styles.rGroupT}>{tr(g)}</span>
                <div className={styles.rList}>
                {rs.map(r => {
                  const name = readerName(r, tr.lang);
                  const on = r.id === reader.id;
                  return (
                    <button key={r.id} type="button" className={`${styles.reader} ${on ? styles.readerOn : ''}`}
                      aria-pressed={on} onClick={() => chooseReader(r.id)}>
                      <span className={styles.rInit} aria-hidden="true">
                        <svg><use href="#nq-star8" /></svg>
                        <b>{initialOf(name)}</b>
                      </span>
                      <span className={styles.rName}>{name}</span>
                      {on && <Icon name="check" className={styles.rCheck} />}
                    </button>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── surahs ── */}
        <section className={styles.sec} aria-labelledby="nq-listen-surahs">
          <div className={styles.secHead}>
            <h2 id="nq-listen-surahs">{tr('السور')}</h2>
            <span className={styles.secNote}>{tr('{n} سورة', { n: num(list.length) })}</span>
          </div>
          <label className={`nq-input ${styles.search}`}>
            <Icon name="search" />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} dir="auto" enterKeyHint="search"
              placeholder={tr('ابحث باسم السورة أو رقمها')} aria-label={tr('ابحث عن سورة')} />
            {q && (
              <button type="button" className={styles.clear} onClick={() => setQ('')} aria-label={tr('مسح البحث')}><Icon name="x" /></button>
            )}
          </label>
          {list.length ? (
            <ol className={styles.list} onClick={onListClick}>
              {list.map(n => <SurahRow key={n} n={n} state={rowState(n)} lang={tr.lang} />)}
            </ol>
          ) : (
            <p className={styles.empty}>{tr('لا توجد سورة بهذا الاسم.')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function initialOf(name) {
  const s = String(name).replace(/^(ال|عبد\s*ال|Abd(ul|ur|u)?[\s-]*|A[lrsd]-)/i, '').trim();
  return (s.charAt(0) || String(name).charAt(0)).toUpperCase();
}

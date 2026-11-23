// ─── Quran reader: framed mushaf page or ayah-by-ayah cards ──────────────────
// Ayah numbers: the API, audio files, tafsir, bookmarks, progress and the
// reading log all use the Kufi count. Al-Fatiha is displayed with the Madani
// count (see reader/ayahItems.js); every displayed item keeps its `kufi` number.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, setGlobal } from '../store';
import { useAuth } from '../hooks/useAuth';
import { SURAHS_META } from '../data';
import { fetchSurahAyahs, fetchSurahTranslation } from '../api';
import { logReading, saveProgress, addBookmark, removeBookmark, errorMessage } from '../backend';
import { Icon, AyahMark, Badge8, Divider, toAr } from './ornaments/Ornaments';
import { buildItems, BASMALA_TEXT, juzRange } from './reader/ayahItems';
import AyahActions from './reader/AyahActions';
import Toolbar from './Toolbar';
import styles from './Reader.module.css';

const VIEW_KEY = 'nq_reader_view';
function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'ayah' ? 'ayah' : 'mushaf'; } catch { return 'mushaf'; }
}
const reducedMotion = () =>
  (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
  document.documentElement.dataset.reduce === 'on';

export function toggleAudio() { window.dispatchEvent(new CustomEvent('nq:audio-toggle')); }

function goToSurah(n) {
  if (n < 1 || n > 114) return;
  setGlobal({ currentSurah: n, currentAyah: 1, scrollToAyah: null });
  try { localStorage.setItem('nq_lastRead', JSON.stringify({ surah: n, ayah: 1 })); } catch {}
}

// Gilded cartouche holding the surah name.
function Cartouche({ name, count, type }) {
  return (
    <div className={styles.cart}>
      <svg viewBox="0 0 400 62" preserveAspectRatio="none" aria-hidden="true">
        <path d="M26 4H374L396 31 374 58H26L4 31Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M34 10H366L382 31 366 52H34L18 31Z" style={{ fill: 'var(--hl)' }} stroke="currentColor" strokeOpacity=".5" strokeWidth="1" />
        <circle cx="12" cy="31" r="2.5" fill="currentColor" /><circle cx="388" cy="31" r="2.5" fill="currentColor" />
      </svg>
      <small className={styles.cartR}>آياتها {toAr(count)}</small>
      <h2>سورة {name}</h2>
      <small className={styles.cartL}>{type}</small>
    </div>
  );
}

function PageCorners() {
  return (
    <>
      <svg className={`${styles.pc} ${styles.pcA}`} aria-hidden="true"><use href="#nq-cornerBig" /></svg>
      <svg className={`${styles.pc} ${styles.pcB}`} aria-hidden="true"><use href="#nq-cornerBig" /></svg>
      <svg className={`${styles.pc} ${styles.pcC}`} aria-hidden="true"><use href="#nq-cornerBig" /></svg>
      <svg className={`${styles.pc} ${styles.pcD}`} aria-hidden="true"><use href="#nq-cornerBig" /></svg>
    </>
  );
}

export default function Reader() {
  const [state] = useStore();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ayahs, setAyahs]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [loadedSurah, setLoadedSurah]   = useState(null); // surah whose ayahs are currently rendered
  const [reloadKey, setReloadKey]       = useState(0);    // bump to force a re-fetch (retry)
  const [sel, setSel]                   = useState(null); // { uid, kufi } selected ayah
  const [barOpen, setBarOpen]           = useState(false);
  const [error, setError]               = useState(null);
  const [translations, setTranslations] = useState({});
  const [view, setViewState]            = useState(readView);
  const initDone   = useRef(false);
  const progressTimer = useRef(null);

  function setView(v) {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
    // keep the selected ayah in sight when switching
    if (sel) setTimeout(() => {
      const el = document.querySelector(`[data-uid="${sel.uid}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    }, 60);
  }

  // Debounced PUT /me/progress — cleared on unmount
  useEffect(() => () => clearTimeout(progressTimer.current), []);

  // Deep links (/reader?surah=X&ayah=Y — Y is the Kufi number) + restore last-read position on first mount
  useEffect(() => {
    const qs = parseInt(searchParams.get('surah'), 10);
    if (qs >= 1 && qs <= 114) {
      const count = SURAHS_META[qs - 1][2];
      const qa = parseInt(searchParams.get('ayah'), 10);
      const ayah = qa >= 1 && qa <= count ? qa : 1;
      initDone.current = true;
      setGlobal({ currentSurah: qs, currentAyah: ayah, scrollToAyah: ayah });
      setSearchParams({}, { replace: true }); // clean the URL
      return;
    }
    if (!initDone.current) {
      initDone.current = true;
      // Cold load: scroll to the restored ayah unless a scroll target was already requested
      if (!state.scrollToAyah && state.currentAyah > 1) {
        setGlobal({ scrollToAyah: state.currentAyah });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load translation when surah or translation setting changes (ignore stale responses)
  useEffect(() => {
    setTranslations({});
    if (!state.translation || state.translation === 'none') return;
    let cancelled = false;
    fetchSurahTranslation(state.currentSurah, state.translation)
      .then(data => {
        if (cancelled) return;
        const map = {};
        data.forEach(a => { map[a.number] = a.text; });
        setTranslations(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state.currentSurah, state.translation, reloadKey]);

  // Load surah whenever currentSurah changes (or retry). Stale responses are ignored,
  // so the latest requested surah always wins.
  useEffect(() => {
    const surah = state.currentSurah;
    let cancelled = false;

    setLoading(true);
    setAyahs([]);
    setLoadedSurah(null);
    setError(null);
    setSel(null);
    setBarOpen(false);

    window.scrollTo({ top: 0 });

    fetchSurahAyahs(surah)
      .then(data => {
        if (cancelled) return;
        setAyahs(data);
        setLoadedSurah(surah);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load surah', err);
        setError('تعذّر تحميل السورة — تحقق من اتصالك بالإنترنت');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [state.currentSurah, reloadKey]);

  const built = useMemo(
    () => (loadedSurah ? buildItems(loadedSurah, ayahs) : { basmala: false, basmalaKufi: null, items: [] }),
    [loadedSurah, ayahs]
  );

  // Scroll to a specific (Kufi) ayah when requested — only once the requested surah is rendered
  useEffect(() => {
    if (!state.scrollToAyah || loading || loadedSurah !== state.currentSurah) return;
    const target = state.scrollToAyah;
    // (no cleanup: clearing scrollToAyah below re-runs this effect)
    setTimeout(() => {
      const el = document.getElementById(`ayah-${target}`);
      if (el) el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }, 200);
    setGlobal({ scrollToAyah: null });
  }, [state.scrollToAyah, state.currentSurah, loadedSurah, loading]);

  // Reading progress bar (page scroll)
  useEffect(() => {
    let raf = 0;
    function update() {
      raf = 0;
      const bar = document.getElementById('progressBar');
      if (!bar) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(update); }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loading, view]);

  // Follow the recitation: keep the playing ayah on screen
  useEffect(() => {
    if (!state.isPlaying || loading) return;
    const el = document.querySelector(`[data-kufi="${state.audioAyah}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = 150, bottom = window.innerHeight - 200;
    if (r.top < top || r.top > bottom) {
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }, [state.audioAyah, state.isPlaying, loading]);

  // Escape closes the ayah tools
  useEffect(() => {
    if (!barOpen) return;
    function onKey(e) { if (e.key === 'Escape' && !state.showTafsir) closeBar(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barOpen, state.showTafsir, state.highlightMode]);

  // ── Actions ──────────────────────────────────────────────────────────────
  function selectAyah(item) {
    setSel({ uid: item.uid, kufi: item.kufi });
    setBarOpen(true);
    const num = item.kufi;
    // an open tafsir follows the selection
    if (state.showTafsir) setGlobal({ currentAyah: num, tafsirAyah: num, tafsirSurah: state.currentSurah });
    else setGlobal({ currentAyah: num });
    localStorage.setItem('nq_lastRead', JSON.stringify({ surah: state.currentSurah, ayah: num }));
    // حفظ تاريخ اليوم للـ streak المحلي (يشتغل حتى بدون حساب)
    const today = (() => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    })();
    try {
      const prev = JSON.parse(localStorage.getItem('nq_read_dates') || '[]');
      if (!prev.includes(today)) {
        localStorage.setItem('nq_read_dates', JSON.stringify([...prev, today].slice(-90)));
      }
    } catch {}
    if (user) {
      const surah = state.currentSurah;
      logReading(surah, num); // سجل القراءة اليومي (fire-and-forget)
      clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => { saveProgress(user.id, surah, num); }, 1500); // آخر موضع
    }
  }

  function closeBar() {
    setBarOpen(false);
    if (!state.highlightMode) setSel(null);
  }

  function copyAyah(item) {
    const meta = SURAHS_META[state.currentSurah - 1];
    navigator.clipboard.writeText(
      `${item.text}\n\n— سورة ${meta[0]}، الآية ${item.label}`
    ).then(() => setGlobal({ toast: 'تم نسخ الآية مع المرجع' }))
     .catch(() => setGlobal({ toast: 'تعذّر النسخ' }));
  }

  function toggleBookmark(ayahNum) {
    const exists = state.bookmarks.find(
      b => b.surah === state.currentSurah && b.ayah === ayahNum
    );
    const next = exists
      ? state.bookmarks.filter(b => !(b.surah === state.currentSurah && b.ayah === ayahNum))
      : [...state.bookmarks, { surah: state.currentSurah, ayah: ayahNum }];
    setGlobal({ bookmarks: next, toast: exists ? 'تم الحذف من المفضلة' : 'تم الحفظ في المفضلة' });
    try { localStorage.setItem('nq_bookmarks', JSON.stringify(next)); } catch {}
    if (user) syncBookmarkChange(state.currentSurah, ayahNum, !exists);
  }

  // One change on the account; the server answers with the full list.
  async function syncBookmarkChange(surah, ayah, added) {
    try {
      const list = added ? await addBookmark(surah, ayah) : await removeBookmark(surah, ayah);
      setGlobal({ bookmarks: list });
      try { localStorage.setItem('nq_bookmarks', JSON.stringify(list)); } catch {}
    } catch (e) {
      setGlobal({ toast: errorMessage(e, 'تعذّرت مزامنة المفضلة مع حسابك') + ' — حُفظ التغيير على هذا الجهاز' });
    }
  }

  function playAyah(num) {
    if (state.isPlaying && state.audioAyah === num) { toggleAudio(); return; }
    setGlobal({ audioAyah: num, showAudio: true, playTrigger: Date.now() });
  }

  function listen() {
    if (state.isPlaying || state.showAudio) { toggleAudio(); return; }
    setGlobal({ audioAyah: sel?.kufi || 1, showAudio: true, playTrigger: Date.now() });
  }

  function act(id, item) {
    const surah = state.currentSurah;
    const num = item.kufi;
    switch (id) {
      case 'play': playAyah(num); break;
      case 'tafsir': setGlobal({ showTafsir: true, tafsirAyah: num, tafsirSurah: surah }); break;
      case 'bookmark': toggleBookmark(num); break;
      case 'copy': copyAyah(item); break;
      case 'note':
        window.dispatchEvent(new CustomEvent('openNote', { detail: { surah, ayah: num } }));
        break;
      case 'share':
        window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah, ayah: num, text: item.fullText } }));
        break;
      case 'ask':
        setGlobal({ currentAyah: num });
        window.dispatchEvent(new CustomEvent('openAI', { detail: { surah, ayah: num, text: item.fullText } }));
        break;
      default:
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const surah      = state.currentSurah;
  const meta       = SURAHS_META[surah - 1];
  const [j1, j2]   = juzRange(surah);
  const quranFont  = state.fontStyle === 'uthmani' ? 'var(--f-quran)' : 'var(--f-ui)';
  const transDir   = /^(ur|fa)\./.test(state.translation || '') ? 'rtl' : 'ltr';
  const hasTrans   = state.translation && state.translation !== 'none';
  const ready      = !loading && !error && loadedSurah === surah;
  const audioOn    = state.showAudio;
  const isBookmarked = (k) => state.bookmarks.some(b => b.surah === surah && b.ayah === k);
  const isPlayingK = (k) => audioOn && state.audioAyah === k;
  const showSel    = (uid) => sel && sel.uid === uid && (barOpen || state.highlightMode);
  const selItem    = sel ? built.items.find(i => i.uid === sel.uid) : null;
  const juzLabel   = j1 === j2 ? `الجزء ${toAr(j1)}` : `الجزء ${toAr(j1)}–${toAr(j2)}`;
  const basmalaPlaying = built.basmalaKufi && isPlayingK(built.basmalaKufi);

  const basmalaLine = built.basmala && (
    <p className={`${styles.basm} ${basmalaPlaying ? styles.playing : ''}`}
      id={built.basmalaKufi ? `ayah-${built.basmalaKufi}` : undefined}
      data-kufi={built.basmalaKufi || undefined}
      style={{ fontFamily: quranFont }}>
      {BASMALA_TEXT}
    </p>
  );

  function onAyahKey(e, item) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAyah(item); }
  }

  return (
    <main id="main" className={`${styles.center} ${audioOn ? styles.withDock : ''}`}>
      <Toolbar view={view} onView={setView} onListen={listen}
        onPrev={() => goToSurah(surah - 1)} onNext={() => goToSurah(surah + 1)} />

      {view === 'mushaf' && hasTrans && ready && (
        <p className={styles.hint}>
          <Icon name="globe" />
          <span>الترجمة المختارة تظهر في عرض «آية بآية».</span>
          <button type="button" onClick={() => setView('ayah')}>اعرضها</button>
        </p>
      )}

      {/* ── Mushaf view ── */}
      {view === 'mushaf' && (
        <article className={styles.page} aria-label={`سورة ${meta[0]}`} aria-busy={loading}>
          <PageCorners />
          <div className={styles.pageIn}>
            <div className={styles.phead}><span>سورة {meta[0]}</span><span>{juzLabel}</span></div>
            <Cartouche name={meta[0]} count={meta[2]} type={meta[3]} />

            {loading && <Skeleton />}
            {error && !loading && <ErrorBox msg={error} onRetry={() => setReloadKey(k => k + 1)} />}

            {ready && (
              <>
                {basmalaLine}
                <p className={styles.mtext} style={{ fontFamily: quranFont }}>
                  {built.items.map(item => (
                    <span key={item.uid}>
                      <span
                        id={item.anchor ? `ayah-${item.kufi}` : undefined}
                        data-uid={item.uid}
                        data-kufi={item.kufi}
                        className={`${styles.ay} ${showSel(item.uid) ? styles.sel : ''} ${isPlayingK(item.kufi) ? styles.playing : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={!!showSel(item.uid)}
                        onClick={() => selectAyah(item)}
                        onKeyDown={e => onAyahKey(e, item)}
                      >
                        {item.text}{' '}<AyahMark n={item.label} />
                      </span>{' '}
                    </span>
                  ))}
                </p>
                <div className={styles.pfoot}><Divider /></div>
              </>
            )}
          </div>
        </article>
      )}

      {/* ── Ayah-by-ayah view ── */}
      {view === 'ayah' && (
        <section className={styles.list} aria-label={`آيات سورة ${meta[0]}`} aria-busy={loading}>
          <header className={`nq-card ${styles.listHead}`}>
            <Cartouche name={meta[0]} count={meta[2]} type={meta[3]} />
            {ready && basmalaLine}
          </header>

          {loading && <div className={`nq-card ${styles.card}`}><Skeleton /></div>}
          {error && !loading && <ErrorBox msg={error} onRetry={() => setReloadKey(k => k + 1)} />}

          {ready && built.items.map(item => {
            const playing = isPlayingK(item.kufi);
            const selected = sel && sel.uid === item.uid;
            const trans = item.showTrans ? translations[item.kufi] : null;
            return (
              <article key={item.uid}
                id={item.anchor ? `ayah-${item.kufi}` : undefined}
                data-uid={item.uid} data-kufi={item.kufi}
                className={`nq-card ${styles.card} ${selected ? styles.cardSel : ''} ${playing ? styles.cardPlay : ''}`}
                tabIndex={0}
                aria-label={`الآية ${item.label}`}
                onClick={() => { selectAyah(item); setBarOpen(false); }}
                onKeyDown={e => { if (e.target === e.currentTarget) onAyahKey(e, item); }}
              >
                <div className={styles.cardTop}>
                  <Badge8 size={42}>{toAr(item.label)}</Badge8>
                  <span className={styles.cardRef}>{meta[0]} · الآية {toAr(item.label)}</span>
                  {playing && <span className={`nq-pill on ${styles.nowPill}`}><Icon name="head" />{state.isPlaying ? 'يُتلى الآن' : 'متوقف'}</span>}
                </div>
                <p className={styles.cardText} style={{ fontFamily: quranFont }}>
                  {item.text}{' '}<AyahMark n={item.label} />
                </p>
                {trans && <p className={styles.trans} dir={transDir}>{trans}</p>}
                <AyahActions variant="inline" refLabel={`الآية ${item.label}`}
                  bookmarked={isBookmarked(item.kufi)} playing={playing && state.isPlaying}
                  on={id => act(id, item)} />
              </article>
            );
          })}
        </section>
      )}

      {/* ── Between surahs ── */}
      {ready && (
        <nav className={styles.endNav} aria-label="التنقل بين السور">
          {surah > 1 ? (
            <button type="button" className={`nq-card ${styles.endBtn}`} onClick={() => goToSurah(surah - 1)}>
              <Icon name="back" />
              <span><small>السورة السابقة</small><b>{SURAHS_META[surah - 2][0]}</b></span>
            </button>
          ) : <span />}
          {surah < 114 ? (
            <button type="button" className={`nq-card ${styles.endBtn} ${styles.endNext}`} onClick={() => goToSurah(surah + 1)}>
              <span><small>السورة التالية</small><b>{SURAHS_META[surah][0]}</b></span>
              <Icon name="back" className={styles.flip} />
            </button>
          ) : <span />}
        </nav>
      )}

      {/* ── Ayah tools (mushaf view) ── */}
      {view === 'mushaf' && barOpen && selItem && ready && (
        <AyahActions variant="bar"
          refLabel={`${meta[0]} · الآية ${toAr(selItem.label)}`}
          bookmarked={isBookmarked(selItem.kufi)}
          playing={isPlayingK(selItem.kufi) && state.isPlaying}
          on={id => act(id, selItem)}
          onClose={closeBar} />
      )}
    </main>
  );
}

function Skeleton() {
  return (
    <div className={styles.skel} role="status" aria-label="جاري تحميل السورة">
      {[92, 100, 86, 97, 74, 100, 60].map((w, i) => <i key={i} style={{ width: w + '%' }} />)}
      <span className="nq-sr">جاري تحميل السورة…</span>
    </div>
  );
}

function ErrorBox({ msg, onRetry }) {
  return (
    <div className={styles.errorBox} role="alert">
      <p>{msg}</p>
      <button type="button" className="nq-btn gold sm" onClick={onRetry}><Icon name="repeat" />إعادة المحاولة</button>
    </div>
  );
}

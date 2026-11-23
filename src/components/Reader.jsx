// ─── Quran reader: framed mushaf page or ayah-by-ayah cards ──────────────────
// Ayah numbers: the API, audio files, tafsir, bookmarks, progress and the
// reading log all use the Kufi count. Al-Fatiha is displayed with the Madani
// count (see reader/ayahItems.js); every displayed item keeps its `kufi` number.
//
// One tap (click, Enter or Space) on an ayah recites from that ayah with the
// current reciter; tapping the ayah being recited pauses / resumes. The other
// tools (tafsir, bookmark, copy, note, share…) open with a long press, a right
// click, the context-menu key or Shift+F10 on the ayah, from the «…» button of a
// card, or from the small «…» chip above the player (the recited ayah).
//
// Long surahs: the ayahs are memoised rows that re-render only when their own
// state changes (recited / selected / bookmarked), events are delegated to the
// list, and the cards use content-visibility, so the recitation stepping from
// ayah to ayah — and leaving the page — stays cheap on a phone.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStoreKeys, setGlobal, getGlobal } from '../store';
import { useAuth } from '../hooks/useAuth';
import { SURAHS_META } from '../data';
import { fetchSurahAyahs, cachedSurahAyahs, prefetchSurahAyahs, fetchSurahTranslation } from '../api';
import { logReading, saveProgress, addBookmark, removeBookmark, errorMessage } from '../backend';
import { Icon, AyahMark, Badge8, Divider, toAr } from './ornaments/Ornaments';
import { useTr, num, surahName, revelationLabel } from '../l10n';
import { coreTr, coreTrNow } from '../locales/core';
import { quranTr } from '../locales/quran';
import { buildItems, BASMALA_TEXT, juzRange } from './reader/ayahItems';
import AyahActions from './reader/AyahActions';
import { engine, toggleAudio as toggleEngine } from '../audio/controller';
import { preconnectAudio } from '../audio/offline';
import Toolbar from './Toolbar';
import styles from './Reader.module.css';
import barStyles from './reader/AyahActions.module.css';

const VIEW_KEY = 'nq_reader_view';
function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'ayah' ? 'ayah' : 'mushaf'; } catch { return 'mushaf'; }
}
const reducedMotion = () =>
  (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
  document.documentElement.dataset.reduce === 'on';

export function toggleAudio() { window.dispatchEvent(new CustomEvent('nq:audio-toggle')); }

// Follow-along: after the visitor scrolls by hand, leave the page alone this long.
const FOLLOW_PAUSE_MS = 8000;
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
const LONG_PRESS_MS = 480;
const HINT_ID = 'nq-ayah-hint';

const STORE_KEYS = [
  'currentSurah', 'currentAyah', 'scrollToAyah', 'translation', 'fontStyle', 'bookmarks',
  'showTafsir', 'highlightMode', 'showAudio', 'audioSurah', 'audioAyah', 'audioBasmala',
  'isPlaying', 'audioBuffering', 'followAudio',
];

function goToSurah(n) {
  if (n < 1 || n > 114) return;
  setGlobal({ currentSurah: n, currentAyah: 1, scrollToAyah: null });
  try { localStorage.setItem('nq_lastRead', JSON.stringify({ surah: n, ayah: 1 })); } catch {}
}

const idle = fn => (typeof window !== 'undefined' && window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1200));
const cancelIdle = id => (typeof window !== 'undefined' && window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));

// Gilded cartouche holding the surah name.
function Cartouche({ name, count, type }) {
  const tr = coreTr(useTr());
  return (
    <div className={styles.cart}>
      <svg viewBox="0 0 400 62" preserveAspectRatio="none" aria-hidden="true">
        <path d="M26 4H374L396 31 374 58H26L4 31Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M34 10H366L382 31 366 52H34L18 31Z" style={{ fill: 'var(--hl)' }} stroke="currentColor" strokeOpacity=".5" strokeWidth="1" />
        <circle cx="12" cy="31" r="2.5" fill="currentColor" /><circle cx="388" cy="31" r="2.5" fill="currentColor" />
      </svg>
      <small className={styles.cartR}>{tr('آياتها {n}', { n: num(count) })}</small>
      <h2 lang="ar">سورة {name}</h2>
      <small className={styles.cartL}>{revelationLabel(type)}</small>
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

// ── One ayah in the mushaf page (memoised: re-renders only when its state changes) ──
const MushafAyah = memo(function MushafAyah({ item, sel, playing, buffering, lang }) {
  return (
    <>
      <span
        id={item.anchor ? `ayah-${item.kufi}` : undefined}
        data-uid={item.uid}
        data-kufi={item.kufi}
        className={`${styles.ay} ${sel ? styles.sel : ''} ${playing ? styles.playing : ''} ${buffering ? styles.buffering : ''}`}
        role="button"
        tabIndex={0}
        aria-current={playing ? 'true' : undefined}
        aria-describedby={HINT_ID}
      >
        {item.text}{' '}<AyahMark n={item.label} />
      </span>{' '}
    </>
  );
});

// ── One ayah card (ayah-by-ayah view) ──
const AyahCard = memo(function AyahCard({ item, selected, playing, nowState, buffering, bookmarked, trans, transDir, quranFont, sName, lang }) {
  const tr = quranTr(useTr());
  const label = tr('الآية {n}', { n: num(item.label, lang) });
  return (
    <article
      id={item.anchor ? `ayah-${item.kufi}` : undefined}
      data-uid={item.uid} data-kufi={item.kufi}
      className={`nq-card ${styles.card} ${selected ? styles.cardSel : ''} ${playing ? styles.cardPlay : ''} ${buffering ? styles.buffering : ''}`}
      tabIndex={0}
      aria-label={label}
      aria-current={playing ? 'true' : undefined}
      aria-describedby={HINT_ID}
    >
      <div className={styles.cardTop}>
        <Badge8 size={42}>{toAr(item.label)}</Badge8>
        <span className={styles.cardRef}>{tr('{name} · الآية {n}', { name: sName, n: toAr(item.label) })}</span>
        {bookmarked && <Icon name="bookmark" className={styles.bmMark} title={tr('في المفضلة')} />}
        {nowState && <span className={`nq-pill on ${styles.nowPill}`}><Icon name={nowState === 'on' ? 'head' : 'pause'} />{nowState === 'on' ? tr('يُتلى الآن') : tr('متوقف')}</span>}
        <button type="button" className={styles.moreBtn} data-act="tools"
          aria-label={tr('أدوات {ref}', { ref: label })} title={tr('المزيد: التفسير، المفضلة، النسخ…')} aria-haspopup="true">
          <Icon name="dots" />
        </button>
      </div>
      <p className={styles.cardText} lang="ar" dir="rtl" style={{ fontFamily: quranFont }}>
        {item.text}{' '}<AyahMark n={item.label} />
      </p>
      {trans && <p className={styles.trans} dir={transDir}>{trans}</p>}
    </article>
  );
});

export default function Reader() {
  const state = useStoreKeys(STORE_KEYS);
  const tr = quranTr(useTr());
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const first = useRef(null);
  if (first.current === null) {
    const s = getGlobal().currentSurah;
    first.current = { surah: s, ayahs: cachedSurahAyahs(s) };
  }
  const [ayahs, setAyahs]               = useState(() => first.current.ayahs || []);
  const [loading, setLoading]           = useState(() => !first.current.ayahs);
  const [loadedSurah, setLoadedSurah]   = useState(() => (first.current.ayahs ? first.current.surah : null)); // surah whose ayahs are rendered
  const [reloadKey, setReloadKey]       = useState(0);    // bump to force a re-fetch (retry)
  const [sel, setSel]                   = useState(null); // { uid, kufi } ayah the tools are for
  const [barOpen, setBarOpen]           = useState(false);
  const [error, setError]               = useState(null);
  const [translations, setTranslations] = useState({});
  const [view, setViewState]            = useState(readView);
  const initDone   = useRef(false);
  const progressTimer = useRef(null);
  const userScrollAt = useRef(0);                      // last manual scroll (follow-along pauses)
  const followScrollAt = useRef(0);                    // last automatic follow-along scroll
  const press = useRef(null);                          // long-press tracking
  const suppressClick = useRef(0);
  const prevAudioSurah = useRef(state.audioSurah);
  const [followTick, setFollowTick] = useState(0);

  function setView(v) {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
    // keep the selected (or recited) ayah in sight when switching
    const k = sel ? sel.kufi : (audioHere ? state.audioAyah : null);
    if (k) setTimeout(() => {
      const el = document.querySelector(`[data-kufi="${k}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    }, 60);
  }

  // Debounced PUT /me/progress — cleared on unmount
  useEffect(() => () => clearTimeout(progressTimer.current), []);
  // The first tap should not wait for DNS + TLS to the audio host
  useEffect(() => { preconnectAudio(); }, []);

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
  // so the latest requested surah always wins. A surah already on the device shows at once.
  useEffect(() => {
    const surah = state.currentSurah;
    let cancelled = false;
    setSel(null);
    setBarOpen(false);
    setError(null);

    if (loadedSurah !== surah) window.scrollTo({ top: 0 });
    const cached = cachedSurahAyahs(surah);
    if (cached) {
      setAyahs(cached);
      setLoadedSurah(surah);
      setLoading(false);
    } else {
      setLoading(true);
      setAyahs([]);
      setLoadedSurah(null);
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
    }
    // the next surah is the likeliest next stop (reading on, or continuous recitation)
    const id = idle(() => prefetchSurahAyahs(surah + 1));
    return () => { cancelled = true; cancelIdle(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentSurah, reloadKey]);

  const built = useMemo(
    () => (loadedSurah ? buildItems(loadedSurah, ayahs) : { basmala: false, basmalaKufi: null, items: [] }),
    [loadedSurah, ayahs]
  );
  const byUid = useMemo(() => {
    const m = new Map();
    built.items.forEach(i => m.set(i.uid, i));
    return m;
  }, [built]);

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
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, pct / 100))})`;
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(update); }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loading, view]);

  // Manual scrolling pauses follow-along for a few seconds. A touch while an automatic
  // scroll is still gliding stops it at once, so the tap lands where the finger is
  // (on Android a tap during a scroll animation is otherwise eaten to stop the scroll).
  useEffect(() => {
    const mark = () => { userScrollAt.current = Date.now(); };
    const onTouchStart = () => {
      if (Date.now() - followScrollAt.current < 1200) {
        followScrollAt.current = 0;
        try { window.scrollTo({ top: window.scrollY, behavior: 'instant' }); } catch { window.scrollTo(0, window.scrollY); }
      }
    };
    const onKey = e => {
      if (!SCROLL_KEYS.includes(e.key)) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      mark();
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Follow the recitation: keep the playing ayah (or basmala) on screen
  useEffect(() => {
    if (!state.followAudio || !state.isPlaying || loading || loadedSurah !== state.currentSurah) return;
    if ((state.audioSurah || state.currentSurah) !== state.currentSurah) return;
    const since = Date.now() - userScrollAt.current;
    if (since < FOLLOW_PAUSE_MS) {
      const t = setTimeout(() => setFollowTick(n => n + 1), FOLLOW_PAUSE_MS - since + 50);
      return () => clearTimeout(t);
    }
    const el = state.audioBasmala
      ? document.querySelector('[data-basmala]')
      : document.querySelector(`[data-kufi="${state.audioAyah}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = 150, bottom = window.innerHeight - 200;
    if (r.top < top || r.top > bottom) {
      followScrollAt.current = Date.now();
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }, [state.audioAyah, state.audioBasmala, state.audioSurah, state.isPlaying, state.followAudio, state.currentSurah, loading, loadedSurah, view, followTick]);

  // The recitation moved on to another surah (continuous play): follow it
  useEffect(() => {
    const prev = prevAudioSurah.current;
    prevAudioSurah.current = state.audioSurah;
    if (!state.followAudio || !state.isPlaying || !prev || !state.audioSurah || state.audioSurah === prev) return;
    if (state.currentSurah === prev) goToSurah(state.audioSurah);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.audioSurah]);

  // Escape closes the ayah tools
  useEffect(() => {
    if (!barOpen) return;
    function onKey(e) { if (e.key === 'Escape' && !state.showTafsir) closeBar(); }
    // Android back (the app) closes the tools before leaving the page
    function onBack(e) { if (!state.showTafsir) { e.preventDefault(); closeBar(); } }
    window.addEventListener('keydown', onKey);
    window.addEventListener('nq-native-back', onBack);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('nq-native-back', onBack); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barOpen, state.showTafsir, state.highlightMode]);

  // ── Actions ──────────────────────────────────────────────────────────────
  // Bookkeeping for an ayah the visitor engaged with: last read, streak, reading log.
  function markRead(num) {
    const surah = state.currentSurah;
    // an open tafsir follows the ayah
    if (state.showTafsir) setGlobal({ currentAyah: num, tafsirAyah: num, tafsirSurah: surah });
    else setGlobal({ currentAyah: num });
    try { localStorage.setItem('nq_lastRead', JSON.stringify({ surah, ayah: num })); } catch {}
    // حفظ تاريخ اليوم للـ streak المحلي (يشتغل حتى بدون حساب)
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    try {
      const prev = JSON.parse(localStorage.getItem('nq_read_dates') || '[]');
      if (!prev.includes(today)) localStorage.setItem('nq_read_dates', JSON.stringify([...prev, today].slice(-90)));
    } catch {}
    if (user) {
      logReading(surah, num); // سجل القراءة اليومي (fire-and-forget)
      clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => { saveProgress(user.id, surah, num); }, 1500); // آخر موضع
    }
  }

  // One tap: recite from this ayah (or pause / resume the ayah being recited).
  function playFrom(item) {
    const surah = state.currentSurah;
    const k = item.kufi;
    const c = engine.cursor;
    if (state.showAudio && c && c.surah === surah && c.ayah === k && !c.basmala) { toggleEngine(); return; }
    const st = engine.settings;
    if (st.mode === 'range') {
      const lo = Math.min(st.rangeFrom || 1, st.rangeTo || 1), hi = Math.max(st.rangeFrom || 1, st.rangeTo || 1);
      if (k < lo || k > hi) engine.configure({ mode: 'surah' });
    }
    setSel({ uid: item.uid, kufi: k });
    setBarOpen(false);
    setGlobal({ audioAyah: k, playSurah: surah, showAudio: true, playTrigger: Date.now() });
    markRead(k);
  }

  function openTools(item) {
    setSel({ uid: item.uid, kufi: item.kufi });
    setBarOpen(true);
    markRead(item.kufi);
  }

  function closeBar() {
    setBarOpen(false);
    if (!state.highlightMode) setSel(null);
  }

  // ── delegated pointer / keyboard handling for every ayah of the page ──
  const itemFromEvent = e => {
    const el = e.target instanceof Element ? e.target.closest('[data-uid]') : null;
    return el && e.currentTarget.contains(el) ? byUid.get(el.getAttribute('data-uid')) || null : null;
  };
  const hasTextSelection = () => {
    try { const s = window.getSelection(); return !!s && !s.isCollapsed && String(s).trim().length > 0; } catch { return false; }
  };
  function cancelPress() {
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
  }
  const listHandlers = {
    onClick(e) {
      const item = itemFromEvent(e);
      if (!item) return;
      if (e.target instanceof Element && e.target.closest('[data-act="tools"]')) { e.stopPropagation(); openTools(item); return; }
      if (Date.now() < suppressClick.current) return;   // the end of a long press
      if (hasTextSelection()) return;                    // selecting text to copy
      playFrom(item);
    },
    onKeyDown(e) {
      const item = itemFromEvent(e);
      if (!item) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t && t.closest('button')) return;              // the card's own «…» button
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); openTools(item); return; }
      if (t && !t.hasAttribute('data-uid')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) playFrom(item); }
    },
    onContextMenu(e) {
      const item = itemFromEvent(e);
      if (!item) return;
      const fromPress = Date.now() < suppressClick.current;  // our long press already opened the tools
      if (!fromPress && hasTextSelection()) return;           // a right click on selected text: the browser menu
      e.preventDefault();
      cancelPress();
      suppressClick.current = Date.now() + 700;
      if (e.nativeEvent && e.nativeEvent.pointerType !== 'mouse') { try { window.getSelection().removeAllRanges(); } catch {} }
      openTools(item);
    },
    onPointerDown(e) {
      if (e.button !== 0 || e.pointerType === 'mouse') return;
      const item = itemFromEvent(e);
      if (!item) return;
      cancelPress();
      const x = e.clientX, y = e.clientY;
      press.current = {
        x, y,
        timer: setTimeout(() => {
          press.current = null;
          suppressClick.current = Date.now() + 700;
          try { navigator.vibrate && navigator.vibrate(12); } catch {}
          openTools(item);
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove(e) {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
  };

  function copyAyah(item) {
    const meta = SURAHS_META[state.currentSurah - 1];
    const local = tr.lang !== 'ar' ? `\n${coreTrNow('{name} {s}:{a}', { name: surahName(state.currentSurah), s: state.currentSurah, a: item.label })}` : '';
    navigator.clipboard.writeText(
      `${item.text}\n\n— سورة ${meta[0]}، الآية ${item.label}${local}`
    ).then(() => setGlobal({ toast: coreTrNow('تم نسخ الآية مع المرجع') }))
     .catch(() => setGlobal({ toast: coreTrNow('تعذّر النسخ') }));
  }

  function toggleBookmark(ayahNum) {
    const g = getGlobal();
    const exists = g.bookmarks.find(b => b.surah === g.currentSurah && b.ayah === ayahNum);
    const next = exists
      ? g.bookmarks.filter(b => !(b.surah === g.currentSurah && b.ayah === ayahNum))
      : [...g.bookmarks, { surah: g.currentSurah, ayah: ayahNum }];
    setGlobal({ bookmarks: next, toast: exists ? coreTrNow('تم الحذف من المفضلة') : coreTrNow('تم الحفظ في المفضلة') });
    try { localStorage.setItem('nq_bookmarks', JSON.stringify(next)); } catch {}
    if (user) syncBookmarkChange(g.currentSurah, ayahNum, !exists);
  }

  // One change on the account; the server answers with the full list.
  async function syncBookmarkChange(surah, ayah, added) {
    try {
      const list = added ? await addBookmark(surah, ayah) : await removeBookmark(surah, ayah);
      setGlobal({ bookmarks: list });
      try { localStorage.setItem('nq_bookmarks', JSON.stringify(list)); } catch {}
    } catch (e) {
      setGlobal({ toast: errorMessage(e, coreTrNow('تعذّرت مزامنة المفضلة مع حسابك')) + coreTrNow(' — حُفظ التغيير على هذا الجهاز') });
    }
  }

  function listen() {
    // pause, or resume a recitation of this surah; otherwise start here (selected ayah or the beginning)
    if (state.isPlaying || (state.showAudio && state.audioSurah === state.currentSurah)) { toggleAudio(); return; }
    setGlobal({ audioAyah: sel?.kufi || 1, playSurah: state.currentSurah, showAudio: true, playTrigger: Date.now() });
  }

  function act(id, item) {
    const surah = state.currentSurah;
    const num = item.kufi;
    switch (id) {
      case 'play': playFrom(item); break;
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
  const bmSet      = useMemo(() => new Set(state.bookmarks.filter(b => b.surah === surah).map(b => b.ayah)), [state.bookmarks, surah]);
  // the recited ayah (Kufi) — only in the surah being recited, and not while its basmala plays
  const audioHere  = audioOn && (state.audioSurah || surah) === surah;
  const playingK   = audioHere && !state.audioBasmala ? state.audioAyah : null;
  const isPlayingK = (k) => playingK === k;
  const bufferingK = state.audioBuffering ? playingK : null;
  const showSel    = (uid) => !!sel && sel.uid === uid && (barOpen || state.highlightMode);
  const selItem    = sel ? byUid.get(sel.uid) || null : null;
  // the ayah the «…» chip opens: the one being recited here, else the one last tapped
  const chipItem   = playingK ? built.items.find(i => i.kufi === playingK) : selItem;
  const juzLabel   = j1 === j2 ? tr('الجزء {n}', { n: num(j1) }) : tr('الجزء {a}–{b}', { a: num(j1), b: num(j2) });
  const sName      = surahName(surah);
  const basmalaPlaying = built.basmalaKufi ? isPlayingK(built.basmalaKufi) : audioHere && state.audioBasmala;
  const nowState   = state.isPlaying ? 'on' : 'paused';

  const basmalaLine = built.basmala && (
    <p className={`${styles.basm} ${basmalaPlaying ? styles.playing : ''}`}
      id={built.basmalaKufi ? `ayah-${built.basmalaKufi}` : undefined}
      data-kufi={built.basmalaKufi || undefined}
      data-basmala=""
      lang="ar" dir="rtl"
      style={{ fontFamily: quranFont }}>
      {BASMALA_TEXT}
    </p>
  );

  return (
    <main id="main" className={`${styles.center} ${audioOn ? styles.withDock : ''}`}>
      <Toolbar view={view} onView={setView} onListen={listen}
        onPrev={() => goToSurah(surah - 1)} onNext={() => goToSurah(surah + 1)} />

      <span id={HINT_ID} className="nq-sr">{tr('اضغط للاستماع من هذه الآية، واضغط مطوّلاً لبقية الأدوات')}</span>

      {view === 'mushaf' && hasTrans && ready && (
        <p className={styles.hint}>
          <Icon name="globe" />
          <span>{tr('الترجمة المختارة تظهر في عرض «آية بآية».')}</span>
          <button type="button" onClick={() => setView('ayah')}>{tr('اعرضها')}</button>
        </p>
      )}

      {/* ── Mushaf view ── */}
      {view === 'mushaf' && (
        <article className={styles.page} aria-label={tr('سورة {name}', { name: sName })} aria-busy={loading}>
          <PageCorners />
          <div className={styles.pageIn}>
            <div className={styles.phead}><span>{tr('سورة {name}', { name: sName })}</span><span>{juzLabel}</span></div>
            <Cartouche name={meta[0]} count={meta[2]} type={meta[3]} />

            {loading && <Skeleton />}
            {error && !loading && <ErrorBox msg={error} onRetry={() => setReloadKey(k => k + 1)} />}

            {ready && (
              <>
                {basmalaLine}
                <p className={styles.mtext} lang="ar" dir="rtl" style={{ fontFamily: quranFont }} {...listHandlers}>
                  {built.items.map(item => (
                    <MushafAyah key={item.uid} item={item} lang={tr.lang}
                      sel={showSel(item.uid)}
                      playing={isPlayingK(item.kufi)}
                      buffering={bufferingK === item.kufi} />
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
        <section className={styles.list} aria-label={tr('آيات سورة {name}', { name: sName })} aria-busy={loading} {...(ready ? listHandlers : {})}>
          <header className={`nq-card ${styles.listHead}`}>
            <Cartouche name={meta[0]} count={meta[2]} type={meta[3]} />
            {ready && basmalaLine}
          </header>

          {loading && <div className={`nq-card ${styles.card}`}><Skeleton /></div>}
          {error && !loading && <ErrorBox msg={error} onRetry={() => setReloadKey(k => k + 1)} />}

          {ready && built.items.map(item => {
            const playing = isPlayingK(item.kufi);
            return (
              <AyahCard key={item.uid} item={item} lang={tr.lang}
                selected={showSel(item.uid)}
                playing={playing}
                nowState={playing ? nowState : null}
                buffering={bufferingK === item.kufi}
                bookmarked={bmSet.has(item.kufi)}
                trans={item.showTrans ? translations[item.kufi] || null : null}
                transDir={transDir} quranFont={quranFont} sName={sName} />
            );
          })}
        </section>
      )}

      {/* ── Between surahs ── */}
      {ready && (
        <nav className={styles.endNav} aria-label={tr('التنقل بين السور')}>
          {surah > 1 ? (
            <button type="button" className={`nq-card ${styles.endBtn}`} onClick={() => goToSurah(surah - 1)}>
              <Icon name="back" />
              <span><small>{tr('السورة السابقة')}</small><b>{surahName(surah - 1)}</b></span>
            </button>
          ) : <span />}
          {surah < 114 ? (
            <button type="button" className={`nq-card ${styles.endBtn} ${styles.endNext}`} onClick={() => goToSurah(surah + 1)}>
              <span><small>{tr('السورة التالية')}</small><b>{surahName(surah + 1)}</b></span>
              <Icon name="back" className={styles.flip} />
            </button>
          ) : <span />}
        </nav>
      )}

      {/* ── Ayah tools: the full bar, or a small «…» chip for the recited / last tapped ayah ── */}
      {ready && barOpen && selItem && (
        <AyahActions variant="bar"
          refLabel={tr('{name} · الآية {n}', { name: sName, n: toAr(selItem.label) })}
          bookmarked={bmSet.has(selItem.kufi)}
          playing={isPlayingK(selItem.kufi) && state.isPlaying}
          on={id => act(id, selItem)}
          onClose={closeBar} />
      )}
      {ready && !barOpen && chipItem && (
        <button type="button" className={barStyles.chip}
          onClick={() => openTools(chipItem)}
          aria-label={tr('أدوات {ref}', { ref: tr('الآية {n}', { n: num(chipItem.label) }) })}
          title={tr('المزيد: التفسير، المفضلة، النسخ…')}>
          <Icon name="dots" />
          <span>{tr('الآية {n}', { n: toAr(chipItem.label) })}</span>
        </button>
      )}
    </main>
  );
}

function Skeleton() {
  const tr = coreTr(useTr());
  return (
    <div className={styles.skel} role="status" aria-label={tr('جاري تحميل السورة')}>
      {[92, 100, 86, 97, 74, 100, 60].map((w, i) => <i key={i} style={{ width: w + '%' }} />)}
      <span className="nq-sr">{tr('جاري تحميل السورة…')}</span>
    </div>
  );
}

function ErrorBox({ msg, onRetry }) {
  const tr = coreTr(useTr());
  return (
    <div className={styles.errorBox} role="alert">
      <p>{tr(msg)}</p>
      <button type="button" className="nq-btn gold sm" onClick={onRetry}><Icon name="repeat" />{tr('إعادة المحاولة')}</button>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, setGlobal } from '../store';
import { useAuth } from '../hooks/useAuth';
import { SURAHS_META, toArabicNum } from '../data';
import { fetchSurahAyahs, fetchSurahTranslation } from '../api';
import { incrementUserScore, saveProgress } from '../supabase';
import TafsirPanel from './TafsirPanel';
import styles from './Reader.module.css';

// ── Basmala detection ──────────────────────────────────────────────────────
// Remove Arabic diacritics / Quranic marks / tatweel / BOM and unify alef forms
// so different editions (uthmani, imlaei) can be compared reliably.
function normalizeArabic(str) {
  return String(str || '')
    .replace(/[\uFEFF\u200B-\u200F]/g, '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673]/g, '\u0627');
}
const BASMALA_WORDS = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

// Strip the basmala from the start of ayah 1 ONLY if the text really starts with it
// (alquran.cloud includes it, quran.com does not).
function stripBasmala(text) {
  const tokens = String(text || '').trim().split(/\s+/);
  if (tokens.length <= BASMALA_WORDS.length) return text;
  const startsWithBasmala = BASMALA_WORDS.every((w, i) => normalizeArabic(tokens[i]) === w);
  if (!startsWithBasmala) return text;
  const stripped = tokens.slice(BASMALA_WORDS.length).join(' ').trim();
  return stripped || text;
}

export default function Reader() {
  const [state] = useStore();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ayahs, setAyahs]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [loadedSurah, setLoadedSurah]   = useState(null); // surah whose ayahs are currently rendered
  const [reloadKey, setReloadKey]       = useState(0);    // bump to force a re-fetch (retry)
  const [highlightedAyah, setHighlightedAyah] = useState(null);
  const [error, setError]               = useState(null);
  const [translations, setTranslations] = useState({});
  const readerRef  = useRef(null);
  const initDone   = useRef(false);

  // Deep links (/reader?surah=X&ayah=Y) + restore last-read position on first mount
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
    setHighlightedAyah(null);

    if (readerRef.current) readerRef.current.scrollTop = 0;

    fetchSurahAyahs(surah)
      .then(data => {
        if (cancelled) return;
        // Surah 1 (Fatiha): its first ayah IS the basmala → keep it.
        // Surah 9 (Tawbah): no basmala.
        // Others: basmala is shown separately above, so strip it from ayah 1 if present.
        const cleaned = data.map(a =>
          a.number === 1 && surah !== 1 && surah !== 9
            ? { ...a, text: stripBasmala(a.text) }
            : a
        );
        setAyahs(cleaned);
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

  // Scroll to a specific ayah when requested — only once the requested surah is rendered
  useEffect(() => {
    if (!state.scrollToAyah || loading || loadedSurah !== state.currentSurah) return;
    const target = state.scrollToAyah;
    setTimeout(() => {
      const el = document.getElementById(`ayah-${target}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    setGlobal({ scrollToAyah: null });
  }, [state.scrollToAyah, state.currentSurah, loadedSurah, loading]);

  // Reading progress bar
  const handleScroll = useCallback(() => {
    if (!readerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = readerRef.current;
    const pct = (scrollTop / (scrollHeight - clientHeight)) * 100;
    const bar = document.getElementById('progressBar');
    if (bar) bar.style.width = Math.min(100, pct) + '%';
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  function selectAyah(num) {
    if (state.highlightMode) setHighlightedAyah(num);
    setGlobal({ currentAyah: num });
    localStorage.setItem('nq_lastRead', JSON.stringify({ surah: state.currentSurah, ayah: num }));
    // حفظ تاريخ اليوم للـ streak المحلي (يشتغل حتى بدون Supabase)
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
      incrementUserScore(user.id); // نقاط + reading_sessions
      saveProgress(user.id, state.currentSurah, num); // حفظ آخر موضع
    }
  }

  function copyAyah(e, ayah) {
    e.stopPropagation();
    const meta = SURAHS_META[state.currentSurah - 1];
    navigator.clipboard.writeText(
      `${ayah.text}\n\n— سورة ${meta[0]}، الآية ${ayah.number}`
    ).then(() => setGlobal({ toast: '✅ تم نسخ الآية مع المرجع' }));
  }

  function toggleBookmark(e, ayahNum) {
    e.stopPropagation();
    const exists = state.bookmarks.find(
      b => b.surah === state.currentSurah && b.ayah === ayahNum
    );
    const next = exists
      ? state.bookmarks.filter(b => !(b.surah === state.currentSurah && b.ayah === ayahNum))
      : [...state.bookmarks, { surah: state.currentSurah, ayah: ayahNum }];
    setGlobal({ bookmarks: next, toast: exists ? '🗑️ تم الحذف من المفضلة' : '🔖 تم الحفظ في المفضلة' });
    localStorage.setItem('nq_bookmarks', JSON.stringify(next));
  }

  function playAyah(e, num) {
    e.stopPropagation();
    setGlobal({ audioAyah: num, showAudio: true, playTrigger: Date.now() });
  }

  function openTafsir(e, num) {
    e.stopPropagation();
    setGlobal({ showTafsir: true, tafsirAyah: num, tafsirSurah: state.currentSurah });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const meta       = SURAHS_META[state.currentSurah - 1];
  const hasBasmala = state.currentSurah !== 1 && state.currentSurah !== 9;
  const quranFont  = state.fontStyle === 'uthmani' ? 'var(--font-quran)' : 'var(--font-ui)';
  const transDir   = /^(ur|fa)\./.test(state.translation || '') ? 'rtl' : 'ltr';

  return (
    <main className={styles.reader} ref={readerRef} onScroll={handleScroll}>

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>جاري تحميل السورة...</p>
        </div>
      )}

      {error && !loading && (
        <div className={styles.errorBox}>
          <p>⚠️ {error}</p>
          <button onClick={() => setReloadKey(k => k + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Surah Header */}
          <div className={styles.surahHeader}>
            <div className={styles.badge}>{state.currentSurah}</div>
            <h1 className={styles.surahName}>{meta[0]}</h1>
            <div className={styles.surahMeta}>
              <span>📍 {meta[3]}</span>
              <span className={styles.dot}>•</span>
              <span>📖 {meta[2]} آية</span>
              <span className={styles.dot}>•</span>
              <span>{meta[1]}</span>
            </div>
          </div>

          <div className={styles.ornament}>❧ ✦ ❧</div>

          {hasBasmala && (
            <div className={styles.basmala}>
              بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </div>
          )}

          <div className={styles.ayahsWrap}>
            {ayahs.map((ayah, idx) => {
              const isHighlighted = highlightedAyah === ayah.number;
              const isBookmarked  = state.bookmarks.some(
                b => b.surah === state.currentSurah && b.ayah === ayah.number
              );
              return (
                <div
                  key={ayah.number}
                  id={`ayah-${ayah.number}`}
                  className={`${styles.ayah} ${isHighlighted ? styles.highlighted : ''}`}
                  onClick={() => selectAyah(ayah.number)}
                  style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
                >
                  <div className={styles.ayahNum}>{ayah.number}</div>
                  <div className={styles.ayahContent}>
                    <p className={styles.ayahText} style={{ fontFamily: quranFont }}>
                      {ayah.text}
                      <span className={styles.ayahMark}> ۝{toArabicNum(ayah.number)}</span>
                    </p>
                    {translations[ayah.number] && (
                      <p className={styles.translationText} dir={transDir}>
                        {translations[ayah.number]}
                      </p>
                    )}
                    <div className={styles.actions}>
                      <button className={styles.actBtn} onClick={e => copyAyah(e, ayah)}>📋 نسخ</button>
                      <button className={styles.actBtn} onClick={e => toggleBookmark(e, ayah.number)}>
                        {isBookmarked ? '🔖 محفوظ' : '🔖 حفظ'}
                      </button>
                      <button className={styles.actBtn} onClick={e => playAyah(e, ayah.number)}>🎧 استماع</button>
                      <button className={`${styles.actBtn} ${styles.tafsirBtn}`} onClick={e => openTafsir(e, ayah.number)}>
                        📖 تفسير
                      </button>
                      <button className={`${styles.actBtn} ${styles.aiBtn}`} onClick={e => {
                        e.stopPropagation();
                        setGlobal({ currentAyah: ayah.number });
                        // trigger AI assistant open via custom event
                        window.dispatchEvent(new CustomEvent('openAI', { detail: { ayah: ayah.number } }));
                      }}>
                        ✦ AI
                      </button>
                      <button className={`${styles.actBtn} ${styles.noteBtn}`} onClick={e => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent('openNote', {
                          detail: { surah: state.currentSurah, ayah: ayah.number }
                        }));
                      }}>
                        ✏️ ملاحظة
                      </button>
                      <button className={`${styles.actBtn} ${styles.shareBtn}`} onClick={e => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent('shareAyah', {
                          detail: { surah: state.currentSurah, ayah: ayah.number, text: ayah.text }
                        }));
                      }}>
                        🔗 مشاركة
                      </button>
                      <span className={styles.ayahRef}>{ayah.key}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {state.showTafsir && <TafsirPanel />}
    </main>
  );
}

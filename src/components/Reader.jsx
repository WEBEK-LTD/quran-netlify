import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore, setGlobal } from '../store';
import { useAuth } from '../hooks/useAuth';
import { SURAHS_META, toArabicNum } from '../data';
import { fetchSurahAyahs, fetchSurahTranslation } from '../api';
import { incrementUserScore, saveProgress } from '../supabase';
import TafsirPanel from './TafsirPanel';
import styles from './Reader.module.css';

export default function Reader() {
  const [state] = useStore();
  const [ayahs, setAyahs]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [highlightedAyah, setHighlightedAyah] = useState(null);
  const [error, setError]               = useState(null);
  const [translations, setTranslations] = useState({});
  const readerRef  = useRef(null);
  const loadingRef = useRef(false);
  const loadedFor  = useRef(null);


  // Load translation when surah or translation setting changes
  useEffect(() => {
    if (!state.translation || state.translation === 'none') {
      setTranslations({});
      return;
    }
    fetchSurahTranslation(state.currentSurah, state.translation)
      .then(data => {
        const map = {};
        data.forEach(a => { map[a.number] = a.text; });
        setTranslations(map);
      })
      .catch(() => {});
  }, [state.currentSurah, state.translation]);

  // Load surah whenever currentSurah changes
  useEffect(() => {
    const surah = state.currentSurah;
    if (loadedFor.current === surah) return;   // already loaded
    if (loadingRef.current) return;            // already in flight

    loadingRef.current = true;
    loadedFor.current  = surah;
    setLoading(true);
    setAyahs([]);
    setError(null);
    setHighlightedAyah(null);

    if (readerRef.current) readerRef.current.scrollTop = 0;
    setTranslations({});

    fetchSurahAyahs(surah)
      .then(data => {
        // Strip bismillah from ayah 1 text — it's shown separately above the ayahs
        // Surah 1 (Fatiha) and 9 (Tawbah) don't have the separate basmala div,
        // but Fatiha's first ayah IS the bismillah so we keep it as-is.
        // For all other surahs, strip the bismillah prefix from ayah 1.
        const cleaned = data.map(a => {
          if (a.number === 1 && surah !== 1 && surah !== 9) {
            // Strip bismillah using unicode-safe approach:
            // Remove all Arabic letters+diacritics from the start until we pass 4 "words"
            // (بسم + الله + الرحمن + الرحيم), then keep the rest.
            // We do this by stripping the first 4 whitespace-separated tokens.
            const tokens = a.text.split(/\s+/);
            // Bismillah is always exactly 4 tokens: بِسْمِ  اللَّهِ  الرَّحْمَٰنِ  الرَّحِيمِ
            const stripped = tokens.slice(4).join(' ').trim();
            // Safety: if result is empty (edge case), keep original
            return { ...a, text: stripped || a.text };
          }
          return a;
        });
        setAyahs(cleaned);
        setLoading(false);
        loadingRef.current = false;
      })
      .catch(err => {
        console.error('Failed to load surah', err);
        setError('تعذّر تحميل السورة — تحقق من اتصالك بالإنترنت');
        setLoading(false);
        loadingRef.current = false;
        loadedFor.current  = null; // allow retry
      });
  }, [state.currentSurah]);

  // Scroll to a specific ayah when requested
  useEffect(() => {
    if (!state.scrollToAyah || !ayahs.length) return;
    const el = document.getElementById(`ayah-${state.scrollToAyah}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    }
    setGlobal({ scrollToAyah: null });
  }, [state.scrollToAyah, ayahs]);

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
          <button onClick={() => { loadedFor.current = null; setGlobal({ currentSurah: state.currentSurah }); }}>
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
                      <p className={styles.translationText}>
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

import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setGlobal } from '../store';
import { SURAHS_META } from '../data';
import styles from './SearchPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
import { normalizeArabic, highlightSegments } from '../arabic';

// ─── Local index: fetch & cache all surahs ───────────────────────────────────
// v2: يُحفظ فقط عند اكتمال الفهرس (٦٢٣٦ آية)
const INDEX_KEY = 'nq_search_index_v2';
const OLD_INDEX_KEYS = ['nq_search_index_v1'];
const TOTAL_AYAHS = 6236;
let _indexCache = null;

// نضيف النص المطبَّع (بدون تشكيل) في الذاكرة فقط
function prepareIndex(raw) {
  return raw.map(item => ({ ...item, n: normalizeArabic(item.t) }));
}

function readCachedIndex() {
  try {
    OLD_INDEX_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    const cached = localStorage.getItem(INDEX_KEY);
    if (!cached) return null;
    const raw = JSON.parse(cached);
    if (!Array.isArray(raw) || raw.length !== TOTAL_AYAHS) {
      localStorage.removeItem(INDEX_KEY);
      return null;
    }
    return prepareIndex(raw);
  } catch {
    return null;
  }
}

async function buildIndex(onProgress) {
  // Check localStorage first
  const cached = readCachedIndex();
  if (cached) { _indexCache = cached; return cached; }

  // Fetch all 114 surahs
  const index = [];
  for (let s = 1; s <= 114; s++) {
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${s}/quran-simple`);
      const data = await res.json();
      if (data.code === 200) {
        for (const a of data.data.ayahs) {
          index.push({ s, a: a.numberInSurah, t: a.text });
        }
      }
    } catch {}
    onProgress?.(Math.round((s / 114) * 100));
  }

  // Save to localStorage only when complete — a partial index would be cached forever
  if (index.length === TOTAL_AYAHS) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch {}
  }
  const prepared = prepareIndex(index);
  // فهرس ناقص يُستخدم لهذه الجلسة فقط، ويُعاد بناؤه في المرة القادمة
  _indexCache = index.length === TOTAL_AYAHS ? prepared : null;
  return prepared;
}

function searchIndex(index, query) {
  const q = normalizeArabic(query).trim();
  if (!q || q.length < 2) return [];
  const results = [];
  for (const item of index) {
    if (item.n.includes(q)) {
      results.push(item);
      if (results.length >= 100) break;
    }
  }
  return results;
}

function highlightText(text, query) {
  if (!query.trim()) return text;
  const segs = highlightSegments(text, query);
  if (segs.length === 1 && !segs[0].match) return text;
  return segs.map((seg, i) =>
    seg.match
      ? <mark key={i} className={styles.highlight}>{seg.text}</mark>
      : <span key={i}>{seg.text}</span>
  );
}

// "2:255" أو "٢:٢٥٥" → انتقال مباشر
function parseAyahRef(query) {
  const latin = String(query || '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
  const m = latin.match(/^\s*(\d{1,3})\s*[:：.\/-]\s*(\d{1,3})\s*$/);
  if (!m) return null;
  const s = +m[1], a = +m[2];
  const meta = SURAHS_META[s - 1];
  if (!meta || a < 1 || a > meta[2]) return null;
  return { s, a };
}

// Instant local surah name search
function searchSurahs(query) {
  const q = normalizeArabic(query).trim();
  if (!q) return [];
  return SURAHS_META
    .map((m, i) => ({ num: i + 1, meta: m }))
    .filter(({ meta }) =>
      normalizeArabic(meta[0]).includes(q) || meta[1]?.toLowerCase().includes(query.trim().toLowerCase())
    ).slice(0, 4);
}

export default function SearchPage() {
  const t = useT();
  const dir = useDir();
  const navigate = useNavigate();
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState([]);
  const [surahHits,  setSurahHits]  = useState([]);
  const [indexState, setIndexState] = useState('idle'); // idle | building | ready
  const [progress,   setProgress]   = useState(0);
  const [searched,   setSearched]   = useState('');
  const [refHit,     setRefHit]     = useState(null); // { s, a } عند كتابة "2:255"
  const inputRef = useRef(null);

  // Pre-load index on mount if already cached
  useEffect(() => {
    if (_indexCache) { setIndexState('ready'); return; }
    const cached = readCachedIndex();
    if (cached) { _indexCache = cached; setIndexState('ready'); }
  }, []);

  function handleInput(val) {
    setQuery(val);
    setSurahHits(searchSurahs(val));
    setRefHit(parseAyahRef(val));
    if (val.trim().length < 2) { setResults([]); setSearched(''); return; }
    // Instant search if index ready
    if (_indexCache) {
      setResults(searchIndex(_indexCache, val.trim()));
      setSearched(val.trim());
    }
  }

  async function handleSearch(customQ) {
    const q = (customQ ?? query).trim();
    const ref = parseAyahRef(q);
    if (ref) { goToAyah(ref.s, ref.a); return; }
    if (!q || q.length < 2) return;
    if (customQ) { setQuery(customQ); setSurahHits(searchSurahs(customQ)); setRefHit(null); }

    // If index ready, search immediately
    if (_indexCache) {
      setResults(searchIndex(_indexCache, q));
      setSearched(q);
      return;
    }

    // Build index
    setIndexState('building');
    setProgress(0);
    const index = await buildIndex(p => setProgress(p));
    setIndexState(_indexCache ? 'ready' : 'idle');
    setResults(searchIndex(index, q));
    setSearched(q);
  }

  function goToAyah(s, a) {
    setGlobal({ currentSurah: s, currentAyah: a, scrollToAyah: a });
    navigate('/reader');
  }

  // Group by surah
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.s]) acc[r.s] = [];
    acc[r.s].push(r);
    return acc;
  }, {});

  const QUICK = ['الرحمن', 'الصبر', 'الجنة', 'الصلاة', 'التقوى', 'الرحمة', 'النور', 'البر'];

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>🔍 {t('searchTitle')}</h1>
        <LangSwitcher compact={true} />
      </div>

      {/* Search form */}
      <div className={styles.searchForm}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input ref={inputRef} type="text" value={query} dir="rtl" autoFocus
            placeholder="ابحث في آيات القرآن الكريم..."
            onChange={e => handleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {query && (
            <button type="button" className={styles.clearBtn}
              onClick={() => { setQuery(''); setResults([]); setSurahHits([]); setSearched(''); setRefHit(null); inputRef.current?.focus(); }}>
              ✕
            </button>
          )}
        </div>
        <button className={styles.searchBtn}
          onClick={() => handleSearch()}
          disabled={indexState === 'building' || !query.trim()}>
          {indexState === 'building' ? `${progress}%` : 'بحث'}
        </button>
      </div>

      {/* Building index progress */}
      {indexState === 'building' && (
        <div className={styles.buildingBox}>
          <div className={styles.buildingBar}>
            <div className={styles.buildingFill} style={{ width: `${progress}%` }} />
          </div>
          <p>جارٍ تحضير فهرس البحث... {progress}%</p>
          <small>{t('loading')}</small>
        </div>
      )}

      {/* Direct jump: "2:255" */}
      {refHit && (
        <div className={styles.surahHits}>
          <div className={styles.surahHitList}>
            <button className={styles.surahHitBtn} onClick={() => goToAyah(refHit.s, refHit.a)}>
              <span className={styles.surahHitNum}>{refHit.s}</span>
              <span className={styles.surahHitName}>{SURAHS_META[refHit.s - 1][0]}</span>
              <span className={styles.surahHitSub}>انتقل إلى الآية {refHit.a}</span>
            </button>
          </div>
        </div>
      )}

      {/* Instant surah hits */}
      {surahHits.length > 0 && (
        <div className={styles.surahHits}>
          <p className={styles.quickLabel}>{t('surah')}</p>
          <div className={styles.surahHitList}>
            {surahHits.map(({ num, meta }) => (
              <button key={num} className={styles.surahHitBtn} onClick={() => goToAyah(num, 1)}>
                <span className={styles.surahHitNum}>{num}</span>
                <span className={styles.surahHitName}>{meta[0]}</span>
                <span className={styles.surahHitSub}>{meta[3]} • {meta[2]} آية</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick searches */}
      {!query && (
        <div className={styles.quickSection}>
          <p className={styles.quickLabel}>{t('search')}</p>
          <div className={styles.quickBtns}>
            {QUICK.map(q => (
              <button key={q} className={styles.quickBtn} onClick={() => handleSearch(q)}>
                {q}
              </button>
            ))}
          </div>
          {indexState !== 'ready' && (
            <button className={styles.buildIndexBtn} onClick={() => handleSearch('الله')}>
              📦 تحضير فهرس البحث
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      {searched && indexState !== 'building' && (
        <div className={styles.resultsHeader}>
          {results.length > 0
            ? <><strong>{results.length}</strong> نتيجة لـ "{searched}" {results.length === 100 ? '(أول 100)' : ''}</>
            : `لا توجد نتائج لـ "${searched}"`}
        </div>
      )}

      {/* Results grouped by surah */}
      {Object.entries(grouped).map(([sNum, ayahs]) => {
        const meta = SURAHS_META[+sNum - 1];
        return (
          <div key={sNum} className={styles.surahGroup}>
            <div className={styles.surahGroupHeader}>
              <span className={styles.surahBadge}>{sNum}</span>
              <span className={styles.surahGroupName}>{meta?.[0]}</span>
              <span className={styles.surahGroupMeta}>{meta?.[3]} • {ayahs.length} نتيجة</span>
            </div>
            <div className={styles.ayahsList}>
              {ayahs.map((r, i) => (
                <div key={i} className={styles.ayahResult} onClick={() => goToAyah(r.s, r.a)}>
                  <div className={styles.ayahNum}>{r.a}</div>
                  <p className={styles.arabicText} dir="rtl">
                    {highlightText(r.t, searched)}
                  </p>
                  <button className={styles.goBtn}
                    onClick={e => { e.stopPropagation(); goToAyah(r.s, r.a); }}>←</button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Search the Quran ────────────────────────────────────────────────────────
// A local index of all 6236 ayahs (quran-simple, cached once in localStorage),
// searched without diacritics (normalizeArabic) and highlighted on the text.
import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setGlobal } from '../store';
import { SURAHS_META } from '../data';
import { normalizeArabic, highlightSegments } from '../arabic';
import { PageHero, Icon, Badge8, Divider, toAr } from '../components/ornaments/Ornaments';
import styles from './SearchPage.module.css';

// ─── Local index: fetch & cache all surahs ───────────────────────────────────
// v2: يُحفظ فقط عند اكتمال الفهرس (٦٢٣٦ آية)
const INDEX_KEY = 'nq_search_index_v2';
const OLD_INDEX_KEYS = ['nq_search_index_v1'];
const TOTAL_AYAHS = 6236;
const PAGE_SIZE = 100;
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

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// opts: { kind: 'all'|'مكية'|'مدنية', surah: 0|n, whole: bool }, limit: max results
// returns { items, more } — more=true when there are further matches past the limit
function searchIndex(index, query, opts = {}, limit = PAGE_SIZE) {
  const q = normalizeArabic(query).trim();
  if (!q || q.length < 2) return { items: [], more: false };
  const { kind = 'all', surah = 0, whole = false } = opts;
  const re = whole ? new RegExp(`(^|\\s)${escapeRe(q)}(?=\\s|$)`) : null;
  const items = [];
  for (const item of index) {
    if (surah && item.s !== surah) continue;
    if (kind !== 'all' && SURAHS_META[item.s - 1]?.[3] !== kind) continue;
    if (re ? re.test(item.n) : item.n.includes(q)) {
      if (items.length >= limit) return { items, more: true };
      items.push(item);
    }
  }
  return { items, more: false };
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

const QUICK = ['الرحمن', 'الصبر', 'الجنة', 'الصلاة', 'التقوى', 'الرحمة', 'النور', 'البر'];

export default function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState([]);
  const [hasMore,    setHasMore]    = useState(false);
  const [limit,      setLimit]      = useState(PAGE_SIZE);
  const [surahHits,  setSurahHits]  = useState([]);
  const [indexState, setIndexState] = useState('idle'); // idle | building | ready
  const [progress,   setProgress]   = useState(0);
  const [searched,   setSearched]   = useState('');
  const [refHit,     setRefHit]     = useState(null); // { s, a } عند كتابة "2:255"
  const [kind,       setKind]       = useState('all');
  const [inSurah,    setInSurah]    = useState(0);
  const [whole,      setWhole]      = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef(null);
  const opts = useMemo(() => ({ kind, surah: inSurah, whole }), [kind, inSurah, whole]);

  function runSearch(q, o = opts, lim = PAGE_SIZE) {
    const r = searchIndex(_indexCache, q, o, lim);
    setResults(r.items); setHasMore(r.more); setLimit(lim); setSearched(q);
  }

  // Pre-load index on mount if already cached; ?q= runs a search
  useEffect(() => {
    if (!_indexCache) {
      const cached = readCachedIndex();
      if (cached) _indexCache = cached;
    }
    if (_indexCache) setIndexState('ready');
    const q0 = (params.get('q') || '').trim();
    if (q0) handleSearch(q0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters re-run the current search
  useEffect(() => {
    if (searched && _indexCache) runSearch(searched, opts, PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  function handleInput(val) {
    setQuery(val);
    setSurahHits(searchSurahs(val));
    setRefHit(parseAyahRef(val));
    if (val.trim().length < 2) { setResults([]); setHasMore(false); setSearched(''); return; }
    // Instant search if index ready
    if (_indexCache) runSearch(val.trim());
  }

  async function handleSearch(customQ) {
    const q = (customQ ?? query).trim();
    const ref = parseAyahRef(q);
    if (ref) { goToAyah(ref.s, ref.a); return; }
    if (!q || q.length < 2) return;
    if (customQ) { setQuery(customQ); setSurahHits(searchSurahs(customQ)); setRefHit(null); }
    try { setParams({ q }, { replace: true }); } catch {}

    // If index ready, search immediately
    if (_indexCache) { runSearch(q); return; }

    // Build index
    setIndexState('building');
    setProgress(0);
    const index = await buildIndex(p => setProgress(p));
    setIndexState(_indexCache ? 'ready' : 'idle');
    const r = searchIndex(index, q, opts, PAGE_SIZE);
    setResults(r.items); setHasMore(r.more); setLimit(PAGE_SIZE); setSearched(q);
  }

  function clearAll() {
    setQuery(''); setResults([]); setHasMore(false); setSurahHits([]); setSearched(''); setRefHit(null);
    try { setParams({}, { replace: true }); } catch {}
    inputRef.current?.focus();
  }

  function goToAyah(s, a) {
    setGlobal({ currentSurah: s, currentAyah: a, scrollToAyah: a });
    navigate('/reader');
  }

  // Group by surah
  const grouped = useMemo(() => results.reduce((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.s === r.s) last.items.push(r); else acc.push({ s: r.s, items: [r] });
    return acc;
  }, []), [results]);

  const filtersOn = kind !== 'all' || inSurah || whole;
  const building = indexState === 'building';

  return (
    <div className={styles.page}>
      <PageHero eyebrow="البحث في القرآن الكريم" title="ابحث في الآيات"
        sub="ابحث بلا تشكيل، أو باسم السورة، أو برقم الآية مثل ٢:٢٥٥." />

      <div className={`nq-wrap ${styles.body}`}>
        {/* ── the search field ── */}
        <form className={`nq-card ${styles.searchCard}`} role="search" onSubmit={e => { e.preventDefault(); handleSearch(); }}>
          <div className={styles.searchRow}>
            <label className={styles.searchBox}>
              <Icon name="search" className={styles.searchIcon} />
              <span className="nq-sr">ابحث في آيات القرآن الكريم</span>
              <input ref={inputRef} type="search" value={query} dir="rtl" autoFocus enterKeyHint="search"
                placeholder="ابحث في آيات القرآن الكريم…"
                onChange={e => handleInput(e.target.value)} />
              {query && (
                <button type="button" className={styles.clearBtn} onClick={clearAll} aria-label="مسح البحث"><Icon name="x" /></button>
              )}
            </label>
            <button type="submit" className={`nq-btn gold ${styles.searchBtn}`} disabled={building || !query.trim()}>
              {building ? <span className="nq-num">{toAr(progress)}٪</span> : <><Icon name="search" />ابحث</>}
            </button>
          </div>
          <div className={styles.hintRow}>
            <span className={styles.hint}><Icon name="check" />بلا تشكيل: «الصبر» تجد «ٱلصَّبْرِ»</span>
            <span className={styles.hint}><Icon name="check" />الهمزات والتاء المربوطة سواء</span>
            <button type="button" className={`${styles.filterToggle} ${filtersOn ? styles.filterOn : ''}`}
              aria-expanded={showFilters} aria-controls="search-filters" onClick={() => setShowFilters(v => !v)}>
              <Icon name="list" />تصفية{filtersOn ? ' (مفعّلة)' : ''}<Icon name="chev" className={showFilters ? styles.chevUp : ''} />
            </button>
          </div>
          {showFilters && (
            <div id="search-filters" className={styles.filters}>
              <div className={styles.fGroup}>
                <span className={styles.fLabel}>نوع السورة</span>
                <div className="nq-seg" role="group" aria-label="نوع السورة">
                  {[['all', 'الكل'], ['مكية', 'مكية'], ['مدنية', 'مدنية']].map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>
                  ))}
                </div>
              </div>
              <label className={styles.fGroup}>
                <span className={styles.fLabel}>في سورة</span>
                <select className={styles.select} value={inSurah} onChange={e => setInSurah(+e.target.value)}>
                  <option value={0}>كل السور</option>
                  {SURAHS_META.map((m, i) => <option key={i} value={i + 1}>{toAr(i + 1)}. {m[0]}</option>)}
                </select>
              </label>
              <div className={styles.fGroup}>
                <span className={styles.fLabel}>المطابقة</span>
                <div className="nq-seg" role="group" aria-label="طريقة المطابقة">
                  <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)}>جزء من كلمة</button>
                  <button type="button" aria-pressed={whole} onClick={() => setWhole(true)}>كلمة كاملة</button>
                </div>
              </div>
              {filtersOn && (
                <button type="button" className="nq-btn ghost sm" onClick={() => { setKind('all'); setInSurah(0); setWhole(false); }}>
                  <Icon name="x" />إزالة التصفية
                </button>
              )}
            </div>
          )}
        </form>

        {/* ── building index ── */}
        {building && (
          <div className={`nq-card ${styles.building}`} role="status" aria-live="polite">
            <Badge8 icon="download" />
            <div className={styles.buildText}>
              <b>نحضّر فهرس البحث على جهازك…</b>
              <small>مرة واحدة فقط، ثم يصبح البحث فورياً ويعمل دون اتصال.</small>
              <div className={styles.bar} aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
            </div>
            <span className={`nq-num ${styles.pct}`}>{toAr(progress)}٪</span>
          </div>
        )}

        {/* ── direct jump + surah names ── */}
        {(refHit || surahHits.length > 0) && (
          <section className={styles.hitsSec} aria-label="انتقال سريع">
            <div className={styles.hits}>
              {refHit && (
                <button type="button" className={`nq-card ${styles.hit} ${styles.hitRef}`} onClick={() => goToAyah(refHit.s, refHit.a)}>
                  <Badge8 icon="book" size={46} />
                  <span>
                    <span className={styles.hitName}>سورة {SURAHS_META[refHit.s - 1][0]}</span>
                    <span className={styles.hitSub}>انتقل إلى الآية {toAr(refHit.a)}</span>
                  </span>
                  <Icon name="back" className={styles.hitGo} />
                </button>
              )}
              {surahHits.map(({ num, meta }) => (
                <button key={num} type="button" className={`nq-card ${styles.hit}`} onClick={() => goToAyah(num, 1)}>
                  <Badge8 size={46}>{toAr(num)}</Badge8>
                  <span>
                    <span className={styles.hitName}>سورة {meta[0]}</span>
                    <span className={styles.hitSub}>{meta[3]} · {toAr(meta[2])} آية</span>
                  </span>
                  <Icon name="back" className={styles.hitGo} />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── start state ── */}
        {!query && !searched && (
          <section className={styles.start} aria-labelledby="quick-h">
            <Divider />
            <h2 id="quick-h" className={styles.h2}>ابدأ بكلمة</h2>
            <div className={styles.quick}>
              {QUICK.map(q => (
                <button key={q} type="button" className={styles.quickBtn} onClick={() => handleSearch(q)}>{q}</button>
              ))}
            </div>
            {indexState !== 'ready' && !building && (
              <div className={`nq-card ${styles.prep}`}>
                <Badge8 icon="download" />
                <div>
                  <b>البحث يعمل على جهازك</b>
                  <small>عند أول بحث نحمّل نص المصحف كاملاً مرة واحدة، ثم تظهر النتائج فوراً أثناء الكتابة، حتى دون اتصال.</small>
                </div>
                <button type="button" className="nq-btn ghost sm" onClick={() => handleSearch('الله')}>
                  <Icon name="download" />حضّر الفهرس الآن
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── results ── */}
        {searched && !building && (
          <div className={styles.resHead} aria-live="polite">
            {results.length > 0 ? (
              <>
                <span className={styles.resCount}>
                  {hasMore && 'أكثر من '}<b className="nq-num">{toAr(results.length)}</b> نتيجة لـ «{searched}»
                  <span className={styles.resIn}> في {toAr(grouped.length)} سورة</span>
                </span>
                {filtersOn && <span className="nq-pill on">مع التصفية</span>}
              </>
            ) : null}
          </div>
        )}

        {searched && !building && results.length === 0 && (
          <div className={`nq-card ${styles.noRes}`}>
            <Badge8 icon="search" size={64} />
            <h2 className={styles.h2}>لا توجد نتائج لـ «{searched}»</h2>
            <p>جرّب كلمة أقصر أو جذراً منها، وتأكد من الإملاء.{filtersOn ? ' التصفية مفعّلة وقد تُخفي نتائج.' : ''}</p>
            {filtersOn && <button type="button" className="nq-btn ghost sm" onClick={() => { setKind('all'); setInSurah(0); setWhole(false); }}>إزالة التصفية</button>}
          </div>
        )}

        {grouped.length > 0 && !building && (
          <div className={styles.groups}>
            {grouped.map(({ s, items }) => {
              const meta = SURAHS_META[s - 1];
              return (
                <section key={s} className={`nq-card ${styles.group}`} aria-label={`سورة ${meta?.[0]}`}>
                  <header className={styles.groupHead}>
                    <Badge8 size={44}>{toAr(s)}</Badge8>
                    <h3 className={styles.groupName}>سورة {meta?.[0]}</h3>
                    <span className={styles.groupMeta}>{meta?.[3]} · {toAr(items.length)} نتيجة</span>
                  </header>
                  <ul className={styles.ayahs}>
                    {items.map(r => (
                      <li key={`${r.s}:${r.a}`}>
                        <button type="button" className={styles.ayahRow} onClick={() => goToAyah(r.s, r.a)}
                          aria-label={`الآية ${toAr(r.a)} من سورة ${meta?.[0]}: افتحها في المصحف`}>
                          <span className={styles.ayahNum}><svg aria-hidden="true"><use href="#nq-rosette" /></svg><b className="nq-num">{toAr(r.a)}</b></span>
                          <span className={styles.arabicText} lang="ar">{highlightText(r.t, searched)}</span>
                          <Icon name="back" className={styles.go} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {hasMore && (
              <div className={styles.more}>
                <button type="button" className="nq-btn ghost" onClick={() => runSearch(searched, opts, limit + PAGE_SIZE)}>
                  عرض نتائج أخرى
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

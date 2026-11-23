// ─── Favourites ──────────────────────────────────────────────────────────────
// Bookmarked ayahs (nq_bookmarks), merged with the account when signed in.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { loadBookmarks, syncBookmarks, removeBookmark as apiRemoveBookmark, errorMessage } from '../backend';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import { normalizeArabic } from '../arabic';
import { PageHero, Icon, Badge8, Corners, Divider, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { useAyahText, cachedAyahText } from './FavoritesPage/ayahText';
import styles from './FavoritesPage.module.css';

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem('nq_bookmarks') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem('nq_bookmarks', JSON.stringify(list)); } catch {}
}
const bkKey = b => `${b.surah}:${b.ayah}`;

// دمج المحلي مع المحفوظ على الحساب (بدون تكرار) — حتى لا تختفي المحفوظات المحلية
function mergeBookmarks(server, local) {
  const map = new Map();
  for (const b of [...(server || []), ...(local || [])]) {
    if (!b || !b.surah || !b.ayah) continue;
    const k = bkKey(b);
    if (!map.has(k)) map.set(k, b);
  }
  return [...map.values()];
}

const PAGE = 24;
const toLatinDigits = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncError, setSyncError] = useState('');
  const [q, setQ]                 = useState('');
  const [order, setOrder]         = useState('mushaf'); // mushaf | recent
  const [kind, setKind]           = useState('all');    // all | مكية | مدنية
  const [shown, setShown]         = useState(PAGE);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const local = readLocal();
    if (user) {
      loadBookmarks(user.id)
        .then(server => {
          if (cancelled) return;
          const merged = mergeBookmarks(server, local);
          setBookmarks(merged);
          writeLocal(merged);
          setGlobal({ bookmarks: merged });
          // ارفع المحفوظات المحلية التي لم تصل للحساب بعد.
          // (loadBookmarks يرمي خطأ عند الفشل — فلا نصل هنا إلا إن قرأنا قائمة الحساب فعلاً)
          if (merged.length !== (server || []).length) {
            syncBookmarks(user.id, merged).catch(() => {});
          }
          setLoading(false);
        })
        .catch(() => { if (!cancelled) { setBookmarks(local); setLoading(false); } });
    } else {
      setBookmarks(local);
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [user, authLoading]);

  function goToAyah(surah, ayah) {
    setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
    navigate('/reader');
  }

  async function removeBookmark(surah, ayah) {
    const drop = b => !(b.surah === surah && b.ayah === ayah);
    const next = bookmarks.filter(drop);
    setBookmarks(next);
    // المحلي قد يحتوي عناصر أُضيفت من القارئ بعد فتح الصفحة — نحذف منه العنصر فقط
    const localNext = mergeBookmarks(next, readLocal().filter(drop));
    writeLocal(localNext);
    setGlobal({ bookmarks: localNext, toast: 'أُزيلت الآية من المفضلة' });
    setSyncError('');
    if (user) {
      try {
        await apiRemoveBookmark(surah, ayah);
      } catch (e) {
        setSyncError(errorMessage(e, 'تعذّرت مزامنة الحذف مع حسابك') + ' — حُذفت من هذا الجهاز فقط');
      }
    }
  }

  const list = useMemo(() => {
    const nq = normalizeArabic(q.trim());
    const num = toLatinDigits(q.trim());
    let out = bookmarks.map((b, i) => ({ ...b, i }));
    if (kind !== 'all') out = out.filter(b => SURAHS_META[b.surah - 1]?.[3] === kind);
    if (nq) {
      out = out.filter(b => {
        const m = SURAHS_META[b.surah - 1];
        return normalizeArabic(m?.[0]).includes(nq)
          || (m?.[1] || '').toLowerCase().includes(q.trim().toLowerCase())
          || `${b.surah}:${b.ayah}` === num.replace(/\s/g, '') || String(b.surah) === num
          || normalizeArabic(cachedAyahText(b.surah, b.ayah)).includes(nq);
      });
    }
    out.sort(order === 'recent' ? (a, b) => b.i - a.i : (a, b) => a.surah - b.surah || a.ayah - b.ayah);
    return out;
  }, [bookmarks, q, order, kind]);

  const surahCount = useMemo(() => new Set(bookmarks.map(b => b.surah)).size, [bookmarks]);
  const visible = list.slice(0, shown);

  return (
    <div className={styles.page}>
      <PageHero eyebrow="آياتٌ تعود إليها" title="المفضلة" sub="الآيات التي حفظتها أثناء القراءة، تعود إليها متى شئت وتنتقل منها إلى موضعها في المصحف.">
        {!loading && bookmarks.length > 0 && (
          <>
            <span className="nq-pill on nq-num"><Icon name="bookmark" />{toAr(bookmarks.length)} آية</span>
            <span className="nq-pill nq-num"><Icon name="book" />من {toAr(surahCount)} سورة</span>
          </>
        )}
      </PageHero>

      <div className={`nq-wrap ${styles.body}`}>
        {!authLoading && !user && (
          <div className={styles.notice} role="note">
            <Icon name="lock" />
            <span>المفضلة محفوظة على هذا الجهاز فقط. سجّل الدخول لتصلك على كل أجهزتك.</span>
            <Link to="/login" className="nq-btn ghost sm">تسجيل الدخول</Link>
          </div>
        )}
        {syncError && (
          <p className={styles.alert} role="alert"><Icon name="x" />{syncError}</p>
        )}

        {loading ? (
          <div className={styles.grid} aria-busy="true" aria-label="جارٍ تحميل المفضلة">
            {[0, 1, 2, 3].map(i => <div key={i} className={`nq-card ${styles.skel}`}><span /><span /><span /></div>)}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className={`nq-card ${styles.empty}`}>
            <Corners />
            <Badge8 icon="bookmark" size={84} />
            <h2 className={styles.emptyTitle}>لم تحفظ آية بعد</h2>
            <p className={styles.emptyText}>أثناء القراءة، اضغط على الآية ثم اختر «حفظ في المفضلة»، وستجدها هنا مع موضعها في المصحف.</p>
            <Divider />
            <div className={styles.emptyActs}>
              <Link to="/reader" className="nq-btn gold"><Icon name="book" />ابدأ القراءة</Link>
              <Link to="/daily-ayah" className="nq-btn ghost"><Icon name="calendar" />آية اليوم</Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.tools}>
              <label className={`nq-input ${styles.search}`}>
                <Icon name="search" />
                <input type="search" value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }}
                  placeholder="ابحث باسم السورة أو كلمة من الآية أو ٢:٢٥٥" aria-label="ابحث في المفضلة" />
                {q && <button type="button" className={styles.clear} onClick={() => setQ('')} aria-label="مسح البحث"><Icon name="x" /></button>}
              </label>
              <div className="nq-seg" role="group" aria-label="نوع السورة">
                {[['all', 'الكل'], ['مكية', 'مكية'], ['مدنية', 'مدنية']].map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={kind === v} onClick={() => { setKind(v); setShown(PAGE); }}>{l}</button>
                ))}
              </div>
              <div className="nq-seg" role="group" aria-label="الترتيب">
                <button type="button" aria-pressed={order === 'mushaf'} onClick={() => setOrder('mushaf')}>ترتيب المصحف</button>
                <button type="button" aria-pressed={order === 'recent'} onClick={() => setOrder('recent')}>الأحدث</button>
              </div>
            </div>

            <p className={styles.count} aria-live="polite">
              {list.length === bookmarks.length
                ? <><b className="nq-num">{toAr(list.length)}</b> آية محفوظة</>
                : <><b className="nq-num">{toAr(list.length)}</b> من {toAr(bookmarks.length)} آية</>}
            </p>

            {list.length === 0 ? (
              <div className={`nq-card ${styles.noRes}`}>
                <Badge8 icon="search" />
                <p>لا توجد آية تطابق بحثك. جرّب اسم سورة آخر، أو امسح التصفية.</p>
                <button type="button" className="nq-btn ghost sm" onClick={() => { setQ(''); setKind('all'); }}>عرض الكل</button>
              </div>
            ) : (
              <ul className={styles.grid}>
                {visible.map(b => (
                  <FavCard key={bkKey(b)} b={b} onOpen={() => goToAyah(b.surah, b.ayah)} onRemove={() => removeBookmark(b.surah, b.ayah)} />
                ))}
              </ul>
            )}
            {list.length > shown && (
              <div className={styles.more}>
                <button type="button" className="nq-btn ghost" onClick={() => setShown(s => s + PAGE)}>
                  عرض المزيد <span className="nq-num">({toAr(list.length - shown)})</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FavCard({ b, onOpen, onRemove }) {
  const meta = SURAHS_META[b.surah - 1];
  const { text, failed } = useAyahText(b.surah, b.ayah);
  const name = meta?.[0] || '';

  function copy() {
    if (!text) return;
    navigator.clipboard?.writeText(`${text}\n\n— سورة ${name}، الآية ${b.ayah}`)
      .then(() => setGlobal({ toast: 'نُسخت الآية مع مرجعها' }))
      .catch(() => setGlobal({ toast: 'تعذّر النسخ' }));
  }
  function share() {
    if (!text) return;
    window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah: b.surah, ayah: b.ayah, text } }));
  }

  return (
    <li className={`nq-card ${styles.card}`}>
      <header className={styles.cardHead}>
        <Badge8 size={48}>{toAr(b.surah)}</Badge8>
        <div className={styles.cardTitle}>
          <h3>سورة {name}</h3>
          <span>الآية {toAr(b.ayah)} · {meta?.[3]}</span>
        </div>
        <button type="button" className={`nq-ibtn ${styles.remove}`} onClick={onRemove} aria-label={`إزالة الآية ${toAr(b.ayah)} من سورة ${name} من المفضلة`}>
          <Icon name="x" />
        </button>
      </header>
      <button type="button" className={styles.qBtn} onClick={onOpen} aria-label={`افتح سورة ${name} عند الآية ${toAr(b.ayah)} في المصحف`}>
        {text
          ? <span className={`nq-q ${styles.q}`} lang="ar">{text} <AyahMark n={b.ayah} /></span>
          : failed
            ? <span className={styles.qFail}>تعذّر تحميل نص الآية — افتحها في المصحف.</span>
            : <span className={styles.qWait} aria-hidden="true"><i /><i /></span>}
      </button>
      <footer className={styles.cardActs}>
        <button type="button" className="nq-btn gold sm" onClick={onOpen}><Icon name="book" />افتح في المصحف</button>
        <button type="button" className="nq-btn ghost sm" onClick={copy} disabled={!text} aria-label="نسخ الآية"><Icon name="copy" /><span className={styles.lbl}>نسخ</span></button>
        <button type="button" className="nq-btn ghost sm" onClick={share} disabled={!text} aria-label="مشاركة الآية كصورة"><Icon name="share" /><span className={styles.lbl}>صورة</span></button>
      </footer>
    </li>
  );
}

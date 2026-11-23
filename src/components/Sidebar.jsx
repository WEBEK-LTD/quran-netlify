// ─── Side index: surahs · juz · hizb · bookmarks ────────────────────────────
// Sticky column on desktop; an off-canvas panel (opened from the reader bar) ≤860px.
import { useEffect, useRef, useState } from 'react';
import { useStoreKeys, setGlobal } from '../store';
import { SURAHS_META, JUZ_DATA, HIZB_DATA } from '../data';
import { Icon, Badge8, toAr } from './ornaments/Ornaments';
import { displayNumber, normWord } from './reader/ayahItems';
import { useTr, surahName, revelationLabel, isRtl } from '../l10n';
import { coreTr, coreTrNow } from '../locales/core';
import styles from './Sidebar.module.css';

const MOBILE = 860;
const isMobile = () => window.innerWidth <= MOBILE;

// ─── helper: navigate and close on mobile ─────────────────────────────────
function goTo(surah, ayah = 1) {
  setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
  localStorage.setItem('nq_lastRead', JSON.stringify({ surah, ayah }));
  if (isMobile()) setGlobal({ sidebarOpen: false });
}

const TABS = [
  { id: 'surahs',    label: 'السور' },
  { id: 'juz',       label: 'الأجزاء' },
  { id: 'hizb',      label: 'الأحزاب' },
  { id: 'bookmarks', label: 'المحفوظات' },
];

function ayahLabel(surah, kufi) {
  const n = displayNumber(surah, kufi);
  return n === null ? coreTrNow('البسملة') : coreTrNow('الآية {n}', { n: toAr(n) });
}

const SIDE_KEYS = ['bookmarks', 'currentSurah', 'sidebarOpen'];

export default function Sidebar() {
  const state       = useStoreKeys(SIDE_KEYS);
  const tr = coreTr(useTr());
  const rtl = isRtl(tr.lang);
  const [tab, setTab]       = useState('surahs');
  const [filter, setFilter] = useState('');
  const [openJuz, setOpenJuz] = useState(null); // expanded juz number
  const listRef = useRef(null);
  const asideRef = useRef(null);
  const open = !!state.sidebarOpen;

  // The store starts with sidebarOpen = true (desktop). On a phone, start closed.
  useEffect(() => {
    if (isMobile() && state.sidebarOpen) setGlobal({ sidebarOpen: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the current surah in view inside the list (scroll the list, not the page)
  useEffect(() => {
    if (tab !== 'surahs' || filter) return;
    const list = listRef.current;
    const el = list && list.querySelector('[aria-current="true"]');
    if (el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
  }, [state.currentSurah, tab, filter, open]);

  // Off-canvas: Escape closes, focus moves into the panel
  useEffect(() => {
    if (!open || !isMobile()) return;
    function onKey(e) { if (e.key === 'Escape') setGlobal({ sidebarOpen: false }); }
    window.addEventListener('keydown', onKey);
    setTimeout(() => asideRef.current?.querySelector('input,button')?.focus(), 30);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const q = filter.trim();
  const qn = normWord(q);
  const filteredSurahs = SURAHS_META
    .map((m, i) => ({ meta: m, num: i + 1 }))
    .filter(({ meta, num }) =>
      !q ||
      String(num) === q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) ||
      meta[0].includes(q) ||
      (qn && normWord(meta[0]).includes(qn)) ||
      meta[1].toLowerCase().includes(q.toLowerCase())
    );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className={styles.overlay} aria-hidden="true"
          onClick={() => setGlobal({ sidebarOpen: false })} />
      )}

      <aside ref={asideRef} className={`${styles.side} ${open ? styles.open : ''}`} aria-label={tr('فهرس المصحف')} id="nq-side">
        <div className={styles.head}>
          <span className="nq-eyebrow">{tr('فهرس المصحف')}</span>
          <button type="button" className={styles.close} onClick={() => setGlobal({ sidebarOpen: false })} aria-label={tr('إغلاق الفهرس')}>
            <Icon name="x" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className={`nq-seg ${styles.tabs}`} role="group" aria-label={tr('تصفّح حسب')}>
          {TABS.map(t => (
            <button key={t.id} type="button" aria-pressed={tab === t.id}
              onClick={() => { setTab(t.id); setFilter(''); setOpenJuz(null); }}>
              {tr(t.label)}
            </button>
          ))}
        </div>

        {/* ── Search (surahs only) ── */}
        {tab === 'surahs' && (
          <label className={`nq-input ${styles.search}`}>
            <Icon name="search" />
            <input type="search" placeholder={tr('اسم السورة أو رقمها')} value={filter}
              onChange={e => setFilter(e.target.value)} dir="auto" aria-label={tr('ابحث عن سورة')} />
            {filter && (
              <button type="button" className={styles.clear} onClick={() => setFilter('')} aria-label={tr('مسح البحث')}><Icon name="x" /></button>
            )}
          </label>
        )}

        {/* ── Content ── */}
        <div className={styles.list} ref={listRef}>

          {/* ════ SURAHS ════ */}
          {tab === 'surahs' && filteredSurahs.map(({ meta, num }) => (
            <button key={num} type="button"
              className={styles.item}
              aria-current={state.currentSurah === num ? 'true' : undefined}
              onClick={() => goTo(num)}>
              <Badge8 size={36}>{toAr(num)}</Badge8>
              <span className={styles.info}>
                <span className={styles.name}>{surahName(num)}</span>
                <span className={styles.sub}>{revelationLabel(meta[3])} · {tr('{n} آية', { n: toAr(meta[2]) })}</span>
              </span>
              {rtl ? <span className={styles.en} dir="ltr">{meta[1]}</span> : <span className={styles.en} dir="rtl" lang="ar">{meta[0]}</span>}
            </button>
          ))}
          {tab === 'surahs' && filteredSurahs.length === 0 && (
            <div className={styles.empty}>{tr('لا توجد سورة بهذا الاسم.')}</div>
          )}

          {/* ════ JUZ ════ */}
          {tab === 'juz' && JUZ_DATA.map(j => {
            const isOpen = openJuz === j.juz;
            const isActive = j.surahs.includes(state.currentSurah);
            return (
              <div key={j.juz} className={styles.group}>
                <button type="button" className={`${styles.item} ${isActive ? styles.activeSoft : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenJuz(isOpen ? null : j.juz)}>
                  <Badge8 size={36}>{toAr(j.juz)}</Badge8>
                  <span className={styles.info}>
                    <span className={styles.name}>{tr('الجزء {n}', { n: toAr(j.juz) })}</span>
                    <span className={styles.sub}>{surahName(j.surah)} · {ayahLabel(j.surah, j.ayah)} · {tr('{n} سورة', { n: toAr(j.surahs.length) })}</span>
                  </span>
                  <Icon name="chev" className={`${styles.chev} ${isOpen ? styles.chevOpen : ''}`} />
                </button>

                {isOpen && (
                  <div className={styles.sublist}>
                    <button type="button" className={styles.start} onClick={() => goTo(j.surah, j.ayah)}>
                      <Icon name="play" />
                      <span>{tr('ابدأ من الجزء {n}', { n: toAr(j.juz) })}</span>
                      <small>{surahName(j.surah)} {toAr(displayNumber(j.surah, j.ayah) ?? 1)}</small>
                    </button>
                    {j.surahs.map(sNum => {
                      const m = SURAHS_META[sNum - 1];
                      return (
                        <button key={sNum} type="button" className={styles.subItem}
                          aria-current={state.currentSurah === sNum ? 'true' : undefined}
                          onClick={() => goTo(sNum)}>
                          <span className={styles.subNum}>{toAr(sNum)}</span>
                          <span className={styles.name}>{surahName(sNum)}</span>
                          <span className={styles.sub}>{tr('{n} آية', { n: toAr(m[2]) })}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ════ HIZB ════ */}
          {tab === 'hizb' && HIZB_DATA.map(h => {
            const m = SURAHS_META[h.surah - 1];
            const isActive = state.currentSurah === h.surah;
            return (
              <button key={h.hizb} type="button"
                className={`${styles.item} ${isActive ? styles.activeSoft : ''}`}
                onClick={() => goTo(h.surah, h.ayah)}>
                <Badge8 size={36}>{toAr(h.hizb)}</Badge8>
                <span className={styles.info}>
                  <span className={styles.name}>{tr('الحزب {n}', { n: toAr(h.hizb) })}</span>
                  <span className={styles.sub}>{surahName(h.surah)} · {ayahLabel(h.surah, h.ayah)}</span>
                </span>
                <span className={styles.tag}>{tr('الجزء {n}', { n: toAr(h.juz) })}</span>
              </button>
            );
          })}

          {/* ════ BOOKMARKS ════ */}
          {tab === 'bookmarks' && (
            state.bookmarks.length === 0
              ? (
                <div className={styles.empty}>
                  <Badge8 icon="bookmark" />
                  <p>{tr('لا توجد آيات محفوظة بعد.')}</p>
                  <small>{tr('اختر آية ثم اضغط «المفضلة» لحفظها هنا.')}</small>
                </div>
              )
              : state.bookmarks.map((b, i) => {
                  const m = SURAHS_META[b.surah - 1];
                  if (!m) return null;
                  return (
                    <button key={`${b.surah}:${b.ayah}:${i}`} type="button" className={styles.item}
                      onClick={() => goTo(b.surah, b.ayah)}>
                      <Badge8 icon="bookmark" size={36} />
                      <span className={styles.info}>
                        <span className={styles.name}>{surahName(b.surah)}</span>
                        <span className={styles.sub}>{ayahLabel(b.surah, b.ayah)}</span>
                      </span>
                    </button>
                  );
                })
          )}

        </div>
      </aside>
    </>
  );
}

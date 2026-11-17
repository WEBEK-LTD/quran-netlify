import { useState } from 'react';
import { useStore, setGlobal } from '../store';
import { SURAHS_META, JUZ_DATA, HIZB_DATA, toArabicNum } from '../data';
import styles from './Sidebar.module.css';

// ─── helper: navigate and close on mobile ─────────────────────────────────
function goTo(surah, ayah = 1) {
  setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
  localStorage.setItem('nq_lastRead', JSON.stringify({ surah, ayah }));
  if (window.innerWidth <= 768) setGlobal({ sidebarOpen: false });
}

export default function Sidebar() {
  const [state]     = useStore();
  const [tab, setTab]       = useState('surahs');
  const [filter, setFilter] = useState('');
  const [openJuz, setOpenJuz] = useState(null); // expanded juz number

  const filteredSurahs = SURAHS_META
    .map((m, i) => ({ meta: m, num: i + 1 }))
    .filter(({ meta }) =>
      !filter ||
      meta[0].includes(filter) ||
      meta[1].toLowerCase().includes(filter.toLowerCase())
    );

  return (
    <>
      {/* Mobile overlay */}
      {state.sidebarOpen && (
        <div className={styles.overlay}
          onClick={() => setGlobal({ sidebarOpen: false })} />
      )}

      <aside className={`${styles.sidebar} ${!state.sidebarOpen ? styles.collapsed : ''}`}>

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          {[
            { id: 'surahs', label: 'السور' },
            { id: 'juz',    label: 'الأجزاء' },
            { id: 'hizb',   label: 'الأحزاب' },
            { id: 'bookmarks', label: '🔖' },
          ].map(t => (
            <button key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.activeTab : ''}`}
              onClick={() => { setTab(t.id); setFilter(''); setOpenJuz(null); }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Search (surahs only) ── */}
        {tab === 'surahs' && (
          <div className={styles.filterWrap}>
            <input className={styles.filterInput} type="text"
              placeholder="ابحث في السور..." value={filter}
              onChange={e => setFilter(e.target.value)} dir="rtl" />
            {filter && (
              <button className={styles.clearFilter} onClick={() => setFilter('')}>✕</button>
            )}
          </div>
        )}

        {/* ── Content ── */}
        <div className={styles.list}>

          {/* ════ SURAHS ════ */}
          {tab === 'surahs' && filteredSurahs.map(({ meta, num }) => (
            <div key={num}
              className={`${styles.item} ${state.currentSurah === num ? styles.activeItem : ''}`}
              onClick={() => goTo(num)}>
              <div className={styles.num}>{num}</div>
              <div className={styles.info}>
                <span className={styles.name}>{meta[0]}</span>
                <span className={styles.sub}>{meta[3]} • {meta[2]} آية</span>
              </div>
            </div>
          ))}

          {/* ════ JUZ ════ */}
          {tab === 'juz' && JUZ_DATA.map(j => {
            const isOpen = openJuz === j.juz;
            const isActive = j.surahs.includes(state.currentSurah);
            return (
              <div key={j.juz} className={styles.juzGroup}>
                {/* Juz header — click to expand/go */}
                <div className={`${styles.juzHeader} ${isActive ? styles.activeJuz : ''}`}
                  onClick={() => {
                    setOpenJuz(isOpen ? null : j.juz);
                  }}>
                  <div className={styles.juzBadge}>{j.juz}</div>
                  <div className={styles.juzInfo}>
                    <span className={styles.juzName}>الجزء {toArabicNum(j.juz)}</span>
                    <span className={styles.juzSub}>
                      {SURAHS_META[j.surah - 1][0]} • الآية {j.ayah}
                    </span>
                  </div>
                  <div className={styles.juzMeta}>
                    <span className={styles.juzCount}>{j.surahs.length} سورة</span>
                    <span className={`${styles.juzArrow} ${isOpen ? styles.juzArrowOpen : ''}`}>›</span>
                  </div>
                </div>

                {/* Surahs inside juz */}
                {isOpen && (
                  <div className={styles.juzSurahs}>
                    {/* Go to start of juz */}
                    <div className={styles.juzStartRow}
                      onClick={() => goTo(j.surah, j.ayah)}>
                      <span className={styles.juzStartIcon}>▶</span>
                      <span>ابدأ من الجزء {toArabicNum(j.juz)}</span>
                      <span className={styles.juzStartRef}>{j.surah}:{j.ayah}</span>
                    </div>
                    {/* Each surah in juz */}
                    {j.surahs.map(sNum => {
                      const m = SURAHS_META[sNum - 1];
                      return (
                        <div key={sNum}
                          className={`${styles.subItem} ${state.currentSurah === sNum ? styles.subItemActive : ''}`}
                          onClick={() => goTo(sNum)}>
                          <div className={styles.subNum}>{sNum}</div>
                          <div className={styles.info}>
                            <span className={styles.name}>{m[0]}</span>
                            <span className={styles.sub}>{m[3]} • {m[2]} آية</span>
                          </div>
                        </div>
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
              <div key={h.hizb}
                className={`${styles.hizbItem} ${isActive ? styles.hizbActive : ''}`}
                onClick={() => goTo(h.surah, h.ayah)}>
                <div className={styles.hizbBadge}>
                  <span className={styles.hizbNum}>{h.hizb}</span>
                  <span className={styles.hizbJuz}>ج{h.juz}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.name}>الحزب {toArabicNum(h.hizb)}</span>
                  <span className={styles.sub}>{m[0]} • الآية {h.ayah}</span>
                </div>
                <span className={styles.hizbRef}>{h.surah}:{h.ayah}</span>
              </div>
            );
          })}

          {/* ════ BOOKMARKS ════ */}
          {tab === 'bookmarks' && (
            state.bookmarks.length === 0
              ? <div className={styles.empty}>لا توجد آيات محفوظة.<br />اضغط 🔖 بجانب أي آية.</div>
              : state.bookmarks.map((b, i) => {
                  const m = SURAHS_META[b.surah - 1];
                  return (
                    <div key={i} className={styles.item}
                      onClick={() => goTo(b.surah, b.ayah)}>
                      <div className={styles.num}>🔖</div>
                      <div className={styles.info}>
                        <span className={styles.name}>{m[0]} • الآية {b.ayah}</span>
                        <span className={styles.sub}>{b.surah}:{b.ayah}</span>
                      </div>
                    </div>
                  );
                })
          )}

        </div>
      </aside>
    </>
  );
}

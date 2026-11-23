import { useState, useEffect, useRef } from 'react';
import { useStore, setGlobal } from '../store';
import { SURAHS_META, toArabicNum } from '../data';
import { fetchAyahWithTafsir, fetchSurahTafsir, TAFSIR_EDITIONS } from '../api';
import styles from './TafsirPanel.module.css';

// ─── Word Explainer (static map for common Quranic words) ────────────────────
const WORD_HINTS = {
  'ٱلْحَمْدُ': 'الحمد: الثناء والشكر الكامل لله وحده',
  'ٱلرَّحْمَٰنِ': 'الرحمن: ذو الرحمة الواسعة الشاملة لجميع الخلق',
  'ٱلرَّحِيمِ': 'الرحيم: ذو الرحمة الخاصة بالمؤمنين',
  'ٱلصِّرَٰطَ': 'الصراط: الطريق المستقيم الواضح',
  'ٱلْمُسْتَقِيمَ': 'المستقيم: القويم الذي لا اعوجاج فيه',
  'ٱلْغَيْبِ': 'الغيب: ما غاب عن الحواس ولا يُدرك إلا بالوحي',
  'ٱلصَّلَوٰةَ': 'الصلاة: العبادة ذات الأركان المخصوصة',
  'مَّلِكِ': 'الملك: صاحب السلطة والسيادة المطلقة',
  'يَوْمِ': 'اليوم: المراد به يوم القيامة',
};

// Matches any hinted word (longest first). Used to split the ayah text into
// plain strings + highlighted spans rendered by React (no raw HTML injection).
const HINT_RE = new RegExp(
  '(' + Object.keys(WORD_HINTS)
    .sort((a, b) => b.length - a.length)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + ')',
  'g'
);

const ASBAB_NUZUL = {
  '2:255': 'نزلت هذه الآية (آية الكرسي) في المدينة المنورة، وهي من أعظم آيات القرآن الكريم. روي أنها نزلت ردًا على اليهود الذين سألوا النبي ﷺ عن الله.',
  '1:1':  'فاتحة الكتاب نزلت مكية، وهي أم القرآن وأساس الصلاة. قيل إنها أول ما نزل من القرآن كاملًا.',
  '96:1': 'أول ما نزل من القرآن الكريم، نزلت على النبي ﷺ في غار حراء على يد جبريل عليه السلام.',
};

export default function TafsirPanel() {
  const [state] = useStore();
  const { tafsirSurah, tafsirAyah } = state;

  const [activeEdition, setActiveEdition]   = useState('ar.muyassar');
  const [compareEdition, setCompareEdition] = useState('ar.jalalayn');
  const [compareMode, setCompareMode]       = useState(false);
  const [data, setData]       = useState(null);
  const [data2, setData2]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tafsir'); // tafsir | words | asbab
  const [allTafsir, setAllTafsir]   = useState(null);
  const [allTafsir2, setAllTafsir2] = useState(null);
  const panelRef = useRef(null);

  const meta = SURAHS_META[tafsirSurah - 1];
  const ayahKey = `${tafsirSurah}:${tafsirAyah}`;

  // Load tafsir when ayah/edition changes
  useEffect(() => {
    if (!tafsirSurah || !tafsirAyah) return;
    setLoading(true);
    setData(null); setData2(null);

    const promises = [fetchAyahWithTafsir(tafsirSurah, tafsirAyah, activeEdition)];
    if (compareMode) promises.push(fetchAyahWithTafsir(tafsirSurah, tafsirAyah, compareEdition));

    Promise.all(promises)
      .then(([d1, d2]) => { setData(d1); if (d2) setData2(d2); setLoading(false); })
      .catch(() => { setLoading(false); setGlobal({ toast: '⚠️ تعذّر تحميل التفسير' }); });
  }, [tafsirSurah, tafsirAyah, activeEdition, compareMode, compareEdition]);

  // Navigate between ayahs
  function navigate(delta) {
    const max = meta[2];
    const next = Math.max(1, Math.min(max, tafsirAyah + delta));
    setGlobal({ tafsirAyah: next });
  }

  // Detect Quranic words in text. API text is rendered as React text nodes
  // (auto-escaped), so third-party HTML can never run. The CSS class is
  // :global(.wordHint), so the plain class name is used here.
  function highlightWords(text) {
    if (!text) return text;
    return String(text).split(HINT_RE).map((part, i) =>
      Object.prototype.hasOwnProperty.call(WORD_HINTS, part)
        ? <span key={i} className="wordHint" title={WORD_HINTS[part]}>{part}</span>
        : part
    );
  }

  function close() {
    setGlobal({ showTafsir: false });
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={close} />

      {/* Panel */}
      <div className={styles.panel} ref={panelRef}>
        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelIcon}>📖</span>
            <div>
              <h2>التفسير</h2>
              <p>{meta[0]} — الآية {tafsirAyah} من {meta[2]}</p>
            </div>
          </div>
          <div className={styles.panelNav}>
            <button className={styles.navBtn} onClick={() => navigate(-1)} disabled={tafsirAyah <= 1}>
              ▶ السابقة
            </button>
            <span className={styles.ayahBadge}>{tafsirAyah}</span>
            <button className={styles.navBtn} onClick={() => navigate(1)} disabled={tafsirAyah >= meta[2]}>
              التالية ◀
            </button>
          </div>
          <button className={styles.closeBtn} onClick={close}>✕</button>
        </div>

        {/* Ayah Text */}
        <div className={styles.ayahBox}>
          {loading ? (
            <div className={styles.textShimmer} />
          ) : (
            <p className={styles.ayahText}>
              {highlightWords(data?.text || '')}
            </p>
          )}
          <div className={styles.ayahRef}>{ayahKey}</div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {[
            { id: 'tafsir', label: '📚 التفسير' },
            { id: 'words',  label: '🔤 الكلمات' },
            { id: 'asbab',  label: '📝 سبب النزول' },
          ].map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${activeTab === t.id ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>

          {/* ── TAFSIR TAB ── */}
          {activeTab === 'tafsir' && (
            <>
              {/* Edition & Compare controls */}
              <div className={styles.controls}>
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>التفسير:</label>
                  <select
                    className={styles.select}
                    value={activeEdition}
                    onChange={e => setActiveEdition(e.target.value)}
                  >
                    <option value="ar.muyassar">التفسير الميسر</option>
                    <option value="ar.jalalayn">تفسير الجلالين</option>
                  </select>
                </div>
                <button
                  className={`${styles.compareBtn} ${compareMode ? styles.compareBtnActive : ''}`}
                  onClick={() => setCompareMode(!compareMode)}
                >
                  {compareMode ? '✕ إغلاق المقارنة' : '⇄ مقارنة التفاسير'}
                </button>
              </div>

              {compareMode && (
                <div className={styles.controlGroup} style={{ marginBottom: 12 }}>
                  <label className={styles.controlLabel}>تفسير ثانٍ:</label>
                  <select
                    className={styles.select}
                    value={compareEdition}
                    onChange={e => setCompareEdition(e.target.value)}
                  >
                    <option value="ar.jalalayn">تفسير الجلالين</option>
                    <option value="ar.muyassar">التفسير الميسر</option>
                  </select>
                </div>
              )}

              {/* Tafsir content */}
              {loading ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner} />
                  <span>جاري تحميل التفسير...</span>
                </div>
              ) : compareMode ? (
                <div className={styles.compareGrid}>
                  <div className={styles.compareCol}>
                    <div className={styles.colHeader}>
                      {activeEdition === 'ar.muyassar' ? 'التفسير الميسر' : 'تفسير الجلالين'}
                    </div>
                    <p className={styles.tafsirText}>{data?.tafsir}</p>
                  </div>
                  <div className={styles.compareDivider} />
                  <div className={styles.compareCol}>
                    <div className={styles.colHeader}>
                      {compareEdition === 'ar.jalalayn' ? 'تفسير الجلالين' : 'التفسير الميسر'}
                    </div>
                    <p className={styles.tafsirText}>{data2?.tafsir || 'جاري التحميل...'}</p>
                  </div>
                </div>
              ) : (
                <div className={styles.tafsirBox}>
                  <div className={styles.tafsirSource}>
                    {activeEdition === 'ar.muyassar' ? '📗 التفسير الميسر' : '📘 تفسير الجلالين'}
                  </div>
                  <p className={styles.tafsirText}>{data?.tafsir}</p>
                </div>
              )}

              {/* AI Notice */}
              <div className={styles.aiNotice}>
                التفسير المعروض منقول من مصادره العلمية المعتمدة.
              </div>
            </>
          )}

          {/* ── WORDS TAB ── */}
          {activeTab === 'words' && (
            <div className={styles.wordsTab}>
              {loading ? (
                <div className={styles.loadingState}><div className={styles.spinner} /><span>جاري التحميل...</span></div>
              ) : (
                <>
                  <p className={styles.wordsIntro}>
                    الكلمات المميزة باللون القابلة للضغط في نص الآية أعلاه تحتوي على شرح. إليك شرح الكلمات الواردة في هذه الآية:
                  </p>
                  {Object.entries(WORD_HINTS)
                    .filter(([word]) => data?.text?.includes(word))
                    .length > 0 ? (
                      Object.entries(WORD_HINTS)
                        .filter(([word]) => data?.text?.includes(word))
                        .map(([word, hint]) => (
                          <div key={word} className={styles.wordCard}>
                            <span className={styles.wordAr}>{word}</span>
                            <span className={styles.wordExplain}>{hint}</span>
                          </div>
                        ))
                    ) : (
                      <div className={styles.emptyState}>
                        <span>🔤</span>
                        <p>لا توجد كلمات مشروحة محفوظة لهذه الآية بعد.</p>
                        <p style={{ fontSize: 11, marginTop: 6 }}>سيتم توسيع قاعدة الكلمات في التحديثات القادمة.</p>
                      </div>
                    )
                  }
                </>
              )}
            </div>
          )}

          {/* ── ASBAB AL-NUZUL TAB ── */}
          {activeTab === 'asbab' && (
            <div className={styles.asbabTab}>
              {ASBAB_NUZUL[ayahKey] ? (
                <div className={styles.asbabCard}>
                  <div className={styles.asbabIcon}>📜</div>
                  <div className={styles.asbabText}>{ASBAB_NUZUL[ayahKey]}</div>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span>📜</span>
                  <p>لم يُذكر سبب نزول خاص لهذه الآية في المصادر المتاحة حاليًا.</p>
                  <p style={{ fontSize: 11, marginTop: 6 }}>قد تكون الآية ضمن سياق سورتها العام دون سبب نزول مستقل.</p>
                </div>
              )}

              <div className={styles.asbabNote}>
                💡 <strong>ملاحظة:</strong> أسباب النزول علم شريف يُعنى بمعرفة الأحداث التي اقترنت بنزول الآيات. لا تشترط الآية أن يكون لها سبب نزول.
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className={styles.panelFooter}>
          <button
            className={styles.footerBtn}
            onClick={() => {
              if (!data) return;
              const text = `${data.text}\n\n📖 التفسير (${activeEdition === 'ar.muyassar' ? 'الميسر' : 'الجلالين'}):\n${data.tafsir}\n\n— ${meta[0]} ${tafsirAyah}`;
              navigator.clipboard.writeText(text);
              setGlobal({ toast: '✅ تم نسخ الآية والتفسير' });
            }}
          >
            📋 نسخ الآية والتفسير
          </button>
          <button
            className={styles.footerBtn}
            onClick={() => {
              setGlobal({
                showTafsir: false,
                audioAyah: tafsirAyah,
                showAudio: true,
                playTrigger: Date.now()
              });
            }}
          >
            🎧 استماع للآية
          </button>
        </div>
      </div>
    </>
  );
}

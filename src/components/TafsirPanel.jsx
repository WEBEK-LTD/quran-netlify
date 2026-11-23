import { useState, useEffect, useRef } from 'react';
import { useStore, setGlobal } from '../store';
import { SURAHS_META } from '../data';
import { fetchAyahWithTafsir } from '../api';
import { Icon, Badge8, Divider, toAr } from './ornaments/Ornaments';
import { displayNumber, juzRange } from './reader/ayahItems';
import { useTr, trNow, num, surahName, revelationLabel } from '../l10n';
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

const EDITIONS = [
  { id: 'ar.muyassar', name: 'التفسير الميسّر', short: 'الميسّر' },
  { id: 'ar.jalalayn', name: 'تفسير الجلالين', short: 'الجلالين' },
];
const edName = id => (EDITIONS.find(e => e.id === id) || EDITIONS[0]).name;

// tafsirAyah is the Kufi number; Al-Fatiha is labelled with the Madani number.
// Arabic form, for the copied text (it travels with the Arabic tafsir).
function ayahTitleAr(surah, kufi) {
  const n = displayNumber(surah, kufi);
  const ar = v => String(v).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  if (n === null) return 'البسملة';
  return typeof n === 'string' ? `الآيتان ${ar(n)}` : `الآية ${ar(n)}`;
}

function ayahTitle(surah, kufi) {
  const n = displayNumber(surah, kufi);
  if (n === null) return trNow('البسملة');
  return typeof n === 'string' ? trNow('الآيتان {n}', { n: toAr(n) }) : trNow('الآية {n}', { n: toAr(n) });
}

export default function TafsirPanel() {
  const [state] = useStore();
  const tr = useTr();
  const { tafsirSurah, tafsirAyah } = state;

  const [activeEdition, setActiveEdition]   = useState('ar.muyassar');
  const [compareEdition, setCompareEdition] = useState('ar.jalalayn');
  const [compareMode, setCompareMode]       = useState(false);
  const [data, setData]       = useState(null);
  const [data2, setData2]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tafsir'); // tafsir | words | asbab
  const panelRef = useRef(null);

  const meta = SURAHS_META[tafsirSurah - 1] || SURAHS_META[0];
  const ayahKey = `${tafsirSurah}:${tafsirAyah}`;
  const title = ayahTitle(tafsirSurah, tafsirAyah);
  const shown = displayNumber(tafsirSurah, tafsirAyah);
  const [j1] = juzRange(tafsirSurah || 1);

  // Load tafsir when ayah/edition changes
  useEffect(() => {
    if (!tafsirSurah || !tafsirAyah) return;
    let cancelled = false;
    setLoading(true);
    setData(null); setData2(null);

    const promises = [fetchAyahWithTafsir(tafsirSurah, tafsirAyah, activeEdition)];
    if (compareMode) promises.push(fetchAyahWithTafsir(tafsirSurah, tafsirAyah, compareEdition));

    Promise.all(promises)
      .then(([d1, d2]) => { if (cancelled) return; setData(d1); if (d2) setData2(d2); setLoading(false); })
      .catch(() => { if (cancelled) return; setLoading(false); setGlobal({ toast: trNow('تعذّر تحميل التفسير') }); });
    return () => { cancelled = true; };
  }, [tafsirSurah, tafsirAyah, activeEdition, compareMode, compareEdition]);

  // Navigate between (Kufi) ayahs
  function navigate(delta) {
    const max = meta[2];
    const next = Math.max(1, Math.min(max, tafsirAyah + delta));
    setGlobal({ tafsirAyah: next });
  }

  // Detect Quranic words in text. API text is rendered as React text nodes
  // (auto-escaped), so third-party HTML can never run.
  function highlightWords(text) {
    if (!text) return text;
    return String(text).split(HINT_RE).map((part, i) =>
      Object.prototype.hasOwnProperty.call(WORD_HINTS, part)
        ? <span key={i} className={styles.wordHint} title={WORD_HINTS[part]}>{part}</span>
        : part
    );
  }

  function close() {
    setGlobal({ showTafsir: false });
  }

  // Close on Escape; move focus into the panel when it opens
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const words = Object.entries(WORD_HINTS).filter(([word]) => data?.text?.includes(word));
  const sName = surahName(tafsirSurah || 1);
  const refText = `${sName} · ${title}`;

  return (
    <>
      {/* Backdrop (only when the panel overlays the page, ≤1240px) */}
      <div className={styles.backdrop} onClick={close} aria-hidden="true" />

      <aside className={styles.panel} ref={panelRef} tabIndex={-1} aria-label={tr('التفسير — {ref}', { ref: refText })}>
        {/* Reference */}
        <div className={styles.ref}>
          {shown === null ? <Badge8 icon="star" size={46} /> : <Badge8 size={46}>{toAr(shown)}</Badge8>}
          <div className={styles.refTxt}>
            <h2>{refText}</h2>
            <small>{tr('التفسير')} · {tr('الجزء {n}', { n: toAr(j1) })} · {revelationLabel(meta[3])}</small>
          </div>
          <button type="button" className={styles.iconBtn} onClick={close} aria-label={tr('إغلاق التفسير')} title={tr('إغلاق')}>
            <Icon name="x" />
          </button>
        </div>

        <div className={styles.nav}>
          <button type="button" className="nq-btn ghost sm" onClick={() => navigate(-1)} disabled={tafsirAyah <= 1} aria-label={tr('الآية السابقة')}>
            <Icon name="back" />{tr('السابقة')}
          </button>
          <span className={styles.navPos}>{tafsirSurah === 1 ? title : tr('{a} من {b}', { a: toAr(tafsirAyah), b: toAr(meta[2]) })}</span>
          <button type="button" className="nq-btn ghost sm" onClick={() => navigate(1)} disabled={tafsirAyah >= meta[2]} aria-label={tr('الآية التالية')}>
            {tr('التالية')}<Icon name="back" className={styles.flip} />
          </button>
        </div>

        {/* Ayah Text */}
        <div className={styles.ayq}>
          <svg className={`${styles.qc} ${styles.qcA}`} aria-hidden="true"><use href="#nq-corner" /></svg>
          <svg className={`${styles.qc} ${styles.qcB}`} aria-hidden="true"><use href="#nq-corner" /></svg>
          {loading ? (
            <div className={styles.textShimmer} />
          ) : (
            <p className={styles.ayahText} lang="ar" dir="rtl">{highlightWords(data?.text || '')}</p>
          )}
        </div>

        {/* Tabs */}
        <div className={styles.tabs} role="tablist" aria-label={tr('أقسام التفسير')}>
          {[
            { id: 'tafsir', label: 'التفسير' },
            { id: 'words',  label: 'معاني الكلمات' },
            { id: 'asbab',  label: 'سبب النزول' },
          ].map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id}
              className={styles.tab} onClick={() => setActiveTab(t.id)}>
              {tr(t.label)}
            </button>
          ))}
        </div>

        {/* ── TAFSIR TAB ── */}
        {activeTab === 'tafsir' && (
          <div className={styles.section} role="tabpanel">
            <div className={styles.srcRow}>
              <div className="nq-seg" role="group" aria-label={tr('مصدر التفسير')}>
                {EDITIONS.map(e => (
                  <button key={e.id} type="button" aria-pressed={activeEdition === e.id} onClick={() => setActiveEdition(e.id)}>{tr(e.short)}</button>
                ))}
              </div>
              <button type="button" className={`nq-pill ${compareMode ? 'on' : ''} ${styles.cmp}`} aria-pressed={compareMode}
                onClick={() => setCompareMode(!compareMode)}>
                <Icon name="grid" />{tr('مقارنة')}
              </button>
            </div>

            {compareMode && (
              <div className={styles.srcRow}>
                <span className={styles.lbl}>{tr('مع:')}</span>
                <div className="nq-seg" role="group" aria-label={tr('التفسير الثاني')}>
                  {EDITIONS.map(e => (
                    <button key={e.id} type="button" aria-pressed={compareEdition === e.id} onClick={() => setCompareEdition(e.id)}>{tr(e.short)}</button>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <span>{tr('جاري تحميل التفسير…')}</span>
              </div>
            ) : compareMode ? (
              <div className={styles.compare}>
                <div className={styles.col}>
                  <b className={styles.colHead}>{tr(edName(activeEdition))}</b>
                  <p className={styles.body} lang="ar" dir="rtl">{data?.tafsir}</p>
                </div>
                <div className={styles.col}>
                  <b className={styles.colHead}>{tr(edName(compareEdition))}</b>
                  <p className={styles.body} lang="ar" dir="rtl">{data2?.tafsir || tr('جاري التحميل…')}</p>
                </div>
              </div>
            ) : (
              <>
                <b className={styles.colHead}>{tr(edName(activeEdition))}</b>
                <p className={styles.body} lang="ar" dir="rtl">{data?.tafsir}</p>
              </>
            )}

            <p className={styles.note}>{tr('التفسير المعروض منقول من مصادره العلمية المعتمدة.')}</p>
          </div>
        )}

        {/* ── WORDS TAB ── */}
        {activeTab === 'words' && (
          <div className={styles.section} role="tabpanel">
            {loading ? (
              <div className={styles.loadingState}><div className={styles.spinner} /><span>{tr('جاري التحميل…')}</span></div>
            ) : words.length > 0 ? (
              <>
                <p className={styles.note}>{tr('الكلمات المميّزة في نص الآية أعلاه لها شرح:')}</p>
                <div className={styles.words} lang="ar" dir="rtl">
                  {words.map(([word, hint]) => {
                    const [, explain] = hint.split(/:\s*/);
                    return <div key={word}><b>{word}</b><span>{explain || hint}</span></div>;
                  })}
                </div>
              </>
            ) : (
              <div className={styles.empty}>
                <Badge8 icon="doc" />
                <p>{tr('لا توجد كلمات مشروحة محفوظة لهذه الآية بعد.')}</p>
                <small>{tr('سيتم توسيع قاعدة الكلمات في التحديثات القادمة.')}</small>
              </div>
            )}
          </div>
        )}

        {/* ── ASBAB AL-NUZUL TAB ── */}
        {activeTab === 'asbab' && (
          <div className={styles.section} role="tabpanel">
            {ASBAB_NUZUL[ayahKey] ? (
              <p className={styles.body} lang="ar" dir="rtl">{ASBAB_NUZUL[ayahKey]}</p>
            ) : (
              <div className={styles.empty}>
                <Badge8 icon="scroll" />
                <p>{tr('لم يُذكر سبب نزول خاص لهذه الآية في المصادر المتاحة حاليًا.')}</p>
                <small>{tr('قد تكون الآية ضمن سياق سورتها العام دون سبب نزول مستقل.')}</small>
              </div>
            )}
            <Divider />
            <p className={styles.note}>{tr('أسباب النزول علم شريف يُعنى بمعرفة الأحداث التي اقترنت بنزول الآيات، وليس لكل آية سبب نزول.')}</p>
          </div>
        )}

        {/* Footer actions */}
        <div className={styles.footer}>
          <button type="button" className="nq-btn ghost sm"
            onClick={() => {
              if (!data) return;
              const text = `${data.text}\n\nالتفسير (${edName(activeEdition)}):\n${data.tafsir}\n\n— سورة ${meta[0]}، ${ayahTitleAr(tafsirSurah, tafsirAyah)}`;
              navigator.clipboard.writeText(text)
                .then(() => setGlobal({ toast: trNow('تم نسخ الآية والتفسير') }))
                .catch(() => setGlobal({ toast: trNow('تعذّر النسخ') }));
            }}>
            <Icon name="copy" />{tr('نسخ')}
          </button>
          <button type="button" className="nq-btn ghost sm"
            onClick={() => setGlobal({ audioAyah: tafsirAyah, showAudio: true, playTrigger: Date.now() })}>
            <Icon name="head" />{tr('استماع')}
          </button>
          <button type="button" className="nq-btn ghost sm"
            onClick={() => window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah: tafsirSurah, ayah: tafsirAyah, text: data?.text || '' } }))}>
            <Icon name="share" />{tr('مشاركة')}
          </button>
          <button type="button" className="nq-btn ghost sm"
            onClick={() => {
              setGlobal({ currentAyah: tafsirAyah });
              window.dispatchEvent(new CustomEvent('openAI', { detail: { surah: tafsirSurah, ayah: tafsirAyah, text: data?.text || '' } }));
            }}>
            <Icon name="chat" />{tr('اسأل المساعد')}
          </button>
        </div>
      </aside>
    </>
  );
}

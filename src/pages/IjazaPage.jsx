import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SURAHS_META, toArabicNum } from '../data';
import styles from './IjazaPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

// ─── القراءات العشر المتواترة + رواياتها ──────────────────────────────────────
const QIRAAT = [
  {
    id: 'hafs',
    imam: 'عاصم', rawi: 'حفص', full: 'رواية حفص عن عاصم',
    region: 'الكوفة', edition: 'ar.uthmani', color: '#52b788',
    desc: 'أكثر القراءات انتشاراً في العالم الإسلامي اليوم',
    audioPrefix: 'Alafasy_128kbps', reciter: 'مشاري راشد العفاسي', audioAvailable: true,
  },
  {
    id: 'warsh',
    imam: 'نافع', rawi: 'ورش', full: 'رواية ورش عن نافع',
    region: 'المدينة', edition: 'ar.warsh_uthman', color: '#c9a84c',
    desc: 'المنتشرة في المغرب والجزائر وتونس وغرب أفريقيا',
    audioPrefix: 'Warsh_Alaminiy_128kbps', reciter: 'محمد الأمينيي',
    audioAvailable: false, audioNote: 'تسجيل رواية ورش غير متاح حالياً',
  },
  {
    id: 'qalun',
    imam: 'نافع', rawi: 'قالون', full: 'رواية قالون عن نافع',
    region: 'المدينة', edition: 'ar.qalun', color: '#60a5fa',
    desc: 'المنتشرة في ليبيا وجزء من تونس',
    audioPrefix: 'Husary_128kbps', reciter: 'محمود خليل الحصري', audioAvailable: true,
  },
  {
    id: 'doori_abu_amr',
    imam: 'أبو عمرو', rawi: 'الدوري', full: 'رواية الدوري عن أبي عمرو',
    region: 'البصرة', edition: 'ar.doori', color: '#a78bfa',
    desc: 'قراءة أهل البصرة، منتشرة في السودان وأجزاء من أفريقيا',
    audioPrefix: 'Minshawy_Murattal_128kbps', reciter: 'محمد صديق المنشاوي', audioAvailable: true,
  },
  {
    id: 'ibn_kathir',
    imam: 'ابن كثير', rawi: 'البزي وقنبل', full: 'قراءة ابن كثير المكي',
    region: 'مكة المكرمة', edition: 'ar.uthmani', color: '#f97316',
    desc: 'قراءة أهل مكة المكرمة، من أقدم القراءات',
    audioPrefix: 'Abdul_Basit_Murattal_192kbps', reciter: 'عبد الباسط عبد الصمد', audioAvailable: true,
  },
  {
    id: "shu'ba",
    imam: 'عاصم', rawi: 'شعبة', full: 'رواية شعبة عن عاصم',
    region: 'الكوفة', edition: 'ar.uthmani', color: '#fb7185',
    desc: 'الرواية الثانية عن الإمام عاصم الكوفي',
    audioPrefix: 'Mohammad_al_Tablaway_128kbps', reciter: 'محمد الطبلاوي', audioAvailable: true,
  },
  {
    id: 'ibn_aamer',
    imam: 'ابن عامر', rawi: 'هشام وابن ذكوان', full: 'قراءة ابن عامر الشامي',
    region: 'الشام', edition: 'ar.uthmani', color: '#34d399',
    desc: 'قراءة أهل الشام، من أقدم القراءات المتواترة',
    audioPrefix: 'Abu_Bakr_Ash-Shaatree_128kbps', reciter: 'أبو بكر الشاطري', audioAvailable: true,
  },
  {
    id: 'hamza',
    imam: 'حمزة', rawi: 'خلف وخلاد', full: 'قراءة حمزة الكوفي',
    region: 'الكوفة', edition: 'ar.uthmani', color: '#38bdf8',
    desc: 'إحدى القراءات الكوفية المعروفة بالمدّ والإمالة',
    audioPrefix: 'MaherAlMuaiqly128kbps', reciter: 'ماهر المعيقلي',
    audioAvailable: false, audioNote: 'تسجيل رواية خلف وخلاد غير متاح — يُعرض تلاوة بديلة بحفص',
  },
  {
    id: 'kisai',
    imam: 'الكسائي', rawi: 'أبو الحارث والدوري', full: 'قراءة الكسائي الكوفي',
    region: 'الكوفة', edition: 'ar.uthmani', color: '#e879f9',
    desc: 'قراءة إمام النحو والقراءة الكسائي',
    audioPrefix: 'Yasser_Ad-Dussary_128kbps', reciter: 'ياسر الدوسري', audioAvailable: true,
  },
  {
    id: 'abu_jafar',
    imam: 'أبو جعفر', rawi: 'ابن وردان وابن جماز', full: 'قراءة أبي جعفر المدني',
    region: 'المدينة', edition: 'ar.uthmani', color: '#94a3b8',
    desc: 'العاشرة من القراءات المتواترة، مدنية الأصل',
    audioPrefix: 'Abdurrahmaan_As-Sudais_192kbps', reciter: 'عبد الرحمن السديس',
    audioAvailable: false, audioNote: 'تسجيل رواية ابن وردان وابن جماز غير متاح — يُعرض تلاوة بديلة بحفص',
  },
];

const IJAZA_CHAIN = [
  { level: 1, text: 'رسول الله ﷺ', icon: '☀️' },
  { level: 2, text: 'الصحابة الكرام', icon: '⭐' },
  { level: 3, text: 'التابعون', icon: '✦' },
  { level: 4, text: 'أئمة القراء السبعة والعشرة', icon: '📖' },
  { level: 5, text: 'الرواة والطرق', icon: '🔗' },
  { level: 6, text: 'العلماء عبر القرون', icon: '🕌' },
  { level: 7, text: 'مشايخ اليوم', icon: '👨‍🏫' },
  { level: 8, text: 'الطالب / الحافظ', icon: '🎓' },
];

const HAFS_EDITION   = 'ar.uthmani';
const FALLBACK_AUDIO = 'Alafasy_128kbps';            // تلاوة حفص البديلة
const HAFS_TEXT_NOTICE = 'النص المعروض برواية حفص؛ نص هذه الرواية غير متاح بعد';
const HAFS_AUDIO_LABEL = 'تلاوة بديلة برواية حفص';

// Is the text shown for this riwaya actually the Hafs text?
const isHafsQ = q => q.id === 'hafs';
const textIsHafs = (q, fellBack) => !isHafsQ(q) && (q.edition === HAFS_EDITION || fellBack);

// All audio on everyayah here is Hafs — never present it as this riwaya
function audioLabel(q) {
  if (isHafsQ(q)) return q.reciter;
  const voice = q.audioAvailable === false ? 'مشاري راشد العفاسي' : q.reciter;
  return `${HAFS_AUDIO_LABEL} — ${voice}`;
}

// ─── API fetch for a specific qiraa edition ───────────────────────────────────
// Returns { ayahs, fellBack } — fellBack=true when the requested edition was
// unavailable and the Hafs (ar.uthmani) text was returned instead.
async function fetchQiraaSurah(surahNum, edition) {
  const load = async (ed) => {
    const res = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/${ed}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!d?.data?.ayahs?.length) throw new Error('no data');
    return d.data.ayahs.map(a => ({ number: a.numberInSurah, text: a.text }));
  };
  if (edition === HAFS_EDITION) return { ayahs: await load(HAFS_EDITION), fellBack: false };
  try {
    return { ayahs: await load(edition), fellBack: false };
  } catch {
    // Fallback to the Hafs text — callers must tell the user
    return { ayahs: await load(HAFS_EDITION), fellBack: true };
  }
}

// ─── Bismillah strip (same logic as Reader) ───────────────────────────────────
function stripBismillah(text, surah) {
  if (surah === 1 || surah === 9) return text;
  const tokens = text.split(/\s+/);
  const stripped = tokens.slice(4).join(' ').trim();
  return stripped || text;
}

// ─── Surah Selector ───────────────────────────────────────────────────────────
function SurahSelector({ selected, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const filtered = SURAHS_META
    .map((m, i) => ({ num: i + 1, name: m[0], en: m[1], ayahs: m[2] }))
    .filter(s => s.name.includes(search) || s.en.toLowerCase().includes(search.toLowerCase()) || String(s.num).includes(search));

  return (
    <div className={styles.surahSel}>
      <button className={styles.surahSelBtn} onClick={() => setOpen(o => !o)}>
        <span>سورة {SURAHS_META[selected - 1][0]}</span>
        <span className={styles.surahSelNum}>{selected}</span>
        <span style={{ marginRight: 'auto' }}>▾</span>
      </button>
      {open && (
        <div className={styles.surahDropdown}>
          <input
            className={styles.surahSearch}
            placeholder="ابحث..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.surahList}>
            {filtered.map(s => (
              <button key={s.num}
                className={`${styles.surahItem} ${s.num === selected ? styles.surahItemActive : ''}`}
                onClick={() => { onChange(s.num); setOpen(false); setSearch(''); }}>
                <span className={styles.surahItemNum}>{s.num}</span>
                <span>{s.name}</span>
                <span className={styles.surahItemAyahs}>{s.ayahs} آية</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IjazaPage() {
  const t = useT();
  const dir = useDir();
  const [tab,        setTab]      = useState('mushaf');   // mushaf | chain | about
  const [qiraaId,    setQiraaId]  = useState('hafs');
  const [surah,      setSurah]    = useState(1);
  const [ayahs,      setAyahs]    = useState([]);
  const [loading,    setLoading]  = useState(false);
  const [fontSize,   setFontSize] = useState(26);
  const [compare,    setCompare]  = useState(false);
  const [compareId,  setCmpId]    = useState('warsh');

  const activeQ   = QIRAAT.find(q => q.id === qiraaId) || QIRAAT[0];
  const compareQ  = QIRAAT.find(q => q.id === compareId) || QIRAAT[1];
  const [cmpAyahs, setCmpAyahs] = useState([]);
  const [fellBack,    setFellBack]    = useState(false);   // active text fell back to Hafs
  const [cmpFellBack, setCmpFellBack] = useState(false);
  const [loadErr,     setLoadErr]     = useState('');

  // ─── Audio state ────────────────────────────────────────────────────────────
  const [playingAyah, setPlayingAyah] = useState(null);   // ayah number playing
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [autoNext,    setAutoNext]    = useState(true);    // تشغيل مستمر
  const audioRef = useRef(null);

  // Build audio URL from everyayah.com
  function audioUrl(ayahNum, qiraa) {
    const s = String(surah).padStart(3, '0');
    const a = String(ayahNum).padStart(3, '0');
    return `https://everyayah.com/data/${qiraa.audioPrefix}/${s}${a}.mp3`;
  }

  const [audioError, setAudioError] = useState(false);  // true = primary source failed → using fallback
  const [audioMsg,   setAudioMsg]   = useState('');     // shown when even the fallback failed
  const useFallbackRef  = useRef(false);                 // stick to fallback for this surah/qiraa
  const fallbackTriedRef = useRef(false);                // fallback already tried for current ayah

  function playAyah(ayahNum) {
    if (!audioRef.current) return;
    setAudioMsg('');
    fallbackTriedRef.current = false;
    setPlayingAyah(ayahNum);
    setIsPlaying(true);

    const useFallback = activeQ.audioAvailable === false || useFallbackRef.current;
    if (useFallback) fallbackTriedRef.current = true;   // no further fallback exists
    const prefix = useFallback ? FALLBACK_AUDIO : activeQ.audioPrefix;

    audioRef.current.src = audioUrl(ayahNum, { audioPrefix: prefix });
    audioRef.current.play().catch(() => setIsPlaying(false));
  }

  // Fall back to the Alafasy recording once; if that fails too, stop with a message
  function handleAudioError() {
    const el = audioRef.current;
    if (!el || !playingAyah) { setIsPlaying(false); return; }
    if (fallbackTriedRef.current) {
      el.pause();
      setIsPlaying(false);
      setAudioMsg('تعذّر تشغيل الصوت لهذه الآية — تحقق من الاتصال وحاول لاحقاً');
      return;
    }
    fallbackTriedRef.current = true;
    useFallbackRef.current = true;
    setAudioError(true);
    el.src = audioUrl(playingAyah, { audioPrefix: FALLBACK_AUDIO });
    el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (playingAyah) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else {
        playAyah(1);
      }
    }
  }

  function playNext() {
    const total = ayahs.length;
    if (!total) return;
    const next = playingAyah ? playingAyah + 1 : 1;
    if (next > total) { setIsPlaying(false); setPlayingAyah(null); return; }
    playAyah(next);
  }

  function playPrev() {
    if (!playingAyah || playingAyah <= 1) return;
    playAyah(playingAyah - 1);
  }

  // Auto-advance to next ayah when current ends
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      if (autoNext && ayahs.length) {
        const next = (playingAyah || 0) + 1;
        if (next <= ayahs.length) { playAyah(next); }
        else { setIsPlaying(false); setPlayingAyah(null); }
      } else {
        setIsPlaying(false);
      }
    };
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [playingAyah, autoNext, ayahs, surah, qiraaId]);

  // Stop audio when surah/qiraa changes
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); }
    setIsPlaying(false);
    setPlayingAyah(null);
    setAudioError(false);
    setAudioMsg('');
    useFallbackRef.current = false;
    fallbackTriedRef.current = false;
  }, [surah, qiraaId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setAyahs([]);
    setFellBack(false);
    setLoadErr('');
    fetchQiraaSurah(surah, activeQ.edition)
      .then(({ ayahs: data, fellBack: fb }) => {
        if (!alive) return;
        setAyahs(data.map((a, i) => i === 0 ? { ...a, text: stripBismillah(a.text, surah) } : a));
        setFellBack(fb);
        setLoading(false);
      })
      .catch(() => { if (alive) { setLoading(false); setLoadErr('تعذّر تحميل السورة — تحقق من الاتصال'); } });
    return () => { alive = false; };
  }, [surah, qiraaId]);

  useEffect(() => {
    if (!compare) return;
    let alive = true;
    setCmpAyahs([]);
    setCmpFellBack(false);
    fetchQiraaSurah(surah, compareQ.edition)
      .then(({ ayahs: data, fellBack: fb }) => {
        if (!alive) return;
        setCmpAyahs(data.map((a, i) => i === 0 ? { ...a, text: stripBismillah(a.text, surah) } : a));
        setCmpFellBack(fb);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [surah, compareId, compare]);

  const activeTextHafs  = textIsHafs(activeQ, fellBack);
  const compareTextHafs = textIsHafs(compareQ, cmpFellBack);

  const hasBasmala = surah !== 1 && surah !== 9;

  return (
    <div className={styles.page}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1 className={styles.title}>{t('ijazaTitle')}</h1>
        <LangSwitcher compact={true} />
        <div style={{ width: 60 }} />
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {[['mushaf','📖 مصحف القراءات'],['chain','⛓️ سند الإجازة'],['about','📚 عن القراءات']].map(([id,label]) => (
          <button key={id}
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ TAB: مصحف القراءات ══ */}
      {tab === 'mushaf' && (
        <div className={styles.mushafTab}>
          {/* Controls */}
          <div className={styles.controls}>
            {/* Qiraa selector */}
            <div className={styles.qiraaRow}>
              <span className={styles.ctrlLabel}>{t('reader')}:</span>
              <div className={styles.qiraaBtns}>
                {QIRAAT.map(q => (
                  <button key={q.id}
                    className={`${styles.qiraaBtn} ${qiraaId === q.id ? styles.qiraaBtnA : ''}`}
                    style={{ '--c': q.color }}
                    onClick={() => setQiraaId(q.id)}
                    title={q.full}>
                    {q.rawi}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlsRow2}>
              <SurahSelector selected={surah} onChange={setSurah} />

              {/* Font size */}
              <div className={styles.fontCtrl}>
                <button onClick={() => setFontSize(f => Math.max(18, f - 2))}>أ−</button>
                <span>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(48, f + 2))}>أ+</button>
              </div>

              {/* Compare toggle */}
              <button
                className={`${styles.compareBtn} ${compare ? styles.compareBtnOn : ''}`}
                onClick={() => setCompare(c => !c)}>
                ⇄ مقارنة
              </button>
            </div>

            {/* Compare qiraa selector */}
            {compare && (
              <div className={styles.cmpRow}>
                <span className={styles.ctrlLabel}>{t('compare_with')}</span>
                <div className={styles.qiraaBtns}>
                  {QIRAAT.filter(q => q.id !== qiraaId).map(q => (
                    <button key={q.id}
                      className={`${styles.qiraaBtn} ${compareId === q.id ? styles.qiraaBtnA : ''}`}
                      style={{ '--c': q.color }}
                      onClick={() => setCmpId(q.id)}
                      title={q.full}>
                      {q.rawi}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active qiraa info */}
          <div className={styles.qiraaInfo} style={{ '--c': activeQ.color }}>
            <div className={styles.qiraaInfoLeft}>
              <span className={styles.qiraaFull}>{activeQ.full}</span>
              <span className={styles.qiraaRegion}>📍 {activeQ.region}</span>
            </div>
            <div className={styles.qiraaInfoRight}>
              <span className={styles.qiraaDesc}>{activeQ.desc}</span>
              <span className={styles.qiraaReciter}>🎙 {audioLabel(activeQ)}</span>
            </div>
          </div>

          {/* ─── Text / audio honesty notices ─── */}
          {activeTextHafs && (
            <div className={styles.audioUnavailBanner} role="note">
              📖 {HAFS_TEXT_NOTICE}
            </div>
          )}
          {!isHafsQ(activeQ) && (
            <div className={styles.audioUnavailBanner} role="note">
              🎙 {activeQ.audioNote || <>تسجيل رواية <strong>{activeQ.rawi}</strong> غير متاح حالياً</>}
              {!(activeQ.audioNote || '').includes('بديلة') && <> — الصوت المتاح: {HAFS_AUDIO_LABEL}</>}
            </div>
          )}
          {loadErr && <div className={styles.audioUnavailBanner} role="alert">⚠️ {loadErr}</div>}

          {/* ─── Audio Player Bar ─── */}
          <div className={styles.audioBar}>
            <audio ref={audioRef} preload="none"
              onError={handleAudioError}
            />

            {/* Ayah indicator */}
            <div className={styles.audioAyah}>
              {playingAyah ? (
                <span>🎧 الآية {toArabicNum(playingAyah)} — {audioError && !isHafsQ(activeQ) ? `${HAFS_AUDIO_LABEL} — مشاري راشد العفاسي` : audioLabel(activeQ)}</span>
              ) : (
                <span className={styles.audioHint}>
                  {`اضغط على أي آية للاستماع · 🎙 ${audioLabel(activeQ)}`}
                </span>
              )}
              {audioMsg && <span className={styles.audioUnavail} role="alert">⚠️ {audioMsg}</span>}
            </div>

            {/* Controls */}
            <div className={styles.audioCtrls}>
              <button className={styles.audioBtn} onClick={playPrev} disabled={!playingAyah || playingAyah <= 1}>⏮</button>
              <button className={`${styles.audioBtn} ${styles.audioBtnMain}`} onClick={togglePlay}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className={styles.audioBtn} onClick={playNext} disabled={!ayahs.length}>⏭</button>
              <button
                className={`${styles.audioBtn} ${autoNext ? styles.audioBtnOn : ''}`}
                onClick={() => setAutoNext(v => !v)}
                title="تشغيل مستمر">
                🔁
              </button>
            </div>
          </div>

          {/* Mushaf display */}
          {compare ? (
            /* Compare mode: side by side */
            <div className={styles.compareGrid}>
              <div className={styles.compareCol}>
                <div className={styles.compareHeader} style={{ borderColor: activeQ.color }}>
                  <span style={{ color: activeQ.color }}>{activeQ.full}</span>
                  {activeTextHafs && <span className={styles.audioUnavail}>📖 {HAFS_TEXT_NOTICE}</span>}
                </div>
                {hasBasmala && <div className={styles.basmala}>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>}
                <div className={styles.mushafText} style={{ fontSize }}>
                  {loading ? <div className={styles.loadingPulse}>جارٍ التحميل...</div>
                    : ayahs.map(a => (
                      <span key={a.number}
                        className={`${styles.ayahSpan} ${playingAyah === a.number ? styles.ayahPlaying : ''}`}
                        onClick={() => playAyah(a.number)}
                        title={`استمع للآية ${a.number}`}>
                        {a.text}
                        <span className={styles.ayahNum}>﴿{toArabicNum(a.number)}﴾</span>{' '}
                      </span>
                    ))}
                </div>
              </div>
              <div className={styles.compareCol}>
                <div className={styles.compareHeader} style={{ borderColor: compareQ.color }}>
                  <span style={{ color: compareQ.color }}>{compareQ.full}</span>
                  {compareTextHafs && <span className={styles.audioUnavail}>📖 {HAFS_TEXT_NOTICE}</span>}
                </div>
                {hasBasmala && <div className={styles.basmala}>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>}
                <div className={styles.mushafText} style={{ fontSize }}>
                  {cmpAyahs.length === 0
                    ? <div className={styles.loadingPulse}>جارٍ التحميل...</div>
                    : cmpAyahs.map(a => (
                      <span key={a.number} className={styles.ayahSpan}>
                        {a.text}
                        <span className={styles.ayahNum}>﴿{toArabicNum(a.number)}﴾</span>{' '}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            /* Normal mode */
            <div className={styles.mushafWrap}>
              {hasBasmala && <div className={styles.basmala}>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>}
              <div className={styles.mushafText} style={{ fontSize }}>
                {loading
                  ? <div className={styles.loadingPulse}>جارٍ التحميل...</div>
                  : ayahs.map(a => (
                    <span key={a.number}
                      className={`${styles.ayahSpan} ${playingAyah === a.number ? styles.ayahPlaying : ''}`}
                      onClick={() => playAyah(a.number)}
                      title={`استمع للآية ${a.number}`}>
                      {a.text}
                      <span className={styles.ayahNum}>﴿{toArabicNum(a.number)}﴾</span>{' '}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: سند الإجازة ══ */}
      {tab === 'chain' && (
        <div className={styles.chainTab}>
          <p className={styles.chainIntro}>
            الإجازة هي إذن العالم لطالبه برواية القرآن الكريم، وتمتد سلسلة الإسناد متصلة من الطالب إلى النبي ﷺ.
            هذا هو المسار العام لسند الإجازة عبر التاريخ:
          </p>

          <div className={styles.chain}>
            {IJAZA_CHAIN.map((node, i) => (
              <div key={i} className={styles.chainNode}>
                <div className={styles.chainIcon}>{node.icon}</div>
                <div className={styles.chainLine} />
                <div className={styles.chainText}>{node.text}</div>
              </div>
            ))}
          </div>

          <div className={styles.chainInfo}>
            <h3>أهمية الإجازة</h3>
            <p>الإجازة ضمان لصحة النقل — فكل حرف في القرآن وصل إلينا بسند متصل محفوظ، لا يُعتمد فيه إلا على من أخذ بالتلقي المباشر من فم الشيخ إلى أذن الطالب، وهكذا حُفظ القرآن بإذن الله منذ عهد النبي ﷺ.</p>
            <h3>شروط الإجازة</h3>
            <p>يشترط لصحة الإجازة: أن يتلو الطالب القرآن كاملاً على الشيخ بالقراءة المجازاً بها، وأن يُصحح الشيخ أخطاءه، وأن يكون الشيخ حاملاً لإجازة متصلة بسندها.</p>
            <h3>القراءات السبع والعشر</h3>
            <p>القراءات السبع المتواترة هي: نافع، وابن كثير، وأبو عمرو، وابن عامر، وعاصم، وحمزة، والكسائي. وأضاف العلماء ثلاثاً ليكمل العشر: أبو جعفر، ويعقوب، وخلف العاشر.</p>
          </div>
        </div>
      )}

      {/* ══ TAB: عن القراءات ══ */}
      {tab === 'about' && (
        <div className={styles.aboutTab}>
          <p className={styles.aboutIntro}>القراءات العشر المتواترة — كلها وصلت إلينا بسند صحيح متصل بالنبي ﷺ</p>
          <div className={styles.qiraatGrid}>
            {QIRAAT.map(q => (
              <div key={q.id} className={styles.qiraaCard} style={{ '--c': q.color }}>
                <div className={styles.qiraaCardHeader}>
                  <div className={styles.qiraaCardImam}>الإمام {q.imam}</div>
                  <div className={styles.qiraaCardRawi}>رواية {q.rawi}</div>
                </div>
                <div className={styles.qiraaCardRegion}>📍 {q.region}</div>
                <p className={styles.qiraaCardDesc}>{q.desc}</p>
                <span className={styles.qiraaCardReciter}>🎙 {audioLabel(q)}</span>
                {q.audioNote && <span className={styles.audioUnavail}>{q.audioNote}</span>}
                {textIsHafs(q, false) && <span className={styles.audioUnavail}>📖 {HAFS_TEXT_NOTICE}</span>}
                <button className={styles.readThisBtn}
                  onClick={() => { setQiraaId(q.id); setTab('mushaf'); }}>
                  اقرأ بهذه الرواية ←
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

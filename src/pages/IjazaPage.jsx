// ─── الإجازة والقراءات ───────────────────────────────────────────────────────
// A mushaf that reads in several riwayat (honest about what is really Hafs),
// the ten qira'at, and the chain of narration (isnad) of the ijaza.
import { useState, useEffect, useRef } from 'react';
import { SURAHS_META } from '../data';
import { normalizeArabic } from '../arabic';
import { PageHero, Icon, Badge8, Corners, Divider, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { useTr, surahName, revelationLabel } from '../l10n';
import { scoped, trCount } from '../locales/library';
import styles from './IjazaPage.module.css';

// ─── القراءات العشر المتواترة + رواياتها ──────────────────────────────────────
// Every Arabic field below (except reciter names, which stay as they are) is
// a source string translated at render time via src/locales/library.js.
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
  { level: 1, text: 'رسول الله ﷺ', desc: 'تلقّى القرآن من جبريل عليه السلام عن ربّ العزّة، وكان جبريل يعارضه القرآن في رمضان كل عام، وعارضه مرتين في العام الذي تُوفّي فيه.' },
  { level: 2, text: 'الصحابة الكرام', desc: 'أخذوه من فم النبي ﷺ، ومن أشهر القرّاء منهم: عثمان وعلي وأُبيّ بن كعب وزيد بن ثابت وابن مسعود وأبو موسى الأشعري رضي الله عنهم.' },
  { level: 3, text: 'التابعون', desc: 'تلقّوا القرآن عن الصحابة في المدينة ومكة والكوفة والبصرة والشام، وعلّموه الناس في الأمصار.' },
  { level: 4, text: 'أئمة القرّاء السبعة والعشرة', desc: 'نافع وابن كثير وأبو عمرو وابن عامر وعاصم وحمزة والكسائي، ثم أبو جعفر ويعقوب وخلف العاشر.' },
  { level: 5, text: 'الرواة والطرق', desc: 'لكل إمام راويان مشهوران، كحفص وشعبة عن عاصم، ولكل راوٍ طرقٌ نُقلت عنه.' },
  { level: 6, text: 'العلماء عبر القرون', desc: 'حفظوا الأسانيد ودوّنوها، كالإمام الشاطبي في «حرز الأماني»، وابن الجزري في «النشر في القراءات العشر».' },
  { level: 7, text: 'مشايخ اليوم', desc: 'المقرئون المُجازون الذين تتصل أسانيدهم بمن قبلهم، طبقةً عن طبقة.' },
  { level: 8, text: 'الطالب أو الحافظ', desc: 'يقرأ القرآن كاملاً على شيخه مجوَّداً، فإذا أتقنه أجازه، فيتصل اسمه بالسند.' },
];

const HAFS_EDITION   = 'ar.uthmani';
const FALLBACK_AUDIO = 'Alafasy_128kbps';            // تلاوة حفص البديلة
const HAFS_TEXT_NOTICE = 'النص المعروض برواية حفص؛ نص هذه الرواية غير متاح بعد';
const HAFS_AUDIO_LABEL = 'تلاوة بديلة برواية حفص';

// Is the text shown for this riwaya actually the Hafs text?
const isHafsQ = q => q.id === 'hafs';
const textIsHafs = (q, fellBack) => !isHafsQ(q) && (q.edition === HAFS_EDITION || fellBack);

// All audio on everyayah here is Hafs — never present it as this riwaya
function audioLabel(q, tr) {
  if (isHafsQ(q)) return q.reciter;
  const voice = q.audioAvailable === false ? 'مشاري راشد العفاسي' : q.reciter;
  return `${tr(HAFS_AUDIO_LABEL)} — ${voice}`;
}


// Fill {placeholders} in a translated sentence with React nodes.
function withParts(str, parts) {
  return str.split(/(\{\w+\})/).map((p, i) => {
    const k = p.match(/^\{(\w+)\}$/)?.[1];
    return k && parts[k] !== undefined ? <span key={i} style={{ display: 'contents' }}>{parts[k]}</span> : p;
  });
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

// ─── The ten imams (informational) ────────────────────────────────────────────
// Each imam with his two famous narrators; `riwayat` links to the QIRAAT
// entries the mushaf above can show.
const TEN_IMAMS = [
  { n: 1,  imam: 'نافع المدني',        city: 'المدينة المنورة', died: 169, rawis: ['قالون', 'ورش'],            key: 'نافع' },
  { n: 2,  imam: 'ابن كثير المكي',     city: 'مكة المكرمة',     died: 120, rawis: ['البزّي', 'قنبل'],           key: 'ابن كثير' },
  { n: 3,  imam: 'أبو عمرو البصري',    city: 'البصرة',          died: 154, rawis: ['الدوري', 'السوسي'],         key: 'أبو عمرو' },
  { n: 4,  imam: 'ابن عامر الشامي',    city: 'دمشق',            died: 118, rawis: ['هشام', 'ابن ذكوان'],        key: 'ابن عامر' },
  { n: 5,  imam: 'عاصم الكوفي',        city: 'الكوفة',          died: 127, rawis: ['شعبة', 'حفص'],             key: 'عاصم' },
  { n: 6,  imam: 'حمزة الكوفي',        city: 'الكوفة',          died: 156, rawis: ['خلف', 'خلّاد'],            key: 'حمزة' },
  { n: 7,  imam: 'الكسائي الكوفي',     city: 'الكوفة',          died: 189, rawis: ['أبو الحارث', 'الدوري'],     key: 'الكسائي' },
  { n: 8,  imam: 'أبو جعفر المدني',    city: 'المدينة المنورة', died: 130, rawis: ['ابن وردان', 'ابن جمّاز'],   key: 'أبو جعفر' },
  { n: 9,  imam: 'يعقوب الحضرمي',      city: 'البصرة',          died: 205, rawis: ['رُويس', 'روح'],            key: 'يعقوب' },
  { n: 10, imam: 'خلف العاشر',         city: 'بغداد',           died: 229, rawis: ['إسحاق', 'إدريس'],          key: 'خلف' },
];

const SECTIONS = [
  { id: 'mushaf', label: 'مصحف الروايات', icon: 'book' },
  { id: 'qiraat', label: 'القراءات العشر', icon: 'grid' },
  { id: 'chain',  label: 'سند الإجازة',    icon: 'scroll' },
  { id: 'ijaza',  label: 'عن الإجازة',     icon: 'doc' },
];
const LEGACY_TAB = { about: 'qiraat' };
function tabFromHash() {
  try {
    const h = decodeURIComponent((window.location.hash || '').slice(1));
    const id = LEGACY_TAB[h] || h;
    return SECTIONS.some(s => s.id === id) ? id : 'mushaf';
  } catch { return 'mushaf'; }
}

// ─── Surah Selector ───────────────────────────────────────────────────────────
function SurahSelector({ selected, onChange }) {
  const tr = scoped(useTr());
  const trc = (key, n, vars) => trCount(tr, key, n, vars);
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef(null);
  const nq = normalizeArabic(search.trim());
  const filtered = SURAHS_META
    .map((m, i) => ({ num: i + 1, name: m[0], en: m[1], ayahs: m[2] }))
    .filter(s => !nq || normalizeArabic(s.name).includes(nq) || s.en.toLowerCase().includes(search.toLowerCase()) || String(s.num).includes(search.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={styles.surahSel} ref={boxRef}>
      <button type="button" className={styles.surahSelBtn} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="listbox">
        <Badge8 size={34}>{toAr(selected)}</Badge8>
        <span className={styles.surahSelName}>{tr('سورة {name}', { name: surahName(selected, tr.lang) })}</span>
        <Icon name="chev" className={open ? styles.flip : ''} />
      </button>
      {open && (
        <div className={styles.surahDropdown}>
          <label className={`nq-input ${styles.surahSearch}`}>
            <Icon name="search" />
            <input placeholder={tr('اسم السورة أو رقمها')} value={search} onChange={e => setSearch(e.target.value)} autoFocus aria-label={tr('ابحث عن سورة')} />
          </label>
          <div className={styles.surahList} role="listbox" aria-label={tr('السور')}>
            {filtered.map(s => (
              <button key={s.num} type="button" role="option" aria-selected={s.num === selected}
                className={`${styles.surahItem} ${s.num === selected ? styles.surahItemActive : ''}`}
                onClick={() => { onChange(s.num); setOpen(false); setSearch(''); }}>
                <span className={styles.surahItemNum}>{toAr(s.num)}</span>
                <span>{surahName(s.num, tr.lang)}</span>
                <span className={styles.surahItemAyahs}>{trc('{n} آية', s.ayahs, { n: toAr(s.ayahs) })}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className={styles.muted} style={{ padding: 12 }}>{tr('لا توجد سورة بهذا الاسم.')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ icon = 'bell', tone = 'warn', role = 'note', children }) {
  return (
    <div className={`${styles.notice} ${styles['n_' + tone]}`} role={role}>
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

// One run of ayahs, each clickable to play (when onPlay is given)
function AyahRun({ list, playingAyah, onPlay }) {
  const tr = scoped(useTr());
  return list.map(a => (
    <span key={a.number}
      className={`${styles.ayahSpan} ${playingAyah === a.number ? styles.ayahPlaying : ''} ${onPlay ? styles.ayahClick : ''}`}
      {...(onPlay ? {
        role: 'button', tabIndex: 0,
        onClick: () => onPlay(a.number),
        onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(a.number); } },
        'aria-label': tr('استمع للآية {n}', { n: toAr(a.number) }),
      } : {})}>
      {a.text} <AyahMark n={a.number} />{' '}
    </span>
  ));
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IjazaPage() {
  const tr = scoped(useTr());
  const trc = (key, n, vars) => trCount(tr, key, n, vars);
  const ltr = tr.dir === 'ltr';
  const [tab,        setTabState] = useState(tabFromHash);   // mushaf | qiraat | chain | ijaza
  const [qiraaId,    setQiraaId]  = useState('hafs');
  const [surah,      setSurah]    = useState(1);
  const [ayahs,      setAyahs]    = useState([]);
  const [loading,    setLoading]  = useState(false);
  const [fontSize,   setFontSize] = useState(26);
  const [compare,    setCompare]  = useState(false);
  const [compareId,  setCmpId]    = useState('warsh');
  const navRef = useRef(null);

  function setTab(id, scroll = true) {
    setTabState(id);
    try { window.history.replaceState(null, '', `#${id}`); } catch {}
    if (scroll && navRef.current) {
      const top = navRef.current.getBoundingClientRect().top + window.scrollY - 80;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
    }
  }
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
      setAudioMsg('تعذّر تشغيل الصوت لهذه الآية — تحقق من الاتصال وحاول لاحقاً'); // translated at render
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
      .catch(() => { if (alive) { setLoading(false); setLoadErr('تعذّر تحميل السورة — تحقق من الاتصال'); } }); // message translated at render
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

  // the compared riwaya can't be the active one
  useEffect(() => {
    if (compareId === qiraaId) setCmpId(QIRAAT.find(q => q.id !== qiraaId).id);
  }, [qiraaId, compareId]);

  const activeTextHafs  = textIsHafs(activeQ, fellBack);
  const compareTextHafs = textIsHafs(compareQ, cmpFellBack);

  const hasBasmala = surah !== 1 && surah !== 9;
  const nowLabel = audioError && !isHafsQ(activeQ) ? `${tr(HAFS_AUDIO_LABEL)} — مشاري راشد العفاسي` : audioLabel(activeQ, tr);
  const meta = SURAHS_META[surah - 1];

  function readWith(id) { setQiraaId(id); setTab('mushaf'); }

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('علوم القرآن')}
        title={tr('الإجازة والقراءات')}
        sub={tr('القراءات العشر، وسند الإجازة المتصل برسول الله ﷺ، ومصحف تقرأ فيه بالروايات.')}
      />

      {/* audio lives outside the tabs so its listeners survive switching sections */}
      <audio ref={audioRef} preload="none" onError={handleAudioError} />

      {/* ── section navigation ── */}
      <nav className={styles.secNav} ref={navRef} aria-label={tr('أقسام الصفحة')}>
        <div className={`nq-wrap ${styles.secNavIn}`}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className={`${styles.secLink} ${tab === s.id ? styles.secOn : ''}`}
              aria-current={tab === s.id ? 'page' : undefined}
              onClick={e => { e.preventDefault(); setTab(s.id); }}>
              <Icon name={s.icon} />{tr(s.label)}
            </a>
          ))}
        </div>
      </nav>

      <div className={`nq-wrap ${styles.body}`}>
        {/* ══ مصحف الروايات ══ */}
        {tab === 'mushaf' && (
          <section className={styles.panel} aria-labelledby="sec-mushaf">
            <header className={styles.panelHead}>
              <span className="nq-eyebrow">{tr('اقرأ واستمع وقارن')}</span>
              <h2 id="sec-mushaf" className="nq-h-sec">{tr('مصحف الروايات')}</h2>
            </header>

            <div className={`nq-card ${styles.controls}`}>
              <div className={styles.ctrlBlock}>
                <span className={styles.ctrlLabel}>{tr('الرواية')}</span>
                <div className={styles.chips} role="group" aria-label={tr('اختر الرواية')}>
                  {QIRAAT.map(q => (
                    <button key={q.id} type="button" className={styles.chip} aria-pressed={qiraaId === q.id}
                      onClick={() => setQiraaId(q.id)} title={tr(q.full)}>
                      {tr(q.rawi)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.ctrlRow}>
                <SurahSelector selected={surah} onChange={setSurah} />
                <div className={styles.fontCtrl} role="group" aria-label={tr('حجم الخط')}>
                  <button type="button" onClick={() => setFontSize(f => Math.max(18, f - 2))} aria-label={tr('تصغير الخط')}>{tr('أ−')}</button>
                  <span className="nq-num" aria-live="polite">{toAr(fontSize)}</span>
                  <button type="button" onClick={() => setFontSize(f => Math.min(48, f + 2))} aria-label={tr('تكبير الخط')}>{tr('أ+')}</button>
                </div>
                <button type="button" className={`nq-btn ghost sm ${styles.cmpBtn}`} aria-pressed={compare} onClick={() => setCompare(c => !c)}>
                  <Icon name="list" />{tr('مقارنة روايتين')}
                </button>
              </div>

              {compare && (
                <div className={styles.ctrlBlock}>
                  <span className={styles.ctrlLabel}>{tr('قارن مع')}</span>
                  <div className={styles.chips} role="group" aria-label={tr('الرواية التي تقارن بها')}>
                    {QIRAAT.filter(q => q.id !== qiraaId).map(q => (
                      <button key={q.id} type="button" className={styles.chip} aria-pressed={compareId === q.id}
                        onClick={() => setCmpId(q.id)} title={tr(q.full)}>
                        {tr(q.rawi)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Active qiraa info */}
            <div className={`nq-card ${styles.qInfo}`}>
              <Badge8 icon="scroll" />
              <div className={styles.qInfoMain}>
                <h3>{tr(activeQ.full)}</h3>
                <p>{tr(activeQ.desc)}</p>
              </div>
              <div className={styles.qInfoMeta}>
                <span><Icon name="pin" />{tr(activeQ.region)}</span>
                <span><Icon name="head" />{audioLabel(activeQ, tr)}</span>
              </div>
            </div>

            {/* ─── Text / audio honesty notices ─── */}
            {(activeTextHafs || !isHafsQ(activeQ) || loadErr) && (
              <div className={styles.notices}>
                {activeTextHafs && <Notice icon="book" tone="warn">{tr(HAFS_TEXT_NOTICE)}</Notice>}
                {!isHafsQ(activeQ) && (
                  <Notice icon="head" tone="info">
                    {activeQ.audioNote ? tr(activeQ.audioNote) : withParts(tr('تسجيل رواية {rawi} غير متاح حالياً'), { rawi: <strong>{tr(activeQ.rawi)}</strong> })}
                    {!(activeQ.audioNote || '').includes('بديلة') && tr(' — الصوت المتاح: {label}', { label: tr(HAFS_AUDIO_LABEL) })}
                  </Notice>
                )}
                {loadErr && <Notice icon="x" tone="danger" role="alert">{tr(loadErr)}</Notice>}
              </div>
            )}

            {/* ─── Audio Player Bar ─── */}
            <div className={`nq-card ${styles.audioBar}`}>
              <div className={styles.audioCtrls}>
                <button type="button" className="nq-ibtn" onClick={playPrev} disabled={!playingAyah || playingAyah <= 1} aria-label={tr('الآية السابقة')}><Icon name={ltr ? 'prev' : 'next'} /></button>
                <button type="button" className={styles.playBtn} onClick={togglePlay} aria-label={isPlaying ? tr('إيقاف مؤقت') : tr('تشغيل')}>
                  <Icon name={isPlaying ? 'pause' : 'play'} fill />
                </button>
                <button type="button" className="nq-ibtn" onClick={playNext} disabled={!ayahs.length} aria-label={tr('الآية التالية')}><Icon name={ltr ? 'next' : 'prev'} /></button>
                <button type="button" className={`nq-ibtn ${styles.repeat}`} aria-pressed={autoNext} onClick={() => setAutoNext(v => !v)}
                  aria-label={tr('تشغيل مستمر')} title={tr('تشغيل مستمر')}>
                  <Icon name="repeat" />
                </button>
              </div>
              <div className={styles.audioInfo} aria-live="polite">
                {playingAyah ? (
                  <><b>{tr('الآية {n}', { n: toAr(playingAyah) })}</b><span>{nowLabel}</span></>
                ) : (
                  <><b>{tr('اضغط على أي آية للاستماع')}</b><span>{audioLabel(activeQ, tr)}</span></>
                )}
                {audioMsg && <span className={styles.audioErr} role="alert">{tr(audioMsg)}</span>}
              </div>
            </div>

            {/* Mushaf display */}
            {compare ? (
              <div className={styles.compareGrid}>
                {[[activeQ, activeTextHafs, ayahs, loading, true], [compareQ, compareTextHafs, cmpAyahs, cmpAyahs.length === 0, false]].map(([q, isHafsText, list, busy, playable]) => (
                  <article key={q.id} className={`nq-card ${styles.mushaf}`} aria-label={tr(q.full)}>
                    <header className={styles.colHead}>
                      <b>{tr(q.full)}</b>
                      {isHafsText && <span className={styles.colNote}><Icon name="book" />{tr(HAFS_TEXT_NOTICE)}</span>}
                    </header>
                    {hasBasmala && <div className={styles.basmala} lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>}
                    <div className={styles.mushafText} style={{ fontSize }} lang="ar" dir="rtl">
                      {busy ? <Waiting /> : <AyahRun list={list} playingAyah={playable ? playingAyah : null} onPlay={playable ? playAyah : null} />}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <article className={`nq-card ${styles.mushaf} ${styles.mushafSingle}`} aria-label={`${tr('سورة {name}', { name: surahName(surah, tr.lang) })} — ${tr(activeQ.full)}`}>
                <Corners />
                <header className={styles.surahBand}>
                  <span>{revelationLabel(meta[3], tr.lang)}</span>
                  <b>{tr('سورة {name}', { name: surahName(surah, tr.lang) })}</b>
                  <span>{trc('{n} آية', meta[2], { n: toAr(meta[2]) })}</span>
                </header>
                {hasBasmala && <div className={styles.basmala} lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>}
                <div className={styles.mushafText} style={{ fontSize }} lang="ar" dir="rtl">
                  {loading ? <Waiting /> : <AyahRun list={ayahs} playingAyah={playingAyah} onPlay={playAyah} />}
                </div>
              </article>
            )}
          </section>
        )}

        {/* ══ القراءات العشر ══ */}
        {tab === 'qiraat' && (
          <section className={styles.panel} aria-labelledby="sec-qiraat">
            <header className={styles.panelHead}>
              <span className="nq-eyebrow">{tr('عشرة أئمة، لكل إمام راويان')}</span>
              <h2 id="sec-qiraat" className="nq-h-sec">{tr('القراءات العشر المتواترة')}</h2>
              <p className="nq-lead">{tr('كلها وصلت إلينا بسند صحيح متصل بالنبي ﷺ. السبع الأولى جمعها الإمام الشاطبي في «حرز الأماني»، وأتمّ ابن الجزري العشر في «الدرّة المضيّة».')}</p>
            </header>

            <ol className={styles.imams}>
              {TEN_IMAMS.map(im => {
                const avail = QIRAAT.filter(q => q.imam === im.key);
                return (
                  <li key={im.n} className={`nq-card ${styles.imam}`}>
                    <div className={styles.imamTop}>
                      <Badge8 size={52}>{toAr(im.n)}</Badge8>
                      <div>
                        <h3>{tr(im.imam)}</h3>
                        <span className={styles.imamMeta}><Icon name="pin" />{tr(im.city)} · {tr('تُوفّي سنة {n}هـ', { n: toAr(im.died) })}</span>
                      </div>
                      <span className={`nq-pill ${im.n <= 7 ? 'on' : ''} ${styles.tag}`}>{im.n <= 7 ? tr('من السبع') : tr('المتمّمة للعشر')}</span>
                    </div>
                    <div className={styles.rawis}>
                      <span className={styles.rawiLabel}>{tr('راوياه')}</span>
                      {im.rawis.map(r => <span key={r} className={styles.rawi}>{tr(r)}</span>)}
                    </div>
                    {avail.length > 0 && (
                      <div className={styles.imamActs}>
                        {avail.map(q => (
                          <button key={q.id} type="button" className="nq-btn ghost sm" onClick={() => readWith(q.id)}>
                            <Icon name="book" />{q.full.startsWith('رواية') ? tr('اقرأ برواية {rawi}', { rawi: tr(q.rawi) }) : tr('اقرأ {name}', { name: tr(q.full) })}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            <div className={styles.subHead}>
              <Divider />
              <h2 className={styles.h2}>{tr('الروايات في مصحف الروايات')}</h2>
              <p className={styles.muted}>{tr('ما يتوفّر لكل رواية من نص وتلاوة، بلا مبالغة.')}</p>
            </div>
            <div className={styles.riwayat}>
              {QIRAAT.map(q => (
                <div key={q.id} className={`nq-card ${styles.riwaya}`}>
                  <div className={styles.riwayaHead}>
                    <h3>{tr(q.full)}</h3>
                    <span className={styles.imamMeta}><Icon name="pin" />{tr(q.region)}</span>
                  </div>
                  <p className={styles.riwayaDesc}>{tr(q.desc)}</p>
                  <span className={styles.riwayaLine}><Icon name="head" />{audioLabel(q, tr)}</span>
                  {q.audioNote && <span className={`${styles.riwayaLine} ${styles.warnLine}`}><Icon name="bell" />{tr(q.audioNote)}</span>}
                  {textIsHafs(q, false) && <span className={`${styles.riwayaLine} ${styles.warnLine}`}><Icon name="book" />{tr(HAFS_TEXT_NOTICE)}</span>}
                  <button type="button" className={`nq-btn ghost sm ${styles.readBtn}`} onClick={() => readWith(q.id)}>
                    {tr('اقرأ بهذه الرواية')} <Icon name="back" className={styles.go} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══ سند الإجازة ══ */}
        {tab === 'chain' && (
          <section className={styles.panel} aria-labelledby="sec-chain">
            <header className={styles.panelHead}>
              <span className="nq-eyebrow">{tr('من فم الشيخ إلى أذن الطالب')}</span>
              <h2 id="sec-chain" className="nq-h-sec">{tr('سند الإجازة')}</h2>
              <p className="nq-lead">{tr('الإجازة إذن العالم لطالبه برواية القرآن الكريم، وتمتدّ سلسلة الإسناد متصلة من الطالب إلى النبي ﷺ. هذا هو المسار العام للسند عبر التاريخ:')}</p>
            </header>

            <ol className={styles.chain}>
              {IJAZA_CHAIN.map((node, i) => (
                <li key={node.level} className={`${styles.chainNode} ${i === 0 ? styles.chainTop : ''} ${i === IJAZA_CHAIN.length - 1 ? styles.chainEnd : ''}`}>
                  <span className={styles.chainMark}>
                    {i === 0 ? <Badge8 icon="star" size={60} /> : <Badge8 size={52}>{toAr(node.level)}</Badge8>}
                  </span>
                  <div className={`nq-card ${styles.chainCard}`}>
                    <h3>{tr(node.text)}</h3>
                    <p>{tr(node.desc)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ══ عن الإجازة ══ */}
        {tab === 'ijaza' && (
          <section className={styles.panel} aria-labelledby="sec-ijaza">
            <header className={styles.panelHead}>
              <span className="nq-eyebrow">{tr('حفظ النقل')}</span>
              <h2 id="sec-ijaza" className="nq-h-sec">{tr('عن الإجازة')}</h2>
            </header>
            <article className={`nq-card ${styles.article}`}>
              <Corners />
              <div className={styles.articleIn}>
                <h3><Badge8 icon="shield" size={44} />{tr('أهمية الإجازة')}</h3>
                <p>{tr('الإجازة ضمانٌ لصحة النقل؛ فكل حرف في القرآن وصل إلينا بسندٍ متصل محفوظ، لا يُعتمد فيه إلا على من أخذ بالتلقّي المباشر من فم الشيخ إلى أذن الطالب، وهكذا حُفظ القرآن بإذن الله منذ عهد النبي ﷺ.')}</p>
                <Divider />
                <h3><Badge8 icon="check" size={44} />{tr('شروط الإجازة')}</h3>
                <p>{tr('يُشترط لصحة الإجازة أن يتلو الطالب القرآن كاملاً على الشيخ بالقراءة المُجاز بها، وأن يصحّح الشيخ أخطاءه، وأن يكون الشيخ حاملاً لإجازةٍ متصلةٍ بسندها.')}</p>
                <Divider />
                <h3><Badge8 icon="grid" size={44} />{tr('القراءات السبع والعشر')}</h3>
                <p>{tr('القراءات السبع المتواترة هي قراءات: نافع، وابن كثير، وأبي عمرو، وابن عامر، وعاصم، وحمزة، والكسائي. وأضاف العلماء ثلاثاً لتكتمل العشر: أبو جعفر، ويعقوب، وخلف العاشر.')}</p>
              </div>
            </article>
            <Notice icon="shieldUser" tone="info">{tr('هذه الصفحة للتعريف والقراءة فقط، ولا تمنح إجازة. الإجازة تُنال بالقراءة على شيخٍ مُجازٍ متصل السند.')}</Notice>
            <div className={styles.articleActs}>
              <button type="button" className="nq-btn gold" onClick={() => setTab('mushaf')}><Icon name="book" />{tr('افتح مصحف الروايات')}</button>
              <button type="button" className="nq-btn ghost" onClick={() => setTab('chain')}><Icon name="scroll" />{tr('سند الإجازة')}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Waiting() {
  const tr = scoped(useTr());
  return (
    <div className={styles.waiting} aria-busy="true" aria-label={tr('جارٍ تحميل السورة')}>
      <span /><span /><span /><span />
    </div>
  );
}

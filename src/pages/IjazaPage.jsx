// ─── الإجازة والقراءات ───────────────────────────────────────────────────────
// A mushaf that reads in the twenty riwayat of the ten qira'at: the real text
// of each riwaya where a digital text exists (King Fahd Complex), the real
// recording of each riwaya (mp3quran.net), and honest notices where either is
// missing. Plus the ten imams, the chain of narration (isnad) and the ijaza.
import { useState, useEffect, useRef, useMemo } from 'react';
import { SURAHS_META } from '../data';
import { normalizeArabic } from '../arabic';
import { PageHero, Icon, Badge8, Corners, Divider, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { useTr, surahName, revelationLabel } from '../l10n';
import { scoped, trCount } from '../locales/library';
import { IMAMS, RAWIS, RAWI_BY_ID, HAFS_EDITION, BASMALA, MAGHRIBI_EDITIONS, rawi as rawiOf, isHafs, hasText } from './ijaza/riwayat';
import { loadRiwayaText, loadAudioMap, recitersFor } from './ijaza/sources';
import { diffWords } from './ijaza/wordDiff';
import { recitersLabel } from './ijaza/labels';
import SurahPlayer, { withParts } from './ijaza/SurahPlayer';
import styles from './IjazaPage.module.css';

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

// Hafs keeps per-ayah playback (tap an ayah) from everyayah.com
const HAFS_AYAH_AUDIO = 'Alafasy_128kbps';
const HAFS_AYAH_RECITER = 'مشاري راشد العفاسي';
const ayahAudioUrl = (surah, ayah) => `https://everyayah.com/data/${HAFS_AYAH_AUDIO}/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

const NO_TEXT_NOTICE = 'النص المكتوب لهذه الرواية غير متاح رقمياً بعد؛ المعروض نص رواية حفص، والصوت برواية {rawi}';
const NO_TEXT_NO_AUDIO = 'النص المكتوب لهذه الرواية غير متاح رقمياً بعد؛ المعروض نص رواية حفص';

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

const PREF_RAWI = 'nq_ijaza_rawi';
function initialRawi() {
  try { const v = localStorage.getItem(PREF_RAWI); return RAWI_BY_ID[v] ? v : 'hafs'; } catch { return 'hafs'; }
}

// The edition actually shown for a rawi: its own text, else Hafs
const shownEdition = r => r.textEdition || HAFS_EDITION;
const quranFont = ed => (MAGHRIBI_EDITIONS.has(ed) ? styles.maghribi : '');

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

// «النص ✓» / «التلاوة ✓ (n قارئ)» badges for a rawi (surah given → reciters of that surah)
function RawiBadges({ r, audio, surah }) {
  const tr = scoped(useTr());
  const n = audio.status === 'ready'
    ? (surah ? recitersFor(audio.map, r.audioId, surah).length : (audio.map.rawis[r.audioId] || []).length)
    : null;
  return (
    <span className={styles.badges}>
      <span className={`${styles.badge} ${hasText(r) ? styles.bOn : styles.bOff}`}>
        {hasText(r) ? tr('النص ✓') : tr('النص: حفص')}
      </span>
      <span className={`${styles.badge} ${isHafs(r) || n ? styles.bOn : n === 0 ? styles.bOff : styles.bWait}`}>
        {isHafs(r) ? tr('التلاوة ✓ (آية بآية)')
          : n === null ? (audio.status === 'error' ? tr('التلاوة: ؟') : tr('التلاوة…'))
          : n > 0 ? tr('التلاوة ✓ ({n})', { n: recitersLabel(tr, n) })
          : tr('لا تلاوة')}
      </span>
    </span>
  );
}

// The riwaya picker: ten imams × two rawis
function RawiPicker({ value, onPick, audio, surah, label }) {
  const tr = scoped(useTr());
  return (
    <div className={styles.rawiGrid} role="group" aria-label={label}>
      {IMAMS.map(im => (
        <div key={im.id} className={styles.rawiGroup}>
          <span className={styles.rawiGroupName}><b className="nq-num">{toAr(im.n)}</b>{tr(im.name)}</span>
          {im.rawis.map(id => RAWI_BY_ID[id]).map(r => (
            <button key={r.id} type="button" className={styles.rawiBtn} aria-pressed={value === r.id}
              onClick={() => onPick(r.id)} title={tr(r.full)}>
              <span className={styles.rawiBtnName}>{tr(r.name)}</span>
              <RawiBadges r={r} audio={audio} surah={surah} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// One run of ayahs, each clickable to play (when onPlay is given)
function AyahRun({ list, playingAyah, onPlay }) {
  const tr = scoped(useTr());
  return list.map((text, i) => {
    const n = i + 1;
    return (
      <span key={n}
        className={`${styles.ayahSpan} ${playingAyah === n ? styles.ayahPlaying : ''} ${onPlay ? styles.ayahClick : ''}`}
        {...(onPlay ? {
          role: 'button', tabIndex: 0,
          onClick: () => onPlay(n),
          onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(n); } },
          'aria-label': tr('استمع للآية {n}', { n: toAr(n) }),
        } : {})}>
        {text} <AyahMark n={n} />{' '}
      </span>
    );
  });
}

function DiffText({ words }) {
  return words.map((x, k) => (
    <span key={k}>{x.diff ? <mark className={styles.diffWord}>{x.w}</mark> : x.w}{k < words.length - 1 ? ' ' : ''}</span>
  ));
}

// ─── loading a surah's text for one edition ──────────────────────────────────
function useRiwayaText(edition, surah, enabled = true) {
  const [st, setSt] = useState({ key: '', ayahs: [], error: false });
  const key = `${edition}/${surah}`;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !edition) return;
    let alive = true;
    setSt(s => (s.key === key && !s.error ? s : { key, ayahs: [], error: false }));
    loadRiwayaText(edition, surah)
      .then(ayahs => { if (alive) setSt({ key, ayahs, error: false }); })
      .catch(() => { if (alive) setSt({ key, ayahs: [], error: true }); });
    return () => { alive = false; };
  }, [key, enabled, attempt]);
  const ready = st.key === key;
  return { ayahs: ready ? st.ayahs : [], loading: enabled && (!ready || (!st.error && !st.ayahs.length)), error: ready && st.error, retry: () => setAttempt(a => a + 1) };
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IjazaPage() {
  const tr = scoped(useTr());
  const trc = (key, n, vars) => trCount(tr, key, n, vars);
  const ltr = tr.dir === 'ltr';
  const [tab,        setTabState] = useState(tabFromHash);   // mushaf | qiraat | chain | ijaza
  const [rawiId,     setRawiId]   = useState(initialRawi);
  const [surah,      setSurah]    = useState(1);
  const [fontSize,   setFontSize] = useState(26);
  const [compare,    setCompare]  = useState(false);
  const [compareId,  setCmpId]    = useState('warsh');
  const [audio,      setAudio]    = useState({ status: 'loading', map: null });
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

  // the reciters of every riwaya (mp3quran), once per session
  function fetchAudio(retry = false) {
    setAudio({ status: 'loading', map: null });
    loadAudioMap({ retry })
      .then(map => setAudio({ status: 'ready', map }))
      .catch(() => setAudio({ status: 'error', map: null }));
  }
  useEffect(() => { fetchAudio(); }, []);

  const active  = rawiOf(rawiId);
  const cmp     = rawiOf(compareId);
  const edition = shownEdition(active);
  const text    = useRiwayaText(edition, surah);
  const cmpText = useRiwayaText(shownEdition(cmp), surah, compare);
  const canCompare = hasText(active);

  function pickRawi(id) {
    setRawiId(id);
    try { localStorage.setItem(PREF_RAWI, id); } catch {}
  }
  // the compared riwaya: another one that has a text
  useEffect(() => {
    if (!canCompare && compare) setCompare(false);
    if (compareId === rawiId || !hasText(cmp)) setCmpId((RAWIS.find(r => r.id !== rawiId && hasText(r) && r.id === 'hafs') || RAWIS.find(r => r.id !== rawiId && hasText(r))).id);
  }, [rawiId, compareId, canCompare]);

  // ─── Hafs: per-ayah audio ───────────────────────────────────────────────────
  const [playingAyah, setPlayingAyah] = useState(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [autoNext,    setAutoNext]    = useState(true);
  const [audioMsg,    setAudioMsg]    = useState('');
  const audioRef = useRef(null);
  const total = SURAHS_META[surah - 1][2];

  function playAyah(n) {
    if (!audioRef.current) return;
    setAudioMsg('');
    setPlayingAyah(n);
    setIsPlaying(true);
    audioRef.current.src = ayahAudioUrl(surah, n);
    audioRef.current.play().catch(() => setIsPlaying(false));
  }
  function handleAudioError() {
    if (!audioRef.current || !playingAyah) { setIsPlaying(false); return; }
    audioRef.current.pause();
    setIsPlaying(false);
    setAudioMsg('تعذّر تشغيل الصوت لهذه الآية — تحقق من الاتصال وحاول لاحقاً'); // translated at render
  }
  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else if (playingAyah) { audioRef.current.play().catch(() => {}); setIsPlaying(true); }
    else playAyah(1);
  }
  function playNext() {
    const next = playingAyah ? playingAyah + 1 : 1;
    if (next > total) { setIsPlaying(false); setPlayingAyah(null); return; }
    playAyah(next);
  }
  function playPrev() { if (playingAyah > 1) playAyah(playingAyah - 1); }

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      const next = (playingAyah || 0) + 1;
      if (autoNext && next <= total) playAyah(next);
      else { setIsPlaying(false); if (next > total) setPlayingAyah(null); }
    };
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [playingAyah, autoNext, total, surah]);

  // stop the per-ayah audio when the surah or riwaya changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setPlayingAyah(null);
    setAudioMsg('');
  }, [surah, rawiId]);

  const hafsActive = isHafs(active);
  const anyAudio = audio.status !== 'ready' || (audio.map.rawis[active.audioId] || []).length > 0;
  const hasBasmala = surah !== 1 && surah !== 9;
  const meta = SURAHS_META[surah - 1];

  const diffs = useMemo(() => {
    if (!compare || text.ayahs.length !== total || cmpText.ayahs.length !== total) return null;
    const rows = text.ayahs.map((t, i) => diffWords(t, cmpText.ayahs[i]));
    return { rows, count: rows.reduce((s, d) => s + d.count, 0), ayahs: rows.filter(d => d.count).length };
  }, [compare, text.ayahs, cmpText.ayahs, total]);

  function readWith(id) { pickRawi(id); setTab('mushaf'); }

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('علوم القرآن')}
        title={tr('الإجازة والقراءات')}
        sub={tr('القراءات العشر، وسند الإجازة المتصل برسول الله ﷺ، ومصحف تقرأ فيه بالروايات.')}
      />

      {/* per-ayah audio (Hafs) lives outside the tabs so its listeners survive switching sections */}
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
                <RawiPicker value={rawiId} onPick={pickRawi} audio={audio} surah={surah} label={tr('اختر الرواية')} />
              </div>

              <div className={styles.ctrlRow}>
                <SurahSelector selected={surah} onChange={setSurah} />
                <div className={styles.fontCtrl} role="group" aria-label={tr('حجم الخط')}>
                  <button type="button" onClick={() => setFontSize(f => Math.max(18, f - 2))} aria-label={tr('تصغير الخط')}>{tr('أ−')}</button>
                  <span className="nq-num" aria-live="polite">{toAr(fontSize)}</span>
                  <button type="button" onClick={() => setFontSize(f => Math.min(48, f + 2))} aria-label={tr('تكبير الخط')}>{tr('أ+')}</button>
                </div>
                <button type="button" className={`nq-btn ghost sm ${styles.cmpBtn}`} aria-pressed={compare} disabled={!canCompare}
                  title={canCompare ? undefined : tr('المقارنة متاحة بين الروايات التي لها نص مكتوب فقط')}
                  onClick={() => setCompare(c => !c)}>
                  <Icon name="list" />{tr('مقارنة روايتين')}
                </button>
              </div>

              {compare && (
                <div className={styles.ctrlBlock}>
                  <span className={styles.ctrlLabel}>{tr('قارن مع')} · {tr('المقارنة متاحة بين الروايات التي لها نص مكتوب فقط')}</span>
                  <div className={styles.chips} role="group" aria-label={tr('الرواية التي تقارن بها')}>
                    {RAWIS.filter(r => r.id !== rawiId && hasText(r)).map(r => (
                      <button key={r.id} type="button" className={styles.chip} aria-pressed={compareId === r.id}
                        onClick={() => setCmpId(r.id)} title={tr(r.full)}>
                        {tr(r.full)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Active riwaya info */}
            <div className={`nq-card ${styles.qInfo}`}>
              <Badge8 icon="scroll" />
              <div className={styles.qInfoMain}>
                <h3>{tr(active.full)}</h3>
                <p>{tr(active.desc)}</p>
              </div>
              <div className={styles.qInfoMeta}>
                <span><Icon name="pin" />{tr(active.region)}</span>
                <span><Icon name="book" />{hasText(active) ? tr('نص الرواية: مجمع الملك فهد لطباعة المصحف الشريف') : tr('النص المعروض: رواية حفص')}</span>
                <span><Icon name="head" />{hafsActive ? HAFS_AYAH_RECITER : tr('التلاوة: mp3quran.net')}</span>
              </div>
            </div>

            {/* ─── Text / audio honesty notices ─── */}
            {(!hasText(active) || text.error || !hafsActive) && (
              <div className={styles.notices}>
                {!hasText(active) && (
                  <Notice icon="book" tone="warn">
                    {anyAudio
                      ? withParts(tr(NO_TEXT_NOTICE), { rawi: <strong>{tr(active.name)}</strong> })
                      : tr(NO_TEXT_NO_AUDIO)}
                  </Notice>
                )}
                {!hafsActive && (
                  <Notice icon="head" tone="info">{tr('تُعرض الآيات نصاً مكتوباً، والتلاوة للسورة كاملة دون تتبّع الآيات.')}</Notice>
                )}
                {text.error && (
                  <Notice icon="x" tone="danger" role="alert">
                    {tr('تعذّر تحميل السورة — تحقق من الاتصال')}{' '}
                    <button type="button" className={styles.linkBtn} onClick={text.retry}>{tr('إعادة المحاولة')}</button>
                  </Notice>
                )}
              </div>
            )}

            {/* ─── Audio ─── */}
            {hafsActive ? (
              <div className={`nq-card ${styles.audioBar}`}>
                <div className={styles.audioCtrls}>
                  <button type="button" className="nq-ibtn" onClick={playPrev} disabled={!playingAyah || playingAyah <= 1} aria-label={tr('الآية السابقة')}><Icon name={ltr ? 'prev' : 'next'} /></button>
                  <button type="button" className={styles.playBtn} onClick={togglePlay} aria-label={isPlaying ? tr('إيقاف مؤقت') : tr('تشغيل')}>
                    <Icon name={isPlaying ? 'pause' : 'play'} fill />
                  </button>
                  <button type="button" className="nq-ibtn" onClick={playNext} disabled={!text.ayahs.length} aria-label={tr('الآية التالية')}><Icon name={ltr ? 'next' : 'prev'} /></button>
                  <button type="button" className={`nq-ibtn ${styles.repeat}`} aria-pressed={autoNext} onClick={() => setAutoNext(v => !v)}
                    aria-label={tr('تشغيل مستمر')} title={tr('تشغيل مستمر')}>
                    <Icon name="repeat" />
                  </button>
                </div>
                <div className={styles.audioInfo} aria-live="polite">
                  <b>{playingAyah ? tr('الآية {n}', { n: toAr(playingAyah) }) : tr('اضغط على أي آية للاستماع')}</b>
                  <span>{HAFS_AYAH_RECITER}</span>
                  {audioMsg && <span className={styles.audioErr} role="alert">{tr(audioMsg)}</span>}
                </div>
              </div>
            ) : (
              <SurahPlayer key={active.id} rawi={active} surah={surah} onSurah={setSurah} audio={audio}
                onRetry={() => fetchAudio(true)} onPickRawi={pickRawi} />
            )}

            {/* Mushaf display */}
            {compare && canCompare ? (
              <article className={`nq-card ${styles.mushaf} ${styles.compare}`} aria-label={`${tr(active.full)} / ${tr(cmp.full)}`}>
                <header className={styles.cmpHead}>
                  <b>{tr(active.full)}</b>
                  <span className={styles.cmpVs}>{tr('مقابل')}</span>
                  <b>{tr(cmp.full)}</b>
                </header>
                <p className={styles.cmpLegend}>
                  <mark className={styles.diffWord}>{tr('كلمة')}</mark>{' '}
                  {tr('الكلمات المظلّلة يختلف رسمها أو ضبطها بين النصّين، وبعض ذلك من اصطلاح كتابة كل مصحف لا من اختلاف النطق.')}
                  {diffs && <> {tr('عدد الكلمات المختلفة في هذه السورة: {n} (في {a} من آياتها).', { n: toAr(diffs.count), a: toAr(diffs.ayahs) })}</>}
                </p>
                {!diffs ? (
                  (text.error || cmpText.error)
                    ? <Notice icon="x" tone="danger" role="alert">{tr('تعذّر تحميل السورة — تحقق من الاتصال')}</Notice>
                    : <Waiting />
                ) : (
                  <ol className={styles.cmpRows} style={{ fontSize }}>
                    {diffs.rows.map((d, i) => (
                      <li key={i} className={`${styles.cmpRow} ${d.count ? styles.cmpRowDiff : ''}`}>
                        <div className={`${styles.cmpCell} ${quranFont(edition)}`} lang="ar" dir="rtl">
                          <span className={styles.cmpTag}>{tr(active.name)}</span>
                          <DiffText words={d.a} /> <AyahMark n={i + 1} />
                        </div>
                        <div className={`${styles.cmpCell} ${quranFont(shownEdition(cmp))}`} lang="ar" dir="rtl">
                          <span className={styles.cmpTag}>{tr(cmp.name)}</span>
                          <DiffText words={d.b} /> <AyahMark n={i + 1} />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            ) : (
              <article className={`nq-card ${styles.mushaf} ${styles.mushafSingle}`} aria-label={`${tr('سورة {name}', { name: surahName(surah, tr.lang) })} — ${tr(active.full)}`}>
                <Corners />
                <header className={styles.surahBand}>
                  <span>{revelationLabel(meta[3], tr.lang)}</span>
                  <b>{tr('سورة {name}', { name: surahName(surah, tr.lang) })}</b>
                  <span>{trc('{n} آية', meta[2], { n: toAr(meta[2]) })}</span>
                </header>
                {hasBasmala && <div className={`${styles.basmala} ${quranFont(edition)}`} lang="ar" dir="rtl">{BASMALA[edition]}</div>}
                <div className={`${styles.mushafText} ${quranFont(edition)}`} style={{ fontSize }} lang="ar" dir="rtl">
                  {text.loading ? <Waiting /> : <AyahRun list={text.ayahs} playingAyah={hafsActive ? playingAyah : null} onPlay={hafsActive ? playAyah : null} />}
                </div>
              </article>
            )}
            <p className={styles.sources}>
              {tr('المصادر: نصوص الروايات من مجمع الملك فهد لطباعة المصحف الشريف (عبر مشروع quran-api)، والتلاوات من mp3quran.net، وتلاوة حفص آيةً آية من everyayah.com.')}
            </p>
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
              {IMAMS.map(im => (
                <li key={im.n} className={`nq-card ${styles.imam}`}>
                  <div className={styles.imamTop}>
                    <Badge8 size={52}>{toAr(im.n)}</Badge8>
                    <div>
                      <h3>{tr(im.name)}</h3>
                      <span className={styles.imamMeta}><Icon name="pin" />{tr(im.city)} · {tr('تُوفّي سنة {n}هـ', { n: toAr(im.died) })}</span>
                    </div>
                    <span className={`nq-pill ${im.n <= 7 ? 'on' : ''} ${styles.tag}`}>{im.n <= 7 ? tr('من السبع') : tr('المتمّمة للعشر')}</span>
                  </div>
                  <div className={styles.rawis}>
                    <span className={styles.rawiLabel}>{tr('راوياه')}</span>
                    {im.rawis.map(id => <span key={id} className={styles.rawi}>{tr(RAWI_BY_ID[id].name)}</span>)}
                  </div>
                  <div className={styles.imamActs}>
                    {im.rawis.map(id => (
                      <button key={id} type="button" className="nq-btn ghost sm" onClick={() => readWith(id)}>
                        <Icon name="book" />{tr('اقرأ برواية {rawi}', { rawi: tr(RAWI_BY_ID[id].name) })}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>

            <div className={styles.subHead}>
              <Divider />
              <h2 className={styles.h2}>{tr('الروايات في مصحف الروايات')}</h2>
              <p className={styles.muted}>{tr('ما يتوفّر لكل رواية من نص وتلاوة، بلا مبالغة.')}</p>
            </div>
            <div className={styles.riwayat}>
              {RAWIS.map(r => {
                const n = audio.status === 'ready' ? (audio.map.rawis[r.audioId] || []).length : null;
                return (
                  <div key={r.id} className={`nq-card ${styles.riwaya}`}>
                    <div className={styles.riwayaHead}>
                      <h3>{tr(r.full)}</h3>
                      <span className={styles.imamMeta}><Icon name="pin" />{tr(r.region)}</span>
                    </div>
                    <p className={styles.riwayaDesc}>{tr(r.desc)}</p>
                    <span className={`${styles.riwayaLine} ${hasText(r) ? '' : styles.warnLine}`}>
                      <Icon name="book" />{hasText(r) ? tr('نص الرواية متاح (مجمع الملك فهد)') : tr(NO_TEXT_NO_AUDIO)}
                    </span>
                    <span className={`${styles.riwayaLine} ${isHafs(r) || n ? '' : n === 0 ? styles.warnLine : ''}`}>
                      <Icon name="head" />
                      {isHafs(r) ? tr('تلاوة آيةً آية: {name}', { name: HAFS_AYAH_RECITER })
                        : n === null ? (audio.status === 'error' ? tr('تعذّر تحميل قائمة القرّاء — تحقق من الاتصال') : tr('جارٍ تحميل قائمة القرّاء…'))
                        : n > 0 ? tr('تلاوة السورة كاملة: {n}', { n: recitersLabel(tr, n) })
                        : tr('لا توجد تلاوة مسجّلة متاحة لهذه الرواية حالياً')}
                    </span>
                    <button type="button" className={`nq-btn ghost sm ${styles.readBtn}`} onClick={() => readWith(r.id)}>
                      {tr('اقرأ بهذه الرواية')} <Icon name="back" className={styles.go} />
                    </button>
                  </div>
                );
              })}
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

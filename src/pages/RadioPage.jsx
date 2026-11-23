// ─── Radio ───────────────────────────────────────────────────────────────────
// Verified HTTPS stations from the open Radio Browser directory, grouped by
// category; station cards show their play state and a now-playing bar stays
// at the bottom of the screen while a station is on.
import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './RadioPage.module.css';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';
import { useTr, intlLocale } from '../l10n';
import { getLang } from '../i18n';

// ── Radio Browser API — قاعدة بيانات مفتوحة بمحطات متحقق منها ──────────────
const RB = 'https://de1.api.radio-browser.info/json/stations/search';

// ── هل يستطيع المتصفح تشغيل هذه المحطة؟ ─────────────────────────────────────
let _probe = null;
function canPlayMime(mime) {
  try {
    if (!_probe) _probe = document.createElement('audio');
    return !!(_probe.canPlayType && _probe.canPlayType(mime));
  } catch { return true; }
}
const CODEC_MIME = {
  'MP3':      ['audio/mpeg'],
  'AAC':      ['audio/aac', 'audio/mp4; codecs="mp4a.40.2"'],
  'AAC+':     ['audio/aac', 'audio/mp4; codecs="mp4a.40.5"', 'audio/mp4; codecs="mp4a.40.2"'],
  'HE-AAC':   ['audio/aac', 'audio/mp4; codecs="mp4a.40.5"', 'audio/mp4; codecs="mp4a.40.2"'],
  'OGG':      ['audio/ogg', 'audio/ogg; codecs="vorbis"'],
  'VORBIS':   ['audio/ogg; codecs="vorbis"'],
  'OPUS':     ['audio/ogg; codecs="opus"', 'audio/webm; codecs="opus"'],
  'FLAC':     ['audio/flac', 'audio/ogg; codecs="flac"'],
};
function browserCanPlay(s) {
  const url = (s.url_resolved || '').toLowerCase();
  const isHls = s.hls === 1 || /\.m3u8(\?|$)/.test(url);
  if (isHls) return canPlayMime('application/vnd.apple.mpegurl');
  const codec = String(s.codec || '').toUpperCase().trim();
  const mimes = CODEC_MIME[codec];
  if (!mimes) return true; // UNKNOWN / غير مذكور — نجرّب
  return mimes.some(canPlayMime);
}

async function rbSearch(params) {
  const servers = [
    'https://de1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
  ];
  const q = new URLSearchParams({
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true',
    is_https: 'true',   // HTTPS only — أمان
    ...params,
  }).toString();

  for (const server of servers) {
    try {
      // ملاحظة: المتصفح يمنع تعديل User-Agent، لذا لا نرسله
      const res = await fetch(`${server}/json/stations/search?${q}`);
      if (!res.ok) continue;
      const data = await res.json();
      // فقط اللي عنده URL وتم التحقق منه ويستطيع المتصفح تشغيله
      return data.filter(s =>
        s.url_resolved &&
        s.lastcheckok === 1 &&
        s.url_resolved.startsWith('https') &&
        browserCanPlay(s)
      );
    } catch { continue; }
  }
  return [];
}

// ── الفئات ────────────────────────────────────────────────────────────────────
const CATS = [
  { id: 'all',       label: 'الكل',          icon: 'radio'  },
  { id: 'quran',     label: 'القرآن الكريم', icon: 'book'   },
  { id: 'religious', label: 'برامج دينية',   icon: 'mosque' },
  { id: 'anasheed',  label: 'أناشيد',        icon: 'head'   },
];

// ── البحث الخاص بكل فئة ───────────────────────────────────────────────────────
const CAT_QUERIES = {
  quran: [
    { tag: 'quran',        limit: 25 },
    { tag: 'al quran',     limit: 10 },
    { tag: 'holy quran',   limit: 10 },
    { name: 'quran',       limit: 15 },
  ],
  religious: [
    { tag: 'islamic',      limit: 20 },
    { tag: 'islam',        limit: 20 },
    { tag: 'hadith',       limit: 10 },
    { name: 'islamweb',    limit: 5  },
    { name: 'sunnah',      limit: 5  },
  ],
  anasheed: [
    { tag: 'nasheed',      limit: 20 },
    { tag: 'anasheed',     limit: 15 },
    { tag: 'islamic music',limit: 10 },
    { name: 'nasheed',     limit: 10 },
  ],
};

// Country names in the interface language (cached per language)
const _regions = {};
function countryName(code, fallback, lang = getLang()) {
  if (!code || code.length !== 2) return fallback || '';
  try {
    if (!_regions[lang]) _regions[lang] = new Intl.DisplayNames([lang === 'ar' ? 'ar' : intlLocale(lang)], { type: 'region' });
    return _regions[lang].of(code.toUpperCase()) || fallback || code;
  } catch { return fallback || code; }
}

function rbToStation(s, cat) {
  const catConf = CATS.find(c => c.id === cat);
  const country = countryName(s.countrycode, s.country);
  return {
    id: s.stationuuid,
    cat,
    cc: s.countrycode || '',
    countryRaw: s.country || '',
    name: (s.name || 'Islamic Radio').trim().slice(0, 50),
    country,
    desc: [s.country, s.language].filter(Boolean).slice(0, 2).join(' · ') || 'Islamic Radio',
    lang: String(s.language || '').split(',')[0].trim(),
    icon:  catConf?.icon  || 'radio',
    catLabel: catConf?.label || '',
    url: s.url_resolved,
    votes: s.votes || 0,
    bitrate: s.bitrate || 0,
  };
}

const LANGS_AR = { arabic: 'العربية', english: 'الإنجليزية', turkish: 'التركية', urdu: 'الأردية', french: 'الفرنسية', indonesian: 'الإندونيسية', malay: 'الملايوية', persian: 'الفارسية', bengali: 'البنغالية', german: 'الألمانية' };
// Radio Browser gives language names in English: map them to ISO codes for Intl.DisplayNames
const LANG_CODES = { arabic: 'ar', english: 'en', turkish: 'tr', urdu: 'ur', french: 'fr', indonesian: 'id', malay: 'ms', persian: 'fa', bengali: 'bn', german: 'de', spanish: 'es', russian: 'ru', hindi: 'hi', somali: 'so', swahili: 'sw', hausa: 'ha', pashto: 'ps', kurdish: 'ku', albanian: 'sq', bosnian: 'bs', dutch: 'nl', italian: 'it' };
const _langNames = {};
function langName(raw, lang = getLang()) {
  const k = String(raw || '').toLowerCase();
  if (lang === 'ar') return LANGS_AR[k] || raw;
  const code = LANG_CODES[k];
  if (!code) return raw;
  try {
    if (!_langNames[lang]) _langNames[lang] = new Intl.DisplayNames([intlLocale(lang)], { type: 'language' });
    const n = _langNames[lang].of(code);
    return n ? n.charAt(0).toLocaleUpperCase(intlLocale(lang)) + n.slice(1) : raw;
  } catch { return raw; }
}

function fmtTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const p = n => String(n).padStart(2, '0');
  return toAr(h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`);
}

export default function RadioPage() {
  const tr = useTr();
  const [cat,      setCat]      = useState('all');
  const [stations, setStations] = useState({ quran: [], religious: [], anasheed: [] });
  const [fetching, setFetching] = useState({ quran: false, religious: false, anasheed: false });
  const [loaded,   setLoaded]   = useState({ quran: false, religious: false, anasheed: false });
  const [playing,  setPlaying]  = useState(null);
  const [audioErr, setAudioErr] = useState('');
  const [buffering,setBuffering]= useState(false);
  const [volume,   setVolume]   = useState(0.8);
  const [muted,    setMuted]    = useState(false);
  const [elapsed,  setElapsed]  = useState(0);
  const [search,   setSearch]   = useState('');
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const stoppedRef = useRef(true);           // إيقاف مقصود — لا نعرض خطأ
  const loadStateRef = useRef({});           // catId → 'fetching' | 'done' (يمنع التحميل المكرر)

  // ── Load category stations on demand ────────────────────────────────────────
  const loadCat = useCallback(async (catId) => {
    if (catId === 'all' || loadStateRef.current[catId]) return;
    loadStateRef.current[catId] = 'fetching';
    setFetching(f => ({ ...f, [catId]: true }));

    const queries = CAT_QUERIES[catId] || [];
    const seen = new Set();
    const results = [];

    for (const q of queries) {
      const data = await rbSearch({ limit: q.limit, ...(q.tag ? { tag: q.tag } : { name: q.name }) });
      for (const s of data) {
        if (!seen.has(s.stationuuid)) {
          seen.add(s.stationuuid);
          results.push(rbToStation(s, catId));
        }
      }
    }

    // Sort by votes desc
    results.sort((a, b) => b.votes - a.votes);

    loadStateRef.current[catId] = 'done';
    setStations(prev => ({ ...prev, [catId]: results }));
    setLoaded(prev => ({ ...prev, [catId]: true }));
    setFetching(f => ({ ...f, [catId]: false }));
  }, []);

  // Load when cat changes (also runs on mount)
  useEffect(() => {
    if (cat !== 'all') loadCat(cat);
    else {
      loadCat('quran');
      loadCat('religious');
      loadCat('anasheed');
    }
  }, [cat]);

  // ── Audio setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;

    audio.addEventListener('playing', () => {
      setBuffering(false); setAudioErr('');
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    });
    audio.addEventListener('waiting', () => setBuffering(true));
    audio.addEventListener('stalled', () => setBuffering(true));
    audio.addEventListener('error', () => {
      // تجاهل الخطأ الناتج عن الإيقاف المقصود أو إزالة المصدر
      if (stoppedRef.current || !audio.getAttribute('src')) return;
      setAudioErr('تعذّر الاتصال بهذه المحطة، جرّب محطة أخرى');
      setBuffering(false);
      setPlaying(null);
      clearInterval(timerRef.current);
    });

    return () => {
      stoppedRef.current = true;
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch {}
      clearInterval(timerRef.current);
    };
  }, []);

  // إيقاف البث بدون إطلاق حدث error
  function silence(audio) {
    stoppedRef.current = true;
    audio.pause();
    audio.removeAttribute('src');
    try { audio.load(); } catch {}
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // ── Play ─────────────────────────────────────────────────────────────────────
  function playStation(station) {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing === station.id) {
      silence(audio);
      clearInterval(timerRef.current);
      setPlaying(null); setBuffering(false); setElapsed(0);
      return;
    }

    setAudioErr(''); setElapsed(0); setBuffering(true);
    setPlaying(station.id);
    clearInterval(timerRef.current);
    audio.pause();
    stoppedRef.current = false;
    audio.src = station.url;
    audio.volume = muted ? 0 : volume;
    audio.load();
    const url = station.url;
    audio.play().catch(err => {
      // AbortError: تم تبديل المحطة أو إيقافها قبل بدء التشغيل — ليس خطأ
      if (err && err.name === 'AbortError') return;
      if (stoppedRef.current || audio.getAttribute('src') !== url) return;
      setAudioErr('تعذّر تشغيل هذه المحطة، جرّب محطة أخرى');
      setBuffering(false); setPlaying(null);
    });
  }

  function stop() {
    const audio = audioRef.current;
    if (!audio) return;
    silence(audio);
    clearInterval(timerRef.current);
    setPlaying(null); setBuffering(false); setElapsed(0); setAudioErr('');
  }

  // ── Filtered stations ────────────────────────────────────────────────────────
  // نفس المحطة قد تظهر في أكثر من فئة — نزيل التكرار
  const allSt = (() => {
    const seen = new Set();
    return [...stations.quran, ...stations.religious, ...stations.anasheed]
      .filter(s => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  })();
  const catLoaded = cat === 'all'
    ? (loaded.quran && loaded.religious && loaded.anasheed)
    : loaded[cat];

  // station country in the interface language (stations are fetched once, the language can change)
  const countryOf = s => countryName(s.cc, s.countryRaw, tr.lang) || s.country;
  const displayed = (cat === 'all' ? allSt : stations[cat] || [])
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.toLowerCase().includes(search.toLowerCase()) || (s.country || '').includes(search.trim()) ||
      countryOf(s).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
      (s.lang && langName(s.lang, tr.lang).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));

  const currentStation = allSt.find(s => s.id === playing);
  const isAnyFetching = Object.values(fetching).some(Boolean);

  const catCount = id => id === 'all' ? allSt.length : (stations[id] || []).length;

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('بثّ مباشر')}
        title={tr('الإذاعة')}
        sub={tr('إذاعات القرآن الكريم والبرامج الإسلامية والأناشيد من حول العالم. نعرض المحطات المتحقَّق من عملها فقط.')}
      />

      <div className={`nq-wrap ${styles.wrap}`}>
        <div className={styles.tools}>
          <div className={`nq-seg ${styles.cats}`} role="group" aria-label={tr('فئات المحطات')}>
            {CATS.map(c => (
              <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                <Icon name={c.icon} />{tr(c.label)}
                {(c.id === 'all' ? catLoaded : loaded[c.id]) && <small className="nq-num">{toAr(catCount(c.id))}</small>}
              </button>
            ))}
          </div>
          <label className={`nq-input ${styles.search}`}>
            <Icon name="search" />
            <span className="nq-sr">{tr('ابحث في المحطات')}</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('ابحث باسم المحطة أو البلد أو اللغة…')} dir={tr.dir} type="search" />
            {search && <button type="button" className={styles.clear} onClick={() => setSearch('')} aria-label={tr('مسح البحث')}><Icon name="x" /></button>}
          </label>
        </div>

        {audioErr && <div className={styles.error} role="alert"><Icon name="x" />{tr(audioErr)}</div>}

        {isAnyFetching && (
          <div className={styles.fetching} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>{tr('جارٍ تحميل المحطات المتحقَّق منها…')}</span>
          </div>
        )}

        {!isAnyFetching && displayed.length === 0 && catLoaded && (
          <div className={`nq-card ${styles.empty}`}>
            <Badge8 icon="radio" size={64} />
            <p>{search ? tr('لا توجد محطات مطابقة لبحثك.') : tr('لا توجد محطات في هذه الفئة حالياً. حاول لاحقاً.')}</p>
            {search && <button type="button" className="nq-btn ghost sm" onClick={() => setSearch('')}>{tr('مسح البحث')}</button>}
          </div>
        )}

        {displayed.length > 0 && (
          <ul className={styles.grid}>
            {displayed.map(st => {
              const isOn = playing === st.id;
              const isLoading = isOn && buffering;
              const country = countryOf(st);
              return (
                <li key={st.id}>
                  <button type="button" className={`nq-card ${styles.card} ${isOn ? styles.cardOn : ''}`}
                    onClick={() => playStation(st)} aria-pressed={isOn}
                    aria-label={country
                      ? tr(isOn ? 'إيقاف {name}، {country}' : 'تشغيل {name}، {country}', { name: st.name, country })
                      : tr(isOn ? 'إيقاف {name}' : 'تشغيل {name}', { name: st.name })}>
                    <span className={styles.cardHead}>
                      <Badge8 icon={st.icon} size={46} />
                      {isOn && !isLoading && <span className={styles.wave} aria-hidden="true"><i /><i /><i /><i /></span>}
                      {isLoading && <span className={styles.spinner} aria-hidden="true" />}
                    </span>
                    <span className={styles.name} dir="auto">{st.name}</span>
                    <span className={styles.desc}>
                      {country && <span><Icon name="globe" />{country}</span>}
                      {st.lang && <span>{langName(st.lang, tr.lang)}</span>}
                    </span>
                    <span className={styles.cardFoot}>
                      <span className={styles.tags}>
                        {cat === 'all' && st.catLabel && <span className="nq-pill">{tr(st.catLabel)}</span>}
                        {st.bitrate > 0 && <span className="nq-pill nq-num">{tr('{n} ك.ب/ث', { n: toAr(st.bitrate) })}</span>}
                      </span>
                      <span className={`${styles.play} ${isOn ? styles.playOn : ''}`} aria-hidden="true">
                        <Icon name={isOn ? 'pause' : 'play'} fill />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.note}><Icon name="shield" />{tr('المحطات من دليل Radio Browser المفتوح، ونعرض فقط المحطات الآمنة (HTTPS) التي تعمل في متصفحك.')}</p>

        {playing && currentStation && (
          <div className={`nq-card ${styles.np}`} role="region" aria-label={tr('المحطة قيد التشغيل')}>
            <span className={styles.npIcon}>
              {buffering ? <span className={styles.spinner} aria-hidden="true" /> : <Badge8 icon={currentStation.icon} size={50} />}
            </span>
            <span className={styles.npInfo}>
              <span className={styles.live} aria-live="polite">
                <i className={buffering ? styles.dotWait : styles.dot} aria-hidden="true" />
                {buffering ? tr('جارٍ الاتصال…') : tr('يبث الآن')}
                {!buffering && <b className="nq-num">{fmtTime(elapsed)}</b>}
              </span>
              <span className={styles.npName} dir="auto">{currentStation.name}</span>
              {currentStation.country && <span className={styles.npDesc}>{countryOf(currentStation)}</span>}
            </span>
            <span className={styles.vol}>
              <button type="button" className="nq-ibtn" onClick={() => setMuted(m => !m)} aria-pressed={muted}
                aria-label={muted ? tr('إلغاء كتم الصوت') : tr('كتم الصوت')}>
                <Icon name={muted ? 'x' : 'head'} />
              </button>
              <input type="range" min="0" max="1" step="0.05" aria-label={tr('مستوى الصوت')}
                value={muted ? 0 : volume} className={styles.slider} style={{ '--v': `${(muted ? 0 : volume) * 100}%` }}
                onChange={e => { setVolume(+e.target.value); setMuted(false); }} />
              <span className={`${styles.volVal} nq-num`}>{tr('{n}٪', { n: toAr(Math.round((muted ? 0 : volume) * 100)) })}</span>
            </span>
            <button type="button" className={styles.stop} onClick={stop} aria-label={tr('إيقاف البث')}>
              <Icon name="pause" fill />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

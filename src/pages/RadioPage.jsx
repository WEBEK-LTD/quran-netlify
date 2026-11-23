import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styles from './RadioPage.module.css';

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
  { id: 'all',       label: 'الكل',          icon: '📻', color: '#94a3b8' },
  { id: 'quran',     label: 'القرآن الكريم', icon: '📖', color: '#52b788' },
  { id: 'religious', label: 'برامج دينية',   icon: '🕌', color: '#8b5cf6' },
  { id: 'anasheed',  label: 'أناشيد',        icon: '🎵', color: '#f97316' },
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

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  try {
    return code.toUpperCase().replace(/./g, c =>
      String.fromCodePoint(c.charCodeAt(0) + 127397)
    );
  } catch { return '🌍'; }
}

function rbToStation(s, cat) {
  const catConf = CATS.find(c => c.id === cat);
  return {
    id: s.stationuuid,
    cat,
    name: (s.name || 'Islamic Radio').trim().slice(0, 50),
    country: countryFlag(s.countrycode),
    desc: [s.country, s.language].filter(Boolean).slice(0, 2).join(' · ') || 'Islamic Radio',
    color: catConf?.color || '#c9a84c',
    icon:  catConf?.icon  || '📻',
    url: s.url_resolved,
    votes: s.votes || 0,
    bitrate: s.bitrate || 0,
  };
}

function toAr(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${toAr(String(m).padStart(2,'0'))}:${toAr(String(sec).padStart(2,'0'))}`;
}

export default function RadioPage() {
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
      setAudioErr('تعذّر الاتصال بهذه المحطة — جرّب محطة أخرى');
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
      setAudioErr('تعذّر تشغيل المحطة — جرّب محطة أخرى');
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

  const displayed = (cat === 'all' ? allSt : stations[cat] || [])
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.toLowerCase().includes(search.toLowerCase()));

  const currentStation = allSt.find(s => s.id === playing);
  const isAnyFetching = Object.values(fetching).some(Boolean);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>← رجوع</Link>
        <h1 className={styles.pageTitle}>📻 الراديو الإسلامي</h1>
        <div style={{ width: 70 }} />
      </div>

      {/* Now Playing */}
      {playing && currentStation && (
        <div className={styles.nowPlaying} style={{ '--c': currentStation.color }}>
          <div className={styles.npGlow} />
          <div className={styles.npIconWrap}>
            {buffering
              ? <div className={styles.npSpinner} />
              : <span className={styles.npIcon}>{currentStation.icon}</span>}
          </div>
          <div className={styles.npInfo}>
            <div className={styles.npLive}>{buffering ? '⏳ جاري الاتصال...' : '🔴 يبث الآن'}</div>
            <div className={styles.npName}>{currentStation.name}</div>
            <div className={styles.npDesc}>{currentStation.desc}</div>
          </div>
          <div className={styles.npRight}>
            <div className={styles.npTime}>{fmtTime(elapsed)}</div>
            <button className={styles.npStop} onClick={stop}>⏹</button>
          </div>
        </div>
      )}

      {audioErr && <div className={styles.errorMsg}>⚠️ {audioErr}</div>}

      {/* Volume */}
      <div className={styles.volRow}>
        <button className={styles.muteBtn} onClick={() => setMuted(m => !m)}>
          {muted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
        </button>
        <input type="range" min="0" max="1" step="0.05"
          value={muted ? 0 : volume} className={styles.volSlider}
          onChange={e => { setVolume(+e.target.value); setMuted(false); }} />
        <span className={styles.volVal}>{Math.round((muted ? 0 : volume) * 100)}%</span>
      </div>

      {/* Search + Cats */}
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input className={styles.searchInput} value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث في المحطات..." dir="rtl" />
          {search && <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className={styles.cats}>
          {CATS.map(c => (
            <button key={c.id}
              className={`${styles.catBtn} ${cat === c.id ? styles.catActive : ''}`}
              style={{ '--cc': c.color }}
              onClick={() => setCat(c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isAnyFetching && (
        <div className={styles.fetchingBar}>
          <div className={styles.fetchSpinner} />
          <span>جاري تحميل المحطات المتحقق منها...</span>
        </div>
      )}

      {/* Empty */}
      {!isAnyFetching && displayed.length === 0 && catLoaded && (
        <div className={styles.empty}>
          <div>📭</div>
          <p>لا توجد محطات في هذه الفئة حالياً</p>
        </div>
      )}

      {/* Grid */}
      <div className={styles.grid}>
        {displayed.map(st => {
          const isOn = playing === st.id;
          const isLoading = isOn && buffering;
          return (
            <button key={st.id}
              className={`${styles.card} ${isOn ? styles.cardOn : ''}`}
              style={{ '--c': st.color }}
              onClick={() => playStation(st)}>
              {isOn && <div className={styles.cardGlow} />}
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}>{st.icon}</span>
                <span className={styles.cardCountry}>{st.country}</span>
                {isOn && !isLoading && (
                  <div className={styles.wave}><span/><span/><span/><span/></div>
                )}
                {isLoading && <div className={styles.cardSpin} />}
              </div>
              <div className={styles.cardName}>{st.name}</div>
              <div className={styles.cardDesc}>{st.desc}</div>
              <div className={styles.cardFoot}>
                {st.bitrate > 0 && (
                  <span className={styles.bitrate}>{st.bitrate}kbps</span>
                )}
                <span className={`${styles.playBtn} ${isOn ? styles.playOn : ''}`}>
                  {isOn ? '⏸' : '▶'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.hint}>
        <span>📡</span>
        <span>المحطات من Radio Browser — مفتوح المصدر، محطات متحقق منها فقط</span>
      </div>
    </div>
  );
}

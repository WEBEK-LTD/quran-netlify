import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore, setGlobal, savePref } from '../store';
import { SURAHS_META, READERS } from '../data';
import { getAudioUrl } from '../api';
import styles from './AudioPlayer.module.css';

// ─── Modes ───────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'single', icon: '1',  label: 'آية واحدة' },
  { id: 'surah',  icon: '▶▶', label: 'سورة كاملة' },
  { id: 'repeat', icon: '🔁', label: 'تكرار الآية' },
];
// In repeat mode each ayah is played this many times, then playback moves on.
const REPEAT_TIMES = 3;
const LOAD_ERROR_TOAST = 'تعذّر تحميل تلاوة هذا القارئ، جرّب قارئاً آخر';

// play() rejects with AbortError when src changes quickly (next/prev, reciter change)
// and NotSupportedError when the file fails to load (handled by onError) — not real failures.
function isBenignPlayError(err) {
  return err && (err.name === 'AbortError' || err.name === 'NotSupportedError');
}

export default function AudioPlayer() {
  const [state]  = useStore();
  const audioRef    = useRef(null);
  const modeRef     = useRef('surah');  // ref avoids stale closure in onEnded
  const ayahRef     = useRef(state.audioAyah);
  const surahRef    = useRef(state.currentSurah);
  const repeatRef   = useRef(0);                 // plays done of the current ayah in repeat mode
  const lastTriggerRef = useRef(state.playTrigger); // ignore a stale playTrigger left from before mount

  const [progress,    setProgress]    = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [current,     setCurrent]     = useState(0);
  const [volume,      setVolume]      = useState(1);
  const [showVolume,  setShowVolume]  = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const [mode,        setMode]        = useState('surah');

  // ── keep refs in sync ───────────────────────────────────────────────────────
  useEffect(() => { ayahRef.current  = state.audioAyah;     }, [state.audioAyah]);
  useEffect(() => { surahRef.current = state.currentSurah;  }, [state.currentSurah]);
  function setModeAndRef(m) { setMode(m); modeRef.current = m; repeatRef.current = 0; }

  // Audio element is not playing after a (re)mount — clear any stale flag
  useEffect(() => {
    if (state.isPlaying) setGlobal({ isPlaying: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePlayError(err, toast = '⚠️ تعذّر تشغيل الصوت') {
    if (isBenignPlayError(err)) return;
    setGlobal({ toast, isPlaying: false });
  }

  // ── load + play whenever playTrigger fires ────────────────────────────────
  useEffect(() => {
    if (!state.playTrigger || state.playTrigger === lastTriggerRef.current || !audioRef.current) return;
    lastTriggerRef.current = state.playTrigger;
    ayahRef.current  = state.audioAyah;
    surahRef.current = state.currentSurah;
    const url = getAudioUrl(state.reader, state.currentSurah, state.audioAyah);
    audioRef.current.src = url;
    audioRef.current.volume = volume;
    repeatRef.current = 0;
    audioRef.current.play()
      .then(() => {
        setGlobal({ isPlaying: true });
        updateMediaSession(state.currentSurah, state.audioAyah);
      })
      .catch(err => handlePlayError(err));
  }, [state.playTrigger]);

  // ── Media Session API (lock screen / notification controls) ──────────────
  function updateMediaSession(surah = surahRef.current, ayah = ayahRef.current) {
    if (!('mediaSession' in navigator)) return;
    const meta = SURAHS_META[surah - 1];
    const reader = READERS.find(r => r.id === state.reader);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${meta[0]} — الآية ${ayah}`,
      artist: reader?.name || 'القرآن الكريم',
      album: 'نور القرآن',
    });
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack',     next);
    navigator.mediaSession.setActionHandler('play',  () => { audioRef.current?.play(); setGlobal({ isPlaying: true }); });
    navigator.mediaSession.setActionHandler('pause', () => { audioRef.current?.pause(); setGlobal({ isPlaying: false }); });
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function togglePlay() {
    if (!audioRef.current) return;
    if (state.isPlaying) {
      audioRef.current.pause();
      setGlobal({ isPlaying: false });
    } else {
      // If no src yet, load current ayah
      if (!audioRef.current.src || audioRef.current.src === window.location.href) {
        setGlobal({ playTrigger: Date.now() });
        return;
      }
      audioRef.current.play()
        .then(() => { setGlobal({ isPlaying: true }); updateMediaSession(); })
        .catch(err => handlePlayError(err, '⚠️ تعذّر التشغيل'));
    }
  }

  // prev/next read refs (not render state) because they are also registered as
  // Media Session handlers, which would otherwise keep a stale closure.
  function prev() {
    if (ayahRef.current > 1)
      setGlobal({ audioAyah: ayahRef.current - 1, playTrigger: Date.now() });
  }

  function next() {
    const surah = surahRef.current;
    const max = SURAHS_META[surah - 1][2];
    if (ayahRef.current < max)
      setGlobal({ audioAyah: ayahRef.current + 1, playTrigger: Date.now() });
    else
      setGlobal({ isPlaying: false, toast: `✅ انتهت سورة ${SURAHS_META[surah - 1][0]}` });
  }

  // Play whole surah from ayah 1
  function playSurah() {
    setModeAndRef('surah');
    setGlobal({ audioAyah: 1, playTrigger: Date.now(), showAudio: true });
  }

  // ── onEnded — uses refs to avoid stale closure ───────────────────────────
  function onEnded() {
    setProgress(0); setCurrent(0);
    const curSurah = surahRef.current;
    const curAyah  = ayahRef.current;
    const max      = SURAHS_META[curSurah - 1][2];
    const curMode  = modeRef.current;
    const audio    = audioRef.current;
    if (!audio) return;

    if (curMode === 'repeat') {
      repeatRef.current += 1;
      if (repeatRef.current < REPEAT_TIMES) {
        audio.currentTime = 0;
        audio.play().catch(err => handlePlayError(err));
        return;
      }
      // repeated enough → move on to the next ayah
      repeatRef.current = 0;
    }
    if (curMode === 'single') {
      setGlobal({ isPlaying: false });
      return;
    }
    // surah / repeat mode → auto-next. Start the next ayah right here inside the
    // 'ended' handler (no timers / store round-trip) so playback continues with
    // the screen locked on mobile.
    if (curAyah < max) {
      const nextAyah = curAyah + 1;
      ayahRef.current = nextAyah;
      audio.src = getAudioUrl(state.reader, curSurah, nextAyah);
      audio.play()
        .then(() => updateMediaSession(curSurah, nextAyah))
        .catch(err => handlePlayError(err));
      setGlobal({ audioAyah: nextAyah, isPlaying: true });
    } else {
      setGlobal({ isPlaying: false, toast: `✅ انتهت سورة ${SURAHS_META[curSurah - 1][0]}` });
    }
  }

  function onTimeUpdate() {
    if (!audioRef.current) return;
    const c = audioRef.current.currentTime;
    const d = audioRef.current.duration || 0;
    setCurrent(c); setProgress(d ? (c / d) * 100 : 0);
    if ('mediaSession' in navigator && d > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration: d, playbackRate: 1, position: c });
      } catch {}
    }
  }

  function onLoadedMetadata() { setDuration(audioRef.current?.duration || 0); }

  function onAudioError() {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    audio.pause();
    setGlobal({ isPlaying: false, toast: LOAD_ERROR_TOAST });
  }

  function seekTo(e) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // The fill grows from the inline-start edge (right in RTL) — measure from the same edge
    const rtl  = getComputedStyle(e.currentTarget).direction === 'rtl';
    const x    = rtl ? rect.right - e.clientX : e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    audioRef.current.currentTime = ratio * duration;
  }

  function changeReader(id) {
    setGlobal({ reader: id });
    savePref('nq_reader', id);
    setShowReaders(false);
    if (state.isPlaying) setTimeout(() => setGlobal({ playTrigger: Date.now() }), 50);
  }

  function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  if (!state.showAudio) return null;

  const meta       = SURAHS_META[state.currentSurah - 1];
  const readerObj  = READERS.find(r => r.id === state.reader) || READERS[0];
  const currentMode = MODES.find(m => m.id === mode);
  const isRtl       = document.documentElement.getAttribute('dir') !== 'ltr';

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        onEnded={onEnded}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onError={onAudioError}
        /* Allow background playback */
        playsInline
        preload="auto"
      />

      {/* ── Progress bar ── */}
      <div className={styles.progressWrap} onClick={seekTo}>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          <div className={styles.progressThumb}
            style={isRtl
              ? { right: `${progress}%`, transform: 'translate(50%, -50%)' }
              : { left: `${progress}%` }} />
        </div>
      </div>

      {/* ── Main row ── */}
      <div className={styles.mainRow}>

        {/* Info */}
        <div className={styles.info}>
          <h4>{meta[0]} <span className={styles.ayahPill}>الآية {state.audioAyah}</span></h4>
          <p>{readerObj.country} {readerObj.name}</p>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button className={styles.ctrlBtn} onClick={prev} title="السابقة">⏮</button>
          <button className={`${styles.ctrlBtn} ${styles.playBtn}`} onClick={togglePlay}>
            {state.isPlaying ? '⏸' : '▶'}
          </button>
          <button className={styles.ctrlBtn} onClick={next} title="التالية">⏭</button>
        </div>

        {/* Time */}
        <div className={styles.timeDisplay}>
          <span>{fmt(current)}</span>
          <span className={styles.timeSep}>/</span>
          <span>{fmt(duration)}</span>
        </div>

        {/* Mode cycle button */}
        <button
          className={`${styles.modeBtn} ${mode !== 'single' ? styles.modeBtnActive : ''}`}
          onClick={() => {
            const i = MODES.findIndex(m => m.id === mode);
            setModeAndRef(MODES[(i + 1) % MODES.length].id);
          }}
          title={currentMode.label}
        >
          {currentMode.icon}
        </button>

        {/* Play surah button */}
        <button className={styles.surahBtn} onClick={playSurah} title="تشغيل السورة كاملة">
          ▶ سورة
        </button>

        {/* Reader picker */}
        <div className={styles.readerWrap}>
          <button className={styles.readerBtn}
            onClick={() => setShowReaders(v => !v)}
            title="اختر القارئ">
            🎙
          </button>
          {showReaders && (
            <div className={styles.readerMenu}>
              <div className={styles.readerMenuTitle}>اختر القارئ</div>
              {READERS.map(r => (
                <button key={r.id}
                  className={`${styles.readerItem} ${r.id === state.reader ? styles.readerActive : ''}`}
                  onClick={() => changeReader(r.id)}>
                  <span>{r.country}</span>
                  <span className={styles.readerItemName}>{r.name}</span>
                  {r.id === state.reader && <span className={styles.readerTick}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Volume */}
        <div className={styles.volumeWrap}>
          <button className={styles.ctrlBtn} onClick={() => setShowVolume(v => !v)}>
            {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          {showVolume && (
            <div className={styles.volumeSlider}>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (audioRef.current) audioRef.current.volume = v;
                }}
                className={styles.rangeInput} />
            </div>
          )}
        </div>

        {/* Close */}
        <button className={styles.closeBtn}
          onClick={() => { audioRef.current?.pause(); setGlobal({ showAudio: false, isPlaying: false }); }}>
          ✕
        </button>
      </div>

      {/* ── Mode indicator ── */}
      <div className={styles.modeBar}>
        {MODES.map(m => (
          <button key={m.id}
            className={`${styles.modePill} ${mode === m.id ? styles.modePillActive : ''}`}
            onClick={() => setModeAndRef(m.id)}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

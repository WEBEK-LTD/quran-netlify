import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore, setGlobal, savePref } from '../store';
import { SURAHS_META, READERS } from '../data';
import { getAudioUrl } from '../api';
import { Icon, toAr } from './ornaments/Ornaments';
import { displayNumber } from './reader/ayahItems';
import { readerName, readerShortName } from './reader/readerNames';
import { useTr, trNow, num, surahName, intlLocale } from '../l10n';
import styles from './AudioPlayer.module.css';

// ─── Modes ───────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'single', label: 'آية واحدة' },
  { id: 'surah',  label: 'سورة كاملة' },
  { id: 'repeat', label: 'تكرار الآية' },
];
// Playback speeds offered by the speed pill (cycled in this order).
const SPEEDS = [1, 1.25, 1.5, 0.75];
// In repeat mode each ayah is played this many times, then playback moves on.
const REPEAT_TIMES = 3;
const LOAD_ERROR_TOAST = 'تعذّر تحميل تلاوة هذا القارئ، جرّب قارئاً آخر';
// Speed in the visitor's digits and decimal separator (١٫٢٥ · 1.25 · 1,25).
const fmtSpeed = v => { try { return num(new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(v)); } catch { return num(v); } };

// play() rejects with AbortError when src changes quickly (next/prev, reciter change)
// and NotSupportedError when the file fails to load (handled by onError) — not real failures.
function isBenignPlayError(err) {
  return err && (err.name === 'AbortError' || err.name === 'NotSupportedError');
}

export default function AudioPlayer() {
  const [state]  = useStore();
  const tr = useTr();
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
  const [showMore,    setShowMore]    = useState(false);
  const [mode,        setMode]        = useState('surah');
  const [speed,       setSpeed]       = useState(1);
  const speedRef    = useRef(1);
  const moreRef     = useRef(null);

  // ── keep refs in sync ───────────────────────────────────────────────────────
  useEffect(() => { ayahRef.current  = state.audioAyah;     }, [state.audioAyah]);
  useEffect(() => { surahRef.current = state.currentSurah;  }, [state.currentSurah]);
  function setModeAndRef(m) { setMode(m); modeRef.current = m; repeatRef.current = 0; }

  // Audio element is not playing after a (re)mount — clear any stale flag
  useEffect(() => {
    if (state.isPlaying) setGlobal({ isPlaying: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePlayError(err, toast = 'تعذّر تشغيل الصوت') {
    if (isBenignPlayError(err)) return;
    setGlobal({ toast: trNow(toast), isPlaying: false });
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
    const reader = READERS.find(r => r.id === state.reader);
    const shown = displayNumber(surah, ayah);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${surahName(surah)} — ${shown === null ? trNow('البسملة') : trNow('الآية {n}', { n: num(shown) })}`,
      artist: reader ? readerName(reader) : trNow('القرآن الكريم'),
      album: trNow('نور القرآن'),
    });
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack',     next);
    navigator.mediaSession.setActionHandler('play',  () => { audioRef.current?.play(); setGlobal({ isPlaying: true }); });
    navigator.mediaSession.setActionHandler('pause', () => { audioRef.current?.pause(); setGlobal({ isPlaying: false }); });
  }

  // The reader (ayah tools, reader bar) asks to pause / resume through this event
  useEffect(() => {
    const h = () => togglePlay();
    window.addEventListener('nq:audio-toggle', h);
    return () => window.removeEventListener('nq:audio-toggle', h);
  });

  // Close the "more" menu on outside click / Escape
  useEffect(() => {
    if (!showMore) return;
    const onDown = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    const onKey = e => { if (e.key === 'Escape') setShowMore(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showMore]);

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
        .catch(err => handlePlayError(err, 'تعذّر التشغيل'));
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
      setGlobal({ isPlaying: false, toast: trNow('انتهت سورة {name}', { name: surahName(surah) }) });
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
      setGlobal({ isPlaying: false, toast: trNow('انتهت سورة {name}', { name: surahName(curSurah) }) });
    }
  }

  function onTimeUpdate() {
    if (!audioRef.current) return;
    const c = audioRef.current.currentTime;
    const d = audioRef.current.duration || 0;
    setCurrent(c); setProgress(d ? (c / d) * 100 : 0);
    if ('mediaSession' in navigator && d > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration: d, playbackRate: speedRef.current, position: c });
      } catch {}
    }
  }

  function onLoadedMetadata() {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration || 0);
    // a new <audio> (or src) starts at 1× — keep the chosen speed
    a.defaultPlaybackRate = speedRef.current;
    a.playbackRate = speedRef.current;
  }

  function cycleSpeed() {
    const v = SPEEDS[(SPEEDS.indexOf(speedRef.current) + 1) % SPEEDS.length];
    speedRef.current = v; setSpeed(v);
    const a = audioRef.current;
    if (a) { a.defaultPlaybackRate = v; a.playbackRate = v; }
  }

  // Keyboard on the progress track (role="slider")
  function seekKey(e) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const step = e.shiftKey ? 10 : 5;
    const fwd = ['ArrowLeft', 'ArrowUp'], back = ['ArrowRight', 'ArrowDown'];
    // RTL: the fill grows leftwards, so ArrowLeft moves forward
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const f = rtl ? fwd : ['ArrowRight', 'ArrowUp'];
    const b = rtl ? back : ['ArrowLeft', 'ArrowDown'];
    if (f.includes(e.key)) { e.preventDefault(); a.currentTime = Math.min(duration, a.currentTime + step); }
    else if (b.includes(e.key)) { e.preventDefault(); a.currentTime = Math.max(0, a.currentTime - step); }
    else if (e.key === 'Home') { e.preventDefault(); a.currentTime = 0; }
    else if (e.key === 'End') { e.preventDefault(); a.currentTime = Math.max(0, duration - .1); }
  }

  function onAudioError() {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    audio.pause();
    setGlobal({ isPlaying: false, toast: trNow(LOAD_ERROR_TOAST) });
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
    setShowMore(false);
    if (state.isPlaying) setTimeout(() => setGlobal({ playTrigger: Date.now() }), 50);
  }

  function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  if (!state.showAudio) return null;

  const sName      = surahName(state.currentSurah);
  const readerObj  = READERS.find(r => r.id === state.reader) || READERS[0];
  const currentMode = MODES.find(m => m.id === mode);
  const shownAyah  = displayNumber(state.currentSurah, state.audioAyah);
  const ayahText   = shownAyah === null ? tr('البسملة') : tr('الآية {n}', { n: toAr(shownAyah) });
  const readerFull = readerName(readerObj, tr.lang);
  const readerShort = readerShortName(readerObj, tr.lang);
  const initial    = readerShort.replace(/^(ال|عبد\s*ال|Abd(ul|ur|u)?[\s-]*|A[lrsd]-)/i, '').trim().charAt(0) || readerShort.charAt(0);
  const speedTxt   = `${fmtSpeed(speed)}×`;

  return (
    <div className={styles.dock} role="region" aria-label={tr('مشغّل التلاوة')}>
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

      <span className={styles.rc} aria-hidden="true">
        <svg className={styles.rcStar}><use href="#nq-star8" /></svg>
        <b>{initial}</b>
      </span>

      <div className={styles.meta}>
        <b title={`${readerFull} · ${sName} · ${ayahText}`}>
          <span className={styles.rName}>{readerShort} · </span>{sName} · <span className={styles.ayahNo}>{ayahText}</span>
        </b>
        <div className={styles.track} onClick={seekTo} onKeyDown={seekKey}
          role="slider" tabIndex={0} aria-label={tr('موضع التلاوة')}
          aria-valuemin={0} aria-valuemax={Math.round(duration) || 0} aria-valuenow={Math.round(current) || 0}
          aria-valuetext={tr('{a} من {b}', { a: fmt(current), b: fmt(duration) })}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <small className="nq-num">{toAr(fmt(current))} / {toAr(fmt(duration))}</small>
      </div>

      <div className={styles.chips}>
        <button type="button" className={`nq-pill ${mode !== 'single' ? 'on' : ''} ${styles.chip}`}
          onClick={() => { const i = MODES.findIndex(m => m.id === mode); setModeAndRef(MODES[(i + 1) % MODES.length].id); }}
          aria-label={tr('وضع التشغيل: {mode}', { mode: tr(currentMode.label) })} title={tr('تغيير وضع التشغيل')}>
          <Icon name="repeat" />{mode === 'repeat' ? tr('تكرار ×{n}', { n: toAr(REPEAT_TIMES) }) : tr(currentMode.label)}
        </button>
        <button type="button" className={`nq-pill ${speed !== 1 ? 'on' : ''} ${styles.chip}`} onClick={cycleSpeed}
          aria-label={tr('سرعة التلاوة {v}', { v: speedTxt })} title={tr('سرعة التلاوة')}>
          {speedTxt}
        </button>
      </div>

      <div className={styles.ctl}>
        <button type="button" className={styles.sm} onClick={prev} aria-label={tr('الآية السابقة')} title={tr('السابقة')}>
          <Icon name="prev" fill />
        </button>
        <button type="button" className={styles.play} onClick={togglePlay} aria-label={state.isPlaying ? tr('إيقاف مؤقت') : tr('تشغيل')}>
          <Icon name={state.isPlaying ? 'pause' : 'play'} fill />
        </button>
        <button type="button" className={styles.sm} onClick={next} aria-label={tr('الآية التالية')} title={tr('التالية')}>
          <Icon name="next" fill />
        </button>
      </div>

      <div className={styles.moreWrap} ref={moreRef}>
        <button type="button" className={`${styles.sm} ${showMore ? styles.smOn : ''}`} onClick={() => setShowMore(v => !v)}
          aria-label={tr('خيارات التلاوة')} aria-expanded={showMore} aria-haspopup="dialog" title={tr('خيارات التلاوة')}>
          <Icon name="gear" />
        </button>
        {showMore && (
          <div className={styles.menu} role="dialog" aria-label={tr('خيارات التلاوة')}>
            <div className={styles.menuSec}>
              <span className={styles.menuLbl} id="nqModeLbl">{tr('وضع التشغيل')}</span>
              <div className="nq-seg" role="group" aria-labelledby="nqModeLbl" style={{ display: 'flex' }}>
                {MODES.map(m => (
                  <button key={m.id} type="button" style={{ flex: 1 }} aria-pressed={mode === m.id} onClick={() => setModeAndRef(m.id)}>{tr(m.label)}</button>
                ))}
              </div>
            </div>
            <div className={styles.menuSec}>
              <span className={styles.menuLbl} id="nqSpeedLbl">{tr('السرعة')}</span>
              <div className="nq-seg" role="group" aria-labelledby="nqSpeedLbl" style={{ display: 'flex' }}>
                {[0.75, 1, 1.25, 1.5].map(v => (
                  <button key={v} type="button" style={{ flex: 1 }} aria-pressed={speed === v}
                    onClick={() => { speedRef.current = v; setSpeed(v); const a = audioRef.current; if (a) { a.defaultPlaybackRate = v; a.playbackRate = v; } }}>
                    {fmtSpeed(v)}×
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.menuSec}>
              <label className={styles.menuLbl} htmlFor="nqVol">{tr('مستوى الصوت')}</label>
              <div className={styles.volRow}>
                <Icon name="head" />
                <input id="nqVol" type="range" min="0" max="1" step="0.05" value={volume}
                  className={styles.range} style={{ '--p': (volume * 100) + '%' }}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (audioRef.current) audioRef.current.volume = v;
                  }} />
                <span className="nq-num">{tr('{n}٪', { n: toAr(Math.round(volume * 100)) })}</span>
              </div>
            </div>
            <button type="button" className={`nq-btn ghost sm ${styles.fromStart}`} onClick={() => { playSurah(); setShowMore(false); }}>
              <Icon name="play" />{tr('تشغيل السورة من أولها')}
            </button>
            <button type="button" className={`nq-btn ghost sm ${styles.menuClose}`}
              onClick={() => { audioRef.current?.pause(); setShowMore(false); setGlobal({ showAudio: false, isPlaying: false }); }}>
              <Icon name="x" />{tr('إغلاق المشغّل')}
            </button>
            <div className={styles.menuSec}>
              <span className={styles.menuLbl}>{tr('القارئ')}</span>
              <div className={styles.readers}>
                {READERS.map(r => (
                  <button key={r.id} type="button"
                    className={styles.readerItem} aria-pressed={r.id === state.reader}
                    onClick={() => changeReader(r.id)}>
                    <span>{readerName(r, tr.lang)}</span>
                    {r.id === state.reader && <Icon name="check" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <button type="button" className={`${styles.sm} ${styles.close}`}
        onClick={() => { audioRef.current?.pause(); setGlobal({ showAudio: false, isPlaying: false }); }}
        aria-label={tr('إغلاق المشغّل')} title={tr('إغلاق')}>
        <Icon name="x" />
      </button>
    </div>
  );
}

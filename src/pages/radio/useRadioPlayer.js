// ─── Radio player: one <audio> element, HLS via native playback or hls.js ────
// States: idle → connecting → playing (⇄ buffering) → idle | error.
// A failed / dropped stream is retried once automatically, then the error stays
// on screen with «جرّب محطة أخرى». Starting the radio pauses the Mushaf recitation,
// and starting the recitation stops the radio.
import { useState, useEffect, useRef, useCallback } from 'react';
import { engine } from '../../audio/controller';
import { loadHls, nativeHls } from './loadHls';
import { claimMediaSession, radioPlaybackState, releaseMediaSession } from './mediaSession';

const CONNECT_TIMEOUT = 20000;  // no sound after this long → failed
const STALL_TIMEOUT = 25000;    // buffering this long while playing → failed
const RETRY_DELAY = 1500;
const VOL_KEY = 'nq_radio_vol';

function readVol() {
  try { const v = parseFloat(localStorage.getItem(VOL_KEY)); return v >= 0 && v <= 1 ? v : 0.8; } catch { return 0.8; }
}

/**
 * meta(station) → { title, artist, album } for the lock screen;
 * neighbour(station, step) → the next / previous station to play (or null).
 */
export function useRadioPlayer({ meta, neighbour }) {
  const [station, setStation] = useState(null);
  const [phase, setPhase] = useState('idle');       // idle | connecting | playing | error
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');           // '' | 'connect' | 'unsupported' | 'blocked'
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolumeState] = useState(readVol);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef(null);
  const hlsRef = useRef(null);
  const tokenRef = useRef(0);          // bumped on every start / stop: late events of an old stream are ignored
  const retriedRef = useRef(false);
  const timers = useRef({ tick: 0, watch: 0, retry: 0 });
  const live = useRef({});             // latest props / settings for the event handlers
  live.current = { meta, neighbour, volume, muted };
  // station / phase as refs too, updated synchronously (media events arrive before React re-renders)
  const stRef = useRef(null);
  const phaseRef = useRef('idle');
  const ownPauseAt = useRef(0);
  const go = (p, st) => {
    phaseRef.current = p; setPhase(p);
    if (st !== undefined) { stRef.current = st; setStation(st); }
  };

  const clearTimers = () => {
    clearInterval(timers.current.tick);
    clearTimeout(timers.current.watch);
    clearTimeout(timers.current.retry);
    timers.current = { tick: 0, watch: 0, retry: 0 };
  };

  const teardown = useCallback(() => {
    const a = audioRef.current;
    ownPauseAt.current = Date.now();
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    if (a) {
      a.pause();
      a.removeAttribute('src');
      try { a.load(); } catch {}
    }
  }, []);

  const watch = (ms, token) => {
    clearTimeout(timers.current.watch);
    timers.current.watch = setTimeout(() => { if (token === tokenRef.current) fail(token); }, ms);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fail = useCallback((token, kind = 'connect') => {
    if (token !== tokenRef.current) return;
    const st = stRef.current;
    clearTimers();
    teardown();
    if (st && !retriedRef.current && kind === 'connect') {
      retriedRef.current = true;
      // a new token: the other late events of the failed attempt (play() rejection + 'error') are ignored
      const again = ++tokenRef.current;
      go('connecting'); setBuffering(false);
      timers.current.retry = setTimeout(() => { if (again === tokenRef.current) begin(st, true); }, RETRY_DELAY);
      return;
    }
    tokenRef.current++;
    go('error'); setBuffering(false); setError(kind);
    radioPlaybackState('none');
  }, [teardown]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const begin = useCallback(async (st, isRetry = false) => {
    const a = audioRef.current;
    if (!a || !st || !st.url) return;
    const token = ++tokenRef.current;
    clearTimers();
    teardown();
    if (!isRetry) { retriedRef.current = false; setElapsed(0); }
    go('connecting', st); setBuffering(false); setError('');
    // the Mushaf recitation and the radio never play together
    try { if (engine.getSnapshot().playing) engine.pause(); } catch {}
    const m = live.current.meta(st);
    claimMediaSession(m, {
      play: () => { if (stRef.current) begin(stRef.current); },
      stop: () => stopRef.current(),
      next: () => { const n = live.current.neighbour(stRef.current, 1); if (n) begin(n); },
      prev: () => { const n = live.current.neighbour(stRef.current, -1); if (n) begin(n); },
    });
    a.volume = live.current.muted ? 0 : live.current.volume;
    watch(CONNECT_TIMEOUT, token);

    if (st.hls && !nativeHls(a)) {
      let Hls;
      try { Hls = await loadHls(); } catch { Hls = null; }
      if (token !== tokenRef.current) return;
      if (!Hls || !Hls.isSupported()) { fail(token, Hls ? 'unsupported' : 'connect'); return; }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2 });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_e, d) => { if (d && d.fatal) fail(token); });
      hls.loadSource(st.url);
      hls.attachMedia(a);
    } else {
      a.src = st.url;
    }
    a.play().catch(err => {
      if (token !== tokenRef.current || (err && err.name === 'AbortError')) return;
      // autoplay refused (a lock-screen «play» without a recent tap…): not a broken station
      if (err && err.name === 'NotAllowedError') { tokenRef.current++; clearTimers(); teardown(); go('error'); setError('blocked'); return; }
      fail(token);
    });
  }, [teardown, fail]);

  const stop = useCallback(() => {
    tokenRef.current++;
    clearTimers();
    teardown();
    go('idle', null); setBuffering(false); setError(''); setElapsed(0);
    releaseMediaSession();
  }, [teardown]);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const toggle = useCallback(st => {
    const p = phaseRef.current;
    if (stRef.current && stRef.current.id === st.id && (p === 'playing' || p === 'connecting')) stop();
    else begin(st);
  }, [begin, stop]);

  // ── the audio element ────────────────────────────────────────────────────
  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    audioRef.current = a;
    const on = (ev, fn) => a.addEventListener(ev, fn);
    on('playing', () => {
      const token = tokenRef.current;
      clearTimeout(timers.current.watch);
      clearInterval(timers.current.tick);
      timers.current.tick = setInterval(() => { if (token === tokenRef.current) setElapsed(e => e + 1); }, 1000);
      retriedRef.current = false;   // it worked: a later drop gets its own retry
      go('playing'); setBuffering(false); setError('');
      radioPlaybackState('playing');
    });
    const wait = () => {
      if (!stRef.current || phaseRef.current !== 'playing') return;
      clearInterval(timers.current.tick);
      setBuffering(true);
      watch(STALL_TIMEOUT, tokenRef.current);
    };
    on('waiting', wait);
    on('stalled', wait);
    on('error', () => {
      if (!a.getAttribute('src') && !hlsRef.current) return; // our own teardown
      if (hlsRef.current) return;                           // hls.js reports its own fatal errors
      fail(tokenRef.current);
    });
    on('ended', () => fail(tokenRef.current));               // a live stream never ends on its own
    on('pause', () => {
      // paused by the system (headphones unplugged, another app…): a live stream can't be resumed in place
      if (Date.now() - ownPauseAt.current < 1500 || phaseRef.current !== 'playing' || a.ended) return;
      setTimeout(() => { if (a.paused && phaseRef.current === 'playing') stopRef.current(); }, 0);
    });

    // the Mushaf recitation started → stop the radio
    const unsub = engine.subscribe(() => {
      try {
        const p = phaseRef.current;
        if (engine.getSnapshot().playing && (p === 'playing' || p === 'connecting')) stopRef.current();
      } catch {}
    });

    return () => {
      unsub();
      tokenRef.current++;
      clearTimers();
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
      a.pause();
      a.removeAttribute('src');
      try { a.load(); } catch {}
      releaseMediaSession();
    };
  }, [fail]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    try { localStorage.setItem(VOL_KEY, String(volume)); } catch {}
  }, [volume, muted]);

  // the lock-screen title follows the interface language
  useEffect(() => {
    if (station && (phase === 'playing' || phase === 'connecting')) {
      claimMediaSession(meta(station), {
        play: () => { if (stRef.current) begin(stRef.current); },
        stop: () => stopRef.current(),
        next: () => { const x = live.current.neighbour(stRef.current, 1); if (x) begin(x); },
        prev: () => { const x = live.current.neighbour(stRef.current, -1); if (x) begin(x); },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const setVolume = v => { setVolumeState(v); setMuted(false); };

  return {
    station, phase, buffering, error, elapsed, volume, muted,
    play: begin, stop, toggle, setVolume, setMuted,
    retry: () => { if (station) begin(station); },
  };
}

// ─── Recitation engine: gapless ayah-by-ayah playback ───────────────────────
// Two <audio> elements take turns (A/B): while ayah N plays on the active one,
// the next file is already loading on the standby one. On `ended` the standby
// starts at once (same task, no timers, no React round-trip) and the freed
// element starts loading the file after it. The next few files are also warmed
// in the service worker's audio cache (see ./offline.js and public/sw.js).
//
// iOS Safari may refuse to start a second element without a user gesture
// (NotAllowedError), especially with the screen locked. The engine then
// degrades for the rest of the session to ONE element whose `src` is swapped on
// `ended` — the next file is already in the SW cache, so it starts quickly. It
// also primes the standby element during every user gesture (a muted
// play → pause) so a real swap later is usually allowed.
//
// The engine knows nothing about React or the store: it emits a snapshot to its
// subscribers and one-off events (toasts) to its event listeners.
import { getAudioUrl } from '../api';
import {
  DEFAULT_SETTINGS, firstCursor, nextCursor, prevCursor, upcoming, fileOf, ayahCount,
} from './queue';
import { prefetchAudio } from './offline';

const STALL_MS = 8000;           // waiting/stalled this long with no progress → reload at the same time
const SWAP_WATCHDOG_MS = 3000;   // a swapped-in element with data that never starts → treat as blocked
const PREFETCH_AHEAD = 5;
const SLEEP_FADE_MS = 3000;
const MAX_CONSECUTIVE_FAILS = 3;
const PREFS_KEY = 'nq_audio_prefs';

const benign = err => err && (err.name === 'AbortError');

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}

function makeElement() {
  const a = new Audio();
  a.preload = 'auto';
  a.setAttribute('playsinline', '');
  a.setAttribute('webkit-playsinline', '');
  a.setAttribute('x-webkit-airplay', 'allow');
  return a;
}

export class AudioEngine {
  constructor() {
    const p = readPrefs();
    this.settings = {
      ...DEFAULT_SETTINGS,
      mode: ['single', 'surah', 'repeat', 'range'].includes(p.mode) ? p.mode : DEFAULT_SETTINGS.mode,
      repeatN: Number.isInteger(p.repeatN) ? p.repeatN : DEFAULT_SETTINGS.repeatN,
      rangeN: Number.isInteger(p.rangeN) ? p.rangeN : DEFAULT_SETTINGS.rangeN,
      afterSurah: ['next', 'repeat', 'stop'].includes(p.afterSurah) ? p.afterSurah : DEFAULT_SETTINGS.afterSurah,
    };
    this.rate = [0.75, 1, 1.25, 1.5].includes(p.rate) ? p.rate : 1;
    this.volume = typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : 1;
    this.reader = null;
    this.cursor = null;        // what is playing (see queue.js)
    this.status = 'idle';      // idle | loading | playing | paused | ended
    this.wantPlay = false;     // the visitor wants sound (pause button shown)
    this.buffering = false;
    this.single = false;       // degraded to one element (iOS)
    this.sleep = { kind: 'off', endsAt: 0 };
    this.retry = 0;
    this.fails = 0;            // consecutive files that could not be loaded
    this.everPlayed = false;
    this.listeners = new Set();
    this.eventListeners = new Set();
    this.els = typeof Audio === 'undefined' ? [] : [makeElement(), makeElement()];
    this.ai = 0;
    this._stall = null;
    this._sleepTimer = null;
    this._fading = null;
    this._snap = null;
    this.els.forEach(el => this._wire(el));
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  }

  // ── subscription ───────────────────────────────────────────────────────────
  subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  onEvent = fn => { this.eventListeners.add(fn); return () => this.eventListeners.delete(fn); };
  getSnapshot = () => {
    if (!this._snap) {
      const el = this.active;
      this._snap = {
        status: this.status,
        playing: this.wantPlay,
        buffering: this.buffering,
        cursor: this.cursor,
        time: el ? el.currentTime || 0 : 0,
        duration: el && Number.isFinite(el.duration) ? el.duration : 0,
        settings: this.settings,
        rate: this.rate,
        volume: this.volume,
        sleep: this.sleep,
        single: this.single,
        reader: this.reader,
      };
    }
    return this._snap;
  };
  _emit() { this._snap = null; this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
  _event(ev) { this.eventListeners.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); }

  get active() { return this.els[this.ai]; }
  get standby() { return this.els[this.ai ^ 1]; }
  get time() { return this.active ? this.active.currentTime || 0 : 0; }
  get duration() { const d = this.active && this.active.duration; return Number.isFinite(d) ? d : 0; }

  _savePrefs() {
    const { mode, repeatN, rangeN, afterSurah } = this.settings;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ mode, repeatN, rangeN, afterSurah, rate: this.rate, volume: this.volume })); } catch {}
  }

  _url(c) { return c ? getAudioUrl(this.reader, ...fileOf(c)) : null; }

  // ── element wiring ─────────────────────────────────────────────────────────
  _wire(el) {
    el.addEventListener('playing', () => {
      el._playing = true;
      el._unlocked = true;
      if (el !== this.active) return;
      // the ayah has started: now let the next one buffer in full (see start())
      const sb = this.standby;
      if (sb && sb !== el && sb.preload !== 'auto') sb.preload = 'auto';
      this._disarmStall();
      this.everPlayed = true;
      this.fails = 0;
      this.status = 'playing';
      this.buffering = false;
      this._emit();
    });
    el.addEventListener('waiting', () => {
      if (el !== this.active || !this.wantPlay) return;
      this.buffering = true;
      this._armStall();
      this._emit();
    });
    el.addEventListener('stalled', () => {
      if (el !== this.active || !this.wantPlay) return;
      this._armStall();
    });
    el.addEventListener('timeupdate', () => {
      if (el !== this.active) return;
      if (this._stall && Math.abs(el.currentTime - this._stall.t) > 0.25) this._disarmStall();
      if (this.buffering && !el.paused && el.readyState >= 3) this.buffering = false;
      if (this.sleep.kind === 'time' && Date.now() >= this.sleep.endsAt - SLEEP_FADE_MS) this._sleepStop();
      this._emit();
    });
    el.addEventListener('loadedmetadata', () => {
      el.defaultPlaybackRate = this.rate;
      el.playbackRate = this.rate;
      if (el._resumeAt) {
        try { el.currentTime = Math.min(el._resumeAt, Math.max(0, (el.duration || el._resumeAt) - 0.2)); } catch {}
        el._resumeAt = 0;
      }
      if (el === this.active) this._emit();
    });
    el.addEventListener('durationchange', () => { if (el === this.active) this._emit(); });
    el.addEventListener('ratechange', () => { if (el === this.active) this._emit(); });
    el.addEventListener('seeked', () => { if (el === this.active) this._emit(); });
    el.addEventListener('pause', () => {
      el._playing = false;
      // `pause` also fires right before `ended`, and around our own src swaps —
      // only an outside pause (OS, headphones unplugged, another app) counts.
      setTimeout(() => {
        if (el !== this.active || !el.paused || el.ended || !this.wantPlay || this._fading) return;
        if (el._loadingSince && performance.now() - el._loadingSince < 50) return;
        this.wantPlay = false;
        this.status = 'paused';
        this.buffering = false;
        this._disarmStall();
        this._emit();
      }, 0);
    });
    el.addEventListener('ended', () => {
      if (el !== this.active) return;
      this._advance({ auto: true });
    });
    el.addEventListener('error', () => {
      if (!el.getAttribute('src')) return;
      const code = el.error && el.error.code;
      if (code === 1) return; // MEDIA_ERR_ABORTED — we changed src
      if (el !== this.active) { el._failed = true; return; }
      this._onActiveError(el);
    });
  }

  _load(el, url, resumeAt = 0, { lazy = false } = {}) {
    // lazy: fetch only the header for now (the standby while the first ayah starts,
    // so both do not share the bandwidth); `playing` on the active one upgrades it
    el.preload = lazy ? 'metadata' : 'auto';
    el._url = url;
    el._failed = false;
    el._playing = false;
    el._resumeAt = resumeAt;
    el._loadingSince = performance.now();
    el.defaultPlaybackRate = this.rate;
    el.volume = this.volume;
    el.muted = false;
    el.src = url;
    try { el.load(); } catch {}
    el.playbackRate = this.rate;
  }

  _play(el, { auto = false } = {}) {
    this.wantPlay = true;
    if (el.readyState < 3) { this.status = 'loading'; this.buffering = true; }
    el.muted = false;
    el.volume = this._fading ? el.volume : this.volume;
    el.playbackRate = this.rate;
    let p;
    try { p = el.play(); } catch (err) { p = Promise.reject(err); }
    if (p && p.catch) p.catch(err => this._onPlayReject(el, err, auto));
    if (auto && !this.single) this._watchSwap(el);
  }

  _onPlayReject(el, err, auto) {
    if (benign(err) || el !== this.active) return;
    if (err && err.name === 'NotAllowedError') {
      if (auto && !this.single) { this._degrade(el); return; }
      // nothing may start without a tap: show the play button, never hang
      this.wantPlay = false;
      this.status = 'paused';
      this.buffering = false;
      this._emit();
      this._event({ type: 'needs-tap' });
      return;
    }
    // NotSupportedError etc. — the `error` event decides (retry / skip)
    if (!el.error) this._onActiveError(el);
  }

  // A swapped-in element that has data but never fires `playing` is blocked too.
  _watchSwap(el) {
    clearTimeout(this._swapWatch);
    this._swapWatch = setTimeout(() => {
      if (el !== this.active || this.single || !this.wantPlay) return;
      if (!el._playing && el.readyState >= 3 && el.currentTime === 0) this._degrade(el);
    }, SWAP_WATCHDOG_MS);
  }

  // iOS strategy: one element for the rest of the session.
  _degrade(blocked) {
    if (this.single) return;
    this.single = true;
    const keep = this.els[0] === blocked ? this.els[1] : this.els[0];
    try { blocked.pause(); blocked.removeAttribute('src'); blocked.load(); } catch {}
    blocked._url = null;
    this.ai = this.els.indexOf(keep);
    this._load(keep, this._url(this.cursor));
    this._play(keep);
    this._planNext();
    this._emit();
    this._event({ type: 'degraded' });
  }

  // Unlock the standby element inside a user gesture (muted play → pause). It is
  // started BEFORE the active one: if the platform allows only one element at a
  // time, starting the active one pauses the standby, not the other way round.
  _prime() {
    if (this.single) return;
    const sb = this.standby;
    if (!sb || sb._unlocked || !sb.getAttribute('src')) return;
    sb.muted = true;
    let p;
    try { p = sb.play(); } catch (err) { p = Promise.reject(err); }
    p.then(() => {
      sb._unlocked = true;
      if (sb !== this.active) { sb.pause(); try { sb.currentTime = 0; } catch {} }
      sb.muted = false;
    }).catch(err => {
      sb.muted = false;
      if (err && err.name === 'NotAllowedError' && sb !== this.active && !this.single) {
        // even a muted start is refused: swapping later would fail — go single now
        this.single = true;
        try { sb.removeAttribute('src'); sb.load(); } catch {}
        sb._url = null;
        this._emit();
        this._event({ type: 'degraded' });
      }
    });
  }

  // ── stall detection ────────────────────────────────────────────────────────
  _armStall() {
    if (this._stall) return;
    const el = this.active;
    const t = el.currentTime;
    this._stall = {
      t,
      timer: setTimeout(() => {
        const s = this._stall;
        this._stall = null;
        if (!s || el !== this.active || !this.wantPlay) return;
        if (Math.abs(el.currentTime - s.t) > 0.25 && !el.paused) return;
        // reload the same file and continue at the same time
        this._load(el, el._url || this._url(this.cursor), s.t);
        this._play(el);
        this._emit();
      }, STALL_MS),
    };
  }
  _disarmStall() { if (this._stall) { clearTimeout(this._stall.timer); this._stall = null; } }

  // ── errors: retry once, then skip with a toast ─────────────────────────────
  _onActiveError(el) {
    this._disarmStall();
    if (this.retry < 1) {
      this.retry += 1;
      const at = el.currentTime || 0;
      const url = el._url;
      setTimeout(() => {
        if (el !== this.active || el._url !== url) return;
        this._load(el, url, at);
        if (this.wantPlay) this._play(el);
      }, 700);
      return;
    }
    this.fails += 1;
    if (!this.everPlayed || this.fails >= MAX_CONSECUTIVE_FAILS) {
      this._halt();
      this._event({ type: this.everPlayed ? 'net-stop' : 'reader-fail' });
      return;
    }
    this._event({ type: 'skip', cursor: this.cursor });
    this._advance({ auto: true, skip: true });
  }

  _halt() {
    this.wantPlay = false;
    this.status = 'paused';
    this.buffering = false;
    try { this.active.pause(); } catch {}
    this._emit();
  }

  // ── the queue ──────────────────────────────────────────────────────────────
  _opts(extra = {}) { return { stopAtSurahEnd: this.sleep.kind === 'surah', ...extra }; }

  _planNext() {
    if (!this.cursor || !this.reader) return;
    const urls = upcoming(this.cursor, this.settings, PREFETCH_AHEAD, this._opts()).map(f => getAudioUrl(this.reader, ...f));
    prefetchAudio(urls);
    if (this.single) return;
    const nxt = nextCursor(this.cursor, this.settings, this._opts());
    const url = nxt ? this._url(nxt) : null;
    const sb = this.standby;
    if (!url || url === this.active._url) return;
    if (sb._url !== url || sb._failed) this._load(sb, url);
  }

  _advance({ auto = false, skip = false } = {}) {
    if (this.sleep.kind === 'time' && Date.now() >= this.sleep.endsAt) { this._sleepStop(true); return; }
    const prev = this.cursor;
    const nxt = nextCursor(prev, this.settings, this._opts({ skip }));
    if (!nxt) { this._finish(prev); return; }
    this._go(nxt, { auto, play: auto ? this.wantPlay : true });
  }

  _go(c, { auto = false, play = true } = {}) {
    this.cursor = c;
    this.retry = 0;
    this._disarmStall();
    const url = this._url(c);
    const cur = this.active;
    if (url === cur._url && !cur.error && cur.getAttribute('src')) {
      // the same file again (repeat): rewind the element that has it
      try { cur.currentTime = 0; } catch {}
      if (play) this._play(cur, { auto });
    } else if (!this.single && this.standby._url === url && !this.standby._failed) {
      this.ai ^= 1; // swap — the standby already has this file
      const el = this.active;
      el.volume = this.volume;
      el.muted = false;
      el.defaultPlaybackRate = this.rate;
      el.playbackRate = this.rate;
      if (el.currentTime) { try { el.currentTime = 0; } catch {} }
      try { if (!cur.paused) cur.pause(); } catch {}
      if (play) this._play(el, { auto });
    } else {
      // the standby already failed to fetch this file: loading it here is the one retry
      if (this.standby._url === url && this.standby._failed) this.retry = 1;
      this._load(cur, url);
      if (play) this._play(cur, { auto });
    }
    this._planNext();
    this._emit();
  }

  _finish(prev) {
    const bySleep = this.sleep.kind === 'surah' && prev && !prev.basmala && prev.ayah === ayahCount(prev.surah);
    this.wantPlay = false;
    this.status = 'ended';
    this.buffering = false;
    this._disarmStall();
    if (bySleep) this.setSleep('off');
    this._emit();
    this._event({ type: bySleep ? 'sleep-done' : 'finished', cursor: prev });
  }

  // ── public API ─────────────────────────────────────────────────────────────
  setReader(id) {
    if (!id || id === this.reader) return;
    const had = this.reader;
    this.reader = id;
    if (!had || !this.cursor) { this._emit(); return; }
    // same ayah, new reciter (times differ between reciters: start the ayah over)
    const play = this.wantPlay;
    this.els.forEach(el => { el._url = null; });
    this._load(this.active, this._url(this.cursor));
    if (play) this._play(this.active);
    this._planNext();
    this._emit();
  }

  /** Start at (surah, ayah) — call from a user gesture. */
  start(surah, ayah) {
    this.fails = 0;
    this.everPlayed = false;
    this.cursor = firstCursor(surah, ayah, this.settings);
    this.retry = 0;
    this._disarmStall();
    const url = this._url(this.cursor);
    // plan the standby first so it can be primed inside this gesture
    if (!this.single) {
      const nxt = nextCursor(this.cursor, this.settings, this._opts());
      const nurl = nxt ? this._url(nxt) : null;
      const sb = this.standby;
      if (nurl && nurl !== url && sb._url !== nurl) this._load(sb, nurl, 0, { lazy: true });
      this._prime();
    }
    const el = this.active;
    if (el._url === url && el.getAttribute('src') && !el.error) { try { el.currentTime = 0; } catch {} }
    else this._load(el, url);
    this._play(el);
    this._planNext();
    this._emit();
  }

  resume() {
    if (!this.cursor) return false;
    this._prime();
    const el = this.active;
    if (this.status === 'ended' || el.ended) { this._go({ ...this.cursor, rep: 0 }, { play: true }); return true; }
    if (!el.getAttribute('src') || el.error || el._url !== this._url(this.cursor)) this._load(el, this._url(this.cursor), el.currentTime || 0);
    this._play(el);
    this._emit();
    return true;
  }

  pause() {
    this.wantPlay = false;
    this.buffering = false;
    this._disarmStall();
    this._cancelFade();
    this.els.forEach(el => { try { el.pause(); } catch {} });
    if (this.status !== 'idle') this.status = 'paused';
    this._emit();
  }

  toggle() { if (this.wantPlay) { this.pause(); return true; } return this.resume(); }

  next() {
    if (!this.cursor) return;
    const nxt = nextCursor(this.cursor, this.settings, { skip: true });
    if (!nxt) { this._event({ type: 'finished', cursor: this.cursor }); return; }
    this._prime();
    this._go(nxt, { play: true });
  }

  prev() {
    if (!this.cursor) return;
    if (this.time > 3) { this.seek(0); if (!this.wantPlay) this.resume(); return; }
    const p = prevCursor(this.cursor, this.settings);
    if (!p) { this.seek(0); return; }
    this._prime();
    this._go(p, { play: true });
  }

  seek(t) {
    const el = this.active;
    if (!el || !this.duration) return;
    const v = Math.max(0, Math.min(this.duration - 0.05, t));
    try { if (el.fastSeek && Math.abs(v - el.currentTime) > 2) el.fastSeek(v); else el.currentTime = v; } catch {}
    this._emit();
  }
  seekBy(dt) { this.seek(this.time + dt); }

  setRate(r) {
    this.rate = r;
    this.els.forEach(el => { el.defaultPlaybackRate = r; el.playbackRate = r; });
    this._savePrefs();
    this._emit();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this._fading) this.els.forEach(el => { el.volume = this.volume; });
    this._savePrefs();
    this._emit();
  }

  configure(patch) {
    const before = this.settings;
    this.settings = { ...before, ...patch };
    if (this.cursor && (patch.mode && patch.mode !== before.mode)) this.cursor = { ...this.cursor, rep: 0, pass: 0 };
    if (this.cursor && ('rangeFrom' in patch || 'rangeTo' in patch)) this.cursor = { ...this.cursor, pass: 0 };
    this._savePrefs();
    this._planNext();
    this._emit();
  }

  /** 'off' | minutes (number) | 'surah' */
  setSleep(v) {
    clearTimeout(this._sleepTimer);
    this._cancelFade();
    if (v === 'off' || !v) this.sleep = { kind: 'off', endsAt: 0 };
    else if (v === 'surah') this.sleep = { kind: 'surah', endsAt: 0 };
    else {
      const ms = Number(v) * 60000;
      this.sleep = { kind: 'time', endsAt: Date.now() + ms, minutes: Number(v) };
      // the fade-out ends at the chosen time
      this._sleepTimer = setTimeout(() => this._sleepStop(), Math.max(0, ms - SLEEP_FADE_MS));
    }
    this._planNext();
    this._emit();
  }

  _cancelFade() {
    if (!this._fading) return;
    clearInterval(this._fading);
    this._fading = null;
    this.els.forEach(el => { el.volume = this.volume; });
  }

  // fade out over a few seconds, then pause
  _sleepStop(immediate = false) {
    if (this.sleep.kind !== 'time' || this._fading) return;
    clearTimeout(this._sleepTimer);
    const done = () => {
      this._cancelFade();
      this.sleep = { kind: 'off', endsAt: 0 };
      this.pause();
      this._event({ type: 'sleep-done' });
    };
    if (immediate || !this.wantPlay) { done(); return; }
    const el = this.active;
    const steps = 15;
    let i = 0;
    this._fading = setInterval(() => {
      i += 1;
      el.volume = Math.max(0, this.volume * (1 - i / steps));
      if (i >= steps) done();
    }, SLEEP_FADE_MS / steps);
  }

  stop() {
    this.pause();
    this.status = 'idle';
    this._emit();
  }
}

export const engine = new AudioEngine();
if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined') window.__nqAudio = engine;

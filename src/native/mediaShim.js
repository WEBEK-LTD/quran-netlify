// ─── Media Session shim for the Android app (no imports; installed first) ───
// Android's WebView keeps <audio> playing in the background but shows no media
// notification or lock-screen controls for navigator.mediaSession (only Chrome
// does). This shim sits in front of navigator.mediaSession before the recitation
// engine (src/audio/mediaSession.js) and the radio (pages/radio/mediaSession.js)
// attach to it, records metadata / state / handlers, still forwards them to the
// real object, and lets mediaBridge.js mirror them into a native MediaSession +
// media-playback foreground service (NQNativePlugin). iOS: WKWebView feeds the
// Now Playing centre itself, so nothing is installed there.
const subs = new Set();
const store = { metadata: null, playbackState: 'none', position: null, handlers: {} };

function emit() { subs.forEach(fn => { try { fn(store); } catch {} }); }

export function subscribeMedia(fn) { subs.add(fn); fn(store); return () => subs.delete(fn); }

export function installMediaShim() {
  try {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || cap.getPlatform() !== 'android') return;
    if (navigator.mediaSession && navigator.mediaSession.__nq) return;
    const real = navigator.mediaSession || null;
    if (typeof window.MediaMetadata === 'undefined') {
      window.MediaMetadata = class MediaMetadata {
        constructor(init = {}) { this.title = init.title || ''; this.artist = init.artist || ''; this.album = init.album || ''; this.artwork = init.artwork || []; }
      };
    }
    const shim = {
      __nq: true,
      get metadata() { return store.metadata; },
      set metadata(m) { store.metadata = m || null; try { if (real) real.metadata = m; } catch {} emit(); },
      get playbackState() { return store.playbackState; },
      set playbackState(s) { store.playbackState = s || 'none'; try { if (real) real.playbackState = s; } catch {} emit(); },
      setActionHandler(action, fn) {
        if (fn) store.handlers[action] = fn; else delete store.handlers[action];
        try { if (real) real.setActionHandler(action, fn); } catch {}
        emit();
      },
      setPositionState(p) {
        store.position = p && typeof p === 'object' ? { ...p, at: Date.now() } : null;
        try { if (real && real.setPositionState) real.setPositionState(p); } catch {}
        emit();
      },
      setMicrophoneActive() {}, setCameraActive() {},
    };
    Object.defineProperty(navigator, 'mediaSession', { value: shim, configurable: true });
  } catch {}
}

/** Native → page: run the handler the page registered for this action. */
export function runMediaAction(action, details = {}) {
  const fn = store.handlers[action] || (action === 'stop' ? store.handlers.pause : null);
  if (!fn) return false;
  try { fn({ action, ...details }); return true; } catch { return false; }
}

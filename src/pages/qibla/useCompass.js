// ─── Compass sensor hook ─────────────────────────────────────────────────────
// Android (Chrome / WebView): `deviceorientationabsolute` — alpha is relative to
//   magnetic north. The plain `deviceorientation` alpha there is relative to however
//   the phone was held when the page opened (the classic "wrong compass"), so it is
//   never used unless the event itself says `absolute: true`.
// iOS (Safari / WKWebView): `deviceorientation` + `webkitCompassHeading`, after
//   DeviceOrientationEvent.requestPermission() from a tap.
// Both are magnetic: the place's declination (WMM2025) is added → true north.
// Samples are smoothed once per animation frame on the unit circle (no 359→0 spin).
import { useCallback, useEffect, useRef, useState } from 'react';
import { headingFromEuler, headingFromWebkit, createAngleSmoother, createJumpDetector, angleDiff, norm360 } from './compass';

function screenAngle() {
  try {
    const a = window.screen && window.screen.orientation && window.screen.orientation.angle;
    if (typeof a === 'number') return a;
  } catch {}
  return typeof window.orientation === 'number' ? norm360(window.orientation) : 0;
}

const hasOrientation = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
const needsPermission = () => hasOrientation() && typeof window.DeviceOrientationEvent.requestPermission === 'function';

/**
 * status: 'listening' | 'needs-permission' | 'active' | 'unavailable' | 'denied'
 * heading: smoothed heading of the direction the user faces, degrees from TRUE north
 *          (magnetic + declination), or null
 * calibrate: true while the readings look unreliable (iOS accuracy, or jumpy samples)
 */
export function useCompass(declination = 0) {
  const [status, setStatus] = useState(() => (!hasOrientation() ? 'unavailable' : needsPermission() ? 'needs-permission' : 'listening'));
  const [heading, setHeading] = useState(null);
  const [calibrate, setCalibrate] = useState(false);
  const decl = useRef(declination);
  decl.current = declination || 0;
  const stopRef = useRef(null);
  const gotRef = useRef(false);

  const listen = useCallback(() => {
    if (stopRef.current) stopRef.current();
    if (!hasOrientation()) { setStatus('unavailable'); return; }
    const smoother = createAngleSmoother(140);
    const jumpy = createJumpDetector();
    let raw = null, poorUntil = 0, lastFrame = 0, shown = null, raf = 0, alive = true;
    const absoluteEvent = 'ondeviceorientationabsolute' in window;
    const evName = absoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation';

    const onSample = (e) => {
      let h = null;
      const now = performance.now();
      if (typeof e.webkitCompassHeading === 'number') {
        h = headingFromWebkit(e.webkitCompassHeading, screenAngle());
        const acc = e.webkitCompassAccuracy;
        if (typeof acc === 'number' && (acc < 0 || acc > 20)) poorUntil = now + 5000;
      } else if (e.type === 'deviceorientationabsolute' || e.absolute === true) {
        if (e.alpha == null) {
          // Chrome fires one event with null angles when there is no magnetometer
          if (!gotRef.current) setStatus('unavailable');
          return;
        }
        h = headingFromEuler(e.alpha, e.beta, e.gamma, screenAngle());
      }
      if (h == null) return;                 // relative alpha: useless as a compass
      if (jumpy(h, now)) poorUntil = now + 5000;
      raw = h;
      if (!gotRef.current) { gotRef.current = true; setStatus('active'); }
    };

    const frame = (t) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (raw == null) return;
      const dt = lastFrame ? Math.min(t - lastFrame, 200) : 16;
      lastFrame = t;
      const v = smoother.push(norm360(raw + decl.current), dt);
      if (shown == null || Math.abs(angleDiff(v, shown)) >= 0.25) { shown = v; setHeading(v); }
      setCalibrate(performance.now() < poorUntil);
    };

    gotRef.current = false;
    window.addEventListener(evName, onSample, true);
    raf = requestAnimationFrame(frame);
    const timer = setTimeout(() => { if (!gotRef.current) setStatus(s => (s === 'needs-permission' ? s : 'unavailable')); }, 3500);
    stopRef.current = () => {
      alive = false;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener(evName, onSample, true);
    };
  }, []);

  // Start right away; on iOS events only flow once permission was given, so the
  // state stays «needs permission» until a sample arrives or the user taps.
  useEffect(() => {
    if (hasOrientation()) listen();
    return () => { if (stopRef.current) stopRef.current(); };
  }, [listen]);

  /** From a tap: asks iOS for motion access, then (re)starts listening. */
  const enable = useCallback(async () => {
    if (!hasOrientation()) { setStatus('unavailable'); return; }
    if (needsPermission()) {
      try {
        const perm = await window.DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') { setStatus('denied'); return; }
      } catch { setStatus('denied'); return; }
    }
    setStatus('listening');
    listen();
  }, [listen]);

  return { status, heading, calibrate, enable };
}

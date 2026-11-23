// ─── Qibla compass maths (pure; unit-tested in scripts/test-qibla.mjs) ──────
// Bearing to the Kaaba on the great circle, heading from the orientation sensors
// (tilt- and screen-rotation-aware), angle wrap-around and needle smoothing.
// No DOM and no React here, so node --test can import it directly.

// الكعبة المشرّفة (centre of the Kaaba)
export const KAABA = { lat: 21.422487, lon: 39.826206 };

const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

/** Any angle → [0, 360). */
export function norm360(d) {
  const r = d % 360;
  return r < 0 ? r + 360 : r + 0;   // + 0 turns -0 into 0
}

/** Signed shortest turn from `from` to `to`, in (-180, 180]. Positive = clockwise. */
export function angleDiff(to, from) {
  const d = norm360(to - from);
  return d > 180 ? d - 360 : d;
}

/** Initial great-circle bearing from (lat, lon) to the Kaaba, degrees from TRUE north, clockwise. */
export function qiblaBearing(lat, lon) {
  const φ1 = toRad(lat), φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lon - lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return norm360(toDeg(Math.atan2(y, x)));
}

/** Great-circle distance to the Kaaba (km, mean Earth radius). */
export function kaabaDistanceKm(lat, lon) {
  const R = 6371.0088;
  const φ1 = toRad(lat), φ2 = toRad(KAABA.lat);
  const Δφ = φ2 - φ1, Δλ = toRad(KAABA.lon - lon);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compass heading (degrees from the sensor's north, clockwise) of the direction the
 * user faces, from W3C DeviceOrientation Euler angles (alpha about z, beta about x,
 * gamma about y; earth frame x = east, y = north, z = up) and the screen rotation.
 *
 * "Facing" = the screen's up edge projected on the ground while the phone lies flat or
 * tilted (roll doesn't move it), handing over smoothly to the back-camera direction
 * as the phone is raised upright (then the up edge points at the sky and its
 * projection — the plain `360 - alpha` — swings wildly). Both point the same way
 * in between, so the hand-over is seamless.
 * Returns null when no direction can be derived (missing angles).
 */
export function headingFromEuler(alpha, beta, gamma, screenAngle = 0) {
  if (alpha == null || isNaN(alpha)) return null;
  const a = toRad(alpha), b = toRad(beta || 0), g = toRad(gamma || 0), s = toRad(screenAngle || 0);
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  // R = Rz(alpha)·Rx(beta)·Ry(gamma); columns are the device axes in the earth frame
  const X = [cA * cG - sA * sB * sG, sA * cG + cA * sB * sG];   // device x (east, north components)
  const Y = [-sA * cB, cA * cB];                                 // device y
  const B = [-cA * sG - sA * sB * cG, -sA * sG + cA * sB * cG];  // device −z (out of the back)
  // the screen's "up" in device coordinates for screen.orientation.angle s: (sin s, cos s)
  const ue = Math.sin(s) * X[0] + Math.cos(s) * Y[0];
  const un = Math.sin(s) * X[1] + Math.cos(s) * Y[1];
  const hu = Math.hypot(ue, un), hb = Math.hypot(B[0], B[1]);
  // weight of the up edge: 1 up to ~55° of tilt, 0 from ~75° (nearly upright)
  const w = Math.min(1, Math.max(0, (hu - 0.26) / 0.31));
  let e = 0, n = 0;
  if (hu > 1e-6) { e += w * ue / hu; n += w * un / hu; }
  if (hb > 1e-6) { e += (1 - w) * B[0] / hb; n += (1 - w) * B[1] / hb; }
  if (Math.hypot(e, n) < 1e-6) return null;
  return norm360(toDeg(Math.atan2(e, n)));
}

/** iOS: webkitCompassHeading is the heading of the device's top edge; add the screen rotation. */
export function headingFromWebkit(webkitCompassHeading, screenAngle = 0) {
  if (typeof webkitCompassHeading !== 'number' || isNaN(webkitCompassHeading) || webkitCompassHeading < 0) return null;
  return norm360(webkitCompassHeading + (screenAngle || 0));
}

/**
 * Low-pass filter for angles. Works on the unit vector (sin, cos), so 359° → 1° moves
 * through 0°, never back round through 180°. `dt` in ms, `tau` = time constant in ms.
 */
export function createAngleSmoother(tau = 140) {
  let x = null, y = null;
  return {
    push(deg, dt = 16) {
      const r = toRad(deg);
      if (x === null) { x = Math.sin(r); y = Math.cos(r); }
      else {
        const k = 1 - Math.exp(-Math.max(0, dt) / tau);
        x += (Math.sin(r) - x) * k;
        y += (Math.cos(r) - y) * k;
      }
      return norm360(toDeg(Math.atan2(x, y)));
    },
    get value() { return x === null ? null : norm360(toDeg(Math.atan2(x, y))); },
    reset() { x = y = null; },
  };
}

/**
 * Continuous rotation for CSS: keeps adding the shortest turn so the dial never
 * spins the long way round when the heading crosses north (359° → 0°).
 */
export function unwrapTowards(prevContinuous, targetDeg) {
  if (prevContinuous == null || !isFinite(prevContinuous)) return targetDeg;
  return prevContinuous + angleDiff(targetDeg, prevContinuous);
}

/**
 * Detects an uncalibrated / disturbed magnetometer from big jumps between raw
 * samples that arrive close together (a real hand turn is smooth).
 * Returns a function: (rawDeg, nowMs) → true while readings look unreliable.
 */
export function createJumpDetector({ jump = 25, windowMs = 2500, count = 4 } = {}) {
  let last = null, lastAt = 0;
  const hits = [];
  return (deg, now) => {
    if (last !== null && now - lastAt < 250 && Math.abs(angleDiff(deg, last)) > jump) hits.push(now);
    last = deg; lastAt = now;
    while (hits.length && now - hits[0] > windowMs) hits.shift();
    return hits.length >= count;
  };
}

/** Facing the Qibla, with hysteresis so the confirmation doesn't flicker at the edge. */
export function isAligned(heading, bearing, wasAligned = false, enter = 4, leave = 8) {
  if (heading == null || bearing == null) return false;
  const d = Math.abs(angleDiff(bearing, heading));
  return wasAligned ? d <= leave : d <= enter;
}

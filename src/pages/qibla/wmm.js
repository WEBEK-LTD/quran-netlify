// ─── Magnetic declination (World Magnetic Model WMM2025) ────────────────────
// A phone compass points to MAGNETIC north (Android rotation-vector sensor and iOS
// webkitCompassHeading both do), while the Qibla bearing is from TRUE north. The
// difference — the declination — is ~5° in Cairo, ~3° in Riyadh, −13° in New York
// and up to 20°+ elsewhere, so it is added to every compass reading.
// Coefficients: NOAA NCEI / BGS, WMM2025 (public domain), valid 2025.0–2030.0;
// outside that span the model still degrades only slowly (secular variation).
// Pure JS, unit-tested in scripts/test-qibla.mjs.

const EPOCH = 2025.0;
const N = 12;
// index n*(n+1)/2 + m (n = 1..12, m = 0..n) — main field (nT) and secular variation (nT/yr)
const G = [0,-29351.8,-1410.8,-2556.6,2951.1,1649.3,1361,-2404.1,1243.8,453.6,895,799.5,55.7,-281.1,12.1,-233.2,368.9,187.2,-138.7,-142,20.9,64.4,63.8,76.9,-115.7,-40.9,14.9,-60.7,79.5,-77,-8.8,59.3,15.8,2.5,-11.1,14.2,23.2,10.8,-17.5,2,-21.7,16.9,15,-16.8,0.9,4.6,7.8,3,-0.2,-2.5,-13.1,2.4,8.6,-8.7,-12.9,-1.3,-6.4,0.2,2,-1,-0.6,-0.9,1.5,0.9,-2.7,-3.9,2.9,-1.5,-2.5,2.4,-0.6,-0.1,-0.6,-0.1,1.1,-1,-0.2,2.6,-2,-0.2,0.3,1.2,-1.3,0.6,0.6,0.5,-0.1,-0.4,-0.2,-1.3,-0.7];
const H = [0,0,4545.4,0,-3133.6,-815.1,0,-56.6,237.5,-549.5,0,278.6,-133.9,212,-375.6,0,45.4,220.2,-122.9,43,106.1,0,-18.4,16.8,48.8,-59.8,10.9,72.7,0,-48.9,-14.4,-1,23.4,-7.4,-25.1,-2.3,0,7.1,-12.6,11.4,-9.7,12.7,0.7,-5.2,3.9,0,-24.8,12.2,8.3,-3.3,-5.2,7.2,-0.6,0.8,10,0,3.3,0,2.4,5.3,-9.1,0.4,-4.2,-3.8,0.9,-9.1,0,0,2.9,-0.6,0.2,0.5,-0.3,-1.2,-1.7,-2.9,-1.8,-2.3,0,-1.3,0.7,1,-1.4,0,0.6,-0.1,0.8,0.1,-1,0.1,0.2];
const DG = [0,12,9.7,-11.6,-5.2,-8,-1.3,-4.2,0.4,-15.6,-1.6,-2.4,-6,5.6,-7,0.6,1.4,0,0.6,2.2,0.9,-0.2,-0.4,0.9,1.2,-0.9,0.3,0.9,0,-0.1,-0.1,0.5,-0.1,-0.8,-0.8,0.8,-0.1,0.2,0,0.5,-0.1,0.3,0.2,0,0.2,0,-0.1,0.1,0.3,-0.3,0,0.3,-0.1,0.1,-0.1,0.1,0,0.1,0.1,0,-0.3,0,-0.1,-0.1,0,0,0,0,0,0,0,-0.1,0,0,-0.1,-0.1,-0.1,-0.1,0,0,0,0,0,0,0.1,0,0,0,-0.1,0,-0.1];
const DH = [0,0,-21.5,0,-27.7,-12.1,0,4,-0.3,-4.1,0,-1.1,4.1,1.6,-4.4,0,-0.5,2.2,0.4,1.7,1.9,0,0.3,-1.6,-0.4,0.9,0.7,0.9,0,0.6,0.5,-0.8,0,-1,0.6,-0.2,0,-0.2,0.5,-0.4,0.4,-0.5,-0.6,0.3,0.2,0,-0.3,0.3,-0.3,0.3,0.2,-0.1,-0.2,0.4,0.1,0,0,0,-0.2,0.1,-0.1,0.1,0,-0.1,0.2,0,0,0,0.1,0,0.1,0,0,0.1,0,0,0,0,0,0,0,-0.1,0.1,0,0,0,0,0,0,0,-0.1];

const RE = 6371.2;                 // geomagnetic reference radius (km)
const A = 6378.137;                // WGS-84 semi-major axis (km)
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const rad = d => d * Math.PI / 180;

/** Decimal year of a Date (as the WMM software does). */
export function decimalYear(date = new Date()) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * Magnetic declination in degrees (east positive) at a place on the ellipsoid.
 * true heading = magnetic heading + declination
 */
export function declination(lat, lon, date = new Date(), altKm = 0) {
  if (!isFinite(lat) || !isFinite(lon)) return 0;
  lat = Math.max(-89.999, Math.min(89.999, lat));
  const dt = decimalYear(date) - EPOCH;
  const φ = rad(lat), λ = rad(lon);
  // geodetic → geocentric spherical
  const sφ = Math.sin(φ), cφ = Math.cos(φ);
  const Rc = A / Math.sqrt(1 - E2 * sφ * sφ);
  const p = (Rc + altKm) * cφ, z = (Rc * (1 - E2) + altKm) * sφ;
  const r = Math.hypot(p, z);
  const φc = Math.asin(z / r);
  const θ = Math.PI / 2 - φc;                     // geocentric colatitude
  const ct = Math.cos(θ), st = Math.sin(θ);
  // Schmidt semi-normalised associated Legendre functions and their θ-derivatives
  const P = [], dP = [];
  const at = (n, m) => n * (n + 1) / 2 + m;
  P[0] = 1; dP[0] = 0;
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      const i = at(n, m);
      if (m === n) {
        const k = n === 1 ? 1 : Math.sqrt(1 - 1 / (2 * n));
        const j = at(n - 1, n - 1);
        P[i] = k * st * P[j];
        dP[i] = k * (ct * P[j] + st * dP[j]);
      } else {
        const j1 = at(n - 1, m);
        const k2 = n - 2 >= m ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        const j2 = n - 2 >= m ? at(n - 2, m) : 0;
        const p2 = k2 ? P[j2] : 0, d2 = k2 ? dP[j2] : 0;
        const kn = Math.sqrt(n * n - m * m);
        P[i] = ((2 * n - 1) * ct * P[j1] - k2 * p2) / kn;
        dP[i] = ((2 * n - 1) * (ct * dP[j1] - st * P[j1]) - k2 * d2) / kn;
      }
    }
  }
  let X = 0, Y = 0, Z = 0;
  const ar = RE / r;
  let pow = ar * ar;                                 // (a/r)^(n+2), starting at n = 1
  for (let n = 1; n <= N; n++) {
    pow *= ar;
    for (let m = 0; m <= n; m++) {
      const i = at(n, m);
      const g = G[i] + dt * DG[i], h = H[i] + dt * DH[i];
      const cm = Math.cos(m * λ), sm = Math.sin(m * λ);
      const gh = g * cm + h * sm;
      X += pow * gh * dP[i];
      Y += pow * m * (g * sm - h * cm) * P[i];
      Z -= (n + 1) * pow * gh * P[i];
    }
  }
  Y /= st || 1e-12;
  // geocentric → geodetic north component (rotate by φc − φ)
  const ψ = φc - φ;
  const Xg = X * Math.cos(ψ) - Z * Math.sin(ψ);
  return Math.atan2(Y, Xg) * 180 / Math.PI;
}

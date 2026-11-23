// Unit tests for the Qibla compass maths: npm run test:native (node --test)
//   bearing to the Kaaba (great circle), heading from the orientation sensors
//   (tilt, screen rotation, iOS webkitCompassHeading), 359→0 wrap, smoothing,
//   calibration (jump) detection, alignment hysteresis, magnetic declination (WMM2025).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KAABA, norm360, angleDiff, qiblaBearing, kaabaDistanceKm, headingFromEuler, headingFromWebkit,
  createAngleSmoother, unwrapTowards, createJumpDetector, isAligned,
} from '../src/pages/qibla/compass.js';
import { declination, decimalYear } from '../src/pages/qibla/wmm.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(angleDiff(actual, expected)) <= tol, `${msg || ''} expected ${expected}±${tol}, got ${actual}`);

test('Kaaba coordinates', () => {
  assert.equal(KAABA.lat, 21.422487);
  assert.equal(KAABA.lon, 39.826206);
});

test('norm360 / angleDiff wrap around north', () => {
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(725), 5);
  assert.equal(norm360(360), 0);
  assert.equal(norm360(-360), 0);
  assert.equal(angleDiff(1, 359), 2);
  assert.equal(angleDiff(359, 1), -2);
  assert.equal(angleDiff(180, 0), 180);
  assert.equal(angleDiff(90, 270), 180);
  assert.equal(angleDiff(10, 10), 0);
});

test('Qibla bearing: published values (great circle, true north)', () => {
  // [city, lat, lon, published bearing]
  for (const [city, lat, lon, deg] of [
    ['New York', 40.7128, -74.0060, 58.48],
    ['London', 51.5074, -0.1278, 118.99],
    ['Cairo', 30.0444, 31.2357, 136.14],
    ['Jakarta', -6.2088, 106.8456, 295.15],
    ['Sydney', -33.8688, 151.2093, 277.50],
    ['Tokyo', 35.6762, 139.6503, 293.00],
    ['Istanbul', 41.0082, 28.9784, 151.62],
  ]) near(qiblaBearing(lat, lon), deg, 0.1, city);
  // due north of the Kaaba → south; due south → north; due west on the equator-ish → roughly east
  near(qiblaBearing(40, KAABA.lon), 180, 1e-9, 'north of Makkah');
  near(qiblaBearing(0, KAABA.lon), 0, 1e-9, 'south of Makkah');
  near(qiblaBearing(24.4672, 39.6111), 176.24, 0.1, 'Medina');
});

test('distance to the Kaaba', () => {
  assert.ok(Math.abs(kaabaDistanceKm(30.0444, 31.2357) - 1287) < 3, 'Cairo ≈ 1287 km');
  assert.ok(Math.abs(kaabaDistanceKm(40.7128, -74.0060) - 10306) < 15, 'New York ≈ 10306 km');
  assert.ok(kaabaDistanceKm(KAABA.lat, KAABA.lon) < 1e-6);
});

test('heading from Euler angles: phone flat', () => {
  // W3C alpha grows counter-clockwise: heading = 360 − alpha when flat and portrait
  near(headingFromEuler(0, 0, 0), 0, 1e-9);
  near(headingFromEuler(90, 0, 0), 270, 1e-9);
  near(headingFromEuler(270, 0, 0), 90, 1e-9);
  near(headingFromEuler(359, 0, 0), 1, 1e-9);
});

test('heading from Euler angles: tilted / upright (no swing)', () => {
  // pitching the phone up towards the face must not change where it points
  for (const beta of [10, 30, 45, 60, 80, 89, 90]) near(headingFromEuler(40, beta, 0), 320, 1e-6, `beta ${beta}`);
  // a little roll changes the reading only a little
  near(headingFromEuler(40, 30, 10), 320, 0.5, 'roll 10°, tilted');
  near(headingFromEuler(40, 0, 25), 320, 0.5, 'roll 25°, flat');
  near(headingFromEuler(40, 85, 8), 320, 10, 'roll 8°, upright');
  assert.equal(headingFromEuler(null, 0, 0), null);
});

test('heading from Euler angles: screen rotation', () => {
  near(headingFromEuler(0, 0, 0, 90), 90, 1e-9, 'landscape-primary');
  near(headingFromEuler(0, 0, 0, 180), 180, 1e-9, 'portrait upside down');
  near(headingFromEuler(10, 0, 0, 270), 260, 1e-9, 'landscape-secondary');
});

test('iOS webkitCompassHeading', () => {
  near(headingFromWebkit(350, 0), 350, 1e-9);
  near(headingFromWebkit(350, 90), 80, 1e-9);
  assert.equal(headingFromWebkit(-1), null, 'negative = invalid');
  assert.equal(headingFromWebkit(undefined), null);
});

test('smoothing crosses north the short way', () => {
  const s = createAngleSmoother(100);
  s.push(355, 16);
  let v;
  for (let i = 0; i < 10; i++) v = s.push(5, 16);
  // between 355 and 5 through 0, never near 180
  assert.ok(Math.abs(angleDiff(v, 0)) < 6, `went the long way: ${v}`);
  for (let i = 0; i < 200; i++) v = s.push(5, 16);
  near(v, 5, 0.01, 'converges');
  // a single wild sample only nudges the needle
  const t = createAngleSmoother(140);
  t.push(100, 16);
  near(t.push(280, 16), 100, 15, 'outlier damped');
});

test('continuous rotation for the dial', () => {
  assert.equal(unwrapTowards(null, -10), -10);
  assert.equal(unwrapTowards(-359, -1), -361);      // 359° → 1°: two degrees, not 358
  assert.equal(unwrapTowards(-1, -359), 1);
  assert.equal(unwrapTowards(720, 10), 730);
});

test('jumpy readings ask for calibration', () => {
  const d = createJumpDetector();
  let t = 0, bad = false;
  for (let i = 0; i < 30; i++) bad = d(100 + i, t += 50);       // smooth turn
  assert.equal(bad, false);
  for (let i = 0; i < 6; i++) bad = d(i % 2 ? 40 : 160, t += 50); // ±120° flips
  assert.equal(bad, true);
  bad = d(160, t += 3000);                                          // quiet again
  assert.equal(bad, false);
});

test('alignment with hysteresis', () => {
  assert.equal(isAligned(136, 136.14), true);
  assert.equal(isAligned(141, 136.14), false, 'enter needs ≤ 4°');
  assert.equal(isAligned(141, 136.14, true), true, 'stays until > 8°');
  assert.equal(isAligned(145, 136.14, true), false);
  assert.equal(isAligned(358, 2), true, 'across north');
  assert.equal(isAligned(null, 10), false);
});

test('magnetic declination (WMM2025)', () => {
  // reference values from the WMM2025 coefficients (geomagnetism npm package), 2026-11-23, sea level
  const d = new Date('2026-11-23T00:00:00Z');
  for (const [city, lat, lon, decl] of [
    ['Cairo', 30.0444, 31.2357, 4.774],
    ['Makkah', 21.4225, 39.8262, 3.501],
    ['New York', 40.7128, -74.006, -12.459],
    ['London', 51.5074, -0.1278, 1.229],
    ['Jakarta', -6.2, 106.8, 0.650],
    ['Istanbul', 41.0082, 28.9784, 6.084],
    ['Sydney', -33.87, 151.21, 12.830],
    ['Reykjavik', 64.1, -21.9, -10.979],
  ]) assert.ok(Math.abs(declination(lat, lon, d) - decl) < 0.01, `${city}: ${declination(lat, lon, d)} vs ${decl}`);
  assert.ok(Math.abs(decimalYear(new Date('2025-07-02T12:00:00Z')) - 2025.5) < 0.01);
  assert.equal(declination(NaN, 0), 0);
});

test('magnetic → true heading puts the Qibla where the sensor says', () => {
  // In New York the compass reads magnetic; facing the true Qibla (58.48°) it shows ~71°
  const d = new Date('2026-11-23T00:00:00Z');
  const decl = declination(40.7128, -74.006, d);
  const magneticReading = 58.48 - decl;
  near(norm360(magneticReading + decl), qiblaBearing(40.7128, -74.006), 0.05);
  assert.ok(isAligned(norm360(magneticReading + decl), qiblaBearing(40.7128, -74.006)));
});

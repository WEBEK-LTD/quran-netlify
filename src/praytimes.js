/*
 * PrayTimes.js — Prayer Times Calculator
 * Based on PrayTimes.org (LGPL v3), heavily adapted for nور القرآن
 * Supports: Egyptian, MWL, ISNA, Umm Al-Qura, Gulf, Kuwait, Qatar, Turkey, Morocco, etc.
 */

const DMath = {
  dtr: d => d * Math.PI / 180,
  rtd: r => r * 180 / Math.PI,
  sin: d => Math.sin(DMath.dtr(d)),
  cos: d => Math.cos(DMath.dtr(d)),
  tan: d => Math.tan(DMath.dtr(d)),
  arcsin: d => DMath.rtd(Math.asin(d)),
  arccos: d => DMath.rtd(Math.acos(d)),
  arctan: d => DMath.rtd(Math.atan(d)),
  arccot: x => DMath.rtd(Math.atan(1 / x)),
  arctan2: (y, x) => DMath.rtd(Math.atan2(y, x)),
  fix: (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; },
  fixAngle: a => DMath.fix(a, 360),
  fixHour: a => DMath.fix(a, 24),
};

// Calculation methods
export const METHODS = {
  MWL:      { name: '🌍 رابطة العالم الإسلامي',                fajrAngle: 18,   ishaAngle: 17 },
  ISNA:     { name: '🇺🇸 الجمعية الإسلامية أمريكا الشمالية',   fajrAngle: 15,   ishaAngle: 15 },
  Egypt:    { name: '🇪🇬 الهيئة المصرية العامة للمساحة',        fajrAngle: 19.5, ishaAngle: 17.5 },
  Makkah:   { name: '🕌 جامعة أم القرى (السعودية)',             fajrAngle: 18.5, ishaMins: 90 },
  Karachi:  { name: '🇵🇰 جامعة العلوم الإسلامية كراتشي',       fajrAngle: 18,   ishaAngle: 18 },
  Tehran:   { name: '🇮🇷 معهد الجيوفيزياء طهران',              fajrAngle: 17.7, ishaAngle: 14, maghribAngle: 4.5, midnight: 'Jafari' },
  Jafari:   { name: '🕌 الشيعة الجعفرية',                      fajrAngle: 16,   ishaAngle: 14, maghribAngle: 4, midnight: 'Jafari' },
  Kuwait:   { name: '🇰🇼 الكويت',                              fajrAngle: 18,   ishaAngle: 17.5 },
  Qatar:    { name: '🇶🇦 قطر',                                 fajrAngle: 18,   ishaMins: 90 },
  Singapore:{ name: '🇸🇬 سنغافورة',                            fajrAngle: 20,   ishaAngle: 18 },
  Turkey:   { name: '🇹🇷 رئاسة الشؤون الدينية تركيا',          fajrAngle: 18,   ishaAngle: 17, midnight: 'Jafari' },
  Morocco:  { name: '🇲🇦 المغرب',                              fajrAngle: 19,   ishaAngle: 17 },
  France:   { name: '🇫🇷 الاتحاد الإسلامي فرنسا',              fajrAngle: 12,   ishaAngle: 12 },
  Russia:   { name: '🇷🇺 روسيا',                               fajrAngle: 16,   ishaAngle: 15 },
  Gulf:     { name: '🌊 منطقة الخليج',                         fajrAngle: 19.5, ishaMins: 90 },
};

function julianDate(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545;
  const g = DMath.fixAngle(357.529 + 0.98560028 * D);
  const q = DMath.fixAngle(280.459 + 0.98564736 * D);
  const L = DMath.fixAngle(q + 1.915 * DMath.sin(g) + 0.02 * DMath.sin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = DMath.rtd(Math.atan2(DMath.cos(e) * DMath.sin(L), DMath.cos(L))) / 15;
  const EqT = q / 15 - DMath.fix(RA, 24);
  const Decl = DMath.arcsin(DMath.sin(e) * DMath.sin(L));
  return { declination: Decl, equation: EqT };
}

function equationOfTime(jd) { return sunPosition(jd).equation; }
function sunDeclination(jd) { return sunPosition(jd).declination; }

function computeMidDay(t, jd) {
  return DMath.fixHour(12 - equationOfTime(jd + t));
}

function sunAngleTime(jd, lat, angle, time, direction) {
  const decl = sunDeclination(jd + time);
  const noon = computeMidDay(time, jd);
  const cosVal = (-DMath.sin(angle) - DMath.sin(decl) * DMath.sin(lat)) /
                 (DMath.cos(decl) * DMath.cos(lat));
  if (Math.abs(cosVal) > 1) return NaN;
  const t = DMath.arccos(cosVal) / 15;
  return noon + (direction === 'ccw' ? -t : t);
}

function asrTime(jd, lat, factor, time) {
  const decl = sunDeclination(jd + time);
  const angle = -DMath.arccot(factor + DMath.tan(Math.abs(lat - decl)));
  return sunAngleTime(jd, lat, angle, time, 'cw');
}

export function calcPrayerTimes(date, lat, lon, methodKey = 'Egypt') {
  const m = METHODS[methodKey] || METHODS.Egypt;
  const timezone = -date.getTimezoneOffset() / 60; // auto from device
  const jd = julianDate(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lon / (15 * 24);

  // Time iterators (initial guesses)
  let times = { Fajr: 5, Sunrise: 6, Dhuhr: 12, Asr: 13, Sunset: 18, Maghrib: 18, Isha: 18 };

  // Iterate 4 times for accuracy
  for (let i = 0; i < 4; i++) {
    times.Fajr   = sunAngleTime(jd, lat, m.fajrAngle, times.Fajr, 'ccw');
    times.Sunrise = sunAngleTime(jd, lat, 0.833, times.Sunrise, 'ccw');
    times.Dhuhr  = computeMidDay(times.Dhuhr, jd);
    times.Asr    = asrTime(jd, lat, 1, times.Asr); // Shafi'i = 1
    times.Sunset = sunAngleTime(jd, lat, 0.833, times.Sunset, 'cw');
    times.Maghrib = m.maghribAngle
      ? sunAngleTime(jd, lat, m.maghribAngle, times.Maghrib, 'cw')
      : times.Sunset;
    if (m.ishaMins) {
      times.Isha = times.Maghrib + m.ishaMins / 60;
    } else {
      times.Isha = sunAngleTime(jd, lat, m.ishaAngle, times.Isha, 'cw');
    }
  }

  // Convert to local time
  const toLocal = t => DMath.fixHour(t + timezone);
  const toHHMM = t => {
    if (isNaN(t)) return '--:--';
    const total = Math.round(toLocal(t) * 60);
    const h = Math.floor(total / 60) % 24;
    const min = total % 60;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  };

  return {
    Fajr:    toHHMM(times.Fajr),
    Sunrise: toHHMM(times.Sunrise),
    Dhuhr:   toHHMM(times.Dhuhr),
    Asr:     toHHMM(times.Asr),
    Maghrib: toHHMM(times.Maghrib),
    Isha:    toHHMM(times.Isha),
  };
}

export function getMethodList() {
  return Object.entries(METHODS).map(([id, m]) => ({ id, name: m.name }));
}

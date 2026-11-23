// ─── Qibla rose: 32-point compass star with the Kaaba marker on the bearing ──
// Shared by the qibla page (large, turns with the device) and the prayer page
// (small card). Pure SVG; colours come from theme tokens.
import { toAr } from '../../components/ornaments/Ornaments';
import { useTr, num, intlLocale } from '../../l10n';
import { getLang } from '../../i18n';

// الكعبة المشرفة
export const KAABA = { lat: 21.4225, lon: 39.8262 };

const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

// اتجاه القبلة من الشمال الحقيقي (بالدرجات)
export function calcQibla(lat, lon) {
  const φ1 = toRad(lat), λ1 = toRad(lon);
  const φ2 = toRad(KAABA.lat), λ2 = toRad(KAABA.lon);
  const Δλ = λ2 - λ1;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// المسافة إلى الكعبة بالكيلومتر
export function calcDistance(lat, lon) {
  const R = 6371;
  const φ1 = toRad(lat), φ2 = toRad(KAABA.lat);
  const Δφ = toRad(KAABA.lat - lat), Δλ = toRad(KAABA.lon - lon);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function fmtKm(n, lang = getLang()) {
  if (lang === 'ar') return toAr(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬'));
  try { return num(Math.round(n).toLocaleString(intlLocale(lang), { numberingSystem: 'latn' }), lang); }
  catch { return num(Math.round(n), lang); }
}

const pt = (deg, r) => {
  const a = (deg - 90) * Math.PI / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};

const STAR = (() => {
  let s = '';
  for (let k = 0; k < 32; k++) {
    const R = k % 4 === 0 ? 110 : (k % 2 === 0 ? 62 : 30);
    const [x, y] = pt(k * 11.25, R);
    s += `${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return s.trim();
})();

// Cardinal letters: شمال / شرق / جنوب / غرب in Arabic and Urdu, N E S W in Latin-script languages
const CARD_AR = [['ش', 0], ['ق', 90], ['ج', 180], ['غ', 270]];
const CARD_LATIN = { en: 'NESW', tr: 'KDGB', fr: 'NESO', id: 'UTSB' };

/**
 * bearing  qibla bearing from true north (deg) or null
 * heading  device heading (deg) or null → the dial turns by -heading
 * large    adds degree numbers, fine ticks and the fixed forward marker
 */
export default function QiblaRose({ bearing, heading = null, large = false, aligned = false, className = '', label }) {
  const tr = useTr();
  const latin = CARD_LATIN[tr.lang];
  const CARD = latin ? [...latin].map((c, i) => [c, i * 90]) : CARD_AR;
  const rot = heading != null ? -heading : 0;
  const ticks = [];
  const step = large ? 5 : 10;
  for (let d = 0; d < 360; d += step) {
    const major = d % 90 === 0, mid = d % 30 === 0;
    const [x1, y1] = pt(d, major ? 136 : mid ? 140 : 144);
    const [x2, y2] = pt(d, 150);
    ticks.push(
      <line key={d} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
        style={{ stroke: major ? 'var(--gold)' : 'var(--muted)' }} strokeWidth={major ? 1.6 : 1} strokeOpacity={major || mid ? 1 : .55} />
    );
  }
  const q = bearing != null ? pt(bearing, 124) : null;
  const aria = label || (bearing != null ? tr('القبلة {deg} درجة من الشمال', { deg: toAr(Math.round(bearing)) }) : tr('بوصلة القبلة'));

  return (
    <svg className={className} viewBox={large ? '-178 -178 356 356' : '-160 -160 320 320'} role="img" aria-label={aria}>
      {large && (
        <path d="M0 -176 L-9 -160 H9 Z" style={{ fill: aligned ? 'var(--ok)' : 'var(--gold)' }} />
      )}
      <g style={{ transform: `rotate(${rot}deg)`, transition: 'transform .25s ease-out' }}>
        <circle r="150" style={{ fill: 'var(--surface)', stroke: 'var(--line2)' }} strokeWidth="1" />
        <circle r="128" fill="none" style={{ stroke: 'var(--line)' }} strokeWidth="1" />
        {large && <circle r="96" fill="none" style={{ stroke: 'var(--line2)' }} strokeDasharray="2 6" />}
        {ticks}
        {large && [30, 60, 120, 150, 210, 240, 300, 330].map(d => {
          const [x, y] = pt(d, 162);
          return (
            <text key={d} x={x.toFixed(1)} y={(y + 4).toFixed(1)} textAnchor="middle"
              transform={`rotate(${-rot} ${x.toFixed(1)} ${(y).toFixed(1)})`}
              style={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'var(--f-ui)' }}>{toAr(d)}</text>
          );
        })}
        <polygon points={STAR} style={{ fill: 'var(--hl)', stroke: 'var(--gold)' }} strokeWidth="1.2" strokeLinejoin="round" />
        {CARD.map(([c, d]) => {
          const [x, y] = pt(d, 118);
          return (
            <text key={c} x={x.toFixed(1)} y={(y + 5).toFixed(1)} textAnchor="middle"
              transform={`rotate(${-rot} ${x.toFixed(1)} ${y.toFixed(1)})`}
              style={{ fill: d === 0 ? 'var(--gold)' : 'var(--text)', fontSize: 15, fontWeight: 700, fontFamily: 'var(--f-ui)' }}>{c}</text>
          );
        })}
        {q && (
          <>
            <line x1="0" y1="0" x2={q[0].toFixed(1)} y2={q[1].toFixed(1)} style={{ stroke: 'var(--emerald)' }} strokeWidth={large ? 4 : 3} strokeLinecap="round" />
            <line x1="0" y1="0" x2={(-q[0] * .35).toFixed(1)} y2={(-q[1] * .35).toFixed(1)} style={{ stroke: 'var(--muted)' }} strokeWidth="2" strokeLinecap="round" strokeOpacity=".6" />
            <g transform={`translate(${q[0].toFixed(1)} ${q[1].toFixed(1)}) rotate(${-rot})`}>
              {aligned && <circle r="20" style={{ fill: 'var(--glow)' }} />}
              <rect x="-11" y="-11" width="22" height="22" rx="2" style={{ fill: 'var(--text)', stroke: 'var(--surface)' }} strokeWidth="1.5" />
              <rect x="-11" y="-5" width="22" height="3" style={{ fill: 'var(--gold)' }} />
            </g>
          </>
        )}
      </g>
      <circle r="7" style={{ fill: 'var(--gold)', stroke: 'var(--surface)' }} strokeWidth="2" />
    </svg>
  );
}

// ─── Ornaments: the shared visual language of the site ──────────────────────
// <OrnamentDefs/> is mounted once (App.jsx). It holds the SVG sprite: line
// icons, eight-point stars, rosette ayah markers, and the girih + frieze
// patterns. Everything else references it with <use href="#…">.
// Icons are plain line drawings — no emoji, and nothing that signals "AI".
import { num, trNow } from '../../l10n';

// Girih tile: {8/3} and {8/2} stars at the centre and corners of a 96px cell.
function girihPath() {
  const star = (cx, cy, R, step, rot) => {
    const p = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 + rot) * Math.PI / 180;
      p.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    let s = '';
    for (let j = 0; j < 8; j++) {
      const a1 = p[j], b = p[(j + step) % 8];
      s += `M${a1[0].toFixed(2)} ${a1[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
    }
    return s;
  };
  let d = '';
  [[48, 48], [0, 0], [96, 0], [0, 96], [96, 96]].forEach(([x, y]) => { d += star(x, y, 34, 3, 22.5) + star(x, y, 18, 2, 0); });
  return d + 'M48 14L48 0M48 82L48 96M14 48L0 48M82 48L96 48';
}
const GIRIH = girihPath();

// name → inner SVG (24×24 line icons)
const ICONS = {
  home: '<path d="M3.5 11 12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M3.5 5.5c3-1.6 6-1.6 8.5 0 2.5-1.6 5.5-1.6 8.5 0V19c-3-1.6-6-1.6-8.5 0-2.5-1.6-5.5-1.6-8.5 0z M12 5.5V19"/>',
  head: '<path d="M4 15v-3a8 8 0 0 1 16 0v3 M4 14.5h3.2v6H5a1 1 0 0 1-1-1z M20 14.5h-3.2v6H19a1 1 0 0 0 1-1z"/>',
  grid: '<path d="M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z"/>',
  mosque: '<path d="M4 20.5V12h16v8.5 M2.5 20.5h19 M7 12a5 5 0 0 1 10 0 M12 4.5V7 M10.5 20.5v-4a1.5 1.5 0 0 1 3 0v4 M3 12V7.5 M21 12V7.5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M7 5h3.5v14H7z M13.5 5H17v14h-3.5z"/>',
  next: '<path d="M6 6l9 6-9 6z M18 6v12"/>',
  prev: '<path d="M18 6l-9 6 9 6z M6 6v12"/>',
  repeat: '<path d="M17 3l3 3-3 3 M4 12v-2a4 4 0 0 1 4-4h12 M7 21l-3-3 3-3 M20 12v2a4 4 0 0 1-4 4H4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  beads: '<circle cx="12" cy="4.5" r="1.6"/><circle cx="17.3" cy="6.7" r="1.6"/><circle cx="19.5" cy="12" r="1.6"/><circle cx="17.3" cy="17.3" r="1.6"/><circle cx="6.7" cy="6.7" r="1.6"/><circle cx="4.5" cy="12" r="1.6"/><circle cx="6.7" cy="17.3" r="1.6"/><path d="M12 19v2.5"/>',
  radio: '<path d="M4 9.5h16v10H4z M8 9.5 16 4.5"/><circle cx="15" cy="14.5" r="2.4"/><path d="M7 13h3 M7 16h3"/>',
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.4 6.4 0 0 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4"/>',
  doc: '<path d="M6 3.5h8.5l3.5 3.5v13.5H6z M9 11h6.5 M9 14.5h6.5 M9 18h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4 M8.2 13.2l7.6 4"/>',
  copy: '<path d="M8 8h11v12H8z M5 16V4h11"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z M10 20.5h4"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 2 M9.5 2.5h5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0 M15.5 5a3 3 0 0 1 0 6 M17 13.6a5.5 5.5 0 0 1 4 5.9"/>',
  menu: '<path d="M4 7h16 M4 12h16 M4 17h16"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  aa: '<path d="M3 18 7.5 6 12 18 M4.7 13.5h5.6 M14 18l3.3-8.5L20.5 18 M15.2 15.2h4.3"/>',
  list: '<path d="M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01"/>',
  star: '<path d="M7 7h10v10H7z M12 4.9 19.1 12 12 19.1 4.9 12z"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.4l2.5 2.5 5-5.4"/>',
  chart: '<path d="M4 20h16 M7 16v-5 M12 16V7 M17 16v-8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M9 20h6"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z M14 7l3 3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  phone: '<path d="M7.5 2.5h9v19h-9z M11 18.5h2"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/>',
  x: '<path d="M6 6l12 12 M18 6 6 18"/>',
  chev: '<path d="M6 9.5l6 6 6-6"/>',
  back: '<path d="M9.5 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  scroll: '<path d="M7 4.5h11a2 2 0 0 1 2 2v1H9 M7 4.5a2 2 0 0 0-2 2V17a2.5 2.5 0 0 0 2.5 2.5H17a2 2 0 0 0 2-2V7.5 M7 4.5a2 2 0 0 1 2 2V17 M11.5 11h4.5 M11.5 14.5h4.5"/>',
  calendar: '<path d="M4 6h16v14H4z M4 10h16 M8.5 3.5v4 M15.5 3.5v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1"/>',
  logout: '<path d="M14 4.5h4.5v15H14 M10 8l-4 4 4 4 M6 12h9"/>',
  lock: '<path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17 M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5S14.6 18.1 12 20.5 M12 3.5C9.4 5.9 8.2 8.7 8.2 12s1.2 6.1 3.8 8.5"/>',
  download: '<path d="M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19.5h14"/>',
  plus: '<path d="M12 5v14 M5 12h14"/>',
  live: '<circle cx="12" cy="11" r="2"/><path d="M8.5 14.5a5 5 0 0 1 0-7M15.5 7.5a5 5 0 0 1 0 7M5.6 17.4a9 9 0 0 1 0-12.8M18.4 4.6a9 9 0 0 1 0 12.8"/>',
  shieldUser: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><circle cx="12" cy="10" r="2.3"/><path d="M8.5 16a3.6 3.6 0 0 1 7 0"/>',
};

export function OrnamentDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="nq-frieze" width="44" height="30" patternUnits="userSpaceOnUse">
          <g fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth="1">
            <path d="M0 2.5H44 M0 27.5H44 M0 5.5H44 M0 24.5H44" strokeOpacity=".6" />
            <path d="M15.5 10.5h13v9h-13z M22 8.6 28.4 15 22 21.4 15.6 15z" style={{ fill: 'var(--hl)' }} />
            <circle cx="22" cy="15" r="1.6" style={{ fill: 'var(--gold)' }} />
            <path d="M0 15 4 11 8 15 4 19Z M44 15 40 11 36 15 40 19Z" style={{ fill: 'var(--gold)' }} fillOpacity=".55" />
          </g>
        </pattern>
        <pattern id="nq-girih" width="96" height="96" patternUnits="userSpaceOnUse">
          <path d={GIRIH} fill="none" style={{ stroke: 'var(--gold)' }} strokeWidth="1" />
        </pattern>
      </defs>
      <symbol id="nq-star8" viewBox="0 0 40 40"><path d="M8.5 8.5h23v23h-23z M20 3.7 36.3 20 20 36.3 3.7 20z" fill="none" stroke="currentColor" strokeWidth="1.4" /></symbol>
      <symbol id="nq-star8f" viewBox="0 0 40 40"><path d="M8.5 8.5h23v23h-23z M20 3.7 36.3 20 20 36.3 3.7 20z" style={{ fill: 'var(--hl)' }} stroke="currentColor" strokeWidth="1.3" /></symbol>
      <symbol id="nq-rosette" viewBox="0 0 40 40"><path d="M9 9h22v22H9z M20 4.4 35.6 20 20 35.6 4.4 20z" style={{ fill: 'var(--page)' }} stroke="currentColor" strokeWidth="1.6" /><circle cx="20" cy="20" r="9.6" style={{ fill: 'var(--page)' }} stroke="currentColor" strokeWidth="1.1" /></symbol>
      <symbol id="nq-corner" viewBox="0 0 30 30"><path d="M2 14V2h12 M6 18V6h12" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M15 9.5 20.5 15 15 20.5 9.5 15z" fill="currentColor" /></symbol>
      <symbol id="nq-cornerBig" viewBox="0 0 40 40"><path d="M3 3h18 M3 3v18 M7 7h10 M7 7v10" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M14 14 20 11 26 14 29 20 26 26 20 29 14 26 11 20Z" style={{ fill: 'var(--hl)' }} stroke="currentColor" strokeWidth="1.2" /><circle cx="20" cy="20" r="3" fill="currentColor" /><circle cx="3" cy="3" r="2" fill="currentColor" /></symbol>
      {Object.entries(ICONS).map(([k, v]) => (
        <symbol key={k} id={`nq-i-${k}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: v }} />
      ))}
    </svg>
  );
}

export function Icon({ name, fill = false, className = '', style, title }) {
  return (
    <svg className={`nq-ico${fill ? ' fill' : ''}${className ? ' ' + className : ''}`} style={style} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <use href={`#nq-i-${name}`} />
    </svg>
  );
}

// Eight-point star badge holding an icon or a number.
export function Badge8({ icon, children, size, className = '', style }) {
  const st = size ? { width: size, height: size, ...style } : style;
  return (
    <span className={`nq-badge8 ${className}`} style={st} aria-hidden={icon ? 'true' : undefined}>
      <svg className="st"><use href="#nq-star8f" /></svg>
      {icon ? <Icon name={icon} /> : <b className="nq-num">{children}</b>}
    </span>
  );
}

// Rosette ayah marker with the ayah number in Arabic-Indic digits.
export function AyahMark({ n }) {
  return (
    <span className="nq-am" aria-label={`${trNow('الآية')} ${n}`}>
      <svg aria-hidden="true"><use href="#nq-rosette" /></svg>
      <b aria-hidden="true">{arDigits(n)}</b>
    </span>
  );
}

export function Pattern({ style }) {
  return (
    <svg className="nq-pattern" style={style} aria-hidden="true">
      <rect width="100%" height="100%" fill="url(#nq-girih)" />
    </svg>
  );
}

export function Frieze({ className = '', style }) {
  return (
    <div className={`nq-frieze ${className}`} style={style} aria-hidden="true">
      <svg><rect width="100%" height="100%" fill="url(#nq-frieze)" /></svg>
    </div>
  );
}

export function Divider({ style }) {
  return <div className="nq-divider" style={style} aria-hidden="true"><svg><use href="#nq-star8" /></svg></div>;
}

export function Corners() {
  return (
    <>
      <svg className="nq-corner tl" aria-hidden="true"><use href="#nq-corner" /></svg>
      <svg className="nq-corner tr" style={{ transform: 'scaleX(-1)' }} aria-hidden="true"><use href="#nq-corner" /></svg>
      <svg className="nq-corner bl" style={{ transform: 'scaleY(-1)' }} aria-hidden="true"><use href="#nq-corner" /></svg>
      <svg className="nq-corner br" style={{ transform: 'scale(-1)' }} aria-hidden="true"><use href="#nq-corner" /></svg>
    </>
  );
}

// Mihrab arch drawn behind page titles.
function PageArch() {
  return (
    <svg className="ph-arch" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
      <path d="M20 400V200C20 120 170 50 300 16 430 50 580 120 580 200V400Z M38 400V206C38 132 180 70 300 38 420 70 562 132 562 206V400Z" fill="url(#nq-girih)" fillRule="evenodd" />
      <path d="M20 400V200C20 120 170 50 300 16 430 50 580 120 580 200V400" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M38 400V206C38 132 180 70 300 38 420 70 562 132 562 206V400" fill="none" stroke="currentColor" strokeOpacity=".5" />
    </svg>
  );
}

// Hero at the top of every inner page.
export function PageHero({ eyebrow, title, sub, ayah, ayahRef, children }) {
  return (
    <header className="nq-phero">
      <Pattern />
      <PageArch />
      {eyebrow && <span className="nq-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {ayah && <p className="ph-ayah" lang="ar" dir="rtl">﴿{ayah}﴾</p>}
      {ayah && ayahRef && <p className="ph-ref">{ayahRef}</p>}
      {sub && <p className="ph-sub">{sub}</p>}
      {children && <div className="ph-acts">{children}</div>}
      <Frieze />
    </header>
  );
}

// Slowly turning shamsa (sun medallion).
export function Shamsa({ className = '' }) {
  let pts = '';
  for (let k = 0; k < 32; k++) {
    const a = (k * 11.25 - 90) * Math.PI / 180, R = k % 2 ? 120 : 190;
    pts += `${(R * Math.cos(a)).toFixed(1)},${(R * Math.sin(a)).toFixed(1)} `;
  }
  return (
    <svg className={className} viewBox="-200 -200 400 400" aria-hidden="true">
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle r="120" fill="none" stroke="currentColor" />
      <circle r="96" fill="none" stroke="currentColor" strokeDasharray="2 6" />
      {Array.from({ length: 16 }, (_, j) => (
        <path key={j} transform={`rotate(${j * 22.5})`} d="M0 -40 C 14 -60 14 -80 0 -96 C -14 -80 -14 -60 0 -40Z" fill="none" stroke="currentColor" />
      ))}
    </svg>
  );
}

// 30-petal rosette. states: array of 'done' | 'taken' | 'mine' | 'free'.
export function Rosette({ states, label, onPetal, titles, hideCount = false, className = '', style }) {
  const n = states.length || 30;
  const step = 360 / n;
  const done = states.filter(x => x === 'done').length;
  return (
    <svg className={className} style={style} viewBox="-190 -190 380 380" role="img" aria-label={label}>
      <circle r="182" fill="none" style={{ stroke: 'var(--line2)' }} />
      <circle r="64" style={{ fill: 'var(--surface)', stroke: 'var(--gold)' }} strokeWidth="1.4" />
      {states.map((st, i) => {
        const fill = st === 'done' ? 'var(--ok)' : (st === 'taken' || st === 'mine') ? 'var(--warn)' : 'var(--none)';
        return (
          <path key={i} transform={`rotate(${i * step})`} d="M0 -72 C 15 -104 15 -142 0 -176 C -15 -142 -15 -104 0 -72Z"
            style={{ fill, stroke: 'var(--surface)', cursor: onPetal ? 'pointer' : undefined }} strokeWidth="1.5" opacity={st === 'taken' ? .55 : 1}
            onClick={onPetal ? () => onPetal(i) : undefined}
            role={onPetal ? 'button' : undefined} tabIndex={onPetal ? 0 : undefined}
            aria-label={onPetal && titles ? titles[i] : undefined}
            onKeyDown={onPetal ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPetal(i); } }) : undefined}>
            {titles && <title>{titles[i]}</title>}
          </path>
        );
      })}
      {hideCount ? (
        <g style={{ color: 'var(--gold)' }}><use href="#nq-star8" x="-28" y="-28" width="56" height="56" /></g>
      ) : (<>
        <text textAnchor="middle" y="-4" style={{ fill: 'var(--gold)', fontSize: 34, fontWeight: 700, fontFamily: 'var(--f-ui)' }}>
          {toAr(done)}<tspan style={{ fill: 'var(--muted)', fontSize: 18 }}> / {toAr(n)}</tspan>
        </text>
        <text textAnchor="middle" y="24" style={{ fill: 'var(--muted)', fontSize: 13, fontFamily: 'var(--f-ui)' }}>{trNow('تمّت قراءته')}</text>
      </>)}
    </svg>
  );
}

// Digits in the visitor's language (Arabic-Indic for ar, Urdu digits for ur, Latin otherwise).
export function toAr(n) { return num(n); }

// Always Arabic-Indic: for ayah markers inside Quran text.
function arDigits(n) { return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }

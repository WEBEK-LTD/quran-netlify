// ─── The closed gift ─────────────────────────────────────────────────────────
// An inline drawing in the site's palette: an emerald box with girih tiling,
// a gold ribbon and bow, and an eight-point star seal on the knot. It breathes
// and wobbles a little while closed; `opening` plays the lid-off sequence.
// Purely decorative (aria-hidden): the button around it carries the label.
import { useId } from 'react';
import styles from './Gift.module.css';

// eight-point star (two squares) centred on 0,0
const star = (r) => {
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const a = (k * 22.5 - 90) * Math.PI / 180;
    const R = k % 2 ? r * 0.76 : r;
    pts.push(`${(R * Math.cos(a)).toFixed(2)},${(R * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
};

export default function Gift({ opening = false, className = '', size }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = n => `g${uid}-${n}`;
  const url = n => `url(#${id(n)})`;
  return (
    <span className={`${styles.gift} ${opening ? styles.opening : ''} ${className}`} style={size ? { width: size } : undefined} aria-hidden="true">
      <svg viewBox="0 0 200 200" className={styles.svg} focusable="false">
        <defs>
          <radialGradient id={id('glow')} cx="50%" cy="55%" r="50%">
            <stop offset="0" style={{ stopColor: 'var(--gold2)', stopOpacity: .55 }} />
            <stop offset=".55" style={{ stopColor: 'var(--gold)', stopOpacity: .14 }} />
            <stop offset="1" style={{ stopColor: 'var(--gold)', stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id={id('box')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gift-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gift-b)' }} />
          </linearGradient>
          <linearGradient id={id('lid')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gift-lid)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gift-a)' }} />
          </linearGradient>
          <linearGradient id={id('rib')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--gift-rib-c)' }} />
            <stop offset=".45" style={{ stopColor: 'var(--gift-rib-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gift-rib-b)' }} />
          </linearGradient>
          <linearGradient id={id('bow')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gift-rib-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gift-rib-b)' }} />
          </linearGradient>
          <clipPath id={id('body')}><rect x="38" y="96" width="124" height="84" rx="6" /></clipPath>
        </defs>

        <circle className={styles.glow} cx="100" cy="112" r="96" fill={url('glow')} />
        <ellipse className={styles.shadow} cx="100" cy="186" rx="64" ry="6" />

        <g className={styles.body}>
          <rect x="38" y="96" width="124" height="84" rx="6" fill={url('box')} className={styles.edge} />
          <g clipPath={url('body')} className={styles.tiling}>
            <rect x="38" y="96" width="124" height="84" fill="url(#nq-girih)" />
          </g>
          <rect x="45" y="103" width="110" height="70" rx="3" fill="none" className={styles.trim} />
          <rect x="90" y="96" width="20" height="84" fill={url('rib')} />
          <rect x="38" y="96" width="124" height="5" className={styles.lidShade} />
        </g>

        <g className={styles.lid}>
          <rect x="30" y="76" width="140" height="24" rx="5" fill={url('lid')} className={styles.edge} />
          <rect x="30" y="76" width="140" height="3" rx="1.5" className={styles.lidShine} />
          <rect x="90" y="76" width="20" height="24" fill={url('rib')} />
          {/* bow: two loops and two tails, seal on the knot */}
          <path d="M97 75 89 97 94 94.5 97 101 103 75Z" fill={url('bow')} className={styles.bowEdge} transform="rotate(14 100 75)" />
          <path d="M103 75 111 97 106 94.5 103 101 97 75Z" fill={url('bow')} className={styles.bowEdge} transform="rotate(-14 100 75)" />
          <path d="M100 74C86 52 54 46 57 63 59 76 84 78 100 74Z" fill={url('bow')} className={styles.bowEdge} />
          <path d="M100 74C114 52 146 46 143 63 141 76 116 78 100 74Z" fill={url('bow')} className={styles.bowEdge} />
          <path d="M98 72C88 60 70 58 70 64.5 70.5 70 86 72.5 98 72Z" className={styles.bowIn} />
          <path d="M102 72C112 60 130 58 130 64.5 129.5 70 114 72.5 102 72Z" className={styles.bowIn} />
          <g transform="translate(100 72)">
            <polygon points={star(15)} fill={url('bow')} className={styles.seal} />
            <circle r="7.2" className={styles.sealIn} />
            <polygon points={star(4.6)} className={styles.sealStar} />
          </g>
        </g>
      </svg>
    </span>
  );
}

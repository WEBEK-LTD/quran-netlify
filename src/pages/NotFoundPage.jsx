// ─── 404: an empty mihrab ───────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { Icon, Pattern, Frieze, toAr } from '../components/ornaments/Ornaments';
import { openPalette } from '../components/shell/Shell';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  return (
    <section className={styles.stage} aria-labelledby="nf-title">
      <Pattern />
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.mihrab}>
        <svg className={styles.arch} viewBox="0 0 400 520" aria-hidden="true">
          {/* outer frame with girih band */}
          <path d="M20 520V230C20 130 110 60 200 14 290 60 380 130 380 230V520Z M46 520V236C46 150 124 90 200 50 276 90 354 150 354 236V520Z"
            fill="url(#nq-girih)" fillRule="evenodd" className={styles.band} />
          <path d="M20 520V230C20 130 110 60 200 14 290 60 380 130 380 230V520" className={styles.line} strokeWidth="1.6" />
          <path d="M46 520V236C46 150 124 90 200 50 276 90 354 150 354 236V520" className={styles.line} strokeWidth="1.1" />
          {/* the niche itself — left empty */}
          <path d="M72 520V244C72 170 136 120 200 88 264 120 328 170 328 244V520Z" className={styles.niche} />
          <path d="M72 520V244C72 170 136 120 200 88 264 120 328 170 328 244V520" className={styles.line} strokeOpacity=".45" />
          {/* hanging lamp */}
          <path d="M200 88V150" className={styles.line} strokeOpacity=".6" />
          <g className={styles.lamp}>
            <path d="M186 150h28l-4 8h-20z" className={styles.lampMetal} />
            <path d="M184 158h32c0 18-7 30-16 34-9-4-16-16-16-34z" className={styles.lampGlass} />
            <path d="M196 192h8l-4 8z" className={styles.lampMetal} />
          </g>
          {/* step / floor */}
          <path d="M60 520h280" className={styles.line} strokeWidth="1.4" />
        </svg>
        <div className={styles.inside}>
          <span className={styles.code} aria-hidden="true">{toAr(404)}</span>
        </div>
      </div>

      <div className={styles.text}>
        <h1 id="nf-title" className={styles.title}>لم نجد هذه الصفحة</h1>
        <p className={styles.sub}>ربما تغيّر الرابط أو حُذفت الصفحة. عُد إلى الرئيسية، أو ابحث عمّا تريد.</p>
        <div className={styles.acts}>
          <Link to="/" className="nq-btn gold"><Icon name="home" />الرئيسية</Link>
          <button type="button" className="nq-btn ghost" onClick={openPalette}><Icon name="search" />ابحث في الموقع</button>
          <Link to="/reader" className="nq-btn ghost"><Icon name="book" />المصحف</Link>
        </div>
      </div>
      <Frieze className={styles.frieze} />
    </section>
  );
}

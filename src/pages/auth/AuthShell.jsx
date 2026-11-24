// ─── Shared pieces of the sign-in pages ─────────────────────────────────────
// A centred, gilded card on a mihrab-arch stage, plus the fields and buttons
// the login / signup / reset / callback pages have in common.
import { useId, useState } from 'react';
import { Icon, Pattern, Frieze, Corners } from '../../components/ornaments/Ornaments';
import { useAppearance } from '../../appearance';
import styles from '../AuthPage.module.css';
import { useTr } from '../../l10n';

export function AuthBrand({ small = false }) {
  const tr = useTr();
  const { scheme, mode } = useAppearance();
  const onDark = scheme === 'dark' || mode === 'contrast';
  return (
    <div className={`${styles.brand} ${small ? styles.brandSm : ''}`}>
      <img className={styles.mark} src="/brand/logo-mark.svg" alt="" width="75" height="89" />
      <img className={styles.word} src={onDark ? '/brand/wordmark-on-dark.svg' : '/brand/wordmark-on-light.svg'} alt={tr('نور القرآن')} width="140" height="40" />
    </div>
  );
}

// The page stage: arch + girih behind a framed card.
export function AuthStage({ children, wide = false, full = false, label }) {
  return (
    <section className={`${styles.stage} ${full ? styles.stageFull : ''}`} aria-label={label}>
      <Pattern />
      <svg className={styles.arch} viewBox="0 0 600 700" preserveAspectRatio="none" aria-hidden="true">
        <path d="M20 700V300C20 175 160 70 300 20 440 70 580 175 580 300V700Z M40 700V306C40 190 172 92 300 44 428 92 560 190 560 306V700Z" fill="url(#nq-girih)" fillRule="evenodd" />
        <path d="M20 700V300C20 175 160 70 300 20 440 70 580 175 580 300V700" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M40 700V306C40 190 172 92 300 44 428 92 560 190 560 306V700" fill="none" stroke="currentColor" strokeOpacity=".5" />
      </svg>
      <div className={`nq-card ${styles.card} ${wide ? styles.cardWide : ''}`}>
        <Corners />
        <div className={styles.cardIn}>{children}</div>
      </div>
      <Frieze className={styles.frieze} />
    </section>
  );
}

export function AuthHead({ title, sub, icon }) {
  return (
    <div className={styles.head}>
      {icon ? <span className={styles.stateIcon} data-tone={icon.tone}><Icon name={icon.name} /></span> : <AuthBrand />}
      <h1 className={styles.title}>{title}</h1>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {children(id)}
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  );
}

export function TextField({ label, hint, icon, ...input }) {
  return (
    <Field label={label} hint={hint}>
      {id => (
        <div className={`nq-input ${styles.input}`}>
          {icon && <Icon name={icon} className={styles.inIcon} />}
          <input id={id} {...input} />
        </div>
      )}
    </Field>
  );
}

export function PasswordField({ label, hint, ...input }) {
  const tr = useTr();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      {id => (
        <div className={`nq-input ${styles.input}`}>
          <Icon name="lock" className={styles.inIcon} />
          <input id={id} type={show ? 'text' : 'password'} dir="ltr" {...input} />
          <button type="button" className={styles.eye} onClick={() => setShow(s => !s)}
            aria-pressed={show} aria-label={show ? tr('إخفاء كلمة المرور') : tr('إظهار كلمة المرور')}>
            <EyeIcon off={show} />
          </button>
        </div>
      )}
    </Field>
  );
}

function EyeIcon({ off }) {
  return (
    <svg className="nq-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 20 20 4" />}
    </svg>
  );
}

export function Alert({ children, tone = 'danger' }) {
  if (!children) return null;
  return (
    <div className={styles.alert} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'danger' ? 'x' : tone === 'ok' ? 'check' : 'bell'} />
      <span>{children}</span>
    </div>
  );
}

export function GoogleButton({ onClick, disabled, children }) {
  return (
    <button type="button" className={`nq-btn ghost ${styles.google}`} onClick={onClick} disabled={disabled}>
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      {children}
    </button>
  );
}

// Sign in with Apple, styled per Apple's guidelines: black on light, white on dark,
// the Apple logo, the system font, the same size as the Google button (iOS app only).
export function AppleButton({ onClick, disabled, children }) {
  return (
    <button type="button" className={`nq-btn ${styles.apple}`} onClick={onClick} disabled={disabled}>
      <svg width="17" height="20" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
      </svg>
      <span>{children}</span>
    </button>
  );
}

export function OrLine({ children }) {
  return <div className={styles.or}><span>{children}</span></div>;
}

export function Spinner() {
  return <span className={styles.spin} aria-hidden="true" />;
}

// strip a leading emoji / mark some i18n strings still carry
export const clean = s => String(s || '').replace(/^[✅✨✦\u{1F300}-\u{1FAFF}\s]+/u, '');

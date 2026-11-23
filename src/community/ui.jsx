// Building blocks for the community screens (icons, avatars, sheets, toggles…).
import { useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import s from './community.module.css';
import { useT, initialOf, tintOf } from './format';
import { toastStore } from './store';

// 24×24 line icons drawn for the rooms designs (no emoji, nothing that signals "AI").
const P = {
  live: '<circle cx="12" cy="11" r="2"/><path d="M8.5 14.5a5 5 0 0 1 0-7M15.5 7.5a5 5 0 0 1 0 7M5.6 17.4a9 9 0 0 1 0-12.8M18.4 4.6a9 9 0 0 1 0 12.8"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/>',
  book: '<path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5V19c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5z"/><path d="M12 6v13.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  back: '<path d="m9 18 6-6-6-6"/>',
  next: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  micOff: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M3 3l18 18"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  dots: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  dotsV: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  clap: '<path d="M11 19.5 7.3 15.8a1.6 1.6 0 0 1 2.3-2.3l1.4 1.4V8.2a1.5 1.5 0 0 1 3 0v5M14 7a1.5 1.5 0 0 1 3 0v6.3M17 8.2a1.5 1.5 0 0 1 3 0v6.6a5.6 5.6 0 0 1-5.6 5.6h-.8"/><path d="M5.6 7.5 3.8 5.8M8.3 5.2 7.7 2.9M4.2 10.6l-2.4-.5"/>',
  shieldCheck: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  star8: '<rect x="6" y="6" width="12" height="12" rx="1"/><rect x="6" y="6" width="12" height="12" rx="1" transform="rotate(45 12 12)"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  leave: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 8l-4 4 4 4M5 12h10"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  userPlus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>',
  volume: '<path d="M4 9.5h4l5-4v13l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
};

export function RIcon({ name, size = 20, className = '', label, style, flip }) {
  return (
    <svg className={`${s.ico}${flip ? ' ' + s.flip : ''}${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 24 24"
      aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label} style={style}
      dangerouslySetInnerHTML={{ __html: P[name] || '' }} />
  );
}

export function Avatar({ user, size = 48, ring = false, className = '' }) {
  const u = user || {};
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return (
    <span className={`${s.av} ${s['t' + tintOf(u.id)]}${ring ? ' ' + s.avRing : ''}${className ? ' ' + className : ''}`} style={style} aria-hidden="true">
      {u.avatar_url || u.photo_url
        ? <img src={u.avatar_url || u.photo_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        : initialOf(u.name)}
    </span>
  );
}

export function Spinner({ label }) {
  const t = useT();
  return <div className={s.spinWrap} role="status"><span className={s.spin} aria-hidden="true" /><span className="nq-sr">{label || t('جارٍ التحميل…')}</span></div>;
}

export function ScopePill({ scope }) {
  const t = useT();
  const label = scope === 'men' ? t('رجال') : scope === 'women' ? t('نساء') : t('مختلطة');
  return <span className={`${s.pill} ${scope === 'mixed' ? s.pillGold : s.pillGreen}`}>{label}</span>;
}

export function BackButton({ to, label }) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <button type="button" className={s.iconBtn} aria-label={label || t('رجوع')}
      onClick={() => { if (to) navigate(to); else if (window.history.length > 1) navigate(-1); else navigate('/rooms'); }}>
      <RIcon name="back" flip />
    </button>
  );
}

/** Screen header: back button, title (h1), optional trailing actions. */
export function TopBar({ title, back = true, backTo, children, sub }) {
  return (
    <header className={s.topbar}>
      {back && <BackButton to={backTo} />}
      <div className={s.topTitle}>
        <h1 className={s.h1}>{title}</h1>
        {sub && <p className={s.topSub}>{sub}</p>}
      </div>
      {children && <div className={s.topActs}>{children}</div>}
    </header>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={!!checked} aria-label={label} disabled={disabled}
      className={`${s.toggle}${checked ? ' ' + s.toggleOn : ''}`} onClick={() => onChange(!checked)}>
      <span className={s.knob} aria-hidden="true" />
    </button>
  );
}

/** Segmented choice. options: [{value, label}] */
export function Seg({ value, options, onChange, label, disabled }) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled || o.disabled}
          className={value === o.value ? s.segOn : ''} onClick={() => onChange(o.value)}>
          {value === o.value && <RIcon name="check" size={16} />}{o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Bottom sheet dialog. Closes on Escape, on the scrim, and on the Android back button.
 * Focus moves into the sheet and back to the opener when it closes.
 */
export function Sheet({ open, onClose, title, sub, children, footer, tall = false, labelId }) {
  const t = useT();
  const ref = useRef(null);
  const autoId = useId();
  const hid = labelId || `sh${autoId.replace(/:/g, '')}`;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current && closeRef.current(); }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onBack = (e) => { e.preventDefault(); closeRef.current && closeRef.current(); };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('nq-native-back', onBack);
    const tm = setTimeout(() => {
      const el = ref.current && (ref.current.querySelector('[data-autofocus]') || ref.current.querySelector('h2'));
      if (el) el.focus();
    }, 40);
    document.documentElement.classList.add(s.noScroll);
    return () => {
      clearTimeout(tm);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('nq-native-back', onBack);
      document.documentElement.classList.remove(s.noScroll);
      if (prev && prev.focus) { try { prev.focus({ preventScroll: true }); } catch {} }
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={s.overlay}>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <section ref={ref} className={`${s.sheet}${tall ? ' ' + s.sheetTall : ''}`} role="dialog" aria-modal="true" aria-labelledby={hid}>
        <div className={s.grab} aria-hidden="true" />
        <div className={s.sheetHead}>
          <div className={s.sheetTitles}>
            <h2 id={hid} tabIndex={-1} className={s.h2}>{title}</h2>
            {sub && <p className={s.sheetSub}>{sub}</p>}
          </div>
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label={t('إغلاق')}><RIcon name="x" /></button>
        </div>
        <div className={s.sheetBody}>{children}</div>
        {footer && <div className={s.sheetFoot}>{footer}</div>}
      </section>
    </div>
  );
}

/** Yes/no confirmation as a small sheet. */
export function Confirm({ open, title, body, confirm, cancel, danger, onAnswer }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={() => onAnswer(false)} title={title}>
      {body && <p className={s.muted}>{body}</p>}
      <div className={s.rowEnd}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => onAnswer(false)}>{cancel || t('إلغاء')}</button>
        <button type="button" data-autofocus className={`${s.btn} ${danger ? s.btnDanger : s.btnGold}`} onClick={() => onAnswer(true)}>{confirm || t('تأكيد')}</button>
      </div>
    </Sheet>
  );
}

/** Action list inside a sheet / popover. items: [{icon, label, sub, onClick, danger, hidden}] */
export function ActionList({ items }) {
  return (
    <ul className={s.actions} role="list">
      {items.filter(i => i && !i.hidden).map((i, k) => (
        <li key={k}>
          <button type="button" className={`${s.action}${i.danger ? ' ' + s.actionDanger : ''}${i.gold ? ' ' + s.actionGold : ''}`} onClick={i.onClick} disabled={i.disabled}>
            {i.icon && <RIcon name={i.icon} />}
            <span><b>{i.label}</b>{i.sub && <small>{i.sub}</small>}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ icon = 'star8', title, body, children }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIco}><RIcon name={icon} size={28} /></span>
      {title && <h2 className={s.h3}>{title}</h2>}
      {body && <p className={s.muted}>{body}</p>}
      {children}
    </div>
  );
}

export function ErrorBox({ text, onRetry }) {
  const t = useT();
  return (
    <div className={s.errorBox} role="alert">
      <RIcon name="info" />
      <p>{text}</p>
      {onRetry && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={onRetry}>{t('أعد المحاولة')}</button>}
    </div>
  );
}

export function ToastView() {
  const v = toastStore.use();
  return (
    <div className={s.toastHost} aria-live="polite" aria-atomic="true">
      {v && <div key={v.id} className={`${s.toast}${v.tone === 'error' ? ' ' + s.toastErr : ''}`} dir="auto">{v.text}</div>}
    </div>
  );
}

export { s as css };

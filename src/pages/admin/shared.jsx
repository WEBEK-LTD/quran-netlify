// Shared hooks, building blocks and helpers for the admin dashboard tabs.
import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { Icon, Badge8, Pattern } from '../../components/ornaments/Ornaments';
import styles from '../AdminPage.module.css';

export { styles };

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function errMsg(e) { return (e && e.message) || 'حدث خطأ غير متوقع، حاول مرة أخرى'; }

// Runs fn() when deps change. Stale responses (older request, unmounted) are ignored.
export function useLoader(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async ({ silent = false } = {}) => {
    const my = ++seq.current;
    if (!silent) setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (alive.current && my === seq.current) setState({ data, error: null, loading: false });
    } catch (e) {
      if (alive.current && my === seq.current) setState(s => ({ data: s.data, error: errMsg(e), loading: false }));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const setData = useCallback(up => setState(s => ({ ...s, data: typeof up === 'function' ? up(s.data) : up })), []);
  return { ...state, reload: load, setData };
}

// setInterval that pauses while the browser tab is hidden and fires once when it comes back.
export function useInterval(cb, ms, enabled = true) {
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; });
  useEffect(() => {
    if (!enabled || !ms) return undefined;
    const tick = () => { if (!document.hidden) cbRef.current(); };
    const t = setInterval(tick, ms);
    const onVis = () => { if (!document.hidden) cbRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, enabled]);
}

export function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useNotice() {
  const [notice, setNotice] = useState(null);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const show = useCallback((type, text) => {
    clearTimeout(t.current);
    setNotice({ type, text, at: Date.now() });
    t.current = setTimeout(() => setNotice(null), type === 'err' ? 8000 : 3500);
  }, []);
  const hide = useCallback(() => { clearTimeout(t.current); setNotice(null); }, []);
  return [notice, show, hide];
}

// Timers that are all cleared on unmount.
export function useTimers() {
  const timers = useRef(new Set());
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  return useCallback((fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);
}

// ─── Extra line icons (same 24×24 stroke style as the shared sprite) ─────────
const XPATHS = {
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mail: 'M3.5 6h17v12h-17z M3.5 6.5 12 13l8.5-6.5',
  trash: 'M4.5 6.5h15 M9.5 6.5V4.5h5v2 M6.5 6.5l1 13h9l1-13 M10 10v6 M14 10v6',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v4h-4',
  external: 'M14 4.5h5.5V10 M19.5 4.5 11 13 M17 14v5.5H4.5V7H10',
  send: 'M20.5 3.5 3.5 10.5l7 2.5 2.5 7z M20.5 3.5 10.5 13',
  ban: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M6 6l12 12',
  key: 'M14.5 4a5.5 5.5 0 1 1-4.9 8L3.5 18v2.5H6l1-1v-1.5h1.5l1-1V15.5H11l1.1-1.1A5.5 5.5 0 0 1 14.5 4z M16 7.5h.01',
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6h5',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M12 11v5.5 M12 7.6v.01',
  alert: 'M12 4 21 19.5H3z M12 10v4.5 M12 17v.01',
};
export function XIcon({ name, className = '' }) {
  return (
    <svg className={`nq-ico ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={XPATHS[name] || ''} />
    </svg>
  );
}
// One entry point: shared sprite icon or a local extra.
export function Ico({ name, className }) {
  return XPATHS[name] !== undefined ? <XIcon name={name} className={className}/> : <Icon name={name} className={className}/>;
}

// ─── Building blocks ──────────────────────────────────────────────────────────
// Refined header for each tab: title, one line, actions at the end; girih band behind.
export function TabHeader({ icon, title, sub, children, live }) {
  return (
    <header className={styles.tabHead}>
      <div className={styles.tabHeadBand} aria-hidden="true"><Pattern/></div>
      <div className={styles.tabHeadMain}>
        {icon && <Badge8 icon={icon} size={48} className={styles.tabHeadBadge}/>}
        <div className={styles.tabHeadText}>
          <h1 className={styles.tabTitle}>{title}</h1>
          {sub && <p className={styles.tabSub}>{live && <span className={styles.liveDotSm} aria-hidden="true"/>}{sub}</p>}
        </div>
      </div>
      {children && <div className={styles.tabActions}>{children}</div>}
    </header>
  );
}

export function SectionCard({ icon, title, action, children, className = '', id, as: Tag = 'section' }) {
  const hid = useId();
  return (
    <Tag className={`nq-card ${styles.card} ${className}`} aria-labelledby={title ? (id || hid) : undefined}>
      {(title || action) && (
        <div className={styles.cardHead}>
          {title && <h2 id={id || hid} className={styles.cardTitle}>{icon && <Ico name={icon} className={styles.cardTitleIco}/>}{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function Kpi({ icon, label, value, delta, sub, onClick, tone }) {
  const inner = <>
    <Badge8 icon={icon} size={46} className={styles.kpiBadge}/>
    <div className={styles.kpiBody}>
      <span className={styles.kpiLabel}>{label}</span>
      <b className={`${styles.kpiVal} nq-num`}>{value ?? '—'}</b>
      {(delta || sub) && (
        <span className={styles.kpiFoot}>
          {delta && <span className={`${styles.pill} ${styles.pillOk}`}>{delta}</span>}
          {sub && <span className={styles.kpiSub}>{sub}</span>}
        </span>
      )}
    </div>
    {onClick && <Icon name="back" className={styles.kpiGo}/>}
  </>;
  const cls = `nq-card ${styles.kpi} ${tone ? styles['kpi_' + tone] : ''}`;
  if (onClick) return <button type="button" className={`${cls} ${styles.kpiBtn}`} onClick={onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

// tone: ok | warn | info | danger | gold | muted
export function Pill({ tone = 'muted', icon, children, title }) {
  return (
    <span className={`${styles.pill} ${styles['pill' + tone[0].toUpperCase() + tone.slice(1)]}`} title={title}>
      {icon && <Ico name={icon} className={styles.pillIco}/>}{children}
    </span>
  );
}

export function Avatar({ user, size = 'md' }) {
  const ch = initial(user);
  return <span className={`${styles.avatar} ${styles['avatar_' + size]}`} style={{ '--av': hueOf(user && user.email) }} aria-hidden="true">{ch}</span>;
}

export function Toggle({ value, onChange, label, busy }) {
  return (
    <button type="button" role="switch" aria-checked={!!value} aria-label={label} aria-busy={busy || undefined}
      className={styles.switch} disabled={busy} onClick={() => onChange(!value)}>
      <span className={styles.switchThumb}/>
    </button>
  );
}

export function ToggleRow({ icon, label, hint, value, status = {}, onChange }) {
  return (
    <div className={styles.toggleRow}>
      {icon && <span className={styles.toggleIco}><Ico name={icon}/></span>}
      <div className={styles.toggleText}>
        <div className={styles.toggleLabel}>{label}</div>
        {hint && <div className={styles.toggleHint}>{hint}</div>}
        <FieldStatus status={status}/>
      </div>
      <Toggle value={value} label={label} busy={!!status.saving} onChange={onChange}/>
    </div>
  );
}

export function FieldStatus({ status = {} }) {
  if (status.saving) return <span className={styles.savingTxt}><span className={styles.spinSm} aria-hidden="true"/>جارٍ الحفظ...</span>;
  if (status.saved)  return <span className={styles.savedTxt} role="status"><Icon name="check"/>تم الحفظ</span>;
  if (status.error)  return <span className={styles.errorTxt} role="alert"><XIcon name="alert"/>{status.error}</span>;
  return null;
}

export function SettingRow({ label, children, status, hint }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
        {hint && <span className={styles.fieldHint}>{hint}</span>}
      </div>
      {children(id)}
      <FieldStatus status={status}/>
    </div>
  );
}

export function Modal({ title, icon, onClose, busy, children, tone }) {
  const boxRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement;
    const box = boxRef.current;
    const el = box && (box.querySelector('[data-autofocus]') || box.querySelector('input, textarea, select, button'));
    if (el) el.focus();
    return () => { if (prev && typeof prev.focus === 'function') prev.focus(); };
  }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return (
    <div className={styles.modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={boxRef} className={`nq-card ${styles.modalBox} ${tone === 'danger' ? styles.modalDanger : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.modalHead}>
          {icon && <Badge8 icon={icon} size={44} className={styles.modalBadge}/>}
          <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
          <button type="button" className={`nq-ibtn ${styles.modalX}`} onClick={onClose} disabled={busy} aria-label="إغلاق"><Icon name="x"/></button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'تأكيد', danger, icon, onConfirm, onClose }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  async function go() {
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <Modal title={title} icon={icon || (danger ? 'alert' : 'check')} onClose={onClose} busy={busy} tone={danger ? 'danger' : undefined}>
      <p className={styles.modalNote}>{message}</p>
      {error && <FormError text={error}/>}
      <div className={styles.modalActions}>
        <button type="button" className={`nq-btn ${danger ? styles.btnDanger : 'gold'}`} onClick={go} disabled={busy}>
          {busy ? <><span className={styles.spinSm} aria-hidden="true"/>جارٍ التنفيذ...</> : confirmLabel}
        </button>
        <button type="button" className="nq-btn ghost" onClick={onClose} disabled={busy} data-autofocus>إلغاء</button>
      </div>
    </Modal>
  );
}

export function FormError({ text, bar }) {
  return <div className={`${styles.formError} ${bar ? styles.formErrorBar : ''}`} role="alert"><XIcon name="alert"/><span>{text}</span></div>;
}

// Floating toast (bottom of the screen).
export function Toast({ notice, onClose }) {
  if (!notice) return null;
  const err = notice.type === 'err';
  return (
    <div key={notice.at} className={`${styles.toast} ${err ? styles.toastErr : styles.toastOk}`} role={err ? 'alert' : 'status'}>
      <span className={styles.toastIco}>{err ? <XIcon name="alert"/> : <Icon name="check"/>}</span>
      <span className={styles.toastText}>{notice.text}</span>
      <button type="button" className={styles.toastX} onClick={onClose} aria-label="إغلاق التنبيه"><Icon name="x"/></button>
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className={`nq-card ${styles.stateCard}`} role="alert">
      <Badge8 icon="shield" size={60} className={styles.stateBadgeDanger}/>
      <h2 className={styles.stateTitle}>تعذّر تحميل البيانات</h2>
      <p className={styles.stateText}>{message}</p>
      {onRetry && <button type="button" className="nq-btn ghost sm" onClick={onRetry}><XIcon name="refresh"/>إعادة المحاولة</button>}
    </div>
  );
}

export function ErrorLine({ message, onRetry }) {
  return (
    <div className={styles.errorLine} role="alert">
      <XIcon name="alert"/>
      <span>{message}</span>
      {onRetry && <button type="button" className={styles.linkBtn} onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function InlineWarn({ text }) {
  return <div className={styles.inlineWarn} role="status"><XIcon name="alert"/><span>{text}</span></div>;
}

export function Empty({ icon = 'star', text }) {
  return (
    <div className={styles.empty}>
      <Badge8 icon={icon} size={44} className={styles.emptyBadge}/>
      <span>{text}</span>
    </div>
  );
}

export function Pagination({ page, perPage, total, onPage, compact }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (perPage || 1)));
  if (pages <= 1) return null;
  return (
    <nav className={`${styles.pager} ${compact ? styles.pagerCompact : ''}`} aria-label="التنقل بين الصفحات">
      <button type="button" className="nq-btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="الصفحة السابقة">
        <Icon name="back"/>{!compact && 'السابق'}
      </button>
      <span className={`${styles.pagerInfo} nq-num`}>صفحة {page} من {pages}</span>
      <button type="button" className="nq-btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="الصفحة التالية">
        {!compact && 'التالي'}<Icon name="back" className={styles.flip}/>
      </button>
    </nav>
  );
}

export function PageLoader({ label = 'جارٍ التحميل...' }) {
  return (
    <div className={styles.loader} role="status">
      <span className={styles.loaderStar} aria-hidden="true"><svg><use href="#nq-star8"/></svg></span>
      <span>{label}</span>
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const HUES = ['var(--emerald)', 'var(--gold)', 'var(--info)', 'var(--tile)', 'var(--warn)', 'var(--gold-deep)'];
export function hueOf(str = '') {
  let h = 0; for (const x of String(str || '')) h = (h * 31 + x.charCodeAt(0)) % HUES.length; return HUES[h];
}
export function initial(u) { return String((u && (u.name || u.email)) || '?')[0].toUpperCase(); }
export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  n = Number(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'م';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'ك';
  return String(n);
}
export function fmtFull(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US');
}
export function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Last `n` days ending at the newest date the server sent (or today, UTC), zero-filled.
export function lastDays(rows, n) {
  const map = {};
  let anchor = new Date().toISOString().slice(0, 10);
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.date) continue;
    const k = String(r.date).slice(0, 10);
    map[k] = (map[k] || 0) + (Number(r.count) || 0);
    if (k > anchor) anchor = k;
  }
  const end = new Date(anchor + 'T00:00:00Z');
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end); d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      key, count: map[key] || 0,
      label: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }),
      long: d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    });
  }
  return out;
}
export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtTime(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return '—';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  if (d < 365) return `منذ ${Math.floor(d / 30)} شهر`;
  return `منذ ${Math.floor(d / 365)} سنة`;
}

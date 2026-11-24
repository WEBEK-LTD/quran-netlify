// ─── Site chrome: header + mega menu, mobile drawer, search palette, tab bar, footer ──
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../../styles/shell.css';
import { Icon, Pattern, Frieze, Badge8, toAr } from '../ornaments/Ornaments';
import { visibleGroups, featureText, groupTitle, openAssistant } from '../../features';
import { useAuth, displayNameOf, avatarOf } from '../../hooks/useAuth';
import { usePublicSettings } from '../../hooks/usePublicSettings';
import { useAppearance, toggleScheme, setAppearance, MODES } from '../../appearance';
import { useLang } from '../../i18n';
import { useTr, num, surahName, revelationLabel } from '../../l10n';
import { coreTr } from '../../locales/core';
import { SURAHS_META } from '../../data';
import { normalizeArabic } from '../../arabic';
import LangSwitcher from '../LangSwitcher';
import { isNative } from '../../native/platform';

// ── tiny shared UI state (which overlay is open) ────────────────────────────
let ui = { overlay: null }; // null | 'mega' | 'drawer' | 'palette' | 'account'
const subs = new Set();
function setOverlay(o) { ui = { overlay: o }; subs.forEach(f => f()); }
function useOverlay() { return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => ui.overlay); }
export const openPalette = () => setOverlay('palette');
export const openDrawer = () => setOverlay('drawer');
export const closeOverlays = () => setOverlay(null);

function useFeatures() {
  const settings = usePublicSettings();
  const { user } = useAuth();
  return useMemo(() => visibleGroups(settings, user), [settings, user]);
}

// Runs a feature item: navigate, or open the assistant.
function useGo() {
  const navigate = useNavigate();
  return (item) => {
    closeOverlays();
    if (item.action === 'assistant') { openAssistant(); return; }
    if (item.path) navigate(item.path);
  };
}

function Brand({ onClick }) {
  const tr = coreTr(useTr());
  return (
    <Link to="/" className="nq-brand" aria-label={tr('نور القرآن — الرئيسية')} onClick={onClick}>
      <img className="mark" src="/brand/logo-mark.svg" alt="" width="34" height="40" />
      <img className="word word-dark" src="/brand/wordmark-on-dark.svg" alt="" width="119" height="34" />
      <img className="word word-light" src="/brand/wordmark-on-light.svg" alt="" width="119" height="34" />
    </Link>
  );
}

function FeatureItem({ item, lang, onGo, ...rest }) {
  const t = featureText(item, lang);
  return (
    <button type="button" className="nq-mitem" onClick={() => onGo(item)} {...rest}>
      <Icon name={item.icon} />
      <span><b>{t.title}</b><small>{t.desc}</small></span>
    </button>
  );
}

const NAV = [
  { path: '/', label: 'الرئيسية', exact: true },
  { path: '/reader', label: 'المصحف' },
  { path: '/prayer-times', label: 'الصلاة والقبلة', also: ['/qibla'] },
  { path: '/hifz', label: 'الحفظ', opt: true },
  { path: '/khatma-group', label: 'الختمات', also: ['/khatma'], opt: true },
  { path: '/adhkar', label: 'الأذكار', opt: true },
];

// Latin-script nav labels run longer than the Arabic ones: tighter links, and the
// optional ones drop out earlier, so the header never overflows.
// (candidate for src/styles/shell.css)
const LTR_NAV_CSS = `
:root[dir="ltr"] .nq-navlink { padding-inline:10px; }
:root[dir="ltr"] .nq-navlink[aria-current="page"]::after { inset-inline:10px; }
@media (max-width:1340px) { :root[lang="fr"] .nq-nav .nq-navlink.opt, :root[lang="tr"] .nq-nav .nq-navlink.opt { display:none; } }
@media (max-width:1080px) { :root[dir="ltr"] .nq-top-in { gap:12px; } :root[dir="ltr"] .nq-nav { margin-inline-start:0; } }
`;

// ── header ──────────────────────────────────────────────────────────────────
export function SiteHeader() {
  const { pathname } = useLocation();
  const overlay = useOverlay();
  const groups = useFeatures();
  const lang = useLang();
  const go = useGo();
  const tr = coreTr(useTr());
  const { scheme } = useAppearance();
  const megaOpen = overlay === 'mega';

  // close the mega menu / account menu on route change
  useEffect(() => { closeOverlays(); }, [pathname]);

  return (
    <header className="nq-top">
      {tr.dir === 'ltr' && <style>{LTR_NAV_CSS}</style>}
      <a href="#main" className="nq-skip">{tr('تخطَّ إلى المحتوى')}</a>
      <div className="nq-wrap nq-top-in">
        <Brand />
        <nav className="nq-nav" aria-label={tr('التنقل الرئيسي')}>
          {NAV.map(n => {
            const on = n.exact ? pathname === n.path : (pathname.startsWith(n.path) || (n.also || []).some(a => pathname.startsWith(a)));
            return <Link key={n.path} to={n.path} className={`nq-navlink${n.opt ? ' opt' : ''}`} aria-current={on ? 'page' : undefined}>{tr(n.label)}</Link>;
          })}
          <button type="button" className="nq-navlink" aria-expanded={megaOpen} aria-controls="nq-mega"
            onClick={() => setOverlay(megaOpen ? null : 'mega')}>
            {tr('كل المميزات')} <Icon name="chev" className="chev" />
          </button>
        </nav>
        <span className="spacer" />
        <div className="nq-top-acts">
          <button type="button" className="nq-ibtn" onClick={openPalette} aria-label={tr('البحث في القرآن والمميزات (/)')} title={tr('بحث ( / )')}>
            <Icon name="search" />
          </button>
          <button type="button" className="nq-ibtn hide-sm" onClick={toggleScheme}
            aria-label={scheme === 'dark' ? tr('الوضع النهاري') : tr('الوضع الليلي')} title={scheme === 'dark' ? tr('الوضع النهاري') : tr('الوضع الليلي')}>
            <Icon name={scheme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <span className="hide-sm"><LangSwitcher compact={true} /></span>
          <Account />
          <button type="button" className="nq-ibtn nq-menu-btn" onClick={openDrawer} aria-label={tr('القائمة')} aria-expanded={overlay === 'drawer'}>
            <Icon name="menu" />
          </button>
        </div>
      </div>
      {megaOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 58 }} onClick={closeOverlays} aria-hidden="true" />
          <div className="nq-mega" id="nq-mega">
            <Pattern />
            <div className="nq-wrap nq-mega-in">
              {groups.map(g => (
                <div className="nq-mgroup" key={g.id}>
                  <h4>{groupTitle(g, lang)}</h4>
                  {g.items.map(it => <FeatureItem key={it.key} item={it} lang={lang} onGo={go} />)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </header>
  );
}

function Account() {
  const { user, signOut } = useAuth();
  const overlay = useOverlay();
  const navigate = useNavigate();
  const tr = coreTr(useTr());
  const open = overlay === 'account';
  if (!user) {
    return <Link to="/login" className="nq-btn gold sm hide-sm">{tr('تسجيل الدخول')}</Link>;
  }
  const name = displayNameOf(user, tr('حسابي'));
  const avatar = avatarOf(user);
  return (
    <div className="nq-acct">
      <button type="button" className="nq-avatar" aria-label={tr('حسابي: {name}', { name })} aria-expanded={open}
        onClick={() => setOverlay(open ? null : 'account')}>
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : (name.trim()[0] || '؟')}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 69 }} onClick={closeOverlays} aria-hidden="true" />
          <div className="nq-pop" role="menu">
            <div className="who"><b>{name}</b><small>{user.email}</small></div>
            <Link to="/dashboard" role="menuitem"><Icon name="home" />{tr('لوحتي')}</Link>
            <Link to="/favorites" role="menuitem"><Icon name="bookmark" />{tr('المفضلة')}</Link>
            <Link to="/settings" role="menuitem"><Icon name="gear" />{tr('الإعدادات والمظهر')}</Link>
            {user.is_admin && <Link to="/admin" role="menuitem"><Icon name="shieldUser" />{tr('لوحة الإدارة')}</Link>}
            <button type="button" role="menuitem" className="danger"
              onClick={async () => { closeOverlays(); await signOut(); navigate('/'); }}>
              <Icon name="logout" />{tr('تسجيل الخروج')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── drawer (mobile) ─────────────────────────────────────────────────────────
export function Drawer() {
  const overlay = useOverlay();
  const groups = useFeatures();
  const lang = useLang();
  const go = useGo();
  const { user } = useAuth();
  const tr = coreTr(useTr());
  const { mode } = useAppearance();
  const closeRef = useRef(null);
  useEffect(() => { if (overlay === 'drawer') setTimeout(() => closeRef.current?.focus(), 30); }, [overlay]);
  if (overlay !== 'drawer') return null;
  return (
    <div className="nq-overlay">
      <div className="nq-scrim" onClick={closeOverlays} />
      <aside className="nq-sheet" role="dialog" aria-modal="true" aria-label={tr('القائمة')}>
        <div className="nq-sheet-head">
          <Brand onClick={closeOverlays} />
          <button ref={closeRef} type="button" className="nq-ibtn" onClick={closeOverlays} aria-label={tr('إغلاق')}><Icon name="x" /></button>
        </div>
        {!user && <Link to="/login" className="nq-btn gold" onClick={closeOverlays}>{tr('تسجيل الدخول')}</Link>}
        <button type="button" className="nq-input" style={{ cursor: 'pointer', textAlign: 'start' }} onClick={openPalette}>
          <Icon name="search" style={{ color: 'var(--gold)' }} /><span style={{ color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr('ابحث عن سورة أو ميزة…')}</span>
        </button>
        <div className="nq-mgroup">
          <h4>{tr('المظهر')}</h4>
          <div className="modes" role="group" aria-label={tr('وضع العرض')}>
            {MODES.map(m => (
              <button key={m.id} type="button" className={`nq-pill${mode === m.id ? ' on' : ''}`} aria-pressed={mode === m.id}
                onClick={() => setAppearance({ mode: m.id })} style={{ minHeight: 36 }}>{tr(m.label)}</button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}><LangSwitcher /></div>
        </div>
        {groups.map(g => (
          <div className="nq-mgroup" key={g.id}>
            <h4>{groupTitle(g, lang)}</h4>
            {g.items.map(it => <FeatureItem key={it.key} item={it} lang={lang} onGo={go} />)}
          </div>
        ))}
      </aside>
    </div>
  );
}

// ── search palette: features + surahs + "2:255" ─────────────────────────────
export function CommandPalette() {
  const overlay = useOverlay();
  const groups = useFeatures();
  const lang = useLang();
  const go = useGo();
  const navigate = useNavigate();
  const tr = coreTr(useTr());
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const resRef = useRef(null);
  const open = overlay === 'palette';

  // global shortcuts: "/" or Ctrl/Cmd+K
  useEffect(() => {
    function onKey(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if (!typing && (e.key === '/' || ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); openPalette(); }
      if (e.key === 'Escape' && ui.overlay) closeOverlays();
    }
    document.addEventListener('keydown', onKey);
    // app: the Android back button closes the open menu / drawer / search first
    function onBack(e) { if (ui.overlay) { e.preventDefault(); closeOverlays(); } }
    window.addEventListener('nq-native-back', onBack);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('nq-native-back', onBack); };
  }, []);
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const results = useMemo(() => {
    const nq = normalizeArabic(q.trim()).toLowerCase();
    const out = [];
    const ref = /^(\d{1,3})\s*[:：.\-\s]\s*(\d{1,3})$/.exec(q.trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (ref) {
      const s = +ref[1], a = +ref[2];
      if (s >= 1 && s <= 114 && a >= 1 && a <= SURAHS_META[s - 1][2]) out.push({ kind: 'ayah', s, a });
    }
    const feats = [];
    groups.forEach(g => g.items.forEach(it => {
      const t = featureText(it, lang);
      if (!nq || normalizeArabic(`${t.title} ${t.desc} ${it.title} ${it.desc}`).toLowerCase().includes(nq)) feats.push(it);
    }));
    feats.slice(0, nq ? 8 : 40).forEach(it => out.push({ kind: 'feat', it }));
    if (nq) {
      const asNum = /^\d+$/.test(q.trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) ? +q.trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : 0;
      SURAHS_META.forEach((m, i) => {
        if ((asNum && asNum === i + 1) || normalizeArabic(m[0]).includes(nq) || m[1].toLowerCase().includes(nq)) out.push({ kind: 'surah', n: i + 1 });
      });
    }
    return out.slice(0, 30);
  }, [q, groups, lang]);

  function run(r) {
    if (!r) return;
    if (r.kind === 'feat') { go(r.it); return; }
    closeOverlays();
    if (r.kind === 'surah') navigate(`/reader?surah=${r.n}&ayah=1`);
    if (r.kind === 'ayah') navigate(`/reader?surah=${r.s}&ayah=${r.a}`);
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = results.length || 1;
      const next = (idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      setIdx(next);
      resRef.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); run(results[idx]); }
  }
  if (!open) return null;

  let lastKind = null;
  return (
    <div className="nq-overlay nq-palette">
      <div className="nq-scrim" onClick={closeOverlays} />
      <div className="box" role="dialog" aria-modal="true" aria-label={tr('البحث')}>
        <label className="in">
          <Icon name="search" style={{ color: 'var(--gold)' }} />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKeyDown}
            placeholder={tr('ابحث عن سورة أو ميزة: الكهف، القبلة، أذكار، ٢:٢٥٥')} autoComplete="off" role="combobox"
            aria-expanded="true" aria-controls="nq-pal-res" aria-activedescendant={results[idx] ? `nq-pal-${idx}` : undefined} />
          <span className="nq-kbd">Esc</span>
        </label>
        <div className="res" id="nq-pal-res" role="listbox" ref={resRef}>
          {results.length === 0 && <p className="empty">{tr('لا نتائج. جرّب كلمة أخرى — وللبحث داخل الآيات افتح «البحث في القرآن».')}</p>}
          {results.map((r, i) => {
            const head = r.kind !== lastKind ? (r.kind === 'feat' ? tr('المميزات') : r.kind === 'surah' ? tr('السور') : tr('انتقل إلى آية')) : null;
            lastKind = r.kind;
            const common = { 'data-i': i, id: `nq-pal-${i}`, role: 'option', 'aria-selected': i === idx, className: 'nq-mitem', type: 'button', onClick: () => run(r), onMouseEnter: () => setIdx(i) };
            let body;
            if (r.kind === 'feat') {
              const t = featureText(r.it, lang);
              body = <button {...common}><Icon name={r.it.icon} /><span><b>{t.title}</b><small>{t.desc}</small></span></button>;
            } else if (r.kind === 'surah') {
              const m = SURAHS_META[r.n - 1];
              body = <button {...common}><Badge8 size={34}>{toAr(r.n)}</Badge8><span><b>{tr('سورة {name}', { name: surahName(r.n) })}</b><small>{revelationLabel(m[3])} · {tr('{n} آية', { n: num(m[2]) })}</small></span></button>;
            } else {
              body = <button {...common}><Icon name="book" /><span><b>{tr('سورة {name} · الآية {n}', { name: surahName(r.s), n: num(r.a) })}</b><small>{tr('افتح المصحف عند هذه الآية')}</small></span></button>;
            }
            return <div key={i}>{head && <div className="sec-t">{head}</div>}{body}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── mobile tab bar ──────────────────────────────────────────────────────────
const TABS = [
  { path: '/', icon: 'home', label: 'الرئيسية', exact: true },
  { path: '/reader', icon: 'book', label: 'المصحف' },
  { path: '/prayer-times', icon: 'mosque', label: 'الصلاة' },
  { path: '/hifz', icon: 'grid', label: 'الحفظ' },
];
// In the app, voice rooms take the fourth tab (Hifz stays in «المزيد»).
const ROOMS_TAB = { path: '/rooms', icon: 'live', label: 'الغرف', also: ['/messages', '/people', '/groups', '/notifications'] };
const APP = isNative();
export function TabBar() {
  const { pathname } = useLocation();
  const tr = coreTr(useTr());
  const settings = usePublicSettings();
  const tabs = APP && (!settings.features || settings.features.rooms !== false) ? [...TABS.slice(0, 3), ROOMS_TAB] : TABS;
  useEffect(() => {
    document.body.classList.add('nq-has-tabbar');
    return () => document.body.classList.remove('nq-has-tabbar');
  }, []);
  return (
    <nav className="nq-tabbar" aria-label={tr('التنقل السفلي')}>
      {tabs.map(t => {
        const on = t.exact ? pathname === t.path : (pathname.startsWith(t.path) || (t.also || []).some(a => pathname.startsWith(a)));
        return <Link key={t.path} to={t.path} aria-current={on ? 'page' : undefined}><Icon name={t.icon} />{tr(t.label)}</Link>;
      })}
      <button type="button" onClick={openDrawer}><Icon name="menu" />{tr('المزيد')}</button>
    </nav>
  );
}

// ── footer ──────────────────────────────────────────────────────────────────
function hijriYear() {
  try { return num(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric' }).format(new Date()).replace(/[^0-9]/g, '')); } catch { return ''; }
}
export function SiteFooter() {
  const tr = coreTr(useTr());
  const lang = useLang();
  return (
    <footer className="nq-footer">
      <Frieze />
      <Pattern />
      <div className="nq-wrap nq-footer-in">
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Brand />
          <p style={{ color: 'var(--muted)', fontSize: '.92rem', maxWidth: '40ch' }}>{tr('مجاني لوجه الله، بلا إعلانات. نسأل الله القبول.')}</p>
          <div><LangSwitcher /></div>
        </div>
        <div><h4>{tr('القرآن')}</h4><ul>
          <li><Link to="/reader">{tr('المصحف')}</Link></li><li><Link to="/search">{tr('البحث')}</Link></li>
          <li><Link to="/daily-ayah">{tr('آية اليوم')}</Link></li><li><Link to="/radio">{tr('إذاعة القرآن')}</Link></li>
          <li><a href={`/${lang}/`}>{tr('سور القرآن مكتوبة')}</a></li>
        </ul></div>
        <div><h4>{tr('العبادات')}</h4><ul>
          <li><Link to="/prayer-times">{tr('مواقيت الصلاة')}</Link></li><li><Link to="/qibla">{tr('القبلة')}</Link></li>
          <li><Link to="/adhkar">{tr('الأذكار')}</Link></li><li><Link to="/tasbih">{tr('السبحة')}</Link></li>
        </ul></div>
        <div><h4>{tr('عن الموقع')}</h4><ul>
          <li><Link to="/help">{tr('شرح الاستخدام')}</Link></li><li><Link to="/support">{tr('الدعم')}</Link></li>
          <li><Link to="/privacy">{tr('الخصوصية')}</Link></li><li><Link to="/terms">{tr('الشروط')}</Link></li>
          <li><Link to="/child-safety">{tr('سلامة الأطفال')}</Link></li>
        </ul></div>
      </div>
      <div className="copy">{tr('© {year} هـ · نور القرآن', { year: hijriYear() })}</div>
    </footer>
  );
}

// Full chrome used by every regular page.
export function SiteChrome() {
  return (<><Drawer /><CommandPalette /><TabBar /></>);
}

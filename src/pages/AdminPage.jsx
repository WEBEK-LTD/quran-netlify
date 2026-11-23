// Admin dashboard (/admin, /admin/support). Lives outside the site layout, so it
// carries its own app shell: a sidebar on the right (an off-canvas drawer on ≤900px).
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getUnreadCount } from '../adminApi';
import { toggleScheme, useAppearance } from '../appearance';
import { Icon, Badge8, Pattern } from '../components/ornaments/Ornaments';
import { styles, useInterval, Avatar, Ico } from './admin/shared';
import { OverviewTab, AnalyticsTab } from './admin/StatsTabs';
import UsersTab from './admin/UsersTab';
import BroadcastsTab from './admin/BroadcastsTab';
import SettingsTab from './admin/SettingsTab';
import IntegrationsTab from './admin/IntegrationsTab';
import SupportTab from './admin/SupportTab';
import LogTab from './admin/LogTab';

const TABS = [
  { id: 'overview',     icon: 'home',   label: 'الرئيسية' },
  { id: 'analytics',    icon: 'chart',  label: 'الإحصائيات' },
  { id: 'users',        icon: 'users',  label: 'الأعضاء' },
  { id: 'broadcasts',   icon: 'bell',   label: 'الإشعارات' },
  { id: 'settings',     icon: 'gear',   label: 'الإعدادات' },
  { id: 'integrations', icon: 'key',    label: 'التكاملات' },
  { id: 'support',      icon: 'chat',   label: 'الدعم' },
  { id: 'log',          icon: 'scroll', label: 'السجل' },
];

export default function AdminPage({ defaultTab }) {
  const auth = useAuth() || {};
  const { user, loading } = auth;
  const isAdmin = !!(user && user.is_admin === true);
  const [tab, setTab] = useState(defaultTab || 'overview');
  const [unread, setUnread] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const { scheme } = useAppearance();
  const mainRef = useRef(null);

  // /admin ↔ /admin/support reuse the same component instance
  useEffect(() => { if (defaultTab) setTab(defaultTab); }, [defaultTab]);

  const refreshUnread = useCallback(() => {
    getUnreadCount()
      .then(d => setUnread(Number(d && d.count) || 0))
      .catch(() => {}); // the badge is best-effort; the support tab shows its own errors
  }, []);
  useEffect(() => { if (isAdmin) refreshUnread(); }, [isAdmin, refreshUnread]);
  useInterval(refreshUnread, 30_000, isAdmin);

  // drawer: Esc closes, page behind does not scroll
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = e => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [navOpen]);

  const go = useCallback((id) => {
    setTab(id);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, []);

  if (loading) return <div className={styles.center} role="status" aria-label="جارٍ التحميل"><span className={styles.loaderStar} aria-hidden="true"><svg><use href="#nq-star8"/></svg></span></div>;
  if (!user) return <Gate icon="lock" title="يجب تسجيل الدخول أولاً" text="لوحة التحكم متاحة للمشرفين بعد تسجيل الدخول."
    action={<Link to="/login" className="nq-btn gold">تسجيل الدخول</Link>}/>;
  if (!isAdmin) return <Gate icon="shield" title="غير مصرّح لك" text="هذه الصفحة للمشرفين فقط."
    action={defaultTab === 'support'
      ? <Link to="/support" className="nq-btn gold">صفحة الدعم</Link>
      : <Link to="/" className="nq-btn gold">العودة إلى الرئيسية</Link>}/>;

  const displayName = user.name || (user.email || '').split('@')[0] || 'مشرف';
  const current = TABS.find(t => t.id === tab) || TABS[0];
  const dark = scheme === 'dark';

  return (
    <div className={styles.page}>
      {/* compact top bar (≤900px) */}
      <div className={styles.topbar}>
        <button type="button" className={`nq-ibtn ${styles.menuBtn}`} onClick={() => setNavOpen(true)}
          aria-label={unread > 0 ? `فتح القائمة (${unread} رسالة دعم غير مقروءة)` : 'فتح القائمة'}
          aria-expanded={navOpen} aria-controls="admin-sidebar">
          <Icon name="menu"/>
          {unread > 0 && <span className={styles.menuDot} aria-hidden="true"/>}
        </button>
        <div className={styles.topTitle}>
          <img src="/brand/logo-mark.svg" alt="" width="26" height="31"/>
          <span>{current.label}</span>
        </div>
        <button type="button" className="nq-ibtn" onClick={toggleScheme}
          aria-label={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}>
          <Icon name={dark ? 'sun' : 'moon'}/>
        </button>
      </div>

      {navOpen && <div className={styles.navScrim} onClick={() => setNavOpen(false)} aria-hidden="true"/>}

      <aside id="admin-sidebar" className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ''}`} aria-label="لوحة التحكم">
        <Pattern/>
        <div className={styles.brand}>
          <Link to="/" className={styles.brandLink} aria-label="نور القرآن، العودة إلى الموقع">
            <img className={styles.brandMark} src="/brand/logo-mark.svg" alt="" width="38" height="45"/>
            <img className={styles.brandWord} src={dark ? '/brand/wordmark-on-dark.svg' : '/brand/wordmark-on-light.svg'} alt="" width="112" height="32"/>
          </Link>
          <button type="button" className={`nq-ibtn ${styles.navClose}`} onClick={() => setNavOpen(false)} aria-label="إغلاق القائمة">
            <Icon name="x"/>
          </button>
        </div>
        <div className={styles.brandTag}><Icon name="shieldUser"/>لوحة التحكم</div>

        <nav className={styles.sideNav} aria-label="أقسام لوحة التحكم">
          {TABS.map(t => {
            const badge = t.id === 'support' ? unread : 0;
            return (
              <button key={t.id} type="button"
                className={`${styles.navItem} ${tab === t.id ? styles.navActive : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
                aria-label={badge > 0 ? `${t.label} (${badge} غير مقروءة)` : t.label}
                onClick={() => go(t.id)}>
                <span className={styles.navIco}><Ico name={t.icon}/></span>
                <span className={styles.navLabel}>{t.label}</span>
                {badge > 0 && <span className={styles.navBadge} aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className={styles.sideFoot}>
          <div className={styles.me}>
            <Avatar user={user}/>
            <div className={styles.meText}>
              <span className={styles.meName}>{displayName}</span>
              <span className={styles.meRole}><bdi>{user.email || 'مشرف النظام'}</bdi></span>
            </div>
          </div>
          <div className={styles.sideActs}>
            <button type="button" className={`nq-btn ghost sm ${styles.sideBtn}`} onClick={toggleScheme}
              aria-label={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}>
              <Icon name={dark ? 'sun' : 'moon'}/>{dark ? 'نهاري' : 'ليلي'}
            </button>
            <Link to="/" className={`nq-btn ghost sm ${styles.sideBtn}`}>
              <Icon name="logout"/>إلى الموقع
            </Link>
          </div>
        </div>
      </aside>

      <main ref={mainRef} tabIndex={-1} className={styles.main}>
        {tab === 'overview'     && <OverviewTab onTabChange={go}/>}
        {tab === 'analytics'    && <AnalyticsTab/>}
        {tab === 'users'        && <UsersTab currentUser={user}/>}
        {tab === 'broadcasts'   && <BroadcastsTab/>}
        {tab === 'settings'     && <SettingsTab/>}
        {tab === 'integrations' && <IntegrationsTab/>}
        {tab === 'support'      && <SupportTab onRead={refreshUnread} unread={unread}/>}
        {tab === 'log'          && <LogTab/>}
      </main>
    </div>
  );
}

function Gate({ icon, title, text, action }) {
  return (
    <div className={styles.center}>
      <div className={`nq-card ${styles.gate}`}>
        <Pattern/>
        <img src="/brand/logo-mark.svg" alt="" width="60" height="71" className={styles.gateMark}/>
        <Badge8 icon={icon} size={56}/>
        <h1 className={styles.gateTitle}>{title}</h1>
        <p className={styles.gateText}>{text}</p>
        {action}
      </div>
    </div>
  );
}


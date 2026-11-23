import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getStats,
  listUsers, setUserAdmin, banUser, unbanUser, messageUser,
  listBroadcasts, createBroadcast, deleteBroadcast,
  getSettings, updateSettings,
  getIntegrations, updateIntegrations, testIntegration,
  listTickets, getTicketMessages, replyToTicket, setTicketStatus, getUnreadCount,
  getLog,
} from '../adminApi';
import styles from './AdminPage.module.css';

// ─── Shared hooks ─────────────────────────────────────────────────────────────
function errMsg(e) { return (e && e.message) || 'حدث خطأ غير متوقع، حاول مرة أخرى'; }

// Runs fn() when deps change. Stale responses (older request, unmounted) are ignored.
function useLoader(fn, deps) {
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
function useInterval(cb, ms, enabled = true) {
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

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function useNotice() {
  const [notice, setNotice] = useState(null);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const show = useCallback((type, text) => {
    clearTimeout(t.current);
    setNotice({ type, text });
    t.current = setTimeout(() => setNotice(null), type === 'err' ? 8000 : 3500);
  }, []);
  const hide = useCallback(() => { clearTimeout(t.current); setNotice(null); }, []);
  return [notice, show, hide];
}

// Timers that are all cleared on unmount.
function useTimers() {
  const timers = useRef(new Set());
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  return useCallback((fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage({ defaultTab }) {
  const auth = useAuth() || {};
  const { user, loading } = auth;
  const isAdmin = !!(user && user.is_admin === true);
  const [tab, setTab] = useState(defaultTab || 'overview');
  const [unread, setUnread] = useState(0);

  // /admin ↔ /admin/support reuse the same component instance
  useEffect(() => { if (defaultTab) setTab(defaultTab); }, [defaultTab]);

  const refreshUnread = useCallback(() => {
    getUnreadCount()
      .then(d => setUnread(Number(d && d.count) || 0))
      .catch(() => {}); // the badge is best-effort; the support tab shows its own errors
  }, []);
  useEffect(() => { if (isAdmin) refreshUnread(); }, [isAdmin, refreshUnread]);
  useInterval(refreshUnread, 30_000, isAdmin);

  if (loading) return <div className={styles.center} role="status" aria-label="جارٍ التحميل"><div className={styles.spinner}/></div>;
  if (!user) return <NotLoggedIn/>;
  if (!isAdmin) return <NotAdmin supportLink={defaultTab === 'support'}/>;

  const TABS = [
    { id: 'overview',     icon: '📊', label: 'الرئيسية' },
    { id: 'analytics',    icon: '📈', label: 'الإحصائيات' },
    { id: 'users',        icon: '👥', label: 'الأعضاء' },
    { id: 'broadcasts',   icon: '📢', label: 'الإشعارات' },
    { id: 'settings',     icon: '⚙️', label: 'الإعدادات' },
    { id: 'integrations', icon: '🧩', label: 'التكاملات' },
    { id: 'support',      icon: '💬', label: 'الدعم', badge: unread },
    { id: 'log',          icon: '🧾', label: 'السجل' },
  ];
  const displayName = user.name || (user.email || '').split('@')[0] || 'مدير';

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.brandIcon} aria-hidden="true">🛡</span>
          <span className={styles.brandText}>لوحة التحكم</span>
        </div>
        <nav className={styles.sideNav} aria-label="أقسام لوحة التحكم">
          {TABS.map(t => (
            <button key={t.id} type="button"
              className={`${styles.navItem} ${tab === t.id ? styles.navActive : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              aria-label={t.badge > 0 ? `${t.label} (${t.badge} غير مقروءة)` : t.label}
              title={t.label}
              onClick={() => setTab(t.id)}>
              <span className={styles.navIcon} aria-hidden="true">{t.icon}</span>
              <span className={styles.navLabel}>{t.label}</span>
              {t.badge > 0 && <span className={styles.navBadge} aria-hidden="true">{t.badge}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.adminInfo}>
            <div className={styles.adminAvatar} style={{ background: strColor(user.email) }} aria-hidden="true">
              {(displayName || 'A')[0].toUpperCase()}
            </div>
            <div>
              <div className={styles.adminName}>{displayName}</div>
              <div className={styles.adminRole}>مدير النظام</div>
            </div>
          </div>
          <Link to="/" className={styles.exitBtn} aria-label="خروج من لوحة التحكم">← خروج</Link>
        </div>
      </aside>

      <main className={styles.main}>
        {tab === 'overview'     && <OverviewTab onTabChange={setTab}/>}
        {tab === 'analytics'    && <AnalyticsTab/>}
        {tab === 'users'        && <UsersTab currentUser={user}/>}
        {tab === 'broadcasts'   && <BroadcastsTab/>}
        {tab === 'settings'     && <SettingsTab/>}
        {tab === 'integrations' && <IntegrationsTab/>}
        {tab === 'support'      && <SupportTab onRead={refreshUnread}/>}
        {tab === 'log'          && <LogTab/>}
      </main>
    </div>
  );
}

// ─── Stats (shared by Overview + Analytics) ──────────────────────────────────
function useStats() {
  const stats = useLoader(() => getStats(), []);
  useInterval(() => stats.reload({ silent: true }), 30_000);
  return stats;
}

function onlineOf(s) {
  const o = (s && s.online_now) || {};
  return { total: o.total || 0, signedIn: o.signed_in || 0, guests: o.guests || 0 };
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewTab({ onTabChange }) {
  const stats   = useStats();
  const recent  = useLoader(() => listUsers({ page: 1, perPage: 5 }), []);
  const openTix = useLoader(() => listTickets({ status: 'open', page: 1, perPage: 5 }), []);

  const s = stats.data;
  const online = onlineOf(s);

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الرئيسية" sub="نظرة عامة على التطبيق — تتحدّث كل ٣٠ ثانية"/>
      {stats.loading && !s && <PageLoader/>}
      {stats.error && !s && <ErrorBox message={stats.error} onRetry={() => stats.reload()}/>}
      {s && <>
        {stats.error && <InlineWarn text={`تعذّر التحديث: ${stats.error}`}/>}
        <div className={styles.statsGrid}>
          <StatCard icon="👥" label="إجمالي الأعضاء"         value={fmt(s.users_total)} color="#52b788" delta={s.users_today > 0 ? `+${s.users_today} اليوم` : null}/>
          <StatCard icon="🆕" label="أعضاء جدد (٧ أيام)"     value={fmt(s.users_7d)}    color="#a78bfa"/>
          <StatCard icon="📖" label="إجمالي الآيات المقروءة" value={fmt(s.ayahs_total)} color="#c9a84c"/>
          <StatCard icon="📊" label="متوسط القراءة"          value={s.users_total > 0 ? fmt(Math.round((s.ayahs_total || 0) / s.users_total)) : 0} color="#60a5fa" sub="آية / عضو"/>
          <StatCard icon="🔥" label="نشطون (٧ أيام)"         value={fmt(s.active_7d)}   color="#f97316"/>
          <StatCard icon="💬" label="تذاكر الدعم المفتوحة"   value={fmt(s.tickets_open)} color="#f87171" onClick={() => onTabChange('support')}/>
          <StatCard icon="🟢" label="على الموقع الآن"        value={fmt(online.total)}  color="#34d399" sub={`${online.signedIn} مسجل · ${online.guests} زائر`}/>
        </div>
      </>}

      <div className={styles.overviewCols}>
        <div className={styles.overviewCard}>
          <div className={styles.cardHeader}>
            <h3>👥 آخر الأعضاء</h3>
            <button type="button" className={styles.cardLink} onClick={() => onTabChange('users')}>الكل →</button>
          </div>
          {recent.loading && !recent.data && <p className={styles.emptyNote}>جارٍ التحميل...</p>}
          {recent.error && <ErrorLine message={recent.error} onRetry={() => recent.reload()}/>}
          {recent.data && (recent.data.items || []).length === 0 && <p className={styles.emptyNote}>لا يوجد أعضاء بعد</p>}
          {(recent.data?.items || []).map(u => (
            <div key={u.id} className={styles.miniRow}>
              <div className={styles.miniAvatar} style={{ background: strColor(u.email) }} aria-hidden="true">
                {initial(u)}
              </div>
              <div className={styles.miniInfo}>
                <span className={styles.miniName}>{u.name || u.email?.split('@')[0]}</span>
                <span className={styles.miniSub}>{timeAgo(u.created_at)}</span>
              </div>
              {u.is_admin && <span className={styles.miniBadge} title="أدمن" aria-label="أدمن">🛡</span>}
            </div>
          ))}
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.cardHeader}>
            <h3>💬 تذاكر الدعم المفتوحة</h3>
            <button type="button" className={styles.cardLink} onClick={() => onTabChange('support')}>فتح الدعم →</button>
          </div>
          {openTix.loading && !openTix.data && <p className={styles.emptyNote}>جارٍ التحميل...</p>}
          {openTix.error && <ErrorLine message={openTix.error} onRetry={() => openTix.reload()}/>}
          {openTix.data && (openTix.data.items || []).length === 0 && <p className={styles.emptyNote}>لا توجد تذاكر مفتوحة 🎉</p>}
          {(openTix.data?.items || []).map(t => (
            <div key={t.id} className={styles.miniRow}>
              <span className={styles.ticketDot} aria-hidden="true"/>
              <div className={styles.miniInfo}>
                <span className={styles.miniName}>{t.subject || 'استفسار'}</span>
                <span className={styles.miniSub}>{t.user?.email || '—'} · {timeAgo(t.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.cardHeader}><h3>🔗 روابط سريعة</h3></div>
          <a href="https://api.nuralquran.net/v1/health" target="_blank" rel="noreferrer" className={styles.quickLink}>🩺 حالة الخادم ↗</a>
          <a href="https://app.netlify.com" target="_blank" rel="noreferrer" className={styles.quickLink}>🚀 Netlify Deploy ↗</a>
          <button type="button" className={styles.quickLink} onClick={() => onTabChange('broadcasts')}>📢 إرسال إشعار للأعضاء</button>
          <button type="button" className={styles.quickLink} onClick={() => onTabChange('settings')}>⚙️ إعدادات التطبيق</button>
          <button type="button" className={styles.quickLink} onClick={() => onTabChange('integrations')}>🧩 التكاملات (Google · الذكاء الاصطناعي · البريد)</button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const stats = useStats();
  const s = stats.data;

  if (stats.loading && !s) return <PageLoader/>;
  if (stats.error && !s) return (
    <div className={styles.tabContent}>
      <PageHeader title="الإحصائيات" sub="تحليل استخدام التطبيق"/>
      <ErrorBox message={stats.error} onRetry={() => stats.reload()}/>
    </div>
  );

  const online = onlineOf(s);
  const totalUsers = s.users_total || 0;
  const active = Math.min(s.active_7d || 0, totalUsers);
  const days = lastDays(s.signups_by_day, 14);
  const maxReg = Math.max(...days.map(d => d.count), 1);
  const signups14 = days.reduce((a, d) => a + d.count, 0);
  const growth = [
    { label: 'اليوم',       value: s.users_today || 0 },
    { label: '٧ أيام',      value: s.users_7d || 0 },
    { label: '١٤ يوم',      value: signups14 },
  ];
  const maxGrowth = Math.max(...growth.map(g => g.value), 1);

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الإحصائيات" sub="تحليل استخدام التطبيق — تتحدّث كل ٣٠ ثانية"/>
      {stats.error && <InlineWarn text={`تعذّر التحديث: ${stats.error}`}/>}

      <div className={`${styles.statsGrid} ${styles.statsGridSpaced}`}>
        <StatCard icon="👥" label="إجمالي الأعضاء"  value={fmt(totalUsers)}     color="#52b788" delta={s.users_today > 0 ? `+${s.users_today} اليوم` : null}/>
        <StatCard icon="📖" label="إجمالي الآيات"    value={fmt(s.ayahs_total)}  color="#c9a84c"/>
        <StatCard icon="🔥" label="نشطون (٧ أيام)"   value={fmt(s.active_7d)}    color="#f97316"/>
        <StatCard icon="💬" label="تذاكر مفتوحة"     value={fmt(s.tickets_open)} color="#f87171"/>
        <StatCard icon="🟢" label="على الموقع الآن" value={fmt(online.total)}   color="#34d399" sub={`${online.signedIn} مسجل · ${online.guests} زائر`}/>
      </div>

      <div className={styles.livePanel} role="status" aria-live="polite">
        <div className={styles.liveDot} aria-hidden="true"/>
        <span className={styles.liveLabel}>مباشر —</span>
        <span className={styles.liveCount}>{online.total}</span>
        <span className={styles.liveLabel}> على الموقع الآن</span>
        <span className={styles.liveSplit}>({online.signedIn} مسجل · {online.guests} غير مسجل)</span>
        <span className={styles.liveNote}>يتحدّث تلقائياً</span>
      </div>

      <div className={styles.analyticsGrid}>
        <div className={`${styles.chartCard} ${styles.chartWide}`}>
          <span className={styles.chartTitle}>📅 التسجيلات — آخر ١٤ يوم</span>
          {signups14 === 0
            ? <div className={styles.chartEmpty}>لا توجد تسجيلات في آخر ١٤ يوم</div>
            : (
              <div className={styles.barChart} role="img" aria-label={`${signups14} تسجيل في آخر ١٤ يوم`}>
                {days.map(d => (
                  <div key={d.key} className={styles.barCol}>
                    <div className={styles.barVal}>{d.count > 0 ? d.count : ''}</div>
                    <div className={`${styles.bar} ${d.count > 0 ? '' : styles.barZero}`}
                      style={{ height: d.count > 0 ? `${Math.max((d.count / maxReg) * 100, 8)}%` : undefined }}/>
                    <div className={styles.barLabel}>{d.label}</div>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className={styles.chartCard}>
          <span className={styles.chartTitle}>🔥 نشاط الأعضاء (٧ أيام)</span>
          {totalUsers === 0
            ? <div className={styles.chartEmpty}>لا يوجد أعضاء بعد</div>
            : <>
                <div className={styles.donutWrap}>
                  <DonutChart
                    segments={[{ value: active, color: '#52b788' }, { value: totalUsers - active, color: '#2d3748' }]}
                    total={totalUsers}
                    centerLabel={Math.round((active / totalUsers) * 100) + '%'}
                    centerSub="نشاط"/>
                </div>
                <div className={styles.legend}>
                  <LegendItem color="#52b788" label="نشطون"     value={active}/>
                  <LegendItem color="#2d3748" label="غير نشطين" value={totalUsers - active}/>
                </div>
              </>}
        </div>

        <div className={styles.chartCard}>
          <span className={styles.chartTitle}>🟢 الزوار الآن</span>
          {online.total === 0
            ? <div className={styles.chartEmpty}>لا يوجد أحد على الموقع الآن</div>
            : <>
                <div className={styles.donutWrap}>
                  <DonutChart
                    segments={[{ value: online.signedIn, color: '#c9a84c' }, { value: online.guests, color: '#60a5fa' }]}
                    total={online.total}
                    centerLabel={online.total}
                    centerSub="الآن"/>
                </div>
                <div className={styles.legend}>
                  <LegendItem color="#c9a84c" label="مسجلون" value={online.signedIn}/>
                  <LegendItem color="#60a5fa" label="زوار"   value={online.guests}/>
                </div>
              </>}
        </div>

        <div className={styles.chartCard}>
          <span className={styles.chartTitle}>📈 الأعضاء الجدد</span>
          <div className={styles.hbarList}>
            {growth.map(g => (
              <div key={g.label} className={styles.hbarRow}>
                <span className={styles.hbarLabel}>{g.label}</span>
                <div className={styles.hbarTrack}>
                  <div className={styles.hbarFill} style={{ width: `${(g.value / maxGrowth) * 100}%` }}/>
                </div>
                <span className={styles.hbarVal}>{g.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────
const USERS_PER_PAGE = 25;

function banInfo(u) {
  if (!u || !u.banned) return null;
  const b = typeof u.banned === 'object' ? u.banned : {};
  return { reason: b.reason ?? u.ban_reason ?? '', until: b.until ?? u.banned_until ?? u.ban_until ?? null };
}

function UsersTab({ currentUser }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, filter]);

  const list = useLoader(() => listUsers({ q, filter, page, perPage: USERS_PER_PAGE }), [q, filter, page]);
  const items = list.data?.items || [];
  const total = list.data?.total ?? 0;

  const [selected, setSelected] = useState(null);
  const [msgUser,  setMsgUser]  = useState(null);
  const [banUserT, setBanUserT] = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [acting,   setActing]   = useState(null);
  const [notice, showNotice, hideNotice] = useNotice();

  const patchLocal = useCallback((id, fields) => {
    list.setData(d => d ? { ...d, items: (d.items || []).map(x => x.id === id ? { ...x, ...fields } : x) } : d);
    setSelected(s => (s && s.id === id ? { ...s, ...fields } : s));
  }, [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSelf = (u) => currentUser && String(u.id) === String(currentUser.id);

  async function doToggleAdmin(u) {
    const next = !u.is_admin;
    setActing(u.id + ':admin');
    try {
      const updated = await setUserAdmin(u.id, next);
      patchLocal(u.id, updated && typeof updated === 'object' ? updated : { is_admin: next });
      showNotice('ok', next ? 'تمت إضافة صلاحية الأدمن' : 'تمت إزالة صلاحية الأدمن');
      list.reload({ silent: true });
    } catch (e) {
      showNotice('err', errMsg(e));
    } finally {
      setActing(null);
    }
  }

  function askToggleAdmin(u) {
    if (u.is_admin) {
      setConfirm({
        title: 'إزالة صلاحية الأدمن',
        message: `هل تريد إزالة صلاحية الأدمن من ${u.name || u.email}؟`,
        confirmLabel: 'إزالة',
        danger: true,
        onConfirm: async () => {
          const updated = await setUserAdmin(u.id, false);
          patchLocal(u.id, updated && typeof updated === 'object' ? updated : { is_admin: false });
          showNotice('ok', 'تمت إزالة صلاحية الأدمن');
          list.reload({ silent: true });
        },
      });
    } else {
      doToggleAdmin(u);
    }
  }

  function askUnban(u) {
    setConfirm({
      title: 'رفع الحظر',
      message: `هل تريد رفع الحظر عن ${u.name || u.email}؟ سيتمكن من تسجيل الدخول مجدداً.`,
      confirmLabel: 'رفع الحظر',
      onConfirm: async () => {
        await unbanUser(u.id);
        patchLocal(u.id, { banned: false, ban_reason: null, banned_until: null });
        showNotice('ok', 'تم رفع الحظر');
        list.reload({ silent: true });
      },
    });
  }

  function onBanned(u, { reason, until }) {
    patchLocal(u.id, { banned: true, ban_reason: reason, banned_until: until || null });
    showNotice('ok', 'تم حظر العضو وإنهاء جلساته');
    list.reload({ silent: true });
  }

  const modalOpen = !!(msgUser || banUserT || confirm);

  function renderActions(u, inDrawer) {
    const self = isSelf(u);
    const banned = !!u.banned;
    const busyAdmin = acting === u.id + ':admin';
    return <>
      <button type="button"
        className={`${styles.actionBtn2} ${u.is_admin ? styles.actionBtnDanger : styles.actionBtnGold}`}
        disabled={busyAdmin || (self && u.is_admin)}
        title={self && u.is_admin ? 'لا يمكنك إزالة صلاحيتك بنفسك' : undefined}
        onClick={() => askToggleAdmin(u)}>
        {busyAdmin ? '...' : u.is_admin ? 'إزالة أدمن' : '+ أدمن'}
      </button>
      <button type="button"
        className={`${styles.actionBtn2} ${banned ? styles.actionBtnGreen : styles.actionBtnDanger}`}
        disabled={self}
        title={self ? 'لا يمكنك حظر نفسك' : undefined}
        onClick={() => banned ? askUnban(u) : setBanUserT(u)}>
        {banned ? 'رفع الحظر' : 'حظر'}
      </button>
      {inDrawer && (
        <button type="button" className={styles.drawerMsgBtn} onClick={() => setMsgUser(u)}>
          ✉️ إرسال رسالة مباشرة
        </button>
      )}
    </>;
  }

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الأعضاء" sub={list.data ? `${fmt(total)} عضو${filter !== 'all' || q ? ' مطابق' : ' مسجل'}` : 'إدارة الأعضاء'}/>
      <Notice notice={notice} onClose={hideNotice}/>
      <div className={styles.usersToolbar}>
        <input className={styles.searchInput} type="search"
          aria-label="بحث بالإيميل أو الاسم"
          placeholder="🔍 بحث بالإيميل أو الاسم..."
          value={search} onChange={e => setSearch(e.target.value)}/>
        <div className={styles.filterTabs} role="group" aria-label="تصفية الأعضاء">
          {[['all', 'الكل'], ['admins', 'أدمنز'], ['active', 'نشطون'], ['banned', 'محظورون']].map(([v, l]) => (
            <button key={v} type="button"
              className={`${styles.filterTab} ${filter === v ? styles.filterTabA : ''}`}
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      {list.error && <ErrorBox message={list.error} onRetry={() => list.reload()}/>}
      {list.loading ? <PageLoader/> : !list.error && (
        <>
          <div className={styles.usersCount}>{fmt(total)} نتيجة</div>
          {items.length === 0 && <p className={styles.emptyNote}>لا توجد نتائج</p>}
          <div className={styles.usersList}>
            {items.map(u => {
              const name = u.name || u.email?.split('@')[0] || '—';
              return (
                <div key={u.id}
                  className={`${styles.userRow} ${u.is_admin ? styles.userRowAdmin : ''} ${u.banned ? styles.userRowBanned : ''}`}>
                  <div className={styles.userAvatar} style={{ background: strColor(u.email) }} aria-hidden="true">
                    {initial(u)}
                  </div>
                  <div className={styles.userInfo}>
                    <div className={styles.userNameRow}>
                      <span className={styles.userName}>{u.name || '—'}</span>
                      {u.is_admin && <span className={styles.chip} style={{ '--cc': '#c9a84c' }}>🛡 أدمن</span>}
                      {u.banned   && <span className={styles.chip} style={{ '--cc': '#f87171' }}>🚫 محظور</span>}
                      {isSelf(u)  && <span className={styles.chip} style={{ '--cc': '#60a5fa' }}>أنت</span>}
                    </div>
                    <span className={styles.userEmail}>{u.email}</span>
                    <span className={styles.userMeta}>
                      {(u.ayahs_total || 0) > 0 && `📖 ${fmt(u.ayahs_total)} آية · `}
                      انضم {timeAgo(u.created_at)}
                      {u.last_seen && ` · آخر ظهور ${timeAgo(u.last_seen)}`}
                    </span>
                  </div>
                  <div className={styles.userActions}>
                    <button type="button" className={styles.iconBtn}
                      aria-label={`تفاصيل ${name}`} title="التفاصيل"
                      aria-expanded={selected?.id === u.id}
                      onClick={() => setSelected(selected?.id === u.id ? null : u)}>👁</button>
                    <button type="button" className={styles.iconBtn}
                      aria-label={`إرسال رسالة إلى ${name}`} title="إرسال رسالة"
                      onClick={() => setMsgUser(u)}>✉️</button>
                    {renderActions(u, false)}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} perPage={list.data?.per_page || USERS_PER_PAGE} total={total} onPage={setPage}/>
        </>
      )}

      {selected && (
        <UserDrawer user={selected} onClose={() => setSelected(null)} escDisabled={modalOpen}>
          {renderActions(selected, true)}
        </UserDrawer>
      )}
      {msgUser && <SendMessageModal user={msgUser} onClose={() => setMsgUser(null)}/>}
      {banUserT && <BanModal user={banUserT} onClose={() => setBanUserT(null)} onDone={(info) => { onBanned(banUserT, info); setBanUserT(null); }}/>}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </div>
  );
}

function UserDrawer({ user: u, onClose, escDisabled, children }) {
  const titleId = useId();
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, [u.id]);
  useEffect(() => {
    if (escDisabled) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, escDisabled]);
  const ban = banInfo(u);
  const GENDER = { male: 'ذكر', female: 'أنثى' };
  return (
    <div className={styles.drawer} role="dialog" aria-labelledby={titleId}>
      <div className={styles.drawerHeader}>
        <span id={titleId}>تفاصيل العضو</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="إغلاق التفاصيل">✕</button>
      </div>
      <div className={styles.drawerBody}>
        <div className={styles.drawerAvatar} style={{ background: strColor(u.email) }} aria-hidden="true">{initial(u)}</div>
        <div className={styles.drawerName}>{u.name || '—'}</div>
        <div className={styles.drawerEmail}>{u.email}</div>
        <div className={styles.drawerStats}>
          <div className={styles.drawerStat}>
            <span className={styles.drawerStatVal}>{fmt(u.ayahs_total || 0)}</span>
            <span className={styles.drawerStatLabel}>آية مقروءة</span>
          </div>
          <div className={styles.drawerStat}>
            <span className={styles.drawerStatVal}>{u.is_admin ? '✅' : '—'}</span>
            <span className={styles.drawerStatLabel}>أدمن</span>
          </div>
          <div className={styles.drawerStat}>
            <span className={styles.drawerStatVal}>{u.email_verified ? '✅' : '—'}</span>
            <span className={styles.drawerStatLabel}>بريد مؤكد</span>
          </div>
        </div>
        <div className={styles.drawerMeta}>
          <div>📅 انضم: {fmtDate(u.created_at)}</div>
          {u.last_seen && <div>🕐 آخر ظهور: {fmtDate(u.last_seen)}</div>}
          {u.gender && <div>👤 الجنس: {GENDER[u.gender] || u.gender}</div>}
          {u.show_on_leaderboard === false && <div>🏆 مخفي من المتصدرين</div>}
          {ban && (
            <div className={styles.banBox}>
              <strong>🚫 محظور</strong>
              {ban.reason ? <span>السبب: {ban.reason}</span> : null}
              <span>{ban.until ? `حتى ${fmtDate(ban.until)}` : 'حظر دائم'}</span>
            </div>
          )}
        </div>
        <div className={styles.drawerActions}>{children}</div>
      </div>
    </div>
  );
}

function SendMessageModal({ user, onClose }) {
  const [subject, setSubject] = useState('رسالة من فريق الدعم');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState(null);
  const later = useTimers();
  async function send(e) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true); setError(null);
    try {
      await messageUser(user.id, { subject: subject.trim(), body: body.trim() });
      setDone(true);
      later(onClose, 1800);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  }
  return (
    <Modal title={`✉️ رسالة لـ ${user.name || user.email?.split('@')[0]}`} onClose={onClose} busy={sending}>
      {done
        ? <div className={styles.modalDone} role="status">✅ تم الإرسال — فُتحت تذكرة دعم للعضو وستظهر في تبويب الدعم</div>
        : (
          <form onSubmit={send}>
            <input className={styles.modalInput} placeholder="الموضوع" aria-label="الموضوع" maxLength={200}
              value={subject} onChange={e => setSubject(e.target.value)}/>
            <textarea className={styles.modalTextarea} rows={5} data-autofocus
              placeholder="نص الرسالة..." aria-label="نص الرسالة" maxLength={5000}
              value={body} onChange={e => setBody(e.target.value)}/>
            {error && <div className={styles.formError} role="alert">⚠️ {error}</div>}
            <div className={styles.modalActions}>
              <button type="submit" className={styles.sendBtnFull} disabled={sending || !subject.trim() || !body.trim()}>
                {sending ? 'جارٍ الإرسال...' : 'إرسال ↑'}
              </button>
              <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={sending}>إلغاء</button>
            </div>
          </form>
        )}
    </Modal>
  );
}

function BanModal({ user, onClose, onDone }) {
  const [reason,  setReason]  = useState('');
  const [until,   setUntil]   = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState(null);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localDay(d); })();
  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSending(true); setError(null);
    // end of the chosen local day, sent as ISO 8601 UTC
    const untilIso = until ? new Date(`${until}T23:59:59`).toISOString() : undefined;
    try {
      await banUser(user.id, { reason: reason.trim(), until: untilIso });
      onDone({ reason: reason.trim(), until: untilIso });
    } catch (err) {
      setError(errMsg(err));
      setSending(false);
    }
  }
  return (
    <Modal title={`🚫 حظر ${user.name || user.email}`} onClose={onClose} busy={sending}>
      <form onSubmit={submit}>
        <div className={styles.modalNote}>لن يتمكن العضو من تسجيل الدخول، وستُنهى جميع جلساته الحالية.</div>
        <textarea className={styles.modalTextarea} rows={3} data-autofocus required
          placeholder="سبب الحظر (يُحفظ في السجل)..." aria-label="سبب الحظر" maxLength={500}
          value={reason} onChange={e => setReason(e.target.value)}/>
        <label className={styles.modalField}>
          <span>حتى تاريخ (اختياري — فارغ = حظر دائم)</span>
          <input type="date" className={styles.settingInput} min={tomorrow}
            value={until} onChange={e => setUntil(e.target.value)}/>
        </label>
        {error && <div className={styles.formError} role="alert">⚠️ {error}</div>}
        <div className={styles.modalActions}>
          <button type="submit" className={`${styles.sendBtnFull} ${styles.dangerFull}`} disabled={sending || !reason.trim()}>
            {sending ? 'جارٍ الحظر...' : 'حظر العضو'}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={sending}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────
const BROADCAST_TYPES = {
  info:    { label: '💬 معلومة', color: '#60a5fa' },
  warning: { label: '⚠️ تنبيه',  color: '#fbbf24' },
  success: { label: '✅ خبر سار', color: '#52b788' },
};

function BroadcastsTab() {
  const list = useLoader(() => listBroadcasts(), []);
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [type,    setType]    = useState('info');
  const [expires, setExpires] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const later = useTimers();

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true); setError(null);
    try {
      const created = await createBroadcast({
        title: title.trim(), body: body.trim(), type,
        expires_at: expires ? new Date(expires).toISOString() : undefined,
      });
      setTitle(''); setBody(''); setType('info'); setExpires('');
      setSent(true); later(() => setSent(false), 2500);
      if (created && created.id != null) list.setData(d => [created, ...(Array.isArray(d) ? d.filter(b => b.id !== created.id) : [])]);
      list.reload({ silent: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  function askDelete(b) {
    setConfirm({
      title: 'حذف الإشعار',
      message: `هل تريد حذف الإشعار «${b.title}»؟ سيختفي من لوحة جميع الأعضاء.`,
      confirmLabel: 'حذف',
      danger: true,
      onConfirm: async () => {
        await deleteBroadcast(b.id);
        list.setData(d => (Array.isArray(d) ? d.filter(x => x.id !== b.id) : d));
      },
    });
  }

  const items = Array.isArray(list.data) ? list.data : (list.data?.items || []);
  const now = Date.now();

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الإشعارات" sub="إرسال إعلانات لجميع الأعضاء"/>
      <div className={styles.broadcastGrid}>
        <form className={styles.composeCard} onSubmit={send}>
          <h3 className={styles.cardTitle}>📝 إشعار جديد</h3>
          <div className={styles.typeRow} role="radiogroup" aria-label="نوع الإشعار">
            {Object.entries(BROADCAST_TYPES).map(([k, v]) => (
              <button key={k} type="button" role="radio" aria-checked={type === k}
                className={`${styles.typeBtn} ${type === k ? styles.typeBtnA : ''}`}
                style={{ '--tc': v.color }}
                onClick={() => setType(k)}>{v.label}</button>
            ))}
          </div>
          <input className={styles.composeInput} placeholder="عنوان الإشعار..." aria-label="عنوان الإشعار" maxLength={200}
            value={title} onChange={e => setTitle(e.target.value)}/>
          <textarea className={styles.composeTextarea} rows={4} maxLength={2000}
            placeholder="نص الإشعار..." aria-label="نص الإشعار"
            value={body} onChange={e => setBody(e.target.value)}/>
          <label className={styles.composeLabel}>
            <span>ينتهي في (اختياري)</span>
            <input type="datetime-local" className={styles.composeInput}
              value={expires} onChange={e => setExpires(e.target.value)}/>
          </label>
          {error && <div className={styles.formError} role="alert">⚠️ {error}</div>}
          <button type="submit" className={styles.sendBtnFull}
            disabled={sending || !title.trim() || !body.trim()}>
            {sending ? 'جارٍ الإرسال...' : sent ? '✅ تم الإرسال!' : '📢 إرسال للجميع'}
          </button>
          <p className={styles.broadcastNote}>يظهر الإشعار في لوحة المستخدم (صفحة «لوحتي») لجميع الأعضاء حتى يُحذف أو ينتهي.</p>
        </form>

        <div className={styles.historyCard}>
          <h3 className={styles.cardTitle}>📋 كل الإشعارات</h3>
          {list.loading && !list.data && <PageLoader/>}
          {list.error && <ErrorLine message={list.error} onRetry={() => list.reload()}/>}
          {list.data && items.length === 0 && <p className={styles.emptyNote}>لا توجد إشعارات بعد</p>}
          {items.map(b => {
            const tm = BROADCAST_TYPES[b.type] || BROADCAST_TYPES.info;
            const expired = b.expires_at && new Date(b.expires_at).getTime() < now;
            return (
              <div key={b.id} className={`${styles.broadcastItem} ${expired ? styles.broadcastExpired : ''}`}
                style={{ borderRightColor: tm.color }}>
                <div className={styles.broadcastItemTop}>
                  <span className={styles.broadcastTitle}>{b.title}</span>
                  <span className={styles.broadcastType} style={{ color: tm.color }}>{tm.label}</span>
                  <button type="button" className={styles.iconBtnSm}
                    aria-label={`حذف الإشعار ${b.title}`} title="حذف"
                    onClick={() => askDelete(b)}>🗑</button>
                </div>
                <p className={styles.broadcastBody}>{b.body}</p>
                <span className={styles.broadcastDate}>
                  {timeAgo(b.created_at)}
                  {b.expires_at && (expired ? ' · منتهي' : ` · ينتهي ${fmtDate(b.expires_at)}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { key: 'hifz',         icon: '📚', label: 'صفحة الحفظ' },
  { key: 'khatma',       icon: '📿', label: 'الختمة الشخصية' },
  { key: 'khatma_group', icon: '🕌', label: 'ختمة الروح' },
  { key: 'leaderboard',  icon: '🏆', label: 'المتصدرون' },
  { key: 'ijaza',        icon: '📜', label: 'الإجازة والقراءات' },
  { key: 'ai_assistant', icon: '🤖', label: 'المساعد الذكي' },
  { key: 'notes',        icon: '📝', label: 'الملاحظات' },
  { key: 'search',       icon: '🔍', label: 'البحث' },
];

const SETTING_TEXT_KEYS = ['app_name', 'description', 'announcement'];

function SettingsTab() {
  const res = useLoader(() => getSettings(), []);
  const saved = res.data;                          // server truth
  const [draft, setDraft]   = useState({});        // text fields being edited
  const [status, setStatus] = useState({});        // key → {saving|saved|error}
  const later = useTimers();
  const inited = useRef(false);

  // Fill the text drafts once; later saves only touch the field that was saved,
  // so typing in another field while a save is in flight is never wiped.
  useEffect(() => {
    if (saved && !inited.current) {
      inited.current = true;
      setDraft(Object.fromEntries(SETTING_TEXT_KEYS.map(k => [k, saved[k] ?? ''])));
    }
  }, [saved]);

  async function save(statusKey, patch) {
    setStatus(s => ({ ...s, [statusKey]: { saving: true } }));
    try {
      const next = await updateSettings(patch);
      const merged = next && typeof next === 'object' ? next : null;
      res.setData(d => merged || { ...d, ...patch });
      if (merged) {
        const texts = Object.keys(patch).filter(k => SETTING_TEXT_KEYS.includes(k));
        if (texts.length) setDraft(d => { const n = { ...d }; for (const k of texts) n[k] = merged[k] ?? ''; return n; });
      }
      setStatus(s => ({ ...s, [statusKey]: { saved: true } }));
      later(() => setStatus(s => (s[statusKey]?.saved ? { ...s, [statusKey]: {} } : s)), 2500);
    } catch (e) {
      setStatus(s => ({ ...s, [statusKey]: { error: errMsg(e) } }));
    }
  }

  function saveText(key) {
    const v = draft[key] ?? '';
    if (v === (saved?.[key] ?? '')) return;
    save(key, { [key]: v });
  }

  if (res.loading && !saved) return <PageLoader/>;
  if (res.error && !saved) return (
    <div className={styles.tabContent}>
      <PageHeader title="الإعدادات" sub="تخصيص التطبيق"/>
      <ErrorBox message={res.error} onRetry={() => res.reload()}/>
    </div>
  );

  const features = saved.features || {};
  const textProps = (key) => ({
    value: draft[key] ?? '',
    onChange: e => setDraft(d => ({ ...d, [key]: e.target.value })),
    onBlur: () => saveText(key),
    disabled: !!status[key]?.saving,
  });

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الإعدادات" sub="تخصيص التطبيق"/>
      <p className={styles.helperText}>
        ℹ️ هذه الإعدادات تُطبَّق فعلياً: الخادم والموقع يحترمانها فوراً — الميزة المعطّلة تختفي ويرفض الخادم طلباتها،
        ووضع الصيانة يوقف الموقع لغير المديرين، وإيقاف التسجيل يمنع إنشاء حسابات جديدة. تُحفظ الحقول النصية عند الخروج منها.
      </p>
      <div className={styles.settingsLayout}>
        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>🎨 هوية التطبيق</h3>
          <SettingRow label="اسم التطبيق" status={status.app_name}>
            {id => <input id={id} className={styles.settingInput} maxLength={80} {...textProps('app_name')}/>}
          </SettingRow>
          <SettingRow label="وصف التطبيق" status={status.description}>
            {id => <textarea id={id} className={styles.settingInput} rows={2} maxLength={300} {...textProps('description')}/>}
          </SettingRow>
        </div>

        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>📢 إعلان للمستخدمين</h3>
          <SettingRow label="نص الإعلان" hint="فارغ = مخفي" status={status.announcement}>
            {id => <textarea id={id} className={styles.settingInput} rows={3} maxLength={500}
              placeholder="مثال: سيتوقف التطبيق للصيانة..." {...textProps('announcement')}/>}
          </SettingRow>
        </div>

        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>🔧 صيانة وأمان</h3>
          <ToggleRow label="وضع الصيانة" hint="يمنع دخول غير الأدمنز"
            value={!!saved.maintenance_mode} status={status.maintenance_mode}
            onChange={v => save('maintenance_mode', { maintenance_mode: v })}/>
          <ToggleRow label="السماح بالتسجيل" hint="إيقافه يمنع حسابات جديدة"
            value={saved.allow_signup !== false} status={status.allow_signup}
            onChange={v => save('allow_signup', { allow_signup: v })}/>
        </div>

        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>🔌 تفعيل الميزات</h3>
          {FEATURES.map(f => (
            <ToggleRow key={f.key} label={`${f.icon} ${f.label}`}
              value={features[f.key] !== false} status={status['f_' + f.key]}
              onChange={v => save('f_' + f.key, { features: { ...features, [f.key]: v } })}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────
const GOOGLE_REDIRECT_URI = 'https://api.nuralquran.net/v1/auth/google/callback';
const GOOGLE_JS_ORIGIN    = 'https://nuralquran.net';

const FIELD_META = {
  google_client_id:     { label: 'Client ID', placeholder: 'xxxxxxxx.apps.googleusercontent.com', ltr: true },
  google_client_secret: { label: 'Client Secret', secret: true, ltr: true },
  ai_provider:          { label: 'المزوّد', select: [['', '— اختر —'], ['openai', 'OpenAI'], ['anthropic', 'Anthropic']] },
  ai_model:             { label: 'النموذج', placeholder: 'اسم النموذج كما يحدده المزوّد', ltr: true },
  openai_api_key:       { label: 'مفتاح OpenAI API', secret: true, ltr: true },
  anthropic_api_key:    { label: 'مفتاح Anthropic API', secret: true, ltr: true },
  mail_from_address:    { label: 'عنوان المرسل', placeholder: 'no-reply@nuralquran.net', ltr: true, type: 'email' },
  mail_from_name:       { label: 'اسم المرسل', placeholder: 'نور القرآن' },
  mail_transport:       { label: 'طريقة الإرسال', select: [['', 'من خادم الموقع'], ['smtp', 'SMTP']] },
  smtp_host:            { label: 'خادم SMTP', placeholder: 'mail.nuralquran.net', ltr: true },
  smtp_port:            { label: 'المنفذ', placeholder: '465', ltr: true, type: 'number' },
  smtp_username:        { label: 'اسم المستخدم', placeholder: 'no-reply@nuralquran.net', ltr: true },
  smtp_password:        { label: 'كلمة المرور', secret: true, ltr: true },
  smtp_encryption:      { label: 'التشفير', select: [['', 'تلقائي حسب المنفذ'], ['tls', 'TLS — المنفذ 587'], ['ssl', 'SSL — المنفذ 465'], ['none', 'بدون']] },
};
const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_encryption'];

const INTEGRATION_GROUPS = [
  {
    id: 'google', icon: '🔑', title: 'تسجيل الدخول بجوجل', test: 'google',
    hint: 'يتيح للأعضاء الدخول بحساب Google بضغطة واحدة — أنشئ OAuth Client في Google Cloud Console والصق بياناته هنا.',
    keys: ['google_client_id', 'google_client_secret'],
  },
  {
    id: 'ai', icon: '🤖', title: 'المساعد الذكي', test: 'ai',
    hint: 'المزوّد والمفتاح اللذان يستخدمهما الخادم للإجابة عن أسئلة الأعضاء حول الآيات؛ بدون مفتاح يتوقف المساعد.',
    keys: ['ai_provider', 'ai_model', 'openai_api_key', 'anthropic_api_key'],
  },
  {
    id: 'mail', icon: '✉️', title: 'مرسل البريد', test: 'mail',
    hint: 'العنوان والاسم اللذان تُرسل بهما رسائل الموقع (تأكيد البريد، استعادة كلمة المرور، التنبيهات الأمنية، ورسائل الدعم)، وطريقة الإرسال: من خادم الموقع أو عبر SMTP.',
    smtpHint: 'لصندوق بريد cPanel: الخادم mail.<نطاقك> (مثل mail.nuralquran.net)، المنفذ 465 مع SSL، واسم المستخدم هو عنوان البريد كاملاً — ويُفضّل أن يكون هو نفسه «عنوان المرسل».',
    keys: ['mail_from_address', 'mail_from_name', 'mail_transport', ...SMTP_KEYS],
  },
];

function initialValue(item) {
  if (!item || item.secret) return '';
  return item.value ?? item.preview ?? '';
}

function IntegrationsTab() {
  const res = useLoader(() => getIntegrations(), []);
  const byKey = {};
  for (const it of (res.data?.items || [])) byKey[it.key] = it;

  const [draft, setDraft]   = useState({});   // key → string
  const [clear, setClear]   = useState({});   // secret key → true (clear on save)
  const [state, setState]   = useState({});   // group → {saving, saved, error}
  const [tests, setTests]   = useState({});   // target → {busy, ok, message}
  const later = useTimers();

  const resetKeys = useCallback((data, keys) => {
    const map = {};
    for (const it of (data?.items || [])) map[it.key] = it;
    setDraft(d => { const n = { ...d }; for (const k of keys) n[k] = initialValue(map[k]); return n; });
    setClear(c => { const n = { ...c }; for (const k of keys) delete n[k]; return n; });
  }, []);

  useEffect(() => {
    if (res.data) resetKeys(res.data, Object.keys(FIELD_META));
  }, [res.data === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const provider = draft.ai_provider ?? initialValue(byKey.ai_provider);
  const transport = draft.mail_transport ?? initialValue(byKey.mail_transport);
  function visibleKeys(g) {
    if (g.id === 'mail') return g.keys.filter(k => transport === 'smtp' || !SMTP_KEYS.includes(k));
    if (g.id !== 'ai') return g.keys;
    return g.keys.filter(k =>
      (k !== 'openai_api_key' && k !== 'anthropic_api_key') ||
      !provider || (provider === 'openai' ? k === 'openai_api_key' : k === 'anthropic_api_key'));
  }
  function changesFor(g) {
    const out = {};
    for (const k of visibleKeys(g)) {
      const meta = FIELD_META[k];
      const item = byKey[k];
      const isSecret = item ? !!item.secret : !!meta.secret;
      const v = draft[k] ?? '';
      if (isSecret) {
        if (clear[k]) out[k] = '';
        else if (v.trim() !== '') out[k] = v.trim();
      } else if (v.trim() !== String(initialValue(item)).trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  }

  async function saveGroup(g) {
    const changes = changesFor(g);
    if (Object.keys(changes).length === 0) return;
    setState(s => ({ ...s, [g.id]: { saving: true } }));
    try {
      const data = await updateIntegrations(changes);
      if (data && Array.isArray(data.items)) { res.setData(data); resetKeys(data, g.keys); }
      else res.reload({ silent: true });
      setState(s => ({ ...s, [g.id]: { saved: true } }));
      later(() => setState(s => (s[g.id]?.saved ? { ...s, [g.id]: {} } : s)), 3000);
    } catch (e) {
      setState(s => ({ ...s, [g.id]: { error: errMsg(e) } }));
    }
  }

  async function runTest(target) {
    setTests(t => ({ ...t, [target]: { busy: true } }));
    try {
      const r = await testIntegration(target);
      setTests(t => ({ ...t, [target]: { ok: !!(r && r.ok), message: (r && r.message) || (r && r.ok ? 'نجح الاختبار' : 'فشل الاختبار') } }));
    } catch (e) {
      setTests(t => ({ ...t, [target]: { ok: false, message: errMsg(e) } }));
    }
  }

  if (res.loading && !res.data) return <PageLoader/>;
  if (res.error && !res.data) return (
    <div className={styles.tabContent}>
      <PageHeader title="التكاملات" sub="ربط الخدمات الخارجية"/>
      <ErrorBox message={res.error} onRetry={() => res.reload()}/>
    </div>
  );

  return (
    <div className={styles.tabContent}>
      <PageHeader title="التكاملات" sub="ربط الخدمات الخارجية — المفاتيح السرية تُخزَّن مشفّرة على الخادم ولا تُعرض أبداً"/>
      <div className={styles.integrationsList}>
        {INTEGRATION_GROUPS.map(g => {
          const st = state[g.id] || {};
          const dirty = Object.keys(changesFor(g)).length > 0;
          const test = tests[g.test];
          return (
            <section key={g.id} className={styles.settingsCard} aria-labelledby={`int-${g.id}`}>
              <h3 id={`int-${g.id}`} className={styles.cardTitle}>{g.icon} {g.title}</h3>
              <p className={styles.integrationHint}>{g.hint}</p>

              {g.id === 'google' && <>
                <CopyLine label="رابط إعادة التوجيه (Authorized redirect URI)" value={GOOGLE_REDIRECT_URI}/>
                <CopyLine label="أصل JavaScript المصرّح به (Authorized JavaScript origin)" value={GOOGLE_JS_ORIGIN}/>
              </>}

              {visibleKeys(g).map(k => (
                <IntegrationField key={k} k={k} meta={FIELD_META[k]} item={byKey[k]}
                  value={draft[k] ?? ''} cleared={!!clear[k]} disabled={!!st.saving}
                  onChange={v => setDraft(d => ({ ...d, [k]: v }))}
                  onClear={on => { setClear(c => ({ ...c, [k]: on })); if (on) setDraft(d => ({ ...d, [k]: '' })); }}/>
              ))}
              {g.smtpHint && transport === 'smtp' && <p className={styles.integrationHint}>{g.smtpHint}</p>}

              {st.error && <div className={styles.formError} role="alert">⚠️ {st.error}</div>}
              <div className={styles.integrationActions}>
                <button type="button" className={styles.saveBtn} disabled={!dirty || st.saving} onClick={() => saveGroup(g)}>
                  {st.saving ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
                <button type="button" className={styles.testBtn} disabled={!!test?.busy || st.saving}
                  aria-label={`اختبار ${g.title}`} onClick={() => runTest(g.test)}>
                  {test?.busy ? 'جارٍ الاختبار...' : 'اختبار'}
                </button>
                {st.saved && <span className={styles.savedTxt} role="status">✓ تم الحفظ</span>}
                {dirty && !st.saving && <span className={styles.settingHint}>تغييرات غير محفوظة — الاختبار يستخدم القيم المحفوظة</span>}
              </div>
              {test && !test.busy && (
                <div className={`${styles.testResult} ${test.ok ? styles.testOk : styles.testFail}`} role="status">
                  {test.ok ? '✅' : '❌'} {test.message}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function IntegrationField({ k, meta, item, value, cleared, disabled, onChange, onClear }) {
  const id = useId();
  const isSecret = item ? !!item.secret : !!meta.secret;
  const isSet = !!item?.set;
  const label = item?.label || meta.label;
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingLabelCol}>
        <label className={styles.settingLabel} htmlFor={id}>{label}</label>
        <code className={styles.keyCode}>{k}</code>
        <span className={`${styles.setChip} ${isSet ? styles.setChipOn : ''}`}>{isSet ? '✓ مُعدّ' : 'غير مُعدّ'}</span>
      </div>
      <div className={styles.settingControl}>
        {meta.select ? (
          <select id={id} className={styles.settingInput} value={value} disabled={disabled}
            onChange={e => onChange(e.target.value)}>
            {meta.select.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : isSecret ? (
          <>
            <div className={styles.secretRow}>
              <input id={id} type="password" autoComplete="new-password" spellCheck={false}
                className={`${styles.settingInput} ${styles.ltr}`}
                value={value} disabled={disabled || cleared}
                placeholder={cleared ? 'سيُحذف عند الحفظ' : isSet ? 'اتركه فارغاً للإبقاء على القيمة الحالية' : 'الصق القيمة هنا'}
                onChange={e => onChange(e.target.value)}/>
              {isSet && (
                <button type="button" className={styles.clearBtn} disabled={disabled}
                  aria-label={cleared ? `تراجع عن حذف ${label}` : `حذف ${label}`}
                  onClick={() => onClear(!cleared)}>{cleared ? 'تراجع' : 'مسح'}</button>
              )}
            </div>
            {isSet && item?.preview && !cleared && <span className={styles.settingHint}>المحفوظ: <bdi className={styles.ltr}>{item.preview}</bdi></span>}
          </>
        ) : (
          <input id={id} type={meta.type || 'text'} spellCheck={false}
            className={`${styles.settingInput} ${meta.ltr ? styles.ltr : ''}`}
            value={value} disabled={disabled} placeholder={meta.placeholder}
            onChange={e => onChange(e.target.value)}/>
        )}
      </div>
    </div>
  );
}

function CopyLine({ label, value }) {
  const id = useId();
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const later = useTimers();
  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch {
      try { inputRef.current?.select(); ok = document.execCommand('copy'); } catch { ok = false; }
    }
    setCopied(ok ? 'ok' : 'fail');
    later(() => setCopied(false), 2000);
  }
  return (
    <div className={styles.copyLine}>
      <label htmlFor={id} className={styles.settingHint}>{label}</label>
      <div className={styles.secretRow}>
        <input id={id} ref={inputRef} readOnly value={value}
          className={`${styles.settingInput} ${styles.ltr} ${styles.readonlyInput}`}
          onFocus={e => e.target.select()}/>
        <button type="button" className={styles.clearBtn} onClick={copy} aria-label={`نسخ ${label}`}>
          {copied === 'ok' ? '✓ نُسخ' : copied === 'fail' ? 'انسخ يدوياً' : 'نسخ'}
        </button>
      </div>
    </div>
  );
}

// ─── Support ──────────────────────────────────────────────────────────────────
const TICKET_STATUS = {
  open:    { label: 'مفتوح',        color: '#f87171' },
  pending: { label: 'قيد المعالجة', color: '#fbbf24' },
  closed:  { label: 'مغلق',         color: '#52b788' },
};
const TICKETS_PER_PAGE = 30;

function SupportTab({ onRead }) {
  const [status, setStatus] = useState('');
  const [page,   setPage]   = useState(1);
  const list = useLoader(() => listTickets({ status, page, perPage: TICKETS_PER_PAGE }), [status, page]);
  useInterval(() => list.reload({ silent: true }), 30_000);
  const [active, setActive] = useState(null);

  const tickets = list.data?.items || [];

  const mergeTicket = useCallback((t) => {
    if (!t || t.id == null) return;
    list.setData(d => d ? { ...d, items: (d.items || []).map(x => x.id === t.id ? { ...x, ...t } : x) } : d);
    setActive(a => (a && a.id === t.id ? { ...a, ...t } : a));
  }, [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRead = useCallback((ticketId) => {
    list.setData(d => d ? { ...d, items: (d.items || []).map(x => x.id === ticketId ? { ...x, unread: 0 } : x) } : d);
    onRead && onRead();
  }, [list.setData, onRead]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.supportShell}>
      <div className={styles.ticketPane}>
        <div className={styles.ticketPaneHeader}>
          <span className={styles.ticketPaneTitle}>📋 تذاكر الدعم</span>
          <span className={styles.ticketPaneCount}>{list.data ? list.data.total ?? tickets.length : '…'}</span>
        </div>
        <div className={styles.ticketFilterRow} role="group" aria-label="تصفية التذاكر">
          {[['', 'الكل'], ['open', 'مفتوح'], ['pending', 'جاري'], ['closed', 'مغلق']].map(([v, l]) => (
            <button key={v || 'all'} type="button" aria-pressed={status === v}
              className={`${styles.ticketFilter} ${status === v ? styles.ticketFilterA : ''}`}
              onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
          ))}
        </div>
        <div className={styles.ticketItems}>
          {list.loading && !list.data && <PageLoader/>}
          {list.error && <ErrorLine message={list.error} onRetry={() => list.reload()}/>}
          {list.data && tickets.length === 0 && <div className={`${styles.emptyNote} ${styles.emptyPad}`}>لا توجد تذاكر</div>}
          {tickets.map(t => (
            <button key={t.id} type="button"
              className={`${styles.ticketItem} ${active?.id === t.id ? styles.ticketItemA : ''}`}
              aria-current={active?.id === t.id ? 'true' : undefined}
              onClick={() => setActive(t)}>
              <div className={styles.ticketItemRow}>
                <span className={styles.ticketSubj}>{t.subject || 'استفسار'}</span>
                {t.unread > 0 && <span className={styles.navBadge} aria-label={`${t.unread} غير مقروءة`}>{t.unread}</span>}
                <span className={styles.ticketStatus} style={{ color: TICKET_STATUS[t.status]?.color }}>{TICKET_STATUS[t.status]?.label || t.status}</span>
              </div>
              <div className={styles.ticketEmail}>{t.user?.name ? `${t.user.name} · ` : ''}{t.user?.email || '—'}</div>
              <div className={styles.ticketDate}>{timeAgo(t.updated_at)}{t.message_count ? ` · ${t.message_count} رسالة` : ''}</div>
            </button>
          ))}
          <Pagination page={page} perPage={list.data?.per_page || TICKETS_PER_PAGE} total={list.data?.total || 0} onPage={setPage} compact/>
        </div>
      </div>

      <div className={styles.chatPane}>
        {!active ? (
          <div className={styles.noChatMsg}>
            <div className={styles.bigEmoji} aria-hidden="true">💬</div>
            <p>اختر تذكرة لعرض المحادثة</p>
          </div>
        ) : (
          <TicketThread key={active.id} ticket={active}
            onClose={() => setActive(null)} onTicketUpdate={mergeTicket} onRead={handleRead}/>
        )}
      </div>
    </div>
  );
}

function TicketThread({ ticket, onClose, onTicketUpdate, onRead }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [sendErr,  setSendErr]  = useState(null);
  const [statusBusy, setStatusBusy] = useState(null);
  const [statusErr,  setStatusErr]  = useState(null);
  const endRef = useRef(null);
  const lastIdRef = useRef(null);
  const polling = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const append = useCallback((list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const merged = prev.concat(list.filter(m => !seen.has(m.id)));
      if (merged.length) lastIdRef.current = merged[merged.length - 1].id;
      return merged;
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await getTicketMessages(ticket.id);
      if (!alive.current) return;
      const arr = Array.isArray(list) ? list : [];
      lastIdRef.current = arr.length ? arr[arr.length - 1].id : null;
      setMessages(arr);
      onRead && onRead(ticket.id);
    } catch (e) {
      if (alive.current) setError(errMsg(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [ticket.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  const poll = useCallback(async () => {
    if (polling.current || loading || error) return;
    polling.current = true;
    try {
      const list = await getTicketMessages(ticket.id, lastIdRef.current ?? undefined);
      if (alive.current && Array.isArray(list) && list.length) { append(list); onRead && onRead(ticket.id); }
    } catch { /* transient; next poll retries */ }
    finally { polling.current = false; }
  }, [ticket.id, loading, error, append]); // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(poll, 5_000);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  async function handleSend(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setSending(true); setSendErr(null);
    try {
      const msg = await replyToTicket(ticket.id, body);
      if (msg && msg.id != null) append([msg]);
      setInput('');
    } catch (err) {
      setSendErr(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(k) {
    if (k === ticket.status) return;
    setStatusBusy(k); setStatusErr(null);
    try {
      const t = await setTicketStatus(ticket.id, k);
      onTicketUpdate(t && t.id != null ? t : { id: ticket.id, status: k });
    } catch (err) {
      setStatusErr(errMsg(err));
    } finally {
      setStatusBusy(null);
    }
  }

  const closed = ticket.status === 'closed';
  const userLabel = ticket.user?.name || ticket.user?.email?.split('@')[0] || 'العضو';

  return <>
    <div className={styles.chatHead}>
      <div className={styles.chatHeadInfo}>
        <div className={styles.chatSubj}>{ticket.subject || 'استفسار'}</div>
        <div className={styles.chatEmail}>{ticket.user?.email || '—'}{ticket.topic ? ` · ${ticket.topic}` : ''}</div>
      </div>
      <div className={styles.statusPills} role="group" aria-label="حالة التذكرة">
        {Object.entries(TICKET_STATUS).map(([k, v]) => (
          <button key={k} type="button" aria-pressed={ticket.status === k}
            className={`${styles.statusPill} ${ticket.status === k ? styles.statusPillA : ''}`}
            style={{ '--sc': v.color }} disabled={!!statusBusy}
            onClick={() => changeStatus(k)}>{statusBusy === k ? '...' : v.label}</button>
        ))}
      </div>
      <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="إغلاق المحادثة" title="إغلاق">✕</button>
    </div>
    {statusErr && <div className={styles.formErrorBar} role="alert">⚠️ {statusErr}</div>}
    <div className={styles.msgList} aria-live="polite">
      {loading && <PageLoader/>}
      {error && <ErrorLine message={error} onRetry={loadAll}/>}
      {!loading && !error && messages.length === 0 && <div className={`${styles.emptyNote} ${styles.emptyPad}`}>لا توجد رسائل بعد</div>}
      {messages.map(m => (
        <div key={m.id} className={`${styles.msgWrap} ${m.is_admin ? styles.msgWrapAdmin : ''}`}>
          <div className={styles.msgBubble2}>{m.body}</div>
          <div className={styles.msgTime}>
            {m.is_admin ? `🛡 ${m.sender_name || 'فريق الدعم'}` : `👤 ${m.sender_name || userLabel}`} · {fmtTime(m.created_at)}
          </div>
        </div>
      ))}
      <div ref={endRef}/>
    </div>
    {sendErr && <div className={styles.formErrorBar} role="alert">⚠️ {sendErr}</div>}
    <form onSubmit={handleSend} className={styles.chatInputRow}>
      <input className={styles.chatInputBox} aria-label="نص الرد" maxLength={5000}
        placeholder={closed ? 'هذه التذكرة مغلقة — غيّر حالتها لإعادة فتحها' : 'اكتب ردك...'}
        value={input} onChange={e => setInput(e.target.value)}
        disabled={closed || sending}/>
      <button type="submit" className={styles.chatSendBtn} aria-label="إرسال الرد"
        disabled={sending || !input.trim() || closed}>
        {sending ? '...' : '↑'}
      </button>
    </form>
  </>;
}

// ─── Log ──────────────────────────────────────────────────────────────────────
const LOG_PER_PAGE = 50;

function LogTab() {
  const [page, setPage] = useState(1);
  const res = useLoader(() => getLog({ page, perPage: LOG_PER_PAGE }), [page]);
  const items = res.data?.items || [];
  return (
    <div className={styles.tabContent}>
      <div className={styles.headerRow}>
        <PageHeader title="السجل" sub="كل إجراءات المديرين، الأحدث أولاً"/>
        <button type="button" className={styles.cancelBtn} onClick={() => res.reload()} disabled={res.loading}>
          {res.loading ? '...' : '↻ تحديث'}
        </button>
      </div>
      {res.error && <ErrorBox message={res.error} onRetry={() => res.reload()}/>}
      {res.loading ? <PageLoader/> : !res.error && (
        <>
          {items.length === 0 && <p className={styles.emptyNote}>لا توجد إجراءات مسجلة بعد</p>}
          {items.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.logTable}>
                <thead>
                  <tr><th scope="col">الوقت</th><th scope="col">المدير</th><th scope="col">الإجراء</th><th scope="col">الهدف</th></tr>
                </thead>
                <tbody>
                  {items.map(r => (
                    <tr key={r.id}>
                      <td title={r.created_at}>{fmtDate(r.created_at)}</td>
                      <td className={styles.ltr}>{r.admin_email || '—'}</td>
                      <td><code className={styles.keyCode}>{r.action}</code></td>
                      <td className={styles.logTarget}>{typeof r.target === 'object' && r.target !== null ? JSON.stringify(r.target) : (r.target ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} perPage={res.data?.per_page || LOG_PER_PAGE} total={res.data?.total || 0} onPage={setPage}/>
        </>
      )}
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, delta, sub, onClick }) {
  const inner = <>
    <div className={styles.statIcon} aria-hidden="true">{icon}</div>
    <div className={styles.statVal}>{value ?? '—'}</div>
    <div className={styles.statLabel}>{label}</div>
    {delta && <div className={styles.statDelta}>{delta}</div>}
    {sub && <div className={styles.statSub}>{sub}</div>}
  </>;
  if (onClick) return (
    <button type="button" className={`${styles.statCard} ${styles.statCardBtn}`} style={{ '--c': color }} onClick={onClick}>{inner}</button>
  );
  return <div className={styles.statCard} style={{ '--c': color }}>{inner}</div>;
}

function Toggle({ value, onChange, label, busy }) {
  return (
    <button type="button" role="switch" aria-checked={!!value} aria-label={label} aria-busy={busy || undefined}
      className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
      disabled={busy} onClick={() => onChange(!value)}>
      <span className={styles.toggleThumb}/>
    </button>
  );
}

function ToggleRow({ label, hint, value, status = {}, onChange }) {
  return (
    <div className={styles.toggleRow}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        {hint && <div className={styles.toggleHint}>{hint}</div>}
        <FieldStatus status={status}/>
      </div>
      <Toggle value={value} label={label} busy={!!status.saving} onChange={onChange}/>
    </div>
  );
}

function FieldStatus({ status = {} }) {
  if (status.saving) return <span className={styles.savingTxt}>جارٍ الحفظ...</span>;
  if (status.saved)  return <span className={styles.savedTxt} role="status">✓ تم الحفظ</span>;
  if (status.error)  return <span className={styles.errorTxt} role="alert">⚠️ {status.error}</span>;
  return null;
}

function SettingRow({ label, children, status, hint }) {
  const id = useId();
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingLabelCol}>
        <label className={styles.settingLabel} htmlFor={id}>{label}</label>
        {hint && <span className={styles.settingHint}>{hint}</span>}
      </div>
      <div className={styles.settingControl}>
        {children(id)}
        <FieldStatus status={status}/>
      </div>
    </div>
  );
}

function Modal({ title, onClose, busy, children }) {
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
      <div ref={boxRef} className={styles.modalBox} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.modalHeader}>
          <span id={titleId}>{title}</span>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'تأكيد', danger, onConfirm, onClose }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  async function go() {
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <div className={styles.modalNote}>{message}</div>
      {error && <div className={styles.formError} role="alert">⚠️ {error}</div>}
      <div className={styles.modalActions}>
        <button type="button" className={`${styles.sendBtnFull} ${danger ? styles.dangerFull : ''}`} onClick={go} disabled={busy}>
          {busy ? '...' : confirmLabel}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={busy} data-autofocus>إلغاء</button>
      </div>
    </Modal>
  );
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  const err = notice.type === 'err';
  return (
    <div className={`${styles.notice} ${err ? styles.noticeErr : styles.noticeOk}`} role={err ? 'alert' : 'status'}>
      <span>{err ? '⚠️' : '✅'} {notice.text}</span>
      <button type="button" onClick={onClose} aria-label="إغلاق التنبيه">✕</button>
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className={styles.errorCard} role="alert">
      <div className={styles.bigEmoji} aria-hidden="true">⚠️</div>
      <h3>تعذّر تحميل البيانات</h3>
      <p>{message}</p>
      {onRetry && <button type="button" className={styles.cancelBtn} onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

function ErrorLine({ message, onRetry }) {
  return (
    <div className={styles.errorLine} role="alert">
      <span>⚠️ {message}</span>
      {onRetry && <button type="button" className={styles.cardLink} onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

function InlineWarn({ text }) {
  return <div className={styles.inlineWarn} role="status">⚠️ {text}</div>;
}

function Pagination({ page, perPage, total, onPage, compact }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (perPage || 1)));
  if (pages <= 1) return null;
  return (
    <nav className={`${styles.pager} ${compact ? styles.pagerCompact : ''}`} aria-label="التنقل بين الصفحات">
      <button type="button" className={styles.pagerBtn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="الصفحة السابقة">→ السابق</button>
      <span className={styles.pagerInfo}>صفحة {page} من {pages}</span>
      <button type="button" className={styles.pagerBtn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="الصفحة التالية">التالي ←</button>
    </nav>
  );
}

function PageHeader({ title, sub }) {
  return (
    <div className={styles.pageHeader}>
      <h2 className={styles.pageTitle}>{title}</h2>
      {sub && <p className={styles.pageSub}>{sub}</p>}
    </div>
  );
}
function PageLoader() {
  return <div className={styles.loadingPulse} role="status">جارٍ التحميل...</div>;
}
function DonutChart({ segments, total, centerLabel, centerSub }) {
  const SZ = 120, R = 46, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} role="img" aria-label={`${centerLabel} ${centerSub}`}>
      <circle cx={SZ / 2} cy={SZ / 2} r={R} fill="none" stroke="var(--border)" strokeWidth={14}/>
      {segments.filter(s => s.value > 0).map((s, i) => {
        const dash = total > 0 ? (s.value / total) * C : 0;
        const el = (<circle key={i} cx={SZ / 2} cy={SZ / 2} r={R} fill="none"
          stroke={s.color} strokeWidth={14}
          strokeDasharray={`${dash} ${C}`}
          strokeDashoffset={-off}
          transform={`rotate(-90 ${SZ / 2} ${SZ / 2})`}/>);
        off += dash; return el;
      })}
      <text x={SZ / 2} y={SZ / 2 - 4} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)">{centerLabel}</text>
      <text x={SZ / 2} y={SZ / 2 + 14} textAnchor="middle" fontSize="10" fill="var(--text3)">{centerSub}</text>
    </svg>
  );
}
function LegendItem({ color, label, value }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }}/>
      <span className={styles.legendLabel}>{label}</span>
      <span className={styles.legendVal}>{value}</span>
    </div>
  );
}
function NotLoggedIn() {
  return (
    <div className={styles.center}>
      <div className={styles.bigEmoji} aria-hidden="true">🔐</div>
      <h2>يجب تسجيل الدخول أولاً</h2>
      <Link to="/login" className={styles.bigBtn}>تسجيل الدخول</Link>
    </div>
  );
}
function NotAdmin({ supportLink }) {
  return (
    <div className={styles.center}>
      <div className={styles.bigEmoji} aria-hidden="true">🚫</div>
      <h2>غير مصرح لك</h2>
      <p>هذه الصفحة للمديرين فقط</p>
      {supportLink
        ? <Link to="/support" className={styles.bigBtn}>صفحة الدعم</Link>
        : <Link to="/" className={styles.bigBtn}>العودة للرئيسية</Link>}
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function strColor(str = '') {
  const c = ['#52b788', '#c9a84c', '#60a5fa', '#f97316', '#a78bfa', '#fb7185', '#34d399', '#38bdf8'];
  let h = 0; for (const x of String(str || '')) h = (h * 31 + x.charCodeAt(0)) % c.length; return c[h];
}
function initial(u) { return String((u && (u.name || u.email)) || '?')[0].toUpperCase(); }
function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  n = Number(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'م';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'ك';
  return String(n);
}
function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Last `n` days ending at the newest date the server sent (or today, UTC), zero-filled.
function lastDays(rows, n) {
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
    out.push({ key, count: map[key] || 0, label: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }) });
  }
  return out;
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(dateStr) {
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

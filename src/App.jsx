import { useEffect, useState, lazy, Suspense, Component } from 'react';
import { useLang, LANGS } from './i18n';
import { useTr, trNow, surahName } from './l10n';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import { useStore, setGlobal } from './store';
import { SiteHeader, SiteFooter, SiteChrome } from './components/shell/Shell';
import { OrnamentDefs, Badge8, Icon } from './components/ornaments/Ornaments';
import Sidebar         from './components/Sidebar';
import Reader          from './components/Reader';
import TafsirPanel     from './components/TafsirPanel';
import AudioPlayer     from './components/AudioPlayer';
import Toast           from './components/Toast';
import AIAssistant     from './components/AIAssistant';
import QuickNoteWidget from './components/QuickNoteWidget';
import ShareCard       from './components/ShareCard';
import LoginPage       from './pages/LoginPage';
import SignupPage      from './pages/SignupPage';
import DashboardPage   from './pages/DashboardPage';
import FavoritesPage   from './pages/FavoritesPage';
import SettingsPage    from './pages/SettingsPage';
const HifzPage = lazy(() => import('./pages/HifzPage'));
import NotesPage       from './pages/NotesPage';
import SearchPage      from './pages/SearchPage';
import WelcomePage     from './pages/WelcomePage';
const KhatmaPage = lazy(() => import('./pages/KhatmaPage'));
const KhatmaGroupPage = lazy(() => import('./pages/KhatmaGroupPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
import AuthCallbackPage  from './pages/AuthCallbackPage';
import ResetPasswordPage  from './pages/ResetPasswordPage';
const IjazaPage = lazy(() => import('./pages/IjazaPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
import PrivacyPage     from './pages/PrivacyPage';
import TermsPage       from './pages/TermsPage';
import DeleteDataPage  from './pages/DeleteDataPage';
import NotFoundPage    from './pages/NotFoundPage';
const RadioPage = lazy(() => import('./pages/RadioPage'));
const TasbihPage = lazy(() => import('./pages/TasbihPage'));
const DailyAyahPage = lazy(() => import('./pages/DailyAyahPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
import ErrorBoundary    from './components/ErrorBoundary';
const PrayerTimesPage = lazy(() => import('./pages/PrayerTimesPage'));
const QiblaPage = lazy(() => import('./pages/QiblaPage'));
const AdhkarPage = lazy(() => import('./pages/AdhkarPage'));
import styles from './App.module.css';
import { pingPresence } from './backend';
import { useAuth } from './hooks/useAuth';
import { usePublicSettings, featureOn } from './hooks/usePublicSettings';

// Silent boundary for floating extras: if one widget crashes it disappears
// instead of taking down the whole app (or the other widgets).
class ExtraBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('[ExtraBoundary]', error, info); }
  render() { return this.state.failed ? null : this.props.children; }
}

function ReaderLayout() {
  const [state] = useStore();
  const tafsirOpen = !!state.showTafsir;
  return (
    <div className={`${styles.appRoot} ${tafsirOpen ? styles.withTafsir : ''}`}>
      <SiteHeader />
      {/* Reading progress — a hairline pinned under the sticky header */}
      <div className={styles.progressTrack} aria-hidden="true">
        <div id="progressBar" className={styles.progressBar} />
      </div>
      <div className={styles.body}>
        <Sidebar />
        <Reader />
        {tafsirOpen && <TafsirPanel />}
      </div>
      <AudioPlayer />
    </div>
  );
}

function FullLayout({ children, footer = true }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className={styles.fullPage}>{children}</main>
      {footer && <SiteFooter />}
    </>
  );
}

// Shown in place of a page whose feature the admin switched off.
function FeatureOff() {
  const tr = useTr();
  return (
    <div className={styles.notice}>
      <div className={styles.noticeIcon}><Badge8 icon="lock" size={72} /></div>
      <h2>{tr('هذه الميزة متوقفة حالياً')}</h2>
      <p>{tr('أوقفت الإدارة هذه الصفحة مؤقتاً. يمكنك متابعة القراءة وبقية الميزات كالمعتاد.')}</p>
      <Link to="/" className={styles.noticeBtn}>{tr('العودة للرئيسية')}</Link>
    </div>
  );
}

function MaintenancePage({ settings }) {
  const tr = useTr();
  return (
    <div className={styles.notice} style={{ minHeight: '100vh' }}>
      <div className={styles.noticeIcon}><Badge8 icon="gear" size={72} /></div>
      <h2>{tr('{name} في صيانة مؤقتة', { name: settings.app_name || tr('نور القرآن') })}</h2>
      <p>{tr('نعمل على تحسين التطبيق، وسنعود قريباً بإذن الله. شكراً لصبرك.')}</p>
      {settings.announcement && <p className={styles.noticeSub} dir="auto">{settings.announcement}</p>}
      <Link to="/login" className={styles.noticeLink}>{tr('دخول المشرفين')}</Link>
    </div>
  );
}

const ANN_KEY = 'nq_dismissed_announcement';
function AnnouncementBanner({ text }) {
  const tr = useTr();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(ANN_KEY) || ''; } catch { return ''; } });
  if (!text || dismissed === text) return null;
  return (
    <div className={styles.announcement} role="status">
      <span className={styles.announcementIcon}><Icon name="bell" /></span>
      <span className={styles.announcementText} dir="auto">{text}</span>
      <button className={styles.announcementClose} title={tr('إغلاق')} aria-label={tr('إغلاق')} onClick={() => {
        setDismissed(text);
        try { localStorage.setItem(ANN_KEY, text); } catch {}
      }}>×</button>
    </div>
  );
}

// route path → feature flag in /settings/public
const ROUTE_FEATURES = {
  '/hifz': 'hifz', '/khatma': 'khatma', '/khatma-group': 'khatma_group',
  '/leaderboard': 'leaderboard', '/ijaza': 'ijaza', '/notes': 'notes', '/search': 'search',
};

export default function App() {
  const location = useLocation();
  const lang = useLang();

  // Sync <html lang dir> with selected language
  useEffect(() => {
    const l = LANGS.find(x => x.code === lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', l?.dir || 'rtl');
  }, [lang]);
  const { user, loading: authLoading } = useAuth();
  const settings = usePublicSettings();

  // ─── Presence: on route change + every 60 s (signed-in or guest) ─────────
  useEffect(() => { pingPresence(location.pathname); }, [location.pathname]);
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) pingPresence(window.location.pathname);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const savedSize = localStorage.getItem('nq_fontSize');
    if (savedSize) {
      document.documentElement.style.setProperty('--font-size', savedSize + 'px');
    }
    if (location.pathname === '/reader') {
      const lastRead = JSON.parse(localStorage.getItem('nq_lastRead') || '{"surah":1,"ayah":1}');
      setTimeout(() => {
        setGlobal({ toast: trNow('أهلاً بعودتك · آخر قراءة: سورة {name}', { name: surahName(lastRead.surah) }) });
      }, 900);
    }
  }, []);

  const isHome = location.pathname === '/';
  const hideExtras = isHome || [
    '/admin', '/privacy', '/terms', '/delete-data', '/support',
    '/login', '/signup', '/auth/callback', '/reset-password',
  ].some(p => location.pathname === p || location.pathname.startsWith('/admin'));

  const path = location.pathname;
  const isAdmin = !!user?.is_admin;
  const maintenanceExempt = path === '/login' || path === '/auth/callback' || path === '/admin' || path.startsWith('/admin/');
  if (settings.maintenance_mode && !isAdmin && !maintenanceExempt) {
    if (authLoading) return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'50vh'}}>
        <div style={{width:36,height:36,borderRadius:'50%',border:'3px solid var(--border)',borderTopColor:'var(--gold)',animation:'spin .7s linear infinite'}}/>
      </div>
    );
    return <MaintenancePage settings={settings} />;
  }

  // Feature-flagged pages
  const gate = (route, el) => (featureOn(settings, ROUTE_FEATURES[route]) ? el : <FullLayout><FeatureOff /></FullLayout>);

  return (
    <>
      <OrnamentDefs />
      {!path.startsWith('/admin') && <AnnouncementBanner text={(settings.announcement || '').trim()} />}
      <ErrorBoundary>
      <Suspense fallback={
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'50vh'}}>
          <div style={{width:36,height:36,borderRadius:'50%',border:'3px solid var(--border)',borderTopColor:'var(--gold)',animation:'spin .7s linear infinite'}}/>
        </div>
      }>
      <Routes>
        <Route path="/"             element={<FullLayout><WelcomePage /></FullLayout>} />
        <Route path="/reader"       element={<ReaderLayout />} />
        <Route path="/login"        element={<FullLayout><LoginPage /></FullLayout>} />
        <Route path="/signup"       element={<FullLayout><SignupPage /></FullLayout>} />
        <Route path="/dashboard"    element={<FullLayout><DashboardPage /></FullLayout>} />
        <Route path="/favorites"    element={<FullLayout><FavoritesPage /></FullLayout>} />
        <Route path="/settings"     element={<FullLayout><SettingsPage /></FullLayout>} />
        <Route path="/hifz"         element={gate('/hifz', <FullLayout><HifzPage /></FullLayout>)} />
        <Route path="/notes"        element={gate('/notes', <FullLayout><NotesPage /></FullLayout>)} />
        <Route path="/search"       element={gate('/search', <FullLayout><SearchPage /></FullLayout>)} />
        <Route path="/khatma"       element={gate('/khatma', <FullLayout><KhatmaPage /></FullLayout>)} />
        <Route path="/khatma-group" element={gate('/khatma-group', <FullLayout><KhatmaGroupPage /></FullLayout>)} />
        <Route path="/help"         element={<FullLayout><HelpPage /></FullLayout>} />
        <Route path="/docs"         element={<FullLayout><DocsPage /></FullLayout>} />
        <Route path="/leaderboard"  element={gate('/leaderboard', <FullLayout><LeaderboardPage /></FullLayout>)} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<FullLayout><ResetPasswordPage /></FullLayout>} />
        <Route path="/ijaza"        element={gate('/ijaza', <FullLayout><IjazaPage /></FullLayout>)} />
        <Route path="/admin"        element={<AdminPage />} />
        <Route path="/support"       element={<FullLayout><SupportPage /></FullLayout>} />
        <Route path="/admin/support" element={<AdminPage defaultTab="support" />} />
        <Route path="/privacy"      element={<FullLayout><PrivacyPage /></FullLayout>} />
        <Route path="/terms"        element={<FullLayout><TermsPage /></FullLayout>} />
        <Route path="/delete-data"  element={<FullLayout><DeleteDataPage /></FullLayout>} />
        <Route path="/prayer-times" element={<FullLayout><PrayerTimesPage /></FullLayout>} />
        <Route path="/qibla"        element={<FullLayout><QiblaPage /></FullLayout>} />
        <Route path="/adhkar"       element={<FullLayout><AdhkarPage /></FullLayout>} />
        <Route path="/radio"        element={<FullLayout><RadioPage /></FullLayout>} />
        <Route path="/tasbih"       element={<FullLayout><TasbihPage /></FullLayout>} />
        <Route path="/daily-ayah"   element={<FullLayout><DailyAyahPage /></FullLayout>} />
        <Route path="/report"       element={<FullLayout><ReportPage /></FullLayout>} />
        <Route path="*"             element={<FullLayout><NotFoundPage /></FullLayout>} />
      </Routes>
      </Suspense>
      </ErrorBoundary>

      {!path.startsWith('/admin') && path !== '/auth/callback' && <ExtraBoundary><SiteChrome /></ExtraBoundary>}
      {!hideExtras && (
        <>
          {featureOn(settings, 'ai_assistant') && <ExtraBoundary><AIAssistant /></ExtraBoundary>}
          <ExtraBoundary><QuickNoteWidget /></ExtraBoundary>
          <ExtraBoundary><ShareCard /></ExtraBoundary>
          <ExtraBoundary><Toast /></ExtraBoundary>
        </>
      )}
    </>
  );
}

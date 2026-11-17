import { useEffect, useRef, lazy, Suspense } from 'react';
import { useLang, LANGS } from './i18n';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useStore, setGlobal } from './store';
import { SURAHS_META } from './data';
import Toolbar from './components/Toolbar';
import Header          from './components/Header';
import Sidebar         from './components/Sidebar';
import Reader          from './components/Reader';
import AudioPlayer     from './components/AudioPlayer';
import Toast           from './components/Toast';
import AIAssistant     from './components/AIAssistant';
import QuickNoteWidget from './components/QuickNoteWidget';
import ShareCard       from './components/ShareCard';
import BottomNav       from './components/BottomNav';
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
import { joinPresence } from './supabase';

function ReaderLayout() {
  return (
    <div className={styles.appRoot}>
      <div className={styles.progressTrack}>
        <div id="progressBar" className={styles.progressBar} />
      </div>
      <div className={styles.stickyTop}>
        <Header />
        <Toolbar />
      </div>
      <div className={styles.body}>
        <Sidebar />
        <Reader />
      </div>
      <AudioPlayer />
    </div>
  );
}

function FullLayout({ children }) {
  return <div className={styles.fullPage}>{children}</div>;
}

export default function App() {
  const location = useLocation();
  const lang = useLang();

  // Sync <html lang dir> with selected language
  useEffect(() => {
    const l = LANGS.find(x => x.code === lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', l?.dir || 'rtl');
  }, [lang]);
  const presenceChannel = useRef(null);

  // ─── Track visitor presence (مسجل أو لا) ─────────────────────────────────
  useEffect(() => {
    joinPresence(null).then(ch => {
      presenceChannel.current = ch;
    });
    return () => {
      if (presenceChannel.current) presenceChannel.current.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('nq_theme');
    if (saved === 'light') {
      document.body.classList.add('light');
      setGlobal({ darkMode: false });
    }
    const savedSize = localStorage.getItem('nq_fontSize');
    if (savedSize) {
      document.documentElement.style.setProperty('--font-size', savedSize + 'px');
    }
    if (location.pathname === '/reader') {
      const lastRead = JSON.parse(localStorage.getItem('nq_lastRead') || '{"surah":1,"ayah":1}');
      setTimeout(() => {
        setGlobal({ toast: `مرحباً 🌿 آخر قراءة: سورة ${SURAHS_META[lastRead.surah - 1][0]}` });
      }, 900);
    }
  }, []);

  const isHome = location.pathname === '/';
  const hideExtras = isHome || [
    '/admin', '/privacy', '/terms', '/delete-data', '/support',
    '/login', '/signup', '/auth/callback', '/reset-password',
  ].some(p => location.pathname === p || location.pathname.startsWith('/admin'));

  return (
    <>
      <ErrorBoundary>
      <Suspense fallback={
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'50vh'}}>
          <div style={{width:36,height:36,borderRadius:'50%',border:'3px solid var(--border)',borderTopColor:'var(--gold)',animation:'spin .7s linear infinite'}}/>
        </div>
      }>
      <Routes>
        <Route path="/"             element={<WelcomePage />} />
        <Route path="/reader"       element={<ReaderLayout />} />
        <Route path="/login"        element={<FullLayout><LoginPage /></FullLayout>} />
        <Route path="/signup"       element={<FullLayout><SignupPage /></FullLayout>} />
        <Route path="/dashboard"    element={<FullLayout><DashboardPage /></FullLayout>} />
        <Route path="/favorites"    element={<FullLayout><FavoritesPage /></FullLayout>} />
        <Route path="/settings"     element={<FullLayout><SettingsPage /></FullLayout>} />
        <Route path="/hifz"         element={<FullLayout><HifzPage /></FullLayout>} />
        <Route path="/notes"        element={<FullLayout><NotesPage /></FullLayout>} />
        <Route path="/search"       element={<FullLayout><SearchPage /></FullLayout>} />
        <Route path="/khatma"       element={<FullLayout><KhatmaPage /></FullLayout>} />
        <Route path="/khatma-group" element={<FullLayout><KhatmaGroupPage /></FullLayout>} />
        <Route path="/help"         element={<FullLayout><HelpPage /></FullLayout>} />
        <Route path="/docs"         element={<FullLayout><DocsPage /></FullLayout>} />
        <Route path="/leaderboard"  element={<FullLayout><LeaderboardPage /></FullLayout>} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<FullLayout><ResetPasswordPage /></FullLayout>} />
        <Route path="/ijaza"        element={<FullLayout><IjazaPage /></FullLayout>} />
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

      {!hideExtras && (
        <>
          <AIAssistant />
          <QuickNoteWidget />
          <ShareCard />
          <BottomNav />
          <Toast />
        </>
      )}
    </>
  );
}

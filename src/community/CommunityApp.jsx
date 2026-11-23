// ─── Voice rooms & community (app only) ──────────────────────────────────────
// Loaded lazily by App.jsx only when isNative(): the website never requests this
// chunk. One guard for every screen: signed in → community profile (gender +
// birthdate, docs/ROOMS-DECISIONS.md) → not under 13 → not suspended.
import { lazy, Suspense, useEffect } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMe, loadMe, resetMe } from './store';
import { useT } from './format';
import { errText, suspensionText } from './errors';
import { Spinner, ErrorBox, ToastView, RIcon, css as s } from './ui';
import Gate from './Gate';

const Hub = lazy(() => import('./Hub'));
const CreateRoom = lazy(() => import('./CreateRoom'));
const RoomScreen = lazy(() => import('./Room'));
const Profile = lazy(() => import('./Profile'));
const Group = lazy(() => import('./Group'));
const CreateGroup = lazy(() => import('./CreateGroup'));
const GroupsDiscover = lazy(() => import('./GroupsDiscover'));
const Messages = lazy(() => import('./Messages'));
const Thread = lazy(() => import('./Thread'));
const Notifications = lazy(() => import('./Notifications'));

const ROUTES = [
  ['/rooms', Hub],
  ['/rooms/new', CreateRoom],
  ['/rooms/:id', RoomScreen],
  ['/people/:id', Profile],
  ['/groups/new', CreateGroup],
  ['/groups/discover', GroupsDiscover],
  ['/groups/:id', Group],
  ['/messages', Messages],
  ['/messages/:id', Thread],
  ['/notifications', Notifications],
];

function Notice({ icon = 'star8', title, body, children }) {
  return (
    <div className={s.stateCard}>
      <span className={s.emptyIco}><RIcon name={icon} size={32} /></span>
      <h1 className={s.h2}>{title}</h1>
      {body && <p className={s.muted}>{body}</p>}
      {children}
    </div>
  );
}

export default function CommunityApp() {
  const t = useT();
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const meState = useMe();

  useEffect(() => { if (user) loadMe(); else if (!loading) resetMe(); }, [user, loading]);

  let match = null, Screen = null;
  for (const [path, C] of ROUTES) {
    const m = matchPath({ path, end: true }, pathname);
    if (m && !(path === '/rooms/:id' && m.params.id === 'new') && !(path === '/groups/:id' && (m.params.id === 'new' || m.params.id === 'discover'))) { match = m; Screen = C; break; }
  }

  let body;
  if (loading || (user && (meState.status === 'idle' || (meState.status === 'loading' && !meState.data)))) {
    body = <Spinner />;
  } else if (!user) {
    body = (
      <Notice icon="live" title={t('الغرف الصوتية والمجتمع')} body={t('سجّل الدخول لتدخل الغرف وتتابع أصحابك وجروباتك.')}>
        <Link to="/login" className={`${s.btn} ${s.btnGold}`}>{t('تسجيل الدخول')}</Link>
      </Notice>
    );
  } else if (meState.status === 'error' && !meState.data) {
    const e = meState.error;
    body = e && e.code === 'feature_disabled'
      ? <Notice icon="lock" title={t('الغرف والمجتمع متوقفة حالياً')} body={t('أوقفت الإدارة هذه الميزة مؤقتاً. يمكنك متابعة القراءة وبقية الميزات كالمعتاد.')} />
      : <div className={s.page}><ErrorBox text={errText(t, e)} onRetry={() => loadMe(true)} /></div>;
  } else {
    const p = meState.data;
    const suspended = p.suspension && p.suspension.scope === 'community';
    if (p.underage) {
      body = <Notice icon="shield" title={t('الغرف متاحة لمن أتمّ ١٣ سنة')} body={t('حسب تاريخ الميلاد المسجّل في حسابك، لا يمكنك دخول الغرف والمجتمع الآن. إن كان التاريخ خطأً فتواصل مع الدعم.')}>
        <Link to="/support" className={`${s.btn} ${s.btnGhost}`}>{t('تواصل مع الدعم')}</Link>
      </Notice>;
    } else if (!p.joined || (p.missing && p.missing.length)) {
      body = <Gate profile={p} />;
    } else if (suspended && !matchPath('/notifications', pathname)) {
      body = <Notice icon="lock" title={t('حسابك موقوف في المجتمع')} body={suspensionText(t, 'community_suspended', p.suspension)}>
        <p className={s.faint}>{t('يمكنك متابعة القراءة وبقية ميزات التطبيق كالمعتاد. للاستفسار تواصل مع الدعم.')}</p>
        <div className={s.row} style={{ justifyContent: 'center' }}>
          <Link to="/notifications" className={`${s.btn} ${s.btnGhost}`}>{t('الإشعارات')}</Link>
          <Link to="/support" className={`${s.btn} ${s.btnGhost}`}>{t('تواصل مع الدعم')}</Link>
        </div>
      </Notice>;
    } else if (!Screen) {
      body = <Notice title={t('الصفحة غير موجودة')}><Link to="/rooms" className={`${s.btn} ${s.btnGhost}`}>{t('العودة إلى الغرف')}</Link></Notice>;
    } else {
      body = <Screen params={match.params} profile={p} />;
    }
  }

  return (
    <div className={s.immersive}>
      <Suspense fallback={<Spinner />}>{body}</Suspense>
      <ToastView />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useT } from '../i18n';
import { useTr, trNow } from '../l10n';
import { afterLoginPath } from '../store';
import { refreshAuth } from '../hooks/useAuth';
import { verifyEmail } from '../backend';
import { googleErrorText, authErrorText } from '../authErrors';
import { AuthStage, AuthBrand, Spinner } from './auth/AuthShell';
import { Icon } from '../components/ornaments/Ornaments';
import styles from './AuthPage.module.css';
import { rich } from './legal/LegalDoc';
import { isNative } from '../native/platform';

// Only same-site relative paths are accepted as ?next= (no open redirects)
function safeNext(next) {
  if (!next || typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next.startsWith('/auth/callback') || next.startsWith('/login') || next.startsWith('/signup')) return null;
  return next;
}

export default function AuthCallbackPage() {
  const t = useT();
  const tr = useTr();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0); // 0=waiting 1=success 2=error 3=verified
  const [errMsg, setErrMsg] = useState('');
  const done = useRef(false);
  const mounted = useRef(false);

  // Timers below only navigate while the page is still mounted
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (done.current) return;   // run once (tokens are single-use)
    done.current = true;
    const later = (fn, ms) => setTimeout(() => { if (mounted.current) fn(); }, ms);
    const status = searchParams.get('status');
    const type   = searchParams.get('type');
    const token  = searchParams.get('token');
    const reason = searchParams.get('reason');
    const next   = safeNext(searchParams.get('next'));
    // Google sign-in started in the native app failed: this page is open in the system
    // browser sheet — hand the error back to the app (it shows the message itself).
    if (status === 'error' && searchParams.get('client') === 'app' && !isNative()) {
      try { window.location.href = `nuralquran://auth?status=error&reason=${encodeURIComponent(reason || '')}`; } catch {}
    }
    // Don't leave tokens in the address bar / history
    window.history.replaceState(null, '', window.location.pathname);

    if (type === 'verify' && token) {
      verifyEmail(token)
        .then(() => refreshAuth())
        .then(user => {
          setStep(3);
          later(() => navigate(user ? afterLoginPath() : '/login', { replace: true }), 1800);
        })
        .catch(err => {
          setErrMsg(err && (err.code === 'validation' || err.code === 'not_found')
            ? trNow('رابط التأكيد غير صالح أو انتهت صلاحيته — اطلب رابطاً جديداً من الإعدادات')
            : authErrorText(err));
          setStep(2);
          later(() => navigate('/login', { replace: true }), 4000);
        });
    } else if (status === 'ok') {
      refreshAuth().then(user => {
        if (user) {
          setStep(1);
          later(() => navigate(next || afterLoginPath(), { replace: true }), 400);
        } else {
          setErrMsg(trNow('تعذّر إكمال تسجيل الدخول — تأكد من تفعيل ملفات تعريف الارتباط (Cookies) وحاول مجدداً'));
          setStep(2);
          later(() => navigate('/login', { replace: true }), 3000);
        }
      });
    } else if (status === 'error') {
      setErrMsg(googleErrorText(reason));
      setStep(2);
      later(() => navigate('/login', { replace: true }), 3500);
    } else {
      setErrMsg(trNow('رابط غير صالح'));
      setStep(2);
      later(() => navigate('/login', { replace: true }), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const STEPS = [
    { icon: null,    tone: '',       title: tr('لحظات من فضلك'),            msg: t('processing') || tr('جارٍ التحقق…') },
    { icon: 'check', tone: 'ok',     title: tr('أهلاً بك'),                  msg: tr('تم تسجيل الدخول بنجاح، جارٍ تحويلك…') },
    { icon: 'x',     tone: 'danger', title: tr('تعذّر إكمال العملية'),       msg: tr('{error}. جارٍ تحويلك إلى صفحة الدخول…', { error: errMsg || tr('حدث خطأ') }) },
    { icon: 'check', tone: 'ok',     title: tr('تم تأكيد بريدك'),            msg: tr('تم تأكيد بريدك الإلكتروني بنجاح، جارٍ تحويلك…') },
  ];
  const current = STEPS[step];

  return (
    <main id="main">
      <AuthStage full label={tr('إكمال تسجيل الدخول')}>
        <div className={styles.head} aria-live="polite">
          <AuthBrand small />
          <span className={`${styles.stateIcon} ${step === 0 ? styles.ring : ''}`} data-tone={current.tone} style={{ marginTop: 14 }}>
            {current.icon ? <Icon name={current.icon} /> : <Spinner />}
          </span>
          <h1 className={styles.title}>{current.title}</h1>
          <p className={styles.sub}>{current.msg}</p>
        </div>
        {step === 0 && <div className={styles.progress} aria-hidden="true"><span /></div>}
        {step === 0 && <SlowWarning />}
        {step === 2 && (
          <Link to="/login" replace className={`nq-btn ghost ${styles.submit}`}>{tr('العودة إلى تسجيل الدخول')}</Link>
        )}
      </AuthStage>
    </main>
  );
}

function SlowWarning() {
  const tr = useTr();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <p className={styles.slow}>
      {tr('يستغرق الأمر وقتاً أطول من المعتاد.')}
      <br />{rich(tr('إن لم يكتمل، {link}.'), { link: <a href="/login" className={styles.link} style={{ padding: 0 }}>{tr('عُد إلى تسجيل الدخول')}</a> })}
    </p>
  );
}

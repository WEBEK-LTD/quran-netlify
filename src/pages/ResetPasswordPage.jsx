import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../backend';
import { authErrorText } from '../authErrors';
import { Icon } from '../components/ornaments/Ornaments';
import { AuthStage, AuthHead, PasswordField, Alert, Spinner } from './auth/AuthShell';
import styles from './AuthPage.module.css';
import { useT } from '../i18n';

export default function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);
  // The token comes from the email link (?token=…); drop it from the address bar
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const timer = useRef(null);
  useEffect(() => {
    if (token) window.history.replaceState(null, '', window.location.pathname);
    return () => clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) { setError('كلمة المرور يجب ألا تقل عن 8 أحرف'); return; }
    if (password !== password2) { setError('كلمتا المرور غير متطابقتين'); return; }
    if (!token) { setError('رابط الاستعادة غير صالح'); return; }
    setLoading(true); setError('');
    try {
      await resetPassword(token, password);
      setDone(true);
      timer.current = setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err && (err.code === 'validation' && err.fields && err.fields.token || err.code === 'not_found' || err.code === 'invalid_token')
        ? 'رابط الاستعادة غير صالح أو انتهت صلاحيته — اطلب رابطاً جديداً'
        : authErrorText(err));
    }
    setLoading(false);
  }

  if (!token) return (
    <AuthStage label="تعيين كلمة مرور جديدة">
      <AuthHead icon={{ name: 'lock', tone: 'danger' }} title="رابط غير صالح"
        sub="افتح الرابط المرسل إلى بريدك كما هو، أو اطلب رابطاً جديداً من صفحة تسجيل الدخول عبر «نسيت كلمة المرور؟»." />
      <Link to="/login" className={`nq-btn gold ${styles.submit}`}><Icon name="user" />تسجيل الدخول</Link>
    </AuthStage>
  );

  if (done) return (
    <AuthStage label="تعيين كلمة مرور جديدة">
      <AuthHead icon={{ name: 'check', tone: 'ok' }} title={t('success')}
        sub="تم تغيير كلمة المرور. سجّل الدخول بها الآن، وجارٍ تحويلك إلى صفحة الدخول…" />
      <div className={styles.progress} aria-hidden="true"><span /></div>
    </AuthStage>
  );

  return (
    <AuthStage label="تعيين كلمة مرور جديدة">
      <AuthHead title="تعيين كلمة مرور جديدة" sub="اختر كلمة مرور جديدة لحسابك، لا تقل عن ٨ أحرف." />
      <form onSubmit={handleSubmit} className={styles.form}>
        <PasswordField label={t('newPassword')} value={password} required minLength={8} autoComplete="new-password"
          hint="٨ أحرف على الأقل" onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        <PasswordField label={t('confirmPassword')} value={password2} required autoComplete="new-password"
          onChange={e => setPassword2(e.target.value)} placeholder="••••••••" />
        <Alert>{error}</Alert>
        <button type="submit" className={`nq-btn gold ${styles.submit}`} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="lock" />}
          {loading ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
        </button>
      </form>
      <div className={styles.foot}>
        <Link to="/login" className={styles.quiet}>العودة إلى تسجيل الدخول</Link>
      </div>
    </AuthStage>
  );
}

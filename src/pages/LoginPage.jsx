import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { signInWithEmail, signInWithGoogle, forgotPassword } from '../backend';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { afterLoginPath } from '../store';
import { authErrorText, googleErrorText } from '../authErrors';
import { Icon } from '../components/ornaments/Ornaments';
import { AuthStage, AuthHead, TextField, PasswordField, Alert, GoogleButton, OrLine, Spinner, clean } from './auth/AuthShell';
import styles from './AuthPage.module.css';
import { useT } from '../i18n';
import { useTr } from '../l10n';
import { rich } from './legal/LegalDoc';

export default function LoginPage() {
  const t = useT();
  const tr = useTr();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const settings = usePublicSettings();
  const [error, setError]       = useState(() => {
    const e = searchParams.get('error');
    if (!e) return '';
    return e === 'auth_failed' ? tr('تعذّر إكمال تسجيل الدخول، حاول مرة أخرى') : googleErrorText(e);
  });
  const [loading, setLoading]   = useState(false);
  // ?view=forgot opens the reset form directly (link in the "password changed" email)
  const [view, setView]         = useState(() => searchParams.get('view') === 'forgot' ? 'forgot' : 'login'); // 'login' | 'forgot' | 'forgot_sent'

  async function handleEmail(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signInWithEmail(email, password);
      navigate(afterLoginPath());
    } catch (err) {
      setError(authErrorText(err));
      setLoading(false);
    }
  }

  function handleGoogle() {
    setLoading(true); setError('');
    const sheet = signInWithGoogle(afterLoginPath());   // native app: system browser sheet
    if (sheet) sheet.then(() => setLoading(false));
  }

  async function handleForgot(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await forgotPassword(email);
      setView('forgot_sent');
    } catch (err) {
      setError(authErrorText(err));
    }
    setLoading(false);
  }

  const backToLogin = () => { setView('login'); setError(''); };

  // ─── Forgot sent confirmation ──────────────────────────────────────────────
  if (view === 'forgot_sent') return (
    <AuthStage label={tr('استعادة كلمة المرور')}>
      <AuthHead icon={{ name: 'check', tone: 'ok' }} title={clean(t('resetSent')) || tr('تم إرسال رابط الاستعادة')} />
      <p className={styles.sub} style={{ justifySelf: 'center', textAlign: 'center' }}>
        {rich(tr('إن كان هناك حساب مسجّل بالبريد {email} فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة. تحقّق من صندوق الوارد ومن مجلد الرسائل غير المرغوب فيها.'),
          { email: <strong className={styles.ltr}>{email}</strong> })}
      </p>
      <button type="button" className={`nq-btn gold ${styles.submit}`} onClick={backToLogin}>
        {tr('العودة إلى تسجيل الدخول')}
      </button>
    </AuthStage>
  );

  // ─── Forgot password form ──────────────────────────────────────────────────
  if (view === 'forgot') return (
    <AuthStage label={tr('استعادة كلمة المرور')}>
      <AuthHead title={t('resetTitle')} sub={t('resetSubtitle')} />
      <form onSubmit={handleForgot} className={styles.form}>
        <TextField label={t('email')} icon="user" type="email" value={email} required dir="ltr"
          autoComplete="email" inputMode="email"
          onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
        <Alert>{error}</Alert>
        <button type="submit" className={`nq-btn gold ${styles.submit}`} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="bell" />}
          {loading ? tr('جارٍ الإرسال…') : tr('إرسال رابط الاستعادة')}
        </button>
      </form>
      <div className={styles.foot}>
        <button type="button" className={styles.textBtn} onClick={backToLogin}>{tr('العودة إلى تسجيل الدخول')}</button>
      </div>
    </AuthStage>
  );

  // ─── Main login form ───────────────────────────────────────────────────────
  return (
    <AuthStage label={tr('تسجيل الدخول')}>
      <AuthHead title={t('loginTitle')} sub={tr('سجّل دخولك لتُحفظ قراءتك وحفظك وختماتك، وتتزامن على كل أجهزتك.')} />

      {settings.maintenance_mode && (
        <Alert tone="warn">{tr('الموقع في صيانة مؤقتة، والدخول متاح للمشرفين فقط في الوقت الحالي.')}</Alert>
      )}

      {settings.google_login && (<>
        <GoogleButton onClick={handleGoogle} disabled={loading}>{tr('المتابعة بحساب Google')}</GoogleButton>
        <OrLine>{tr('أو بالبريد الإلكتروني')}</OrLine>
      </>)}

      <form onSubmit={handleEmail} className={styles.form}>
        <TextField label={t('email')} icon="user" type="email" value={email} required dir="ltr"
          autoComplete="email" inputMode="email"
          onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
        <PasswordField label={t('password')} value={password} required autoComplete="current-password"
          onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        <div className={styles.row}>
          <button type="button" className={styles.textBtn} onClick={() => { setView('forgot'); setError(''); }}>
            {tr('نسيت كلمة المرور؟')}
          </button>
        </div>
        <Alert>{error}</Alert>
        <button type="submit" className={`nq-btn gold ${styles.submit}`} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="user" />}
          {loading ? tr('جارٍ الدخول…') : tr('دخول')}
        </button>
      </form>

      <div className={styles.foot}>
        <p className={styles.switch}>
          {t('noAccount')}{' '}
          <Link to="/signup" className={styles.link}>{tr('أنشئ حساباً مجانياً')}</Link>
        </p>
        <Link to="/" className={styles.quiet}>{tr('المتابعة بدون حساب')}</Link>
      </div>
    </AuthStage>
  );
}

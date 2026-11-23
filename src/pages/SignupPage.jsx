import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUpWithEmail, googleStartUrl } from '../backend';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { afterLoginPath } from '../store';
import { authErrorText } from '../authErrors';
import { Icon } from '../components/ornaments/Ornaments';
import { AuthStage, AuthHead, TextField, PasswordField, Alert, GoogleButton, OrLine, Spinner } from './auth/AuthShell';
import styles from './AuthPage.module.css';
import { useT } from '../i18n';

export default function SignupPage() {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const settings = usePublicSettings();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('يرجى كتابة الاسم'); return; }
    if (password.length < 8) { setError('كلمة المرور يجب ألا تقل عن 8 أحرف'); return; }
    setLoading(true); setError('');
    try {
      await signUpWithEmail(email, password, name);
      setDone(true);
    } catch (err) {
      setError(authErrorText(err));
    }
    setLoading(false);
  }

  function handleGoogle() {
    setLoading(true);
    window.location.href = googleStartUrl(afterLoginPath());
  }

  if (settings.loaded && settings.allow_signup === false) return (
    <AuthStage label="إنشاء حساب">
      <AuthHead icon={{ name: 'lock' }} title="التسجيل مغلق حالياً"
        sub="إنشاء الحسابات الجديدة متوقف مؤقتاً. يمكنك استخدام الموقع كاملاً بدون حساب، وتُحفظ بياناتك على هذا الجهاز." />
      <div className={styles.actions}>
        <Link to="/" className={`nq-btn gold ${styles.submit}`}><Icon name="book" />المتابعة بدون حساب</Link>
        <Link to="/login" className={`nq-btn ghost ${styles.submit}`}>لديك حساب؟ سجّل الدخول</Link>
      </div>
    </AuthStage>
  );

  if (done) return (
    <AuthStage label="تم إنشاء الحساب">
      <AuthHead icon={{ name: 'check', tone: 'ok' }} title="تم إنشاء حسابك" sub="بقيت خطوة واحدة: تأكيد بريدك الإلكتروني." />
      <div className={styles.note}>
        <span>أرسلنا رسالة تأكيد إلى <strong className={`${styles.em} ${styles.ltr}`}>{email}</strong>.</span>
        <span>افتح الرابط الذي فيها لتأكيد بريدك. أنت مسجّل الدخول الآن ويمكنك المتابعة.</span>
      </div>
      <button type="button" className={`nq-btn gold ${styles.submit}`} onClick={() => navigate(afterLoginPath())}>
        متابعة <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
      </button>
    </AuthStage>
  );

  return (
    <AuthStage label="إنشاء حساب">
      <AuthHead title={t('signupTitle')} sub="حساب مجاني يحفظ تقدّمك في القراءة والحفظ، ويزامنه على كل أجهزتك." />

      {settings.maintenance_mode && (
        <Alert tone="warn">الموقع في صيانة مؤقتة، وقد لا يتاح إنشاء الحسابات حتى تنتهي.</Alert>
      )}

      {settings.google_login && (<>
        <GoogleButton onClick={handleGoogle} disabled={loading}>التسجيل بحساب Google</GoogleButton>
        <OrLine>أو بالبريد الإلكتروني</OrLine>
      </>)}

      <form onSubmit={handleSubmit} className={styles.form}>
        <TextField label={t('fullName')} icon="user" type="text" value={name} required autoComplete="name"
          onChange={e => setName(e.target.value)} placeholder="اسمك الكريم" />
        <TextField label={t('email')} icon="globe" type="email" value={email} required dir="ltr"
          autoComplete="email" inputMode="email"
          onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
        <PasswordField label={t('password')} value={password} required minLength={8} autoComplete="new-password"
          hint="٨ أحرف على الأقل"
          onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        <Alert>{error}</Alert>
        <button type="submit" className={`nq-btn gold ${styles.submit}`} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="plus" />}
          {loading ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
        </button>
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          بإنشاء الحساب فأنت توافق على <Link to="/terms" className={styles.link} style={{ padding: 0 }}>شروط الاستخدام</Link> و<Link to="/privacy" className={styles.link} style={{ padding: 0 }}>سياسة الخصوصية</Link>.
        </p>
      </form>

      <div className={styles.foot}>
        <p className={styles.switch}>
          {t('haveAccount')} <Link to="/login" className={styles.link}>سجّل الدخول</Link>
        </p>
        <Link to="/" className={styles.quiet}>المتابعة بدون حساب</Link>
      </div>
    </AuthStage>
  );
}

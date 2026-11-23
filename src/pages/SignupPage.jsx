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
import { useTr, num } from '../l10n';
import { rich } from './legal/LegalDoc';

export default function SignupPage() {
  const t = useT();
  const tr = useTr();
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
    if (!name.trim()) { setError(tr('يرجى كتابة الاسم')); return; }
    if (password.length < 8) { setError(tr('كلمة المرور يجب ألا تقل عن 8 أحرف')); return; }
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
    <AuthStage label={tr('إنشاء حساب')}>
      <AuthHead icon={{ name: 'lock' }} title={tr('التسجيل مغلق حالياً')}
        sub={tr('إنشاء الحسابات الجديدة متوقف مؤقتاً. يمكنك استخدام الموقع كاملاً بدون حساب، وتُحفظ بياناتك على هذا الجهاز.')} />
      <div className={styles.actions}>
        <Link to="/" className={`nq-btn gold ${styles.submit}`}><Icon name="book" />{tr('المتابعة بدون حساب')}</Link>
        <Link to="/login" className={`nq-btn ghost ${styles.submit}`}>{tr('لديك حساب؟ سجّل الدخول')}</Link>
      </div>
    </AuthStage>
  );

  if (done) return (
    <AuthStage label={tr('تم إنشاء الحساب')}>
      <AuthHead icon={{ name: 'check', tone: 'ok' }} title={tr('تم إنشاء حسابك')} sub={tr('بقيت خطوة واحدة: تأكيد بريدك الإلكتروني.')} />
      <div className={styles.note}>
        <span>{rich(tr('أرسلنا رسالة تأكيد إلى {email}.'), { email: <strong className={`${styles.em} ${styles.ltr}`}>{email}</strong> })}</span>
        <span>{tr('افتح الرابط الذي فيها لتأكيد بريدك. أنت مسجّل الدخول الآن ويمكنك المتابعة.')}</span>
      </div>
      <button type="button" className={`nq-btn gold ${styles.submit}`} onClick={() => navigate(afterLoginPath())}>
        {tr('متابعة')} <Icon name="back" style={tr.dir === 'rtl' ? { transform: 'scaleX(-1)' } : undefined} />
      </button>
    </AuthStage>
  );

  return (
    <AuthStage label={tr('إنشاء حساب')}>
      <AuthHead title={t('signupTitle')} sub={tr('حساب مجاني يحفظ تقدّمك في القراءة والحفظ، ويزامنه على كل أجهزتك.')} />

      {settings.google_login && (<>
        <GoogleButton onClick={handleGoogle} disabled={loading}>{tr('التسجيل بحساب Google')}</GoogleButton>
        <OrLine>{tr('أو بالبريد الإلكتروني')}</OrLine>
      </>)}

      <form onSubmit={handleSubmit} className={styles.form}>
        <TextField label={t('fullName')} icon="user" type="text" value={name} required autoComplete="name"
          onChange={e => setName(e.target.value)} placeholder={tr('اسمك الكريم')} />
        <TextField label={t('email')} icon="globe" type="email" value={email} required dir="ltr"
          autoComplete="email" inputMode="email"
          onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
        <PasswordField label={t('password')} value={password} required minLength={8} autoComplete="new-password"
          hint={tr('{n} أحرف على الأقل', { n: num(8) })}
          onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        <Alert>{error}</Alert>
        <button type="submit" className={`nq-btn gold ${styles.submit}`} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="plus" />}
          {loading ? tr('جارٍ الإنشاء…') : tr('إنشاء الحساب')}
        </button>
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          {rich(tr('بإنشاء الحساب فأنت توافق على {terms} و{privacy}.'), {
            terms: <Link to="/terms" className={styles.link} style={{ padding: 0 }}>{tr('شروط الاستخدام')}</Link>,
            privacy: <Link to="/privacy" className={styles.link} style={{ padding: 0 }}>{tr('سياسة الخصوصية')}</Link>,
          })}
        </p>
      </form>

      <div className={styles.foot}>
        <p className={styles.switch}>
          {t('haveAccount')} <Link to="/login" className={styles.link}>{tr('سجّل الدخول')}</Link>
        </p>
        <Link to="/" className={styles.quiet}>{tr('المتابعة بدون حساب')}</Link>
      </div>
    </AuthStage>
  );
}

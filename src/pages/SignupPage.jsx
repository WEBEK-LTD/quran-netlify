import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUpWithEmail, googleStartUrl } from '../backend';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { afterLoginPath } from '../store';
import { authErrorText } from '../authErrors';
import styles from './AuthPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function SignupPage() {
  const t = useT();
  const dir = useDir();
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
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>نور القرآن</div>
        <div className={styles.notConfigured}>
          <span>🔒</span>
          <p>التسجيل مغلق حالياً</p>
          <small>إنشاء الحسابات الجديدة متوقف مؤقتاً. يمكنك استخدام التطبيق كاملاً بدون حساب — ستُحفظ بياناتك على هذا الجهاز.</small>
          <Link to="/login" className={styles.link} style={{ display:'block', textAlign:'center', marginTop:12 }}>لديك حساب؟ سجّل الدخول</Link>
          <Link to="/" className={styles.submitBtn} style={{ display:'block', textAlign:'center', marginTop:16 }}>
            متابعة بدون حساب ←
          </Link>
        </div>
      </div>
    </div>
  );

  if (done) return (
    <div className={styles.page}>
      <div className={styles.card} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ color: 'var(--gold)', marginTop: 16 }}>تم إنشاء حسابك</h2>
        <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 15, fontWeight: 700 }}>
          تحقق من بريدك لتأكيد الحساب
        </p>
        <p style={{ color: 'var(--text3)', marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
          أرسلنا رسالة تأكيد إلى <strong dir="ltr" style={{ color: 'var(--text)' }}>{email}</strong>.
          افتح الرابط الذي فيها لتأكيد بريدك. أنت مسجّل الدخول الآن ويمكنك المتابعة.
        </p>
        <button type="button" className={styles.submitBtn}
          style={{ display:'block', width:'100%', marginTop:24 }}
          onClick={() => navigate(afterLoginPath())}>
          متابعة ←
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>نور القرآن</div>
        <h1 className={styles.title}>{t('signupTitle')}</h1>
        <p className={styles.sub}>{t('signupSubtitle')}</p>

        {settings.google_login && (<>
        <button className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          التسجيل بحساب Google
        </button>

        <div className={styles.divider}><span>أو بالبريد الإلكتروني</span></div>
        </>)}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>{t('fullName')}</label>
            <input type="text" value={name} required
              onChange={e => setName(e.target.value)} placeholder="اسمك الكريم" />
          </div>
          <div className={styles.field}>
            <label>{t('email')}</label>
            <input type="email" value={email} required dir="ltr"
              onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
          </div>
          <div className={styles.field}>
            <label>{t('password')}</label>
            <input type="password" value={password} required dir="ltr"
              onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" minLength={8} />
          </div>
          {error && <div className={styles.error}>⚠️ {error}</div>}
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? '...' : 'إنشاء الحساب'}
          </button>
        </form>

        <p className={styles.switch}>
          {t('haveAccount')} <Link to="/login" className={styles.link}>{t('login')}</Link>
        </p>
        <Link to="/" className={styles.skip}>{t('back')}</Link>
      </div>
    </div>
  );
}

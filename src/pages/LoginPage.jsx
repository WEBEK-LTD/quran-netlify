import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { signInWithEmail, googleStartUrl, forgotPassword } from '../backend';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { afterLoginPath } from '../store';
import { authErrorText, googleErrorText } from '../authErrors';
import styles from './AuthPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function LoginPage() {
  const t = useT();
  const dir = useDir();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const settings = usePublicSettings();
  const [error, setError]       = useState(() => {
    const e = searchParams.get('error');
    if (!e) return '';
    return e === 'auth_failed' ? 'تعذّر إكمال تسجيل الدخول، حاول مرة أخرى' : googleErrorText(e);
  });
  const [loading, setLoading]   = useState(false);
  const [view, setView]         = useState('login'); // 'login' | 'forgot' | 'forgot_sent'

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
    window.location.href = googleStartUrl(afterLoginPath());
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

  // ─── Forgot sent confirmation ──────────────────────────────────────────────
  if (view === 'forgot_sent') return (
    <div className={styles.page}>
      <div className={styles.card} style={{ textAlign:'center' }}>
        <div style={{ fontSize:48 }}>📧</div>
        <h2 style={{ color:'var(--gold)', marginTop:16 }}>{t('resetSent')}</h2>
        <p style={{ color:'var(--text3)', fontSize:14, marginTop:8 }}>
          إن كان هناك حساب مسجّل بالبريد <strong style={{ color:'var(--text)' }}>{email}</strong>
          فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة. تحقق من صندوق الوارد والرسائل غير المرغوبة.
        </p>
        <button
          className={styles.submitBtn}
          style={{ marginTop:24, width:'100%' }}
          onClick={() => setView('login')}
        >
          العودة لتسجيل الدخول
        </button>
      </div>
    </div>
  );

  // ─── Forgot password form ──────────────────────────────────────────────────
  if (view === 'forgot') return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>نور القرآن</div>
        <h1 className={styles.title}>{t('resetTitle')}</h1>
        <p className={styles.sub}>{t('resetSubtitle')}</p>
        <form onSubmit={handleForgot} className={styles.form}>
          <div className={styles.field}>
            <label>{t('email')}</label>
            <input type="email" value={email} required dir="ltr"
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com" />
          </div>
          {error && <div className={styles.error}>⚠️ {error}</div>}
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? '...' : 'إرسال رابط الاستعادة'}
          </button>
        </form>
        <button
          className={styles.skip}
          style={{ background:'none', border:'none', cursor:'pointer', marginTop:8 }}
          onClick={() => setView('login')}
        >
          ← العودة لتسجيل الدخول
        </button>
      </div>
    </div>
  );

  // ─── Main login form ───────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>نور القرآن</div>
        <h1 className={styles.title}>{t('loginTitle')}</h1>
        <p className={styles.sub}>{t('loginSubtitle')}</p>

        {settings.maintenance_mode && (
          <div className={styles.error} style={{ marginBottom: 12 }}>🛠️ التطبيق في صيانة مؤقتة — الدخول متاح للمشرفين فقط حالياً</div>
        )}
        <>
            {settings.google_login && (<>
            <button className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              متابعة بحساب Google
            </button>

            <div className={styles.divider}><span>{t('orGoogle')}</span></div>
            </>)}

            <form onSubmit={handleEmail} className={styles.form}>
              <div className={styles.field}>
                <label>{t('email')}</label>
                <input type="email" value={email} required
                  onChange={e => setEmail(e.target.value)}
                  placeholder="example@email.com" dir="ltr" />
              </div>
              <div className={styles.field}>
                <label>{t('password')}</label>
                <input type="password" value={password} required
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" dir="ltr" />
              </div>
              {error && <div className={styles.error}>⚠️ {error}</div>}
              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? '...' : 'دخول'}
              </button>
            </form>

            <p style={{ textAlign:'center', marginTop:8 }}>
              <button
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gold)', fontSize:13 }}
                onClick={() => { setView('forgot'); setError(''); }}
              >
                نسيت كلمة المرور؟
              </button>
            </p>

            <p className={styles.switch}>
              {t('noAccount')}{' '}
              <Link to="/signup" className={styles.link}>{t('signup')}</Link>
            </p>
            <Link to="/" className={styles.skip}>{t('back')}</Link>
        </>
      </div>
    </div>
  );
}

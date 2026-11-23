import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { signInWithEmail, signInWithGoogle, resetPasswordEmail, isConfigured } from '../supabase';
import { afterLoginPath } from '../store';
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
  const [error, setError]       = useState(
    searchParams.get('error') === 'auth_failed' ? t('error') : ''
  );
  const [loading, setLoading]   = useState(false);
  const [view, setView]         = useState('login'); // 'login' | 'forgot' | 'forgot_sent'
  const supabaseReady = isConfigured();

  async function handleEmail(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await signInWithEmail(email, password);
    if (error) { setError(error.message); setLoading(false); }
    else navigate(afterLoginPath());
  }

  async function handleGoogle() {
    setLoading(true); setError('');
    const { error } = await signInWithGoogle();
    if (error) { setError(error.message); setLoading(false); }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await resetPasswordEmail(email);
    setLoading(false);
    if (error) setError(error.message);
    else setView('forgot_sent');
  }

  // ─── Forgot sent confirmation ──────────────────────────────────────────────
  if (view === 'forgot_sent') return (
    <div className={styles.page}>
      <div className={styles.card} style={{ textAlign:'center' }}>
        <div style={{ fontSize:48 }}>📧</div>
        <h2 style={{ color:'var(--gold)', marginTop:16 }}>{t('resetSent')}</h2>
        <p style={{ color:'var(--text3)', fontSize:14, marginTop:8 }}>
          {t('verify_email')} <strong style={{ color:'var(--text)' }}>{email}</strong>
          <br/>{t('sendReset')}
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

        {!supabaseReady ? (
          <div className={styles.notConfigured}>
            <span>🔧</span>
            <p>{t('error')}</p>
            <small>يمكنك استخدام التطبيق كاملاً بدون حساب — ستُحفظ بياناتك محلياً</small>
            <Link to="/" className={styles.submitBtn} style={{ display:'block', textAlign:'center', marginTop:16 }}>
              متابعة بدون حساب ←
            </Link>
          </div>
        ) : (
          <>
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
        )}
      </div>
    </div>
  );
}

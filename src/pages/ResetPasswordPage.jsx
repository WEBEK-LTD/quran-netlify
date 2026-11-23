import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../backend';
import { authErrorText } from '../authErrors';
import styles from './AuthPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function ResetPasswordPage() {
  const t = useT();
  const dir = useDir();
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
    <div className={styles.page}>
      <div className={styles.card} style={{ textAlign:'center' }}>
        <div style={{ fontSize:48 }}>🔗</div>
        <h2 style={{ color:'var(--gold)', marginTop:16 }}>رابط غير صالح</h2>
        <p style={{ color:'var(--text3)', fontSize:14, marginTop:8, lineHeight:1.8 }}>
          افتح الرابط المرسل إلى بريدك كما هو، أو اطلب رابطاً جديداً من صفحة تسجيل الدخول ← «نسيت كلمة المرور؟».
        </p>
        <Link to="/login" className={styles.submitBtn} style={{ display:'block', marginTop:20, textDecoration:'none', textAlign:'center' }}>
          تسجيل الدخول
        </Link>
      </div>
    </div>
  );

  if (done) return (
    <div className={styles.page}>
      <div className={styles.card} style={{ textAlign:'center' }}>
        <div style={{ fontSize:48 }}>✅</div>
        <h2 style={{ color:'var(--gold)', marginTop:16 }}>{t('success')}</h2>
        <p style={{ color:'var(--text3)', fontSize:14, marginTop:8 }}>تم تغيير كلمة المرور — سجّل الدخول بها الآن. جارٍ التوجيه...</p>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>نور القرآن</div>
        <h1 className={styles.title}>{t('resetTitle')}</h1>
        <p className={styles.sub}>{t('resetSubtitle')}</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>{t('newPassword')}</label>
            <input type="password" value={password} required dir="ltr" minLength={8}
              onChange={e => setPassword(e.target.value)} placeholder="..." />
          </div>
          <div className={styles.field}>
            <label>{t('confirmPassword')}</label>
            <input type="password" value={password2} required dir="ltr"
              onChange={e => setPassword2(e.target.value)} placeholder="..." />
          </div>
          {error && <div className={styles.error}>⚠️ {error}</div>}
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? '...' : 'حفظ كلمة المرور'}
          </button>
        </form>
      </div>
    </div>
  );
}

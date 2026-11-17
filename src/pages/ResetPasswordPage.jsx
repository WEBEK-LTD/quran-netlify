import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [sb,        setSb]        = useState(null);

  // Load supabase client
  useEffect(() => {
    import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(({ createClient }) => {
      const url  = import.meta.env.VITE_SUPABASE_URL      || '';
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      if (!url || url.includes('placeholder')) return;
      setSb(createClient(url, anon, {
        auth: { persistSession:true, storageKey:'nq_sb_auth', storage:window.localStorage, autoRefreshToken:true, detectSessionInUrl:true },
      }));
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) { setError(t('required')); return; }
    if (password !== password2) { setError(t('error')); return; }
    if (!sb) { setError(t('error')); return; }
    setLoading(true); setError('');
    const { error } = await sb.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); }
    else { setDone(true); setTimeout(() => navigate('/dashboard'), 2500); }
  }

  if (done) return (
    <div className={styles.page}>
      <div className={styles.card} style={{ textAlign:'center' }}>
        <div style={{ fontSize:48 }}>✅</div>
        <h2 style={{ color:'var(--gold)', marginTop:16 }}>{t('success')}</h2>
        <p style={{ color:'var(--text3)', fontSize:14, marginTop:8 }}>{t('loading')}</p>
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
            <input type="password" value={password} required dir="ltr" minLength={6}
              onChange={e => setPassword(e.target.value)} placeholder="..." />
          </div>
          <div className={styles.field}>
            <label>{t('confirmPassword')}</label>
            <input type="password" value={password2} required dir="ltr"
              onChange={e => setPassword2(e.target.value)} placeholder="..." />
          </div>
          {error && <div className={styles.error}>⚠️ {error}</div>}
          <button type="submit" className={styles.submitBtn} disabled={loading || !sb}>
            {loading ? '...' : 'حفظ كلمة المرور'}
          </button>
        </form>
      </div>
    </div>
  );
}

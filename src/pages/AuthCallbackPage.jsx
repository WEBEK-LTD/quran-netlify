import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
async function waitForAuth(timeoutMs = 12000) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const url  = import.meta.env.VITE_SUPABASE_URL      || '';
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || url.includes('placeholder')) return { type: 'error' };

  const sb = createClient(url, anon, {
    auth: {
      persistSession:     true,
      storageKey:         'nq_sb_auth',
      storage:            window.localStorage,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
    },
  });

  // Check existing session first
  const { data: { session: existing } } = await sb.auth.getSession();
  if (existing?.user) return { type: 'signed_in', session: existing };

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        clearTimeout(timer); subscription.unsubscribe();
        resolve({ type: 'signed_in', session });
      }
      if (event === 'PASSWORD_RECOVERY') {
        clearTimeout(timer); subscription.unsubscribe();
        resolve({ type: 'recovery', session });
      }
      if (event === 'SIGNED_OUT') {
        clearTimeout(timer); subscription.unsubscribe();
        resolve({ type: 'error' });
      }
    });
  });
}

export default function AuthCallbackPage() {
  const t = useT();
  const dir = useDir();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0); // 0=waiting 1=success 2=error 3=recovery
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    waitForAuth(12000).then(result => {
      window.history.replaceState(null, '', window.location.pathname);
      if (result.type === 'recovery') {
        setStep(3);
        setTimeout(() => navigate('/reset-password', { replace: true }), 600);
      } else if (result.type === 'signed_in') {
        setStep(1);
        setTimeout(() => navigate('/dashboard', { replace: true }), 400);
      } else {
        setStep(2);
        setTimeout(() => navigate('/login?error=auth_failed', { replace: true }), 2000);
      }
    }).catch(() => {
      setStep(2);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    });
  }, []);

  const STEPS = [
    { icon: '✦', msg: t('processing'), color: 'var(--gold)' },
    { icon: '✓', msg: t('auth_success'),          color: '#52b788'     },
    { icon: '✕', msg: 'حدث خطأ — جارٍ التوجيه...', color: '#f87171'     },
    { icon: '🔑', msg: 'جارٍ فتح صفحة إعادة التعيين...', color: '#60a5fa' },
  ];

  const current = STEPS[step];

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:20,
      background:'var(--bg)', direction:'rtl',
    }}>
      <div style={{
        width:72, height:72, borderRadius:'50%',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:32, fontWeight:700,
        background: step===0 ? 'rgba(201,168,76,.1)'
          : step===1 ? 'rgba(82,183,136,.1)'
          : step===3 ? 'rgba(96,165,250,.1)'
          : 'rgba(248,113,113,.1)',
        border:`2px solid ${current.color}`,
        color: current.color,
        transition: 'all .4s',
      }}>
        {current.icon}
      </div>

      <p style={{ color:'var(--text2)', fontSize:16, margin:0 }}>
        {current.msg}
      </p>

      {step === 0 && (
        <div style={{ width:160, height:3, borderRadius:2, background:'var(--border)', overflow:'hidden' }}>
          <div style={{
            height:'100%', borderRadius:2, background:'var(--gold)',
            animation:'cbProgress 2.4s ease-in-out infinite',
          }}/>
        </div>
      )}
      {step === 0 && <SlowWarning/>}

      <style>{`
        @keyframes cbProgress {
          0%   { width:0%;   margin-right:0    }
          50%  { width:60%;  margin-right:0    }
          100% { width:0%;   margin-right:100% }
        }
      `}</style>
    </div>
  );
}

function SlowWarning() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <p style={{ fontSize:12, color:'var(--text3)', maxWidth:260, textAlign:'center', lineHeight:1.6 }}>
      بياخد وقت أطول من المعتاد...
      <br/>لو مش بيكمل{' '}
      <a href="/login" style={{ color:'var(--gold)' }}>ارجع لتسجيل الدخول</a>
    </p>
  );
}

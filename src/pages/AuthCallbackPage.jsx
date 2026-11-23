import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
import { afterLoginPath } from '../store';
import { refreshAuth } from '../hooks/useAuth';
import { verifyEmail } from '../backend';
import { googleErrorText, authErrorText } from '../authErrors';

// Only same-site relative paths are accepted as ?next= (no open redirects)
function safeNext(next) {
  if (!next || typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next.startsWith('/auth/callback') || next.startsWith('/login') || next.startsWith('/signup')) return null;
  return next;
}

export default function AuthCallbackPage() {
  const t = useT();
  const dir = useDir();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0); // 0=waiting 1=success 2=error 3=verified
  const [errMsg, setErrMsg] = useState('');
  const done = useRef(false);
  const mounted = useRef(false);

  // Timers below only navigate while the page is still mounted
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (done.current) return;   // run once (tokens are single-use)
    done.current = true;
    const later = (fn, ms) => setTimeout(() => { if (mounted.current) fn(); }, ms);
    const status = searchParams.get('status');
    const type   = searchParams.get('type');
    const token  = searchParams.get('token');
    const reason = searchParams.get('reason');
    const next   = safeNext(searchParams.get('next'));
    // Don't leave tokens in the address bar / history
    window.history.replaceState(null, '', window.location.pathname);

    if (type === 'verify' && token) {
      verifyEmail(token)
        .then(() => refreshAuth())
        .then(user => {
          setStep(3);
          later(() => navigate(user ? afterLoginPath() : '/login', { replace: true }), 1800);
        })
        .catch(err => {
          setErrMsg(err && (err.code === 'validation' || err.code === 'not_found')
            ? 'رابط التأكيد غير صالح أو انتهت صلاحيته — اطلب رابطاً جديداً من الإعدادات'
            : authErrorText(err));
          setStep(2);
          later(() => navigate('/login', { replace: true }), 4000);
        });
    } else if (status === 'ok') {
      refreshAuth().then(user => {
        if (user) {
          setStep(1);
          later(() => navigate(next || afterLoginPath(), { replace: true }), 400);
        } else {
          setErrMsg('تعذّر إكمال تسجيل الدخول — تأكد من تفعيل ملفات تعريف الارتباط (Cookies) وحاول مجدداً');
          setStep(2);
          later(() => navigate('/login', { replace: true }), 3000);
        }
      });
    } else if (status === 'error') {
      setErrMsg(googleErrorText(reason));
      setStep(2);
      later(() => navigate('/login', { replace: true }), 3500);
    } else {
      setErrMsg('رابط غير صالح');
      setStep(2);
      later(() => navigate('/login', { replace: true }), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const STEPS = [
    { icon: '✦', msg: t('processing'), color: 'var(--gold)' },
    { icon: '✓', msg: t('auth_success'),          color: '#52b788'     },
    { icon: '✕', msg: (errMsg || 'حدث خطأ') + ' — جارٍ التوجيه...', color: '#f87171' },
    { icon: '✓', msg: 'تم تأكيد بريدك الإلكتروني بنجاح', color: '#52b788' },
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
          : step===3 ? 'rgba(82,183,136,.1)'
          : 'rgba(248,113,113,.1)',
        border:`2px solid ${current.color}`,
        color: current.color,
        transition: 'all .4s',
      }}>
        {current.icon}
      </div>

      <p style={{ color:'var(--text2)', fontSize:16, margin:0, maxWidth:340, textAlign:'center', lineHeight:1.7, padding:'0 16px' }}>
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

import { useState, useEffect } from 'react';
import { getInitialSession, onAuthChange, isConfigured } from '../supabase';

export function useAuth() {
  const configured = isConfigured();
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(configured); // لو مش configured مش هننتظر

  useEffect(() => {
    if (!configured) return;

    let unsub = () => {};
    let settled = false;

    // اشتركت في auth changes أولاً — عشان مش نفوّت أي event
    onAuthChange((u, event) => {
      setUser(u);
      if (!settled) { settled = true; setLoading(false); }
    }).then(fn => { unsub = fn; });

    // ثم جبنا الـ session الحالي كـ fallback لو مفيش event جه بسرعة
    getInitialSession().then(session => {
      if (!settled) {
        settled = true;
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { user, loading };
}

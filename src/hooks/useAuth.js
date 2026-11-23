import { useState, useEffect } from 'react';
import { api, setToken } from '../apiClient';

// ─── One shared auth state for the whole app ─────────────────────────────────
// Initialised once by GET /auth/me. Every useAuth() subscribes to the same store,
// so signing in/out anywhere updates every component at once.
// User shape (docs/API.md): { id, email, name, avatar_url, gender, birthdate,
//   is_admin, email_verified, show_on_leaderboard, created_at, has_password? }

let authState = { user: null, loading: true };
const subscribers = new Set();
let started = false;
let inflight = null;

function emit() {
  subscribers.forEach(fn => { try { fn(authState); } catch {} });
}

export function setAuthUser(user) {
  authState = { user: user || null, loading: false };
  emit();
}

export function getAuthUser() { return authState.user; }

// Re-reads the session from the API. Never rejects.
export function refreshAuth() {
  if (inflight) return inflight;
  inflight = api.get('/auth/me')
    .then(d => { setAuthUser(d && d.user ? d.user : null); return authState.user; })
    .catch(e => {
      if (e && (e.status === 401 || e.code === 'unauthenticated' || e.code === 'banned')) { setToken(null); setAuthUser(null); }
      else if (authState.loading) setAuthUser(null);   // offline on first load → act as guest
      return authState.user;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export async function signOutAuth() {
  try { await api.post('/auth/logout'); } catch {}
  setToken(null);
  setAuthUser(null);
}

// apiClient fires 'nq-auth-expired' on any 401. Some 401s are a wrong password
// on a form (not an expired session), so confirm with GET /auth/me before
// clearing the user; refreshAuth clears it if the session is really gone.
function onExpired() {
  if (!authState.user) return;
  refreshAuth();
}

export function ensureAuthStarted() {
  if (started) return;
  started = true;
  try { window.addEventListener('nq-auth-expired', onExpired); } catch {}
  refreshAuth();
}

export function useAuth() {
  const [state, setState] = useState(authState);

  useEffect(() => {
    subscribers.add(setState);
    setState(authState);        // in case it changed between render and mount
    ensureAuthStarted();
    return () => { subscribers.delete(setState); };
  }, []);

  return { user: state.user, loading: state.loading, refresh: refreshAuth, signOut: signOutAuth };
}

// Display helpers (the API User has name/avatar_url at the top level)
export function displayNameOf(user, fallback = '') {
  if (!user) return fallback;
  return (user.name && String(user.name).trim()) || (user.email ? user.email.split('@')[0] : '') || fallback;
}
export function avatarOf(user) { return (user && user.avatar_url) || null; }

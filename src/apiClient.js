// The one place that talks to the Noor Al-Quran API (docs/API.md).
// Web: the session is an httpOnly cookie set by the API (credentials: 'include').
// Native app (Capacitor): the session token is kept in localStorage and sent as Bearer.

const PROD_API = 'https://api.nuralquran.net/v1';

function isNativeApp() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch { return false; }
}

export const API_BASE = (() => {
  try {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return localStorage.getItem('nq_api_base') || 'http://localhost:8080/v1';
    }
  } catch {}
  return PROD_API;
})();

export const CLIENT = isNativeApp() ? 'app' : 'web';

const TOKEN_KEY = 'nq_token';
export function getToken() { try { return CLIENT === 'app' ? localStorage.getItem(TOKEN_KEY) : null; } catch { return null; } }
export function setToken(t) {
  if (CLIENT !== 'app') return;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message || 'حدث خطأ غير متوقع');
    this.status = status; this.code = code || 'server'; this.fields = fields || null;
  }
}

// request('GET', '/me/notes') → data, or throws ApiError (message is Arabic and safe to show).
export async function request(method, path, body, { timeout = 20000 } = {}) {
  const headers = { 'Accept': 'application/json', 'X-NQ-Date': localDate() };
  if (method !== 'GET') headers['X-NQ-Client'] = CLIENT;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method, headers, credentials: 'include', signal: ctrl.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, 'network', e && e.name === 'AbortError'
      ? 'انتهت مهلة الاتصال، حاول مرة أخرى'
      : 'تعذّر الاتصال بالخادم، تحقق من الإنترنت');
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok || !json || json.ok === false) {
    const err = json && json.error;
    if (res.status === 401) window.dispatchEvent(new CustomEvent('nq-auth-expired'));
    throw new ApiError(res.status, err && err.code, err && err.message, err && err.fields);
  }
  return json.data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
};

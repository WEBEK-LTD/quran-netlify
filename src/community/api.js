// ─── API client for rooms & community (docs/API.md «Rooms & community») ──────
// Same base/token/headers as src/apiClient.js, plus what this area needs:
//   • the error's extra fields (until, permanent, missing, retry_after, limit…)
//   • ETag / If-None-Match polling (304 → { notModified: true })
//   • multipart bodies (group photo)
import { API_BASE, CLIENT, getToken, localDate } from '../apiClient';

export class CommunityError extends Error {
  constructor(status, code, message, extra) {
    super(message || '');
    this.status = status;
    this.code = code || 'server';
    this.extra = extra || {};
  }
}

export async function call(method, path, body, { etag, timeout = 20000 } = {}) {
  const headers = { Accept: 'application/json', 'X-NQ-Date': localDate() };
  if (method !== 'GET') headers['X-NQ-Client'] = CLIENT;
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (etag) headers['If-None-Match'] = etag;
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method, headers, credentials: 'include', signal: ctrl.signal, cache: 'no-store',
      body: body === undefined ? undefined : (multipart ? body : JSON.stringify(body)),
    });
  } catch (e) {
    throw new CommunityError(0, e && e.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 304) return { notModified: true, etag };
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok || !json || json.ok === false) {
    const err = (json && json.error) || {};
    if (res.status === 401) window.dispatchEvent(new CustomEvent('nq-auth-expired'));
    const extra = { ...err };
    if (!extra.retry_after) {
      const ra = parseInt(res.headers.get('Retry-After') || '', 10);
      if (ra > 0) extra.retry_after = ra;
    }
    throw new CommunityError(res.status, err.code || (res.status === 429 ? 'rate_limited' : 'server'), err.message, extra);
  }
  if (etag !== undefined) return { data: json.data, etag: res.headers.get('ETag') || null };
  return json.data;
}

export const capi = {
  get: (p) => call('GET', p),
  post: (p, b = {}) => call('POST', p, b),
  put: (p, b = {}) => call('PUT', p, b),
  patch: (p, b = {}) => call('PATCH', p, b),
  del: (p, b) => call('DELETE', p, b),
  /** GET with If-None-Match: resolves { data, etag } or { notModified: true } */
  poll: (p, etag) => call('GET', p, undefined, { etag: etag || '' }),
};

export const qs = (o) => {
  const s = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return s ? `?${s}` : '';
};

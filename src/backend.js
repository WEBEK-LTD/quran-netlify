// ─── Backend: the Noor Al-Quran PHP API (docs/API.md) ────────────────────────
// Replaces the old Supabase module. Every call goes through apiClient.
// New-style helpers throw ApiError (its .message is Arabic and safe to show).
// A few helpers keep their old "returns true/false" shape so pages change little.

import { api, request, ApiError, API_BASE, CLIENT, setToken } from './apiClient';
import { setAuthUser, refreshAuth, signOutAuth } from './hooks/useAuth';

export { ApiError, API_BASE };

// The API is always there now (kept for callers that still ask).
export function isConfigured() { return true; }

const enc = encodeURIComponent;

// ─── Friendly Arabic messages for ApiError codes ─────────────────────────────
const CODE_MESSAGES = {
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  email_taken:         'هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور',
  signup_closed:       'التسجيل مغلق حالياً، حاول لاحقاً',
  rate_limited:        'محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً',
  banned:              'تم إيقاف هذا الحساب. تواصل مع الدعم إن كان هذا خطأ',
  network:             'تعذّر الاتصال بالخادم، تحقق من الإنترنت',
  maintenance:         'التطبيق في وضع الصيانة حالياً، عُد بعد قليل',
  unauthenticated:     'يجب تسجيل الدخول أولاً',
  forbidden:           'ليست لديك صلاحية لهذا الإجراء',
  not_found:           'العنصر غير موجود',
  server:              'حدث خطأ في الخادم، حاول لاحقاً',
  ai_not_configured:   'المساعد الذكي غير مُفعّل حالياً من الإدارة',
  feature_disabled:    'هذه الميزة متوقفة حالياً',
  ticket_closed:       'هذه التذكرة مغلقة — افتح استفساراً جديداً',
};

// Returns an Arabic message for any error (ApiError or not).
export function errorMessage(err, fallback = 'حدث خطأ غير متوقع، حاول مرة أخرى') {
  if (!err) return fallback;
  if (err instanceof ApiError) {
    if (err.code === 'validation' && err.fields) {
      const first = Object.values(err.fields).find(Boolean);
      if (first) return String(first);
    }
    // Prefer our own wording for codes the UI explains specifically
    if (err.code === 'network' && err.message) return err.message;
    if (err.code === 'rate_limited' || err.code === 'invalid_credentials') return CODE_MESSAGES[err.code];
    if (err.message && /[\u0600-\u06FF]/.test(err.message)) return err.message;   // server messages are Arabic
    return CODE_MESSAGES[err.code] || fallback;
  }
  return fallback;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function takeSession(data) {
  if (data && data.token) setToken(data.token);   // native app only (no-op on web)
  if (data && data.user) setAuthUser(data.user);
  return data && data.user;
}

export async function signInWithEmail(email, password) {
  const data = await api.post('/auth/login', { email: String(email).trim(), password });
  return takeSession(data);
}

export async function signUpWithEmail(email, password, name) {
  const data = await api.post('/auth/signup', { name: String(name).trim(), email: String(email).trim(), password });
  return takeSession(data);
}

// Full-page navigation to the API's Google flow.
export function googleStartUrl(next = '/dashboard') {
  return `${API_BASE}/auth/google/start?next=${enc(next)}&client=${CLIENT}`;
}
export function signInWithGoogle(next = '/dashboard') {
  window.location.href = googleStartUrl(next);
}

export async function signOut() { return signOutAuth(); }

export async function getMe() {
  const d = await api.get('/auth/me');
  return d && d.user ? d.user : null;
}
export { refreshAuth };

export async function verifyEmail(token) {
  const d = await api.post('/auth/verify-email', { token });
  if (d && d.user) setAuthUser(d.user);
  return d && d.user;
}
export async function resendVerification() { return api.post('/auth/resend-verification'); }
export async function forgotPassword(email) { return api.post('/auth/forgot-password', { email: String(email).trim() }); }
// kept name
export const resetPasswordEmail = forgotPassword;
export async function resetPassword(token, password) { return api.post('/auth/reset-password', { token, password }); }

export async function changePassword(currentPassword, newPassword) {
  const body = { new_password: newPassword };
  if (currentPassword) body.current_password = currentPassword;
  return api.post('/auth/change-password', body);
}

export async function updateProfile(fields) {
  const d = await api.patch('/auth/profile', fields);
  if (d && d.user) setAuthUser(d.user);
  return d && d.user;
}
export async function updateUserName(name) { return updateProfile({ name: String(name).trim() }); }

export async function deleteAccount({ password, confirm } = {}) {
  const body = password ? { password } : { confirm: confirm || 'DELETE' };
  await api.del('/auth/account', body);
  setToken(null);
  setAuthUser(null);
  return true;
}

export async function exportMyData() { return api.get('/auth/export'); }

// ─── BOOKMARKS ────────────────────────────────────────────────────────────────
const cleanBookmarks = list => (Array.isArray(list) ? list : [])
  .filter(b => b && b.surah && b.ayah)
  .map(b => ({ surah: Number(b.surah), ayah: Number(b.ayah) }));

export async function loadBookmarks() { return cleanBookmarks(await api.get('/me/bookmarks')); }
export async function addBookmark(surah, ayah) { return cleanBookmarks(await api.post('/me/bookmarks', { surah, ayah })); }
export async function removeBookmark(surah, ayah) { return cleanBookmarks(await api.del(`/me/bookmarks/${surah}/${ayah}`)); }
// Replace all — returns true/false (old shape)
export async function syncBookmarks(_userId, bookmarks) {
  try { await api.put('/me/bookmarks', { items: cleanBookmarks(bookmarks).slice(0, 2000) }); return true; }
  catch { return false; }
}

// ─── PROGRESS + READING LOG ───────────────────────────────────────────────────
export async function saveProgress(_userId, surah, ayah) {
  try { await api.put('/me/progress', { surah, ayah }); return true; } catch { return false; }
}
export async function loadProgress() { return (await api.get('/me/progress')) || null; }

// Fire-and-forget: one distinct ayah read today. Never rejects.
export function logReading(surah, ayah) {
  return api.post('/me/reading', { surah, ayah }).catch(() => null);
}

// ─── STATS ────────────────────────────────────────────────────────────────────
export async function getStats(days = 365) { return api.get(`/me/stats?days=${days}`); }
// Old shape: [{date, ayah_count}]
export async function loadStats(_userId, days = 365) {
  const s = await getStats(days);
  return (s && Array.isArray(s.days) ? s.days : []).map(d => ({ date: d.date, ayah_count: d.ayahs || 0 }));
}

// ─── NOTES ────────────────────────────────────────────────────────────────────
export async function loadNotes() {
  const list = await api.get('/me/notes');
  return Array.isArray(list) ? list : [];
}
export async function saveNote(_userId, surah, ayah, text) {
  try { await api.put(`/me/notes/${surah}/${ayah}`, { text }); return true; } catch { return false; }
}
export async function deleteNote(_userId, surah, ayah) {
  try { await api.del(`/me/notes/${surah}/${ayah}`); return true; } catch { return false; }
}

// ─── HIFZ ─────────────────────────────────────────────────────────────────────
export async function loadHifzFromCloud() { return (await api.get('/me/hifz')) || null; }
export async function syncHifzToCloud(_userId, data, updatedAt) {
  return api.put('/me/hifz', { data, updated_at: updatedAt || data?.updatedAt || new Date().toISOString() });
}

// ─── PERSONAL KHATMAT ─────────────────────────────────────────────────────────
export async function listKhatmat() { const l = await api.get('/me/khatmat'); return Array.isArray(l) ? l : []; }
export async function createKhatma(k) { return api.post('/me/khatmat', k); }
export async function updateKhatma(id, k) { return api.patch(`/me/khatmat/${enc(id)}`, k); }
export async function deleteKhatma(id) { return api.del(`/me/khatmat/${enc(id)}`); }

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
export const DEFAULT_PUBLIC_SETTINGS = {
  app_name: 'نور القرآن', description: '', announcement: '', maintenance_mode: false, allow_signup: true,
  features: { hifz: true, khatma: true, khatma_group: true, leaderboard: true, ijaza: true, ai_assistant: true, notes: true, search: true },
  google_login: false,
};
let _settingsPromise = null;
let _settingsCache = null;
// Fetched once per page load (cached in memory). Never rejects.
export function getPublicSettings() {
  if (_settingsPromise) return _settingsPromise;
  _settingsPromise = api.get('/settings/public')
    .then(s => {
      _settingsCache = {
        ...DEFAULT_PUBLIC_SETTINGS, ...(s || {}),
        features: { ...DEFAULT_PUBLIC_SETTINGS.features, ...((s && s.features) || {}) },
        loaded: true,
      };
      return _settingsCache;
    })
    .catch(() => { _settingsPromise = null; return { ...DEFAULT_PUBLIC_SETTINGS, loaded: false }; });
  return _settingsPromise;
}
export function getCachedPublicSettings() { return _settingsCache; }

export async function getBroadcasts() { const l = await api.get('/broadcasts'); return Array.isArray(l) ? l : []; }

export async function getLeaderboard(type = 'reading', period = 'all') {
  const l = await api.get(`/leaderboard?type=${enc(type)}&period=${enc(period)}`);
  return Array.isArray(l) ? l : [];
}

const VISITOR_KEY = 'nq_visitor_id';
export function getVisitorId() {
  let id = null;
  try { id = localStorage.getItem(VISITOR_KEY); } catch {}
  if (!id) {
    const buf = new Uint8Array(16);
    try { window.crypto.getRandomValues(buf); } catch { for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256); }
    id = 'v_' + Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(VISITOR_KEY, id); } catch {}
  }
  return id;
}
// Never rejects.
export function pingPresence(path) {
  return api.post('/presence', { visitor_id: getVisitorId(), path: String(path || '/').slice(0, 200) }).catch(() => null);
}

// ─── GROUP KHATMA ─────────────────────────────────────────────────────────────
export async function createGroupKhatma({ deceased_name, mode, is_public, parts }) {
  return api.post('/groups', {
    deceased_name, mode, is_public: !!is_public,
    parts: (parts || []).map(p => ({ part_index: p.part_index, label: p.label || '', assignee: p.assignee || '' })),
  });
}
export async function getMyGroupKhatmat() { const l = await api.get('/groups/mine'); return Array.isArray(l) ? l : []; }
export async function getPublicGroupKhatmat(page = 1) {
  const d = await api.get(`/groups/public?page=${page}`);
  if (Array.isArray(d)) return { items: d, page: 1, per_page: d.length, total: d.length };
  return { items: (d && d.items) || [], page: d?.page || page, per_page: d?.per_page || 50, total: d?.total || 0 };
}
export async function getGroupKhatmaByCode(code) { return api.get(`/groups/${enc(String(code).trim().toUpperCase())}`); }
export async function updateKhatmaVisibility(code, isPublic) { return api.patch(`/groups/${enc(code)}`, { is_public: !!isPublic }); }
export async function startNewRound(code) { return api.post(`/groups/${enc(code)}/new-round`); }
export async function deleteGroupKhatma(code) { return api.del(`/groups/${enc(code)}`); }
export async function leaveGroupKhatma(code) { return api.del(`/groups/${enc(code)}/membership`); }
export async function claimPart(code, partIndex, name) { return api.post(`/groups/${enc(code)}/parts/${partIndex}/claim`, { name }); }
export async function releasePart(code, partIndex) { return api.del(`/groups/${enc(code)}/parts/${partIndex}/claim`); }
export async function setPartDone(code, partIndex, done) { return api.post(`/groups/${enc(code)}/parts/${partIndex}/done`, { done: !!done }); }

// ─── SUPPORT ──────────────────────────────────────────────────────────────────
export async function listMyTickets() { const l = await api.get('/support/tickets'); return Array.isArray(l) ? l : []; }
export async function createSupportTicket({ subject, topic, body }) {
  return api.post('/support/tickets', { subject, topic: topic || subject, body: body || subject });
}
export async function listTicketMessages(ticketId, afterId) {
  const q = afterId ? `?after_id=${enc(afterId)}` : '';
  const l = await api.get(`/support/tickets/${enc(ticketId)}/messages${q}`);
  return Array.isArray(l) ? l : [];
}
export async function sendTicketMessage(ticketId, body) {
  return api.post(`/support/tickets/${enc(ticketId)}/messages`, { body });
}

// Polls messages after the last seen id. Returns a stop() function.
export function pollTicketMessages(ticketId, lastIdRef, onNew, { admin = false, intervalMs = 5000, onError } = {}) {
  let stopped = false;
  const base = admin ? '/admin/tickets' : '/support/tickets';
  async function tick() {
    if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const after = lastIdRef.current;
      const q = after ? `?after_id=${enc(after)}` : '';
      const list = await api.get(`${base}/${enc(ticketId)}/messages${q}`);
      if (!stopped && Array.isArray(list) && list.length) onNew(list);
    } catch (e) { if (!stopped && onError) onError(e); }
  }
  const t = setInterval(tick, intervalMs);
  return () => { stopped = true; clearInterval(t); };
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export async function aiChat(messages, context) {
  const msgs = (messages || [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-12)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  const body = { messages: msgs };
  if (context) body.context = context;
  // AI replies can take longer than the default 20 s timeout.
  const d = await request('POST', '/ai/chat', body, { timeout: 60000 });
  return (d && d.reply) || '';
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── ADMIN compat layer ──────────────────────────────────────────────────────
// Same names the old AdminPage imported, implemented against /admin/*, so it
// keeps compiling until it moves to src/adminApi.js. None of these reject.
// ═════════════════════════════════════════════════════════════════════════════
const wrap = p => p.then(data => ({ data, error: null })).catch(error => ({ data: null, error }));

export async function checkIsAdmin() {
  try { const u = await getMe(); return !!(u && u.is_admin); } catch { return false; }
}
export async function getAppSettings() { try { return (await api.get('/admin/settings')) || {}; } catch { return {}; } }
export async function updateAppSetting(key, value) { return wrap(api.put('/admin/settings', { [key]: value })); }
export async function adminGetUsers(limit = 50, offset = 0) {
  const per = Math.min(100, Math.max(1, limit));
  const page = Math.floor(offset / per) + 1;
  const r = await wrap(api.get(`/admin/users?page=${page}&per_page=${per}`));
  return { data: (r.data && r.data.items) || [], error: r.error };
}
export async function adminToggleAdmin(userId, makeAdmin) { return wrap(api.patch(`/admin/users/${enc(userId)}`, { is_admin: !!makeAdmin })); }
export async function adminBanUser(userId, banned, reason = '') {
  return wrap(banned
    ? api.post(`/admin/users/${enc(userId)}/ban`, { scope: 'app', reason })
    : api.del(`/admin/users/${enc(userId)}/ban`));
}
export async function adminGetStats() {
  try { return (await api.get('/admin/stats')) || {}; }
  catch (e) { return { users: [], tickets: [], scores: [], fetchError: errorMessage(e) }; }
}
export async function adminSendBroadcast(title, body, type = 'info') { return wrap(api.post('/admin/broadcasts', { title, body, type })); }
export async function adminSendDirectMessage(userId, _email, subject, body) { return wrap(api.post(`/admin/users/${enc(userId)}/message`, { subject, body })); }
export async function adminGetAllTickets() {
  try { const d = await api.get('/admin/tickets'); return (d && d.items) || (Array.isArray(d) ? d : []); } catch { return []; }
}
export async function getMyTickets() { try { return await listMyTickets(); } catch { return []; } }
export async function createTicket(_userId, _email, subject, body, topic) {
  return wrap(createSupportTicket({ subject, topic, body }));
}
export async function getTicketMessages(ticketId, { admin = false } = {}) {
  try {
    const l = await api.get(`${admin ? '/admin/tickets' : '/support/tickets'}/${enc(ticketId)}/messages`);
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}
export async function sendMessage(ticketId, _senderId, body, isAdmin = false) {
  return wrap(api.post(`${isAdmin ? '/admin/tickets' : '/support/tickets'}/${enc(ticketId)}/messages`, { body }));
}
export async function updateTicketStatus(ticketId, status) { return wrap(api.patch(`/admin/tickets/${enc(ticketId)}`, { status })); }
// Realtime replaced by 5 s polling. Returns a stop() function.
export function subscribeToMessages(ticketId, callback, { admin = true } = {}) {
  const last = { current: null };
  getTicketMessages(ticketId, { admin }).then(l => { if (l.length) last.current = l[l.length - 1].id; });
  return pollTicketMessages(ticketId, last, list => {
    last.current = list[list.length - 1].id;
    list.forEach(m => callback(m));
  }, { admin });
}
export async function adminUnreadCount() { try { const d = await api.get('/admin/unread'); return (d && d.count) || 0; } catch { return 0; } }
// Presence channels replaced by POST /presence + /admin/stats online_now.
export async function joinPresence() {
  pingPresence(window.location.pathname);
  return { _timers: [], unsubscribe() { this._timers.forEach(clearInterval); this._timers = []; } };
}
export async function getOnlineCount() {
  try { const s = await api.get('/admin/stats'); return (s && s.online_now && s.online_now.total) || 0; } catch { return 0; }
}
export function subscribePresence(channel, callback) {
  const tick = () => api.get('/admin/stats')
    .then(s => { const o = (s && s.online_now) || {}; callback(o.total || 0, o.signed_in || 0); })
    .catch(() => {});
  tick();
  const t = setInterval(tick, 30000);
  if (channel && channel._timers) channel._timers.push(t);
  return () => clearInterval(t);
}

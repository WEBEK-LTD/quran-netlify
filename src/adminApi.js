// Admin calls for the Noor Al-Quran API (docs/API.md → "Admin").
// Every function returns the response `data` or throws ApiError (Arabic message, safe to show).
import { api } from './apiClient';

const id = (v) => encodeURIComponent(String(v));

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Overview / analytics ──────────────────────────────────────────────────────
export const getStats = () => api.get('/admin/stats');

// ── Users ─────────────────────────────────────────────────────────────────────
// filter: 'all' | 'admins' | 'banned' | 'active'
export const listUsers = ({ q, filter = 'all', page = 1, perPage = 25 } = {}) =>
  api.get('/admin/users' + qs({ q, filter, page, per_page: perPage }));

export const updateUser = (userId, patch) => api.patch(`/admin/users/${id(userId)}`, patch);
export const setUserAdmin = (userId, isAdmin) => updateUser(userId, { is_admin: !!isAdmin });

// until: ISO timestamp or undefined (permanent)
export const banUser = (userId, { reason, until } = {}) =>
  api.post(`/admin/users/${id(userId)}/ban`, { scope: 'app', reason: reason || '', ...(until ? { until } : {}) });
export const unbanUser = (userId) => api.del(`/admin/users/${id(userId)}/ban`);

export const messageUser = (userId, { subject, body }) =>
  api.post(`/admin/users/${id(userId)}/message`, { subject, body });

// ── Broadcasts ────────────────────────────────────────────────────────────────
export const listBroadcasts = () => api.get('/admin/broadcasts');
export const createBroadcast = ({ title, body, type = 'info', expires_at }) =>
  api.post('/admin/broadcasts', { title, body, type, ...(expires_at ? { expires_at } : {}) });
export const deleteBroadcast = (broadcastId) => api.del(`/admin/broadcasts/${id(broadcastId)}`);

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings = () => api.get('/admin/settings');
export const updateSettings = (patch) => api.put('/admin/settings', patch);

// ── Integrations ──────────────────────────────────────────────────────────────
export const getIntegrations = () => api.get('/admin/integrations');
// values: { key: value } — empty string clears a key
export const updateIntegrations = (values) => api.put('/admin/integrations', values);
// target: 'ai' | 'mail' | 'google' → { ok, message }
export const testIntegration = (target) => api.post('/admin/integrations/test', { target });

// ── Support ───────────────────────────────────────────────────────────────────
// status: '' | 'open' | 'pending' | 'closed'
export const listTickets = ({ status, page = 1, perPage = 30 } = {}) =>
  api.get('/admin/tickets' + qs({ status, page, per_page: perPage }));
export const getTicketMessages = (ticketId, afterId) =>
  api.get(`/admin/tickets/${id(ticketId)}/messages` + qs({ after_id: afterId }));
export const replyToTicket = (ticketId, body) =>
  api.post(`/admin/tickets/${id(ticketId)}/messages`, { body });
export const setTicketStatus = (ticketId, status) =>
  api.patch(`/admin/tickets/${id(ticketId)}`, { status });
export const getUnreadCount = () => api.get('/admin/unread');

// ── Audit log ─────────────────────────────────────────────────────────────────
export const getLog = ({ page = 1, perPage = 50 } = {}) =>
  api.get('/admin/log' + qs({ page, per_page: perPage }));

// ── Rooms & community moderation (docs/API.md «Rooms & community» → Admin) ──
// status: 'open' | 'dismissed' | 'actioned' | 'all'; source: '' | 'user' | 'dictionary'; type: '' | target type
export const listCommunityReports = ({ status = 'open', source, type, page = 1, perPage = 20 } = {}) =>
  api.get('/admin/community/reports' + qs({ status, source, type, page, per_page: perPage }));
export const getCommunityReport = (reportId) => api.get(`/admin/community/reports/${id(reportId)}`);
// action: dismiss | delete_content | remove_photo | suspend | ban_rooms | ban_app | release
// durationDays: number, or null for permanent
export const decideCommunityReport = (reportId, { action, durationDays, note, alsoDelete } = {}) =>
  api.post(`/admin/community/reports/${id(reportId)}/decision`, {
    action,
    ...(durationDays !== undefined ? { duration_days: durationDays } : {}),
    ...(note ? { note } : {}),
    ...(alsoDelete ? { also_delete: true } : {}),
  });

// source: '' | 'dictionary' | 'admin'
export const listCommunitySuspensions = ({ source, page = 1, perPage = 20 } = {}) =>
  api.get('/admin/community/suspensions' + qs({ source, page, per_page: perPage }));
export const reactivateCommunityUser = (userId) => api.post(`/admin/community/suspensions/${id(userId)}/reactivate`);
export const lockCommunityUser = (userId) => api.post(`/admin/community/suspensions/${id(userId)}/lock`);
// scope: 'community' | 'rooms' | 'app'; durationDays: number or null (permanent)
export const suspendCommunityUser = (userId, { scope, durationDays = null, reason }) =>
  api.post(`/admin/community/users/${id(userId)}/suspend`, { scope, duration_days: durationDays, ...(reason ? { reason } : {}) });
// patch: { gender?: 'male'|'female', birthdate?: 'YYYY-MM-DD' } → User
export const correctCommunityUser = (userId, patch) => api.patch(`/admin/community/users/${id(userId)}`, patch);
export const removeCommunityUserPhoto = (userId) => api.del(`/admin/community/users/${id(userId)}/photo`);
export const removeCommunityGroupPhoto = (groupId) => api.del(`/admin/community/groups/${id(groupId)}/photo`);
export const deleteCommunityGroup = (groupId) => api.del(`/admin/community/groups/${id(groupId)}`);

// status: 'open' | 'scheduled' → { items, limits, open_count }
export const listCommunityRooms = ({ status = 'open' } = {}) => api.get('/admin/community/rooms' + qs({ status }));
export const closeCommunityRoom = (roomId) => api.del(`/admin/community/rooms/${id(roomId)}`);

// level: '' | 'severe' | 'possible'
export const listDictionary = ({ q, level, page = 1, perPage = 100 } = {}) =>
  api.get('/admin/community/dictionary' + qs({ q, level, page, per_page: perPage }));
export const addDictionaryWord = ({ word, level, note }) =>
  api.post('/admin/community/dictionary', { word, level, ...(note ? { note } : {}) });
export const updateDictionaryWord = (wordId, patch) => api.patch(`/admin/community/dictionary/${id(wordId)}`, patch);
export const deleteDictionaryWord = (wordId) => api.del(`/admin/community/dictionary/${id(wordId)}`);
export const testDictionary = (text) => api.post('/admin/community/dictionary/test', { text });

export const getCommunitySettings = () => api.get('/admin/community/settings');
export const saveCommunitySettings = (rooms) => api.put('/admin/community/settings', { rooms });

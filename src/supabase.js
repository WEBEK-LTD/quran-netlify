// ─── Supabase singleton ───────────────────────────────────────────────────────
// Promise واحد يضمن إن createClient بيتعمل مرة واحدة بس
// حتى لو اتنين calls وصلوا قبل ما الأول ينتهي

let _clientPromise = null;

function getClient() {
  if (_clientPromise) return _clientPromise;
  _clientPromise = import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  ).then(({ createClient }) => {
    const url  = import.meta.env.VITE_SUPABASE_URL       || '';
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY  || '';
    return createClient(url, anon, {
      auth: {
        persistSession:     true,           // احفظ الـ session في localStorage
        storageKey:         'nq_sb_auth',   // مفتاح ثابت لكل calls
        storage:            window.localStorage,
        autoRefreshToken:   true,           // جدّد الـ token تلقائياً
        detectSessionInUrl: true,           // مهم لـ Google OAuth redirect
      },
    });
  });
  return _clientPromise;
}

// ─── Sync helper: returns null if Supabase not configured ─────────────────────
export function isConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return !!(url && !url.includes('placeholder'));
}
function configured() {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url && !url.includes('placeholder');
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  if (!configured()) return { error: { message: 'Supabase غير مُهيَّأ' } };
  const sb = await getClient();
  return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } });
}

export async function signInWithEmail(email, password) {
  if (!configured()) return { error: { message: 'Supabase غير مُهيَّأ' } };
  const sb = await getClient();
  return sb.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email, password, name) {
  if (!configured()) return { error: { message: 'Supabase غير مُهيَّأ' } };
  const sb = await getClient();
  return sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
}

export async function signOut() {
  if (!configured()) return;
  const sb = await getClient();
  return sb.auth.signOut();
}

// ─── AUTH STATE (used by useAuth hook) ────────────────────────────────────────
export async function getInitialSession() {
  if (!configured()) return null;
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function onAuthChange(callback) {
  if (!configured()) return () => {};
  const sb = await getClient();
  const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event);
  });
  return () => subscription.unsubscribe();
}

// ─── BOOKMARKS ────────────────────────────────────────────────────────────────
export async function syncBookmarks(userId, bookmarks) {
  if (!configured()) return false;
  const sb = await getClient();
  const { error } = await sb.from('bookmarks')
    .upsert({ user_id: userId, data: bookmarks, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return !error;
}

export async function loadBookmarks(userId) {
  if (!configured()) return [];
  const sb = await getClient();
  const { data } = await sb.from('bookmarks').select('data').eq('user_id', userId).single();
  return data?.data || [];
}

// ─── PROGRESS ─────────────────────────────────────────────────────────────────
export async function saveProgress(userId, surah, ayah) {
  if (!configured()) return false;
  const sb = await getClient();
  const { error } = await sb.from('reading_progress')
    .upsert({ user_id: userId, surah, ayah, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return !error;
}

export async function loadProgress(userId) {
  if (!configured()) return null;
  const sb = await getClient();
  const { data } = await sb.from('reading_progress').select('surah, ayah').eq('user_id', userId).single();
  return data || null;
}

// ─── NOTES ────────────────────────────────────────────────────────────────────
export async function loadNotes(userId) {
  if (!configured()) return [];
  const sb = await getClient();
  const { data } = await sb.from('notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  return data || [];
}

// ─── SCORING ──────────────────────────────────────────────────────────────────
export async function incrementUserScore(userId) {
  if (!configured() || !userId) return;
  const sb = await getClient();
  // زيادة النقاط التراكمية
  const { error: rpcErr } = await sb.rpc('increment_user_score', { p_user_id: userId });
  if (rpcErr) console.warn('[score] rpc error:', rpcErr.message);
  // تسجيل في reading_sessions باستخدام atomic RPC (آمن من race conditions)
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { error: sessionErr } = await sb.rpc('upsert_reading_session', {
    p_user_id: userId,
    p_date: today,
  });
  if (sessionErr) {
    console.warn('[session] rpc failed, falling back:', sessionErr.message);
    // fallback يدوي
    const { data: existing } = await sb.from('reading_sessions')
      .select('id, ayah_count').eq('user_id', userId).eq('date', today).maybeSingle();
    if (existing) {
      await sb.from('reading_sessions')
        .update({ ayah_count: (existing.ayah_count || 0) + 1 })
        .eq('id', existing.id);
    } else {
      await sb.from('reading_sessions')
        .insert({ user_id: userId, date: today, ayah_count: 1 });
    }
  }
}

// ─── STATS ────────────────────────────────────────────────────────────────────
export async function loadStats(userId) {
  if (!configured()) return [];
  const sb = await getClient();
  // Fetch 365 days for accurate streak calculation (was 30 — too short!)
  const { data } = await sb.from('reading_sessions').select('date, ayah_count')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(365);
  return data || [];
}

export async function saveNote(userId, surah, ayah, text) {
  if (!configured()) return false;
  const sb = await getClient();
  const { error } = await sb.from('notes')
    .upsert(
      { user_id: userId, surah, ayah, text, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,surah,ayah' }
    );
  return !error;
}

export async function deleteNote(userId, surah, ayah) {
  if (!configured()) return false;
  const sb = await getClient();
  const { error } = await sb.from('notes')
    .delete()
    .eq('user_id', userId)
    .eq('surah', surah)
    .eq('ayah', ayah);
  return !error;
}


// ─── GROUP KHATMA TAKERS ──────────────────────────────────────────────────────

// يجيب كل الـ takers لختمة (part_index → [{id,taker_name,done}])
export async function getAllTakers(khatmaId) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return {};
  const { data, error } = await sb.rpc('get_all_takers', { p_khatma_id: khatmaId });
  if (error) { console.error('[Takers]', error.message); return {}; }
  // Group by part_index
  const map = {};
  (data || []).forEach(r => {
    if (!map[r.part_index]) map[r.part_index] = [];
    map[r.part_index].push(r);
  });
  return map;
}

// حد يختار جزء
export async function claimPart(khatmaId, partIndex, name) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc('claim_part', {
    p_khatma_id:  khatmaId,
    p_part_index: partIndex,
    p_name:       name,
  });
  if (error) { console.error('[Takers] claim:', error.message); return null; }
  return data; // الـ id الجديد
}

// حد يعلّم إنه خلّص
export async function markTakerDone(takerId, done) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return;
  const { error } = await sb.rpc('mark_taker_done', { p_id: takerId, p_done: done });
  if (error) console.error('[Takers] done:', error.message);
}

// ─── GROUP KHATMAT ────────────────────────────────────────────────────────────

export async function createGroupKhatma(room) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return { error: 'not configured' };

  // 1. Insert room — use both field names for safety
  const roomPayload = {
    id:            room.id,
    deceased_name: room.deceased_name || room.deceasedName || '',
    mode:          room.mode || 'juz',
    is_public:     room.is_public ?? room.isPublic ?? false,
    completions:   0,
    created_by:    room.createdBy || room.created_by || null,
  };

  const { error: roomErr, data: roomData } = await sb
    .from('group_khatmat').insert(roomPayload).select();

  if (roomErr) {
    console.error('[Khatma] room insert error:', roomErr);
    return { error: roomErr };
  }

  // 2. Insert parts
  if (!room.parts || room.parts.length === 0) return { error: null };

  const parts = room.parts.map(p => ({
    khatma_id:   room.id,
    part_index:  p.part_index ?? p.id,
    label:       p.label || '',
    assignee:    p.assignee || '',
    done:        false,
    done_by:     '',
  }));

  const { error: partsErr } = await sb.from('group_khatma_parts').insert(parts);
  if (partsErr) console.error('[Khatma] parts insert error:', partsErr);
  return { error: partsErr };
}

export async function getGroupKhatmaByCode(code) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return null;

  const clean = code.trim().toUpperCase();
  const { data: room, error: roomErr } = await sb.from('group_khatmat')
    .select('*').eq('id', clean).maybeSingle();

  if (roomErr) { console.error('[Khatma] fetch room error:', roomErr); return null; }
  if (!room)   { console.warn('[Khatma] room not found:', clean); return null; }

  const { data: parts, error: partsErr } = await sb.from('group_khatma_parts')
    .select('*').eq('khatma_id', clean).order('part_index');

  if (partsErr) console.error('[Khatma] fetch parts error:', partsErr);
  return { ...room, parts: parts || [] };
}

export async function getMyGroupKhatmat(userId) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return [];

  const { data: rooms } = await sb.from('group_khatmat')
    .select('*, group_khatma_parts(count)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  return rooms || [];
}

export async function getPublicGroupKhatmat() {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return [];
  const { data } = await sb.from('group_khatmat')
    .select('*').eq('is_public', true)
    .order('created_at', { ascending: false }).limit(20);
  return data || [];
}

export async function togglePartDone(khatmaId, partIndex, assignee, currentDone) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return { error: 'not configured' };
  return sb.from('group_khatma_parts').update({
    done:    !currentDone,
    done_by: assignee || '',
    done_at: !currentDone ? new Date().toISOString() : null,
  }).eq('khatma_id', khatmaId).eq('part_index', partIndex);
}

export async function startNewRound(khatmaId) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return;
  // Reset all parts
  await sb.from('group_khatma_parts').update({ done: false, done_by: '', done_at: null })
    .eq('khatma_id', khatmaId);
  // Increment completions
  await sb.rpc('increment_completions', { room_id: khatmaId });
}

export async function updateKhatmaVisibility(khatmaId, isPublic) {
  if (!configured()) return null;
  const sb = await getClient();
  if (!sb) return;
  return sb.from('group_khatmat').update({ is_public: isPublic }).eq('id', khatmaId);
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export async function checkIsAdmin() {
  if (!configured()) return false;
  const sb = await getClient();
  const { data } = await sb.rpc('is_admin');
  return !!data;
}

export async function getAppSettings() {
  if (!configured()) return {};
  const sb = await getClient();
  const { data, error } = await sb.from('app_settings').select('*');
  if (error) { console.warn('[getAppSettings]', error.message); return {}; }
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}

export async function updateAppSetting(key, value) {
  if (!configured()) return { error: 'not configured' };
  const sb = await getClient();
  return sb.from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: (await sb.auth.getUser()).data.user?.id })
    .eq('key', key);
}

export async function adminGetUsers(limit = 50, offset = 0) {
  if (!configured()) return null;
  const sb = await getClient();
  const { data, error } = await sb.rpc('admin_get_users', { p_limit: limit, p_offset: offset });
  return { data: data || [], error };
}

export async function adminToggleAdmin(userId, makeAdmin) {
  if (!configured()) return { error: 'not configured' };
  const sb = await getClient();
  if (makeAdmin) {
    return sb.from('admins').upsert({ user_id: userId });
  } else {
    return sb.from('admins').delete().eq('user_id', userId);
  }
}

// ─── SUPPORT CHAT ─────────────────────────────────────────────────────────────

export async function createTicket(userId, userEmail, subject) {
  if (!configured()) return null;
  const sb = await getClient();
  const { data, error } = await sb.from('support_tickets')
    .insert({ user_id: userId, user_email: userEmail, subject })
    .select().single();
  return { data, error };
}

export async function getMyTickets(userId) {
  if (!configured()) return null;
  const sb = await getClient();
  const { data } = await sb.from('support_tickets')
    .select('*, support_messages(count)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  return data || [];
}

export async function adminGetAllTickets() {
  if (!configured()) return null;
  const sb = await getClient();
  const { data } = await sb.from('support_tickets')
    .select('*, support_messages(count)')
    .order('updated_at', { ascending: false });
  return data || [];
}

export async function getTicketMessages(ticketId) {
  if (!configured()) return null;
  const sb = await getClient();
  const { data } = await sb.from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  return data || [];
}

export async function sendMessage(ticketId, senderId, body, isAdmin = false) {
  if (!configured()) return null;
  const sb = await getClient();
  // Mark other side msgs as read
  await sb.from('support_messages')
    .update({ read: true })
    .eq('ticket_id', ticketId)
    .eq('is_admin', !isAdmin);
  return sb.from('support_messages')
    .insert({ ticket_id: ticketId, sender_id: senderId, body, is_admin: isAdmin });
}

export async function updateTicketStatus(ticketId, status) {
  if (!configured()) return null;
  const sb = await getClient();
  return sb.from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
}

export async function subscribeToMessages(ticketId, callback) {
  if (!configured()) return null;
  const sb = await getClient();
  const channel = sb.channel(`ticket-${ticketId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'support_messages',
      filter: `ticket_id=eq.${ticketId}`,
    }, payload => callback(payload.new))
    .subscribe();
  return () => sb.removeChannel(channel);
}

export async function adminUnreadCount() {
  if (!configured()) return 0;
  const sb = await getClient();
  const { data } = await sb.rpc('admin_unread_count');
  return data || 0;
}

// ─── ADMIN EXTENDED ───────────────────────────────────────────────────────────

export async function adminBanUser(userId, banned) {
  if (!configured()) return null;
  const sb = await getClient();
  return sb.from('user_bans').upsert({ user_id: userId, banned, updated_at: new Date().toISOString() });
}

export async function adminGetStats() {
  if (!configured()) return { users: [], tickets: [], scores: [] };
  const sb = await getClient();
  try {
    const [users, tickets, scores] = await Promise.all([
      sb.rpc('admin_get_users', { p_limit: 200, p_offset: 0 }),
      sb.from('support_tickets').select('status, created_at'),
      sb.from('user_scores').select('ayahs_read, updated_at'),
    ]);
    return {
      users:   users.data   || [],
      tickets: tickets.data || [],
      scores:  scores.data  || [],
      usersError:   users.error?.message   || null,
      ticketsError: tickets.error?.message || null,
    };
  } catch(e) {
    return { users: [], tickets: [], scores: [], fetchError: e.message };
  }
}

export async function adminSendBroadcast(title, body, type = 'info') {
  if (!configured()) return null;
  const sb = await getClient();
  return sb.from('broadcasts').insert({ title, body, type, sent_at: new Date().toISOString() });
}

export async function getBroadcasts() {
  if (!configured()) return [];
  const sb = await getClient();
  const { data } = await sb.from('broadcasts')
    .select('*').order('sent_at', { ascending: false }).limit(20);
  return data || [];
}

export async function adminSendDirectMessage(userId, userEmail, subject, body) {
  // Creates a ticket on behalf of admin and sends first message
  if (!configured()) return null;
  const sb = await getClient();
  const me = (await sb.auth.getUser()).data.user;
  const { data: ticket } = await sb.from('support_tickets')
    .insert({ user_id: userId, user_email: userEmail, subject, status: 'in_progress' })
    .select().single();
  if (!ticket) return { error: 'فشل الإنشاء' };
  await sb.from('support_messages')
    .insert({ ticket_id: ticket.id, sender_id: me?.id, body, is_admin: true });
  return { data: ticket };
}

// ─── PRESENCE — عدد الزوار الكليين (مسجلين وغير مسجلين) ─────────────────────
// كل زائر بيحصل على anonymous key محفوظ في sessionStorage
function getVisitorKey() {
  let key = sessionStorage.getItem('nq_visitor_key');
  if (!key) {
    key = 'visitor_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    sessionStorage.setItem('nq_visitor_key', key);
  }
  return key;
}

// يُستدعى مرة واحدة عند فتح التطبيق — بيعمل track لكل زائر
export async function joinPresence(userId) {
  if (!configured()) return null;
  const sb = await getClient();
  // نستخدم visitor key مش user id — عشان يشمل الزوار غير المسجلين
  const visitorKey = getVisitorKey();
  const channel = sb.channel('visitors', {
    config: { presence: { key: visitorKey } }
  });
  await new Promise(resolve => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          visitor_key: visitorKey,
          user_id: userId || null,
          is_logged_in: !!userId,
          page: window.location.pathname,
          joined_at: new Date().toISOString(),
        });
        resolve();
      }
    });
  });
  return channel;
}

export async function getOnlineCount(channel) {
  if (!channel) return 0;
  const state = channel.presenceState();
  return Object.keys(state).length;
}

export function subscribePresence(channel, callback) {
  if (!channel) return;
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    // عدد الزوار الكليين
    const total = Object.keys(state).length;
    // عدد المسجلين
    const loggedIn = Object.values(state).flat().filter(p => p.is_logged_in).length;
    callback(total, loggedIn);
  });
}

export async function resetPasswordEmail(email) {
  if (!configured()) return { error: { message: 'Supabase not configured' } };
  const sb = await getClient();
  return sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/auth/callback?type=recovery',
  });
}

// ─── HIFZ CLOUD SYNC ──────────────────────────────────────────────────────────
export async function syncHifzToCloud(userId, hifzData) {
  if (!configured() || !userId) return;
  const sb = await getClient();
  await sb.from('hifz').upsert(
    { user_id: userId, data: hifzData, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function loadHifzFromCloud(userId) {
  if (!configured() || !userId) return null;
  const sb = await getClient();
  const { data } = await sb.from('hifz').select('data, updated_at').eq('user_id', userId).single();
  return data || null;
}

// ─── PROFILE UPDATE ───────────────────────────────────────────────────────────
export async function updateUserName(name) {
  if (!configured()) return { error: 'not configured' };
  const sb = await getClient();
  return sb.auth.updateUser({ data: { full_name: name } });
}

export async function updateUserPassword(password) {
  if (!configured()) return { error: 'not configured' };
  const sb = await getClient();
  return sb.auth.updateUser({ password });
}

// ─── DELETE ALL USER DATA ─────────────────────────────────────────────────────
export async function deleteAllUserData(userId) {
  if (!configured() || !userId) return { error: 'not configured' };
  const sb = await getClient();
  // Delete from all user tables (cascade handles most, but explicit for safety)
  const tables = ['bookmarks','notes','reading_progress','reading_sessions',
                  'user_scores','hifz','khatmat','support_tickets'];
  // Supabase query builders are thenables without .catch() — await each one
  // and collect per-table failures instead of throwing before any delete runs.
  const failed = [];
  for (const t of tables) {
    try {
      const { error } = await sb.from(t).delete().eq('user_id', userId);
      if (error) failed.push({ table: t, message: error.message || String(error) });
    } catch (e) {
      failed.push({ table: t, message: e?.message || String(e) });
    }
  }
  if (failed.length) {
    return {
      error: 'تعذّر حذف بعض البيانات: ' + failed.map(f => f.table).join('، '),
      failed,
    };
  }
  return { error: null };
}

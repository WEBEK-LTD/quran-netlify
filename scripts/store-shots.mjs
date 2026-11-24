#!/usr/bin/env node
// ─── Store screenshots and Play graphics, generated from the real app UI ─────
//
//   npm run store:shots                      build the app bundle, then everything below
//   node scripts/store-shots.mjs --no-build  reuse the current dist/ (app or website build)
//   node scripts/store-shots.mjs --lang ar --device iphone --only qibla
//   node scripts/store-shots.mjs --no-build --frame-only    redo only the framed versions
//
// Output (committed):
//   store-assets/screenshots/<ar|en>/<iphone|ipad|play>/raw/NN-name.png      the screen itself
//   store-assets/screenshots/<ar|en>/<iphone|ipad|play>/framed/NN-name.png   headline + device frame
//   store-assets/play/feature-graphic-1024x500.png, store-assets/play/icon-512.png
//
// Sizes (exact): iPhone 6.9" 1320×2868 (440×956 @3), iPad 13" 2064×2752 (1032×1376 @2),
// Google Play phone 1080×1920 (432×768 @2.5).
//
// How: `vite preview` serves dist/; headless Chromium opens each screen with a fake
// Capacitor bridge (so the app shell, not the website, renders), the network mocked
// (alquran.cloud from scripts/seo-data, aladhan, our API with a signed-in user and a
// live room, livekit-client stubbed, recitation audio = generated silence), a fixed
// clock (24 Nov 2026, 13:12 in Cairo) and the opening animation hidden.
//
// Needs Playwright + Chromium: `npm i --no-save playwright && npx playwright install chromium`,
// or point PLAYWRIGHT_MODULE at an installed copy and CHROMIUM_PATH at a browser.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'store-assets');
const require = createRequire(import.meta.url);

// ── options ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);
const LANGS = opt('lang', 'ar,en').split(',');
const DEVICES_WANTED = opt('device', 'iphone,ipad,play').split(',');
const ONLY = opt('only', '');
const PORT = +opt('port', 4199);
const BASE = `http://localhost:${PORT}`;

const DEVICES = {
  iphone: { w: 440, h: 956, dsf: 3, tablet: false },   // 1320×2868
  iphone63: { w: 402, h: 874, dsf: 3, tablet: false }, // 1206×2622 — App Store «iPhone with Dynamic Island (medium display)», 6.3"
  ipad:   { w: 1032, h: 1376, dsf: 2, tablet: true },  // 2064×2752
  play:   { w: 432, h: 768, dsf: 2.5, tablet: false }, // 1080×1920
};

// Fixed clock: Tue 24 Nov 2026, 13:12 in Cairo (UTC+2) → next prayer Asr.
const NOW = Date.UTC(2026, 10, 24, 11, 12, 0);
const TZ = 'Africa/Cairo';

// ── helpers ──────────────────────────────────────────────────────────────────
function loadPlaywright() {
  const ids = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const id of ids) { try { return require(id); } catch {} }
  console.error('Playwright not found. Run: npm i --no-save playwright && npx playwright install chromium\n(or set PLAYWRIGHT_MODULE to an installed copy).');
  process.exit(1);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Chromium writes fast, large PNGs; recompress losslessly (about half the size) when sharp
// is installed (it comes with @capacitor/assets)
let sharpMod; try { sharpMod = require('sharp'); } catch { sharpMod = null; }
async function optimizePng(file) {
  if (!sharpMod) return;
  const buf = await sharpMod(file).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
  if (buf.length < statSync(file).size) writeFileSync(file, buf);
}
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

async function startPreview() {
  const child = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE + '/'); if (r.ok) return child; } catch {}
    if (child.exitCode !== null) break;
    await sleep(200);
  }
  child.kill();
  throw new Error('vite preview did not start:\n' + log);
}

// ── mocked content ───────────────────────────────────────────────────────────
const QURAN = readJson('scripts/seo-data/quran-uthmani-hafs.json');
const MUYASSAR = readJson('scripts/seo-data/tafsir-ar-muyassar.json');
const EN = readJson('scripts/seo-data/translation-en-saheeh.json');
const FR = existsSync(join(ROOT, 'scripts/seo-data/translation-fr-hamidullah.json')) ? readJson('scripts/seo-data/translation-fr-hamidullah.json') : EN;
const NAMES = readJson('scripts/seo-data/surah-names.json');
const surahNameAr = (n) => (NAMES.surahs[n - 1] || {}).ar || '';
function editionText(edition) {
  if (/muyassar|jalalayn|tafsir/i.test(edition)) return MUYASSAR;
  if (/^en\./.test(edition)) return EN;
  if (/^fr\./.test(edition)) return FR;
  if (/^(tr|ur|id)\./.test(edition)) return EN;
  return QURAN;
}
// alquran.cloud numbering: the global ayah number
const OFFSETS = QURAN.reduce((acc, s, i) => { acc.push(i ? acc[i - 1] + QURAN[i - 1].length : 0); return acc; }, []);
function ayahObj(s, a, edition) {
  const list = editionText(edition)[s - 1] || [];
  return {
    number: OFFSETS[s - 1] + a, numberInSurah: a, text: list[a - 1] || '',
    surah: { number: s, name: 'سُورَةُ ' + surahNameAr(s), englishName: '', numberOfAyahs: QURAN[s - 1].length },
    juz: 1, page: 1, hizbQuarter: 1, sajda: false,
    edition: { identifier: edition },
  };
}
function alquranCloud(url) {
  const u = new URL(url);
  let m;
  if ((m = /\/v1\/surah\/(\d+)(?:\/([\w.-]+))?/.exec(u.pathname))) {
    const s = +m[1], ed = m[2] || 'quran-uthmani';
    const n = QURAN[s - 1].length;
    return { code: 200, status: 'OK', data: { number: s, name: 'سُورَةُ ' + surahNameAr(s), numberOfAyahs: n, edition: { identifier: ed }, ayahs: Array.from({ length: n }, (_, i) => ayahObj(s, i + 1, ed)) } };
  }
  if ((m = /\/v1\/ayah\/([\d:]+)(?:\/([\w.-]+))?/.exec(u.pathname))) {
    let s, a;
    if (m[1].includes(':')) [s, a] = m[1].split(':').map(Number);
    else { const g = +m[1]; s = OFFSETS.findLastIndex(o => o < g) + 1; a = g - OFFSETS[s - 1]; }
    return { code: 200, status: 'OK', data: ayahObj(s, a, m[2] || 'quran-uthmani') };
  }
  return { code: 404, status: 'Not found', data: null };
}

// aladhan: Cairo, Egyptian General Authority (method 5), late November 2026
const TIMES = { Fajr: '04:56', Sunrise: '06:24', Dhuhr: '11:44', Asr: '14:39', Sunset: '17:00', Maghrib: '17:00', Isha: '18:20', Imsak: '04:46', Midnight: '23:44' };
function shiftTimes(dayDelta) {
  const out = {};
  for (const [k, v] of Object.entries(TIMES)) {
    const [h, mi] = v.split(':').map(Number);
    const t = h * 60 + mi + Math.round(dayDelta * (k === 'Fajr' || k === 'Sunrise' ? 0.6 : 0.3));
    out[k] = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')} (EET)`;
  }
  return out;
}
const HIJRI = { date: '14-06-1448', day: '14', month: { number: 6, en: 'Jumādá al-ākhirah', ar: 'جُمادى الآخرة' }, year: '1448', weekday: { en: 'Al Thalaata', ar: 'الثلاثاء' } };
function aladhan(url) {
  const u = new URL(url);
  const meta = { latitude: 30.0444, longitude: 31.2357, timezone: TZ, method: { id: 5, name: 'Egyptian General Authority of Survey' } };
  if (/\/calendar\//.test(u.pathname)) {
    const [, y, mo] = /\/calendar\/(\d+)\/(\d+)/.exec(u.pathname).map(Number);
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { code: 200, status: 'OK', data: Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      return { timings: shiftTimes((Date.UTC(y, mo - 1, d) - Date.UTC(2026, 10, 24)) / 864e5),
        date: { readable: '', timestamp: String(Date.UTC(y, mo - 1, d) / 1000), gregorian: { date: `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}-${y}`, day: String(d) }, hijri: HIJRI }, meta };
    }) };
  }
  if (/\/gToH/.test(u.pathname)) return { code: 200, status: 'OK', data: { hijri: HIJRI, gregorian: { date: '24-11-2026' } } };
  const dm = /\/timings\/(\d+)-(\d+)-(\d+)/.exec(u.pathname);
  const delta = dm ? (Date.UTC(+dm[3], +dm[2] - 1, +dm[1]) - Date.UTC(2026, 10, 24)) / 864e5 : 0;
  const timings = Object.fromEntries(Object.entries(shiftTimes(delta)).map(([k, v]) => [k, v.slice(0, 5)]));
  return { code: 200, status: 'OK', data: { timings, date: { readable: '24 Nov 2026', timestamp: String(NOW / 1000), hijri: HIJRI, gregorian: { date: '24-11-2026', day: '24' } }, meta } };
}

// a few seconds of silence (8 kHz mono WAV) stands in for every recitation file
function silentWav(seconds = 3) {
  const rate = 8000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}
const WAV = silentWav();

// ── our API (signed-in user, voice rooms) ───────────────────────────────────
function makeApi(lang) {
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const iso = (msAgo = 0) => new Date(NOW - msAgo).toISOString().replace(/\.\d+Z$/, 'Z');
  const at = (h, m, dayPlus = 0) => new Date(Date.UTC(2026, 10, 24 + dayPlus, h - 2, m)).toISOString();
  const B = (id, name) => ({ id, name, avatar_url: null });
  const ME = B(1, L('يوسف أحمد', 'Yusuf Ahmed'));
  const host = B(21, L('الشيخ محمود عبد الرحيم', 'Sheikh Mahmoud Abdelrahim'));
  const omar = B(22, L('عمر الشريف', 'Omar Elsherif'));
  const hasan = B(23, L('حسن البنهاوي', 'Hassan Elbanhawy'));
  const karim = B(24, L('كريم فؤاد', 'Karim Fouad'));
  const group = { id: 5, name: L('حلقة الفجر بالمعادي', 'Fajr Circle, Maadi'), photo_url: null };
  const stage = [{ ...host, role: 'owner' }, { ...omar, role: 'moderator' }, { ...hasan, role: 'speaker' }, { ...karim, role: 'speaker' }];
  const names = lang === 'ar'
    ? ['أحمد سالم', 'طارق عادل', 'مصطفى كامل', 'سيف الدين', 'بلال حسن', 'عبد الله نور', 'زياد حمدي', 'رامي سعيد', 'خالد منصور', 'محمد علي', 'إبراهيم فتحي', 'يحيى زكريا', 'حمزة عمر', 'أنس طه', 'معاذ جبل']
    : ['Ahmed Salem', 'Tarek Adel', 'Mostafa Kamel', 'Seif Eldin', 'Bilal Hassan', 'Abdullah Nour', 'Ziad Hamdy', 'Ramy Saeed', 'Khaled Mansour', 'Mohamed Ali', 'Ibrahim Fathy', 'Yahia Zakaria', 'Hamza Omar', 'Anas Taha', 'Moaz Gabal'];
  const listeners = names.map((nm, i) => ({ ...B(100 + i, nm), role: 'listener', hand_raised: i < 2 }));
  listeners.splice(4, 0, { ...ME, role: 'listener', hand_raised: false });
  const room = {
    id: 11, title: L('تدبّر سورة الملك — الليلة الثالثة', 'Reflecting on Surah Al-Mulk — night three'), gender_scope: 'men', visibility: 'public_by_type', status: 'open',
    scheduled_at: null, opened_at: iso(40 * 60e3), locked: false, owner: host, group,
    listener_count: 128, speaker_count: 4, stage, shared: { surah: 67, ayah: 1, page: 562, updated_at: iso(60e3) },
    reminded: false, my_role: null, hand_raised: false,
  };
  const rooms = [room,
    { id: 12, title: L('مراجعة جزء عمّ مع التصحيح', 'Juz Amma review with correction'), gender_scope: 'mixed', visibility: 'public_by_type', status: 'open', scheduled_at: null, opened_at: iso(9 * 60e3), locked: false,
      owner: B(31, L('أ. أسماء الدسوقي', 'Ustadha Asmaa Eldesouky')), group: { id: 6, name: L('أكاديمية الإتقان', 'Itqan Academy'), photo_url: null }, listener_count: 46, speaker_count: 2,
      stage: [{ ...B(31, L('أ. أسماء الدسوقي', 'Ustadha Asmaa Eldesouky')), role: 'owner' }, { ...B(32, L('الشيخ ياسر', 'Sheikh Yasser')), role: 'speaker' }], shared: null, reminded: false, my_role: null, hand_raised: false },
    { id: 14, title: L('ختمة الجمعة — الجزء الثامن والعشرون', 'Friday khatma — Juz 28'), gender_scope: 'men', visibility: 'public_by_type', status: 'scheduled', scheduled_at: at(21, 0), opened_at: null, locked: false,
      owner: host, group, listener_count: 0, speaker_count: 0, stage: [], shared: null, reminded: false, my_role: null, hand_raised: false },
  ];
  const chat = [
    { id: 1, kind: 'system', event: 'join', body: L('انضم أحمد سالم', 'Ahmed Salem joined'), user: null, created_at: iso(300e3) },
    { id: 2, kind: 'chat', event: null, body: L('السلام عليكم ورحمة الله، نبدأ بعد دقيقة بإذن الله.', 'Assalamu alaikum, we start in a minute insha Allah.'), user: { ...omar, role: 'moderator' }, created_at: iso(200e3) },
    { id: 3, kind: 'chat', event: null, body: L('ما معنى «تبارك» في أول السورة يا شيخ؟', 'What does “Tabarak” at the start of the surah mean?'), user: { ...listeners[0], role: 'listener' }, created_at: iso(150e3) },
    { id: 4, kind: 'chat', event: null, body: L('جزاكم الله خيراً، التوضيح كان واضحاً جداً.', 'JazakAllahu khayran, that was very clear.'), user: { ...listeners[2], role: 'listener' }, created_at: iso(60e3) },
  ];
  const profile = {
    joined: true, eligible: true, missing: [], gender: 'male', birthdate: '1996-03-14', age: 30, is_minor: false, underage: false,
    locked: { gender: true, birthdate: true }, user: ME,
    profile: { bio: '', facebook_url: null, instagram_url: null, is_private: false, private_forced: false, dm_policy: 'same_gender', counters: { friends: 12, followers: 30, following: 8, claps_sent: 40, claps_received: 22 } },
    suspension: null, muted_types: [],
  };
  const ok = (data, status = 200, headers = {}) => ({ status, headers, body: JSON.stringify({ ok: true, data }) });
  const err = (status, code) => ({ status, headers: {}, body: JSON.stringify({ ok: false, error: { code, message: '' } }) });
  const unknown = new Set();
  function handle(method, path, query, body) {
    const q = new URLSearchParams(query || '');
    let m;
    if (path === '/auth/me') return ok({ user: { ...ME, email: 'yusuf@example.com', is_admin: false, email_verified: true, has_password: true, gender: 'male', birthdate: '1996-03-14', created_at: iso(200 * 864e5) } });
    if (path === '/settings/public') return ok({ app_name: 'نور القرآن', maintenance_mode: false, allow_signup: true, announcement: '', features: { rooms: true, ai_assistant: false }, google_login: true });
    if (path === '/presence') return ok({ online: 1240 });
    if (path === '/broadcasts') return ok([]);
    if (path === '/me/community-profile') return ok(profile);
    if (path === '/rooms' && method === 'GET') {
      const tab = q.get('tab');
      const list = tab === 'scheduled' ? rooms.filter(r => r.status === 'scheduled') : tab === 'mine' ? [] : rooms.filter(r => r.status === 'open');
      return ok({ items: list, page: 1, per_page: 30, total: list.length });
    }
    if ((m = /^\/rooms\/(\d+)$/.exec(path))) {
      const r = rooms.find(x => x.id === +m[1]); if (!r) return err(404, 'not_found');
      return ok({ ...r, in_room: false, limits: { max_listeners: 500 } });
    }
    if ((m = /^\/rooms\/(\d+)\/join$/.exec(path))) {
      return ok({ url: 'wss://rtc.example.invalid:7443', token: 'FAKE.TOKEN', identity: '1', livekit_room: 'nq-room-' + m[1], role: 'listener', expires_at: iso(-6 * 3600e3), room, me: ME });
    }
    if (/^\/rooms\/\d+\/participants$/.test(path)) return ok({ stage: stage.map(p => ({ ...p, hand_raised: false })), listeners, listener_count: 128 });
    if (/^\/rooms\/\d+\/chat$/.test(path)) return ok({ items: chat.filter(c => c.id > +(q.get('after_id') || 0)) });
    if (/^\/rooms\/\d+\/(hand|leave|reminder|reactions)$/.test(path)) return ok({});
    if (path === '/community/groups/mine') return ok({ items: [], invites: [] });
    if (path === '/community/groups') return ok({ items: [], page: 1, per_page: 8, total: 0 });
    if (path === '/me/friends/activity') return ok({ items: [] });
    if (path === '/me/conversations') return ok({ items: [], server_time: iso() }, 200, { ETag: 'W/"c0"' });
    if (path === '/me/notifications') return ok({ items: [], unread: 0, max_id: 0 }, 200, { ETag: 'W/"n0"' });
    if (path === '/me/devices') return ok({}, 201);
    if (path === '/me/reading' || path === '/me/progress') return ok({});
    unknown.add(`${method} ${path}`);
    if (method !== 'GET') return ok({});
    return err(404, 'not_found');
  }
  return { handle, unknown };
}

// livekit-client stand-in: connects at once, four speakers on stage, two talking
const FAKE_LK = `
export const RoomEvent = { TrackSubscribed:'trackSubscribed', TrackUnsubscribed:'trackUnsubscribed', TrackMuted:'trackMuted', TrackUnmuted:'trackUnmuted',
  LocalTrackPublished:'localTrackPublished', LocalTrackUnpublished:'localTrackUnpublished', ParticipantConnected:'participantConnected', ParticipantDisconnected:'participantDisconnected',
  ActiveSpeakersChanged:'activeSpeakersChanged', AudioPlaybackStatusChanged:'audioPlaybackChanged', Reconnecting:'reconnecting', SignalReconnecting:'signalReconnecting',
  Reconnected:'reconnected', ParticipantPermissionsChanged:'participantPermissionsChanged', ParticipantMetadataChanged:'participantMetadataChanged', DataReceived:'dataReceived',
  MediaDevicesError:'mediaDevicesError', Disconnected:'disconnected' };
export const Track = { Source: { Microphone: 'microphone' } };
export const DisconnectReason = { UNKNOWN_REASON:0, CLIENT_INITIATED:1, DUPLICATE_IDENTITY:2, SERVER_SHUTDOWN:3, PARTICIPANT_REMOVED:4, ROOM_DELETED:5 };
class P { constructor(id, role){ this.identity=String(id); this.metadata=JSON.stringify({role}); this.permissions={canPublish: role!=='listener'}; this.pubs={}; this.isMicrophoneEnabled=false; }
  getTrackPublication(s){ return this.pubs[s]; } }
export class Room {
  constructor(opts){ this.opts=opts; this.h={}; this.remoteParticipants=new Map(); this.canPlaybackAudio=true; window.__lk=this;
    const lp=new P(1,'listener'); this.localParticipant=lp; lp.setMicrophoneEnabled=async()=>{}; }
  on(e,f){ (this.h[e] ||= []).push(f); return this; }
  emit(e,...a){ (this.h[e]||[]).forEach(f=>f(...a)); }
  async connect(){ for (const [id,muted] of [[21,false],[22,true],[23,true],[24,false]]) { const p=new P(id,'speaker'); p.pubs.microphone={isMuted:muted}; this.remoteParticipants.set(String(id),p); } }
  async disconnect(){ this.emit('disconnected', 1); }
  async startAudio(){ this.canPlaybackAudio=true; this.emit('audioPlaybackChanged'); }
  data(topic,obj){ this.emit('dataReceived', new TextEncoder().encode(JSON.stringify(obj)), undefined, 0, topic); }
}`;

// Fake Capacitor bridge (init script): the app shell renders as on a phone.
const fakeBridge = (platform) => {
  const methods = {
    App: ['getLaunchUrl', 'getState', 'getInfo', 'minimizeApp', 'exitApp'], Browser: ['open', 'close'],
    LocalNotifications: ['schedule', 'getPending', 'cancel', 'registerActionTypes', 'createChannel', 'checkPermissions', 'requestPermissions', 'checkExactNotificationSetting', 'removeDeliveredNotifications', 'listChannels'],
    PushNotifications: ['register', 'checkPermissions', 'requestPermissions', 'createChannel'], Preferences: ['get', 'set', 'remove'],
    SplashScreen: ['show', 'hide'], SystemBars: ['setStyle', 'show', 'hide', 'setAnimation'],
    NQNative: ['setBackgroundColor', 'openChannelSettings', 'openAppSettings', 'mediaUpdate', 'mediaClear'], Keyboard: ['show', 'hide', 'setAccessoryBarVisible', 'setScroll', 'setResizeMode'],
  };
  if (platform === 'ios') methods.NQAudio = ['setMode'];
  const listeners = {}; let cbId = 0; const prefs = {};
  window.__nq = { listeners, fire(p, e, d) { (listeners[p + ':' + e] || []).forEach(cb => cb(d)); } };
  window.CapacitorCustomPlatform = { name: platform };
  window.Capacitor = {
    getPlatform: () => platform, isNativePlatform: () => true,
    PluginHeaders: Object.entries(methods).map(([name, ms]) => ({ name, methods: [...ms.map(m => ({ name: m, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] })),
    nativeCallback(plugin, method, options, callback) { const id = String(++cbId); if (method === 'addListener') (listeners[plugin + ':' + options.eventName] ||= []).push(callback); return id; },
    async nativePromise(plugin, method, options) {
      if (!methods[plugin]) { const e = new Error(`"${plugin}" plugin is not implemented on ${platform}`); e.code = 'UNIMPLEMENTED'; throw e; }
      const k = plugin + '.' + method;
      if (k === 'App.getLaunchUrl') return {};
      if (k === 'App.getInfo') return { version: '1.0.0', build: '1' };
      if (k === 'LocalNotifications.checkPermissions' || k === 'LocalNotifications.requestPermissions') return { display: 'granted' };
      if (k === 'LocalNotifications.checkExactNotificationSetting') return { exact_alarm: 'granted' };
      if (k === 'LocalNotifications.getPending') return { notifications: [] };
      if (k === 'LocalNotifications.listChannels') return { channels: [] };
      if (k === 'PushNotifications.checkPermissions') return { receive: 'granted' };
      if (k === 'Preferences.get') return { value: prefs[options.key] ?? null };
      if (k === 'Preferences.set') { prefs[options.key] = options.value; return {}; }
      return {};
    },
  };
};

// localStorage seed: Cairo, signed in, appearance, reading position
const seed = ([lang, mode, extra]) => {
  try {
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('nq_ui_lang', lang);
    set('nq_appearance', { mode, cb: false, size: 100, reduce: false });
    set('nq_token', 'store-shots-token');
    set('nq_pray_lat', '30.0444'); set('nq_pray_lon', '31.2357'); set('nq_pray_tz', 'Africa/Cairo');
    set('nq_pray_city', lang === 'ar' ? 'القاهرة' : 'Cairo');
    set('nq_lastRead', { surah: 18, ayah: 10 });
    set('nq_room_mic_explained', '1');
    set('nq_pray_method_v2', '5');
    set('nq_pray_alarms', { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true });
    set('nq_adhan_settings', { enabled: true, muezzin: 'khalaf1', fajrMuezzin: 'owner_fajr', reminder: 10, dailyAyah: true, modes: { Fajr: 'adhan', Dhuhr: 'adhan', Asr: 'adhan', Maghrib: 'adhan', Isha: 'notify' } });
    for (const [k, v] of Object.entries(extra || {})) set(k, v);
  } catch {}
  // hide the opening animation and the caret
  const css = '#nq-launch{display:none!important} *{caret-color:transparent!important}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); document.documentElement.classList.remove('nq-launching'); };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
};

// ── screens ──────────────────────────────────────────────────────────────────
// mode is the same in every language; two light screens for variety.
const SCREENS = [
  { n: '01', name: 'home', path: '/', mode: 'dark',
    head: ['القرآن والصلاة معاً', 'Quran and prayer, together'],
    sub: ['المصحف والتلاوات ومواقيت الصلاة والأذكار', 'Mushaf, recitations, prayer times and adhkar'] },
  { n: '02', name: 'mushaf', path: '/reader?surah=18&ayah=1', mode: 'light',
    head: ['المصحف بالرسم العثماني', 'The Mushaf in Uthmani script'],
    sub: ['اضغط على الآية فتسمعها بصوت قارئك', 'Tap an ayah to hear it recited'],
    async prep(page) {
      const a = page.locator('[data-kufi="3"]').first();
      await a.waitFor({ timeout: 8000 });
      await a.click();
      await sleep(1200);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
    } },
  { n: '03', name: 'listen', path: '/listen', mode: 'dark',
    head: ['استمع إلى السورة كاملة', 'Listen to whole surahs'],
    sub: ['قرّاء كبار، والتلاوة مستمرة وأنت تتنقل', 'Renowned reciters, playing as you move around'],
    async prep(page) {
      await page.getByRole('button', { name: /العفاسي|Alafasy|Afasy/ }).first().click().catch(() => {});
      await sleep(300);
      await page.locator('button[data-n="18"]').first().click();
      await sleep(4500); // past the basmala: «Al-Kahf · ayah 1»
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
    } },
  { n: '04', name: 'tafsir', path: '/tafsir', mode: 'light',
    head: ['التفسير آية بآية', 'Tafsir, ayah by ayah'],
    sub: ['التفسير الميسّر وتفسير الجلالين', 'Al-Muyassar and Al-Jalalayn'] },
  { n: '05', name: 'prayer', path: '/prayer-times', mode: 'dark',
    head: ['الأذان في وقته', 'The adhan, on time'],
    sub: ['لكل صلاة أذانها، واختر مؤذّنك ومؤذّن الفجر', 'Per-prayer alerts, your muezzin and a Fajr muezzin'],
    async prep(page) {
      // the «تنبيه الأذان» row: five prayers, style per prayer, muezzins, reminder
      await page.waitForSelector('#pt-settings button[aria-pressed]');
      await sleep(600);
      await page.evaluate(() => {
        const row = document.querySelector('#pt-settings button[aria-pressed]').closest('[class*="setRow"]');
        const bar = document.querySelector('.nq-top');
        window.scrollTo(0, row.getBoundingClientRect().top + scrollY - (bar ? bar.getBoundingClientRect().height : 64) - 12);
      });
      await sleep(600);
    } },
  { n: '06', name: 'qibla', path: '/qibla', mode: 'dark',
    head: ['اتجاه القبلة', 'Find the Qibla'],
    sub: ['بوصلة تعمل من موقعك', 'A compass that works from where you are'],
    // a steady heading from the first frame, as a real magnetometer would give
    init: (ios) => {
      if (ios) {
        try { delete Window.prototype.ondeviceorientationabsolute; delete window.ondeviceorientationabsolute; } catch {}
        window.DeviceOrientationEvent.requestPermission = async () => 'granted';
      }
      let i = 0;
      setInterval(() => {
        const h = 131.4 + Math.sin(i++ / 6) * 0.3; // Cairo: qibla 136.1° true, declination +4.8°
        if (ios) { const e = new Event('deviceorientation'); Object.assign(e, { webkitCompassHeading: h, webkitCompassAccuracy: 10, alpha: 0, beta: 30, gamma: 0 }); window.dispatchEvent(e); }
        else window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 360 - h, beta: 30, gamma: 0, absolute: true }));
      }, 40);
    },
    async prep(page, { platform }) {
      if (platform === 'ios') await page.getByRole('button', { name: /تفعيل البوصلة|compass/i }).first().click({ timeout: 3000 }).catch(() => {});
      await sleep(1500);
    } },
  { n: '07', name: 'tadhkira', path: '/tadhkira?open=1', mode: 'dark',
    head: ['تذكرة لقلبك كل يوم', 'A daily reminder for your heart'],
    sub: ['آية من كتاب الله تتجدّد كل يوم', 'An ayah from the Book of Allah, new each day'],
    async prep(page) {
      const btn = page.getByRole('button', { name: /افتح|Open/ }).first();
      if (await btn.count()) await btn.click().catch(() => {});
      await sleep(3200);
      // whole card in view: from the top of the page if it fits, else from the card's top
      await page.evaluate(() => {
        const card = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
        if (card) card.blur();
        window.scrollTo(0, 0);
        if (!card) return;
        const r = card.getBoundingClientRect();
        if (r.bottom > innerHeight - 90) {
          const bar = document.querySelector('.nq-top');
          window.scrollTo(0, r.top - (bar ? bar.getBoundingClientRect().height : 64) - 14);
        }
      });
      await sleep(400);
    } },
  { n: '08', name: 'room', path: '/rooms/11', mode: 'dark',
    head: ['مجالس القرآن الصوتية', 'Live Quran voice rooms'],
    sub: ['تدبّر وتلاوة مع أهل القرآن', 'Recite and reflect together'],
    async prep(page) {
      await sleep(1200);
      await page.evaluate(() => { window.__lk && window.__lk.emit('activeSpeakersChanged', [{ identity: '21' }]); });
      await sleep(400);
    } },
];

// ── capture ──────────────────────────────────────────────────────────────────
async function capture(browser, { lang, device, screen }) {
  const D = DEVICES[device];
  const platform = device === 'play' ? 'android' : 'ios';
  const ctx = await browser.newContext({
    viewport: { width: D.w, height: D.h }, deviceScaleFactor: D.dsf, isMobile: true, hasTouch: true,
    locale: lang === 'ar' ? 'ar-EG' : 'en-US', timezoneId: TZ, colorScheme: screen.mode === 'light' ? 'light' : 'dark',
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const api = makeApi(lang);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(fakeBridge, platform);
  await page.addInitScript(seed, [lang, screen.mode, screen.storage || {}]);
  if (screen.init) await page.addInitScript(screen.init, platform === 'ios');
  const json = (route, data, extra = {}) => route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra }, body: JSON.stringify(data) });
  await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const req = route.request();
    const url = req.url();
    const host = new URL(url).hostname;
    if (host === 'api.nuralquran.net') {
      const cors = { 'Access-Control-Allow-Origin': req.headers().origin || BASE, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-NQ-Client, X-NQ-Date, If-None-Match', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'ETag, Retry-After' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const u = new URL(url);
      let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined; } catch {}
      const r = api.handle(req.method(), u.pathname.replace(/^\/v1/, ''), u.search.slice(1), body);
      return route.fulfill({ status: r.status, headers: { ...cors, 'Content-Type': 'application/json', ...r.headers }, body: r.body });
    }
    if (host === 'api.alquran.cloud') return json(route, alquranCloud(url));
    if (host === 'api.aladhan.com') return json(route, aladhan(url));
    if (host === 'nominatim.openstreetmap.org') return json(route, { address: { city: lang === 'ar' ? 'القاهرة' : 'Cairo', country: lang === 'ar' ? 'مصر' : 'Egypt' } });
    if (/\.(mp3|m4a|ogg)(\?|$)/.test(url) || host === 'everyayah.com' || /mp3quran|qurango|radiojar/.test(host)) {
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'audio/wav', 'Access-Control-Allow-Origin': '*' }, body: WAV });
    }
    return route.abort();
  });
  await page.route('**/assets/livekit-client.esm-*.js', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/javascript' }, body: FAKE_LK }));
  await page.goto(BASE + screen.path, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await sleep(1800);
  if (screen.prep) { try { await screen.prep(page, { lang, device, platform, D }); } catch (e) { errors.push('prep: ' + e.message.split('\n')[0]); } }
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await sleep(500);
  const check = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const spinners = [...document.querySelectorAll('[class*="spin"], [class*="Spinner"], [class*="skeleton"], [class*="Skeleton"], [aria-busy="true"]')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }).length;
    return { overflow: document.documentElement.scrollWidth > w + 1, spinners, launch: document.documentElement.classList.contains('nq-launching') };
  });
  const dir = join(OUT, 'screenshots', lang, device, 'raw');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${screen.n}-${screen.name}.png`);
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', fullPage: flag('full') });
  await ctx.close();
  await optimizePng(file);
  return { file, errors, unknown: [...api.unknown], ...check };
}

// ── framed marketing version ────────────────────────────────────────────────
const FONTS = `
@font-face{font-family:'Kufi';src:url(data:font/woff2;base64,${b64('node_modules/@fontsource/reem-kufi/files/reem-kufi-arabic-600-normal.woff2')}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF;}
@font-face{font-family:'Kufi';src:url(data:font/woff2;base64,${b64('node_modules/@fontsource/reem-kufi/files/reem-kufi-latin-600-normal.woff2')}) format('woff2');unicode-range:U+0000-024F,U+2000-206F;}
@font-face{font-family:'Plex';src:url(data:font/woff2;base64,${b64('node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2')}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF;}
@font-face{font-family:'Plex';src:url(data:font/woff2;base64,${b64('node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-500-normal.woff2')}) format('woff2');unicode-range:U+0000-024F,U+2000-206F;}
`;
// eight-pointed star lattice, as on the site (very faint)
const PATTERN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="#D6B267" stroke-opacity=".07" stroke-width="1.2"><path d="M48 14l10 24 24 10-24 10-10 24-10-24-24-10 24-10z"/><rect x="30" y="30" width="36" height="36" transform="rotate(45 48 48)"/><rect x="30" y="30" width="36" height="36"/></g></svg>')}")`;
const BG = `radial-gradient(120% 60% at 50% 0%, #1B5A41 0%, #0B2A1E 45%, #06100C 100%)`;

function framedHtml({ shotB64, head, sub, lang, D }) {
  const rtl = lang === 'ar';
  const W = D.w, H = D.h;
  const tablet = D.tablet;
  // Arabic headlines fit one line, English ones take two: the block keeps that height on
  // every screen so the device has the same size across a language's set
  const lines = rtl || tablet ? 1 : 2;
  const headSize = tablet ? (rtl ? 64 : 52) : Math.round(W * (rtl ? 0.085 : 0.078));
  const subSize = tablet ? 30 : Math.round(W * 0.042);
  const top = tablet ? 70 : Math.round(H * 0.06);
  const phoneW = tablet ? Math.round(W * 0.74) : Math.round(W * 0.76);
  const radius = tablet ? 34 : Math.round(phoneW * 0.12);
  const bezel = tablet ? 14 : Math.round(phoneW * 0.028);
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>${FONTS}
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:${PATTERN},${BG};background-size:96px 96px,auto;display:flex;flex-direction:column;align-items:center;color:#F1EBDC}
  .t{margin-top:${top}px;padding:0 ${Math.round(W * 0.07)}px;text-align:center}
  h1{font-family:Kufi,sans-serif;font-weight:600;font-size:${headSize}px;line-height:1.25;margin:0;min-height:${lines * 1.25}em;display:flex;align-items:flex-end;justify-content:center;
     background:linear-gradient(180deg,#F6DFA0,#D4AE5C 60%,#B8893A);-webkit-background-clip:text;background-clip:text;color:transparent;text-wrap:balance}
  p{font-family:Plex,sans-serif;font-weight:500;font-size:${subSize}px;line-height:1.5;margin:${Math.round(subSize * 0.55)}px 0 0;color:#C9D3CB;text-wrap:balance;min-height:${tablet ? 1.5 : lines * 1.5}em}
  .rule{width:${Math.round(W * 0.16)}px;height:2px;margin:${Math.round(subSize * 0.7)}px auto 0;background:linear-gradient(90deg,transparent,#D6B267,transparent)}
  .dev{margin-top:${tablet ? 52 : Math.round(H * 0.035)}px;width:${phoneW}px;padding:${bezel}px;border-radius:${radius + bezel}px;background:linear-gradient(160deg,#2A2A26,#0B0B0A 40%,#1C1C19);
       box-shadow:0 0 0 1.5px rgba(214,178,103,.45),0 40px 90px -20px rgba(0,0,0,.8),0 0 120px -30px rgba(214,178,103,.35)}
  .dev img{display:block;width:100%;border-radius:${radius}px}
  </style></head><body><div class="t"><h1>${head}</h1><div class="rule"></div><p>${sub}</p></div>
  <div class="dev"><img src="data:image/png;base64,${shotB64}"></div></body></html>`;
}

async function frame(browser, { lang, device, screen, rawFile }) {
  const D = DEVICES[device];
  const ctx = await browser.newContext({ viewport: { width: D.w, height: D.h }, deviceScaleFactor: D.dsf });
  const page = await ctx.newPage();
  const i = lang === 'ar' ? 0 : 1;
  await page.setContent(framedHtml({ shotB64: readFileSync(rawFile).toString('base64'), head: screen.head[i], sub: screen.sub[i], lang, D }), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // the device takes the height left under the headline
  await page.evaluate(([bottom]) => {
    const dev = document.querySelector('.dev');
    const pad = parseFloat(getComputedStyle(dev).paddingTop);
    const avail = innerHeight - dev.getBoundingClientRect().top - bottom - 2 * pad;
    const w = Math.min(dev.getBoundingClientRect().width - 2 * pad, avail * innerWidth / innerHeight);
    dev.style.width = w + 'px';
  }, [D.tablet ? 64 : Math.round(D.h * 0.035)]);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  const fit = await page.evaluate(() => { const r = document.querySelector('.dev').getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight }; });
  const dir = join(OUT, 'screenshots', lang, device, 'framed');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${screen.n}-${screen.name}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  await optimizePng(file);
  return { file, fit };
}

// ── Play graphics ────────────────────────────────────────────────────────────
async function playGraphics(browser) {
  const dir = join(OUT, 'play');
  mkdirSync(dir, { recursive: true });
  // feature graphic 1024×500
  const mark = readFileSync(join(ROOT, 'public/brand/logo-mark.svg')).toString('base64');
  const word = readFileSync(join(ROOT, 'public/brand/wordmark-on-dark.svg')).toString('base64');
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${FONTS}
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  body{background:${PATTERN},radial-gradient(90% 120% at 70% 40%, #1B5A41 0%, #0B2A1E 50%, #06100C 100%);background-size:96px 96px,auto;
       display:flex;align-items:center;justify-content:center;gap:56px}
  .mark{width:210px;height:auto;filter:drop-shadow(0 18px 40px rgba(0,0,0,.55)) drop-shadow(0 0 40px rgba(214,178,103,.25))}
  .txt{display:flex;flex-direction:column;align-items:center;gap:26px}
  .word{width:400px;height:auto}
  .tag{font-family:Kufi,sans-serif;font-weight:600;font-size:38px;color:#F0D89A;letter-spacing:.01em}
  .rule{width:220px;height:2px;background:linear-gradient(90deg,transparent,#D6B267,transparent)}
  </style></head><body>
  <img class="mark" src="data:image/svg+xml;base64,${mark}">
  <div class="txt"><img class="word" src="data:image/svg+xml;base64,${word}"><div class="rule"></div><div class="tag">اقرأ · استمع · صلِّ في وقتها</div></div>
  </body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(dir, 'feature-graphic-1024x500.png') });
  await ctx.close();
  await optimizePng(join(dir, 'feature-graphic-1024x500.png'));
  // icon 512×512: the 1024 store icon, downscaled, fully opaque (alpha channel kept at 255 = "32-bit PNG")
  const out = join(dir, 'icon-512.png');
  if (sharpMod) {
    await sharpMod(join(ROOT, 'store-assets/icons/icon-1024.png')).resize(512, 512, { kernel: 'lanczos3' })
      .flatten({ background: '#06100C' }).ensureAlpha(1).png({ compressionLevel: 9 }).toFile(out);
  } else {
    const c2 = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
    const p2 = await c2.newPage();
    const icon = readFileSync(join(ROOT, 'store-assets/icons/icon-1024.png')).toString('base64');
    await p2.setContent(`<!doctype html><html><body style="margin:0;background:#06100C"><img style="display:block;width:512px;height:512px" src="data:image/png;base64,${icon}"></body></html>`, { waitUntil: 'load' });
    await p2.screenshot({ path: out });
    await c2.close();
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const { chromium } = loadPlaywright();
if (!flag('no-build')) {
  console.log('▸ npm run build:app');
  execSync('npm run build:app', { cwd: ROOT, stdio: 'inherit' });
}
if (!existsSync(join(ROOT, 'dist/index.html'))) { console.error('dist/ missing — run npm run build:app (or drop --no-build)'); process.exit(1); }
const preview = flag('no-shots') ? null : await startPreview();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none'],
});
const report = [];
try {
  if (!flag('no-shots')) {
    for (const lang of LANGS) for (const device of DEVICES_WANTED) for (const screen of SCREENS) {
      if (ONLY && !ONLY.split(',').includes(screen.name)) continue;
      const rawFile = join(OUT, 'screenshots', lang, device, 'raw', `${screen.n}-${screen.name}.png`);
      const r = flag('frame-only') && existsSync(rawFile)
        ? { file: rawFile, errors: [], unknown: [], overflow: false, spinners: 0 }
        : await capture(browser, { lang, device, screen });
      const f = flag('no-framed') ? null : await frame(browser, { lang, device, screen, rawFile: r.file });
      const issues = [...r.errors, ...(r.unknown.length ? ['unmocked: ' + r.unknown.join(', ')] : []), ...(r.overflow ? ['horizontal overflow'] : []), ...(r.spinners ? [`${r.spinners} loading indicator(s) visible`] : []), ...(f && f.fit.bottom > f.fit.h ? ['framed: device cut off'] : [])];
      report.push(`${lang}/${device}/${screen.n}-${screen.name}${issues.length ? '  ⚠ ' + issues.join(' | ') : ''}`);
      console.log(report.at(-1));
    }
  }
  if (!ONLY && !flag('no-play')) { await playGraphics(browser); console.log('play/feature-graphic-1024x500.png, play/icon-512.png'); }
} finally {
  await browser.close();
  if (preview) preview.kill();
}
setTimeout(() => process.exit(0), 100);

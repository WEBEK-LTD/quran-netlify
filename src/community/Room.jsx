// Inside a room (designs 09–12): stage, shared mushaf, listeners, raise hand, mic,
// reactions incl. the directed clap, chat, host tools. Audio = LiveKit (./live.js);
// everything else goes through the API, which broadcasts it back as data packets.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { capi } from './api';
import * as live from './live';
import { toast } from './store';
import { useT, n, fmtTime, fmtDay } from './format';
import { errText } from './errors';
import { usePoll } from './hooks';
import { RIcon, Avatar, Spinner, ScopePill, Sheet, Confirm, ActionList, ErrorBox, BackButton, css as s } from './ui';
import { REACTIONS, ReactionBadge } from './Reactions';
import { RemindButton } from './cards';
import { EtiquetteList } from './Gate';
import ReportSheet from './Report';
import { surahName } from '../l10n';
import { SURAHS_META } from '../data';
import { fetchSurahAyahs } from '../api';

const STAGE = ['owner', 'moderator', 'speaker'];
const MIC_OK_KEY = 'nq_room_mic_explained';
const ayahCache = new Map();

function useSession() { return useSyncExternalStore(live.subscribe, live.getSession); }

function roleLabel(t, role) {
  return role === 'owner' ? t('المضيف') : role === 'moderator' ? t('مشرف') : role === 'speaker' ? t('متحدث') : t('مستمع');
}

// ── shared mushaf card ──────────────────────────────────────────────────────
function SharedAyah({ shared, canSet, onSet }) {
  const t = useT();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  useEffect(() => {
    if (!shared) return;
    let alive = true;
    const key = shared.surah;
    const got = ayahCache.get(key);
    const pick = (list) => { const a = (list || []).find(x => x.number === shared.ayah); if (alive) setText(a ? a.text : ''); };
    if (got) pick(got);
    else fetchSurahAyahs(key).then(list => { ayahCache.set(key, list); pick(list); }).catch(() => alive && setText(''));
    return () => { alive = false; };
  }, [shared && shared.surah, shared && shared.ayah]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shared) {
    if (!canSet) return null;
    return (
      <button type="button" className={`${s.card} ${s.cardLink}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }} onClick={onSet}>
        <RIcon name="book" style={{ color: 'var(--gold)' }} />
        <span className={s.grow}><b>{t('المصحف المشترك')}</b><span className={s.faint} style={{ display: 'block' }}>{t('اختر آية تظهر لكل من في الغرفة')}</span></span>
      </button>
    );
  }
  const ref = `${surahName(shared.surah, t.lang)} · ${t('آية {n}', { n: n(shared.ayah, t.lang) })}${shared.page ? ` · ${t('ص {n}', { n: n(shared.page, t.lang) })}` : ''}`;
  return (
    <section className={s.mushaf} aria-labelledby="mushafH">
      <div className={s.mushafIn}>
        <div className={s.mushafHead}>
          <span className={s.row} style={{ gap: 6 }}><RIcon name="book" size={18} style={{ color: 'var(--gold)' }} /><b id="mushafH">{t('المصحف المشترك')}</b><span>· {t('يحدده المضيف')}</span></span>
          <span>{ref}</span>
        </div>
        {text ? <p className={s.ayah} lang="ar">{text} <span aria-hidden="true">﴿{n(shared.ayah, 'ar')}﴾</span></p> : <p className={s.faint} style={{ textAlign: 'center' }}>{ref}</p>}
        <div className={s.mushafFoot}>
          <span className={s.faint}>{t('ظاهرة لكل من في الغرفة')}</span>
          <span className={s.row} style={{ gap: 8 }}>
            {canSet && <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={onSet}>{t('تغيير')}</button>}
            <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnOutline}`} onClick={() => navigate(`/reader?surah=${shared.surah}&ayah=${shared.ayah}`)}>{t('افتحها في مصحفي')}</button>
          </span>
        </div>
      </div>
    </section>
  );
}

// ── scheduled room (not started) ────────────────────────────────────────────
function ScheduledView({ room, reload }) {
  const t = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const owner = room.my_role === 'owner';
  async function act(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { toast(errText(t, e), 'error'); } finally { setBusy(false); }
  }
  return (
    <div className={s.page}>
      <header className={s.topbar}><BackButton to="/rooms" /><div className={s.topTitle} /></header>
      <div className={s.card} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className={s.row} style={{ gap: 6 }}><ScopePill scope={room.gender_scope} /><span className={s.pill}><RIcon name="clock" size={14} />{t('مجدولة')}</span></span>
        <h1 className={s.h1} dir="auto">{room.title}</h1>
        <p className={s.muted}>{fmtDay(room.scheduled_at, t)} · {fmtTime(room.scheduled_at, t.lang)}</p>
        {room.group && <Link className={s.faint} to={`/groups/${room.group.id}`} dir="auto">{room.group.name}</Link>}
        {room.owner && <Link className={s.row} to={`/people/${room.owner.id}`} style={{ color: 'inherit' }}><Avatar user={room.owner} size={36} /><span dir="auto">{room.owner.name}</span></Link>}
        {owner ? (
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.btnGold}`} disabled={busy} onClick={() => act(async () => { await capi.post(`/rooms/${room.id}/start`); reload(); })}>{t('ابدأ الغرفة الآن')}</button>
            <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={() => setAsk(true)}>{t('إلغاء الغرفة')}</button>
          </div>
        ) : <div><RemindButton room={room} /></div>}
      </div>
      <Confirm open={ask} danger title={t('إلغاء الغرفة؟')} body={t('سيصل تنبيه بالإلغاء لمن طلب التذكير.')} confirm={t('إلغاء الغرفة')} cancel={t('رجوع')}
        onAnswer={(ok) => { setAsk(false); if (ok) act(async () => { await capi.del(`/rooms/${room.id}`); navigate('/rooms', { replace: true }); }); }} />
    </div>
  );
}

// ── the screen ──────────────────────────────────────────────────────────────
export default function RoomScreen({ params, profile }) {
  const t = useT();
  const navigate = useNavigate();
  const id = String(params.id);
  const sess = useSession();
  const [room, setRoom] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [joinErr, setJoinErr] = useState(null);
  const [parts, setParts] = useState({ stage: [], listeners: [], listener_count: 0 });
  const [chat, setChat] = useState([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [sheet, setSheet] = useState(null);          // chat | react | more | host | person | listeners | rules | mic | report
  const [person, setPerson] = useState(null);
  const [report, setReport] = useState(null);
  const [floats, setFloats] = useState([]);
  const [hands, setHands] = useState([]);
  const [ignored, setIgnored] = useState({});
  const [ask, setAsk] = useState(null);
  const [announce, setAnnounce] = useState('');
  const lastChatId = useRef(0);
  const sheetRef = useRef(null);
  sheetRef.current = sheet;
  const meId = String(profile.user ? profile.user.id : '');
  const inThis = sess.roomId === id;
  const myRole = (inThis && sess.role) || (room && room.my_role) || 'listener';
  const isMod = myRole === 'owner' || myRole === 'moderator';
  const onStage = STAGE.includes(myRole);
  const active = inThis && (sess.status === 'connected' || sess.status === 'reconnecting');

  const loadRoom = useCallback(async () => {
    try {
      const r = await capi.get(`/rooms/${id}`);
      setRoom(r); setLoadErr(null);
      if (r.hands) setHands(r.hands);
      return r;
    } catch (e) { setLoadErr(e); return null; }
  }, [id]);
  const loadParts = useCallback(async () => {
    try { setParts(await capi.get(`/rooms/${id}/participants`)); } catch {}
  }, [id]);
  const loadChat = useCallback(async () => {
    try {
      const d = await capi.get(`/rooms/${id}/chat${lastChatId.current ? `?after_id=${lastChatId.current}` : ''}`);
      const items = d.items || [];
      if (items.length) {
        lastChatId.current = Math.max(lastChatId.current, ...items.map(x => x.id));
        setChat(c => { const seen = new Set(c.map(x => x.id)); return [...c, ...items.filter(x => !seen.has(x.id))].slice(-200); });
      }
    } catch {}
  }, [id]);

  // first load + join
  const joinNow = useCallback(async () => {
    setJoinErr(null);
    try {
      await live.join(id);
      loadParts(); loadChat(); loadRoom();
    } catch (e) {
      setJoinErr(e.code === 'connect_failed' ? { code: 'connect_failed' } : e);
    }
  }, [id, loadParts, loadChat, loadRoom]);

  useEffect(() => {
    lastChatId.current = 0;
    setChat([]); setRoom(null); setJoinErr(null);
    (async () => {
      const r = await loadRoom();
      if (r && r.status === 'open') {
        const cur = live.getSession();
        if (cur.roomId === id && (cur.status === 'connected' || cur.status === 'reconnecting')) { loadParts(); loadChat(); }
        else joinNow();
      }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  usePoll(() => { if (active) { loadParts(); } }, 15000, [active]);
  usePoll(() => { if (active) { loadRoom(); } }, 45000, [active]);

  // live data packets from the server
  const refreshSoon = useRef(null);
  useEffect(() => live.onData(({ topic, msg }) => {
    if (topic === '_reconnected') { loadRoom(); loadParts(); loadChat(); return; }
    if (topic === 'chat') {
      if (msg.id) lastChatId.current = Math.max(lastChatId.current, msg.id);
      const line = { id: msg.id, kind: msg.type === 'system' ? 'system' : 'chat', event: msg.event || null, body: msg.body, user: msg.user || null, created_at: msg.created_at };
      setChat(c => (c.some(x => x.id === line.id) ? c : [...c, line].slice(-200)));
      if (line.kind === 'chat' && sheetRef.current !== 'chat' && String(line.user && line.user.id) !== meId) setUnreadChat(u => u + 1);
      if (line.kind === 'system') { clearTimeout(refreshSoon.current); refreshSoon.current = setTimeout(loadParts, 1200); }
    } else if (topic === 'reaction') {
      const key = `${Date.now()}-${Math.random()}`;
      setFloats(f => [...f.slice(-6), { key, type: msg.type, to: msg.to ? String(msg.to.id) : null, from: msg.from }]);
      setTimeout(() => setFloats(f => f.filter(x => x.key !== key)), 3000);
      if (msg.to) setChat(c => [...c, { id: `c${key}`, kind: 'clap', from: msg.from, to: msg.to }].slice(-200));
    } else if (topic === 'page') {
      setRoom(r => (r ? { ...r, shared: { surah: msg.surah, ayah: msg.ayah, page: msg.page, updated_at: new Date().toISOString() } } : r));
    } else if (topic === 'room') {
      if (msg.type === 'role') {
        const uid = String(msg.user && msg.user.id);
        if (uid === meId) {
          live.setRole(msg.role);
          setRoom(r => (r ? { ...r, my_role: msg.role, hand_raised: false } : r));
          const text = msg.role === 'listener' ? t('أنت الآن مع المستمعين.') : msg.role === 'moderator' ? t('أصبحت مشرفاً في هذه الغرفة.') : t('أنت الآن على المنصة. افتح الميكروفون حين تريد الكلام.');
          setAnnounce(text); toast(text);
        }
        setHands(h => h.filter(x => String(x.id) !== uid));
        loadParts();
      } else if (msg.type === 'hand') {
        const u = msg.user;
        setHands(h => (msg.raised ? (h.some(x => x.id === u.id) ? h : [...h, { ...u, raised_at: new Date().toISOString() }]) : h.filter(x => x.id !== u.id)));
        if (msg.raised) setIgnored(g => ({ ...g, [u.id]: false }));
        setParts(p => ({ ...p, listeners: p.listeners.map(x => (x.id === u.id ? { ...x, hand_raised: !!msg.raised } : x)) }));
      } else if (msg.type === 'muted') {
        if (String(msg.user_id) === meId) { const tx = t('كتم المشرف الميكروفون. يمكنك فتحه مرة أخرى حين تريد الكلام.'); setAnnounce(tx); toast(tx); }
      } else if (msg.type === 'kicked') {
        if (String(msg.user_id) === meId) live.endBy('kicked');
        else setParts(p => ({ ...p, stage: p.stage.filter(x => String(x.id) !== String(msg.user_id)), listeners: p.listeners.filter(x => String(x.id) !== String(msg.user_id)) }));
      } else if (msg.type === 'updated') {
        setRoom(r => (r ? { ...r, title: msg.title ?? r.title, locked: msg.locked ?? r.locked } : r));
      } else if (msg.type === 'closed') {
        live.endBy('closed');
      }
    }
  }), [id, meId, loadParts, loadRoom, loadChat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (sheet === 'chat') setUnreadChat(0); }, [sheet]);

  const doLeave = async (quiet) => { await live.leave({ quiet }); live.reset(); navigate('/rooms', { replace: true }); };

  async function api(fn, okText) {
    try { const r = await fn(); if (okText) toast(okText); return r; }
    catch (e) {
      if (e.code === 'community_suspended' || e.code === 'rooms_banned') { live.endBy('suspended'); }
      toast(errText(t, e), 'error');
      return null;
    }
  }

  async function toggleHand() {
    const raised = !!(room && room.hand_raised);
    const r = await api(() => (raised ? capi.del(`/rooms/${id}/hand`) : capi.post(`/rooms/${id}/hand`)), raised ? t('أنزلت يدك.') : t('رفعت يدك. سيراه المضيف والمشرفون.'));
    if (r !== null) { setRoom(x => ({ ...x, hand_raised: !raised })); setParts(p => ({ ...p, listeners: p.listeners.map(x => (String(x.id) === meId ? { ...x, hand_raised: !raised } : x)) })); }
  }

  async function toggleMic() {
    if (sess.mic) { await live.setMic(false); return; }
    let explained = false;
    try { explained = localStorage.getItem(MIC_OK_KEY) === '1'; } catch {}
    if (!explained) { setSheet('mic'); return; }
    const ok = await live.setMic(true);
    if (!ok) setSheet('micDenied');
  }

  async function react(type, to) {
    const r = await (async () => {
      try { return await capi.post(`/rooms/${id}/reactions`, to ? { type, to_user_id: to.id } : { type }); }
      catch (e) {
        if (e.code === 'rate_limited' && to && (e.extra.retry_after || 0) > 2) toast(t('سقّفت لـ{name} قبل قليل. يمكنك التسقيف له مرة كل دقيقة.', { name: to.name }));
        else if (e.code === 'rate_limited') toast(t('تمهّل قليلاً بين التفاعلات.'));
        else toast(errText(t, e), 'error');
        return null;
      }
    })();
    if (r && to) toast(t('سقّفت لـ{name}', { name: to.name }));
    return r;
  }

  // ── render states ────────────────────────────────────────────────────────
  if (loadErr) {
    return <div className={s.page}><header className={s.topbar}><BackButton to="/rooms" /></header>
      <div className={s.stateCard}><span className={s.emptyIco}><RIcon name="door" size={32} /></span><h1 className={s.h2}>{loadErr.code === 'not_found' ? t('الغرفة غير موجودة') : t('تعذّر فتح الغرفة')}</h1>
        <p className={s.muted}>{loadErr.code === 'not_found' ? t('ربما أُغلقت، أو أنها ليست متاحة لك.') : errText(t, loadErr)}</p>
        <div className={s.row} style={{ justifyContent: 'center' }}>
          {loadErr.code !== 'not_found' && <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={loadRoom}>{t('أعد المحاولة')}</button>}
          <Link to="/rooms" className={`${s.btn} ${s.btnGold}`}>{t('العودة إلى الغرف')}</Link>
        </div></div></div>;
  }
  if (!room) return <Spinner />;
  if (room.status === 'scheduled') return <ScheduledView room={room} reload={loadRoom} />;

  const ended = (inThis && sess.status === 'ended') ? sess.ended : (joinErr && ['kicked', 'room_not_open'].includes(joinErr.code) ? (joinErr.code === 'kicked' ? 'kicked' : 'closed') : null);
  if (ended && ended !== 'left') {
    const map = {
      closed: [t('انتهت الغرفة'), t('أغلق المضيف الغرفة، أو انتهت لعدم وجود متحدثين. جزاكم الله خيراً.'), 'door'],
      kicked: [t('تم إخراجك من الغرفة'), t('أخرجك المضيف أو أحد المشرفين، ولا يمكنك العودة إلى هذه الغرفة.'), 'block'],
      elsewhere: [t('فتحت الغرفة من جهاز آخر'), t('يمكنك الاستماع من جهاز واحد في نفس الوقت.'), 'headphones'],
      suspended: [t('خرجت من الغرفة'), t('تم إيقاف مشاركتك في الغرف. راجع الإشعارات لمعرفة التفاصيل.'), 'lock'],
      lost: [t('انقطع الاتصال بالغرفة'), t('تحقّق من الإنترنت ثم حاول الدخول مرة أخرى.'), 'refresh'],
      error: [t('تعذّر الاتصال بخادم الصوت'), t('حاول مرة أخرى بعد قليل.'), 'refresh'],
    };
    const [h, b, ic] = map[ended] || map.lost;
    const retry = ended === 'lost' || ended === 'error' || ended === 'elsewhere';
    return <div className={s.page}><header className={s.topbar}><BackButton to="/rooms" /></header>
      <div className={s.stateCard}><span className={s.emptyIco}><RIcon name={ic} size={32} /></span><h1 className={s.h2}>{h}</h1><p className={s.muted}>{b}</p>
        <div className={s.row} style={{ justifyContent: 'center' }}>
          {retry && <button type="button" className={`${s.btn} ${s.btnGold}`} onClick={() => { live.reset(); loadRoom().then(r => { if (r && r.status === 'open') joinNow(); }); }}>{t('ادخل مرة أخرى')}</button>}
          <Link to="/rooms" className={`${s.btn} ${s.btnGhost}`} onClick={() => live.reset()}>{t('العودة إلى الغرف')}</Link>
        </div></div></div>;
  }
  if (joinErr) {
    return <div className={s.page}><header className={s.topbar}><BackButton to="/rooms" /></header>
      <div className={s.stateCard}><span className={s.emptyIco}><RIcon name={joinErr.code === 'room_locked' ? 'lock' : 'info'} size={32} /></span>
        <h1 className={s.h2} dir="auto">{room.title}</h1>
        <p className={s.muted}>{joinErr.code === 'connect_failed' ? t('تعذّر الاتصال بخادم الصوت. تحقّق من الإنترنت وحاول مرة أخرى.') : errText(t, joinErr)}</p>
        <div className={s.row} style={{ justifyContent: 'center' }}>
          {['connect_failed', 'room_full', 'network', 'timeout', 'room_locked'].includes(joinErr.code) && <button type="button" className={`${s.btn} ${s.btnGold}`} onClick={joinNow}>{t('حاول مرة أخرى')}</button>}
          <Link to="/rooms" className={`${s.btn} ${s.btnGhost}`}>{t('العودة إلى الغرف')}</Link>
        </div></div></div>;
  }

  const connecting = !active;
  const stage = parts.stage.length ? parts.stage : (room.stage || []);
  const listeners = parts.listeners;
  const listenerCount = Math.max(parts.listener_count || 0, room.listener_count || 0);
  const raisedCount = listeners.filter(x => x.hand_raised).length;
  const visibleHands = hands.filter(h => !ignored[h.id]);
  const speakingSet = new Set(sess.speaking || []);
  const floatTarget = (f) => f.to || (stage.find(p => speakingSet.has(String(p.id))) || stage[0] || {}).id;
  const LMAX = 9;
  const me = { id: meId };

  const openPerson = (p) => { setPerson(p); setSheet('person'); };

  return (
    <div className={s.roomPage}>
      <div className={`nq-sr`} aria-live="assertive">{announce}</div>
      <header className={s.field} style={{ gap: 10 }}>
        <div className={s.roomHead}>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => (room.my_role === 'owner' ? setAsk('ownerLeave') : doLeave(true))}>
            <RIcon name="leave" flip />{t('مغادرة بهدوء')}
          </button>
          <span className={`${s.pill} ${s.pillLive}`}><span className={s.liveDot} aria-hidden="true" />{t('مباشر · بلا تسجيل')}</span>
        </div>
        <h1 className={s.h1} dir="auto">{room.title}{room.locked && <RIcon name="lock" size={18} label={t('مقفلة')} style={{ marginInlineStart: 8, color: 'var(--gold)' }} />}</h1>
        <div className={s.roomMeta}>
          <ScopePill scope={room.gender_scope} />
          {room.group && <Link to={`/groups/${room.group.id}`} dir="auto" style={{ color: 'inherit' }}>{room.group.name}</Link>}
          <span className={`${s.metaLine} end`} style={{ marginInlineStart: 'auto' }}><RIcon name="headphones" size={16} />{t('{n} مستمعاً', { n: n(listenerCount, t.lang) })}</span>
        </div>
      </header>

      {sess.status === 'reconnecting' && <div className={s.reconnect} role="status"><RIcon name="refresh" size={16} />{t('جارٍ إعادة الاتصال…')}</div>}
      {connecting && sess.status !== 'reconnecting' && <div className={s.reconnect} role="status">{t('جارٍ الدخول إلى الغرفة…')}</div>}
      {sess.audioBlocked && active && (
        <button type="button" className={`${s.btn} ${s.btnGold}`} onClick={() => live.startAudio()}><RIcon name="volume" />{t('اضغط لتشغيل صوت الغرفة')}</button>
      )}

      <section aria-labelledby="spkH">
        <h2 id="spkH" className={s.secTitle}>{t('المتحدثون')}</h2>
        <ul className={s.speakers} role="list">
          {stage.map(p => {
            const pid = String(p.id);
            const speaking = speakingSet.has(pid);
            const muted = sess.muted[pid] !== false;
            const fl = floats.filter(f => String(floatTarget(f)) === pid).slice(-1)[0];
            return (
              <li key={pid}>
                <button type="button" className={`${s.spk}${speaking ? ' ' + s.speaking : ''}`} onClick={() => openPerson(p)}
                  aria-label={`${p.name} — ${roleLabel(t, p.role)}${muted ? ' — ' + t('الميكروفون مغلق') : speaking ? ' — ' + t('يتحدث الآن') : ''}`}>
                  <span className={s.spkAv}>
                    <Avatar user={p} size={66} ring={p.role === 'owner'} />
                    {muted && <span className={s.badgeMic}><RIcon name="micOff" size={14} /></span>}
                    {fl && <span className={s.floatReact} key={fl.key}><ReactionBadge type={fl.type} size={44} /></span>}
                  </span>
                  <span className={s.spkName} dir="auto">{pid === meId ? t('أنت') : p.name}</span>
                  {(p.role === 'owner' || p.role === 'moderator') && <span className={`${s.pill} ${p.role === 'owner' ? s.pillGold : s.pillGreen} ${s.rolePill}`}>{roleLabel(t, p.role)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <SharedAyah shared={room.shared} canSet={isMod && active} onSet={() => setSheet('host')} />

      <section aria-labelledby="lstH">
        <div className={s.secHead}>
          <h2 id="lstH" className={s.secTitle}>{t('المستمعون')} <span className={s.faint}>{n(listenerCount, t.lang)}</span></h2>
          {raisedCount > 0 && <span className={s.faint}>{t('{n} رفعوا أيديهم', { n: n(raisedCount, t.lang) })}</span>}
        </div>
        <ul className={s.listeners} role="list">
          {listeners.slice(0, listeners.length > LMAX + 1 ? LMAX : LMAX + 1).map(p => (
            <li key={p.id}>
              <button type="button" className={s.lst} onClick={() => openPerson(p)} aria-label={`${p.name}${p.hand_raised ? ' — ' + t('رفع يده') : ''}`}>
                <span className={s.lstAv}><Avatar user={p} size={48} />{p.hand_raised && <span className={s.smallHand}><RIcon name="hand" size={13} /></span>}</span>
                <span className={s.lstName} dir="auto">{String(p.id) === meId ? t('أنت') : p.name}</span>
              </button>
            </li>
          ))}
          {listeners.length > LMAX + 1 && (
            <li><button type="button" className={s.lst} onClick={() => setSheet('listeners')}>
              <span className={s.lstMore}>+{n(listeners.length - LMAX, t.lang)}</span><span className={s.lstName}>{t('عرض الكل')}</span>
            </button></li>
          )}
        </ul>
        {listeners.length === 0 && <p className={s.faint}>{t('لا يوجد مستمعون بعد.')}</p>}
      </section>

      {/* bottom bar */}
      <nav className={s.bar} aria-label={t('أدوات الغرفة')}>
        <div className={s.barIn}>
          {onStage ? (
            <button type="button" className={`${s.barBtn} ${sess.mic ? s.barOn : s.barPrimary}`} disabled={!active || sess.micBusy} aria-pressed={sess.mic} onClick={toggleMic}>
              <RIcon name={sess.mic ? 'mic' : 'micOff'} size={22} />{sess.mic ? t('أغلق الميكروفون') : t('افتح الميكروفون')}
            </button>
          ) : (
            <button type="button" className={`${s.barBtn} ${room.hand_raised ? s.barOn : s.barPrimary}`} disabled={!active} aria-pressed={!!room.hand_raised} onClick={toggleHand}>
              <RIcon name="hand" size={22} />{room.hand_raised ? t('أنزل يدك') : t('ارفع يدك')}
            </button>
          )}
          <button type="button" className={s.barBtn} disabled={!active} onClick={() => setSheet('react')}><RIcon name="star8" size={22} />{t('تفاعل')}</button>
          <button type="button" className={s.barBtn} onClick={() => setSheet('chat')} aria-label={unreadChat ? `${t('الشات')} — ${t('{n} رسائل جديدة', { n: n(unreadChat, t.lang) })}` : t('الشات')}>
            <RIcon name="chat" size={22} />{t('الشات')}
            {unreadChat > 0 && <span className={`${s.count} ${s.barBadge}`} aria-hidden="true">{n(Math.min(unreadChat, 99), t.lang)}</span>}
          </button>
          {isMod ? (
            <button type="button" className={s.barBtn} onClick={() => setSheet('host')}>
              <RIcon name="shield" size={22} />{t('أدوات المضيف')}
              {visibleHands.length > 0 && <span className={`${s.count} ${s.barBadge}`} aria-label={t('{n} طلبات كلام', { n: n(visibleHands.length, t.lang) })}>{n(visibleHands.length, t.lang)}</span>}
            </button>
          ) : (
            <button type="button" className={s.barBtn} onClick={() => setSheet('more')}><RIcon name="dots" size={22} />{t('المزيد')}</button>
          )}
        </div>
      </nav>

      {/* sheets */}
      <ChatSheet open={sheet === 'chat'} onClose={() => setSheet(null)} roomId={id} room={room} chat={chat} meId={meId} active={active}
        onSent={(line) => setChat(c => (c.some(x => x.id === line.id) ? c : [...c, line]))}
        onError={(e) => { if (e.code === 'community_suspended' || e.code === 'rooms_banned') live.endBy('suspended'); }}
        onReport={(line) => { setReport([{ type: 'room_message', id: line.id, preview: line.body, context: `${line.user ? line.user.name : ''} · ${room.title}` }, line.user && { type: 'user', id: line.user.id }, { type: 'room', id: room.id }]); setSheet('report'); }} />

      <Sheet open={sheet === 'react'} onClose={() => setSheet(null)} title={t('تفاعل')} sub={t('يظهر تفاعلك فوق صورة من يتكلم الآن لثوانٍ. للسقفة الموجّهة اضغط على أحد المتحدثين.')}>
        <div className={s.reacts}>
          {REACTIONS.map(r => (
            <button key={r.type} type="button" className={s.reactBtn} onClick={() => { setSheet(null); react(r.type); }}>
              <ReactionBadge type={r.type} size={64} /><span>{t(r.label)}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={t('المزيد')}>
        <ActionList items={[
          { icon: 'arrowDown', label: t('النزول للمستمعين'), hidden: !(myRole === 'speaker'), onClick: () => { setSheet(null); api(() => capi.del(`/rooms/${id}/speakers/${meId}`)); } },
          { icon: 'leave', label: t('مغادرة الغرفة'), sub: t('يظهر في الشات أنك غادرت'), onClick: () => { setSheet(null); doLeave(false); } },
          { icon: 'leave', label: t('مغادرة بهدوء'), sub: t('بلا أي إشارة في الشات'), onClick: () => { setSheet(null); doLeave(true); } },
          { icon: 'book', label: t('آداب الغرف'), onClick: () => setSheet('rules') },
          { icon: 'flag', label: t('إبلاغ عن الغرفة'), danger: true, onClick: () => { setReport([{ type: 'room', id: room.id, preview: room.title }]); setSheet('report'); } },
        ]} />
      </Sheet>

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title={t('آداب الغرف')}><EtiquetteList /></Sheet>

      <Sheet open={sheet === 'listeners'} onClose={() => setSheet(null)} title={t('المستمعون')} sub={t('{n} مستمعاً', { n: n(listenerCount, t.lang) })} tall>
        <ul className={s.list} style={{ gap: 0 }}>
          {listeners.map(p => (
            <li key={p.id} className={s.personRow}>
              <button type="button" className={s.personBtn} onClick={() => openPerson(p)}>
                <Avatar user={p} size={40} /><span className={s.grow}><b dir="auto">{String(p.id) === meId ? t('أنت') : p.name}</b>{p.hand_raised && <small>{t('رفع يده')}</small>}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <PersonSheet open={sheet === 'person'} person={person} myRole={myRole} meId={meId} roomId={id} muted={person ? sess.muted[String(person.id)] !== false : true}
        onClose={() => setSheet(null)} api={api} react={react} loadParts={loadParts}
        onReport={(p) => { setReport([{ type: 'user', id: p.id, preview: p.name }, p.avatar_url && { type: 'photo', id: p.id }]); setSheet('report'); }}
        onAsk={(a) => setAsk(a)} />

      {isMod && (
        <HostSheet open={sheet === 'host'} onClose={() => setSheet(null)} room={room} myRole={myRole} roomId={id} hands={visibleHands}
          onIgnore={(uid) => setIgnored(g => ({ ...g, [uid]: true }))} api={api} setRoom={setRoom} loadParts={loadParts}
          onMore={() => setSheet('more')} onClose2={() => setAsk('close')} />
      )}

      <Sheet open={sheet === 'mic'} onClose={() => setSheet(null)} title={t('الميكروفون')}>
        <p className={s.muted}>{t('سيطلب التطبيق إذن استخدام الميكروفون. يُستخدم فقط وأنت على المنصة ويمكنك إغلاقه في أي وقت. الصوت مباشر ولا يُسجَّل.')}</p>
        <div className={s.rowEnd}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setSheet(null)}>{t('ليس الآن')}</button>
          <button type="button" data-autofocus className={`${s.btn} ${s.btnGold}`} onClick={async () => {
            try { localStorage.setItem(MIC_OK_KEY, '1'); } catch {}
            setSheet(null);
            const ok = await live.setMic(true);
            if (!ok) setSheet('micDenied');
          }}>{t('متابعة')}</button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'micDenied'} onClose={() => setSheet(null)} title={t('الميكروفون غير متاح')}>
        <p className={s.muted}>{sess.micError === 'denied'
          ? t('لم يُسمح للتطبيق باستخدام الميكروفون. اسمح به من إعدادات الجهاز (التطبيقات ← نور القرآن ← الأذونات) ثم حاول مرة أخرى. يمكنك متابعة الاستماع كالمعتاد.')
          : t('تعذّر تشغيل الميكروفون. تأكد أن تطبيقاً آخر لا يستخدمه ثم حاول مرة أخرى.')}</p>
        <div className={s.rowEnd}><button type="button" className={`${s.btn} ${s.btnGold}`} onClick={() => setSheet(null)}>{t('حسناً')}</button></div>
      </Sheet>

      <ReportSheet open={sheet === 'report'} targets={report} onClose={() => setSheet(null)} />

      <Confirm open={ask === 'ownerLeave'} title={t('مغادرة الغرفة؟')}
        body={t('ستبقى الغرفة مفتوحة، وتُغلق تلقائياً إن لم يبقَ أحد على المنصة ١٠ دقائق. لإغلاقها للجميع استخدم أدوات المضيف.')}
        confirm={t('مغادرة بهدوء')} cancel={t('البقاء')} onAnswer={(ok) => { setAsk(null); if (ok) doLeave(true); }} />
      <Confirm open={ask === 'close'} danger title={t('إغلاق الغرفة للجميع؟')} body={t('سيخرج الجميع ويُحذف الشات.')} confirm={t('إغلاق الغرفة')} cancel={t('رجوع')}
        onAnswer={async (ok) => { setAsk(null); if (ok) { const r = await api(() => capi.del(`/rooms/${id}`)); if (r !== null) { await live.endBy('closed'); live.reset(); navigate('/rooms', { replace: true }); } } }} />
      <Confirm open={!!(ask && ask.kick)} danger title={t('إخراج {name}؟', { name: ask && ask.kick ? ask.kick.name : '' })} body={t('سيخرج من الغرفة ولن يستطيع العودة إليها.')} confirm={t('إخراج')} cancel={t('رجوع')}
        onAnswer={async (ok) => { const p = ask.kick; setAsk(null); if (ok) { await api(() => capi.post(`/rooms/${id}/participants/${p.id}/kick`), t('تم إخراج {name}.', { name: p.name })); loadParts(); } }} />
    </div>
  );
}

// ── chat sheet (design 10) ──────────────────────────────────────────────────
function ChatSheet({ open, onClose, roomId, chat, meId, active, onSent, onError, onReport }) {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const endRef = useRef(null);
  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [open, chat.length]);
  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const line = await capi.post(`/rooms/${roomId}/chat`, { body });
      onSent(line); setText('');
    } catch (err) { toast(errText(t, err), 'error'); onError(err); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={() => { setSel(null); onClose(); }} title={t('شات الغرفة')} sub={<><RIcon name="clock" size={15} />{t('يُحذف الشات عند إغلاق الغرفة')}</>} tall
      footer={
        <form className={s.composer} onSubmit={send}>
          <label className="nq-sr" htmlFor="roomChatIn">{t('اكتب رسالة للغرفة…')}</label>
          <textarea id="roomChatIn" className={s.textarea} rows={1} value={text} maxLength={500} dir="auto" disabled={!active}
            onChange={e => setText(e.target.value)} placeholder={t('اكتب رسالة للغرفة…')}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
          <button type="submit" className={s.sendBtn} disabled={!text.trim() || busy || !active} aria-label={t('إرسال')}><RIcon name="send" size={22} /></button>
        </form>
      }>
      <ol className={s.chatList} role="log" aria-live="polite" aria-relevant="additions" aria-label={t('رسائل الغرفة')}>
        {chat.length === 0 && <li className={s.faint} style={{ textAlign: 'center' }}>{t('لا رسائل بعد. ابدأ بالسلام.')}</li>}
        {chat.map(m => {
          if (m.kind === 'clap') {
            return <li key={m.id} className={s.sysWrap}><span className={s.sys}><RIcon name="star8" size={15} style={{ color: 'var(--gold)' }} /><span>{t('{a} سقّف لـ{b}', { a: m.from.name, b: m.to.name })}</span></span></li>;
          }
          if (m.kind === 'system') {
            const name = String(m.body || '').replace(/^(انضم|غادر)\s+/, '');
            const txt = m.event === 'join' ? t('انضم {name}', { name }) : m.event === 'leave' ? t('غادر {name}', { name }) : m.body;
            return <li key={m.id} className={s.sysWrap}><span className={s.sys} dir="auto">{txt}</span></li>;
          }
          const mine = m.user && String(m.user.id) === meId;
          const role = m.user && m.user.role;
          return (
            <li key={m.id} className={s.msg}>
              <Avatar user={m.user} size={36} />
              <div style={{ minWidth: 0 }}>
                <div className={s.msgName}><span dir="auto" style={role === 'owner' || role === 'moderator' ? { color: 'var(--emerald)' } : undefined}>{mine ? t('أنت') : (m.user ? m.user.name : '')}</span>
                  {role && role !== 'listener' && <span className={s.faint}>· {roleLabel(t, role)}</span>}</div>
                <button type="button" className={`${s.bubble}${sel === m.id ? ' ' + s.bubbleSel : ''}`} dir="auto" aria-expanded={sel === m.id} onClick={() => setSel(sel === m.id ? null : m.id)}>{m.body}</button>
                {sel === m.id && (
                  <div className={s.row} style={{ marginTop: 6 }}>
                    <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => { try { navigator.clipboard.writeText(m.body); toast(t('نُسخت الرسالة.')); } catch {} setSel(null); }}><RIcon name="copy" size={16} />{t('نسخ')}</button>
                    {!mine && <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnDanger}`} onClick={() => { setSel(null); onReport(m); }}><RIcon name="flag" size={16} />{t('إبلاغ عن الرسالة')}</button>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        <li ref={endRef} aria-hidden="true" />
      </ol>
    </Sheet>
  );
}

// ── one participant (tap on an avatar) ──────────────────────────────────────
function PersonSheet({ open, person, myRole, meId, roomId, muted, onClose, api, react, loadParts, onReport, onAsk }) {
  const t = useT();
  const navigate = useNavigate();
  if (!open || !person) return null;
  const pid = String(person.id);
  const isMe = pid === meId;
  const role = person.role || 'listener';
  const onStage = STAGE.includes(role);
  const isOwner = myRole === 'owner';
  const isMod = isOwner || myRole === 'moderator';
  const canAct = isMod && !isMe && role !== 'owner' && (isOwner || role !== 'moderator');
  const close = () => onClose();
  const run = async (fn, ok) => { close(); await api(fn, ok); loadParts(); };
  return (
    <Sheet open={open} onClose={close} title={isMe ? t('أنت') : person.name} sub={`${roleLabel(t, role)}${onStage ? ' · ' + (muted ? t('الميكروفون مغلق') : t('الميكروفون مفتوح')) : ''}`}>
      <ActionList items={[
        { icon: 'clap', gold: true, label: t('سقّف لـ{name}', { name: person.name }), hidden: isMe || !onStage, onClick: () => { close(); react('clap', person); } },
        { icon: 'arrowUp', label: t('رفع متحدثاً'), hidden: !(canAct && role === 'listener'), onClick: () => run(() => capi.post(`/rooms/${roomId}/speakers/${pid}`), t('دُعي {name} للتحدث.', { name: person.name })) },
        { icon: 'micOff', label: t('كتم الميكروفون'), hidden: !(canAct && onStage && !muted), onClick: () => run(() => capi.post(`/rooms/${roomId}/participants/${pid}/mute`), t('تم كتم الميكروفون.')) },
        { icon: 'shieldCheck', label: t('تعيين مشرفاً للغرفة'), hidden: !(isOwner && !isMe && (role === 'speaker' || role === 'listener')), onClick: () => run(() => capi.post(`/rooms/${roomId}/moderators/${pid}`), t('أصبح {name} مشرفاً.', { name: person.name })) },
        { icon: 'shield', label: t('إلغاء الإشراف'), hidden: !(isOwner && role === 'moderator'), onClick: () => run(() => capi.del(`/rooms/${roomId}/moderators/${pid}`)) },
        { icon: 'arrowDown', label: t('إنزال للمستمعين'), hidden: !(canAct && onStage), onClick: () => run(() => capi.del(`/rooms/${roomId}/speakers/${pid}`)) },
        { icon: 'arrowDown', label: t('النزول للمستمعين'), hidden: !(isMe && onStage && role !== 'owner'), onClick: () => run(() => capi.del(`/rooms/${roomId}/speakers/${pid}`)) },
        { icon: 'user', label: t('عرض البروفايل'), onClick: () => { close(); navigate(`/people/${isMe ? 'me' : pid}`); } },
        { icon: 'xCircle', danger: true, label: t('إخراج من الغرفة'), hidden: !canAct, onClick: () => { close(); onAsk({ kick: person }); } },
        { icon: 'flag', danger: true, label: t('إبلاغ'), hidden: isMe, onClick: () => onReport(person) },
      ]} />
    </Sheet>
  );
}

// ── host tools (design 11) ──────────────────────────────────────────────────
function HostSheet({ open, onClose, room, myRole, roomId, hands, onIgnore, api, setRoom, loadParts, onMore, onClose2 }) {
  const t = useT();
  const isOwner = myRole === 'owner';
  const [title, setTitle] = useState(room.title);
  const [surah, setSurah] = useState(room.shared ? room.shared.surah : 1);
  const [ayah, setAyah] = useState(room.shared ? room.shared.ayah : 1);
  useEffect(() => { if (open) { setTitle(room.title); if (room.shared) { setSurah(room.shared.surah); setAyah(room.shared.ayah); } } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxAyah = (SURAHS_META[surah - 1] || [])[2] || 7;
  const surahs = useMemo(() => SURAHS_META.map((m, i) => ({ v: i + 1, l: `${n(i + 1, t.lang)} · ${surahName(i + 1, t.lang)}` })), [t.lang]);
  return (
    <Sheet open={open} onClose={onClose} title={t('أدوات المضيف')} sub={isOwner ? t('أنت مضيف هذه الغرفة · المشرفون يرون نفس أدوات المشاركين') : t('أنت مشرف في هذه الغرفة')} tall>
      <section aria-labelledby="handsH" className={s.field}>
        <div className={s.secHead}><h3 id="handsH" className={s.secTitle}>{t('طلبات الكلام')}</h3><span className={s.faint}>{t('{n} رفعوا أيديهم', { n: n(hands.length, t.lang) })}</span></div>
        {hands.length === 0 ? <p className={s.faint}>{t('لا توجد طلبات الآن. اضغط على أي مستمع لدعوته للتحدث.')}</p> : (
          <ul className={s.list} style={{ gap: 8 }}>
            {hands.map(h => (
              <li key={h.id} className={s.card} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
                <Avatar user={h} size={44} /><b className={s.grow} dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</b>
                <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => onIgnore(h.id)}>{t('تجاهل')}</button>
                <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={async () => { onIgnore(h.id); await api(() => capi.post(`/rooms/${roomId}/speakers/${h.id}`), t('دُعي {name} للتحدث.', { name: h.name })); loadParts(); }}>{t('رفع متحدثاً')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.card} aria-labelledby="setH" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 id="setH" className={s.secTitle}>{t('إعدادات الغرفة')}</h3>
        {isOwner && (
          <label className={s.field}><span className={s.faint}>{t('عنوان الغرفة')}</span>
            <span className={s.composer}>
              <input className={s.input} value={title} maxLength={60} dir="auto" onChange={e => setTitle(e.target.value)} />
              <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} disabled={title.trim().length < 3 || title.trim() === room.title}
                onClick={async () => { const r = await api(() => capi.patch(`/rooms/${roomId}`, { title: title.trim() }), t('تم حفظ العنوان.')); if (r) setRoom(x => ({ ...x, title: r.title })); }}>{t('حفظ')}</button>
            </span>
          </label>
        )}
        <div className={s.field}>
          <span className={s.faint}>{t('المصحف المشترك — الآية الظاهرة للجميع')}</span>
          <div className={s.grid2} style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
            <span className={s.selectWrap}>
              <select className={s.select} aria-label={t('السورة')} value={surah} onChange={e => { setSurah(+e.target.value); setAyah(1); }}>
                {surahs.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select><RIcon name="chevD" size={16} />
            </span>
            <span className={s.seg} style={{ gridAutoColumns: 'auto minmax(0,1fr) auto', padding: 3 }} role="group" aria-label={t('الآية')}>
              <button type="button" aria-label={t('الآية التالية')} onClick={() => setAyah(a => Math.min(maxAyah, a + 1))}><RIcon name="plus" size={18} /></button>
              <span style={{ display: 'grid', placeItems: 'center', fontWeight: 600 }} aria-live="polite">{t('آية {n}', { n: n(ayah, t.lang) })}</span>
              <button type="button" aria-label={t('الآية السابقة')} onClick={() => setAyah(a => Math.max(1, a - 1))}><RIcon name="minus" size={18} /></button>
            </span>
          </div>
          <button type="button" className={`${s.btn} ${s.btnOutline} ${s.btnBlock}`}
            onClick={async () => { const r = await api(() => capi.put(`/rooms/${roomId}/page`, { surah, ayah }), t('ظهرت الآية لكل من في الغرفة.')); if (r) setRoom(x => ({ ...x, shared: r })); }}>{t('اعرضها للجميع')}</button>
        </div>
        {isOwner && (
          <div className={s.setRow} style={{ borderTop: 'var(--bw) solid var(--line)', borderBottom: 0, paddingBottom: 0 }}>
            <span className={s.row} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><RIcon name="lock" style={{ color: 'var(--gold)', marginTop: 3 }} /><span><b id="lockL">{t('قفل الغرفة')}</b><small>{t('لا يدخل أحد جديد، ويبقى الموجودون')}</small></span></span>
            <button type="button" role="switch" aria-labelledby="lockL" aria-checked={!!room.locked} className={`${s.toggle}${room.locked ? ' ' + s.toggleOn : ''}`}
              onClick={async () => { const r = await api(() => capi.patch(`/rooms/${roomId}`, { locked: !room.locked })); if (r) setRoom(x => ({ ...x, locked: r.locked })); }}>
              <span className={s.knob} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnBlock}`} onClick={onMore}><RIcon name="dots" />{t('المزيد')}</button>
      {isOwner && <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnBlock}`} onClick={() => { onClose(); onClose2(); }}><RIcon name="xCircle" />{t('إغلاق الغرفة للجميع')}</button>}
    </Sheet>
  );
}

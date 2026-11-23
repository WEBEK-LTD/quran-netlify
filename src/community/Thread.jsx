// A private conversation (design 17). Text only; deleting a message or the whole
// conversation removes it for both sides. /messages/new?user=ID starts one.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { capi } from './api';
import { toast } from './store';
import { useT, fmtTime, fmtDay } from './format';
import { errText } from './errors';
import { usePoll } from './hooks';
import { RIcon, Avatar, Spinner, Sheet, Confirm, ActionList, ErrorBox, BackButton, css as s } from './ui';
import ReportSheet from './Report';

export default function Thread({ params }) {
  const t = useT();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const isNew = params.id === 'new';
  const newUser = sp.get('user');
  const convId = isNew ? null : params.id;
  const [conv, setConv] = useState(null);
  const [other, setOther] = useState(null);
  const [items, setItems] = useState([]);
  const [canSend, setCanSend] = useState(true);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(null);
  const [ask, setAsk] = useState(null);
  const lastId = useRef(0);
  const endRef = useRef(null);
  const stick = useRef(true);

  const markRead = useCallback((id) => { if (convId && id) capi.post(`/me/conversations/${convId}/read`, { last_id: id }).catch(() => {}); }, [convId]);

  const loadAll = useCallback(async () => {
    if (isNew) {
      try { setOther(await capi.get(`/people/${newUser}`)); setErr(null); } catch (e) { setErr(e); }
      setLoading(false);
      return;
    }
    try {
      const d = await capi.get(`/me/conversations/${convId}/messages?limit=50`);
      setConv(d.conversation); setOther(d.conversation.other); setItems(d.items); setCanSend(d.can_send); setErr(null);
      setHasOlder(d.items.length >= 50);
      const mx = d.items.length ? d.items[d.items.length - 1].id : 0;
      lastId.current = mx;
      if (mx) markRead(mx);
    } catch (e) { setErr(e); }
    setLoading(false);
  }, [isNew, newUser, convId, markRead]);

  useEffect(() => { setLoading(true); setItems([]); lastId.current = 0; loadAll(); }, [loadAll]);

  // new messages every 4 s; a full refresh every 30 s catches deletions and read marks
  const tick = useRef(0);
  usePoll(async () => {
    if (isNew || loading || err) return;
    tick.current += 1;
    if (tick.current % 8 === 0) { await loadAll(); return; }
    const d = await capi.get(`/me/conversations/${convId}/messages?after_id=${lastId.current}&limit=100`);
    setCanSend(d.can_send);
    setConv(d.conversation);
    if (d.items.length) {
      lastId.current = d.items[d.items.length - 1].id;
      setItems(list => { const seen = new Set(list.map(x => x.id)); return [...list, ...d.items.filter(x => !seen.has(x.id))]; });
      markRead(lastId.current);
    }
  }, 4000, [convId, isNew, loading, err]);

  useEffect(() => { if (stick.current && endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [items.length]);

  async function older() {
    if (!items.length) return;
    try {
      const d = await capi.get(`/me/conversations/${convId}/messages?before_id=${items[0].id}&limit=50`);
      stick.current = false;
      setItems(list => [...d.items, ...list]); setHasOlder(d.items.length >= 50);
    } catch (e) { toast(errText(t, e), 'error'); }
  }

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      if (isNew) {
        const r = await capi.post('/me/conversations', { user_id: Number(newUser), body });
        setText('');
        navigate(`/messages/${r.conversation_id}`, { replace: true });
        return;
      }
      const r = await capi.post(`/me/conversations/${convId}/messages`, { body });
      stick.current = true;
      setItems(list => (list.some(x => x.id === r.message.id) ? list : [...list, r.message]));
      lastId.current = Math.max(lastId.current, r.message.id);
      setText('');
    } catch (e2) {
      toast(errText(t, e2), 'error');
      if (e2.code === 'minor_restricted' || e2.code === 'dm_not_allowed') setCanSend(false);
    } finally { setBusy(false); }
  }

  async function delMsg(m) {
    setSel(null);
    try { await capi.del(`/me/conversations/${convId}/messages/${m.id}`); setItems(list => list.filter(x => x.id !== m.id)); }
    catch (e) { toast(errText(t, e), 'error'); }
  }

  if (loading) return <Spinner />;
  if (err) {
    return <div className={s.page}><header className={s.topbar}><BackButton to="/messages" /></header>
      <ErrorBox text={err.code === 'not_found' ? t('هذه المحادثة لم تعد متاحة.') : errText(t, err)} onRetry={err.code === 'not_found' ? null : loadAll} /></div>;
  }

  const myLast = [...items].reverse().find(m => m.from_me);
  const blockedNew = isNew && other && !other.can_message;
  let lastDay = '';

  return (
    <div className={s.thread}>
      <header className={s.threadHead}>
        <BackButton to="/messages" />
        <Link to={`/people/${other ? other.id : ''}`} className={s.threadWho}>
          <Avatar user={other} size={44} />
          <span style={{ minWidth: 0 }}><b dir="auto">{other ? other.name : ''}</b><small>{t('رسائل نصية فقط')}</small></span>
        </Link>
        {!isNew && <button type="button" className={s.iconBtn} aria-label={t('خيارات المحادثة')} aria-expanded={menu} onClick={() => setMenu(true)}><RIcon name="dotsV" /></button>}
      </header>

      <div className={s.threadBody}>
        {hasOlder && <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} style={{ alignSelf: 'center' }} onClick={older}>{t('رسائل أقدم')}</button>}
        {items.length === 0 && <p className={s.faint} style={{ textAlign: 'center', marginTop: '20vh' }}>{isNew ? t('اكتب رسالتك الأولى بأدب. الرسائل نصية فقط.') : t('لا رسائل بعد.')}</p>}
        <ol className={s.list} style={{ gap: 10 }} role="log" aria-live="polite" aria-relevant="additions" aria-label={t('الرسائل')}>
          {items.map(m => {
            const day = fmtDay(m.created_at, t);
            const showDay = day !== lastDay; lastDay = day;
            return (
              <li key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                {showDay && <span className={s.sysWrap}><span className={s.sys}>{day}</span></span>}
                <div className={m.from_me ? s.dmWrapMine : s.dmWrapTheirs}>
                  <button type="button" className={`${s.dm} ${m.from_me ? s.dmMine : s.dmTheirs}${sel === m.id ? ' ' + s.dmSel : ''}`} dir="auto" aria-expanded={sel === m.id} onClick={() => setSel(sel === m.id ? null : m.id)}>
                    {m.body}
                    <small>{fmtTime(m.created_at, t.lang)}{m.from_me && myLast && m.id === myLast.id && conv && conv.other_read_id >= m.id ? ` · ${t('قُرئت')}` : ''}</small>
                  </button>
                  {sel === m.id && (
                    <div className={s.dmActs}>
                      <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => { try { navigator.clipboard.writeText(m.body); toast(t('نُسخت الرسالة.')); } catch {} setSel(null); }}>{t('نسخ')}</button>
                      <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnDanger}`} onClick={() => delMsg(m)}>{t('حذف — يُحذف عند الطرفين')}</button>
                      {!m.from_me && <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => { setSel(null); setReport([{ type: 'dm_message', id: m.id, preview: m.body, context: other ? other.name : '' }, other && { type: 'user', id: other.id }]); }}><RIcon name="flag" size={16} />{t('إبلاغ')}</button>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={endRef} />
      </div>

      <footer className={s.threadFoot}>
        {(!canSend || blockedNew) ? (
          <p className={s.note} style={{ justifyContent: 'center' }}><RIcon name="lock" size={16} />{t('لا يمكنك المراسلة في هذه المحادثة الآن.')}</p>
        ) : (
          <form className={s.composer} onSubmit={send}>
            <label className="nq-sr" htmlFor="dmIn">{t('اكتب رسالة…')}</label>
            <textarea id="dmIn" className={s.textarea} rows={1} value={text} maxLength={2000} dir="auto" onChange={e => setText(e.target.value)} placeholder={t('اكتب رسالة…')} />
            <button type="submit" className={s.sendBtn} disabled={!text.trim() || busy} aria-label={t('إرسال')}><RIcon name="send" size={22} /></button>
          </form>
        )}
        <p className={s.footNote}>{t('رسائل نصية فقط · لا صور ولا ملفات')}</p>
      </footer>

      <Sheet open={menu} onClose={() => setMenu(false)} title={other ? other.name : ''}>
        <ActionList items={[
          { icon: 'trash', label: t('حذف المحادثة'), sub: t('يُحذف عند الطرفين'), onClick: () => { setMenu(false); setAsk('delete'); } },
          { icon: 'flag', label: t('إبلاغ'), onClick: () => { setMenu(false); setReport([{ type: 'user', id: other.id, preview: other.name }]); } },
          { icon: 'block', danger: true, label: t('حظر {name}', { name: other ? other.name : '' }), onClick: () => { setMenu(false); setAsk('block'); } },
        ]} />
      </Sheet>
      <ReportSheet open={!!report} targets={report} onClose={() => setReport(null)} />
      <Confirm open={ask === 'delete'} danger title={t('حذف المحادثة؟')} body={t('ستُحذف المحادثة كلها عندك وعند {name}.', { name: other ? other.name : '' })} confirm={t('حذف')} cancel={t('رجوع')}
        onAnswer={async (ok) => { setAsk(null); if (ok) { try { await capi.del(`/me/conversations/${convId}`); navigate('/messages', { replace: true }); } catch (e) { toast(errText(t, e), 'error'); } } }} />
      <Confirm open={ask === 'block'} danger title={t('حظر {name}؟', { name: other ? other.name : '' })} body={t('تُلغى الصداقة والمتابعة بينكما، ولن يرى أحدكما بروفايل الآخر أو رسائله أو غرفه.')} confirm={t('حظر')} cancel={t('رجوع')}
        onAnswer={async (ok) => { setAsk(null); if (ok) { try { await capi.post(`/people/${other.id}/block`); toast(t('تم الحظر.')); navigate('/messages', { replace: true }); } catch (e) { toast(errText(t, e), 'error'); } } }} />
    </div>
  );
}

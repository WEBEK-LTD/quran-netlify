// Support (الدعم): ticket list with filters + polling, conversation with reply and status changes.
import { useState, useEffect, useRef, useCallback } from 'react';
import { listTickets, getTicketMessages, replyToTicket, setTicketStatus } from '../../adminApi';
import { Icon, Badge8 } from '../../components/ornaments/Ornaments';
import {
  styles, errMsg, useLoader, useInterval, TabHeader, Pill, Ico, FormError, ErrorLine, Empty,
  Pagination, PageLoader, fmtTime, timeAgo,
} from './shared';

const TICKET_STATUS = {
  open:    { label: 'مفتوح',        tone: 'warn' },
  pending: { label: 'قيد المعالجة', tone: 'info' },
  closed:  { label: 'مغلق',         tone: 'ok' },
};
const TICKETS_PER_PAGE = 30;
const FILTERS = [['', 'الكل'], ['open', 'مفتوح'], ['pending', 'قيد المعالجة'], ['closed', 'مغلق']];

export default function SupportTab({ onRead, unread }) {
  const [status, setStatus] = useState('');
  const [page,   setPage]   = useState(1);
  const list = useLoader(() => listTickets({ status, page, perPage: TICKETS_PER_PAGE }), [status, page]);
  useInterval(() => list.reload({ silent: true }), 30_000);
  const [active, setActive] = useState(null);

  const tickets = list.data?.items || [];

  const mergeTicket = useCallback((t) => {
    if (!t || t.id == null) return;
    list.setData(d => d ? { ...d, items: (d.items || []).map(x => x.id === t.id ? { ...x, ...t } : x) } : d);
    setActive(a => (a && a.id === t.id ? { ...a, ...t } : a));
  }, [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRead = useCallback((ticketId) => {
    list.setData(d => d ? { ...d, items: (d.items || []).map(x => x.id === ticketId ? { ...x, unread: 0 } : x) } : d);
    onRead && onRead();
  }, [list.setData, onRead]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${styles.tabContent} ${styles.supportTab}`}>
      <TabHeader icon="chat" title="الدعم"
        sub={unread > 0 ? `${unread} رسالة غير مقروءة · تتحدّث المحادثة كل ٥ ثوانٍ` : 'رسائل الأعضاء وتذاكرهم، وتتحدّث المحادثة كل ٥ ثوانٍ'} live/>
      <div className={`nq-card ${styles.supportShell} ${active ? styles.hasThread : ''}`}>
        <div className={styles.ticketPane}>
          <div className={styles.ticketPaneHead}>
            <span className={styles.ticketPaneTitle}><Icon name="list"/>تذاكر الدعم</span>
            <span className={`${styles.countPill} nq-num`}>{list.data ? list.data.total ?? tickets.length : '…'}</span>
          </div>
          <div className={styles.ticketFilters} role="group" aria-label="تصفية التذاكر">
            {FILTERS.map(([v, l]) => (
              <button key={v || 'all'} type="button" aria-pressed={status === v}
                className={`nq-pill ${status === v ? 'on' : ''} ${styles.filterPill}`}
                onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
            ))}
          </div>
          <div className={styles.ticketItems}>
            {list.loading && !list.data && <PageLoader/>}
            {list.error && <ErrorLine message={list.error} onRetry={() => list.reload()}/>}
            {list.data && tickets.length === 0 && <Empty icon="chat" text="لا توجد تذاكر"/>}
            {tickets.map(t => {
              const st = TICKET_STATUS[t.status];
              return (
                <button key={t.id} type="button"
                  className={`${styles.ticketItem} ${active?.id === t.id ? styles.ticketItemA : ''} ${t.unread > 0 ? styles.ticketUnread : ''}`}
                  aria-current={active?.id === t.id ? 'true' : undefined}
                  onClick={() => setActive(t)}>
                  <div className={styles.ticketRow}>
                    <span className={styles.ticketSubj}>{t.subject || 'استفسار'}</span>
                    {t.unread > 0 && <span className={styles.countBadge} aria-label={`${t.unread} غير مقروءة`}>{t.unread}</span>}
                  </div>
                  <div className={styles.ticketEmail}>{t.user?.name ? `${t.user.name} · ` : ''}<bdi>{t.user?.email || '—'}</bdi></div>
                  <div className={styles.ticketRow}>
                    <Pill tone={st?.tone || 'muted'}>{st?.label || t.status}</Pill>
                    <span className={styles.ticketDate}>{timeAgo(t.updated_at)}{t.message_count ? ` · ${t.message_count} رسالة` : ''}</span>
                  </div>
                </button>
              );
            })}
            <Pagination page={page} perPage={list.data?.per_page || TICKETS_PER_PAGE} total={list.data?.total || 0} onPage={setPage} compact/>
          </div>
        </div>

        <div className={styles.chatPane}>
          {!active ? (
            <div className={styles.noChat}>
              <Badge8 icon="chat" size={72}/>
              <p>اختر تذكرة لعرض المحادثة</p>
            </div>
          ) : (
            <TicketThread key={active.id} ticket={active}
              onClose={() => setActive(null)} onTicketUpdate={mergeTicket} onRead={handleRead}/>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketThread({ ticket, onClose, onTicketUpdate, onRead }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [sendErr,  setSendErr]  = useState(null);
  const [statusBusy, setStatusBusy] = useState(null);
  const [statusErr,  setStatusErr]  = useState(null);
  const listRef = useRef(null);
  const lastIdRef = useRef(null);
  const polling = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const append = useCallback((list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const merged = prev.concat(list.filter(m => !seen.has(m.id)));
      if (merged.length) lastIdRef.current = merged[merged.length - 1].id;
      return merged;
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await getTicketMessages(ticket.id);
      if (!alive.current) return;
      const arr = Array.isArray(list) ? list : [];
      lastIdRef.current = arr.length ? arr[arr.length - 1].id : null;
      setMessages(arr);
      onRead && onRead(ticket.id);
    } catch (e) {
      if (alive.current) setError(errMsg(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [ticket.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  const poll = useCallback(async () => {
    if (polling.current || loading || error) return;
    polling.current = true;
    try {
      const list = await getTicketMessages(ticket.id, lastIdRef.current ?? undefined);
      if (alive.current && Array.isArray(list) && list.length) { append(list); onRead && onRead(ticket.id); }
    } catch { /* transient; next poll retries */ }
    finally { polling.current = false; }
  }, [ticket.id, loading, error, append]); // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(poll, 5_000);

  // keep the newest message in view (scroll the list itself, never the page)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setSending(true); setSendErr(null);
    try {
      const msg = await replyToTicket(ticket.id, body);
      if (msg && msg.id != null) append([msg]);
      setInput('');
    } catch (err) {
      setSendErr(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(k) {
    if (k === ticket.status) return;
    setStatusBusy(k); setStatusErr(null);
    try {
      const t = await setTicketStatus(ticket.id, k);
      onTicketUpdate(t && t.id != null ? t : { id: ticket.id, status: k });
    } catch (err) {
      setStatusErr(errMsg(err));
    } finally {
      setStatusBusy(null);
    }
  }

  const closed = ticket.status === 'closed';
  const userLabel = ticket.user?.name || ticket.user?.email?.split('@')[0] || 'العضو';

  return <>
    <div className={styles.chatHead}>
      <button type="button" className={`nq-ibtn ${styles.chatBack}`} onClick={onClose} aria-label="إغلاق المحادثة" title="إغلاق">
        <Icon name="x"/>
      </button>
      <div className={styles.chatHeadInfo}>
        <h2 className={styles.chatSubj}>{ticket.subject || 'استفسار'}</h2>
        <div className={styles.chatEmail}><bdi>{ticket.user?.email || '—'}</bdi>{ticket.topic ? ` · ${ticket.topic}` : ''}</div>
      </div>
      <div className={`nq-seg ${styles.statusSeg}`} role="group" aria-label="حالة التذكرة">
        {Object.entries(TICKET_STATUS).map(([k, v]) => (
          <button key={k} type="button" aria-pressed={ticket.status === k}
            className={styles['tone_' + v.tone]} disabled={!!statusBusy}
            onClick={() => changeStatus(k)}>
            <i className={styles.statusDot} aria-hidden="true"/>{statusBusy === k ? '...' : v.label}
          </button>
        ))}
      </div>
    </div>
    {statusErr && <FormError text={statusErr} bar/>}
    <div className={styles.msgList} ref={listRef} aria-live="polite">
      {loading && <PageLoader/>}
      {error && <ErrorLine message={error} onRetry={loadAll}/>}
      {!loading && !error && messages.length === 0 && <Empty icon="chat" text="لا توجد رسائل بعد"/>}
      {messages.map(m => (
        <div key={m.id} className={`${styles.msg} ${m.is_admin ? styles.msgAdmin : ''}`}>
          <div className={styles.msgBubble}>{m.body}</div>
          <div className={styles.msgMeta}>
            <Icon name={m.is_admin ? 'shieldUser' : 'user'}/>
            {m.is_admin ? (m.sender_name || 'فريق الدعم') : (m.sender_name || userLabel)} · {fmtTime(m.created_at)}
          </div>
        </div>
      ))}
    </div>
    {sendErr && <FormError text={sendErr} bar/>}
    <form onSubmit={handleSend} className={styles.composer}>
      <input className={styles.composerInput} aria-label="نص الرد" maxLength={5000}
        placeholder={closed ? 'هذه التذكرة مغلقة، غيّر حالتها لإعادة فتحها' : 'اكتب ردك...'}
        value={input} onChange={e => setInput(e.target.value)}
        disabled={closed || sending}/>
      <button type="submit" className={`nq-btn gold ${styles.sendBtn}`} aria-label="إرسال الرد"
        disabled={sending || !input.trim() || closed}>
        {sending ? <span className={styles.spinSm} aria-hidden="true"/> : <Ico name="send"/>}
        <span className={styles.sendLabel}>إرسال</span>
      </button>
    </form>
  </>;
}

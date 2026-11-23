// ─── Support: my tickets, a conversation with the team, and a new-ticket form ──
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  listMyTickets, createSupportTicket,
  listTicketMessages, sendTicketMessage,
  pollTicketMessages,
} from '../backend';
import { apiErrorText } from '../authErrors';
import { useTr, trNow, intlLocale } from '../l10n';
import { rich } from './legal/LegalDoc';
import { PageHero, Icon, Badge8, Pattern, Corners, toAr } from '../components/ornaments/Ornaments';
import styles from './SupportPage.module.css';

const STATUS = {
  open:        { label: 'مفتوح',        tone: 'info' },
  pending:     { label: 'قيد المعالجة', tone: 'warn' },
  in_progress: { label: 'قيد المعالجة', tone: 'warn' },
  closed:      { label: 'مغلق',         tone: 'ok' },
};

const TOPICS = [
  'مشكلة تقنية', 'اقتراح أو فكرة', 'استفسار عن ميزة',
  'مشكلة في الحساب', 'خطأ في المحتوى', 'أخرى',
];

const FAQ = [
  ['كيف أبدأ حفظ القرآن؟', 'افتح صفحة «الحفظ والمراجعة» من القائمة، وحدّد حالة كل سورة، وستجد خريطة لحفظك ووِرداً يومياً للمراجعة.'],
  ['كيف أشارك في ختمة جماعية؟', 'من صفحة «الختمة الجماعية» أنشئ ختمة جديدة وشارك رابطها، أو انضم إلى ختمة قائمة برمزها.'],
  ['هل الموقع مجاني؟', 'نعم، نور القرآن مجاني بالكامل لوجه الله، بلا إعلانات ولا اشتراكات.'],
  ['متى يصلني الرد؟', 'يطّلع فريق الدعم على الرسائل يومياً، وستجد الرد هنا في محادثة استفسارك.'],
];

function StatusPill({ status }) {
  const tr = useTr();
  const s = STATUS[status] || STATUS.open;
  return <span className={styles.pill} data-tone={s.tone}><i aria-hidden="true" />{tr(s.label)}</span>;
}

// ─── SupportPage ──────────────────────────────────────────────────────────────
export default function SupportPage() {
  const { user, loading } = useAuth();
  const tr = useTr();
  return (
    <div className={styles.page}>
      <PageHero eyebrow={tr('نحن هنا لخدمتك')} title={tr('الدعم')}
        sub={tr('راسل فريق نور القرآن في أي مشكلة أو اقتراح، وتابع الرد في محادثة خاصة بك.')} />
      <div className={`nq-wrap ${styles.wrap}`}>
        {loading ? <div className={styles.center}><span className={styles.spinner} aria-label={tr('جارٍ التحميل')} /></div>
          : !user ? <NotLoggedIn />
          : <SupportView />}
        <Faq />
      </div>
    </div>
  );
}

// ─── SupportView ──────────────────────────────────────────────────────────────
function SupportView() {
  const tr = useTr();
  const [tickets,  setTickets]  = useState([]);
  const [active,   setActive]   = useState(null);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [creating, setCreating] = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [newSubject,setNewSubject]=useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newBody,  setNewBody]  = useState('');
  const [view,     setView]     = useState('list');
  const [listLoading, setListLoading] = useState(true);
  const [listErr,  setListErr]  = useState('');
  const [msgLoading, setMsgLoading] = useState(false);
  const [chatErr,  setChatErr]  = useState('');
  const [formErr,  setFormErr]  = useState('');
  const scroller    = useRef(null);
  const lastIdRef   = useRef(null);
  const aliveRef    = useRef(true);
  const panelRef    = useRef(null);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  // Add messages without duplicates (poll + own send may overlap)
  const mergeMessages = useCallback((incoming) => {
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const add = incoming.filter(m => m && !seen.has(m.id));
      if (!add.length) return prev;
      const next = [...prev, ...add];
      lastIdRef.current = next[next.length - 1].id;
      return next;
    });
  }, []);

  const loadTickets = useCallback(async () => {
    try {
      const data = await listMyTickets();
      if (!aliveRef.current) return;
      setTickets(data);
      setListErr('');
      // keep the open ticket's status fresh
      setActive(a => (a ? (data.find(tk => tk.id === a.id) || a) : a));
    } catch (e) {
      if (aliveRef.current) setListErr(apiErrorText(e, 'تعذّر تحميل استفساراتك'));
    } finally {
      if (aliveRef.current) setListLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Open ticket: load its messages, then poll every 5 s until closed/unmounted
  useEffect(() => {
    if (!active?.id) return;
    let alive = true;
    const ticketId = active.id;
    setMessages([]);
    setChatErr('');
    lastIdRef.current = null;
    setMsgLoading(true);
    listTicketMessages(ticketId)
      .then(list => {
        if (!alive) return;
        setMessages(list);
        lastIdRef.current = list.length ? list[list.length - 1].id : null;
      })
      .catch(e => { if (alive) setChatErr(apiErrorText(e, 'تعذّر تحميل الرسائل')); })
      .finally(() => { if (alive) setMsgLoading(false); });
    const stop = pollTicketMessages(ticketId, lastIdRef, list => { if (alive) mergeMessages(list); });
    return () => { alive = false; stop(); };
  }, [active?.id, mergeMessages]);

  // Keep the conversation scrolled to the newest message (inside its own box,
  // without jumping the whole page)
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body || !active) return;
    setSending(true); setChatErr('');
    try {
      const msg = await sendTicketMessage(active.id, body);
      if (!aliveRef.current) return;
      if (msg && msg.id) mergeMessages([msg]);   // show my message right away
      setInput('');
      loadTickets();
    } catch (err) {
      if (!aliveRef.current) return;
      if (err?.code === 'ticket_closed') {
        setActive(a => (a ? { ...a, status: 'closed' } : a));
        setChatErr(trNow('هذا الاستفسار مغلق، افتح استفساراً جديداً'));
      } else {
        setChatErr(apiErrorText(err, 'تعذّر إرسال الرسالة، حاول مجدداً'));
      }
    }
    if (aliveRef.current) setSending(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const subject = newSubject.trim();
    if (!subject) return;
    setCreating(true); setFormErr('');
    try {
      const ticket = await createSupportTicket({
        subject,
        topic: newTopic || 'أخرى',
        body: newBody.trim() || subject,
      });
      if (!aliveRef.current) return;
      await loadTickets();
      setActive(ticket);
      setShowNew(false);
      setNewSubject(''); setNewTopic(''); setNewBody('');
      setView('chat');
    } catch (err) {
      if (aliveRef.current) setFormErr(apiErrorText(err, 'تعذّر إرسال الاستفسار، حاول مجدداً'));
    }
    if (aliveRef.current) setCreating(false);
  }

  // on phones the panel replaces the list — bring it into view
  function revealPanel() {
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      setTimeout(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
    }
  }

  function openTicket(ticket) {
    setShowNew(false);
    setActive(ticket);
    setView('chat');
    revealPanel();
  }

  function openNew() {
    setShowNew(true);
    revealPanel();
  }

  function cancelNew() {
    setShowNew(false); setNewSubject(''); setNewTopic(''); setNewBody(''); setFormErr('');
  }

  const listHidden = view === 'chat' || showNew;   // phones only
  const mainHidden = view === 'list' && !showNew;  // phones only

  return (
    <div className={styles.layout}>
      {/* ── tickets ── */}
      <aside className={`nq-card ${styles.side} ${listHidden ? styles.mHide : ''}`} aria-labelledby="sp-mine">
        <div className={styles.sideHead}>
          <h2 id="sp-mine" className={styles.sideTitle}>{tr('استفساراتي')}</h2>
          <button type="button" className="nq-btn gold sm" onClick={openNew}><Icon name="plus" />{tr('استفسار جديد')}</button>
        </div>

        {listLoading && <div className={styles.empty}><span className={styles.spinner} aria-label={tr('جارٍ التحميل')} /></div>}
        {!listLoading && listErr && (
          <div className={styles.empty}>
            <Badge8 icon="x" />
            <p className={styles.emptyTitle}>{listErr}</p>
            <button type="button" className="nq-btn ghost sm" onClick={() => { setListLoading(true); loadTickets(); }}>{tr('إعادة المحاولة')}</button>
          </div>
        )}
        {!listLoading && !listErr && tickets.length === 0 && (
          <div className={styles.empty}>
            <Badge8 icon="chat" />
            <p className={styles.emptyTitle}>{tr('لا توجد استفسارات بعد')}</p>
            <p className={styles.emptySub}>{tr('اضغط «استفسار جديد» لمراسلة الفريق.')}</p>
          </div>
        )}

        <ul className={styles.tickets}>
          {tickets.map(ticket => (
            <li key={ticket.id}>
              <button type="button" className={styles.ticket} aria-current={active?.id === ticket.id ? 'true' : undefined}
                onClick={() => openTicket(ticket)}>
                <span className={styles.tTop}>
                  <span className={styles.tSubject}>{ticket.subject}</span>
                  {ticket.unread > 0 && (
                    <span className={styles.unread} aria-label={tr('{n} رسائل جديدة', { n: ticket.unread })}>{toAr(ticket.unread)}</span>
                  )}
                </span>
                <span className={styles.tMeta}>
                  <StatusPill status={ticket.status} />
                  <span className={styles.tDate}>{timeAgo(ticket.updated_at, tr)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── main panel ── */}
      <section ref={panelRef} className={`nq-card ${styles.main} ${mainHidden ? styles.mHide : ''}`} aria-label={tr('المحادثة')}>
        {showNew && (
          <form onSubmit={handleCreate} className={styles.newForm}>
            <div className={styles.panelHead}>
              <Badge8 icon="pen" size={46} />
              <div className={styles.grow}>
                <h2 className={styles.panelTitle}>{tr('استفسار جديد')}</h2>
                <p className={styles.panelSub}>{tr('اكتب ما تحتاجه، وسيصلك الرد هنا.')}</p>
              </div>
              <button type="button" className="nq-ibtn" onClick={cancelNew} aria-label={tr('إغلاق النموذج')}><Icon name="x" /></button>
            </div>

            <fieldset className={styles.fs}>
              <legend className={styles.label}>{tr('نوع الاستفسار')}</legend>
              <div className={styles.topics}>
                {TOPICS.map(topic => (
                  <button key={topic} type="button" aria-pressed={newTopic === topic} className={styles.topic}
                    onClick={() => { setNewTopic(topic); setNewSubject(tr(topic)); }}>
                    {tr(topic)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className={styles.fieldLbl}>
              <span className={styles.label}>{tr('الموضوع')}</span>
              <span className="nq-input"><input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                placeholder={tr('عنوان قصير لاستفسارك')} required /></span>
            </label>
            <label className={styles.fieldLbl}>
              <span className={styles.label}>{tr('التفاصيل')}</span>
              <textarea className={styles.textarea} rows={6} value={newBody} onChange={e => setNewBody(e.target.value)}
                placeholder={tr('اشرح المشكلة أو الاقتراح بالتفصيل: ماذا فعلت، وماذا حدث، ونوع جهازك إن أمكن.')} />
            </label>
            {formErr && <p role="alert" className={styles.err}><Icon name="x" />{formErr}</p>}
            <div className={styles.actions}>
              <button type="submit" className="nq-btn gold" disabled={creating || !newSubject.trim()}>
                {creating ? <span className={styles.spinnerSm} aria-hidden="true" /> : <Icon name="chat" />}
                {creating ? tr('جارٍ الإرسال…') : tr('إرسال الاستفسار')}
              </button>
              <button type="button" className="nq-btn ghost" onClick={cancelNew}>{tr('إلغاء')}</button>
            </div>
          </form>
        )}

        {!showNew && !active && (
          <div className={styles.welcome}>
            <Pattern />
            <Corners />
            <Badge8 icon="chat" size={72} />
            <h2 className={styles.welcomeTitle}>{tr('كيف نستطيع مساعدتك؟')}</h2>
            <p className={styles.welcomeSub}>{tr('اختر استفساراً من القائمة لمتابعة المحادثة، أو ابدأ استفساراً جديداً.')}</p>
            <div className={styles.actions} style={{ justifyContent: 'center' }}>
              <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />{tr('استفسار جديد')}</button>
              <Link to="/help" className="nq-btn ghost"><Icon name="doc" />{tr('شرح الاستخدام')}</Link>
            </div>
          </div>
        )}

        {!showNew && active && (
          <div className={styles.chat}>
            <div className={styles.chatHead}>
              <button type="button" className={`nq-ibtn ${styles.backBtn}`} aria-label={tr('العودة إلى الاستفسارات')}
                onClick={() => { setView('list'); setActive(null); }}>
                <Icon name="back" style={tr.dir === 'ltr' ? { transform: 'scaleX(-1)' } : undefined} />
              </button>
              <div className={styles.grow}>
                <h2 className={styles.chatSubject}>{active.subject}</h2>
                <div className={styles.tMeta}>
                  <StatusPill status={active.status} />
                  {active.topic && <span className={styles.tDate}>{tr(active.topic)}</span>}
                </div>
              </div>
            </div>

            <div className={styles.messages} ref={scroller} aria-live="polite">
              {msgLoading && messages.length === 0 && (
                <div className={styles.noMsg}><span className={styles.spinner} aria-label={tr('جارٍ التحميل')} /></div>
              )}
              {!msgLoading && messages.length === 0 && (
                <div className={styles.noMsg}>
                  <Badge8 icon="chat" />
                  <p>{tr('ستظهر محادثتك مع فريق الدعم هنا.')}</p>
                  <small>{tr('سيرد الفريق في أقرب وقت بإذن الله.')}</small>
                </div>
              )}
              {messages.reduce((acc, msg, i) => {
                const day = msg.created_at?.slice(0, 10);
                const prevDay = messages[i - 1]?.created_at?.slice(0, 10);
                if (day && day !== prevDay) {
                  acc.push(
                    <div key={'sep' + day} className={styles.dateSep}>
                      <span>{new Date(day).toLocaleDateString(intlLocale(tr.lang), { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    </div>
                  );
                }
                acc.push(
                  <div key={msg.id} className={`${styles.msg} ${msg.is_admin ? styles.msgTeam : styles.msgMe}`}>
                    {msg.is_admin && <span className={styles.who} aria-hidden="true"><Icon name="shieldUser" /></span>}
                    <div className={styles.bubbleWrap}>
                      <div className={styles.bubble}>{msg.body}</div>
                      <div className={styles.msgMeta}>
                        {msg.is_admin ? (msg.sender_name || tr('فريق الدعم')) : tr('أنت')} ·{' '}
                        {new Date(msg.created_at).toLocaleTimeString(intlLocale(tr.lang), { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
                return acc;
              }, [])}
            </div>

            {chatErr && <p role="alert" className={styles.err} style={{ marginInline: 16 }}><Icon name="x" />{chatErr}</p>}

            {active.status === 'closed' ? (
              <div className={styles.closed}>
                <Icon name="check" />
                <span>{tr('تم إغلاق هذا الاستفسار.')}</span>
                <button type="button" onClick={openNew} className={styles.linkBtn}>{tr('افتح استفساراً جديداً')}</button>
              </div>
            ) : (
              <form onSubmit={handleSend} className={styles.compose}>
                <label className={`nq-input ${styles.grow}`}>
                  <span className="nq-sr">{tr('رسالتك')}</span>
                  <input placeholder={tr('اكتب رسالتك…')} value={input} onChange={e => setInput(e.target.value)} />
                </label>
                <button type="submit" className={`nq-btn gold ${styles.send}`} disabled={sending || !input.trim()} aria-label={tr('إرسال')}>
                  {sending ? <span className={styles.spinnerSm} aria-hidden="true" /> : <SendIcon flip={tr.dir === 'rtl'} />}
                  <span className={styles.sendTxt}>{tr('إرسال')}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SendIcon({ flip }) {
  return (
    <svg className="nq-ico" viewBox="0 0 24 24" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M4 12 20 4l-5 16-3.5-6.5z M11.5 13.5 20 4" />
    </svg>
  );
}

function Faq() {
  const tr = useTr();
  const [open, setOpen] = useState(null);
  return (
    <section className={styles.faq} aria-labelledby="sp-faq">
      <h2 id="sp-faq" className={styles.faqTitle}>{tr('أسئلة شائعة')}</h2>
      <div className={styles.faqList}>
        {FAQ.map(([q, a], i) => (
          <div key={q} className={styles.faqItem}>
            <h3>
              <button type="button" className={styles.faqQ} aria-expanded={open === i} aria-controls={`sp-faq-${i}`}
                onClick={() => setOpen(o => (o === i ? null : i))}>
                <span>{tr(q)}</span>
                <Icon name="chev" className={styles.faqChev} />
              </button>
            </h3>
            <div id={`sp-faq-${i}`} hidden={open !== i} className={styles.faqA}>{tr(a)}</div>
          </div>
        ))}
      </div>
      <p className={styles.faqMore}>
        {rich(tr('المزيد في {help} و{docs}.'), {
          help: <Link to="/help">{tr('شرح الاستخدام')}</Link>,
          docs: <Link to="/docs">{tr('دليل المميزات')}</Link>,
        })}
      </p>
    </section>
  );
}

function NotLoggedIn() {
  const tr = useTr();
  return (
    <div className={`nq-card ${styles.gate}`}>
      <Pattern />
      <Corners />
      <Badge8 icon="lock" size={72} />
      <h2 className={styles.welcomeTitle}>{tr('سجّل الدخول لمراسلة الدعم')}</h2>
      <p className={styles.welcomeSub}>{tr('نحتاج حسابك لنحفظ استفساراتك ونُعلمك بالرد. التسجيل مجاني ولا يستغرق دقيقة.')}</p>
      <div className={styles.actions} style={{ justifyContent: 'center' }}>
        <Link to="/login" className="nq-btn gold"><Icon name="user" />{tr('تسجيل الدخول')}</Link>
        <Link to="/signup" className="nq-btn ghost"><Icon name="plus" />{tr('إنشاء حساب جديد')}</Link>
      </div>
      <p className={styles.gateAlt}>{rich(tr('أو راسلنا بالبريد: {email}'), { email: <a href="mailto:support@webek.org" dir="ltr">support@webek.org</a> })}</p>
    </div>
  );
}

function timeAgo(dateStr, tr) {
  if (!dateStr) return '—';
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1)  return tr('الآن');
  if (m < 60) return tr('منذ {n} دقيقة', { n: toAr(m) });
  const h = Math.floor(m / 60);
  if (h < 24) return tr('منذ {n} ساعة', { n: toAr(h) });
  const d = Math.floor(h / 24);
  if (d < 30) return tr('منذ {n} يوم', { n: toAr(d) });
  return tr('منذ {n} شهر', { n: toAr(Math.floor(d / 30)) });
}

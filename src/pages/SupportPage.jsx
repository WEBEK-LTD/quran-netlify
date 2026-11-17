import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getMyTickets, createTicket,
  getTicketMessages, sendMessage,
  subscribeToMessages,
} from '../supabase';
import styles from './SupportPage.module.css';

// ─── SupportPage ──────────────────────────────────────────────────────────────
export default function SupportPage() {
  const { user, loading } = useAuth();
  if (loading) return <div className={styles.center}><div className={styles.spinner}/></div>;
  if (!user)   return <NotLoggedIn/>;
  return <SupportView user={user}/>;
}

// ─── SupportView ──────────────────────────────────────────────────────────────
function SupportView({ user }) {
  const [tickets,  setTickets]  = useState([]);
  const [active,   setActive]   = useState(null);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [creating, setCreating] = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [newSubject,setNewSubject]=useState('');
  const [newBody,  setNewBody]  = useState('');
  const [view,     setView]     = useState('list');
  const messagesEnd = useRef(null);

  const loadTickets = useCallback(async () => {
    const data = await getMyTickets(user.id);
    setTickets(data || []);
  }, [user.id]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (!active) return;
    getTicketMessages(active.id).then(setMessages);
    const unsub = subscribeToMessages(active.id, msg =>
      setMessages(prev => [...prev, msg])
    );
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [active?.id]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !active) return;
    setSending(true);
    await sendMessage(active.id, user.id, input.trim(), false);
    setInput('');
    setSending(false);
    loadTickets();
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newSubject.trim()) return;
    setCreating(true);
    const { data } = await createTicket(user.id, user.email, newSubject.trim());
    if (data) {
      if (newBody.trim()) await sendMessage(data.id, user.id, newBody.trim(), false);
      setActive(data);
      await loadTickets();
      setShowNew(false);
      setNewSubject(''); setNewBody('');
      setView('chat');
    }
    setCreating(false);
  }

  function openTicket(ticket) {
    setActive(ticket);
    setView('chat');
  }

  const STATUS = {
    open:        { label: 'مفتوح',        color: '#f97316', bg: 'rgba(249,115,22,.1)' },
    in_progress: { label: 'قيد المعالجة', color: '#fbbf24', bg: 'rgba(251,191,36,.1)' },
    closed:      { label: 'مغلق',         color: '#52b788', bg: 'rgba(82,183,136,.1)' },
  };

  const TOPICS = [
    'مشكلة تقنية','اقتراح أو فكرة','استفسار عن ميزة',
    'مشكلة في الحساب','خطأ في المحتوى','أخرى',
  ];

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <Link to="/" className={styles.backBtn}>← رجوع</Link>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>💬 الدعم والمساعدة</h1>
          <p className={styles.subtitle}>نحن هنا لمساعدتك</p>
        </div>
        <div style={{ width: 70 }}/>
      </div>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroCards}>
          <div className={styles.heroCard}><span className={styles.heroIcon}>⚡</span><span className={styles.heroText}>رد سريع</span></div>
          <div className={styles.heroCard}><span className={styles.heroIcon}>🔒</span><span className={styles.heroText}>خاص وآمن</span></div>
          <div className={styles.heroCard}><span className={styles.heroIcon}>✅</span><span className={styles.heroText}>متابعة كاملة</span></div>
        </div>
      </div>

      <div className={styles.layout}>
        {/* Sidebar */}
        <div className={`${styles.sidebar} ${view === 'chat' ? styles.sidebarHidden : ''}`}>
          <div className={styles.sideHeader}>
            <h2 className={styles.sideTitle}>استفساراتي</h2>
            <button className={styles.newBtn} onClick={() => setShowNew(true)}>+ جديد</button>
          </div>

          {tickets.length === 0 && !showNew && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <p className={styles.emptyTitle}>لا توجد استفسارات بعد</p>
              <p className={styles.emptySub}>اضغط "جديد" للتواصل معنا</p>
              <button className={styles.emptyBtn} onClick={() => setShowNew(true)}>ابدأ محادثة</button>
            </div>
          )}

          <div className={styles.ticketList}>
            {tickets.map(ticket => (
              <div key={ticket.id}
                className={`${styles.ticketCard} ${active?.id === ticket.id ? styles.ticketCardA : ''}`}
                onClick={() => openTicket(ticket)}>
                <div className={styles.ticketCardTop}>
                  <span className={styles.ticketIcon}>
                    {ticket.status === 'closed' ? '✅' : ticket.status === 'in_progress' ? '⏳' : '🔵'}
                  </span>
                  <span className={styles.ticketSubject}>{ticket.subject}</span>
                </div>
                <div className={styles.ticketCardMeta}>
                  <span className={styles.ticketBadge}
                    style={{ color: STATUS[ticket.status]?.color, background: STATUS[ticket.status]?.bg }}>
                    {STATUS[ticket.status]?.label}
                  </span>
                  <span className={styles.ticketDate}>{timeAgo(ticket.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main area */}
        <div className={`${styles.main} ${view === 'list' && !showNew && !active ? styles.mainEmpty : ''}`}>

          {/* New ticket form */}
          {showNew && (
            <div className={styles.newTicketCard}>
              <div className={styles.newTicketHeader}>
                <h3>📝 استفسار جديد</h3>
                <button className={styles.closeNewBtn} onClick={() => setShowNew(false)}>✕</button>
              </div>
              <form onSubmit={handleCreate} className={styles.newForm}>
                <label className={styles.formLabel}>الموضوع</label>
                <div className={styles.topicsGrid}>
                  {TOPICS.map(topic => (
                    <button key={topic} type="button"
                      className={`${styles.topicChip} ${newSubject === topic ? styles.topicChipA : ''}`}
                      onClick={() => setNewSubject(topic)}>
                      {topic}
                    </button>
                  ))}
                </div>
                <input className={styles.formInput}
                  placeholder="أو اكتب موضوعاً مخصصاً..."
                  value={newSubject} onChange={e => setNewSubject(e.target.value)}/>
                <label className={styles.formLabel}>تفاصيل الاستفسار</label>
                <textarea className={styles.formTextarea} rows={5}
                  placeholder="اشرح المشكلة أو الاستفسار بالتفصيل..."
                  value={newBody} onChange={e => setNewBody(e.target.value)}/>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.submitBtn}
                    disabled={creating || !newSubject.trim()}>
                    {creating ? '⏳ جارٍ الإرسال...' : '📤 إرسال'}
                  </button>
                  <button type="button" className={styles.cancelBtn}
                    onClick={() => { setShowNew(false); setNewSubject(''); setNewBody(''); }}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Welcome / empty */}
          {!showNew && !active && (
            <div className={styles.welcomeArea}>
              <div style={{ fontSize: 64 }}>🤝</div>
              <h2 className={styles.welcomeTitle}>كيف نقدر نساعدك؟</h2>
              <p className={styles.welcomeSub}>اختر استفسار من القائمة أو ابدأ محادثة جديدة</p>
              <button className={styles.welcomeBtn} onClick={() => setShowNew(true)}>+ استفسار جديد</button>
              <div className={styles.faqSection}>
                <h3 className={styles.faqTitle}>أسئلة شائعة</h3>
                {[
                  ['كيف أبدأ بحفظ القرآن؟','افتح صفحة الحفظ من القائمة وستجد نظام تتبع لكل سورة'],
                  ['كيف أشارك في ختمة جماعية؟','من صفحة الختمة الجماعية — أنشئ غرفة أو انضم برمز الغرفة'],
                  ['هل التطبيق مجاني تماماً؟','نعم — نور القرآن مجاني بالكامل لوجه الله'],
                ].map(([q, a]) => (
                  <FaqItem key={q} q={q} a={a}/>
                ))}
              </div>
            </div>
          )}

          {/* Chat area */}
          {!showNew && active && (
            <div className={styles.chatArea}>
              <div className={styles.chatHeader}>
                <button className={styles.backToList}
                  onClick={() => { setView('list'); setActive(null); }}>
                  ← رجوع
                </button>
                <div className={styles.chatHeaderInfo}>
                  <span className={styles.chatSubject}>{active.subject}</span>
                  <span className={styles.chatStatus}
                    style={{ color: STATUS[active.status]?.color, background: STATUS[active.status]?.bg }}>
                    {STATUS[active.status]?.label}
                  </span>
                </div>
              </div>

              <div className={styles.messages}>
                {messages.length === 0 && (
                  <div className={styles.noMessages}>
                    <div style={{ fontSize: 36 }}>👋</div>
                    <p>محادثتك مع فريق الدعم ستظهر هنا</p>
                    <p className={styles.noMessagesSub}>فريق الدعم سيرد في أقرب وقت</p>
                  </div>
                )}
                {messages.reduce((acc, msg, i) => {
                  const day = msg.created_at?.slice(0, 10);
                  const prevDay = messages[i - 1]?.created_at?.slice(0, 10);
                  if (day !== prevDay) {
                    acc.push(
                      <div key={'sep'+day} className={styles.dateSep}>
                        {new Date(day).toLocaleDateString('ar-EG', { weekday:'long', month:'long', day:'numeric' })}
                      </div>
                    );
                  }
                  acc.push(
                    <div key={msg.id} className={`${styles.msg} ${msg.is_admin ? styles.msgAdmin : styles.msgUser}`}>
                      <div className={styles.msgBubble}>{msg.body}</div>
                      <div className={styles.msgMeta}>
                        {msg.is_admin ? '🛟 فريق الدعم' : '👤 أنت'} ·{' '}
                        {new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                  );
                  return acc;
                }, [])}
                <div ref={messagesEnd}/>
              </div>

              {active.status === 'closed' ? (
                <div className={styles.closedBanner}>
                  ✅ هذه التذكرة مغلقة —{' '}
                  <button onClick={() => setShowNew(true)} className={styles.reopenBtn}>
                    افتح استفساراً جديداً
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSend} className={styles.inputRow}>
                  <input className={styles.chatInput}
                    placeholder="اكتب رسالتك..."
                    value={input} onChange={e => setInput(e.target.value)}/>
                  <button type="submit" className={styles.sendBtn}
                    disabled={sending || !input.trim()}>
                    {sending ? '⏳' : '↑ إرسال'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.faqItem}>
      <button className={styles.faqQ} onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span className={styles.faqArrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className={styles.faqA}>{a}</p>}
    </div>
  );
}

function NotLoggedIn() {
  return (
    <div className={styles.center}>
      <div className={styles.notLoggedWrap}>
        <Link to="/dashboard" className={styles.backBtnSmall}>← رجوع</Link>
        <div style={{ fontSize:52, margin:'20px 0 10px' }}>🔐</div>
        <h2 style={{ color:'var(--text)', marginBottom:8 }}>يجب تسجيل الدخول</h2>
        <p style={{ color:'var(--text3)', fontSize:14, marginBottom:20 }}>للوصول لصفحة الدعم يجب تسجيل الدخول أولاً</p>
        <Link to="/login" className={styles.bigBtn} style={{ marginBottom:10 }}>تسجيل الدخول</Link>
        <Link to="/signup" className={styles.bigBtnOutline}>إنشاء حساب جديد</Link>
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1)  return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return `منذ ${Math.floor(d / 30)} شهر`;
}

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import { aiChat, errorMessage } from '../backend';
import styles from './AIAssistant.module.css';
import { Icon } from './ornaments/Ornaments';
import { useTr, trNow, num, surahName } from '../l10n';

// ─── Suggested questions per context ─────────────────────────────────────────
function getSuggestions(surahNum, ayahNum) {
  const name = surahName(surahNum) || '';
  return [
    trNow('ما معنى هذه الآية من سورة {name}؟', { name }),
    trNow('ما الدروس المستفادة من هذه الآية؟'),
    trNow('كيف أطبّق هذه الآية في حياتي؟'),
    trNow('ما علاقة هذه الآية بما قبلها؟'),
  ];
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
      {!isUser && <div className={styles.aiAvatar}><Icon name="chat" /></div>}
      <div className={styles.bubbleContent} dir="auto">
        {msg.streaming
          ? <span>{msg.content}<span className={styles.cursor} /></span>
          : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        }
      </div>
    </div>
  );
}

// The server builds the system prompt (POST /ai/chat). We only send the
// user/assistant turns (last 12) and the ayah being read.
function aiErrorText(e) {
  const code = e && e.code;
  if (code === 'unauthenticated') return trNow('سجّل الدخول لاستخدام المساعد');
  if (code === 'ai_not_configured') return trNow('المساعد غير مُفعّل حالياً — لم تُضبط إعداداته بعد من الإدارة');
  if (code === 'feature_disabled') return trNow('المساعد متوقف مؤقتاً من الإدارة');
  if (code === 'rate_limited') return '⏳ ' + trNow('وصلت للحد المسموح من الأسئلة هذه الساعة — حاول بعد قليل');
  return '⚠️ ' + errorMessage(e, trNow('تعذّر الحصول على إجابة، حاول مرة أخرى'));
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AIAssistant() {
  const [state] = useStore();
  const tr = useTr();
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  // Latest values for event handlers / async callbacks (no stale closures)
  const messagesRef = useRef(messages);
  const loadingRef  = useRef(false);
  const userRef     = useRef(user);
  const ctxRef      = useRef(null);   // { surah, ayah, text } from the Reader's ✦ AI button
  const aliveRef    = useRef(true);
  messagesRef.current = messages;
  userRef.current = user;

  const surahNum = state.currentSurah;
  const ayahNum  = state.currentAyah;
  const sName = surahName(surahNum) || '';
  const posRef = useRef(null);
  posRef.current = { surah: surahNum, ayah: ayahNum };

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Listen for openAI event from Reader ayah buttons. The event carries
  // surah/ayah/text, so the handler never depends on stale render state.
  useEffect(() => {
    let timer = null;
    function handler(e) {
      setOpen(true);
      const d = e.detail || {};
      if (!d.ayah) return;
      const surah = d.surah || null;
      ctxRef.current = { surah, ayah: d.ayah, text: d.text || '' };
      if (!userRef.current) return;   // the panel shows the sign-in prompt
      const name = surahName(surah || 1) || '';
      clearTimeout(timer);
      timer = setTimeout(() => sendMessage(trNow('اشرح لي الآية {n} من سورة {name}', { n: d.ayah, name })), 200);
    }
    window.addEventListener('openAI', handler);
    return () => { window.removeEventListener('openAI', handler); clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset on surah change
  useEffect(() => {
    setMessages([]);
    setError('');
    if (ctxRef.current && ctxRef.current.surah !== surahNum) ctxRef.current = null;
  }, [surahNum]);

  async function sendMessage(text) {
    const q = (text ?? input).trim();
    if (!q || loadingRef.current) return;
    if (!userRef.current) { setError(aiErrorText({ code: 'unauthenticated' })); return; }
    setInput('');
    setError('');

    const history = [...messagesRef.current.filter(m => !m.streaming), { role: 'user', content: q }];
    setMessages([...history, { role: 'assistant', content: '...', streaming: true }]);
    loadingRef.current = true;
    setLoading(true);

    // Context: the ayah from the Reader button if it is the one being read, else the current position
    const pos = posRef.current;
    const ctx = ctxRef.current && ctxRef.current.surah === pos.surah
      ? ctxRef.current
      : { surah: pos.surah, ayah: pos.ayah, text: '' };
    const context = { surah: ctx.surah, ayah: ctx.ayah };
    if (ctx.text) context.text = String(ctx.text).slice(0, 2000);

    try {
      const reply = await aiChat(history.map(m => ({ role: m.role, content: m.content })), context);
      if (!aliveRef.current) return;
      setMessages([...history, { role: 'assistant', content: reply || '—', streaming: false }]);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(aiErrorText(e));
      setMessages(history); // remove typing indicator
    } finally {
      loadingRef.current = false;
      if (aliveRef.current) setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError('');
  }

  const suggestions = getSuggestions(surahNum, ayahNum);
  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating button */}
      <button
        className={`${styles.fab} ${open ? styles.fabOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        title={tr('المساعد')} aria-label={tr('المساعد')}
      >
        {open ? <Icon name="x" /> : <Icon name="chat" />}
        {!open && <span className={styles.fabPulse} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.headerInfo}>
              <div className={styles.headerIcon}><Icon name="chat" /></div>
              <div>
                <h3>{tr('المساعد الإسلامي')}</h3>
                <p>{tr('سورة {name} — الآية {n}', { name: sName, n: num(ayahNum) })}</p>
              </div>
            </div>
            <div className={styles.headerActions}>
              {messages.length > 0 && (
                <button className={styles.clearBtn} onClick={clearChat} title={tr('محادثة جديدة')} aria-label={tr('محادثة جديدة')}>
                  🗑
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label={tr('إغلاق')}>✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className={styles.messages}>
            {isEmpty && !user && !authLoading && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Icon name="lock" /></div>
                <p className={styles.emptyTitle}>{tr('سجّل الدخول لاستخدام المساعد')}</p>
                <p className={styles.emptySub}>{tr('المساعد متاح للمستخدمين المسجّلين فقط')}</p>
                <div className={styles.suggestions}>
                  <Link to="/login" className={styles.suggestion} onClick={() => setOpen(false)}
                    style={{ textAlign: 'center', textDecoration: 'none' }}>{tr('تسجيل الدخول')}</Link>
                  <Link to="/signup" className={styles.suggestion} onClick={() => setOpen(false)}
                    style={{ textAlign: 'center', textDecoration: 'none' }}>{tr('إنشاء حساب')}</Link>
                </div>
              </div>
            )}

            {isEmpty && (user || authLoading) && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Icon name="chat" /></div>
                <p className={styles.emptyTitle}>{tr('اسألني عن القرآن الكريم')}</p>
                <p className={styles.emptySub}>{tr('أنا هنا لمساعدتك في فهم الآيات والتفسير والفقه')}</p>

                <div className={styles.suggestions}>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      className={styles.suggestion}
                      onClick={() => sendMessage(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <Bubble key={i} msg={msg} />
            ))}

            {error && (
              <div className={styles.errorMsg}>
                {error}
                <button onClick={() => setError('')} aria-label={tr('إغلاق')}>✕</button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className={styles.inputArea}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={tr('اسأل عن الآية، التفسير، الفقه...')}
              rows={2}
              dir="auto"
              disabled={loading || !user}
            />
            <div className={styles.inputActions}>
              <span className={styles.hint}>{tr('Enter للإرسال • Shift+Enter لسطر جديد')}</span>
              {loading
                ? <span className={styles.typingDots}>{tr('جاري التفكير...')}</span>
                : <button
                    className={styles.sendBtn}
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || !user}
                  >{tr('إرسال ↩')}</button>
              }
            </div>
          </div>

        </div>
      )}
    </>
  );
}

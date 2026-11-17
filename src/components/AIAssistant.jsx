import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { SURAHS_META } from '../data';
import styles from './AIAssistant.module.css';

// ─── Suggested questions per context ─────────────────────────────────────────
function getSuggestions(surahNum, ayahNum) {
  const name = SURAHS_META[surahNum - 1]?.[0] || '';
  return [
    `ما معنى هذه الآية من سورة ${name}؟`,
    `ما الدروس المستفادة من هذه الآية؟`,
    `كيف أطبّق هذه الآية في حياتي؟`,
    `ما علاقة هذه الآية بما قبلها؟`,
  ];
}

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystem(surahNum, ayahNum) {
  const meta = SURAHS_META[surahNum - 1];
  const name = meta?.[0] || '';
  const type = meta?.[3] || '';
  return `أنت مساعد إسلامي متخصص في علوم القرآن الكريم والفقه الإسلامي. 
تتحدث بالعربية الفصحى السهلة، وتجيب بأسلوب علمي رصين وودود.

السياق الحالي: المستخدم يقرأ سورة ${name} (${type})، الآية ${ayahNum}.

قواعد:
- أجب دائماً بالعربية
- كن دقيقاً في النقل عن العلماء، وأشِر إلى المصادر عند الاقتباس
- إذا سُئلت عن مسألة خلافية، اذكر أشهر الأقوال بموضوعية
- لا تُفتِ في المسائل الخطيرة، وأحِل إلى العلماء المختصين
- ابدأ إجاباتك مباشرة دون مقدمات طويلة
- استخدم الآيات القرآنية والأحاديث الصحيحة لتدعيم إجاباتك`;
}

// ─── Call Claude API with streaming ──────────────────────────────────────────
// ─── Secure proxy — API key lives server-side in process.env.OPENAI_KEY ──────
// No VITE_ prefix = never bundled into client JS.
async function callClaude(messages, system) {
  const res = await fetch('/.netlify/functions/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      system,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.content?.[0]?.text || '';
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
      {!isUser && <div className={styles.aiAvatar}>✦</div>}
      <div className={styles.bubbleContent}>
        {msg.streaming
          ? <span>{msg.content}<span className={styles.cursor} /></span>
          : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        }
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AIAssistant() {
  const [state] = useStore();
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const abortRef    = useRef(false);

  const surahNum = state.currentSurah;
  const ayahNum  = state.currentAyah;
  const surahName = SURAHS_META[surahNum - 1]?.[0] || '';

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Listen for openAI event from Reader ayah buttons
  useEffect(() => {
    function handler(e) {
      setOpen(true);
      const ayah = e.detail?.ayah;
      if (ayah) {
        setTimeout(() => {
          const q = `اشرح لي الآية ${ayah} من سورة ${SURAHS_META[state.currentSurah - 1]?.[0]}`;
          sendMessage(q);
        }, 200);
      }
    }
    window.addEventListener('openAI', handler);
    return () => window.removeEventListener('openAI', handler);
  }, [state.currentSurah, open]);

  // Reset on surah change (keep last 2 msgs for context)
  useEffect(() => {
    setMessages([]);
    setError('');
  }, [surahNum]);

  async function sendMessage(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    setError('');
    abortRef.current = false;

    const userMsg = { role: 'user', content: q };
    const history = [...messages, userMsg];
    // Show typing indicator
    setMessages([...history, { role: 'assistant', content: '...', streaming: true }]);
    setLoading(true);

    const apiMsgs = history.map(m => ({ role: m.role, content: m.content }));
    const system  = buildSystem(surahNum, ayahNum);

    try {
      const reply = await callClaude(apiMsgs, system);
      setMessages([...history, { role: 'assistant', content: reply, streaming: false }]);
    } catch (e) {
      setError(`⚠️ ${e.message}`);
      setMessages(history); // remove typing indicator
    } finally {
      setLoading(false);
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
        title="المساعد الإسلامي"
      >
        {open ? '✕' : '✦'}
        {!open && <span className={styles.fabPulse} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.headerInfo}>
              <div className={styles.headerIcon}>✦</div>
              <div>
                <h3>المساعد الإسلامي</h3>
                <p>سورة {surahName} — الآية {ayahNum}</p>
              </div>
            </div>
            <div className={styles.headerActions}>
              {messages.length > 0 && (
                <button className={styles.clearBtn} onClick={clearChat} title="محادثة جديدة">
                  🗑
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className={styles.messages}>
            {isEmpty && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✦</div>
                <p className={styles.emptyTitle}>اسألني عن القرآن الكريم</p>
                <p className={styles.emptySub}>أنا هنا لمساعدتك في فهم الآيات والتفسير والفقه</p>

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
                <button onClick={() => setError('')}>✕</button>
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
              placeholder="اسأل عن الآية، التفسير، الفقه..."
              rows={2}
              dir="rtl"
              disabled={loading}
            />
            <div className={styles.inputActions}>
              <span className={styles.hint}>Enter للإرسال • Shift+Enter لسطر جديد</span>
              {loading
                ? <span className={styles.typingDots}>جاري التفكير...</span>
                : <button
                    className={styles.sendBtn}
                    onClick={() => sendMessage()}
                    disabled={!input.trim()}
                  >إرسال ↩</button>
              }
            </div>
          </div>

        </div>
      )}
    </>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { saveNote, loadNotes } from '../supabase';
import { SURAHS_META } from '../data';
import styles from './QuickNoteWidget.module.css';

const LOCAL_KEY = 'nq_notes';
function getLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
function setLocal(n) { localStorage.setItem(LOCAL_KEY, JSON.stringify(n)); }

export default function QuickNoteWidget() {
  const { user } = useAuth();
  const [note,    setNote]    = useState(null);
  const [text,    setText]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    async function handler(e) {
      const { surah, ayah } = e.detail;
      let existing = '';
      if (user) {
        const notes = await loadNotes(user.id).catch(() => []);
        existing = notes.find(n => n.surah === surah && n.ayah === ayah)?.text || '';
      }
      if (!existing) {
        existing = getLocal().find(n => n.surah === surah && n.ayah === ayah)?.text || '';
      }
      setNote({ surah, ayah });
      setText(existing);
      setSaved(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
    window.addEventListener('openNote', handler);
    return () => window.removeEventListener('openNote', handler);
  }, [user]);

  async function handleSave() {
    if (!note || !text.trim()) return;
    setSaving(true);
    const { surah, ayah } = note;
    // Always save local
    const existing = getLocal().filter(n => !(n.surah === surah && n.ayah === ayah));
    setLocal([{ surah, ayah, text: text.trim(), updated_at: new Date().toISOString() }, ...existing]);
    // Sync to Supabase if logged in
    if (user) await saveNote(user.id, surah, ayah, text.trim()).catch(() => {});
    setSaving(false); setSaved(true);
    setTimeout(() => setNote(null), 800);
  }

  function handleKey(e) {
    if (e.key === 'Escape') setNote(null);
    if (e.key === 'Enter' && e.ctrlKey) handleSave();
  }

  if (!note) return null;
  const surahName = SURAHS_META[note.surah - 1]?.[0] || '';

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && setNote(null)}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.ref}>
            <span className={styles.badge}>{note.surah}</span>
            <span>سورة {surahName} — الآية {note.ayah}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setNote(null)}>✕</button>
        </div>
        <textarea ref={textareaRef} className={styles.textarea} value={text}
          onChange={e => setText(e.target.value)} onKeyDown={handleKey}
          placeholder="اكتب ملاحظتك... تأمل، فكرة، سؤال، فائدة..." rows={5} dir="rtl" />
        <div className={styles.footer}>
          <span className={styles.hint}>Ctrl+Enter للحفظ • Esc للإغلاق</span>
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={() => setNote(null)}>إلغاء</button>
            <button className={`${styles.saveBtn} ${saved ? styles.savedBtn : ''}`}
              onClick={handleSave} disabled={saving || !text.trim()}>
              {saved ? '✅ تم الحفظ' : saving ? '...' : '💾 حفظ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

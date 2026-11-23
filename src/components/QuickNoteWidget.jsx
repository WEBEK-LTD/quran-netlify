import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { saveNote, loadNotes } from '../backend';
import { useTr, num, surahName } from '../l10n';
import { coreTr, coreTrNow } from '../locales/core';
import styles from './QuickNoteWidget.module.css';

const LOCAL_KEY = 'nq_notes';
function getLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
function setLocal(n) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(n)); } catch {} }

export default function QuickNoteWidget() {
  const { user } = useAuth();
  const tr = coreTr(useTr());
  const [note,    setNote]    = useState(null);
  const [text,    setText]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    async function handler(e) {
      const { surah, ayah } = e.detail;
      // نأخذ الأحدث بين نسخة الحساب والنسخة المحلية
      const local = getLocal().find(n => n.surah === surah && n.ayah === ayah) || null;
      let remote = null;
      if (user) {
        const notes = await loadNotes(user.id).catch(() => []);
        remote = notes.find(n => n.surah === surah && n.ayah === ayah) || null;
      }
      const best = remote && local
        ? (String(local.updated_at || '') > String(remote.updated_at || '') ? local : remote)
        : (remote || local);
      setNote({ surah, ayah });
      setText(best?.text || '');
      setSaved(false);
      setSaveErr('');
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
    // Sync to the account if logged in
    if (user) {
      const ok = await saveNote(user.id, surah, ayah, text.trim()).catch(() => false);
      if (ok === false) {
        setSaving(false);
        setSaveErr('⚠️ ' + coreTrNow('تعذّر الحفظ على حسابك — حُفظت الملاحظة على هذا الجهاز فقط'));
        return;
      }
    }
    setSaving(false); setSaved(true); setSaveErr('');
    setTimeout(() => setNote(null), 800);
  }

  function handleKey(e) {
    if (e.key === 'Escape') setNote(null);
    if (e.key === 'Enter' && e.ctrlKey) handleSave();
  }

  if (!note) return null;

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && setNote(null)}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.ref}>
            <span className={styles.badge}>{num(note.surah)}</span>
            <span>{tr('سورة {name} — الآية {n}', { name: surahName(note.surah), n: num(note.ayah) })}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setNote(null)} aria-label={tr('إغلاق')}>✕</button>
        </div>
        <textarea ref={textareaRef} className={styles.textarea} value={text}
          onChange={e => setText(e.target.value)} onKeyDown={handleKey}
          placeholder={tr('اكتب ملاحظتك... تأمل، فكرة، سؤال، فائدة...')} rows={5} dir="auto" />
        {saveErr && (
          <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: '6px 0 0' }}>{saveErr}</p>
        )}
        <div className={styles.footer}>
          <span className={styles.hint}>{tr('Ctrl+Enter للحفظ • Esc للإغلاق')}</span>
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={() => setNote(null)}>{tr('إلغاء')}</button>
            <button className={`${styles.saveBtn} ${saved ? styles.savedBtn : ''}`}
              onClick={handleSave} disabled={saving || !text.trim()}>
              {saved ? `✅ ${tr('تم الحفظ')}` : saving ? '...' : `💾 ${tr('حفظ')}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

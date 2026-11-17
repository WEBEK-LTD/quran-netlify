import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { saveNote, loadNotes, deleteNote } from '../supabase';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import styles from './NotesPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

const LOCAL_KEY = 'nq_notes';
function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
function saveLocal(notes) { localStorage.setItem(LOCAL_KEY, JSON.stringify(notes)); }

export default function NotesPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [filter,  setFilter]  = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      loadNotes(user.id)
        .then(n => { setNotes(n.length ? n : loadLocal()); setLoading(false); })
        .catch(() => { setNotes(loadLocal()); setLoading(false); });
    } else {
      setNotes(loadLocal()); setLoading(false);
    }
  }, [user, authLoading]);

  async function handleSave() {
    if (!editing || !editing.text.trim()) return;
    setSaving(true);
    const { surah, ayah, text } = editing;
    if (user) {
      await saveNote(user.id, surah, ayah, text.trim()).catch(() => {});
      const fresh = await loadNotes(user.id).catch(() => []);
      const merged = fresh.length ? fresh : (() => {
        const ex = loadLocal().filter(n => !(n.surah === surah && n.ayah === ayah));
        const next = [{ surah, ayah, text: text.trim(), updated_at: new Date().toISOString() }, ...ex];
        saveLocal(next); return next;
      })();
      setNotes(merged);
    } else {
      const existing = notes.filter(n => !(n.surah === surah && n.ayah === ayah));
      const next = [{ surah, ayah, text: text.trim(), updated_at: new Date().toISOString() }, ...existing];
      setNotes(next); saveLocal(next);
    }
    setEditing(null); setSaving(false);
  }

  async function handleDelete(surah, ayah) {
    if (!confirm('هل تريد حذف هذه الملاحظة؟')) return;
    const next = notes.filter(n => !(n.surah === surah && n.ayah === ayah));
    setNotes(next); saveLocal(next);
    if (user) await deleteNote(user.id, surah, ayah).catch(() => {});
  }

  function goToAyah(surah, ayah) {
    setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
    navigate('/');
  }

  const filtered = notes.filter(n => {
    if (!filter) return true;
    return n.text.includes(filter) || SURAHS_META[n.surah-1]?.[0].includes(filter) || String(n.surah).includes(filter);
  });

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('notesTitle')}</h1>
        <LangSwitcher compact={true} />
        <button className={styles.newBtn} onClick={() => setEditing({ surah: 1, ayah: 1, text: '' })}>{t('addNote')}</button>
      </div>

      <div className={styles.searchBar}>
        <span>🔍</span>
        <input type="text" {...{placeholder: t('search_notes')}} value={filter}
          onChange={e => setFilter(e.target.value)} dir="rtl" />
        {filter && <button onClick={() => setFilter('')}>✕</button>}
      </div>

      {editing && (
        <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className={styles.modal}>
            <h3>{notes.find(n => n.surah === editing.surah && n.ayah === editing.ayah) ? t('edit') : t('addNote')}</h3>
            <div className={styles.modalFields}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>{t('surah_label')}</label>
                  <select value={editing.surah}
                    onChange={e => setEditing(v => ({ ...v, surah: parseInt(e.target.value), ayah: 1 }))}>
                    {SURAHS_META.map((m, i) => <option key={i} value={i+1}>{i+1}. {m[0]}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>{t('ayah_label')}</label>
                  <input type="number" min="1" max={SURAHS_META[editing.surah-1]?.[2] || 286}
                    value={editing.ayah} onChange={e => setEditing(v => ({ ...v, ayah: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div className={styles.field}>
                <label>{t('note_label')}</label>
                <textarea rows={6} {...{placeholder: t('write_note')}} value={editing.text}
                  onChange={e => setEditing(v => ({ ...v, text: e.target.value }))} dir="rtl" autoFocus />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setEditing(null)}>{t('cancel')}</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !editing.text.trim()}>
                {saving ? '...' : '💾 حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <span>📝</span>
          <p>{filter ? 'لا توجد نتائج' : 'لا توجد ملاحظات بعد'}</p>
          <small>{filter ? 'جرّب كلمة أخرى' : 'اضغط + جديد أو ✏️ بجانب أي آية'}</small>
          {!filter && <button className={styles.createBtn} onClick={() => setEditing({ surah: 1, ayah: 1, text: '' })}>إنشاء أول ملاحظة</button>}
        </div>
      ) : (
        <>
          <p className={styles.count}>{filtered.length} ملاحظة</p>
          <div className={styles.grid}>
            {filtered.map((note, i) => {
              const meta = SURAHS_META[note.surah - 1];
              const date = note.updated_at ? new Date(note.updated_at).toLocaleDateString('ar-EG', { day:'numeric', month:'short' }) : '';
              return (
                <div key={i} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.ref} onClick={() => goToAyah(note.surah, note.ayah)}>
                      <span className={styles.surahDot}>{note.surah}</span>
                      <span>{meta?.[0]} — الآية {note.ayah}</span>
                    </div>
                    {date && <span className={styles.date}>{date}</span>}
                  </div>
                  <p className={styles.noteText}>{note.text}</p>
                  <div className={styles.cardActions}>
                    <button onClick={() => goToAyah(note.surah, note.ayah)}>{t('go_to_ayah')}</button>
                    <button onClick={() => setEditing({ surah: note.surah, ayah: note.ayah, text: note.text })}>✏️ تعديل</button>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(note.surah, note.ayah)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { saveNote, loadNotes, deleteNote } from '../backend';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import styles from './NotesPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
import { normalizeArabic } from '../arabic';

const LOCAL_KEY = 'nq_notes';
function loadLocal() { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveLocal(notes) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(notes)); } catch {} }
const noteKey = n => `${n.surah}:${n.ayah}`;
const sameAyah = (n, surah, ayah) => n.surah === surah && n.ayah === ayah;

// دمج ملاحظات الحساب مع المحلية — عند التعارض نأخذ الأحدث
function mergeNotes(server, local) {
  const map = new Map();
  for (const n of [...(server || []), ...(local || [])]) {
    if (!n || !n.surah || !n.ayah) continue;
    const k = noteKey(n);
    const prev = map.get(k);
    if (!prev || String(n.updated_at || '') > String(prev.updated_at || '')) map.set(k, n);
  }
  return [...map.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export default function NotesPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  // editing: { surah, ayah (نص الحقل), text, origSurah?, origAyah? }
  const [editing, setEditing] = useState(null);
  const [filter,  setFilter]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDel, setConfirmDel] = useState(null); // { surah, ayah }

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const local = loadLocal();
    if (user) {
      loadNotes(user.id)
        .then(server => {
          if (cancelled) return;
          const merged = mergeNotes(server, local);
          setNotes(merged); saveLocal(merged); setLoading(false);
          // ارفع الملاحظات المحلية غير الموجودة على الحساب
          const serverKeys = new Set((server || []).map(noteKey));
          local.filter(n => !serverKeys.has(noteKey(n))).forEach(n => {
            saveNote(user.id, n.surah, n.ayah, n.text).catch(() => {});
          });
        })
        .catch(() => { if (!cancelled) { setNotes(local); setLoading(false); } });
    } else {
      setNotes(local); setLoading(false);
    }
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const maxAyah = editing ? (SURAHS_META[editing.surah - 1]?.[2] || 286) : 286;
  const ayahNum = editing ? Number(editing.ayah) : NaN;
  const ayahValid = Number.isInteger(ayahNum) && ayahNum >= 1 && ayahNum <= maxAyah;
  const isEditingExisting = !!(editing && editing.origSurah);
  const movedAway = isEditingExisting && (editing.origSurah !== editing.surah || editing.origAyah !== ayahNum);
  // ملاحظة أخرى موجودة على الآية المختارة (ستُستبدل)
  const conflict = editing && ayahValid && (!isEditingExisting || movedAway)
    ? notes.find(n => sameAyah(n, editing.surah, ayahNum))
    : null;

  function openNew() {
    setMessage('');
    setEditing({ surah: 1, ayah: '1', text: '' });
  }

  function openEdit(note) {
    setMessage('');
    setEditing({ surah: note.surah, ayah: String(note.ayah), text: note.text, origSurah: note.surah, origAyah: note.ayah });
  }

  async function handleSave() {
    if (!editing || !editing.text.trim() || !ayahValid) return;
    setSaving(true); setMessage('');
    const surah = editing.surah, ayah = ayahNum, text = editing.text.trim();
    const now = new Date().toISOString();
    const moveFrom = movedAway ? { surah: editing.origSurah, ayah: editing.origAyah } : null;

    // المحلي دائماً (يعمل بدون اتصال)
    const keep = n => !sameAyah(n, surah, ayah) && !(moveFrom && sameAyah(n, moveFrom.surah, moveFrom.ayah));
    const next = [{ surah, ayah, text, updated_at: now }, ...notes.filter(keep)];
    const localNext = [{ surah, ayah, text, updated_at: now }, ...loadLocal().filter(keep)];
    setNotes(next); saveLocal(mergeNotes(localNext, next));

    if (user) {
      let ok = await saveNote(user.id, surah, ayah, text).catch(() => false);
      if (ok && moveFrom) ok = await deleteNote(user.id, moveFrom.surah, moveFrom.ayah).catch(() => false);
      if (ok === false) setMessage('⚠️ تعذّر حفظ الملاحظة على حسابك — حُفظت على هذا الجهاز فقط');
    }
    setEditing(null); setSaving(false);
  }

  async function doDelete(surah, ayah) {
    setConfirmDel(null); setMessage('');
    const next = notes.filter(n => !sameAyah(n, surah, ayah));
    setNotes(next);
    saveLocal(loadLocal().filter(n => !sameAyah(n, surah, ayah)));
    if (user) {
      const ok = await deleteNote(user.id, surah, ayah).catch(() => false);
      if (ok === false) setMessage('⚠️ تعذّر حذف الملاحظة من حسابك — حُذفت من هذا الجهاز فقط');
    }
  }

  function goToAyah(surah, ayah) {
    setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
    navigate('/reader');
  }

  const qNorm = normalizeArabic(filter).trim();
  const filtered = notes.filter(n => {
    if (!qNorm) return true;
    return normalizeArabic(n.text).includes(qNorm)
      || normalizeArabic(SURAHS_META[n.surah-1]?.[0] || '').includes(qNorm)
      || String(n.surah).includes(filter.trim());
  });

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/reader" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('notesTitle')}</h1>
        <LangSwitcher compact={true} />
        <button className={styles.newBtn} onClick={openNew}>{t('addNote')}</button>
      </div>

      <div className={styles.searchBar}>
        <span>🔍</span>
        <input type="text" {...{placeholder: t('search_notes')}} value={filter}
          onChange={e => setFilter(e.target.value)} dir="rtl" />
        {filter && <button onClick={() => setFilter('')}>✕</button>}
      </div>

      {message && (
        <p role="alert" style={{ color: '#f87171', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>{message}</p>
      )}

      {confirmDel && (
        <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className={styles.modal} role="alertdialog" aria-modal="true">
            <h3>هل تريد حذف هذه الملاحظة؟</h3>
            <p style={{ fontSize: 14, color: 'var(--text2)' }}>
              {SURAHS_META[confirmDel.surah - 1]?.[0]} — الآية {confirmDel.ayah}
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>{t('cancel')}</button>
              <button className={styles.saveBtn} style={{ background: '#ef4444', color: '#fff' }} autoFocus
                onClick={() => doDelete(confirmDel.surah, confirmDel.ayah)}>🗑️ حذف</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className={styles.modal}>
            <h3>{isEditingExisting ? t('edit') : t('addNote')}</h3>
            <div className={styles.modalFields}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>{t('surah_label')}</label>
                  <select value={editing.surah}
                    onChange={e => setEditing(v => ({ ...v, surah: parseInt(e.target.value), ayah: '1' }))}>
                    {SURAHS_META.map((m, i) => <option key={i} value={i+1}>{i+1}. {m[0]}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>{t('ayah_label')}</label>
                  <input type="number" min="1" max={maxAyah} inputMode="numeric"
                    value={editing.ayah} onChange={e => setEditing(v => ({ ...v, ayah: e.target.value }))}
                    aria-invalid={!ayahValid} />
                </div>
              </div>
              {!ayahValid && (
                <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>
                  رقم الآية يجب أن يكون بين ١ و{String(maxAyah).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])}
                </p>
              )}
              {conflict && (
                <p style={{ color: '#f59e0b', fontSize: 12, margin: 0 }}>
                  ⚠️ توجد ملاحظة على هذه الآية وسيتم استبدالها
                  {' '}
                  {!isEditingExisting && (
                    <button type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--gold)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}
                      onClick={() => openEdit(conflict)}>
                      (تعديل الملاحظة الموجودة بدلاً من ذلك)
                    </button>
                  )}
                </p>
              )}
              <div className={styles.field}>
                <label>{t('note_label')}</label>
                <textarea rows={6} {...{placeholder: t('write_note')}} value={editing.text}
                  onChange={e => setEditing(v => ({ ...v, text: e.target.value }))} dir="rtl" autoFocus />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setEditing(null)}>{t('cancel')}</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !editing.text.trim() || !ayahValid}>
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
          {!filter && <button className={styles.createBtn} onClick={openNew}>إنشاء أول ملاحظة</button>}
        </div>
      ) : (
        <>
          <p className={styles.count}>{filtered.length} ملاحظة</p>
          <div className={styles.grid}>
            {filtered.map((note, i) => {
              const meta = SURAHS_META[note.surah - 1];
              const date = note.updated_at ? new Date(note.updated_at).toLocaleDateString('ar-EG', { day:'numeric', month:'short' }) : '';
              return (
                <div key={noteKey(note)} className={styles.card}>
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
                    <button onClick={() => openEdit(note)}>✏️ تعديل</button>
                    <button className={styles.deleteBtn} onClick={() => setConfirmDel({ surah: note.surah, ayah: note.ayah })}>🗑️</button>
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

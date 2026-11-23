// ─── Notes ───────────────────────────────────────────────────────────────────
// Personal notes on ayahs (nq_notes), merged with the account when signed in.
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { saveNote, loadNotes, deleteNote } from '../backend';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import { normalizeArabic } from '../arabic';
import { PageHero, Icon, Badge8, Corners, Divider, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { useAyahText } from './FavoritesPage/ayahText';
import styles from './NotesPage.module.css';

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
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  // editing: { surah, ayah (نص الحقل), text, origSurah?, origAyah? }
  const [editing, setEditing] = useState(null);
  const [filter,  setFilter]  = useState('');
  const [order,   setOrder]   = useState('recent'); // recent | mushaf
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
      if (ok === false) setMessage('تعذّر حفظ الملاحظة على حسابك — حُفظت على هذا الجهاز فقط');
    }
    setEditing(null); setSaving(false);
    setGlobal({ toast: 'حُفظت الملاحظة' });
  }

  async function doDelete(surah, ayah) {
    setConfirmDel(null); setMessage('');
    const next = notes.filter(n => !sameAyah(n, surah, ayah));
    setNotes(next);
    saveLocal(loadLocal().filter(n => !sameAyah(n, surah, ayah)));
    if (user) {
      const ok = await deleteNote(user.id, surah, ayah).catch(() => false);
      if (ok === false) setMessage('تعذّر حذف الملاحظة من حسابك — حُذفت من هذا الجهاز فقط');
    }
  }

  function goToAyah(surah, ayah) {
    setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
    navigate('/reader');
  }

  const qNorm = normalizeArabic(filter).trim();
  const filtered = useMemo(() => {
    const out = notes.filter(n => {
      if (!qNorm) return true;
      return normalizeArabic(n.text).includes(qNorm)
        || normalizeArabic(SURAHS_META[n.surah - 1]?.[0] || '').includes(qNorm)
        || String(n.surah).includes(filter.trim());
    });
    if (order === 'mushaf') out.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
    return out;
  }, [notes, qNorm, filter, order]);
  const surahCount = useMemo(() => new Set(notes.map(n => n.surah)).size, [notes]);

  return (
    <div className={styles.page}>
      <PageHero eyebrow="دفتر التدبّر" title="ملاحظاتي" sub="خواطرك وفوائدك على الآيات، محفوظة مع موضعها في المصحف.">
        <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />ملاحظة جديدة</button>
      </PageHero>

      <div className={`nq-wrap ${styles.body}`}>
        {!authLoading && !user && (
          <div className={styles.notice} role="note">
            <Icon name="lock" />
            <span>ملاحظاتك محفوظة على هذا الجهاز فقط. سجّل الدخول لتصلك على كل أجهزتك.</span>
            <Link to="/login" className="nq-btn ghost sm">تسجيل الدخول</Link>
          </div>
        )}
        {message && <p className={styles.alert} role="alert"><Icon name="x" />{message}</p>}

        {loading ? (
          <div className={styles.grid} aria-busy="true" aria-label="جارٍ تحميل الملاحظات">
            {[0, 1, 2].map(i => <div key={i} className={`nq-card ${styles.skel}`}><span /><span /><span /></div>)}
          </div>
        ) : notes.length === 0 ? (
          <div className={`nq-card ${styles.empty}`}>
            <Corners />
            <Badge8 icon="pen" size={84} />
            <h2 className={styles.emptyTitle}>دفترك ينتظر أول خاطرة</h2>
            <p className={styles.emptyText}>اكتب ملاحظة على أي آية: فائدة سمعتها، أو معنى استوقفك، أو دعاء تذكّرته. تجدها هنا، وتنتقل منها إلى الآية في المصحف.</p>
            <Divider />
            <div className={styles.emptyActs}>
              <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />اكتب أول ملاحظة</button>
              <Link to="/reader" className="nq-btn ghost"><Icon name="book" />افتح المصحف</Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.tools}>
              <label className={`nq-input ${styles.search}`}>
                <Icon name="search" />
                <input type="search" value={filter} onChange={e => setFilter(e.target.value)} dir="rtl"
                  placeholder="ابحث في ملاحظاتك أو باسم السورة" aria-label="ابحث في الملاحظات" />
                {filter && <button type="button" className={styles.clear} onClick={() => setFilter('')} aria-label="مسح البحث"><Icon name="x" /></button>}
              </label>
              <div className="nq-seg" role="group" aria-label="الترتيب">
                <button type="button" aria-pressed={order === 'recent'} onClick={() => setOrder('recent')}>الأحدث</button>
                <button type="button" aria-pressed={order === 'mushaf'} onClick={() => setOrder('mushaf')}>ترتيب المصحف</button>
              </div>
            </div>
            <p className={styles.count} aria-live="polite">
              <b className="nq-num">{toAr(filtered.length)}</b> {filtered.length === notes.length ? 'ملاحظة' : `من ${toAr(notes.length)} ملاحظة`}
              <span aria-hidden="true"> · </span>على {toAr(surahCount)} سورة
            </p>

            {filtered.length === 0 ? (
              <div className={`nq-card ${styles.noRes}`}>
                <Badge8 icon="search" />
                <p>لا توجد ملاحظة تطابق «{filter}». جرّب كلمة أخرى أو اسم سورة.</p>
                <button type="button" className="nq-btn ghost sm" onClick={() => setFilter('')}>عرض كل الملاحظات</button>
              </div>
            ) : (
              <ul className={styles.grid}>
                {filtered.map(note => (
                  <NoteCard key={noteKey(note)} note={note}
                    onOpen={() => goToAyah(note.surah, note.ayah)}
                    onEdit={() => openEdit(note)}
                    onDelete={() => setConfirmDel({ surah: note.surah, ayah: note.ayah })} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {confirmDel && (
        <Modal onClose={() => setConfirmDel(null)} role="alertdialog" labelId="del-title" small>
          <Badge8 icon="x" />
          <h2 id="del-title" className={styles.modalTitle}>حذف هذه الملاحظة؟</h2>
          <p className={styles.muted}>سورة {SURAHS_META[confirmDel.surah - 1]?.[0]} · الآية {toAr(confirmDel.ayah)}. لا يمكن التراجع عن الحذف.</p>
          <div className={styles.modalActions}>
            <button type="button" className="nq-btn ghost" onClick={() => setConfirmDel(null)}>إلغاء</button>
            <button type="button" className={`nq-btn ${styles.danger}`} autoFocus
              onClick={() => doDelete(confirmDel.surah, confirmDel.ayah)}><Icon name="x" />حذف</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} labelId="edit-title">
          <h2 id="edit-title" className={styles.modalTitle}>{isEditingExisting ? 'تعديل الملاحظة' : 'ملاحظة جديدة'}</h2>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span>السورة</span>
              <select value={editing.surah}
                onChange={e => setEditing(v => ({ ...v, surah: parseInt(e.target.value), ayah: '1' }))}>
                {SURAHS_META.map((m, i) => <option key={i} value={i + 1}>{toAr(i + 1)}. {m[0]}</option>)}
              </select>
            </label>
            <label className={`${styles.field} ${styles.ayahField}`}>
              <span>الآية</span>
              <input type="number" min="1" max={maxAyah} inputMode="numeric"
                value={editing.ayah} onChange={e => setEditing(v => ({ ...v, ayah: e.target.value }))}
                aria-invalid={!ayahValid} />
            </label>
          </div>
          {!ayahValid && (
            <p className={styles.fieldErr}>رقم الآية يجب أن يكون بين ١ و{toAr(maxAyah)}</p>
          )}
          {ayahValid && <AyahPreview surah={editing.surah} ayah={ayahNum} />}
          {conflict && (
            <p className={styles.fieldWarn}>
              توجد ملاحظة على هذه الآية وستُستبدل.
              {!isEditingExisting && (
                <> <button type="button" className={styles.linkBtn} onClick={() => openEdit(conflict)}>عدّل الملاحظة الموجودة بدلاً من ذلك</button></>
              )}
            </p>
          )}
          <label className={styles.field}>
            <span>الملاحظة</span>
            <textarea rows={6} placeholder="اكتب ملاحظتك…" value={editing.text}
              onChange={e => setEditing(v => ({ ...v, text: e.target.value }))} dir="rtl" autoFocus />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className="nq-btn ghost" onClick={() => setEditing(null)}>إلغاء</button>
            <button type="button" className="nq-btn gold" onClick={handleSave} disabled={saving || !editing.text.trim() || !ayahValid}>
              <Icon name="check" />{saving ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ onClose, labelId, role = 'dialog', small, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = e => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); try { prev?.focus?.(); } catch {} };
  }, []);
  return (
    <div className="nq-overlay" style={{ zIndex: 200 }}>
      <div className="nq-scrim" onClick={onClose} />
      <div className={styles.modalPos}>
        <div ref={ref} className={`nq-card ${styles.modal} ${small ? styles.modalSm : ''}`} role={role} aria-modal="true" aria-labelledby={labelId}>
          <button type="button" className={`nq-ibtn ${styles.modalX}`} onClick={onClose} aria-label="إغلاق"><Icon name="x" /></button>
          {children}
        </div>
      </div>
    </div>
  );
}

function AyahPreview({ surah, ayah }) {
  const { text, failed } = useAyahText(surah, ayah);
  if (failed) return null;
  return (
    <div className={styles.preview}>
      {text ? <p className={`nq-q ${styles.previewQ}`} lang="ar">{text} <AyahMark n={ayah} /></p> : <span className={styles.qWait}><i /></span>}
    </div>
  );
}

function NoteCard({ note, onOpen, onEdit, onDelete }) {
  const meta = SURAHS_META[note.surah - 1];
  const name = meta?.[0] || '';
  const { text } = useAyahText(note.surah, note.ayah);
  const date = note.updated_at ? new Date(note.updated_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <li className={`nq-card ${styles.card}`}>
      <header className={styles.cardHead}>
        <Badge8 size={46}>{toAr(note.surah)}</Badge8>
        <div className={styles.cardTitle}>
          <h3>سورة {name}</h3>
          <span>الآية {toAr(note.ayah)}{date && <> · <time dateTime={note.updated_at}>{date}</time></>}</span>
        </div>
      </header>
      <button type="button" className={styles.quote} onClick={onOpen} aria-label={`افتح سورة ${name} عند الآية ${toAr(note.ayah)} في المصحف`}>
        {text
          ? <span className={`nq-q ${styles.quoteQ}`} lang="ar">{text} <AyahMark n={note.ayah} /></span>
          : <span className={styles.qWait} aria-hidden="true"><i /></span>}
      </button>
      <p className={styles.noteText}>{note.text}</p>
      <footer className={styles.cardActs}>
        <button type="button" className="nq-btn ghost sm" onClick={onOpen}><Icon name="book" />الآية في المصحف</button>
        <button type="button" className="nq-btn ghost sm" onClick={onEdit}><Icon name="pen" />تعديل</button>
        <button type="button" className={`nq-ibtn ${styles.del}`} onClick={onDelete} aria-label={`حذف الملاحظة على الآية ${toAr(note.ayah)} من سورة ${name}`}><Icon name="x" /></button>
      </footer>
    </li>
  );
}

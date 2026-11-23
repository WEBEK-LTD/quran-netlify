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
import { useTr, num, surahName, intlLocale } from '../l10n';
import { scoped, trCount } from '../locales/library';
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
  const tr = scoped(useTr());
  const trc = (key, n, vars) => trCount(tr, key, n, vars);
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
      if (ok === false) setMessage(tr('تعذّر حفظ الملاحظة على حسابك — حُفظت على هذا الجهاز فقط'));
    }
    setEditing(null); setSaving(false);
    setGlobal({ toast: tr('حُفظت الملاحظة') });
  }

  async function doDelete(surah, ayah) {
    setConfirmDel(null); setMessage('');
    const next = notes.filter(n => !sameAyah(n, surah, ayah));
    setNotes(next);
    saveLocal(loadLocal().filter(n => !sameAyah(n, surah, ayah)));
    if (user) {
      const ok = await deleteNote(user.id, surah, ayah).catch(() => false);
      if (ok === false) setMessage(tr('تعذّر حذف الملاحظة من حسابك — حُذفت من هذا الجهاز فقط'));
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
        || (SURAHS_META[n.surah - 1]?.[1] || '').toLowerCase().includes(filter.trim().toLowerCase())
        || String(n.surah).includes(filter.trim());
    });
    if (order === 'mushaf') out.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
    return out;
  }, [notes, qNorm, filter, order]);
  const surahCount = useMemo(() => new Set(notes.map(n => n.surah)).size, [notes]);

  return (
    <div className={styles.page}>
      <PageHero eyebrow={tr('دفتر التدبّر')} title={tr('ملاحظاتي')} sub={tr('خواطرك وفوائدك على الآيات، محفوظة مع موضعها في المصحف.')}>
        <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />{tr('ملاحظة جديدة')}</button>
      </PageHero>

      <div className={`nq-wrap ${styles.body}`}>
        {!authLoading && !user && (
          <div className={styles.notice} role="note">
            <Icon name="lock" />
            <span>{tr('ملاحظاتك محفوظة على هذا الجهاز فقط. سجّل الدخول لتصلك على كل أجهزتك.')}</span>
            <Link to="/login" className="nq-btn ghost sm">{tr('تسجيل الدخول')}</Link>
          </div>
        )}
        {message && <p className={styles.alert} role="alert"><Icon name="x" />{message}</p>}

        {loading ? (
          <div className={styles.grid} aria-busy="true" aria-label={tr('جارٍ تحميل الملاحظات')}>
            {[0, 1, 2].map(i => <div key={i} className={`nq-card ${styles.skel}`}><span /><span /><span /></div>)}
          </div>
        ) : notes.length === 0 ? (
          <div className={`nq-card ${styles.empty}`}>
            <Corners />
            <Badge8 icon="pen" size={84} />
            <h2 className={styles.emptyTitle}>{tr('دفترك ينتظر أول خاطرة')}</h2>
            <p className={styles.emptyText}>{tr('اكتب ملاحظة على أي آية: فائدة سمعتها، أو معنى استوقفك، أو دعاء تذكّرته. تجدها هنا، وتنتقل منها إلى الآية في المصحف.')}</p>
            <Divider />
            <div className={styles.emptyActs}>
              <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />{tr('اكتب أول ملاحظة')}</button>
              <Link to="/reader" className="nq-btn ghost"><Icon name="book" />{tr('افتح المصحف')}</Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.tools}>
              <label className={`nq-input ${styles.search}`}>
                <Icon name="search" />
                <input type="search" value={filter} onChange={e => setFilter(e.target.value)} dir={tr.dir === 'rtl' ? 'rtl' : 'auto'}
                  placeholder={tr('ابحث في ملاحظاتك أو باسم السورة')} aria-label={tr('ابحث في الملاحظات')} />
                {filter && <button type="button" className={styles.clear} onClick={() => setFilter('')} aria-label={tr('مسح البحث')}><Icon name="x" /></button>}
              </label>
              <div className="nq-seg" role="group" aria-label={tr('الترتيب')}>
                <button type="button" aria-pressed={order === 'recent'} onClick={() => setOrder('recent')}>{tr('الأحدث')}</button>
                <button type="button" aria-pressed={order === 'mushaf'} onClick={() => setOrder('mushaf')}>{tr('ترتيب المصحف')}</button>
              </div>
            </div>
            <p className={styles.count} aria-live="polite">
              <b className="nq-num">{toAr(filtered.length)}</b> {filtered.length === notes.length ? trc('ملاحظة', filtered.length) : trc('من {total} ملاحظة', notes.length, { total: toAr(notes.length) })}
              <span aria-hidden="true"> · </span>{trc('على {n} سورة', surahCount, { n: toAr(surahCount) })}
            </p>

            {filtered.length === 0 ? (
              <div className={`nq-card ${styles.noRes}`}>
                <Badge8 icon="search" />
                <p>{tr('لا توجد ملاحظة تطابق «{q}». جرّب كلمة أخرى أو اسم سورة.', { q: filter })}</p>
                <button type="button" className="nq-btn ghost sm" onClick={() => setFilter('')}>{tr('عرض كل الملاحظات')}</button>
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
          <h2 id="del-title" className={styles.modalTitle}>{tr('حذف هذه الملاحظة؟')}</h2>
          <p className={styles.muted}>{tr('سورة {name}', { name: surahName(confirmDel.surah, tr.lang) })} · {tr('الآية {n}', { n: toAr(confirmDel.ayah) })}. {tr('لا يمكن التراجع عن الحذف.')}</p>
          <div className={styles.modalActions}>
            <button type="button" className="nq-btn ghost" onClick={() => setConfirmDel(null)}>{tr('إلغاء')}</button>
            <button type="button" className={`nq-btn ${styles.danger}`} autoFocus
              onClick={() => doDelete(confirmDel.surah, confirmDel.ayah)}><Icon name="x" />{tr('حذف')}</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} labelId="edit-title">
          <h2 id="edit-title" className={styles.modalTitle}>{isEditingExisting ? tr('تعديل الملاحظة') : tr('ملاحظة جديدة')}</h2>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span>{tr('السورة')}</span>
              <select value={editing.surah}
                onChange={e => setEditing(v => ({ ...v, surah: parseInt(e.target.value), ayah: '1' }))}>
                {SURAHS_META.map((m, i) => <option key={i} value={i + 1}>{toAr(i + 1)}. {surahName(i + 1, tr.lang)}</option>)}
              </select>
            </label>
            <label className={`${styles.field} ${styles.ayahField}`}>
              <span>{tr('الآية')}</span>
              <input type="number" min="1" max={maxAyah} inputMode="numeric"
                value={editing.ayah} onChange={e => setEditing(v => ({ ...v, ayah: e.target.value }))}
                aria-invalid={!ayahValid} />
            </label>
          </div>
          {!ayahValid && (
            <p className={styles.fieldErr}>{tr('رقم الآية يجب أن يكون بين {min} و{max}', { min: toAr(1), max: toAr(maxAyah) })}</p>
          )}
          {ayahValid && <AyahPreview surah={editing.surah} ayah={ayahNum} />}
          {conflict && (
            <p className={styles.fieldWarn}>
              {tr('توجد ملاحظة على هذه الآية وستُستبدل.')}
              {!isEditingExisting && (
                <> <button type="button" className={styles.linkBtn} onClick={() => openEdit(conflict)}>{tr('عدّل الملاحظة الموجودة بدلاً من ذلك')}</button></>
              )}
            </p>
          )}
          <label className={styles.field}>
            <span>{tr('الملاحظة')}</span>
            <textarea rows={6} placeholder={tr('اكتب ملاحظتك…')} value={editing.text}
              onChange={e => setEditing(v => ({ ...v, text: e.target.value }))} dir={tr.dir === 'rtl' ? 'rtl' : 'auto'} autoFocus />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className="nq-btn ghost" onClick={() => setEditing(null)}>{tr('إلغاء')}</button>
            <button type="button" className="nq-btn gold" onClick={handleSave} disabled={saving || !editing.text.trim() || !ayahValid}>
              <Icon name="check" />{saving ? tr('جارٍ الحفظ…') : tr('حفظ')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ onClose, labelId, role = 'dialog', small, children }) {
  const tr = scoped(useTr());
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
          <button type="button" className={`nq-ibtn ${styles.modalX}`} onClick={onClose} aria-label={tr('إغلاق')}><Icon name="x" /></button>
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
      {text ? <p className={`nq-q ${styles.previewQ}`} lang="ar" dir="rtl">{text} <AyahMark n={ayah} /></p> : <span className={styles.qWait}><i /></span>}
    </div>
  );
}

function NoteCard({ note, onOpen, onEdit, onDelete }) {
  const tr = scoped(useTr());
  const name = surahName(note.surah, tr.lang) || '';
  const { text } = useAyahText(note.surah, note.ayah);
  const date = note.updated_at ? num(new Date(note.updated_at).toLocaleDateString(intlLocale(tr.lang), { day: 'numeric', month: 'long', year: 'numeric' }), tr.lang) : '';
  return (
    <li className={`nq-card ${styles.card}`}>
      <header className={styles.cardHead}>
        <Badge8 size={46}>{toAr(note.surah)}</Badge8>
        <div className={styles.cardTitle}>
          <h3>{tr('سورة {name}', { name })}</h3>
          <span>{tr('الآية {n}', { n: toAr(note.ayah) })}{date && <> · <time dateTime={note.updated_at}>{date}</time></>}</span>
        </div>
      </header>
      <button type="button" className={styles.quote} onClick={onOpen} aria-label={tr('افتح سورة {name} عند الآية {n} في المصحف', { name, n: toAr(note.ayah) })}>
        {text
          ? <span className={`nq-q ${styles.quoteQ}`} lang="ar" dir="rtl">{text} <AyahMark n={note.ayah} /></span>
          : <span className={styles.qWait} aria-hidden="true"><i /></span>}
      </button>
      <p className={styles.noteText} dir="auto">{note.text}</p>
      <footer className={styles.cardActs}>
        <button type="button" className="nq-btn ghost sm" onClick={onOpen}><Icon name="book" />{tr('الآية في المصحف')}</button>
        <button type="button" className="nq-btn ghost sm" onClick={onEdit}><Icon name="pen" />{tr('تعديل')}</button>
        <button type="button" className={`nq-ibtn ${styles.del}`} onClick={onDelete} aria-label={tr('حذف الملاحظة على الآية {n} من سورة {name}', { n: toAr(note.ayah), name })}><Icon name="x" /></button>
      </footer>
    </li>
  );
}

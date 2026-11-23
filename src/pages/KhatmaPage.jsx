import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useHifz, localDateStr, parseLocalDate } from '../hifzStore';
import { useAuth } from '../hooks/useAuth';
import { listKhatmat, createKhatma, updateKhatma, deleteKhatma as apiDeleteKhatma, errorMessage } from '../backend';
import styles from './KhatmaPage.module.css';
import { useT, useLang, useDir, TRANSLATIONS } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

const KHATMA_KEY = 'nq_khatmat';

function loadKhatmat() {
  try { return JSON.parse(localStorage.getItem(KHATMA_KEY) || '[]'); } catch { return []; }
}
function saveKhatmat(k) { try { localStorage.setItem(KHATMA_KEY, JSON.stringify(k)); } catch {} }

// UI type key ↔ API type (docs/API.md: reading|memorizing|daily|listening|review)
const toApiType   = key => (key === 'needsReview' ? 'review' : key);
const fromApiType = typ => (typ === 'review' ? 'needsReview' : typ);
// API Khatma → the shape this page renders
function fromApi(k) {
  return { id: k.id, start: k.start_date, end: k.end_date, type: fromApiType(k.type), notes: k.notes || '', created: k.created_at };
}
function toApi(form) {
  const key = typeKeyOf(form.type) || 'reading';
  return { type: toApiType(key), start_date: form.start, end_date: form.end, notes: form.notes || '' };
}
const mergedFlag = uid => `nq_khatmat_merged_${uid}`;

// Dates are stored as local 'YYYY-MM-DD' strings — parse them as local dates
function daysBetween(d1, d2) {
  const a = parseLocalDate(d1), b = parseLocalDate(d2);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

// Khatma type is stored as a stable key and translated on display.
const TYPE_KEYS = ['reading', 'memorizing', 'daily', 'listening', 'needsReview'];

// Older entries stored the translated label (in whatever UI language was active)
function typeKeyOf(stored) {
  if (!stored) return null;
  if (TYPE_KEYS.includes(stored)) return stored;
  for (const dict of Object.values(TRANSLATIONS || {})) {
    for (const key of TYPE_KEYS) {
      if (dict?.[key] === stored) return key;
    }
  }
  return null;
}

export default function KhatmaPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading } = useAuth();
  const { progressPct, completedSurahs } = useHifz(user?.id);
  const [khatmat, setKhatmat] = useState(loadKhatmat);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ start: localDateStr(), end: '', type: 'reading', notes: '' });
  const [editingId, setEditingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [formErr, setFormErr]   = useState('');
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  // Signed in → the account is the source of truth (merge this device's entries up once).
  // Signed out → localStorage.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setKhatmat(loadKhatmat()); setError(''); return; }
    let alive = true;
    (async () => {
      setListLoading(true); setError('');
      try {
        let server = await listKhatmat();
        let already = false;
        try { already = localStorage.getItem(mergedFlag(user.id)) === '1'; } catch {}
        const local = loadKhatmat();
        if (!already && local.length) {
          const sig = k => `${k.start}|${k.end}|${typeKeyOf(k.type) || k.type}`;
          const have = new Set(server.map(fromApi).map(sig));
          const toUpload = local.filter(k => k.start && k.end && !have.has(sig(k)));
          for (const k of toUpload) {
            try { await createKhatma(toApi(k)); } catch {}
          }
          if (toUpload.length) server = await listKhatmat();
        }
        try { localStorage.setItem(mergedFlag(user.id), '1'); } catch {}
        if (alive) setKhatmat(server.map(fromApi));
      } catch (e) {
        if (alive) { setError(errorMessage(e, 'تعذّر تحميل ختماتك من حسابك')); setKhatmat([]); }
      }
      if (alive) setListLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, authLoading]);

  function openNew() {
    setEditingId(null); setFormErr('');
    setForm({ start: localDateStr(), end: '', type: 'reading', notes: '' });
    setShowForm(true);
  }
  function openEdit(k) {
    setEditingId(k.id); setFormErr('');
    setForm({ start: k.start || localDateStr(), end: k.end || '', type: typeKeyOf(k.type) || 'reading', notes: k.notes || '' });
    setShowForm(true);
  }
  function closeForm() { if (!saving) { setShowForm(false); setEditingId(null); setFormErr(''); } }

  async function addKhatma() {
    if (!form.end) return;
    if (user) {
      setSaving(true); setFormErr('');
      try {
        const saved = editingId != null
          ? await updateKhatma(editingId, toApi(form))
          : await createKhatma(toApi(form));
        if (!aliveRef.current) return;
        const item = fromApi(saved);
        setKhatmat(prev => editingId != null ? prev.map(k => (k.id === editingId ? item : k)) : [item, ...prev]);
      } catch (e) {
        if (aliveRef.current) { setFormErr(errorMessage(e, 'تعذّر حفظ الختمة، حاول مجدداً')); setSaving(false); }
        return;
      }
      setSaving(false);
    } else {
      const next = editingId != null
        ? khatmat.map(k => (k.id === editingId ? { ...k, ...form } : k))
        : [{ ...form, id: Date.now(), created: new Date().toISOString() }, ...khatmat];
      setKhatmat(next); saveKhatmat(next);
    }
    setShowForm(false); setEditingId(null);
    setForm({ start: localDateStr(), end: '', type: 'reading', notes: '' });
  }

  async function deleteKhatma(id) {
    if (user) {
      setSaving(true); setError('');
      try {
        await apiDeleteKhatma(id);
        if (aliveRef.current) setKhatmat(prev => prev.filter(k => k.id !== id));
      } catch (e) {
        if (aliveRef.current) setError(errorMessage(e, 'تعذّر حذف الختمة، حاول مجدداً'));
      }
      if (aliveRef.current) { setSaving(false); setConfirmDel(null); }
      return;
    }
    const next = khatmat.filter(k => k.id !== id);
    setKhatmat(next); saveKhatmat(next); setConfirmDel(null);
  }

  const totalDays = khatmat.reduce((s, k) => s + Math.max(1, daysBetween(k.start, k.end)), 0);
  const avgDays   = khatmat.length ? Math.round(totalDays / khatmat.length) : 0;
  const fastest   = khatmat.length ? Math.min(...khatmat.map(k => Math.max(1, daysBetween(k.start, k.end)))) : 0;

  const typeLabel = stored => { const key = typeKeyOf(stored); return key ? t(key) : stored; };
  const thisYear  = String(new Date().getFullYear());
  const thisYearCount = khatmat.filter(k => typeof k.end === 'string' && k.end.startsWith(thisYear + '-')).length;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.topBar}>
        <Link to="/reader" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('khatmaTitle')}</h1>
        <LangSwitcher compact={true} />
        <button className={styles.newBtn} onClick={openNew}>{t('newKhatma')}</button>
      </div>

      {error && (
        <p role="alert" style={{ color: '#f87171', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>⚠️ {error}</p>
      )}
      {!user && !authLoading && (
        <p style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', margin: '0 0 12px' }}>
          💡 ختماتك محفوظة على هذا الجهاز — <Link to="/login" style={{ color: 'var(--gold)' }}>سجّل الدخول</Link> لمزامنتها مع حسابك
        </p>
      )}

      {/* Progress toward next khatma */}
      <div className={styles.progressCard}>
        <div className={styles.progressTop}>
          <div>
            <h3>{t('next_khatma')}</h3>
            <p>{completedSurahs} سورة من 114</p>
          </div>
          <div className={styles.pctCircle}>
            <svg viewBox="0 0 36 36">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="var(--border)" strokeWidth="2.5" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="var(--gold)" strokeWidth="2.5"
                strokeDasharray={`${progressPct}, 100`} strokeLinecap="round" />
            </svg>
            <span>{progressPct}%</span>
          </div>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
        <p className={styles.progressHint}>
          {progressPct === 100
            ? '✅ أتممت القرآن! سجّل ختمتك ↑'
            : `تبقّى ${114 - completedSurahs} سورة لإتمام الختمة`}
        </p>
      </div>

      {/* Stats */}
      {khatmat.length > 0 && (
        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <div className={styles.statNum}>{khatmat.length}</div>
            <div className={styles.statLbl}>{t('khatma_unit')}</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statNum}>{avgDays}</div>
            <div className={styles.statLbl}>{t('avg_days')}</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statNum}>{fastest}</div>
            <div className={styles.statLbl}>{t('fastest')}</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statNum}>{thisYearCount}</div>
            <div className={styles.statLbl}>هذه السنة</div>
          </div>
        </div>
      )}

      {/* Add form modal */}
      {showForm && (
        <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className={styles.modal}>
            <h3>{editingId != null ? 'تعديل الختمة' : 'تسجيل ختمة جديدة'}</h3>
            <div className={styles.fields}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>تاريخ البداية</label>
                  <input type="date" value={form.start}
                    onChange={e => setForm(v => ({ ...v, start: e.target.value }))} />
                </div>
                <div className={styles.field}>
                  <label>تاريخ الإتمام</label>
                  <input type="date" value={form.end} min={form.start}
                    onChange={e => setForm(v => ({ ...v, end: e.target.value }))} />
                </div>
              </div>
              <div className={styles.field}>
                <label>نوع الختمة</label>
                <div className={styles.typeGrid}>
                  {TYPE_KEYS.map(typ => (
                    <button key={typ}
                      className={`${styles.typeBtn} ${form.type === typ ? styles.typeActive : ''}`}
                      onClick={() => setForm(v => ({ ...v, type: typ }))}>
                      {t(typ)}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label>ملاحظة (اختياري)</label>
                <textarea rows={3} {...{placeholder: t('write_note')}}
                  value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}
                  dir="rtl" />
              </div>
            </div>
            {form.start && form.end && (
              <p className={styles.duration}>
                ⏱ المدة: {Math.max(1, daysBetween(form.start, form.end))} يوم
              </p>
            )}
            {formErr && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '0 0 10px' }}>⚠️ {formErr}</p>}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={closeForm}>{t('cancel')}</button>
              <button className={styles.saveBtn} onClick={addKhatma} disabled={!form.end || saving}>
                {saving ? '...' : editingId != null ? '💾 حفظ التعديل' : '🎉 تسجيل الختمة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className={styles.backdrop} onClick={() => setConfirmDel(null)}>
          <div className={styles.modal} style={{ maxWidth: 340 }}>
            <h3>حذف الختمة؟</h3>
            <p style={{ color: 'var(--text3)', marginBottom: 20, fontSize: 14 }}>
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)} disabled={saving}>لا</button>
              <button className={styles.deleteBtn} onClick={() => deleteKhatma(confirmDel)} disabled={saving}>{saving ? '...' : 'نعم، احذف'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Khatmat list */}
      {listLoading ? (
        <div className={styles.empty}><p>جارٍ تحميل ختماتك...</p></div>
      ) : khatmat.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📿</div>
          <p>لم تسجّل أي ختمة بعد</p>
          <small>بعد إتمام القرآن الكريم، سجّل ختمتك هنا لتحتفل بإنجازك وتتابع رحلتك</small>
          <button className={styles.newBtn} style={{ marginTop: 16 }}
            onClick={openNew}>
            تسجيل أول ختمة
          </button>
        </div>
      ) : (
        <div className={styles.list}>
          {khatmat.map((k, i) => {
            const days = Math.max(1, daysBetween(k.start, k.end));
            const endDate = parseLocalDate(k.end)?.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) || k.end;
            return (
              <div key={k.id} className={styles.card} style={{ animationDelay: `${i * 60}ms` }}>
                <div className={styles.cardNum}>{khatmat.length - i}</div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <span className={styles.typeBadge}>{typeLabel(k.type)}</span>
                    <span className={styles.cardDate}>{endDate}</span>
                  </div>
                  <div className={styles.cardDuration}>
                    <span>⏱ {days} يوم</span>
                    {k.notes && <span className={styles.cardNotes}>• {k.notes}</span>}
                  </div>
                  <div className={styles.cardRange}>
                    {k.start} ← {k.end}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className={styles.cardDelete} onClick={() => openEdit(k)} title="تعديل">✏️</button>
                  <button className={styles.cardDelete} onClick={() => setConfirmDel(k.id)} title="حذف">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

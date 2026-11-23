// ─── My khatmat ──────────────────────────────────────────────────────────────
// A calm log of completed khatmat (type, dates, notes) with add / edit / delete
// and a few stats. Signed in → the account (/me/khatmat) is the source of truth
// and this device's entries are merged up once; signed out → localStorage
// `nq_khatmat`.
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useHifz, localDateStr, parseLocalDate } from '../hifzStore';
import { useAuth } from '../hooks/useAuth';
import { listKhatmat, createKhatma, updateKhatma, deleteKhatma as apiDeleteKhatma, errorMessage } from '../backend';
import { TRANSLATIONS } from '../i18n';
import { PageHero, Icon, Badge8, Pattern, toAr } from '../components/ornaments/Ornaments';
import styles from './KhatmaPage.module.css';

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

// Khatma type is stored as a stable key and labelled on display.
const TYPE_KEYS = ['reading', 'memorizing', 'daily', 'listening', 'needsReview'];
const TYPES = {
  reading:     { label: 'قراءة',     icon: 'book' },
  memorizing:  { label: 'حفظ',       icon: 'star' },
  daily:       { label: 'ورد يومي',  icon: 'sun' },
  listening:   { label: 'استماع',    icon: 'head' },
  needsReview: { label: 'مراجعة',    icon: 'repeat' },
};

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

// Arabic counting of days: يوم · يومان · ٣–١٠ أيام · ١١+ يوماً
function daysAr(n) {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${toAr(n)} أيام`;
  return `${toAr(n)} يوماً`;
}
const fmtDate = (s, opts = { year: 'numeric', month: 'long', day: 'numeric' }) =>
  parseLocalDate(s)?.toLocaleDateString('ar-EG', opts) || s || '';

const EMPTY_FORM = () => ({ start: localDateStr(), end: '', type: 'reading', notes: '' });

export default function KhatmaPage() {
  const { user, loading: authLoading } = useAuth();
  const { progressPct, completedSurahs } = useHifz(user?.id);
  const [khatmat, setKhatmat] = useState(loadKhatmat);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
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
    setForm(EMPTY_FORM());
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
    setForm(EMPTY_FORM());
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

  const thisYear  = String(new Date().getFullYear());
  const thisYearCount = khatmat.filter(k => typeof k.end === 'string' && k.end.startsWith(thisYear + '-')).length;
  const byType = TYPE_KEYS.map(key => ({ key, n: khatmat.filter(k => (typeKeyOf(k.type) || 'reading') === key).length })).filter(x => x.n);

  const r = 52, circ = 2 * Math.PI * r;

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="سجلّ الختمات"
        title="ختماتي"
        ayah="ٱلَّذِينَ ءَاتَيْنَٰهُمُ ٱلْكِتَٰبَ يَتْلُونَهُۥ حَقَّ تِلَاوَتِهِۦٓ"
        ayahRef="سورة البقرة · ١٢١"
        sub="سجلٌّ هادئ لكل ختمة أتممتها: قراءةً أو حفظاً أو استماعاً."
      >
        <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />تسجيل ختمة</button>
        <Link className="nq-btn ghost" to="/khatma-group"><Icon name="users" />ختمة الروح</Link>
      </PageHero>

      <div className="nq-wrap">
        {error && <p role="alert" className={`${styles.note} ${styles.noteErr}`}>{error}</p>}
        {!user && !authLoading && (
          <p className={styles.note}>
            <Icon name="lock" />
            <span>ختماتك محفوظة على هذا الجهاز فقط. <Link to="/login">سجّل الدخول</Link> لمزامنتها مع حسابك.</span>
          </p>
        )}

        <div className={styles.grid}>
          {/* ── the log ── */}
          <section className={styles.main} aria-labelledby="kh-log">
            <div className={styles.secHead}>
              <h2 id="kh-log" className={styles.h2}>سجلّ الختمات</h2>
              {khatmat.length > 0 && <span className={styles.secMeta}>{toAr(khatmat.length)} {khatmat.length === 1 ? 'ختمة' : khatmat.length === 2 ? 'ختمتان' : khatmat.length <= 10 ? 'ختمات' : 'ختمة'}</span>}
            </div>

            {listLoading ? (
              <div className={styles.list} aria-busy="true">
                {[0, 1, 2].map(i => <div key={i} className={`nq-card ${styles.skel}`} />)}
              </div>
            ) : khatmat.length === 0 ? (
              <div className={`nq-card ${styles.empty}`}>
                <Pattern />
                <Badge8 icon="beads" size={64} />
                <p className={styles.emptyT}>لم تسجّل أي ختمة بعد</p>
                <p className={styles.muted}>إذا أتممت ختم القرآن الكريم، سجّل ختمتك هنا لتحفظ أثرها وتتابع رحلتك.</p>
                <button type="button" className="nq-btn gold" onClick={openNew}><Icon name="plus" />تسجيل أول ختمة</button>
              </div>
            ) : (
              <ol className={styles.list}>
                {khatmat.map((k, i) => {
                  const days = Math.max(1, daysBetween(k.start, k.end));
                  const key = typeKeyOf(k.type);
                  const tp = TYPES[key] || { label: k.type || TYPES.reading.label, icon: 'book' };
                  return (
                    <li key={k.id} className={styles.item} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                      <span className={styles.marker}><Badge8 size={48}>{toAr(khatmat.length - i)}</Badge8></span>
                      <article className={`nq-card ${styles.card}`}>
                        <div className={styles.cardTop}>
                          <span className="nq-pill on"><Icon name={tp.icon} />{tp.label}</span>
                          <span className={styles.dur}><Icon name="timer" />{daysAr(days)}</span>
                        </div>
                        <h3 className={styles.cardT}>أُتمّت في {fmtDate(k.end)}</h3>
                        <p className={styles.range}>من {fmtDate(k.start)} إلى {fmtDate(k.end)}</p>
                        {k.notes && <p className={styles.notes}>{k.notes}</p>}
                        <div className={styles.cardActs}>
                          <button type="button" className="nq-ibtn" onClick={() => openEdit(k)} aria-label="تعديل الختمة" title="تعديل"><Icon name="pen" /></button>
                          <button type="button" className={`nq-ibtn ${styles.del}`} onClick={() => setConfirmDel(k.id)} aria-label="حذف الختمة" title="حذف"><Icon name="x" /></button>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* ── aside: stats + next khatma ── */}
          <aside className={styles.aside}>
            {khatmat.length > 0 && (
              <div className={`nq-card ${styles.stats}`}>
                <h2 className={styles.h3}>في أرقام</h2>
                <div className={styles.statGrid}>
                  <div><b className="nq-num">{toAr(khatmat.length)}</b><small>ختمة مسجّلة</small></div>
                  <div><b className="nq-num">{toAr(thisYearCount)}</b><small>هذه السنة</small></div>
                  <div><b className="nq-num">{toAr(avgDays)}</b><small>متوسط المدة بالأيام</small></div>
                  <div><b className="nq-num">{toAr(fastest)}</b><small>أسرع ختمة بالأيام</small></div>
                </div>
                {byType.length > 0 && (
                  <div className={styles.types}>
                    {byType.map(({ key, n }) => (
                      <div key={key} className={styles.typeRow}>
                        <span><Icon name={TYPES[key].icon} />{TYPES[key].label}</span>
                        <span className={styles.typeBar} aria-hidden="true"><i style={{ width: `${(n / khatmat.length) * 100}%` }} /></span>
                        <b className="nq-num">{toAr(n)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={`nq-card ${styles.next}`}>
              <Pattern />
              <span className="nq-eyebrow">ختمتك القادمة حفظاً</span>
              <div className={styles.ringWrap}>
                <svg viewBox="0 0 120 120" className={styles.ring} role="img" aria-label={`حفظت ${toAr(progressPct)}٪ من القرآن`}>
                  <circle cx="60" cy="60" r={r} className={styles.ringBg} />
                  <circle cx="60" cy="60" r={r} className={styles.ringFg}
                    strokeDasharray={circ} strokeDashoffset={circ - (Math.min(100, progressPct) / 100) * circ} />
                </svg>
                <b className="nq-num">{toAr(String(progressPct).replace('.', '٫'))}٪</b>
              </div>
              <p className={styles.nextT}>{toAr(completedSurahs)} سورة من ١١٤</p>
              <p className={styles.muted}>
                {completedSurahs >= 114
                  ? 'أتممت حفظ القرآن الكريم، فسجّل ختمتك.'
                  : `بقي ${toAr(114 - completedSurahs)} سورة لإتمام الحفظ.`}
              </p>
              <Link className="nq-btn ghost sm" to="/hifz"><Icon name="star" />خريطة الحفظ</Link>
            </div>
          </aside>
        </div>
      </div>

      {showForm && (
        <Dialog labelId="kh-form-t" onClose={closeForm}>
          <h2 id="kh-form-t" className={styles.h3}>{editingId != null ? 'تعديل الختمة' : 'تسجيل ختمة جديدة'}</h2>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span>تاريخ البداية</span>
              <input className={styles.ctl} type="date" value={form.start}
                onChange={e => setForm(v => ({ ...v, start: e.target.value }))} />
            </label>
            <label className={styles.field}>
              <span>تاريخ الإتمام</span>
              <input className={styles.ctl} type="date" value={form.end} min={form.start}
                onChange={e => setForm(v => ({ ...v, end: e.target.value }))} />
            </label>
          </div>
          <div className={styles.field}>
            <span id="kh-type">نوع الختمة</span>
            <div className={styles.typeGrid} role="group" aria-labelledby="kh-type">
              {TYPE_KEYS.map(typ => (
                <button key={typ} type="button" className={styles.typeBtn} aria-pressed={form.type === typ}
                  onClick={() => setForm(v => ({ ...v, type: typ }))}>
                  <Icon name={TYPES[typ].icon} />{TYPES[typ].label}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.field}>
            <span>ملاحظة (اختياري)</span>
            <textarea className={`${styles.ctl} ${styles.ta}`} rows={3} placeholder="مثلاً: ختمة رمضان، جزء كل يوم بعد الفجر"
              value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} dir="rtl" />
          </label>
          {form.start && form.end && (
            <p className={styles.duration}><Icon name="timer" />المدة: {daysAr(Math.max(1, daysBetween(form.start, form.end)))}</p>
          )}
          {formErr && <p role="alert" className={styles.err}>{formErr}</p>}
          <div className={styles.dlgActs}>
            <button type="button" className="nq-btn gold" onClick={addKhatma} disabled={!form.end || saving}>
              <Icon name="check" />{saving ? 'جارٍ الحفظ…' : editingId != null ? 'حفظ التعديل' : 'تسجيل الختمة'}
            </button>
            <button type="button" className="nq-btn ghost" onClick={closeForm}>إلغاء</button>
          </div>
        </Dialog>
      )}

      {confirmDel && (
        <Dialog labelId="kh-del-t" onClose={() => { if (!saving) setConfirmDel(null); }} small>
          <h2 id="kh-del-t" className={styles.h3}>حذف الختمة؟</h2>
          <p className={styles.muted}>لا يمكن التراجع عن هذا الإجراء.</p>
          <div className={styles.dlgActs}>
            <button type="button" className={`nq-btn ${styles.dangerSolid}`} onClick={() => deleteKhatma(confirmDel)} disabled={saving}>
              {saving ? 'جارٍ الحذف…' : 'نعم، احذف'}
            </button>
            <button type="button" className="nq-btn ghost" onClick={() => setConfirmDel(null)} disabled={saving}>إلغاء</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ labelId, onClose, small, children }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    boxRef.current?.querySelector('input, button')?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="nq-overlay" role="presentation">
      <div className="nq-scrim" onClick={onClose} />
      <div ref={boxRef} className={`nq-card ${styles.dialog} ${small ? styles.dialogSm : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelId}>
        {children}
      </div>
    </div>
  );
}

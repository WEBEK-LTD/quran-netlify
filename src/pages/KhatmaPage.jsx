import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHifz, localDateStr, parseLocalDate } from '../hifzStore';
import styles from './KhatmaPage.module.css';
import { useT, useLang, useDir, TRANSLATIONS } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

const KHATMA_KEY = 'nq_khatmat';

function loadKhatmat() {
  try { return JSON.parse(localStorage.getItem(KHATMA_KEY) || '[]'); } catch { return []; }
}
function saveKhatmat(k) { localStorage.setItem(KHATMA_KEY, JSON.stringify(k)); }

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
  const { progressPct, completedSurahs } = useHifz();
  const [khatmat, setKhatmat] = useState(loadKhatmat);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ start: localDateStr(), end: '', type: 'reading', notes: '' });
  const [confirmDel, setConfirmDel] = useState(null);

  function addKhatma() {
    if (!form.end) return;
    const next = [
      { ...form, id: Date.now(), created: new Date().toISOString() },
      ...khatmat,
    ];
    setKhatmat(next); saveKhatmat(next);
    setShowForm(false);
    setForm({ start: localDateStr(), end: '', type: 'reading', notes: '' });
  }

  function deleteKhatma(id) {
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
        <button className={styles.newBtn} onClick={() => setShowForm(true)}>{t('newKhatma')}</button>
      </div>

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
        <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className={styles.modal}>
            <h3>تسجيل ختمة جديدة</h3>
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
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>{t('cancel')}</button>
              <button className={styles.saveBtn} onClick={addKhatma} disabled={!form.end}>
                🎉 تسجيل الختمة
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
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>لا</button>
              <button className={styles.deleteBtn} onClick={() => deleteKhatma(confirmDel)}>نعم، احذف</button>
            </div>
          </div>
        </div>
      )}

      {/* Khatmat list */}
      {khatmat.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📿</div>
          <p>لم تسجّل أي ختمة بعد</p>
          <small>بعد إتمام القرآن الكريم، سجّل ختمتك هنا لتحتفل بإنجازك وتتابع رحلتك</small>
          <button className={styles.newBtn} style={{ marginTop: 16 }}
            onClick={() => setShowForm(true)}>
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
                <button className={styles.cardDelete} onClick={() => setConfirmDel(k.id)} title="حذف">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

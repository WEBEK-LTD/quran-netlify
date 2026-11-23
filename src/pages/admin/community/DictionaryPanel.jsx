// Dictionary (القاموس): words with a severity, add / edit / delete, and a box to test any text against the filter.
import { useState, useEffect, useId } from 'react';
import { listDictionary, addDictionaryWord, updateDictionaryWord, deleteDictionaryWord, testDictionary } from '../../../adminApi';
import {
  styles, errMsg, useLoader, useDebounced, SectionCard, Ico, Modal, ConfirmDialog, FormError,
  ErrorLine, Empty, Pagination, PageLoader, fmtFull,
} from '../shared';
import { Icon } from '../../../components/ornaments/Ornaments';
import { LevelPill } from './common';

const PER_PAGE = 100;
const LEVELS = [['severe', 'شديدة'], ['possible', 'محتملة']];

export default function DictionaryPanel({ notify }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, level]);
  const list = useLoader(() => listDictionary({ q, level, page, perPage: PER_PAGE }), [q, level, page]);
  const items = list.data?.items || [];
  const total = list.data?.total ?? 0;
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);

  function askDelete(w) {
    setConfirm({
      title: 'حذف كلمة من القاموس', danger: true, icon: 'trash', confirmLabel: 'حذف الكلمة',
      message: `ستُحذف «${w.word}» من القاموس ولن تُحجب النصوص التي تحتويها بعد الآن.`,
      onConfirm: async () => {
        await deleteDictionaryWord(w.id);
        list.setData(d => d ? { ...d, items: d.items.filter(x => x.id !== w.id), total: Math.max(0, (d.total || 0) - 1) } : d);
        notify('ok', 'حُذفت الكلمة');
      },
    });
  }

  return (
    <div className={styles.cmPanel}>
      <div className={styles.cmTwo}>
        <AddWord onAdded={(w) => { list.setData(d => d ? { ...d, items: [w, ...d.items], total: (d.total || 0) + 1 } : d); }} notify={notify}/>
        <TestBox/>
      </div>

      <SectionCard icon="list" title="كلمات القاموس" action={<span className={styles.cmMeta}><b className="nq-num">{fmtFull(total)}</b> كلمة</span>}>
        <div className={styles.toolbar}>
          <label className={`nq-input ${styles.searchBox}`}>
            <Icon name="search"/>
            <input type="search" aria-label="بحث في القاموس" placeholder="بحث عن كلمة..." value={search} onChange={e => setSearch(e.target.value)}/>
          </label>
          <div className={`nq-seg ${styles.seg}`} role="group" aria-label="تصفية حسب الشدة">
            {[['', 'الكل'], ...LEVELS].map(([v, l]) => <button key={v || 'all'} type="button" aria-pressed={level === v} onClick={() => setLevel(v)}>{l}</button>)}
          </div>
        </div>
        {list.error && <ErrorLine message={list.error} onRetry={() => list.reload()}/>}
        {list.loading && !list.data ? <PageLoader/> : items.length === 0
          ? <Empty icon="search" text={q || level ? 'لا توجد كلمات مطابقة' : 'القاموس فارغ، أضف أول كلمة'}/>
          : (
            <ul className={styles.cmWords}>
              {items.map(w => (
                <li key={w.id} className={`${styles.cmWord} ${w.level === 'severe' ? styles.cmWordSevere : ''}`}>
                  <button type="button" className={styles.cmWordBtn} onClick={() => setEdit(w)} title={w.note || 'تعديل'}
                    aria-label={`تعديل «${w.word}» (${w.level === 'severe' ? 'شديدة' : 'محتملة'})`}>
                    <bdi>{w.word}</bdi><LevelPill level={w.level}/>
                    {w.note && <Ico name="info" className={styles.cmWordNote}/>}
                  </button>
                  <button type="button" className={styles.cmWordX} onClick={() => askDelete(w)} aria-label={`حذف «${w.word}»`}><Icon name="x"/></button>
                </li>
              ))}
            </ul>
          )}
        <Pagination page={page} perPage={list.data?.per_page || PER_PAGE} total={total} onPage={setPage} compact/>
      </SectionCard>

      {edit && <EditWord word={edit} onClose={() => setEdit(null)}
        onSaved={(w) => { list.setData(d => d ? { ...d, items: d.items.map(x => x.id === w.id ? w : x) } : d); notify('ok', 'حُفظ التعديل'); }}/>}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </div>
  );
}

function LevelSeg({ value, onChange, disabled, labelId }) {
  return (
    <div className={`nq-seg ${styles.seg}`} role="radiogroup" aria-labelledby={labelId}>
      {LEVELS.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function AddWord({ onAdded, notify }) {
  const [word, setWord] = useState('');
  const [level, setLevel] = useState('possible');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forced, setForced] = useState(null);
  const wid = useId(), lid = useId(), nid = useId();
  async function submit(e) {
    e.preventDefault();
    if (!word.trim()) return;
    setBusy(true); setError(null); setForced(null);
    try {
      const w = await addDictionaryWord({ word: word.trim(), level, note: note.trim() });
      onAdded(w);
      if (w && w.forced_possible) setForced(w.word);
      notify('ok', w && w.forced_possible ? 'أُضيفت الكلمة «محتملة» لأنها واردة في القرآن الكريم' : 'أُضيفت الكلمة');
      setWord(''); setNote('');
    } catch (err) { setError(errMsg(err)); }
    finally { setBusy(false); }
  }
  return (
    <SectionCard icon="plus" title="إضافة كلمة">
      <p className={styles.cmLegend}>
        <b className={styles.cmSevere}>شديدة</b>: لا يُنشر النص ويُوقف الحساب في المجتمع تلقائياً حتى يقرّر مشرف.{' '}
        <b className={styles.cmPossible}>محتملة</b>: لا يُنشر النص ويُرسل للمراجعة دون إيقاف.
      </p>
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={wid}>الكلمة أو العبارة</label>
          <input id={wid} className={styles.input} maxLength={100} value={word} onChange={e => setWord(e.target.value)} disabled={busy}
            placeholder="تُطابَق تلقائياً مع التشكيل والتكرار والفرانكو"/>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel} id={lid}>الشدة</span>
          <LevelSeg value={level} onChange={setLevel} disabled={busy} labelId={lid}/>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={nid}>ملاحظة <span className={styles.fieldHint}>(اختيارية، للمشرفين فقط)</span></label>
          <input id={nid} className={styles.input} maxLength={255} value={note} onChange={e => setNote(e.target.value)} disabled={busy}/>
        </div>
        {forced && <div className={styles.inlineWarn} role="status"><Ico name="info"/><span>«{forced}» واردة في القرآن الكريم، فحُفظت «محتملة» ولن توقف أي حساب تلقائياً.</span></div>}
        {error && <FormError text={error}/>}
        <button type="submit" className="nq-btn gold" disabled={busy || !word.trim()}><Ico name="plus"/>{busy ? 'جارٍ الإضافة...' : 'إضافة إلى القاموس'}</button>
      </form>
    </SectionCard>
  );
}

function TestBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const tid = useId();
  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try { setRes(await testDictionary(text)); }
    catch (err) { setError(errMsg(err)); setRes(null); }
    finally { setBusy(false); }
  }
  const m = res?.match;
  return (
    <SectionCard icon="search" title="جرّب نصاً">
      <form onSubmit={run} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={tid}>النص <span className={styles.fieldHint}>(لا يُحفظ شيء)</span></label>
          <textarea id={tid} className={styles.input} rows={3} maxLength={2000} value={text}
            onChange={e => { setText(e.target.value); setRes(null); }} placeholder="اكتب رسالة كما قد يكتبها مستخدم..."/>
        </div>
        <button type="submit" className="nq-btn ghost" disabled={busy || !text.trim()}>{busy ? 'جارٍ الفحص...' : 'افحص النص'}</button>
      </form>
      {error && <FormError text={error}/>}
      {res && (
        <div className={`${styles.testResult} ${m ? (m.level === 'severe' ? styles.testFail : styles.cmTestWarn) : res.has_link ? styles.cmTestWarn : styles.testOk}`} role="status">
          <Ico name={m || res.has_link ? 'alert' : 'check'}/>
          <div className={styles.cmTestBody}>
            {m
              ? <span>يطابق «<bdi>{m.word}</bdi>» <LevelPill level={m.level}/> {m.level === 'severe' ? '— لن يُنشر وسيُوقف الحساب تلقائياً.' : '— لن يُنشر وسيُرسل للمراجعة.'}</span>
              : <span>لا يطابق أي كلمة في القاموس.</span>}
            {res.has_link && <span>يحتوي رابطاً أو بريداً أو معرّف حساب، فيُرفض قبل فحص القاموس (الروابط ممنوعة).</span>}
            {res.forms && (
              <details className={styles.cmForms}>
                <summary>كيف قرأ الفلتر النص</summary>
                <dl>
                  {Array.isArray(res.forms.tokens) && <div><dt>الكلمات</dt><dd><bdi>{res.forms.tokens.join(' · ') || '—'}</bdi></dd></div>}
                  {res.forms.joined && <div><dt>بدون مسافات</dt><dd><bdi>{res.forms.joined}</bdi></dd></div>}
                  {Array.isArray(res.forms.franco) && res.forms.franco.length > 0 && <div><dt>الفرانكو</dt><dd><bdi>{res.forms.franco.join(' · ')}</bdi></dd></div>}
                  {Array.isArray(res.forms.latin) && res.forms.latin.length > 0 && <div><dt>لاتيني</dt><dd><bdi>{res.forms.latin.join(' · ')}</bdi></dd></div>}
                </dl>
              </details>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function EditWord({ word, onClose, onSaved }) {
  const [level, setLevel] = useState(word.level);
  const [note, setNote] = useState(word.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lid = useId(), nid = useId();
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const w = await updateDictionaryWord(word.id, { level, note: note.trim() });
      onSaved(w && typeof w === 'object' ? w : { ...word, level, note: note.trim() });
      onClose();
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  }
  return (
    <Modal title={`تعديل «${word.word}»`} icon="pen" onClose={onClose} busy={busy}>
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.field}>
          <span className={styles.fieldLabel} id={lid}>الشدة</span>
          <LevelSeg value={level} onChange={setLevel} disabled={busy} labelId={lid}/>
        </div>
        {level === 'severe' && word.level !== 'severe' && (
          <p className={styles.modalNote}>بعد الحفظ، أي نص يحتوي هذه الكلمة يُوقف صاحبه في المجتمع تلقائياً.</p>
        )}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={nid}>ملاحظة</label>
          <input id={nid} className={styles.input} maxLength={255} value={note} onChange={e => setNote(e.target.value)} disabled={busy} data-autofocus/>
        </div>
        {error && <FormError text={error}/>}
        <div className={styles.modalActions}>
          <button type="submit" className="nq-btn gold" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          <button type="button" className="nq-btn ghost" onClick={onClose} disabled={busy}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}


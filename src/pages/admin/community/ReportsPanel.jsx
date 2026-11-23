// Reports queue (بلاغات المستخدمين) and held content (المحتوى المحجوز بالقاموس): one list, two sources.
import { useState, useEffect } from 'react';
import { listCommunityReports, getCommunityReport, decideCommunityReport } from '../../../adminApi';
import {
  styles, errMsg, useLoader, Pill, Ico, ConfirmDialog, ErrorBox, Empty, Pagination, PageLoader, fmtDate,
} from '../shared';
import {
  TYPE_LABEL, TYPE_TONE, CONTEXT_LABEL, DECISION_LABEL, SCOPE_LABEL, GENDER_SCOPE,
  LevelPill, PersonRef, Evidence, BlurPhoto, SuspendModal, nameOf, when,
} from './common';

const PER_PAGE = 15;
const STATUS = [['open', 'مفتوحة'], ['actioned', 'تم اتخاذ إجراء'], ['dismissed', 'مرفوضة'], ['all', 'الكل']];
const TYPES = [['', 'الكل'], ['room_message', 'رسالة في غرفة'], ['dm_message', 'رسالة خاصة'], ['user', 'حساب'],
  ['photo', 'صورة'], ['room', 'غرفة'], ['group', 'جروب'], ['group_photo', 'صورة جروب']];
const DONE_TEXT = { community: 'تم الإيقاف في المجتمع', rooms: 'تم الحظر من الغرف', app: 'تم الحظر من التطبيق' };
const SCOPE_ACTION = { community: 'suspend', rooms: 'ban_rooms', app: 'ban_app' };

export default function ReportsPanel({ mode, notify, onChanged, onOpenUser, onGoSuspensions }) {
  const held = mode === 'held';
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [status, type]);

  const list = useLoader(() => listCommunityReports({
    status, source: held ? 'dictionary' : 'user', type: held ? 'held' : type, page, perPage: PER_PAGE,
  }), [held, status, type, page]);
  const items = list.data?.items || [];
  const total = list.data?.total ?? 0;

  const [confirm, setConfirm] = useState(null);
  const [suspend, setSuspend] = useState(null); // {report, scope}
  const [busy, setBusy] = useState(null);

  function replace(rep) {
    // a decided report leaves the «open» view; elsewhere it is updated in place
    list.setData(d => d ? {
      ...d,
      items: status === 'open' && rep.status !== 'open' ? d.items.filter(x => x.id !== rep.id) : d.items.map(x => x.id === rep.id ? { ...x, ...rep } : x),
      total: status === 'open' && rep.status !== 'open' ? Math.max(0, (d.total || 0) - 1) : d.total,
    } : d);
    onChanged && onChanged();
  }

  async function decide(rep, body, okText) {
    const out = await decideCommunityReport(rep.id, body);
    replace(out && typeof out === 'object' ? out : { ...rep, status: body.action === 'dismiss' ? 'dismissed' : 'actioned', decision: body.action });
    notify('ok', okText);
  }

  async function quick(rep, body, okText) {
    setBusy(rep.id + ':' + body.action);
    try { await decide(rep, body, okText); }
    catch (e) { notify('err', errMsg(e)); }
    finally { setBusy(null); }
  }

  function ask(rep, { title, message, label, action, okText, danger = true, icon }) {
    setConfirm({ title, message, confirmLabel: label, danger, icon, onConfirm: () => decide(rep, { action }, okText) });
  }

  return (
    <div className={styles.cmPanel}>
      <div className={styles.cmFilters}>
        <div className={`nq-seg ${styles.seg}`} role="group" aria-label="حالة البلاغ">
          {STATUS.map(([v, l]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>)}
        </div>
        {!held && (
          <div className={styles.cmChips} role="group" aria-label="نوع البلاغ">
            {TYPES.map(([v, l]) => (
              <button key={v || 'all'} type="button" className={`nq-pill ${type === v ? 'on' : ''} ${styles.filterPill}`}
                aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {held && status === 'open' && (
        <div className={styles.helper}>
          <Ico name="info"/>
          <p>
            نصوص احتوت كلمة من القاموس فلم تُنشر. <b>محتملة</b>: لم يُوقف صاحبها، فقرّر: اعتمادها (الرسالة الخاصة تُسلَّم
            لمستلمها الآن، وغيرها يستطيع صاحبه إعادة إرساله) أو رفضها وحذفها. <b>شديدة</b>: أُوقف صاحبها تلقائياً، وقرار
            إعادة تفعيله أو قفله نهائياً في «الحسابات الموقوفة».
          </p>
        </div>
      )}

      {list.error && <ErrorBox message={list.error} onRetry={() => list.reload()}/>}
      {list.loading && !list.data ? <PageLoader/> : !list.error && (
        <>
          <div className={styles.resultCount}><b className="nq-num">{total}</b> {held ? 'نص محجوز' : 'بلاغ'}</div>
          {items.length === 0
            ? <div className={`nq-card ${styles.card}`}><Empty icon="check" text={status === 'open' ? (held ? 'لا يوجد محتوى ينتظر المراجعة' : 'لا توجد بلاغات مفتوحة') : 'لا توجد نتائج'}/></div>
            : (
              <div className={styles.cmList}>
                {items.map(rep => (
                  <ReportCard key={rep.id} rep={rep} held={held} busy={busy}
                    onOpenUser={onOpenUser} onGoSuspensions={onGoSuspensions}
                    onQuick={quick} onAsk={ask}
                    onSuspend={(scope) => setSuspend({ report: rep, scope })}/>
                ))}
              </div>
            )}
          <Pagination page={page} perPage={list.data?.per_page || PER_PAGE} total={total} onPage={setPage}/>
        </>
      )}

      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
      {suspend && (
        <SuspendModal user={suspend.report.target_user} scope={suspend.scope} lockScope
          canAlsoDelete={['room_message', 'dm_message', 'held', 'photo', 'group_photo'].includes(suspend.report.target_type)}
          alsoDeleteLabel={suspend.report.target_type.endsWith('photo') ? 'احذف الصورة أيضاً' : 'احذف المحتوى المبلّغ عنه أيضاً'}
          onClose={() => setSuspend(null)}
          onSubmit={({ scope, durationDays, note, alsoDelete }) => decide(suspend.report,
            { action: SCOPE_ACTION[scope], durationDays, note, alsoDelete },
            DONE_TEXT[scope])}/>
      )}
    </div>
  );
}

function ReportCard({ rep, held, busy, onQuick, onAsk, onSuspend, onOpenUser, onGoSuspensions }) {
  const [history, setHistory] = useState(null); // {loading|error|data}
  const open = rep.status === 'open';
  const t = rep.target_type;
  const snap = rep.snapshot || {};
  const cur = rep.current;
  const u = rep.target_user;
  const severe = rep.level === 'severe';
  const isBusy = (a) => busy === rep.id + ':' + a;

  async function loadHistory() {
    if (history?.data) { setHistory(null); return; }
    setHistory({ loading: true });
    try { setHistory({ data: await getCommunityReport(rep.id) }); }
    catch (e) { setHistory({ error: errMsg(e) }); }
  }

  // ── what was reported ──
  let body = null;
  if (t === 'room_message' || t === 'dm_message') {
    const gone = !cur;
    body = <>
      <Evidence label="الرسالة" text={snap.body ?? cur?.body}/>
      {gone && <span className={styles.cmGone}>حُذفت الرسالة من المحادثة بعد البلاغ</span>}
    </>;
  } else if (t === 'held') {
    const ctx = snap.context || rep.details;
    body = <>
      <Evidence label={CONTEXT_LABEL[ctx] || ctx || 'النص'} text={snap.body ?? cur?.body} matched={snap.matched || cur?.matched}/>
      {(snap.matched || cur?.matched) && <span className={styles.cmMeta}>الكلمة المطابقة في القاموس: <b><bdi>{snap.matched || cur?.matched}</bdi></b></span>}
    </>;
  } else if (t === 'photo') {
    body = <div className={styles.cmPhotoRow}><BlurPhoto src={cur?.avatar_url ?? snap.avatar_url} alt={`صورة ${nameOf(u)}`}/>
      <p className={styles.cmMeta}>تظهر الصورة مموّهة حتى تضغط لعرضها. حذفها يعيد البروفايل إلى أول حرف من الاسم.</p></div>;
  } else if (t === 'group_photo') {
    body = <div className={styles.cmPhotoRow}><BlurPhoto src={cur?.photo_url ?? snap.photo_url} alt="صورة الجروب"/>
      <p className={styles.cmMeta}>الجروب: «{cur?.name || snap.name || '—'}» (رقم {rep.target_id})</p></div>;
  } else if (t === 'group') {
    body = <>
      <Evidence label="اسم الجروب" text={cur?.name ?? snap.name}/>
      {(cur?.description ?? snap.description) && <Evidence label="الوصف" text={cur?.description ?? snap.description}/>}
      {(cur?.photo_url ?? snap.photo_url) && <div className={styles.cmPhotoRow}><BlurPhoto src={cur?.photo_url ?? snap.photo_url} alt="صورة الجروب"/></div>}
      {!cur && <span className={styles.cmGone}>حُذف الجروب</span>}
    </>;
  } else if (t === 'room') {
    body = <>
      <Evidence label="عنوان الغرفة" text={cur?.title ?? snap.title}/>
      <span className={styles.cmMeta}>
        {GENDER_SCOPE[cur?.gender_scope ?? snap.gender_scope] || ''}{cur?.status ? ` · ${cur.status === 'open' ? 'مفتوحة الآن' : cur.status === 'scheduled' ? 'مجدولة' : 'مغلقة'}` : ''}
      </span>
    </>;
  } else { // user
    body = <>
      {(snap.avatar_url || cur?.avatar_url) && <div className={styles.cmPhotoRow}><BlurPhoto src={cur?.avatar_url ?? snap.avatar_url} alt={`صورة ${nameOf(u)}`}/></div>}
      {snap.bio && <Evidence label="النبذة" text={snap.bio}/>}
    </>;
  }

  // ── actions for this kind ──
  const btn = (action, label, { danger, icon, confirm: c } = {}) => (
    <button key={action + label} type="button" className={`nq-btn sm ${danger ? styles.btnOutlineDanger : 'ghost'}`}
      disabled={!!busy} onClick={() => c ? onAsk(rep, c) : onQuick(rep, { action }, label)}>
      {icon && <Ico name={icon}/>}{isBusy(action) ? 'جارٍ...' : label}
    </button>
  );
  const suspendBtns = (u ? [
    <button key="s" type="button" className="nq-btn sm ghost" disabled={!!busy} onClick={() => onSuspend('community')}>إيقاف في المجتمع</button>,
    <button key="r" type="button" className="nq-btn sm ghost" disabled={!!busy} onClick={() => onSuspend('rooms')}>{t === 'room' ? 'حظر المضيف من الغرف' : 'حظر من الغرف'}</button>,
    <button key="a" type="button" className={`nq-btn sm ${styles.btnOutlineDanger}`} disabled={!!busy} onClick={() => onSuspend('app')}>حظر من التطبيق</button>,
  ] : []);
  const delMsg = {
    room_message: ['حذف الرسالة', 'ستُحذف الرسالة من قاعدة البيانات نهائياً.'],
    dm_message: ['حذف الرسالة', 'ستُحذف الرسالة الخاصة من المحادثة عند الطرفين ومن قاعدة البيانات نهائياً.'],
    held: ['رفض وحذف', 'لن يُنشر هذا النص، وسيُحذف الدليل المحفوظ نهائياً.'],
    room: ['إغلاق الغرفة', 'ستُغلق الغرفة فوراً ويخرج كل من فيها، ويُحذف الشات غير المبلّغ عنه.'],
    group: ['حذف الجروب', 'سيُحذف الجروب نهائياً بأعضائه وصورته، ولا يمكن التراجع.'],
  };
  let actions = [];
  if (t in delMsg && cur && (t !== 'room' || ['open', 'scheduled'].includes(cur.status)) && !(held && severe)) {
    const [label, message] = delMsg[t];
    actions.push(btn('delete_content', label, { danger: true, icon: 'trash', confirm: { title: label, message, label, action: 'delete_content', okText: `تم: ${label}`, icon: 'trash' } }));
  }
  if (t === 'photo' || t === 'group_photo' || (t === 'user' && (cur?.avatar_url || snap.avatar_url)) || (t === 'group' && (cur?.photo_url))) {
    const label = t === 'group' || t === 'group_photo' ? 'حذف صورة الجروب' : 'حذف الصورة';
    actions.push(btn('remove_photo', label, { danger: true, icon: 'trash', confirm: { title: label, message: 'ستُحذف الصورة نهائياً من الخادم.', label, action: 'remove_photo', okText: 'تم حذف الصورة', icon: 'trash' } }));
  }
  if (held && (snap.context === 'dm') && !severe) {
    actions.unshift(btn('release', 'اعتماد وتسليم الرسالة', { icon: 'send', confirm: {
      title: 'اعتماد الرسالة', danger: false, icon: 'send', label: 'تسليم الرسالة', action: 'release', okText: 'سُلّمت الرسالة لمستلمها',
      message: 'ستصل هذه الرسالة الخاصة إلى مستلمها الآن كما كُتبت، ويُغلق البلاغ.' } }));
  }
  actions = actions.concat(severe && held ? [] : suspendBtns);
  const dismissLabel = !held ? 'رفض البلاغ' : severe ? 'إغلاق البلاغ' : snap.context === 'dm' ? 'لا مخالفة (دون تسليم)' : 'اعتماد: لا مخالفة';

  return (
    <article className={`${styles.cmItem} ${open && (severe || t === 'room_message' || t === 'dm_message') ? styles.cmItemHot : ''}`}>
      <div className={styles.cmItemHead}>
        <Pill tone={TYPE_TONE[t] || 'muted'}>{held ? (CONTEXT_LABEL[snap.context] || TYPE_LABEL[t]) : (TYPE_LABEL[t] || t)}</Pill>
        {rep.level && <LevelPill level={rep.level}/>}
        <PersonRef user={u} onOpen={onOpenUser} prefix={held ? <span className={styles.faint}>كاتبها: </span> : <span className={styles.faint}>ضد: </span>}/>
        <span className={styles.cmMeta}>
          {!held && <>· أبلغ: {rep.reporter ? nameOf(rep.reporter) : 'غير معروف'} </>}· {when(rep.created_at)}
        </span>
        {!held && <span className={styles.cmReason}><Pill tone="muted">السبب: {rep.reason_label || rep.reason}</Pill></span>}
      </div>
      {!held && rep.details && <p className={styles.cmDetails}>تفاصيل المُبلِّغ: <bdi>{rep.details}</bdi></p>}
      {body}

      {held && severe && open && (
        <div className={styles.inlineWarn}>
          <Ico name="alert"/>
          <span>أُوقف الحساب تلقائياً في المجتمع حتى تقرّر. <button type="button" className={styles.linkBtn} onClick={onGoSuspensions}>اذهب إلى الحسابات الموقوفة</button></span>
        </div>
      )}

      {!open && (
        <div className={styles.cmDecided}>
          <Pill tone={rep.status === 'dismissed' ? 'muted' : 'ok'} icon="check">{DECISION_LABEL[rep.decision] || (rep.status === 'dismissed' ? 'مرفوض' : 'تم الإجراء')}</Pill>
          {rep.decision_note && <span>ملاحظة: <bdi>{rep.decision_note}</bdi></span>}
          {rep.decided_at && <span className={styles.faint}>{fmtDate(rep.decided_at)}</span>}
        </div>
      )}

      {history && (
        <div className={styles.cmHistory} role="status">
          {history.loading && <span className={styles.faint}>جارٍ التحميل...</span>}
          {history.error && <span className={styles.errorTxt}>{history.error}</span>}
          {history.data && (history.data.user_history ? (
            <>
              <span>بلاغات على الحساب: <b className="nq-num">{history.data.user_history.reports}</b></span>
              <span>نصوص محجوزة: <b className="nq-num">{history.data.user_history.held}</b></span>
              <span>الإيقاف: {history.data.user_history.suspension
                ? <b>{SCOPE_LABEL[history.data.user_history.suspension.scope] || history.data.user_history.suspension.scope}{' · '}
                  {history.data.user_history.suspension.until ? `حتى ${fmtDate(history.data.user_history.suspension.until)}` : 'بلا مدة'}
                  {Number(history.data.user_history.suspension.locked) === 1 ? ' · نهائي' : ''}</b>
                : <b>لا يوجد</b>}</span>
            </>
          ) : <span className={styles.faint}>لا يوجد حساب مرتبط بهذا البلاغ.</span>)}
        </div>
      )}

      <div className={styles.cmActions}>
        {open && actions}
        <span className={styles.cmActEnd}>
          {u && <button type="button" className="nq-btn sm ghost" onClick={loadHistory} aria-expanded={!!history?.data}>
            <Ico name="scroll"/>{history?.data ? 'إخفاء السجل' : 'سجل الحساب'}
          </button>}
          {open && (
            <button type="button" className={`nq-btn sm ghost ${styles.cmDismiss}`} disabled={!!busy}
              onClick={() => onQuick(rep, { action: 'dismiss' }, held ? 'أُغلق البلاغ دون إجراء' : 'تم رفض البلاغ')}>
              {isBusy('dismiss') ? 'جارٍ...' : dismissLabel}
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

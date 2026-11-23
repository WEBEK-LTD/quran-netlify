// Shared pieces for the community moderation tab (الإشراف): labels, pills, evidence text,
// the blurred photo and the suspend / ban modal.
import { useState, useId } from 'react';
import { suspendCommunityUser } from '../../../adminApi';
import { styles, errMsg, Pill, Ico, Modal, FormError, timeAgo, fmtDate } from '../shared';

export const TYPE_LABEL = {
  user: 'حساب', photo: 'صورة بروفايل', room_message: 'رسالة في غرفة', dm_message: 'رسالة خاصة',
  room: 'غرفة', group: 'جروب', group_photo: 'صورة جروب', held: 'محتوى محجوز',
};
export const TYPE_TONE = {
  user: 'info', photo: 'gold', room_message: 'danger', dm_message: 'danger',
  room: 'ok', group: 'ok', group_photo: 'gold', held: 'warn',
};
export const CONTEXT_LABEL = {
  dm: 'رسالة خاصة', room_chat: 'شات غرفة', room_title: 'عنوان غرفة', group_name: 'اسم جروب',
  group_description: 'وصف جروب', bio: 'نبذة البروفايل',
};
export const SCOPE_LABEL = { community: 'المجتمع كله', rooms: 'الغرف فقط', app: 'التطبيق كله' };
export const GENDER_SCOPE = { men: 'رجال', women: 'نساء', mixed: 'مختلطة' };
export const GENDER = { male: 'ذكر', female: 'أنثى' };
export const DECISION_LABEL = {
  dismiss: 'رُفض البلاغ', delete_content: 'حُذف المحتوى', remove_photo: 'حُذفت الصورة', suspend: 'أُوقف في المجتمع',
  ban_rooms: 'حُظر من الغرف', ban_app: 'حُظر من التطبيق', release: 'مُرّرت الرسالة', reactivate: 'أُعيد تفعيله', lock: 'قُفل نهائياً',
};

export function LevelPill({ level }) {
  if (level === 'severe') return <Pill tone="danger">شديدة</Pill>;
  if (level === 'possible') return <Pill tone="warn">محتملة</Pill>;
  return null;
}

export function nameOf(u) {
  if (!u) return 'حساب محذوف';
  return u.name || (u.email ? String(u.email).split('@')[0] : `#${u.id}`);
}

// One line for a person: «name» + e-mail; the name opens the account actions when onOpen is given.
export function PersonRef({ user, onOpen, prefix }) {
  if (!user) return <span className={styles.cmPerson}>{prefix}<span className={styles.faint}>حساب محذوف</span></span>;
  return (
    <span className={styles.cmPerson}>
      {prefix}
      {onOpen
        ? <button type="button" className={styles.cmPersonBtn} onClick={() => onOpen(user)} title="إجراءات على الحساب">«{nameOf(user)}»</button>
        : <strong>«{nameOf(user)}»</strong>}
      {user.email && <bdi className={styles.cmEmail}>{user.email}</bdi>}
    </span>
  );
}

// The text as written, with the matched dictionary word marked when it appears literally.
export function Evidence({ text, matched, label }) {
  const body = String(text ?? '');
  let content = body;
  if (matched && body) {
    const i = body.indexOf(matched);
    if (i >= 0) content = <>{body.slice(0, i)}<mark className={styles.cmMark}>{matched}</mark>{body.slice(i + matched.length)}</>;
  }
  return (
    <blockquote className={styles.cmEvidence}>
      {label && <span className={styles.cmEvLabel}>{label}</span>}
      <bdi>{content || <span className={styles.faint}>(فارغ)</span>}</bdi>
    </blockquote>
  );
}

// Reported photos are blurred until the admin chooses to look.
export function BlurPhoto({ src, alt }) {
  const [shown, setShown] = useState(false);
  if (!src) return <div className={styles.cmPhotoGone}>لم تعد الصورة موجودة</div>;
  return (
    <button type="button" className={`${styles.cmPhoto} ${shown ? styles.cmPhotoShown : ''}`}
      onClick={() => setShown(s => !s)} aria-pressed={shown}
      aria-label={shown ? 'إخفاء الصورة' : 'عرض الصورة المبلّغ عنها'}>
      <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer"/>
      {!shown && <span className={styles.cmPhotoVeil}><Ico name="eye"/>مموّهة، اضغط للعرض</span>}
    </button>
  );
}

export function when(iso) {
  return <time dateTime={iso || undefined} title={fmtDate(iso)}>{timeAgo(iso)}</time>;
}

export const DURATIONS = [
  ['1', 'يوم واحد'], ['3', '٣ أيام'], ['7', '٧ أيام'], ['30', '٣٠ يوماً'], ['90', '٩٠ يوماً'], ['', 'دائم'],
];

export function DurationSelect({ id, value, onChange, disabled }) {
  return (
    <select id={id} className={`${styles.input} ${styles.select}`} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {DURATIONS.map(([v, l]) => <option key={v || 'p'} value={v}>{l}</option>)}
    </select>
  );
}

const SCOPE_TEXT = {
  community: 'لن يستطيع دخول الغرف أو الجروبات أو المراسلة أو طلبات الصداقة، ويُخرج من أي غرفة هو فيها الآن.',
  rooms: 'لن يستطيع دخول الغرف الصوتية أو فتحها، ويُخرج من أي غرفة هو فيها الآن. باقي المجتمع متاح له.',
  app: 'لن يستطيع تسجيل الدخول إلى التطبيق، وتُنهى جميع جلساته الحالية.',
};

/**
 * Suspend / ban modal. Two uses:
 *  - with `report`: the decision on a report (onSubmit({durationDays, note, alsoDelete}) is supplied by the caller);
 *  - without: a direct suspension of `user` through /admin/community/users/{id}/suspend.
 * scope: 'community' | 'rooms' | 'app'; lockScope hides the scope choice.
 */
export function SuspendModal({ user, scope: scope0 = 'community', lockScope, onSubmit, onClose, onDone, canAlsoDelete, alsoDeleteLabel }) {
  const [scope, setScope] = useState(scope0);
  const [days, setDays] = useState(scope0 === 'app' ? '' : '7');
  const [note, setNote] = useState('');
  const [alsoDelete, setAlsoDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sid = useId(), did = useId(), nid = useId(), cid = useId();
  const title = scope === 'app' ? 'حظر من التطبيق' : scope === 'rooms' ? 'حظر من الغرف' : 'إيقاف في المجتمع';

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const durationDays = days === '' ? null : Number(days);
    try {
      if (onSubmit) await onSubmit({ scope, durationDays, note: note.trim(), alsoDelete });
      else await suspendCommunityUser(user.id, { scope, durationDays, reason: note.trim() });
      onDone && onDone({ scope, durationDays });
      onClose();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${title}: ${nameOf(user)}`} icon="ban" tone="danger" onClose={onClose} busy={busy}>
      <form onSubmit={submit} className={styles.form}>
        {!lockScope && (
          <div className={styles.field}>
            <span className={styles.fieldLabel} id={sid}>نطاق الإيقاف</span>
            <div className={`nq-seg ${styles.seg}`} role="group" aria-labelledby={sid}>
              {['community', 'rooms', 'app'].map(s => (
                <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)} disabled={busy}>
                  {s === 'community' ? 'المجتمع' : s === 'rooms' ? 'الغرف فقط' : 'التطبيق كله'}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className={styles.modalNote}>{SCOPE_TEXT[scope]}</p>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={did}>المدة</label>
          <DurationSelect id={did} value={days} onChange={setDays} disabled={busy}/>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={nid}>السبب <span className={styles.fieldHint}>(يصل إلى المستخدم في الإشعار ويُحفظ في السجل)</span></label>
          <textarea id={nid} className={styles.input} rows={2} maxLength={500} data-autofocus
            placeholder="مثال: إساءة متكررة في شات الغرف" value={note} onChange={e => setNote(e.target.value)} disabled={busy}/>
        </div>
        {canAlsoDelete && (
          <label className={styles.cmCheck} htmlFor={cid}>
            <input id={cid} type="checkbox" checked={alsoDelete} onChange={e => setAlsoDelete(e.target.checked)} disabled={busy}/>
            <span>{alsoDeleteLabel || 'احذف المحتوى المبلّغ عنه أيضاً'}</span>
          </label>
        )}
        {error && <FormError text={error}/>}
        <div className={styles.modalActions}>
          <button type="submit" className={`nq-btn ${styles.btnDanger}`} disabled={busy}>
            <Ico name="ban"/>{busy ? 'جارٍ التنفيذ...' : `تأكيد: ${title}`}
          </button>
          <button type="button" className="nq-btn ghost" onClick={onClose} disabled={busy}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

// Account & group actions (إجراءات مباشرة): find a member, then suspend / ban, correct gender or birthdate,
// remove the profile photo; and remove a group's photo or delete a group by its number.
import { useState, useId } from 'react';
import {
  listUsers, correctCommunityUser, removeCommunityUserPhoto, removeCommunityGroupPhoto, deleteCommunityGroup,
} from '../../../adminApi';
import {
  styles, errMsg, useLoader, useDebounced, SectionCard, Pill, Avatar, Ico, Modal, ConfirmDialog, FormError,
  ErrorLine, Empty, PageLoader, localDay,
} from '../shared';
import { Icon } from '../../../components/ornaments/Ornaments';
import { GENDER, SuspendModal, nameOf } from './common';

function ageOf(bd) {
  if (!bd) return null;
  const b = new Date(bd + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

// The chosen account lives in the parent tab, so it survives switching sections.
export default function AccountsPanel({ user, onUser: setUser, notify }) {

  return (
    <div className={styles.cmPanel}>
      <div className={styles.cmTwo}>
        <FindUser selected={user} onPick={setUser}/>
        {user
          ? <AccountCard user={user} onUser={setUser} notify={notify}/>
          : (
            <SectionCard icon="user" title="الحساب المختار">
              <Empty icon="user" text="ابحث عن عضو واختره، أو اضغط اسم صاحب بلاغ أو مضيف غرفة لفتحه هنا."/>
            </SectionCard>
          )}
      </div>
      <GroupActions notify={notify}/>
    </div>
  );
}

function FindUser({ selected, onPick }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const list = useLoader(() => (q.length >= 2 ? listUsers({ q, perPage: 8 }) : Promise.resolve(null)), [q]);
  const items = list.data?.items || [];
  return (
    <SectionCard icon="search" title="ابحث عن عضو">
      <label className={`nq-input ${styles.searchBox} ${styles.cmFullSearch}`}>
        <Icon name="search"/>
        <input type="search" aria-label="بحث بالاسم أو البريد" placeholder="الاسم أو البريد (حرفان على الأقل)..."
          value={search} onChange={e => setSearch(e.target.value)}/>
      </label>
      {list.error && <ErrorLine message={list.error} onRetry={() => list.reload()}/>}
      {q.length >= 2 && (list.loading ? <PageLoader label="جارٍ البحث..."/> : items.length === 0
        ? <Empty icon="search" text="لا توجد نتائج"/>
        : (
          <ul className={styles.cmPick}>
            {items.map(u => (
              <li key={u.id}>
                <button type="button" className={`${styles.cmPickBtn} ${selected?.id === u.id ? styles.cmPickOn : ''}`}
                  aria-pressed={selected?.id === u.id} onClick={() => onPick(u)}>
                  <Avatar user={u} size="sm"/>
                  <span className={styles.userText}>
                    <span className={styles.userName}>{u.name || '—'}</span>
                    <bdi className={styles.userEmail}>{u.email}</bdi>
                  </span>
                  {u.gender && <Pill tone="muted">{GENDER[u.gender]}</Pill>}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </SectionCard>
  );
}

function AccountCard({ user: u, onUser, notify }) {
  const [suspend, setSuspend] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const age = u.birthdate ? ageOf(u.birthdate) : (u.age ?? null);

  function askPhoto() {
    setConfirm({
      title: 'حذف صورة البروفايل', danger: true, icon: 'trash', confirmLabel: 'حذف الصورة',
      message: `ستُحذف صورة ${nameOf(u)} نهائياً، ويظهر بدلها أول حرف من الاسم. يستطيع رفع صورة جديدة لاحقاً.`,
      onConfirm: async () => {
        await removeCommunityUserPhoto(u.id);
        onUser({ ...u, avatar_url: null });
        notify('ok', 'حُذفت الصورة');
      },
    });
  }

  return (
    <SectionCard icon="shieldUser" title="الحساب المختار">
      <div className={styles.cmAccount}>
        {u.avatar_url
          ? <img className={styles.cmAccPhoto} src={u.avatar_url} alt="" referrerPolicy="no-referrer"/>
          : <Avatar user={u} size="lg"/>}
        <div className={styles.userText}>
          <span className={styles.userName}>{u.name || '—'} <span className={`${styles.faint} nq-num`}>#{u.id}</span></span>
          {u.email && <bdi className={styles.userEmail}>{u.email}</bdi>}
        </div>
      </div>
      <dl className={styles.cmFacts}>
        <div><dt>الجنس</dt><dd>{u.gender ? GENDER[u.gender] : <span className={styles.faint}>لم يُحدَّد</span>}</dd></div>
        <div><dt>تاريخ الميلاد</dt><dd>{u.birthdate ? <bdi className="nq-num">{u.birthdate}</bdi> : <span className={styles.faint}>{u.age != null ? 'غير ظاهر هنا' : 'لم يُحدَّد'}</span>}</dd></div>
        <div><dt>العمر</dt><dd>{age != null ? <><span className="nq-num">{age}</span> سنة{age < 18 ? ' · قاصر' : ''}</> : '—'}</dd></div>
      </dl>
      <div className={styles.cmAccActs}>
        <button type="button" className={`nq-btn sm ${styles.btnOutlineDanger}`} onClick={() => setSuspend(true)}><Ico name="ban"/>إيقاف أو حظر</button>
        <button type="button" className={`nq-btn sm ${styles.btnOutlineGold}`} onClick={() => setCorrect(true)}><Ico name="pen"/>تصحيح الجنس أو الميلاد</button>
        <button type="button" className={`nq-btn sm ${styles.btnOutlineDanger}`} onClick={askPhoto} disabled={!u.avatar_url}
          title={u.avatar_url ? undefined : 'لا توجد صورة'}><Ico name="trash"/>حذف صورة البروفايل</button>
      </div>
      {suspend && <SuspendModal user={u} onClose={() => setSuspend(false)}
        onDone={({ scope }) => notify('ok', scope === 'app' ? 'تم الحظر من التطبيق' : scope === 'rooms' ? 'تم الحظر من الغرف' : 'تم الإيقاف في المجتمع')}/>}
      {correct && <CorrectModal user={u} onClose={() => setCorrect(false)}
        onDone={(nu) => { onUser({ ...u, ...nu }); notify('ok', 'حُفظ التصحيح'); }}/>}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </SectionCard>
  );
}

function CorrectModal({ user: u, onClose, onDone }) {
  const [gender, setGender] = useState(u.gender || '');
  const [birthdate, setBirthdate] = useState(u.birthdate || '');
  const [step, setStep] = useState(1);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const gid = useId(), bid = useId(), aid = useId();
  const today = localDay(new Date());

  const patch = {};
  if (gender && gender !== (u.gender || '')) patch.gender = gender;
  if (birthdate && birthdate !== (u.birthdate || '')) patch.birthdate = birthdate;
  const changes = Object.keys(patch);
  const genderChange = !!patch.gender && !!u.gender;
  const newAge = patch.birthdate ? ageOf(patch.birthdate) : null;

  async function save() {
    setBusy(true); setError(null);
    try {
      const out = await correctCommunityUser(u.id, patch);
      onDone(out && typeof out === 'object' ? out : patch);
      onClose();
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title={`تصحيح بيانات ${nameOf(u)}`} icon="pen" tone={step === 2 ? 'danger' : undefined} onClose={onClose} busy={busy}>
      {step === 1 ? (
        <form className={styles.form} onSubmit={e => { e.preventDefault(); if (changes.length) setStep(2); }}>
          <p className={styles.modalNote}>
            لا يستطيع المستخدم تغيير الجنس أو تاريخ الميلاد بنفسه بعد انضمامه للمجتمع. صحّحهما فقط بناءً على طلب منه عبر الدعم بعد التحقق.
          </p>
          <div className={styles.field}>
            <span className={styles.fieldLabel} id={gid}>الجنس</span>
            <div className={`nq-seg ${styles.seg}`} role="radiogroup" aria-labelledby={gid}>
              {['male', 'female'].map(g => (
                <button key={g} type="button" role="radio" aria-checked={gender === g} aria-pressed={gender === g} onClick={() => setGender(g)}>
                  {GENDER[g]}{u.gender === g ? ' (الحالي)' : ''}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={bid}>تاريخ الميلاد {!u.birthdate && u.age != null && <span className={styles.fieldHint}>(العمر الحالي {u.age} سنة)</span>}</label>
            <input id={bid} type="date" className={styles.input} max={today} value={birthdate} onChange={e => setBirthdate(e.target.value)} data-autofocus/>
          </div>
          <div className={styles.modalActions}>
            <button type="submit" className="nq-btn gold" disabled={!changes.length}>مراجعة التغيير</button>
            <button type="button" className="nq-btn ghost" onClick={onClose}>إلغاء</button>
          </div>
        </form>
      ) : (
        <div className={styles.form}>
          <p className={styles.modalNote}>راجع التغيير قبل الحفظ. يُسجَّل في سجل الإدارة بالقيم القديمة والجديدة.</p>
          <dl className={styles.cmFacts}>
            {patch.gender && <div><dt>الجنس</dt><dd>{u.gender ? GENDER[u.gender] : 'غير محدد'} ← <b>{GENDER[patch.gender]}</b></dd></div>}
            {patch.birthdate && <div><dt>تاريخ الميلاد</dt><dd><bdi className="nq-num">{u.birthdate || (u.age != null ? `${u.age} سنة` : 'غير محدد')}</bdi> ← <b><bdi className="nq-num">{patch.birthdate}</bdi></b>{newAge != null && <> ({newAge} سنة)</>}</dd></div>}
          </dl>
          {genderChange && (
            <div className={styles.inlineWarn}><Ico name="alert"/>
              <span>سيُخرج فوراً من الغرف والجروبات والتذكيرات الخاصة بالجنس الآخر، ولن يرى إلا غرف جنسه الجديد والمختلطة.</span>
            </div>
          )}
          {newAge != null && newAge < 18 && (
            <div className={styles.inlineWarn}><Ico name="alert"/>
              <span>{newAge < 13 ? 'العمر الجديد أقل من ١٣ سنة: سيُمنع من المجتمع كله.' : 'العمر الجديد أقل من ١٨ سنة: تُغلق عنه الرسائل الخاصة والصداقة ويصبح بروفايله خاصاً.'}</span>
            </div>
          )}
          <label className={styles.cmCheck} htmlFor={aid}>
            <input id={aid} type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} disabled={busy}/>
            <span>تحققت من أن صاحب الحساب طلب هذا التصحيح.</span>
          </label>
          {error && <FormError text={error}/>}
          <div className={styles.modalActions}>
            <button type="button" className={`nq-btn ${styles.btnDanger}`} onClick={save} disabled={busy || !ack}>{busy ? 'جارٍ الحفظ...' : 'تأكيد التصحيح'}</button>
            <button type="button" className="nq-btn ghost" onClick={() => setStep(1)} disabled={busy}>رجوع</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GroupActions({ notify }) {
  const [gid, setGid] = useState('');
  const [confirm, setConfirm] = useState(null);
  const fid = useId();
  const id = gid.replace(/[^\d]/g, '');
  function ask(kind) {
    const del = kind === 'delete';
    setConfirm({
      title: del ? 'حذف الجروب' : 'حذف صورة الجروب', danger: true, icon: 'trash',
      confirmLabel: del ? 'حذف الجروب نهائياً' : 'حذف الصورة',
      message: del
        ? `سيُحذف الجروب رقم ${id} نهائياً مع أعضائه وطلباته وصورته، وتُغلق غرفه المفتوحة والمجدولة. لا يمكن التراجع.`
        : `ستُحذف صورة الجروب رقم ${id} نهائياً من الخادم.`,
      onConfirm: async () => {
        if (del) await deleteCommunityGroup(id); else await removeCommunityGroupPhoto(id);
        notify('ok', del ? 'حُذف الجروب' : 'حُذفت صورة الجروب');
        if (del) setGid('');
      },
    });
  }
  return (
    <SectionCard icon="users" title="إجراءات على جروب">
      <p className={styles.cmLegend}>رقم الجروب يظهر في بلاغات الجروبات وفي قائمة الغرف (بجوار اسم الجروب).</p>
      <div className={styles.cmGroupRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={fid}>رقم الجروب</label>
          <input id={fid} className={`${styles.input} ${styles.cmNum}`} inputMode="numeric" dir="ltr" value={gid} onChange={e => setGid(e.target.value)} placeholder="مثال: 42"/>
        </div>
        <button type="button" className={`nq-btn sm ${styles.btnOutlineDanger}`} disabled={!id} onClick={() => ask('photo')}><Ico name="trash"/>حذف الصورة</button>
        <button type="button" className={`nq-btn sm ${styles.btnDanger}`} disabled={!id} onClick={() => ask('delete')}><Ico name="trash"/>حذف الجروب</button>
      </div>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </SectionCard>
  );
}

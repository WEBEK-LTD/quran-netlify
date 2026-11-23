// Members (الأعضاء): search, filters, pagination, details, admin role, ban/unban, direct message.
import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { listUsers, setUserAdmin, banUser, unbanUser, messageUser } from '../../adminApi';
import { Icon, Badge8 } from '../../components/ornaments/Ornaments';
import {
  styles, errMsg, useLoader, useDebounced, useNotice, useTimers,
  TabHeader, Pill, Avatar, Ico, Modal, ConfirmDialog, FormError, Toast, ErrorBox, Empty,
  Pagination, PageLoader, fmt, fmtFull, fmtDate, timeAgo, localDay,
} from './shared';

const USERS_PER_PAGE = 25;
const FILTERS = [['all', 'الكل'], ['admins', 'المشرفون'], ['active', 'النشطون'], ['banned', 'المحظورون']];

function banInfo(u) {
  if (!u || !u.banned) return null;
  const b = typeof u.banned === 'object' ? u.banned : {};
  return { reason: b.reason ?? u.ban_reason ?? '', until: b.until ?? u.banned_until ?? u.ban_until ?? null };
}

export default function UsersTab({ currentUser }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, filter]);

  const list = useLoader(() => listUsers({ q, filter, page, perPage: USERS_PER_PAGE }), [q, filter, page]);
  const items = list.data?.items || [];
  const total = list.data?.total ?? 0;

  const [selected, setSelected] = useState(null);
  const [msgUser,  setMsgUser]  = useState(null);
  const [banUserT, setBanUserT] = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [acting,   setActing]   = useState(null);
  const [notice, showNotice, hideNotice] = useNotice();

  const patchLocal = useCallback((id, fields) => {
    list.setData(d => d ? { ...d, items: (d.items || []).map(x => x.id === id ? { ...x, ...fields } : x) } : d);
    setSelected(s => (s && s.id === id ? { ...s, ...fields } : s));
  }, [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSelf = (u) => currentUser && String(u.id) === String(currentUser.id);

  async function doToggleAdmin(u) {
    const next = !u.is_admin;
    setActing(u.id + ':admin');
    try {
      const updated = await setUserAdmin(u.id, next);
      patchLocal(u.id, updated && typeof updated === 'object' ? updated : { is_admin: next });
      showNotice('ok', next ? 'تمت إضافة صلاحية المشرف' : 'تمت إزالة صلاحية المشرف');
      list.reload({ silent: true });
    } catch (e) {
      showNotice('err', errMsg(e));
    } finally {
      setActing(null);
    }
  }

  function askToggleAdmin(u) {
    if (u.is_admin) {
      setConfirm({
        title: 'إزالة صلاحية المشرف',
        message: `هل تريد إزالة صلاحية المشرف من ${u.name || u.email}؟ لن يتمكن بعدها من دخول لوحة التحكم.`,
        confirmLabel: 'إزالة الصلاحية',
        danger: true,
        icon: 'shieldUser',
        onConfirm: async () => {
          const updated = await setUserAdmin(u.id, false);
          patchLocal(u.id, updated && typeof updated === 'object' ? updated : { is_admin: false });
          showNotice('ok', 'تمت إزالة صلاحية المشرف');
          list.reload({ silent: true });
        },
      });
    } else {
      doToggleAdmin(u);
    }
  }

  function askUnban(u) {
    setConfirm({
      title: 'رفع الحظر',
      message: `هل تريد رفع الحظر عن ${u.name || u.email}؟ سيتمكن من تسجيل الدخول مجدداً.`,
      confirmLabel: 'رفع الحظر',
      icon: 'lock',
      onConfirm: async () => {
        await unbanUser(u.id);
        patchLocal(u.id, { banned: false, ban_reason: null, banned_until: null });
        showNotice('ok', 'تم رفع الحظر');
        list.reload({ silent: true });
      },
    });
  }

  function onBanned(u, { reason, until }) {
    patchLocal(u.id, { banned: true, ban_reason: reason, banned_until: until || null });
    showNotice('ok', 'تم حظر العضو وإنهاء جلساته');
    list.reload({ silent: true });
  }

  const modalOpen = !!(msgUser || banUserT || confirm);

  function renderActions(u, inDrawer) {
    const self = isSelf(u);
    const banned = !!u.banned;
    const busyAdmin = acting === u.id + ':admin';
    return <>
      <button type="button"
        className={`nq-btn sm ${u.is_admin ? styles.btnOutlineDanger : styles.btnOutlineGold}`}
        disabled={busyAdmin || (self && u.is_admin)}
        title={self && u.is_admin ? 'لا يمكنك إزالة صلاحيتك بنفسك' : undefined}
        onClick={() => askToggleAdmin(u)}>
        <Icon name="shieldUser"/>
        {busyAdmin ? 'جارٍ...' : u.is_admin ? 'إزالة الإشراف' : 'تعيين مشرفاً'}
      </button>
      <button type="button"
        className={`nq-btn sm ${banned ? styles.btnOutlineOk : styles.btnOutlineDanger}`}
        disabled={self}
        title={self ? 'لا يمكنك حظر نفسك' : undefined}
        onClick={() => banned ? askUnban(u) : setBanUserT(u)}>
        <Ico name={banned ? 'lock' : 'ban'}/>
        {banned ? 'رفع الحظر' : 'حظر'}
      </button>
      {inDrawer && (
        <button type="button" className={`nq-btn gold sm ${styles.wide}`} onClick={() => setMsgUser(u)}>
          <Ico name="mail"/>إرسال رسالة مباشرة
        </button>
      )}
    </>;
  }

  const filtered = filter !== 'all' || q;

  return (
    <div className={styles.tabContent}>
      <TabHeader icon="users" title="الأعضاء"
        sub={list.data ? `${fmtFull(total)} عضو${filtered ? ' مطابق' : ' مسجّل'} · ابحث، وصفِّ، وأدِر الصلاحيات والحظر` : 'إدارة الأعضاء والصلاحيات والحظر'}/>
      <Toast notice={notice} onClose={hideNotice}/>

      <div className={styles.toolbar}>
        <label className={`nq-input ${styles.searchBox}`}>
          <Icon name="search"/>
          <input type="search"
            aria-label="بحث بالبريد أو الاسم"
            placeholder="بحث بالبريد أو الاسم..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </label>
        <div className={`nq-seg ${styles.seg}`} role="group" aria-label="تصفية الأعضاء">
          {FILTERS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      {list.error && <ErrorBox message={list.error} onRetry={() => list.reload()}/>}
      {list.loading ? <PageLoader/> : !list.error && (
        <>
          <div className={styles.resultCount}><b className="nq-num">{fmtFull(total)}</b> نتيجة</div>
          {items.length === 0
            ? <div className={`nq-card ${styles.card}`}><Empty icon="search" text="لا توجد نتائج مطابقة"/></div>
            : (
              <div className={`nq-card ${styles.tableCard}`}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">العضو</th>
                      <th scope="col">الحالة</th>
                      <th scope="col">الآيات</th>
                      <th scope="col">النشاط</th>
                      <th scope="col"><span className="nq-sr">الإجراءات</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(u => {
                      const name = u.name || u.email?.split('@')[0] || '—';
                      return (
                        <tr key={u.id} className={`${u.banned ? styles.rowBanned : ''} ${selected?.id === u.id ? styles.rowSel : ''}`}>
                          <td className={styles.cellUser}>
                            <Avatar user={u}/>
                            <div className={styles.userText}>
                              <span className={styles.userName}>{u.name || '—'}</span>
                              <bdi className={styles.userEmail}>{u.email}</bdi>
                            </div>
                          </td>
                          <td className={styles.cellPills}>
                            {u.is_admin && <Pill tone="gold" icon="shieldUser">مشرف</Pill>}
                            {u.banned   && <Pill tone="danger" icon="ban">محظور</Pill>}
                            {isSelf(u)  && <Pill tone="info" icon="user">أنت</Pill>}
                            {!u.is_admin && !u.banned && !isSelf(u) && <Pill tone="muted">عضو</Pill>}
                          </td>
                          <td className={styles.cellNum} data-label="الآيات"><b className="nq-num">{fmt(u.ayahs_total || 0)}</b></td>
                          <td className={styles.cellMeta}>
                            <span>انضم {timeAgo(u.created_at)}</span>
                            {u.last_seen && <span className={styles.faint}>آخر ظهور {timeAgo(u.last_seen)}</span>}
                          </td>
                          <td className={styles.cellActions}>
                            <button type="button" className="nq-ibtn"
                              aria-label={`تفاصيل ${name}`} title="التفاصيل"
                              aria-expanded={selected?.id === u.id}
                              onClick={() => setSelected(selected?.id === u.id ? null : u)}><Ico name="eye"/></button>
                            <button type="button" className="nq-ibtn"
                              aria-label={`إرسال رسالة إلى ${name}`} title="إرسال رسالة"
                              onClick={() => setMsgUser(u)}><Ico name="mail"/></button>
                            {renderActions(u, false)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          <Pagination page={page} perPage={list.data?.per_page || USERS_PER_PAGE} total={total} onPage={setPage}/>
        </>
      )}

      {selected && (
        <UserDrawer user={selected} onClose={() => setSelected(null)} escDisabled={modalOpen}>
          {renderActions(selected, true)}
        </UserDrawer>
      )}
      {msgUser && <SendMessageModal user={msgUser} onClose={() => setMsgUser(null)}/>}
      {banUserT && <BanModal user={banUserT} onClose={() => setBanUserT(null)} onDone={(info) => { onBanned(banUserT, info); setBanUserT(null); }}/>}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </div>
  );
}

function UserDrawer({ user: u, onClose, escDisabled, children }) {
  const titleId = useId();
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, [u.id]);
  useEffect(() => {
    if (escDisabled) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, escDisabled]);
  const ban = banInfo(u);
  const GENDER = { male: 'ذكر', female: 'أنثى' };
  return (
    <>
      <div className={styles.drawerScrim} onClick={onClose} aria-hidden="true"/>
      <aside className={styles.drawer} role="dialog" aria-labelledby={titleId}>
        <div className={styles.drawerHead}>
          <h2 id={titleId} className={styles.drawerTitle}>تفاصيل العضو</h2>
          <button ref={closeRef} type="button" className="nq-ibtn" onClick={onClose} aria-label="إغلاق التفاصيل"><Icon name="x"/></button>
        </div>
        <div className={styles.drawerBody}>
          <div className={styles.drawerId}>
            <Avatar user={u} size="lg"/>
            <div className={styles.drawerName}>{u.name || '—'}</div>
            <bdi className={styles.drawerEmail}>{u.email}</bdi>
            <div className={styles.drawerPills}>
              {u.is_admin && <Pill tone="gold" icon="shieldUser">مشرف</Pill>}
              {u.banned && <Pill tone="danger" icon="ban">محظور</Pill>}
            </div>
          </div>
          <div className={styles.drawerStats}>
            <div className={styles.drawerStat}>
              <b className="nq-num">{fmt(u.ayahs_total || 0)}</b>
              <span>آية مقروءة</span>
            </div>
            <div className={styles.drawerStat}>
              <b>{u.is_admin ? <Icon name="check"/> : '—'}</b>
              <span>مشرف</span>
            </div>
            <div className={styles.drawerStat}>
              <b>{u.email_verified ? <Icon name="check"/> : '—'}</b>
              <span>بريد مؤكَّد</span>
            </div>
          </div>
          <dl className={styles.drawerMeta}>
            <div><dt><Icon name="calendar"/>انضم</dt><dd>{fmtDate(u.created_at)}</dd></div>
            {u.last_seen && <div><dt><Icon name="timer"/>آخر ظهور</dt><dd>{fmtDate(u.last_seen)}</dd></div>}
            {u.gender && <div><dt><Icon name="user"/>الجنس</dt><dd>{GENDER[u.gender] || u.gender}</dd></div>}
            {u.show_on_leaderboard === false && <div><dt><Icon name="trophy"/>المتصدرون</dt><dd>مخفي من القائمة</dd></div>}
          </dl>
          {ban && (
            <div className={styles.banBox}>
              <strong><Ico name="ban"/>محظور</strong>
              {ban.reason ? <span>السبب: {ban.reason}</span> : null}
              <span>{ban.until ? `حتى ${fmtDate(ban.until)}` : 'حظر دائم'}</span>
            </div>
          )}
          <div className={styles.drawerActions}>{children}</div>
        </div>
      </aside>
    </>
  );
}

function SendMessageModal({ user, onClose }) {
  const [subject, setSubject] = useState('رسالة من فريق الدعم');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState(null);
  const later = useTimers();
  const sid = useId(), bid = useId();
  async function send(e) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true); setError(null);
    try {
      await messageUser(user.id, { subject: subject.trim(), body: body.trim() });
      setDone(true);
      later(onClose, 1800);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  }
  return (
    <Modal title={`رسالة إلى ${user.name || user.email?.split('@')[0]}`} icon="chat" onClose={onClose} busy={sending}>
      {done
        ? (
          <div className={styles.modalDone} role="status">
            <Badge8 icon="check" size={56}/>
            <span>تم الإرسال، وفُتحت تذكرة دعم للعضو ستظهر في تبويب الدعم.</span>
          </div>
        ) : (
          <form onSubmit={send} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={sid}>الموضوع</label>
              <input id={sid} className={styles.input} maxLength={200}
                value={subject} onChange={e => setSubject(e.target.value)}/>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={bid}>نص الرسالة</label>
              <textarea id={bid} className={styles.input} rows={5} data-autofocus
                placeholder="اكتب رسالتك..." maxLength={5000}
                value={body} onChange={e => setBody(e.target.value)}/>
            </div>
            {error && <FormError text={error}/>}
            <div className={styles.modalActions}>
              <button type="submit" className="nq-btn gold" disabled={sending || !subject.trim() || !body.trim()}>
                <Ico name="send"/>{sending ? 'جارٍ الإرسال...' : 'إرسال'}
              </button>
              <button type="button" className="nq-btn ghost" onClick={onClose} disabled={sending}>إلغاء</button>
            </div>
          </form>
        )}
    </Modal>
  );
}

function BanModal({ user, onClose, onDone }) {
  const [reason,  setReason]  = useState('');
  const [until,   setUntil]   = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState(null);
  const rid = useId(), uid = useId();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localDay(d); })();
  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSending(true); setError(null);
    // end of the chosen local day, sent as ISO 8601 UTC
    const untilIso = until ? new Date(`${until}T23:59:59`).toISOString() : undefined;
    try {
      await banUser(user.id, { reason: reason.trim(), until: untilIso });
      onDone({ reason: reason.trim(), until: untilIso });
    } catch (err) {
      setError(errMsg(err));
      setSending(false);
    }
  }
  return (
    <Modal title={`حظر ${user.name || user.email}`} icon="lock" tone="danger" onClose={onClose} busy={sending}>
      <form onSubmit={submit} className={styles.form}>
        <p className={styles.modalNote}>لن يتمكن العضو من تسجيل الدخول، وستُنهى جميع جلساته الحالية.</p>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={rid}>سبب الحظر</label>
          <textarea id={rid} className={styles.input} rows={3} data-autofocus required
            placeholder="يُحفظ السبب في السجل..." maxLength={500}
            value={reason} onChange={e => setReason(e.target.value)}/>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={uid}>حتى تاريخ <span className={styles.fieldHint}>(اختياري، والفارغ حظر دائم)</span></label>
          <input id={uid} type="date" className={styles.input} min={tomorrow}
            value={until} onChange={e => setUntil(e.target.value)}/>
        </div>
        {error && <FormError text={error}/>}
        <div className={styles.modalActions}>
          <button type="submit" className={`nq-btn ${styles.btnDanger}`} disabled={sending || !reason.trim()}>
            <Ico name="ban"/>{sending ? 'جارٍ الحظر...' : 'حظر العضو'}
          </button>
          <button type="button" className="nq-btn ghost" onClick={onClose} disabled={sending}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

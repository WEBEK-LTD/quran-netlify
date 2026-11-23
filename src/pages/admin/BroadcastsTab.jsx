// Broadcasts (الإشعارات): compose with type/expiry, list, delete.
import { useState, useId } from 'react';
import { listBroadcasts, createBroadcast, deleteBroadcast } from '../../adminApi';
import { Icon } from '../../components/ornaments/Ornaments';
import {
  styles, errMsg, useLoader, useTimers, TabHeader, SectionCard, Pill, Ico,
  ConfirmDialog, FormError, ErrorLine, Empty, PageLoader, fmtDate, timeAgo,
} from './shared';

const BROADCAST_TYPES = {
  info:    { label: 'معلومة', tone: 'info', icon: 'info' },
  warning: { label: 'تنبيه',  tone: 'warn', icon: 'alert' },
  success: { label: 'خبر سار', tone: 'ok',  icon: 'check' },
};

export default function BroadcastsTab() {
  const list = useLoader(() => listBroadcasts(), []);
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [type,    setType]    = useState('info');
  const [expires, setExpires] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const later = useTimers();
  const tid = useId(), bid = useId(), eid = useId();

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true); setError(null);
    try {
      const created = await createBroadcast({
        title: title.trim(), body: body.trim(), type,
        expires_at: expires ? new Date(expires).toISOString() : undefined,
      });
      setTitle(''); setBody(''); setType('info'); setExpires('');
      setSent(true); later(() => setSent(false), 2500);
      if (created && created.id != null) list.setData(d => [created, ...(Array.isArray(d) ? d.filter(b => b.id !== created.id) : [])]);
      list.reload({ silent: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  function askDelete(b) {
    setConfirm({
      title: 'حذف الإشعار',
      message: `هل تريد حذف الإشعار «${b.title}»؟ سيختفي من لوحة جميع الأعضاء.`,
      confirmLabel: 'حذف',
      danger: true,
      icon: 'bell',
      onConfirm: async () => {
        await deleteBroadcast(b.id);
        list.setData(d => (Array.isArray(d) ? d.filter(x => x.id !== b.id) : d));
      },
    });
  }

  const items = Array.isArray(list.data) ? list.data : (list.data?.items || []);
  const now = Date.now();

  return (
    <div className={styles.tabContent}>
      <TabHeader icon="bell" title="الإشعارات" sub="إعلانات تظهر لجميع الأعضاء في صفحة «لوحتي» حتى تُحذف أو ينتهي وقتها"/>
      <div className={styles.broadcastGrid}>
        <SectionCard icon="pen" title="إشعار جديد" as="div" className={styles.composeCard}>
          <form onSubmit={send} className={styles.form}>
            <div className={styles.field}>
              <span className={styles.fieldLabel} id={`${tid}-t`}>نوع الإشعار</span>
              <div className={styles.typeRow} role="radiogroup" aria-labelledby={`${tid}-t`}>
                {Object.entries(BROADCAST_TYPES).map(([k, v]) => (
                  <button key={k} type="button" role="radio" aria-checked={type === k}
                    className={`${styles.typeBtn} ${styles['tone_' + v.tone]}`}
                    onClick={() => setType(k)}><Ico name={v.icon}/>{v.label}</button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={tid}>عنوان الإشعار</label>
              <input id={tid} className={styles.input} placeholder="مثال: تحديث جديد في المصحف" maxLength={200}
                value={title} onChange={e => setTitle(e.target.value)}/>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={bid}>نص الإشعار</label>
              <textarea id={bid} className={styles.input} rows={4} maxLength={2000}
                placeholder="اكتب نص الإشعار..."
                value={body} onChange={e => setBody(e.target.value)}/>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={eid}>ينتهي في <span className={styles.fieldHint}>(اختياري)</span></label>
              <input id={eid} type="datetime-local" className={styles.input}
                value={expires} onChange={e => setExpires(e.target.value)}/>
            </div>
            {error && <FormError text={error}/>}
            <button type="submit" className={`nq-btn gold ${styles.wide}`}
              disabled={sending || !title.trim() || !body.trim()}>
              {sending ? 'جارٍ الإرسال...' : sent ? <><Icon name="check"/>تم الإرسال</> : <><Ico name="send"/>إرسال للجميع</>}
            </button>
            <p className={styles.note}>يظهر الإشعار في لوحة المستخدم (صفحة «لوحتي») لجميع الأعضاء حتى يُحذف أو ينتهي.</p>
          </form>
        </SectionCard>

        <SectionCard icon="list" title="كل الإشعارات"
          action={list.data ? <span className={styles.chartTotal}><b className="nq-num">{items.length}</b> إشعاراً</span> : null}>
          {list.loading && !list.data && <PageLoader/>}
          {list.error && <ErrorLine message={list.error} onRetry={() => list.reload()}/>}
          {list.data && items.length === 0 && <Empty icon="bell" text="لا توجد إشعارات بعد"/>}
          <ul className={styles.bList}>
            {items.map(b => {
              const tm = BROADCAST_TYPES[b.type] || BROADCAST_TYPES.info;
              const expired = b.expires_at && new Date(b.expires_at).getTime() < now;
              return (
                <li key={b.id} className={`${styles.bItem} ${styles['tone_' + tm.tone]} ${expired ? styles.bExpired : ''}`}>
                  <div className={styles.bTop}>
                    <span className={styles.bIco}><Ico name={tm.icon}/></span>
                    <span className={styles.bTitle}>{b.title}</span>
                    <Pill tone={tm.tone}>{tm.label}</Pill>
                    {expired && <Pill tone="muted">منتهٍ</Pill>}
                    <button type="button" className={`nq-ibtn ${styles.ibtnDanger}`}
                      aria-label={`حذف الإشعار ${b.title}`} title="حذف"
                      onClick={() => askDelete(b)}><Ico name="trash"/></button>
                  </div>
                  <p className={styles.bBody}>{b.body}</p>
                  <span className={styles.bDate}>
                    <Icon name="timer"/>{timeAgo(b.created_at)}
                    {b.expires_at && !expired && ` · ينتهي ${fmtDate(b.expires_at)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </div>
  );
}

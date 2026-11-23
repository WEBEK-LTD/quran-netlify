// Audit log (السجل): every admin action, newest first.
import { useState } from 'react';
import { getLog } from '../../adminApi';
import { styles, useLoader, TabHeader, Ico, ErrorBox, Empty, Pagination, PageLoader, fmtDate } from './shared';

const LOG_PER_PAGE = 50;

// Arabic description + tone for the actions the API records.
const ACTIONS = {
  'user.update':         ['تعديل عضو', 'gold', 'user'],
  'user.ban':            ['حظر عضو', 'danger', 'ban'],
  'user.unban':          ['رفع حظر', 'ok', 'lock'],
  'user.message':        ['رسالة لعضو', 'info', 'mail'],
  'broadcast.create':    ['إشعار جديد', 'info', 'bell'],
  'broadcast.delete':    ['حذف إشعار', 'danger', 'trash'],
  'settings.update':     ['تعديل الإعدادات', 'gold', 'gear'],
  'integrations.update': ['تعديل التكاملات', 'gold', 'key'],
  'integrations.test':   ['اختبار تكامل', 'muted', 'pulse'],
  'ticket.reply':        ['رد على تذكرة', 'info', 'chat'],
  'ticket.status':       ['حالة تذكرة', 'warn', 'chat'],
};

export default function LogTab() {
  const [page, setPage] = useState(1);
  const res = useLoader(() => getLog({ page, perPage: LOG_PER_PAGE }), [page]);
  const items = res.data?.items || [];
  return (
    <div className={styles.tabContent}>
      <TabHeader icon="scroll" title="السجل" sub="كل إجراءات المشرفين، الأحدث أولاً">
        <button type="button" className="nq-btn ghost sm" onClick={() => res.reload()} disabled={res.loading}>
          <Ico name="refresh"/>{res.loading ? 'جارٍ التحديث...' : 'تحديث'}
        </button>
      </TabHeader>
      {res.error && <ErrorBox message={res.error} onRetry={() => res.reload()}/>}
      {res.loading ? <PageLoader/> : !res.error && (
        <>
          {items.length === 0 && <div className={`nq-card ${styles.card}`}><Empty icon="scroll" text="لا توجد إجراءات مسجّلة بعد"/></div>}
          {items.length > 0 && (
            <div className={`nq-card ${styles.tableCard}`}>
              <table className={`${styles.table} ${styles.logTable}`}>
                <thead>
                  <tr><th scope="col">الوقت</th><th scope="col">المشرف</th><th scope="col">الإجراء</th><th scope="col">الهدف</th></tr>
                </thead>
                <tbody>
                  {items.map(r => {
                    const a = ACTIONS[r.action];
                    return (
                      <tr key={r.id}>
                        <td className={styles.cellTime} title={r.created_at}>{fmtDate(r.created_at)}</td>
                        <td className={styles.cellAdmin}><bdi className={styles.ltrInline}>{r.admin_email || '—'}</bdi></td>
                        <td className={styles.cellAction}>
                          <span className={`${styles.actionTag} ${styles['tone_' + (a ? a[1] : 'muted')]}`}>
                            <Ico name={a ? a[2] : 'doc'}/>{a ? a[0] : r.action}
                          </span>
                          <code className={styles.keyCode}>{r.action}</code>
                        </td>
                        <td className={styles.logTarget}><bdi>{typeof r.target === 'object' && r.target !== null ? JSON.stringify(r.target) : (r.target || '—')}</bdi></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} perPage={res.data?.per_page || LOG_PER_PAGE} total={res.data?.total || 0} onPage={setPage}/>
        </>
      )}
    </div>
  );
}

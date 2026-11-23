// Live and scheduled rooms (الغرف الحية), every gender scope; close now / cancel, ban the host from rooms.
import { useState } from 'react';
import { listCommunityRooms, closeCommunityRoom } from '../../../adminApi';
import { styles, useLoader, useInterval, Pill, Ico, ConfirmDialog, ErrorBox, Empty, PageLoader, fmtDate, fmtFull } from '../shared';
import { GENDER_SCOPE, SuspendModal, nameOf, when } from './common';

export default function RoomsPanel({ notify, onChanged, onOpenUser }) {
  const [status, setStatus] = useState('open');
  const list = useLoader(() => listCommunityRooms({ status }), [status]);
  useInterval(() => list.reload({ silent: true }), 30_000);
  const items = list.data?.items || [];
  const limits = list.data?.limits || {};
  const [confirm, setConfirm] = useState(null);
  const [ban, setBan] = useState(null);

  function askClose(r) {
    const sched = r.status === 'scheduled';
    setConfirm({
      title: sched ? 'إلغاء الغرفة المجدولة' : 'إغلاق الغرفة فوراً', danger: true, icon: 'x',
      confirmLabel: sched ? 'إلغاء الغرفة' : 'إغلاق الآن',
      message: sched
        ? `ستُلغى «${r.title}» ويصل إشعار الإلغاء لمن طلب التذكير بها.`
        : `ستُغلق «${r.title}» الآن ويخرج كل من فيها (${fmtFull((r.listener_count || 0) + (r.speaker_count || 0))} شخصاً)، ويُحذف شاتها غير المبلّغ عنه.`,
      onConfirm: async () => {
        await closeCommunityRoom(r.id);
        list.setData(d => d ? { ...d, items: d.items.filter(x => x.id !== r.id), open_count: sched ? d.open_count : Math.max(0, (d.open_count || 1) - 1) } : d);
        onChanged && onChanged();
        notify('ok', sched ? 'أُلغيت الغرفة' : 'أُغلقت الغرفة');
      },
    });
  }

  return (
    <div className={styles.cmPanel}>
      <div className={styles.cmFilters}>
        <div className={`nq-seg ${styles.seg}`} role="group" aria-label="حالة الغرف">
          <button type="button" aria-pressed={status === 'open'} onClick={() => setStatus('open')}>مباشرة الآن</button>
          <button type="button" aria-pressed={status === 'scheduled'} onClick={() => setStatus('scheduled')}>مجدولة</button>
        </div>
        {list.data && (
          <span className={styles.cmMeta}>
            <b className="nq-num">{fmtFull(list.data.open_count ?? 0)}</b> من <b className="nq-num">{fmtFull(limits.max_concurrent ?? 0)}</b> غرفة مفتوحة كحد أقصى
            {' · '}حتى <b className="nq-num">{fmtFull(limits.max_listeners ?? 0)}</b> مستمع في الغرفة
          </span>
        )}
        <button type="button" className={`nq-btn ghost sm ${styles.cmPushEnd}`} onClick={() => list.reload()} disabled={list.loading}><Ico name="refresh"/>تحديث</button>
      </div>

      {list.error && <ErrorBox message={list.error} onRetry={() => list.reload()}/>}
      {list.loading && !list.data ? <PageLoader/> : !list.error && (
        items.length === 0
          ? <div className={`nq-card ${styles.card}`}><Empty icon="users" text={status === 'open' ? 'لا توجد غرف مباشرة الآن' : 'لا توجد غرف مجدولة'}/></div>
          : (
            <div className={`nq-card ${styles.card} ${styles.cmRoomCard}`}>
              <ul className={styles.cmRooms}>
                {items.map(r => (
                  <li key={r.id} className={styles.cmRoom}>
                    <div className={styles.cmRoomMain}>
                      <strong className={styles.cmRoomTitle}><bdi>{r.title}</bdi></strong>
                      <span className={styles.cmRoomPills}>
                        <Pill tone={r.gender_scope === 'women' ? 'gold' : r.gender_scope === 'men' ? 'info' : 'ok'}>{GENDER_SCOPE[r.gender_scope] || r.gender_scope}</Pill>
                        {r.visibility === 'group_members' && <Pill tone="muted">لأعضاء الجروب فقط</Pill>}
                        {r.locked && <Pill tone="warn" icon="lock">مقفلة</Pill>}
                        {r.no_speaker_since && r.status === 'open' && <Pill tone="warn">بلا متحدث منذ {when(r.no_speaker_since)}</Pill>}
                      </span>
                      <span className={styles.cmMeta}>
                        المضيف: {r.owner
                          ? <button type="button" className={styles.cmPersonBtn} onClick={() => onOpenUser(r.owner)}>«{nameOf(r.owner)}»</button>
                          : 'غير معروف'}
                        {r.group && <> · الجروب: «{r.group.name}» <span className="nq-num">#{r.group.id}</span></>}
                        {r.status === 'open'
                          ? <> · <b className="nq-num">{fmtFull(r.listener_count)}</b> مستمع · <b className="nq-num">{fmtFull(r.speaker_count)}</b> على المنصة · فُتحت {when(r.opened_at)}</>
                          : <> · موعدها {fmtDate(r.scheduled_at)}</>}
                      </span>
                    </div>
                    <div className={styles.cmRoomActs}>
                      {r.owner && <button type="button" className="nq-btn sm ghost" onClick={() => setBan(r.owner)}>حظر المضيف من الغرف</button>}
                      <button type="button" className={`nq-btn sm ${styles.btnOutlineDanger}`} onClick={() => askClose(r)}>
                        <Ico name="x"/>{r.status === 'open' ? 'إغلاق فوراً' : 'إلغاء'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
      {ban && <SuspendModal user={ban} scope="rooms" onClose={() => setBan(null)}
        onDone={() => { notify('ok', 'تم تطبيق الحظر'); list.reload({ silent: true }); onChanged && onChanged(); }}/>}
    </div>
  );
}

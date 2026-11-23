// Suspended accounts (الحسابات الموقوفة): dictionary auto-suspensions waiting for a decision, and admin suspensions.
import { useState, useEffect } from 'react';
import { listCommunitySuspensions, reactivateCommunityUser, lockCommunityUser } from '../../../adminApi';
import { styles, useLoader, Pill, Avatar, Ico, ConfirmDialog, ErrorBox, Empty, Pagination, PageLoader, fmtDate } from '../shared';
import { CONTEXT_LABEL, LevelPill, PersonRef, Evidence, nameOf, when } from './common';

const PER_PAGE = 20;
const SOURCES = [['', 'الكل'], ['dictionary', 'بالقاموس (تلقائي)'], ['admin', 'بقرار مشرف']];

export default function SuspensionsPanel({ notify, onChanged, onOpenUser }) {
  const [source, setSource] = useState('dictionary');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [source]);
  const list = useLoader(() => listCommunitySuspensions({ source, page, perPage: PER_PAGE }), [source, page]);
  const items = list.data?.items || [];
  const total = list.data?.total ?? 0;
  const [confirm, setConfirm] = useState(null);

  function drop(uid) {
    list.setData(d => d ? { ...d, items: d.items.filter(x => x.user?.id !== uid), total: Math.max(0, (d.total || 0) - 1) } : d);
  }

  function askReactivate(s) {
    setConfirm({
      title: 'إعادة تفعيل الحساب', icon: 'check', confirmLabel: 'إعادة التفعيل',
      message: `سيُرفع الإيقاف عن ${nameOf(s.user)} ويعود إلى ${s.scope === 'rooms' ? 'الغرف' : 'المجتمع'} فوراً. النصوص المحجوزة تبقى محفوظة كدليل.`,
      onConfirm: async () => {
        await reactivateCommunityUser(s.user.id);
        drop(s.user.id); onChanged && onChanged();
        notify('ok', 'أُعيد تفعيل الحساب');
      },
    });
  }
  function askLock(s) {
    setConfirm({
      title: 'قفل نهائي', icon: 'lock', danger: true, confirmLabel: 'قفل نهائي',
      message: `سيصبح إيقاف ${nameOf(s.user)} في المجتمع دائماً بلا مدة (الغرف والجروبات والرسائل والصداقة). يبقى بإمكانه استخدام باقي التطبيق، ويمكن إعادة تفعيله لاحقاً من هنا.`,
      onConfirm: async () => {
        await lockCommunityUser(s.user.id);
        list.setData(d => d ? { ...d, items: d.items.map(x => x.user?.id === s.user.id ? { ...x, locked: true, until: null, scope: 'community' } : x) } : d);
        onChanged && onChanged();
        notify('ok', 'أصبح الإيقاف نهائياً');
      },
    });
  }

  return (
    <div className={styles.cmPanel}>
      <div className={styles.cmFilters}>
        <div className={`nq-seg ${styles.seg}`} role="group" aria-label="مصدر الإيقاف">
          {SOURCES.map(([v, l]) => <button key={v || 'all'} type="button" aria-pressed={source === v} onClick={() => setSource(v)}>{l}</button>)}
        </div>
      </div>
      {source === 'dictionary' && (
        <div className={styles.helper}>
          <Ico name="info"/>
          <p>أُوقفت هذه الحسابات تلقائياً لأن نصاً منها احتوى كلمة «شديدة» من القاموس، ولم يُنشر النص. يبقى الإيقاف حتى تقرّر: راجع الدليل ثم أعد التفعيل أو اقفل الحساب نهائياً.</p>
        </div>
      )}

      {list.error && <ErrorBox message={list.error} onRetry={() => list.reload()}/>}
      {list.loading && !list.data ? <PageLoader/> : !list.error && (
        <>
          <div className={styles.resultCount}><b className="nq-num">{total}</b> حساب موقوف</div>
          {items.length === 0
            ? <div className={`nq-card ${styles.card}`}><Empty icon="check" text="لا توجد حسابات موقوفة هنا"/></div>
            : (
              <div className={styles.cmList}>
                {items.map(s => <SuspensionCard key={s.user?.id ?? s.created_at} s={s} onReactivate={askReactivate} onLock={askLock} onOpenUser={onOpenUser}/>)}
              </div>
            )}
          <Pagination page={page} perPage={list.data?.per_page || PER_PAGE} total={total} onPage={setPage}/>
        </>
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    </div>
  );
}

function SuspensionCard({ s, onReactivate, onLock, onOpenUser }) {
  const [all, setAll] = useState(false);
  const ev = Array.isArray(s.evidence) ? s.evidence : [];
  const shown = all ? ev : ev.slice(0, 2);
  const auto = s.source === 'dictionary';
  return (
    <article className={`${styles.cmItem} ${auto && !s.locked ? styles.cmItemHot : ''}`}>
      <div className={styles.cmItemHead}>
        {s.user && <Avatar user={s.user} size="sm"/>}
        <PersonRef user={s.user} onOpen={onOpenUser}/>
        <span className={styles.cmMeta}>· {when(s.created_at)}</span>
        <span className={styles.cmReason}>
          <Pill tone={s.scope === 'rooms' ? 'warn' : 'danger'}>{s.scope === 'rooms' ? 'محظور من الغرف' : 'موقوف في المجتمع'}</Pill>
          <Pill tone={auto ? 'warn' : 'info'}>{auto ? 'تلقائي بالقاموس' : 'بقرار مشرف'}</Pill>
          {s.locked ? <Pill tone="danger" icon="lock">نهائي</Pill>
            : s.until ? <Pill tone="muted">حتى {fmtDate(s.until)}</Pill>
              : <Pill tone="gold">ينتظر قرارك</Pill>}
        </span>
      </div>
      {s.reason && <p className={styles.cmDetails}>السبب: <bdi>{s.reason}</bdi></p>}
      {shown.length > 0 && (
        <div className={styles.cmEvList}>
          {shown.map(h => (
            <div key={h.id} className={styles.cmEvRow}>
              <span className={styles.cmMeta}>
                <LevelPill level={h.level}/> {CONTEXT_LABEL[h.context] || h.context} · {when(h.created_at)}
                {h.matched && <> · الكلمة: <b><bdi>{h.matched}</bdi></b></>}
              </span>
              <Evidence text={h.body} matched={h.matched}/>
            </div>
          ))}
          {ev.length > 2 && (
            <button type="button" className={styles.linkBtn} onClick={() => setAll(a => !a)} aria-expanded={all}>
              {all ? 'عرض أقل' : `عرض كل الأدلة (${ev.length})`}
            </button>
          )}
        </div>
      )}
      {ev.length === 0 && auto && <span className={styles.cmGone}>لا يوجد دليل محفوظ (حُذف).</span>}
      <div className={styles.cmActions}>
        <button type="button" className={`nq-btn sm ${styles.btnOutlineOk}`} onClick={() => onReactivate(s)} disabled={!s.user}><Ico name="refresh"/>إعادة تفعيل</button>
        {!(s.locked && !s.until && s.scope === 'community') && (
          <button type="button" className={`nq-btn sm ${styles.btnOutlineDanger}`} onClick={() => onLock(s)} disabled={!s.user}><Ico name="lock"/>قفل نهائي</button>
        )}
      </div>
    </article>
  );
}

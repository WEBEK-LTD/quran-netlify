// Overview (الرئيسية) and analytics (الإحصائيات) tabs.
import { getStats, listUsers, listTickets } from '../../adminApi';
import { Icon } from '../../components/ornaments/Ornaments';
import {
  styles, useLoader, useInterval, TabHeader, SectionCard, Kpi, Pill, Avatar, Ico,
  ErrorBox, ErrorLine, InlineWarn, Empty, PageLoader, fmt, fmtFull, lastDays, timeAgo,
} from './shared';

// ─── Stats (shared by Overview + Analytics) ──────────────────────────────────
function useStats() {
  const stats = useLoader(() => getStats(), []);
  useInterval(() => stats.reload({ silent: true }), 30_000);
  return stats;
}

function onlineOf(s) {
  const o = (s && s.online_now) || {};
  return { total: o.total || 0, signedIn: o.signed_in || 0, guests: o.guests || 0 };
}

function LivePanel({ online }) {
  return (
    <div className={`nq-card ${styles.live}`} role="status" aria-live="polite">
      <span className={styles.liveDot} aria-hidden="true"/>
      <div className={styles.liveMain}>
        <span className={styles.liveLabel}>مباشر · على الموقع الآن</span>
        <b className={`${styles.liveCount} nq-num`}>{fmtFull(online.total)}</b>
      </div>
      <div className={styles.liveSplit}>
        <span><i className={styles.swGold} aria-hidden="true"/>مسجّلون <b className="nq-num">{fmtFull(online.signedIn)}</b></span>
        <span><i className={styles.swInfo} aria-hidden="true"/>زوار <b className="nq-num">{fmtFull(online.guests)}</b></span>
      </div>
      <span className={styles.liveNote}><Ico name="refresh"/>يتحدّث تلقائياً كل ٣٠ ثانية</span>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
export function OverviewTab({ onTabChange }) {
  const stats   = useStats();
  const recent  = useLoader(() => listUsers({ page: 1, perPage: 5 }), []);
  const openTix = useLoader(() => listTickets({ status: 'open', page: 1, perPage: 5 }), []);

  const s = stats.data;
  const online = onlineOf(s);

  return (
    <div className={styles.tabContent}>
      <TabHeader icon="home" title="الرئيسية" sub="نظرة عامة على التطبيق، تتحدّث كل ٣٠ ثانية" live>
        <button type="button" className="nq-btn ghost sm" onClick={() => onTabChange('broadcasts')}><Icon name="bell"/>إشعار جديد</button>
      </TabHeader>
      {stats.loading && !s && <PageLoader/>}
      {stats.error && !s && <ErrorBox message={stats.error} onRetry={() => stats.reload()}/>}
      {s && <>
        {stats.error && <InlineWarn text={`تعذّر التحديث: ${stats.error}`}/>}
        <LivePanel online={online}/>
        <div className={styles.kpiGrid}>
          <Kpi icon="users"    label="إجمالي الأعضاء"          value={fmt(s.users_total)} delta={s.users_today > 0 ? `+${s.users_today} اليوم` : null}/>
          <Kpi icon="plus"     label="أعضاء جدد (٧ أيام)"      value={fmt(s.users_7d)}/>
          <Kpi icon="book"     label="إجمالي الآيات المقروءة"  value={fmt(s.ayahs_total)}/>
          <Kpi icon="chart"    label="متوسط القراءة"           value={s.users_total > 0 ? fmt(Math.round((s.ayahs_total || 0) / s.users_total)) : 0} sub="آية لكل عضو"/>
          <Kpi icon="star"     label="نشطون (٧ أيام)"          value={fmt(s.active_7d)}/>
          <Kpi icon="chat"     label="تذاكر الدعم المفتوحة"    value={fmt(s.tickets_open)} tone={s.tickets_open > 0 ? 'warn' : undefined} onClick={() => onTabChange('support')}/>
          <Kpi icon="globe"    label="على الموقع الآن"         value={fmt(online.total)} sub={`${online.signedIn} مسجّل · ${online.guests} زائر`}/>
        </div>
      </>}

      <div className={styles.overviewCols}>
        <SectionCard icon="users" title="آخر الأعضاء"
          action={<button type="button" className={styles.linkBtn} onClick={() => onTabChange('users')}>عرض الكل<Icon name="back" className={styles.flip}/></button>}>
          {recent.loading && !recent.data && <PageLoader/>}
          {recent.error && <ErrorLine message={recent.error} onRetry={() => recent.reload()}/>}
          {recent.data && (recent.data.items || []).length === 0 && <Empty icon="users" text="لا يوجد أعضاء بعد"/>}
          <ul className={styles.miniList}>
            {(recent.data?.items || []).map(u => (
              <li key={u.id} className={styles.miniRow}>
                <Avatar user={u} size="sm"/>
                <div className={styles.miniInfo}>
                  <span className={styles.miniName}>{u.name || u.email?.split('@')[0]}</span>
                  <span className={styles.miniSub}>انضم {timeAgo(u.created_at)}</span>
                </div>
                {u.is_admin && <Pill tone="gold" icon="shieldUser">مشرف</Pill>}
                {u.banned && <Pill tone="danger" icon="ban">محظور</Pill>}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon="chat" title="تذاكر الدعم المفتوحة"
          action={<button type="button" className={styles.linkBtn} onClick={() => onTabChange('support')}>فتح الدعم<Icon name="back" className={styles.flip}/></button>}>
          {openTix.loading && !openTix.data && <PageLoader/>}
          {openTix.error && <ErrorLine message={openTix.error} onRetry={() => openTix.reload()}/>}
          {openTix.data && (openTix.data.items || []).length === 0 && <Empty icon="check" text="لا توجد تذاكر مفتوحة، الحمد لله"/>}
          <ul className={styles.miniList}>
            {(openTix.data?.items || []).map(t => (
              <li key={t.id} className={styles.miniRow}>
                <span className={styles.ticketDot} aria-hidden="true"/>
                <div className={styles.miniInfo}>
                  <span className={styles.miniName}>{t.subject || 'استفسار'}</span>
                  <span className={styles.miniSub}><bdi>{t.user?.email || '—'}</bdi> · {timeAgo(t.created_at)}</span>
                </div>
                {t.unread > 0 && <span className={styles.countBadge} aria-label={`${t.unread} غير مقروءة`}>{t.unread}</span>}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon="star" title="روابط سريعة">
          <div className={styles.quickList}>
            <a href="https://api.nuralquran.net/v1/health" target="_blank" rel="noreferrer" className={styles.quickLink}>
              <span className={styles.quickIco}><Ico name="pulse"/></span>
              <span className={styles.quickText}><b>حالة الخادم</b><small>فحص سريع لاستجابة الواجهة البرمجية</small></span>
              <Ico name="external" className={styles.quickGo}/>
              <span className="nq-sr">(يفتح في نافذة جديدة)</span>
            </a>
            <button type="button" className={styles.quickLink} onClick={() => onTabChange('broadcasts')}>
              <span className={styles.quickIco}><Icon name="bell"/></span>
              <span className={styles.quickText}><b>إرسال إشعار للأعضاء</b><small>إعلان يظهر في لوحة كل عضو</small></span>
              <Icon name="back" className={`${styles.quickGo} ${styles.flip}`}/>
            </button>
            <button type="button" className={styles.quickLink} onClick={() => onTabChange('settings')}>
              <span className={styles.quickIco}><Icon name="gear"/></span>
              <span className={styles.quickText}><b>إعدادات التطبيق</b><small>الاسم، الإعلان، الصيانة، الميزات</small></span>
              <Icon name="back" className={`${styles.quickGo} ${styles.flip}`}/>
            </button>
            <button type="button" className={styles.quickLink} onClick={() => onTabChange('integrations')}>
              <span className={styles.quickIco}><Ico name="key"/></span>
              <span className={styles.quickText}><b>التكاملات</b><small>Google · المساعد · البريد</small></span>
              <Icon name="back" className={`${styles.quickGo} ${styles.flip}`}/>
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function Meter({ label, parts, total }) {
  return (
    <div className={styles.meterWrap}>
      <div className={styles.meter} role="img" aria-label={label}>
        {parts.filter(p => p.value > 0).map(p => (
          <span key={p.label} className={`${styles.meterSeg} ${styles['sw_' + p.tone]}`} style={{ flexGrow: p.value }} title={`${p.label}: ${p.value}`}/>
        ))}
        {total === 0 && <span className={styles.meterSeg} style={{ flexGrow: 1 }}/>}
      </div>
      <ul className={styles.legend}>
        {parts.map(p => (
          <li key={p.label} className={styles.legendItem}>
            <i className={`${styles.legendDot} ${styles['sw_' + p.tone]}`} aria-hidden="true"/>
            <span className={styles.legendLabel}>{p.label}</span>
            <b className={`${styles.legendVal} nq-num`}>{fmtFull(p.value)}</b>
            <span className={styles.legendPct}>{total > 0 ? Math.round((p.value / total) * 100) : 0}٪</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalyticsTab() {
  const stats = useStats();
  const s = stats.data;

  const head = <TabHeader icon="chart" title="الإحصائيات" sub="تحليل استخدام التطبيق، تتحدّث كل ٣٠ ثانية" live/>;
  if (stats.loading && !s) return <div className={styles.tabContent}>{head}<PageLoader/></div>;
  if (stats.error && !s) return (
    <div className={styles.tabContent}>
      {head}
      <ErrorBox message={stats.error} onRetry={() => stats.reload()}/>
    </div>
  );

  const online = onlineOf(s);
  const totalUsers = s.users_total || 0;
  const active = Math.min(s.active_7d || 0, totalUsers);
  const days = lastDays(s.signups_by_day, 14);
  const maxReg = Math.max(...days.map(d => d.count), 1);
  const signups14 = days.reduce((a, d) => a + d.count, 0);
  const growth = [
    { label: 'اليوم',   value: s.users_today || 0 },
    { label: '٧ أيام',  value: s.users_7d || 0 },
    { label: '١٤ يوماً', value: signups14 },
  ];
  const maxGrowth = Math.max(...growth.map(g => g.value), 1);
  const ticks = [maxReg, Math.round(maxReg / 2), 0].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className={styles.tabContent}>
      {head}
      {stats.error && <InlineWarn text={`تعذّر التحديث: ${stats.error}`}/>}

      <div className={styles.kpiGrid}>
        <Kpi icon="users" label="إجمالي الأعضاء"  value={fmt(totalUsers)} delta={s.users_today > 0 ? `+${s.users_today} اليوم` : null}/>
        <Kpi icon="book"  label="إجمالي الآيات"   value={fmt(s.ayahs_total)}/>
        <Kpi icon="star"  label="نشطون (٧ أيام)"  value={fmt(s.active_7d)}/>
        <Kpi icon="chat"  label="تذاكر مفتوحة"    value={fmt(s.tickets_open)} tone={s.tickets_open > 0 ? 'warn' : undefined}/>
        <Kpi icon="globe" label="على الموقع الآن" value={fmt(online.total)} sub={`${online.signedIn} مسجّل · ${online.guests} زائر`}/>
      </div>

      <LivePanel online={online}/>

      <div className={styles.analyticsGrid}>
        <SectionCard icon="calendar" title="التسجيلات في آخر ١٤ يوماً" className={styles.chartWide}
          action={<span className={styles.chartTotal}><b className="nq-num">{fmtFull(signups14)}</b> تسجيلاً</span>}>
          {signups14 === 0
            ? <Empty icon="calendar" text="لا توجد تسجيلات في آخر ١٤ يوماً"/>
            : <>
              <div className={styles.barChart} aria-hidden="true">
                <div className={styles.barAxis}>{ticks.map(t => <span key={t} className="nq-num">{t}</span>)}</div>
                <div className={styles.barPlot}>
                  <div className={styles.barGrid}>{ticks.map(t => <i key={t}/>)}</div>
                  {days.map(d => (
                    <div key={d.key} className={styles.barCol} data-tip={`${d.long}: ${d.count} تسجيل`}>
                      <div className={styles.barTrack}>
                        {d.count > 0 && <div className={styles.bar} style={{ height: `${Math.max((d.count / maxReg) * 100, 4)}%` }}/>}
                      </div>
                      <div className={styles.barLabel}>{d.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <table className="nq-sr">
                <caption>التسجيلات اليومية في آخر ١٤ يوماً</caption>
                <thead><tr><th scope="col">اليوم</th><th scope="col">التسجيلات</th></tr></thead>
                <tbody>{days.map(d => <tr key={d.key}><td>{d.long}</td><td>{d.count}</td></tr>)}</tbody>
              </table>
            </>}
        </SectionCard>

        <SectionCard icon="star" title="نشاط الأعضاء (٧ أيام)">
          {totalUsers === 0
            ? <Empty icon="users" text="لا يوجد أعضاء بعد"/>
            : <>
              <div className={styles.bigStat}><b className="nq-num">{Math.round((active / totalUsers) * 100)}٪</b><span>من الأعضاء نشطون</span></div>
              <Meter label={`${active} نشطون من ${totalUsers}`} total={totalUsers}
                parts={[{ label: 'نشطون', value: active, tone: 'ok' }, { label: 'غير نشطين', value: totalUsers - active, tone: 'none' }]}/>
            </>}
        </SectionCard>

        <SectionCard icon="globe" title="الزوار الآن">
          {online.total === 0
            ? <Empty icon="globe" text="لا يوجد أحد على الموقع الآن"/>
            : <>
              <div className={styles.bigStat}><b className="nq-num">{fmtFull(online.total)}</b><span>على الموقع الآن</span></div>
              <Meter label={`${online.signedIn} مسجّلون و${online.guests} زوار`} total={online.total}
                parts={[{ label: 'مسجّلون', value: online.signedIn, tone: 'gold' }, { label: 'زوار', value: online.guests, tone: 'info' }]}/>
            </>}
        </SectionCard>

        <SectionCard icon="plus" title="الأعضاء الجدد">
          <ul className={styles.hbarList}>
            {growth.map(g => (
              <li key={g.label} className={styles.hbarRow}>
                <span className={styles.hbarLabel}>{g.label}</span>
                <div className={styles.hbarTrack} title={`${g.label}: ${g.value}`}>
                  <div className={styles.hbarFill} style={{ width: `${(g.value / maxGrowth) * 100}%` }}/>
                </div>
                <b className={`${styles.hbarVal} nq-num`}>{fmtFull(g.value)}</b>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

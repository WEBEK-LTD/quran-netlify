// Room limits (حدود الغرف) and whether the voice server / push services are configured.
import { useState, useEffect, useId } from 'react';
import { getCommunitySettings, saveCommunitySettings } from '../../../adminApi';
import { styles, errMsg, useLoader, useTimers, SectionCard, Pill, Ico, ErrorBox, PageLoader, FieldStatus } from '../shared';

const FIELDS = [
  ['max_listeners', 'أقصى عدد مستمعين في الغرفة الواحدة', 'لا يُحسب من على المنصة. عند الامتلاء يرى الداخل «الغرفة ممتلئة».'],
  ['max_concurrent', 'الغرف المفتوحة في نفس الوقت على التطبيق', 'عند الوصول للحد يرى المستخدم «الغرف ممتلئة الآن، جرّب بعد قليل» بدلاً من فتح غرفة.'],
  ['max_per_user', 'الغرف المفتوحة والمجدولة لكل شخص', 'يشمل الغرف المجدولة التي لم تبدأ بعد.'],
  ['auto_close_minutes', 'إغلاق الغرفة تلقائياً بعد (دقيقة) بلا متحدث', 'تُغلق الغرفة إذا بقيت المنصة فارغة هذه المدة.'],
];

export default function LimitsPanel({ onTabChange }) {
  const res = useLoader(() => getCommunitySettings(), []);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState({});
  const later = useTimers();
  const baseId = useId();

  useEffect(() => {
    if (res.data && !draft) setDraft(Object.fromEntries(FIELDS.map(([k]) => [k, String(res.data.rooms?.[k] ?? '')])));
  }, [res.data, draft]);

  if (res.loading && !res.data) return <PageLoader/>;
  if (res.error && !res.data) return <ErrorBox message={res.error} onRetry={() => res.reload()}/>;
  const d = res.data || {};
  const bounds = d.bounds || {};
  const cur = d.rooms || {};
  const dirty = draft && FIELDS.some(([k]) => String(cur[k] ?? '') !== draft[k]);
  const invalid = draft && FIELDS.some(([k]) => {
    const v = Number(draft[k]); const b = bounds[k];
    return draft[k] === '' || !Number.isInteger(v) || (b && (v < b.min || v > b.max));
  });

  async function save(e) {
    e.preventDefault();
    if (!dirty || invalid) return;
    setStatus({ saving: true });
    try {
      const out = await saveCommunitySettings(Object.fromEntries(FIELDS.map(([k]) => [k, Number(draft[k])])));
      if (out && typeof out === 'object') {
        res.setData(out);
        setDraft(Object.fromEntries(FIELDS.map(([k]) => [k, String(out.rooms?.[k] ?? draft[k])])));
      }
      setStatus({ saved: true });
      later(() => setStatus(s => (s.saved ? {} : s)), 2500);
    } catch (err) {
      setStatus({ error: errMsg(err) });
    }
  }

  const svc = [
    ['livekit_configured', 'خادم الغرف الصوتية', 'بدونه لا يمكن فتح أي غرفة'],
    ['fcm_configured', 'إشعارات أندرويد (FCM)', ''],
    ['apns_configured', 'إشعارات آيفون (APNs)', ''],
  ];

  return (
    <div className={`${styles.cmPanel} ${styles.cmTwo} ${styles.cmTwoWide}`}>
      <SectionCard icon="gear" title="حدود الغرف">
        {draft && (
          <form onSubmit={save} className={styles.form}>
            {FIELDS.map(([k, label, hint], i) => {
              const b = bounds[k];
              const id = `${baseId}-${k}`;
              const v = Number(draft[k]);
              const bad = draft[k] === '' || !Number.isInteger(v) || (b && (v < b.min || v > b.max));
              return (
                <div key={k} className={`${styles.cmLimit} ${i ? styles.cmLimitSep : ''}`}>
                  <label htmlFor={id} className={styles.cmLimitText}>
                    <span className={styles.fieldLabel}>{label}</span>
                    <span className={styles.cmHint}>{hint}</span>
                    {b && <span className={styles.cmHint}>المسموح من <span className="nq-num">{b.min}</span> إلى <span className="nq-num">{b.max}</span> · الافتراضي <span className="nq-num">{b.default}</span></span>}
                  </label>
                  <input id={id} type="number" inputMode="numeric" dir="ltr" className={`${styles.input} ${styles.cmNum}`}
                    min={b?.min} max={b?.max} step={1} value={draft[k]} aria-invalid={bad || undefined}
                    onChange={e => setDraft(x => ({ ...x, [k]: e.target.value }))} disabled={!!status.saving}/>
                </div>
              );
            })}
            <div className={styles.cmSaveRow}>
              <button type="submit" className="nq-btn gold" disabled={!dirty || invalid || !!status.saving}>حفظ الحدود</button>
              {dirty && !status.saving && <button type="button" className="nq-btn ghost sm"
                onClick={() => setDraft(Object.fromEntries(FIELDS.map(([k]) => [k, String(cur[k] ?? '')])))}>تراجع</button>}
              <FieldStatus status={status}/>
              {invalid && !status.error && <span className={styles.errorTxt}>قيمة خارج الحدود المسموحة</span>}
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard icon="key" title="الخدمات">
        <ul className={styles.cmSvc}>
          {svc.map(([k, label, hint]) => (
            <li key={k}>
              <span><b>{label}</b>{hint && !d[k] && <span className={styles.fieldHint}> · {hint}</span>}</span>
              {d[k] ? <Pill tone="ok" icon="check">مُعدّ</Pill> : <Pill tone="warn" icon="alert">غير مُعدّ</Pill>}
            </li>
          ))}
        </ul>
        {onTabChange && (
          <button type="button" className={styles.linkBtn} onClick={() => onTabChange('integrations')}>
            <Ico name="key"/>الإعداد والاختبار في «التكاملات»
          </button>
        )}
      </SectionCard>
    </div>
  );
}

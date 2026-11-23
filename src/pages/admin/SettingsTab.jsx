// Settings (الإعدادات): identity, announcement, maintenance, sign-up, feature switches.
import { useState, useEffect, useRef } from 'react';
import { getSettings, updateSettings } from '../../adminApi';
import {
  styles, errMsg, useLoader, useTimers, TabHeader, SectionCard, ToggleRow, SettingRow, Ico,
  ErrorBox, PageLoader,
} from './shared';

const FEATURES = [
  { key: 'hifz',         icon: 'grid',   label: 'الحفظ والمراجعة' },
  { key: 'khatma',       icon: 'check',  label: 'الختمة الشخصية' },
  { key: 'khatma_group', icon: 'users',  label: 'الختمة الجماعية' },
  { key: 'leaderboard',  icon: 'trophy', label: 'المتصدرون' },
  { key: 'ijaza',        icon: 'scroll', label: 'الإجازة والقراءات' },
  { key: 'ai_assistant', icon: 'chat',   label: 'المساعد' },
  { key: 'notes',        icon: 'pen',    label: 'الملاحظات' },
  { key: 'search',       icon: 'search', label: 'البحث' },
];

const SETTING_TEXT_KEYS = ['app_name', 'description', 'announcement'];

export default function SettingsTab() {
  const res = useLoader(() => getSettings(), []);
  const saved = res.data;                          // server truth
  const [draft, setDraft]   = useState({});        // text fields being edited
  const [status, setStatus] = useState({});        // key → {saving|saved|error}
  const later = useTimers();
  const inited = useRef(false);

  // Fill the text drafts once; later saves only touch the field that was saved,
  // so typing in another field while a save is in flight is never wiped.
  useEffect(() => {
    if (saved && !inited.current) {
      inited.current = true;
      setDraft(Object.fromEntries(SETTING_TEXT_KEYS.map(k => [k, saved[k] ?? ''])));
    }
  }, [saved]);

  async function save(statusKey, patch) {
    setStatus(s => ({ ...s, [statusKey]: { saving: true } }));
    try {
      const next = await updateSettings(patch);
      const merged = next && typeof next === 'object' ? next : null;
      res.setData(d => merged || { ...d, ...patch });
      if (merged) {
        const texts = Object.keys(patch).filter(k => SETTING_TEXT_KEYS.includes(k));
        if (texts.length) setDraft(d => { const n = { ...d }; for (const k of texts) n[k] = merged[k] ?? ''; return n; });
      }
      setStatus(s => ({ ...s, [statusKey]: { saved: true } }));
      later(() => setStatus(s => (s[statusKey]?.saved ? { ...s, [statusKey]: {} } : s)), 2500);
    } catch (e) {
      setStatus(s => ({ ...s, [statusKey]: { error: errMsg(e) } }));
    }
  }

  function saveText(key) {
    const v = draft[key] ?? '';
    if (v === (saved?.[key] ?? '')) return;
    save(key, { [key]: v });
  }

  const head = <TabHeader icon="gear" title="الإعدادات" sub="تخصيص التطبيق، وتُطبَّق التغييرات فوراً على الخادم والموقع"/>;
  if (res.loading && !saved) return <div className={styles.tabContent}>{head}<PageLoader/></div>;
  if (res.error && !saved) return (
    <div className={styles.tabContent}>
      {head}
      <ErrorBox message={res.error} onRetry={() => res.reload()}/>
    </div>
  );

  const features = saved.features || {};
  const onCount = FEATURES.filter(f => features[f.key] !== false).length;
  const textProps = (key) => ({
    value: draft[key] ?? '',
    onChange: e => setDraft(d => ({ ...d, [key]: e.target.value })),
    onBlur: () => saveText(key),
    disabled: !!status[key]?.saving,
  });

  return (
    <div className={styles.tabContent}>
      {head}
      <div className={styles.helper}>
        <Ico name="info"/>
        <p>
          هذه الإعدادات تُطبَّق فعلياً: الميزة المعطّلة تختفي من الموقع ويرفض الخادم طلباتها،
          ووضع الصيانة يوقف الموقع لغير المشرفين، وإيقاف التسجيل يمنع إنشاء حسابات جديدة. تُحفظ الحقول النصية عند الخروج منها.
        </p>
      </div>
      <div className={styles.settingsGrid}>
        <SectionCard icon="star" title="هوية التطبيق">
          <div className={styles.form}>
            <SettingRow label="اسم التطبيق" status={status.app_name}>
              {id => <input id={id} className={styles.input} maxLength={80} {...textProps('app_name')}/>}
            </SettingRow>
            <SettingRow label="وصف التطبيق" status={status.description}>
              {id => <textarea id={id} className={styles.input} rows={2} maxLength={300} {...textProps('description')}/>}
            </SettingRow>
          </div>
        </SectionCard>

        <SectionCard icon="bell" title="إعلان للمستخدمين">
          <div className={styles.form}>
            <SettingRow label="نص الإعلان" hint="يظهر شريطاً أعلى الموقع، والفارغ يُخفيه" status={status.announcement}>
              {id => <textarea id={id} className={styles.input} rows={3} maxLength={500}
                placeholder="مثال: سيتوقف التطبيق للصيانة مساء الجمعة..." {...textProps('announcement')}/>}
            </SettingRow>
          </div>
        </SectionCard>

        <SectionCard icon="shield" title="الصيانة والأمان">
          <div className={styles.toggleList}>
            <ToggleRow icon="lock" label="وضع الصيانة" hint="يمنع دخول غير المشرفين إلى الموقع"
              value={!!saved.maintenance_mode} status={status.maintenance_mode}
              onChange={v => save('maintenance_mode', { maintenance_mode: v })}/>
            <ToggleRow icon="user" label="السماح بالتسجيل" hint="إيقافه يمنع إنشاء حسابات جديدة"
              value={saved.allow_signup !== false} status={status.allow_signup}
              onChange={v => save('allow_signup', { allow_signup: v })}/>
          </div>
        </SectionCard>

        <SectionCard icon="grid" title="تفعيل الميزات"
          action={<span className={styles.chartTotal}><b className="nq-num">{onCount}</b> من {FEATURES.length} مفعّلة</span>}>
          <div className={`${styles.toggleList} ${styles.toggleGrid}`}>
            {FEATURES.map(f => (
              <ToggleRow key={f.key} icon={f.icon} label={f.label}
                value={features[f.key] !== false} status={status['f_' + f.key]}
                onChange={v => save('f_' + f.key, { features: { ...features, [f.key]: v } })}/>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

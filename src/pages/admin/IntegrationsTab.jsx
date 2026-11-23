// Integrations (التكاملات): Google sign-in, the assistant provider, the mail sender (+ SMTP).
// Secrets are write-only: the server returns only whether they are set and a short preview.
import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { getIntegrations, updateIntegrations, testIntegration } from '../../adminApi';
import { Icon, Badge8 } from '../../components/ornaments/Ornaments';
import {
  styles, errMsg, useLoader, useTimers, TabHeader, Pill, Ico, FormError,
  ErrorBox, PageLoader,
} from './shared';

const GOOGLE_REDIRECT_URI = 'https://api.nuralquran.net/v1/auth/google/callback';
const GOOGLE_JS_ORIGIN    = 'https://nuralquran.net';

const FIELD_META = {
  google_client_id:     { label: 'Client ID', placeholder: 'xxxxxxxx.apps.googleusercontent.com', ltr: true },
  google_client_secret: { label: 'Client Secret', secret: true, ltr: true },
  ai_provider:          { label: 'المزوّد', select: [['', '— اختر —'], ['openai', 'OpenAI'], ['anthropic', 'Anthropic']] },
  ai_model:             { label: 'النموذج', placeholder: 'اسم النموذج كما يحدده المزوّد', ltr: true },
  openai_api_key:       { label: 'مفتاح OpenAI API', secret: true, ltr: true },
  anthropic_api_key:    { label: 'مفتاح Anthropic API', secret: true, ltr: true },
  mail_from_address:    { label: 'عنوان المرسل', placeholder: 'no-reply@nuralquran.net', ltr: true, type: 'email' },
  mail_from_name:       { label: 'اسم المرسل', placeholder: 'نور القرآن' },
  mail_transport:       { label: 'طريقة الإرسال', select: [['', 'من خادم الموقع'], ['smtp', 'SMTP']] },
  smtp_host:            { label: 'خادم SMTP', placeholder: 'mail.nuralquran.net', ltr: true },
  smtp_port:            { label: 'المنفذ', placeholder: '465', ltr: true, type: 'number' },
  smtp_username:        { label: 'اسم المستخدم', placeholder: 'no-reply@nuralquran.net', ltr: true },
  smtp_password:        { label: 'كلمة المرور', secret: true, ltr: true },
  smtp_encryption:      { label: 'التشفير', select: [['', 'تلقائي حسب المنفذ'], ['tls', 'TLS — المنفذ 587'], ['ssl', 'SSL — المنفذ 465'], ['none', 'بدون']] },
};
const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_encryption'];

const INTEGRATION_GROUPS = [
  {
    id: 'google', icon: 'globe', title: 'تسجيل الدخول بحساب Google', test: 'google',
    hint: 'يتيح للأعضاء الدخول بحساب Google بضغطة واحدة. أنشئ OAuth Client في Google Cloud Console والصق بياناته هنا.',
    keys: ['google_client_id', 'google_client_secret'],
  },
  {
    id: 'ai', icon: 'chat', title: 'المساعد', test: 'ai',
    hint: 'المزوّد والمفتاح اللذان يستخدمهما الخادم للإجابة عن أسئلة الأعضاء حول الآيات؛ ويتوقف المساعد إن لم يُضبط المفتاح.',
    keys: ['ai_provider', 'ai_model', 'openai_api_key', 'anthropic_api_key'],
  },
  {
    id: 'mail', icon: 'mail', title: 'مرسل البريد', test: 'mail',
    hint: 'العنوان والاسم اللذان تُرسل بهما رسائل الموقع (تأكيد البريد، واستعادة كلمة المرور، والتنبيهات الأمنية، ورسائل الدعم)، وطريقة الإرسال: من خادم الموقع أو عبر SMTP.',
    smtpHint: 'لصندوق بريد cPanel: الخادم mail.<نطاقك> (مثل mail.nuralquran.net)، والمنفذ 465 مع SSL، واسم المستخدم هو عنوان البريد كاملاً، ويُفضَّل أن يكون هو نفسه «عنوان المرسل».',
    keys: ['mail_from_address', 'mail_from_name', 'mail_transport', ...SMTP_KEYS],
  },
];

// Server messages may still use the old wording for the assistant.
const plainWording = (s) => String(s || '').replace(/الذكاء الاصطناعي/g, 'المساعد');

function initialValue(item) {
  if (!item || item.secret) return '';
  return item.value ?? item.preview ?? '';
}

export default function IntegrationsTab() {
  const res = useLoader(() => getIntegrations(), []);
  const byKey = {};
  for (const it of (res.data?.items || [])) byKey[it.key] = it;

  const [draft, setDraft]   = useState({});   // key → string
  const [clear, setClear]   = useState({});   // secret key → true (clear on save)
  const [state, setState]   = useState({});   // group → {saving, saved, error}
  const [tests, setTests]   = useState({});   // target → {busy, ok, message}
  const later = useTimers();

  const resetKeys = useCallback((data, keys) => {
    const map = {};
    for (const it of (data?.items || [])) map[it.key] = it;
    setDraft(d => { const n = { ...d }; for (const k of keys) n[k] = initialValue(map[k]); return n; });
    setClear(c => { const n = { ...c }; for (const k of keys) delete n[k]; return n; });
  }, []);

  useEffect(() => {
    if (res.data) resetKeys(res.data, Object.keys(FIELD_META));
  }, [res.data === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const provider = draft.ai_provider ?? initialValue(byKey.ai_provider);
  const transport = draft.mail_transport ?? initialValue(byKey.mail_transport);
  function visibleKeys(g) {
    if (g.id === 'mail') return g.keys.filter(k => transport === 'smtp' || !SMTP_KEYS.includes(k));
    if (g.id !== 'ai') return g.keys;
    return g.keys.filter(k =>
      (k !== 'openai_api_key' && k !== 'anthropic_api_key') ||
      !provider || (provider === 'openai' ? k === 'openai_api_key' : k === 'anthropic_api_key'));
  }
  function changesFor(g) {
    const out = {};
    for (const k of visibleKeys(g)) {
      const meta = FIELD_META[k];
      const item = byKey[k];
      const isSecret = item ? !!item.secret : !!meta.secret;
      const v = draft[k] ?? '';
      if (isSecret) {
        if (clear[k]) out[k] = '';
        else if (v.trim() !== '') out[k] = v.trim();
      } else if (v.trim() !== String(initialValue(item)).trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  }

  async function saveGroup(g) {
    const changes = changesFor(g);
    if (Object.keys(changes).length === 0) return;
    setState(s => ({ ...s, [g.id]: { saving: true } }));
    try {
      const data = await updateIntegrations(changes);
      if (data && Array.isArray(data.items)) { res.setData(data); resetKeys(data, g.keys); }
      else res.reload({ silent: true });
      setState(s => ({ ...s, [g.id]: { saved: true } }));
      later(() => setState(s => (s[g.id]?.saved ? { ...s, [g.id]: {} } : s)), 3000);
    } catch (e) {
      setState(s => ({ ...s, [g.id]: { error: errMsg(e) } }));
    }
  }

  async function runTest(target) {
    setTests(t => ({ ...t, [target]: { busy: true } }));
    try {
      const r = await testIntegration(target);
      setTests(t => ({ ...t, [target]: { ok: !!(r && r.ok), message: plainWording((r && r.message) || (r && r.ok ? 'نجح الاختبار' : 'فشل الاختبار')) } }));
    } catch (e) {
      setTests(t => ({ ...t, [target]: { ok: false, message: plainWording(errMsg(e)) } }));
    }
  }

  const head = <TabHeader icon="key" title="التكاملات" sub="ربط الخدمات الخارجية؛ تُخزَّن المفاتيح السرية مشفّرة على الخادم ولا تُعرض أبداً"/>;
  if (res.loading && !res.data) return <div className={styles.tabContent}>{head}<PageLoader/></div>;
  if (res.error && !res.data) return (
    <div className={styles.tabContent}>
      {head}
      <ErrorBox message={res.error} onRetry={() => res.reload()}/>
    </div>
  );

  return (
    <div className={styles.tabContent}>
      {head}
      <div className={styles.intList}>
        {INTEGRATION_GROUPS.map(g => {
          const st = state[g.id] || {};
          const dirty = Object.keys(changesFor(g)).length > 0;
          const test = tests[g.test];
          const keys = visibleKeys(g);
          const configured = g.keys.filter(k => byKey[k]?.set).length;
          return (
            <section key={g.id} className={`nq-card ${styles.card} ${styles.intCard}`} aria-labelledby={`int-${g.id}`}>
              <div className={styles.intHead}>
                <Badge8 icon={g.icon === 'mail' ? undefined : g.icon} size={52} className={styles.intBadge}>
                  {g.icon === 'mail' ? <Ico name="mail"/> : null}
                </Badge8>
                <div className={styles.intHeadText}>
                  <h2 id={`int-${g.id}`} className={styles.cardTitle}>{g.title}</h2>
                  <p className={styles.intHint}>{g.hint}</p>
                </div>
                <Pill tone={configured > 0 ? 'ok' : 'muted'} icon={configured > 0 ? 'check' : undefined}>
                  {configured > 0 ? 'مُعدّ' : 'غير مُعدّ'}
                </Pill>
              </div>

              {g.id === 'google' && (
                <div className={styles.copyGrid}>
                  <CopyLine label="رابط إعادة التوجيه (Authorized redirect URI)" value={GOOGLE_REDIRECT_URI}/>
                  <CopyLine label="أصل JavaScript المصرّح به (Authorized JavaScript origin)" value={GOOGLE_JS_ORIGIN}/>
                </div>
              )}

              <div className={styles.intFields}>
                {keys.map(k => (
                  <IntegrationField key={k} k={k} meta={FIELD_META[k]} item={byKey[k]}
                    value={draft[k] ?? ''} cleared={!!clear[k]} disabled={!!st.saving}
                    onChange={v => setDraft(d => ({ ...d, [k]: v }))}
                    onClear={on => { setClear(c => ({ ...c, [k]: on })); if (on) setDraft(d => ({ ...d, [k]: '' })); }}/>
                ))}
              </div>
              {g.smtpHint && transport === 'smtp' && <div className={styles.helper}><Ico name="info"/><p>{g.smtpHint}</p></div>}

              {st.error && <FormError text={st.error}/>}
              <div className={styles.intActions}>
                <button type="button" className="nq-btn gold sm" disabled={!dirty || st.saving} onClick={() => saveGroup(g)}>
                  <Icon name="check"/>{st.saving ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
                <button type="button" className="nq-btn ghost sm" disabled={!!test?.busy || st.saving}
                  aria-label={`اختبار ${g.title}`} onClick={() => runTest(g.test)}>
                  <Ico name="pulse"/>{test?.busy ? 'جارٍ الاختبار...' : 'اختبار'}
                </button>
                {st.saved && <span className={styles.savedTxt} role="status"><Icon name="check"/>تم الحفظ</span>}
                {dirty && !st.saving && <span className={styles.dirtyTxt}>تغييرات غير محفوظة، والاختبار يستخدم القيم المحفوظة</span>}
              </div>
              {test && !test.busy && (
                <div className={`${styles.testResult} ${test.ok ? styles.testOk : styles.testFail}`} role="status">
                  <Ico name={test.ok ? 'check' : 'alert'}/><span>{test.message}</span>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function IntegrationField({ k, meta, item, value, cleared, disabled, onChange, onClear }) {
  const id = useId();
  const isSecret = item ? !!item.secret : !!meta.secret;
  const isSet = !!item?.set;
  const label = meta.label || item?.label;
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
        <code className={styles.keyCode}>{k}</code>
        <span className={`${styles.setDot} ${isSet ? styles.setDotOn : ''}`}>{isSet ? 'مُعدّ' : 'غير مُعدّ'}</span>
      </div>
      {meta.select ? (
        <select id={id} className={`${styles.input} ${styles.select}`} value={value} disabled={disabled}
          onChange={e => onChange(e.target.value)}>
          {meta.select.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : isSecret ? (
        <>
          <div className={styles.inlineRow}>
            <input id={id} type="password" autoComplete="new-password" spellCheck={false}
              className={`${styles.input} ${styles.ltr}`}
              value={value} disabled={disabled || cleared}
              placeholder={cleared ? 'سيُحذف عند الحفظ' : isSet ? 'اتركه فارغاً للإبقاء على القيمة الحالية' : 'الصق القيمة هنا'}
              onChange={e => onChange(e.target.value)}/>
            {isSet && (
              <button type="button" className={`nq-btn ghost sm ${cleared ? '' : styles.btnTextDanger}`} disabled={disabled}
                aria-label={cleared ? `تراجع عن حذف ${label}` : `حذف ${label}`}
                onClick={() => onClear(!cleared)}>{cleared ? 'تراجع' : 'مسح'}</button>
            )}
          </div>
          {isSet && item?.preview && !cleared && <span className={styles.fieldHint}><Icon name="lock"/>المحفوظ: <bdi className={styles.ltrInline}>{item.preview}</bdi></span>}
        </>
      ) : (
        <input id={id} type={meta.type || 'text'} spellCheck={false}
          className={`${styles.input} ${meta.ltr ? styles.ltr : ''}`}
          value={value} disabled={disabled} placeholder={meta.placeholder}
          onChange={e => onChange(e.target.value)}/>
      )}
    </div>
  );
}

function CopyLine({ label, value }) {
  const id = useId();
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const later = useTimers();
  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch {
      try { inputRef.current?.select(); ok = document.execCommand('copy'); } catch { ok = false; }
    }
    setCopied(ok ? 'ok' : 'fail');
    later(() => setCopied(false), 2000);
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldHint}>{label}</label>
      <div className={styles.inlineRow}>
        <input id={id} ref={inputRef} readOnly value={value}
          className={`${styles.input} ${styles.ltr} ${styles.readonly}`}
          onFocus={e => e.target.select()}/>
        <button type="button" className="nq-btn ghost sm" onClick={copy} aria-label={`نسخ ${label}`}>
          <Icon name={copied === 'ok' ? 'check' : 'copy'}/>
          {copied === 'ok' ? 'نُسخ' : copied === 'fail' ? 'انسخ يدوياً' : 'نسخ'}
        </button>
      </div>
    </div>
  );
}

// First entry: gender + birthdate (PATCH /me/community-profile). Both are locked once
// saved (docs/ROOMS-DECISIONS.md, docs/API.md «Entry»), so the screen says so plainly
// and asks once more before saving.
import { useMemo, useState } from 'react';
import { capi } from './api';
import { setMe } from './store';
import { useT, n } from './format';
import { errText } from './errors';
import { RIcon, Sheet, Confirm, ErrorBox, BackButton, css as s } from './ui';
import { intlLocale } from '../l10n';

export function EtiquetteList() {
  const t = useT();
  const rules = [
    ['shieldCheck', t('الاحترام أولاً: لا سبّ ولا سخرية ولا جدال يؤذي أحداً.')],
    ['micOff', t('لا تسجيل: الغرف مباشرة فقط، ولا يجوز تسجيلها أو نشر ما يقال فيها.')],
    ['users', t('غرف الرجال للرجال وغرف النساء للنساء، والغرف المختلطة بأدب واحتشام.')],
    ['chat', t('الشات نصي فقط، بلا روابط أو أرقام أو حسابات تواصل.')],
    ['flag', t('إن رأيت إساءة فأبلغ عنها، وسيراجعها فريق الإشراف.')],
    ['book', t('عند تلاوة القرآن: الإنصات والسكينة.')],
  ];
  return (
    <ul className={s.list}>
      {rules.map(([ic, tx]) => <li key={tx} className={s.note}><RIcon name={ic} />{tx}</li>)}
    </ul>
  );
}

function Arch() {
  return (
    <svg className={s.arch} viewBox="0 0 96 128" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 128V58C6 32 26 14 48 4c22 10 42 28 42 54v70" />
      <path d="M16 128V62c0-20 15-34 32-43 17 9 32 23 32 43v66" strokeOpacity=".55" />
      <circle cx="48" cy="72" r="4" fill="currentColor" stroke="none" />
      <path d="M41 65a10 10 0 0 0 0 14M55 65a10 10 0 0 1 0 14M36 60a17 17 0 0 0 0 24M60 60a17 17 0 0 1 0 24" />
    </svg>
  );
}

export default function Gate({ profile }) {
  const t = useT();
  const pre = (profile && profile.birthdate) ? String(profile.birthdate).slice(0, 10).split('-') : null;
  const [gender, setGender] = useState(profile && profile.gender ? profile.gender : null);
  const [day, setDay] = useState(pre ? String(+pre[2]) : '');
  const [month, setMonth] = useState(pre ? String(+pre[1]) : '');
  const [year, setYear] = useState(pre ? pre[0] : '');
  const [agree, setAgree] = useState(false);
  const [rules, setRules] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const months = useMemo(() => {
    const f = new Intl.DateTimeFormat(intlLocale(t.lang), { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(2000, i, 15)));
  }, [t.lang]);
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 100 }, (_, i) => thisYear - 4 - i), [thisYear]);
  const daysIn = year && month ? new Date(+year, +month, 0).getDate() : 31;
  const valid = gender && day && month && year && +day <= daysIn && agree;

  async function save() {
    setBusy(true); setErr(null);
    try {
      const birthdate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const data = await capi.patch('/me/community-profile', { gender, birthdate });
      setMe(data);
      if (data && data.joined && !data.underage) {
        import('../native/push').then(m => m.askForPush()).catch(() => {});
      }
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.topbar}>
        <span className={`${s.grow} ${s.gateStep}`}>{t('خطوة واحدة · مرة واحدة فقط')}</span>
        <BackButton to="/" />
      </div>
      <div className={s.gateHero}>
        <div>
          <h1 className={s.h1}>{t('قبل أن تدخل الغرف')}</h1>
          <p className={s.muted}>{t('معلومتان نحتاجهما مرة واحدة، لنعرض لك الغرف المناسبة ونحمي الصغار.')}</p>
        </div>
        <Arch />
      </div>

      <fieldset className={s.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={s.label} style={{ marginBottom: 8 }}>{t('أنا')}</legend>
        <div className={s.seg} role="radiogroup" aria-label={t('أنا')}>
          {[['male', t('رجل')], ['female', t('امرأة')]].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={gender === v} className={gender === v ? s.segOn : ''} onClick={() => setGender(v)}>
              {gender === v && <RIcon name="check" size={16} />}{l}
            </button>
          ))}
        </div>
        <p className={s.note} style={{ marginTop: 8 }}><RIcon name="lock" size={16} />{t('يُحدَّد مرة واحدة، ولا يمكن تغييره بعد ذلك إلا عن طريق الدعم الفني.')}</p>
      </fieldset>

      <fieldset className={s.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={s.label} style={{ marginBottom: 8 }}>{t('تاريخ الميلاد')}</legend>
        <div className={s.grid3}>
          <label className={s.field}><span className={s.faint}>{t('اليوم|day')}</span>
            <span className={s.selectWrap}>
              <select className={s.select} value={day} onChange={e => setDay(e.target.value)}>
                <option value="">—</option>
                {Array.from({ length: daysIn }, (_, i) => i + 1).map(d => <option key={d} value={d}>{n(d, t.lang)}</option>)}
              </select><RIcon name="chevD" size={16} />
            </span>
          </label>
          <label className={s.field}><span className={s.faint}>{t('الشهر')}</span>
            <span className={s.selectWrap}>
              <select className={s.select} value={month} onChange={e => setMonth(e.target.value)}>
                <option value="">—</option>
                {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select><RIcon name="chevD" size={16} />
            </span>
          </label>
          <label className={s.field}><span className={s.faint}>{t('السنة')}</span>
            <span className={s.selectWrap}>
              <select className={s.select} value={year} onChange={e => setYear(e.target.value)}>
                <option value="">—</option>
                {years.map(y => <option key={y} value={y}>{n(y, t.lang)}</option>)}
              </select><RIcon name="chevD" size={16} />
            </span>
          </label>
        </div>
        <p className={s.faint} style={{ marginTop: 6 }}>{t('الغرف لمن أتمّ ١٣ سنة. تاريخ ميلادك لا يظهر لأحد.')}</p>
      </fieldset>

      <section className={s.why} aria-labelledby="whyH">
        <h2 id="whyH">{t('لماذا نسأل؟')}</h2>
        <p><RIcon name="users" />{t('غرف الرجال للرجال، وغرف النساء للنساء، والغرف المختلطة للجميع. ترى فقط ما يناسبك.')}</p>
        <p><RIcon name="shieldCheck" />{t('من هم دون ١٨ سنة لا تصلهم رسائل خاصة ولا طلبات صداقة، وبروفايلهم خاص دائماً، حمايةً لهم.')}</p>
      </section>

      <div className={s.check} role="checkbox" aria-checked={agree} tabIndex={0}
        onClick={(e) => { if (e.target.closest('button')) return; setAgree(v => !v); }}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAgree(v => !v); } }}>
        <span className={`${s.checkBox}${agree ? ' ' + s.on : ''}`} aria-hidden="true">{agree && <RIcon name="check" size={18} />}</span>
        <span className={s.muted} style={{ color: 'var(--text)' }}>
          {t('ألتزم بآداب المجالس: الاحترام، وعدم التسجيل، والإبلاغ عن أي إساءة.')}{' '}
          <button type="button" className={s.link} onClick={() => setRules(true)}>{t('آداب الغرف')}</button>
        </span>
      </div>

      {err && <ErrorBox text={errText(t, err)} />}

      <div className={s.stickyCta}>
        <button type="button" className={`${s.btn} ${s.btnGold} ${s.btnBlock}`} disabled={!valid || busy} onClick={() => setAsk(true)}>
          {busy ? t('جارٍ الحفظ…') : t('ادخل الغرف')}
        </button>
      </div>

      <Sheet open={rules} onClose={() => setRules(false)} title={t('آداب الغرف')}>
        <EtiquetteList />
      </Sheet>
      <Confirm open={ask} title={t('تأكيد البيانات')}
        body={t('سيُحفظ الجنس وتاريخ الميلاد ولا يمكن تغييرهما بعد ذلك إلا عن طريق الدعم الفني. هل البيانات صحيحة؟')}
        confirm={t('نعم، صحيحة')} cancel={t('مراجعة')}
        onAnswer={(ok) => { setAsk(false); if (ok) save(); }} />
    </div>
  );
}

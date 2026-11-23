// ─── Delete account & data (and download a copy first) ──────────────────────
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, signOutAuth } from '../hooks/useAuth';
import { deleteAccount, exportMyData, errorMessage } from '../backend';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';
import styles from './LegalPage.module.css';
import { useT } from '../i18n';

const WILL_DELETE = [
  'حسابك نفسه: البريد الإلكتروني والاسم',
  'سجل قراءتك وإحصائياتك',
  'تقدّمك في الحفظ والوِرد اليومي',
  'المفضلة وملاحظاتك على الآيات',
  'ختماتك الشخصية، والختمات الجماعية التي أنشأتها',
  'ظهورك في لوحة المتصدرين',
  'بيانات الموقع المحفوظة على هذا الجهاز (الحفظ، الختمات، الإحصائيات)',
];
const WILL_KEEP = [
  'القرآن الكريم والتفسير والتلاوات، فهي لا تحتاج إلى حساب',
  'إعدادات العرض على هذا الجهاز: المظهر، والخط، والقارئ، والترجمة، واللغة',
];

export default function DeleteDataPage() {
  const t = useT();
  const { user } = useAuth();
  const [step,    setStep]    = useState(1); // 1=info, 2=confirm, 3=done
  const [loading, setLoading] = useState(false);
  const [reason,  setReason]  = useState('');
  const [error,   setError]   = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  // Google-only accounts (has_password === false) confirm by typing DELETE.
  // If the API doesn't say, ask for the password and offer DELETE as fallback.
  const [useConfirm, setUseConfirm] = useState(false);
  const googleOnly = user?.has_password === false || useConfirm;
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null); // { text, ok }

  async function handleExport() {
    setExporting(true); setExportMsg(null);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nur-alquran-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMsg({ text: 'تم تنزيل نسخة من بياناتك', ok: true });
    } catch (e) {
      setExportMsg({ text: errorMessage(e, 'تعذّر تنزيل البيانات، حاول مجدداً'), ok: false });
    }
    setExporting(false);
  }

  function clearLocalData() {
    // مسح بيانات الموقع من هذا الجهاز (مع إبقاء إعدادات العرض فقط)
    const keysToKeep = ['nq_theme', 'nq_appearance', 'nq_ui_lang', 'nq_fontSize', 'nq_fontStyle', 'nq_reader', 'nq_translation', 'nq_highlight', 'nq_visitor_id'];
    try {
      Object.keys(localStorage).forEach(k => {
        if (!keysToKeep.includes(k)) localStorage.removeItem(k);
      });
      sessionStorage.removeItem('nq_pending_join');
    } catch {}
  }

  async function handleDelete(e) {
    e?.preventDefault();
    if (!user) return;
    if (googleOnly ? confirmText.trim() !== 'DELETE' : !password) {
      setError(googleOnly ? 'اكتب DELETE بالأحرف الإنجليزية الكبيرة للتأكيد' : 'اكتب كلمة المرور للتأكيد');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await deleteAccount(googleOnly ? { confirm: 'DELETE' } : { password });
      clearLocalData();
      await signOutAuth();
      setStep(3);
    } catch (err) {
      const f = err?.fields || {};
      if (!googleOnly && err?.code === 'validation' && (f.confirm || (!f.password && user?.has_password === undefined))) {
        // Probably a Google-only account: switch to the DELETE confirmation
        setUseConfirm(true);
        setError('هذا الحساب مرتبط بحساب Google بدون كلمة مرور، اكتب DELETE للتأكيد');
      } else if (!googleOnly && (err?.code === 'invalid_credentials' || f.password)) {
        setError('كلمة المرور غير صحيحة');
      } else {
        setError('تعذّر حذف الحساب: ' + errorMessage(err) + '. لم يُحذف شيء، حاول مجدداً.');
      }
    }
    setLoading(false);
  }

  const STEPS = ['ما سيُحذف', 'التأكيد', 'تم'];
  const stepsRef = useRef(null);
  const firstRender = useRef(true);
  // bring the step indicator back into view when the step changes
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    stepsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  return (
    <div className={styles.page}>
      <PageHero eyebrow="حسابك ملكك" title="حذف الحساب والبيانات"
        sub="احذف حسابك وكل بياناتك نهائياً، وننصحك بتنزيل نسخة منها أولاً." />

      <div className={`nq-wrap ${styles.narrow}`}>
        <ol ref={stepsRef} className={styles.steps} aria-label="خطوات الحذف">
          {STEPS.map((s, i) => (
            <li key={s} data-state={step > i + 1 ? 'done' : step === i + 1 ? 'now' : 'next'} aria-current={step === i + 1 ? 'step' : undefined}>
              <span className={`nq-num ${styles.stepN}`}>{step > i + 1 ? <Icon name="check" /> : toAr(i + 1)}</span>{s}
            </li>
          ))}
        </ol>

        {step === 1 && (<>
          <p className={styles.lead}>نأسف لمغادرتك. حذف الحساب يزيل كل ما يرتبط به من خادم الموقع نهائياً، ولا يمكن استرجاعه بعد ذلك.</p>

          <div className={styles.twoCols}>
            <section className={`nq-card ${styles.listCard}`} data-tone="danger" aria-labelledby="dd-del">
              <h2 id="dd-del" className={styles.cardTitle}><Icon name="x" />سيُحذف</h2>
              <ul className={styles.marks}>
                {WILL_DELETE.map(x => <li key={x}><Icon name="x" /><span>{x}</span></li>)}
              </ul>
            </section>
            <section className={`nq-card ${styles.listCard}`} data-tone="ok" aria-labelledby="dd-keep">
              <h2 id="dd-keep" className={styles.cardTitle}><Icon name="check" />سيبقى متاحاً</h2>
              <ul className={styles.marks}>
                {WILL_KEEP.map(x => <li key={x}><Icon name="check" /><span>{x}</span></li>)}
              </ul>
              <p className={styles.small}>تُحذف أيضاً الختمات الجماعية التي أنشأتها، فيفقد المشاركون فيها الوصول إليها.</p>
            </section>
          </div>

          {user && (
            <section className={`nq-card ${styles.export}`} aria-labelledby="dd-exp">
              <Badge8 icon="download" size={56} />
              <div className={styles.exportText}>
                <h2 id="dd-exp" className={styles.cardTitle}>قبل أن تحذف: نزّل نسخة من بياناتك</h2>
                <p>ملف واحد فيه قراءتك وحفظك وختماتك وملاحظاتك.</p>
                {exportMsg && (
                  <p className={styles.msg} data-ok={exportMsg.ok ? '1' : '0'} role={exportMsg.ok ? 'status' : 'alert'}>
                    <Icon name={exportMsg.ok ? 'check' : 'x'} />{exportMsg.text}
                  </p>
                )}
              </div>
              <button type="button" className="nq-btn ghost" onClick={handleExport} disabled={exporting}>
                <Icon name="download" />{exporting ? 'جارٍ التحضير…' : 'تنزيل نسخة من بياناتي'}
              </button>
            </section>
          )}

          {!user ? (
            <section className={`nq-card ${styles.guest}`}>
              <Badge8 icon="lock" size={56} />
              <h2 className={styles.cardTitle}>أنت غير مسجّل الدخول</h2>
              <p>إن كان لديك حساب وتريد حذف بياناته، سجّل الدخول أولاً، أو راسلنا مباشرة وسنتولّى ذلك.</p>
              <div className={styles.btnRow}>
                <Link to="/login" className="nq-btn gold"><Icon name="user" />تسجيل الدخول</Link>
                <a href="mailto:support@webek.org?subject=طلب حذف بيانات" className="nq-btn ghost" dir="ltr">support@webek.org</a>
              </div>
            </section>
          ) : (
            <div className={styles.btnRow} style={{ justifyContent: 'center' }}>
              <Link to="/settings" className="nq-btn ghost">العودة إلى الإعدادات</Link>
              <button type="button" className={`nq-btn ${styles.dangerBtn}`} onClick={() => setStep(2)}>
                متابعة لحذف الحساب<Icon name="back" style={{ transform: 'scaleX(-1)' }} />
              </button>
            </div>
          )}
        </>)}

        {step === 2 && (
          <form className={`nq-card ${styles.confirm}`} onSubmit={handleDelete}>
            <div className={styles.warnIcon} aria-hidden="true"><Icon name="shield" /></div>
            <h2 className={styles.confirmTitle}>تأكيد الحذف النهائي</h2>
            <p>هذا الإجراء <strong>لا يمكن التراجع عنه</strong>. ستُحذف كل البيانات المرتبطة بالحساب:</p>
            <div className={styles.emailBadge} dir="ltr">{user?.email}</div>

            <div className={styles.fields}>
              {googleOnly ? (
                <label className={styles.field}>
                  <span>للتأكيد اكتب <strong dir="ltr">DELETE</strong> بالأحرف الإنجليزية الكبيرة</span>
                  <span className="nq-input"><input value={confirmText} dir="ltr" autoComplete="off" autoCapitalize="characters"
                    onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" /></span>
                </label>
              ) : (
                <div className={styles.field}>
                  <label htmlFor="dd-pw">اكتب كلمة المرور للتأكيد</label>
                  <span className="nq-input"><Icon name="lock" /><input id="dd-pw" type="password" value={password} dir="ltr"
                    autoComplete="current-password" onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></span>
                  <button type="button" className={styles.textBtn} onClick={() => { setUseConfirm(true); setError(''); }}>
                    دخلت بحساب Google وليس لدي كلمة مرور
                  </button>
                </div>
              )}

              <label className={styles.field}>
                <span>سبب المغادرة <small>(اختياري، يساعدنا على التحسين)</small></span>
                <span className={styles.selectWrap}>
                  <select value={reason} onChange={e => setReason(e.target.value)}>
                    <option value="">اختر سبباً…</option>
                    <option value="privacy">قلق بشأن الخصوصية</option>
                    <option value="not_using">لا أستخدمه بعد الآن</option>
                    <option value="issues">مشكلات تقنية</option>
                    <option value="alternative">وجدت بديلاً أفضل</option>
                    <option value="other">سبب آخر</option>
                  </select>
                  <Icon name="chev" />
                </span>
              </label>
            </div>

            {error && <p role="alert" className={styles.msg} data-ok="0"><Icon name="x" />{error}</p>}

            <div className={styles.btnRow}>
              <button type="button" className="nq-btn ghost" onClick={() => { setStep(1); setError(''); }}>{t('cancel') || 'إلغاء'}</button>
              <button type="submit" className={`nq-btn ${styles.dangerSolid}`} disabled={loading}>
                <Icon name="x" />{loading ? 'جارٍ الحذف…' : 'حذف نهائياً'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <section className={`nq-card ${styles.done}`} aria-live="polite">
            <Badge8 icon="check" size={72} />
            <h2 className={styles.confirmTitle}>تم حذف حسابك</h2>
            <p>حُذف حسابك وكل البيانات المرتبطة به من خادم الموقع، ومُسحت بيانات الموقع من هذا الجهاز، وسُجّل خروجك.</p>
            <p className={styles.small}>لأي استفسار: <a href="mailto:support@webek.org" className={styles.inlineLink} dir="ltr">support@webek.org</a></p>
            <Link to="/" className="nq-btn gold"><Icon name="home" />العودة إلى الرئيسية</Link>
          </section>
        )}

        <nav className={styles.footLinks} aria-label="صفحات ذات صلة">
          <Link to="/privacy">سياسة الخصوصية</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">شروط الاستخدام</Link>
        </nav>
      </div>
    </div>
  );
}

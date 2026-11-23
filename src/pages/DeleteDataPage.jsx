import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { deleteAccount, exportMyData, errorMessage } from '../backend';
import { signOutAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import styles from './LegalPage.module.css';

import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
export default function DeleteDataPage() {
  const t = useT();
  const dir = useDir();
  const { user } = useAuth();
  const navigate  = useNavigate();
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
  const [exportMsg, setExportMsg] = useState('');

  async function handleExport() {
    setExporting(true); setExportMsg('');
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
      setExportMsg('✅ تم تنزيل نسخة من بياناتك');
    } catch (e) {
      setExportMsg('⚠️ ' + errorMessage(e, 'تعذّر تنزيل البيانات، حاول مجدداً'));
    }
    setExporting(false);
  }

  function clearLocalData() {
    // مسح بيانات التطبيق من هذا الجهاز (مع إبقاء إعدادات العرض فقط)
    const keysToKeep = ['nq_theme', 'nq_fontSize', 'nq_fontStyle', 'nq_reader', 'nq_translation', 'nq_visitor_id'];
    try {
      Object.keys(localStorage).forEach(k => {
        if (!keysToKeep.includes(k)) localStorage.removeItem(k);
      });
      sessionStorage.removeItem('nq_pending_join');
    } catch {}
  }

  async function handleDelete() {
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
    } catch (e) {
      const f = e?.fields || {};
      if (!googleOnly && e?.code === 'validation' && (f.confirm || (!f.password && user?.has_password === undefined))) {
        // Probably a Google-only account: switch to the DELETE confirmation
        setUseConfirm(true);
        setError('هذا الحساب مرتبط بحساب Google بدون كلمة مرور — اكتب DELETE للتأكيد');
      } else if (!googleOnly && (e?.code === 'invalid_credentials' || f.password)) {
        setError('كلمة المرور غير صحيحة');
      } else {
        setError('تعذّر حذف الحساب: ' + errorMessage(e) + ' — لم يُحذف شيء، حاول مجدداً.');
      }
    }
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('deleteAccount')}</h1>
        <div style={{ width: 60 }} />
      </div>

      {step === 1 && (
        <>
          <div className={styles.deleteHero}>
            <div className={styles.deleteIcon}>🗑️</div>
            <h2>{t('delete_data_desc')}</h2>
            <p>{t('delete_warning')}</p>
          </div>

          <div className={styles.deleteList}>
            <h3 className={styles.deleteListTitle}>{t('will_delete')}</h3>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> بياناتك المحفوظة في حسابك</div>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> سجل قراءتك وإحصائياتك</div>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> تقدمك في الحفظ والورد اليومي</div>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> ملاحظاتك على الآيات</div>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> ختماتك الشخصية والجماعية</div>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> مشاركتك في لوحة المتصدرين</div>
            <div className={styles.deleteItem}><span className={styles.deleteX}>✗</span> بيانات التطبيق المحفوظة على هذا الجهاز (الحفظ، الختمات، الإحصائيات)</div>
          </div>

          <div className={styles.deleteKeep}>
            <h3 className={styles.deleteListTitle}>سيبقى متاحاً:</h3>
            <div className={styles.keepItem}><span className={styles.keepCheck}>✓</span> القرآن الكريم والتفسير (لا يحتاج حساباً)</div>
            <div className={styles.keepItem}><span className={styles.keepCheck}>✓</span> إعدادات العرض على هذا الجهاز (الخط، المظهر، القارئ، الترجمة)</div>
          </div>
          <div className={styles.notLoggedIn}>
            <p style={{ fontSize: 13 }}>
              ملاحظة: يحذف هذا الإجراء حسابك نفسه (البريد الإلكتروني والاسم) وكل البيانات المرتبطة به من خوادمنا،
              وتُحذف الختمات الجماعية التي أنشأتها. لا يمكن استرجاع الحساب بعد الحذف.
              ننصحك بتنزيل نسخة من بياناتك أولاً.
            </p>
          </div>

          {user && (
            <div className={styles.notLoggedIn}>
              <button className={styles.cancelBtn} onClick={handleExport} disabled={exporting} style={{ width: '100%' }}>
                {exporting ? 'جارٍ التحضير...' : '⬇️ تنزيل نسخة من بياناتي'}
              </button>
              {exportMsg && <p style={{ fontSize: 13, marginTop: 8 }}>{exportMsg}</p>}
            </div>
          )}

          {!user ? (
            <div className={styles.notLoggedIn}>
              <p>أنت غير مسجّل الدخول حالياً.</p>
              <p>إذا كان لديك حساب وتريد حذف بياناته، سجّل الدخول أولاً أو تواصل معنا مباشرة:</p>
              <a href="mailto:support@webek.org?subject=طلب حذف بيانات" className={styles.emailLink}>
                support@webek.org
              </a>
            </div>
          ) : (
            <button className={styles.deleteBtn} onClick={() => setStep(2)}>
              متابعة لحذف الحساب ←
            </button>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className={styles.confirmBox}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2>{t('confirm_delete')}</h2>
            <p>هذا الإجراء <strong>لا يمكن التراجع عنه</strong>. ستُحذف كل بياناتك المرتبطة بـ:</p>
            <div className={styles.emailBadge}>{user?.email}</div>
          </div>

          <div className={styles.reasonBox}>
            {googleOnly ? (
              <>
                <label className={styles.reasonLabel}>للتأكيد اكتب <strong dir="ltr">DELETE</strong></label>
                <input className={styles.reasonSelect} value={confirmText} dir="ltr" autoComplete="off"
                  onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" />
              </>
            ) : (
              <>
                <label className={styles.reasonLabel}>اكتب كلمة المرور للتأكيد</label>
                <input className={styles.reasonSelect} type="password" value={password} dir="ltr"
                  autoComplete="current-password"
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                <button type="button" onClick={() => { setUseConfirm(true); setError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', marginTop: 6, padding: 0 }}>
                  دخلت بحساب Google وليس لدي كلمة مرور
                </button>
              </>
            )}
          </div>

          <div className={styles.reasonBox}>
            <label className={styles.reasonLabel}>سبب المغادرة (اختياري — يساعدنا في التحسين)</label>
            <select className={styles.reasonSelect} value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">اختر سبباً...</option>
              <option value="privacy">قلق بشأن الخصوصية</option>
              <option value="not_using">لا أستخدمه بعد الآن</option>
              <option value="issues">مشاكل تقنية</option>
              <option value="alternative">وجدت بديلاً أفضل</option>
              <option value="other">سبب آخر</option>
            </select>
          </div>

          {error && (
            <div role="alert" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', margin: '0 0 14px', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={() => { setStep(1); setError(''); }}>{t('cancel')}</button>
            <button className={styles.confirmDeleteBtn} onClick={handleDelete} disabled={loading}>
              {loading ? 'جارٍ الحذف...' : '🗑️ حذف نهائياً'}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <div className={styles.doneBox}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2>تم حذف حسابك</h2>
          <p>حُذف حسابك وكل البيانات المرتبطة به من خوادمنا، ومُسحت بيانات التطبيق من هذا الجهاز، وتم تسجيل خروجك.</p>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            لأي استفسار: <a href="mailto:support@webek.org" className={styles.inlineLink}>support@webek.org</a>
          </p>
          <Link to="/" className={styles.homeBtn}>العودة للرئيسية</Link>
        </div>
      )}

      <div className={styles.legalFooter}>
        <Link to="/privacy" className={styles.legalLink}>سياسة الخصوصية</Link>
        <span>·</span>
        <Link to="/terms" className={styles.legalLink}>شروط الاستخدام</Link>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { signOut, deleteAllUserData } from '../supabase';
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

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      // 1. حذف كل البيانات من Supabase — نتوقف إن فشل أي جدول
      if (user) {
        const res = await deleteAllUserData(user.id);
        if (res?.error) {
          setError(typeof res.error === 'string' ? res.error : (res.error.message || 'تعذّر حذف البيانات'));
          setLoading(false);
          return;
        }
      }
      // 2. تسجيل خروج
      try { await signOut(); } catch {}
      // 3. مسح بيانات التطبيق من هذا الجهاز (مع إبقاء إعدادات العرض فقط)
      const keysToKeep = ['nq_theme', 'nq_fontSize', 'nq_fontStyle', 'nq_reader', 'nq_translation'];
      try {
        Object.keys(localStorage).forEach(k => {
          if (!keysToKeep.includes(k)) localStorage.removeItem(k);
        });
        sessionStorage.removeItem('nq_pending_join');
      } catch {}
      setStep(3);
    } catch (e) {
      setError('تعذّر إكمال الحذف: ' + (e?.message || 'خطأ غير معروف') + ' — حاول مجدداً.');
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
              ملاحظة: يحذف هذا الإجراء بياناتك المحفوظة. أما سجل تسجيل الدخول نفسه (البريد الإلكتروني)
              فيمكن طلب إزالته نهائياً عبر <a href="mailto:support@webek.org?subject=طلب حذف حساب" className={styles.inlineLink}>support@webek.org</a>.
            </p>
          </div>

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
            <button className={styles.cancelBtn} onClick={() => setStep(1)}>{t('cancel')}</button>
            <button className={styles.confirmDeleteBtn} onClick={handleDelete} disabled={loading}>
              {loading ? 'جارٍ الحذف...' : '🗑️ حذف نهائياً'}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <div className={styles.doneBox}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2>تم حذف بياناتك</h2>
          <p>حُذفت بياناتك المحفوظة في حسابك وعلى هذا الجهاز، وتم تسجيل خروجك.</p>
          <p style={{ marginTop: 8, fontSize: 13 }}>لإزالة سجل تسجيل الدخول (البريد الإلكتروني) نهائياً، راسلنا على العنوان أدناه.</p>
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

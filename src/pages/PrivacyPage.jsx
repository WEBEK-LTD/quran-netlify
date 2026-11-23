import { Link } from 'react-router-dom';
import styles from './LegalPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function PrivacyPage() {
  const t = useT();
  const dir = useDir();
  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('privacyTitle')}</h1>
        <LangSwitcher compact={true} />
        <div style={{ width: 60 }} />
      </div>

      <div className={styles.freeNote}>
        <span className={styles.freeIcon}>🌙</span>
        <p>نور القرآن تطبيق مجاني بالكامل، لوجه الله تعالى، بلا إعلانات ولا رسوم ولا مدفوعات من أي نوع.</p>
      </div>

      <div className={styles.lastUpdate}>آخر تحديث: فبراير 2025</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>١. مقدمة</h2>
        <p>نور القرآن ("التطبيق") خدمة مجانية تماماً تُقدَّم لوجه الله تعالى، لا نسعى من خلالها لأي ربح مادي. نلتزم بحماية خصوصيتك وبيانات المستخدمين الكرام.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٢. البيانات التي نجمعها</h2>
        <p>عند التسجيل نجمع:</p>
        <ul className={styles.list}>
          <li>البريد الإلكتروني واسم المستخدم — لحفظ تقدمك عبر أجهزتك</li>
          <li>بيانات القراءة (الآيات المقروءة، الختمات) — لعرض إحصائياتك الشخصية</li>
          <li>بيانات الحفظ (حالة السور) — لتتبع تقدمك في الحفظ</li>
          <li>الملاحظات التي تكتبها على الآيات — تبقى خاصة بك</li>
        </ul>
        <p>يمكنك استخدام التطبيق بالكامل <strong>بدون تسجيل</strong>، وتُحفَظ بياناتك محلياً فقط على جهازك.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٣. ما لا نجمعه أبداً</h2>
        <ul className={styles.list}>
          <li>❌ لا نجمع بيانات الدفع — التطبيق مجاني ولا يوجد أي نظام دفع</li>
          <li>❌ لا نبيع بياناتك لأي طرف ثالث</li>
          <li>❌ لا نعرض إعلانات ولا نشارك بياناتك مع شركات الإعلانات</li>
          <li>❌ لا نتتبع موقعك الجغرافي</li>
          <li>❌ لا نصل إلى جهات اتصالك أو كاميراك أو ميكروفونك</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٤. كيف نستخدم البيانات</h2>
        <ul className={styles.list}>
          <li>مزامنة تقدمك في القراءة والحفظ بين أجهزتك</li>
          <li>عرض إحصائياتك الشخصية في لوحة التحكم</li>
          <li>لوحة المتصدرين (فقط إن فعّلت «إظهار اسمي في لوحة المتصدرين» من الإعدادات — مُعطّل افتراضياً)</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٥. تخزين البيانات وأمانها</h2>
        <p>بياناتك مخزّنة على خادمنا الخاص (api.nuralquran.net) في قاعدة بيانات MySQL. كلمات المرور تُحفظ مُجزّأة (hash) ولا يمكن لأحد قراءتها، وجلسات الدخول تُحفظ مُجزّأة أيضاً، ومفاتيح الخدمات الخارجية مشفّرة. يصل إلى البيانات مشرفو التطبيق فقط لأغراض الدعم والإدارة. نستخدم HTTPS لتشفير كل الاتصالات.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٦. حقوقك</h2>
        <ul className={styles.list}>
          <li>حق الوصول لبياناتك في أي وقت</li>
          <li>حق تصحيح بياناتك</li>
          <li>حق حذف حسابك وكل بياناتك نهائياً — <Link to="/delete-data" className={styles.inlineLink}>طلب حذف البيانات</Link></li>
          <li>حق تصدير بياناتك — زر «تنزيل نسخة من بياناتي» في <Link to="/delete-data" className={styles.inlineLink}>صفحة حذف البيانات</Link></li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٧. التواصل</h2>
        <p>لأي استفسار حول خصوصيتك:</p>
        <a href="mailto:support@webek.org" className={styles.emailLink}>support@webek.org</a>
      </section>

      <div className={styles.legalFooter}>
        <Link to="/terms" className={styles.legalLink}>شروط الاستخدام</Link>
        <span>·</span>
        <Link to="/delete-data" className={styles.legalLink}>حذف البيانات</Link>
      </div>
    </div>
  );
}

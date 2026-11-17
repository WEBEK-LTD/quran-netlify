import { Link } from 'react-router-dom';
import styles from './LegalPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function TermsPage() {
  const t = useT();
  const dir = useDir();
  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('termsTitle')}</h1>
        <LangSwitcher compact={true} />
        <div style={{ width: 60 }} />
      </div>

      <div className={styles.freeNote}>
        <span className={styles.freeIcon}>🌙</span>
        <p>نور القرآن تطبيق مجاني بالكامل، لوجه الله تعالى، بلا إعلانات ولا رسوم ولا مدفوعات من أي نوع.</p>
      </div>

      <div className={styles.lastUpdate}>آخر تحديث: فبراير 2025</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>١. قبول الشروط</h2>
        <p>باستخدام تطبيق نور القرآن توافق على هذه الشروط. إذا كنت لا توافق، يرجى عدم استخدام التطبيق.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٢. طبيعة الخدمة</h2>
        <ul className={styles.list}>
          <li>✅ التطبيق <strong>مجاني بالكامل</strong> ولوجه الله تعالى — لا توجد ميزات مدفوعة أو اشتراكات</li>
          <li>✅ لا إعلانات من أي نوع</li>
          <li>✅ لا مشتريات داخل التطبيق</li>
          <li>✅ القرآن الكريم والتفسير والترجمة كلها مجانية للجميع</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٣. الاستخدام المقبول</h2>
        <p>يمكنك استخدام التطبيق لـ:</p>
        <ul className={styles.list}>
          <li>قراءة القرآن الكريم والاستماع إليه</li>
          <li>حفظ القرآن وتتبع التقدم</li>
          <li>تدوين الملاحظات الشخصية على الآيات</li>
          <li>تنظيم ختمات جماعية لأرواح المتوفين</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٤. المحتوى والملكية الفكرية</h2>
        <ul className={styles.list}>
          <li>نص القرآن الكريم مصدره alquran.cloud وهو مفتوح المصدر</li>
          <li>التسجيلات الصوتية من everyayah.com بإذن أصحابها</li>
          <li>كود التطبيق مملوك لـ ABDELRAHMAN HAMDY</li>
          <li>ملاحظاتك الشخصية ملكك أنت وحدك</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٥. إخلاء المسؤولية</h2>
        <p>نبذل أقصى جهدنا لضمان دقة المحتوى، لكن التطبيق يُقدَّم "كما هو". نوصي دائماً بمراجعة المصادر الموثوقة للفتاوى والأحكام الشرعية.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٦. التوقف عن الاستخدام</h2>
        <p>يمكنك التوقف عن استخدام التطبيق في أي وقت. لحذف حسابك وبياناتك نهائياً: <Link to="/delete-data" className={styles.inlineLink}>اضغط هنا</Link>.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>٧. التواصل</h2>
        <a href="mailto:support@webek.org" className={styles.emailLink}>support@webek.org</a>
      </section>

      <div className={styles.legalFooter}>
        <Link to="/privacy" className={styles.legalLink}>سياسة الخصوصية</Link>
        <span>·</span>
        <Link to="/delete-data" className={styles.legalLink}>حذف البيانات</Link>
      </div>
    </div>
  );
}

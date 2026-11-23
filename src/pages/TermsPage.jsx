import { Link } from 'react-router-dom';
import { LegalDoc, Checks, rich } from './legal/LegalDoc';
import styles from './LegalPage.module.css';
import { useT } from '../i18n';
import { useTr, intlLocale } from '../l10n';

const L = s => <span dir="ltr">{s}</span>;

export default function TermsPage() {
  const t = useT();
  const tr = useTr();
  const updated = new Date(2026, 10, 1).toLocaleDateString(intlLocale(tr.lang), { month: 'long', year: 'numeric' });
  const settingsLink = <Link to="/settings#account" className={styles.inlineLink}>{tr('الإعدادات')}</Link>;
  const sections = [
    { id: 'accept', title: tr('قبول الشروط'), body: (
      <p>{tr('باستخدامك موقع نور القرآن فإنك توافق على هذه الشروط. وإن كنت لا توافق عليها فنرجو ألا تستخدم الموقع.')}</p>
    ) },
    { id: 'nature', title: tr('طبيعة الخدمة'), body: (
      <Checks items={[
        rich(tr('الموقع {free} ولوجه الله تعالى، ولا توجد فيه ميزات مدفوعة ولا اشتراكات.'), { free: <strong>{tr('مجاني بالكامل')}</strong> }),
        tr('لا إعلانات من أي نوع.'),
        tr('لا مشتريات داخل الموقع أو التطبيق.'),
        tr('القرآن الكريم والتفسير والترجمة والتلاوات متاحة مجاناً للجميع.'),
      ]} />
    ) },
    { id: 'use', title: tr('الاستخدام المقبول'), body: (<>
      <p>{tr('يمكنك استخدام الموقع في:')}</p>
      <ul className={styles.list}>
        <li>{tr('قراءة القرآن الكريم والاستماع إليه وتدبّره.')}</li>
        <li>{tr('حفظ القرآن ومتابعة تقدّمك ومراجعتك.')}</li>
        <li>{tr('تدوين ملاحظاتك الشخصية على الآيات.')}</li>
        <li>{tr('تنظيم ختمات جماعية مع أهلك وأحبابك، وإهدائها لأرواح من تحب.')}</li>
      </ul>
      <p>{tr('ونرجو ألا تستخدم الموقع فيما يسيء إلى القرآن الكريم أو إلى الآخرين، كوضع أسماء أو عبارات مسيئة في الختمات الجماعية العامة أو في لوحة المتصدرين، أو محاولة تعطيل الخدمة أو الوصول إلى بيانات غيرك. ويحق للإدارة إيقاف أي حساب يخالف ذلك.')}</p>
    </>) },
    { id: 'account', title: tr('حسابك'), body: (
      <ul className={styles.list}>
        <li>{tr('أنت مسؤول عن الحفاظ على سرية كلمة مرورك، وعمّا يجري في حسابك.')}</li>
        <li>{rich(tr('يمكنك تعديل اسمك أو كلمة مرورك في أي وقت من {settings}.'), { settings: settingsLink })}</li>
        <li>{rich(tr('بياناتك محفوظة على خادم الموقع ({server}) كما توضّح {privacy}.'), {
          server: L('api.nuralquran.net'),
          privacy: <Link to="/privacy" className={styles.inlineLink}>{tr('سياسة الخصوصية')}</Link>,
        })}</li>
      </ul>
    ) },
    { id: 'content', title: tr('المحتوى والملكية الفكرية'), body: (
      <ul className={styles.list}>
        <li>{rich(tr('نص القرآن الكريم والترجمات والتفاسير مصدرها {a} و{b}، وهي متاحة للاستخدام العام.'), { a: L('alquran.cloud'), b: L('quran.com') })}</li>
        <li>{rich(tr('التسجيلات الصوتية من {a}، وحقوقها لأصحابها.'), { a: L('everyayah.com') })}</li>
        <li>{rich(tr('تصميم الموقع وشيفرته البرمجية مملوكان لـ {owner}.'), { owner: L('ABDELRAHMAN HAMDY') })}</li>
        <li>{tr('ملاحظاتك الشخصية ملكك أنت وحدك.')}</li>
      </ul>
    ) },
    { id: 'disclaimer', title: tr('إخلاء المسؤولية'), body: (<>
      <p>{tr('نبذل جهدنا لضمان دقة المحتوى، لكن الموقع يُقدَّم «كما هو». مواقيت الصلاة واتجاه القبلة محسوبة رياضياً وقد تختلف قليلاً عن تقويم مسجدك، فاعتمد التقويم الرسمي في بلدك عند الاختلاف.')}</p>
      <p>{tr('وإجابات المساعد للتوضيح والتقريب فقط، ولا تُغني عن الرجوع إلى أهل العلم والمصادر الموثوقة في الفتاوى والأحكام الشرعية.')}</p>
    </>) },
    { id: 'stop', title: tr('التوقف عن الاستخدام'), body: (
      <p>{rich(tr('يمكنك التوقف عن استخدام الموقع في أي وقت. ولحذف حسابك وكل بياناتك نهائياً انتقل إلى {page}.'), {
        page: <Link to="/delete-data" className={styles.inlineLink}>{tr('صفحة حذف البيانات')}</Link>,
      })}</p>
    ) },
    { id: 'changes', title: tr('تعديل الشروط'), body: (
      <p>{tr('قد نعدّل هذه الشروط عند الحاجة، ونذكر تاريخ آخر تحديث في أعلى الصفحة. استمرارك في استخدام الموقع بعد التعديل يعني قبولك للشروط المعدّلة.')}</p>
    ) },
  ];

  return (
    <LegalDoc eyebrow={tr('بوضوح وإيجاز')} title={t('termsTitle') || tr('شروط الاستخدام')}
      sub={tr('ما يقدّمه لك نور القرآن، وما نرجوه منك عند استخدامه.')}
      updated={updated} sections={sections}
      related={[
        { to: '/privacy', icon: 'shield', label: tr('سياسة الخصوصية') },
        { to: '/delete-data', icon: 'x', label: tr('حذف الحساب والبيانات') },
      ]} />
  );
}

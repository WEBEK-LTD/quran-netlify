import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './HelpPage.module.css';

const SECTIONS = [
  {
    id: 'read', icon: '📖', title: 'قراءة القرآن الكريم', color: '#52b788',
    items: [
      { q: 'كيف أقرأ سورة معينة؟', a: 'افتح القائمة الجانبية بضغط ☰ واختر السورة، أو ابحث عنها في صفحة البحث.' },
      { q: 'كيف أغير حجم الخط؟', a: 'في شريط الأدوات اضغط أ− للتصغير أو أ+ للتكبير. يُحفظ تلقائياً.' },
      { q: 'كيف أفعّل الترجمة؟', a: 'في شريط الأدوات اختر اللغة. تدعم 16 لغة تظهر تحت كل آية.' },
      { q: 'كيف أستمع للتلاوة؟', a: 'اضغط أيقونة 🎧 لفتح مشغل الصوت واختر القارئ.' },
      { q: 'كيف أنتقل لجزء معين؟', a: 'افتح القائمة الجانبية وانتقل لتبويب "أجزاء".' },
    ],
  },
  {
    id: 'hifz', icon: '📚', title: 'نظام الحفظ', color: '#c9a84c',
    items: [
      { q: 'كيف أبدأ تسجيل حفظي؟', a: 'اذهب لصفحة /hifz واختر السورة وحدد حالتها.' },
      { q: 'ما هو الورد اليومي؟', a: 'مقطع تحدده يومياً للحفظ أو المراجعة مع تسجيل سلسلة أيام.' },
      { q: 'هل يتزامن الحفظ على أجهزة متعددة؟', a: 'نعم — عند تسجيل الدخول يتزامن حفظك تلقائياً.' },
      { q: 'ما هي الإنجازات؟', a: 'شارات تحفيزية عند حفظ عدد معين من السور أو الأجزاء.' },
    ],
  },
  {
    id: 'prayer', icon: '🕌', title: 'أوقات الصلاة والقبلة', color: '#10b981',
    items: [
      { q: 'كيف أعرف مواعيد الصلاة؟', a: 'اذهب لصفحة /prayer-times واكتب اسم مدينتك أو اضغط "تحديد موقعي".' },
      { q: 'لماذا أختار طريقة الحساب؟', a: 'كل بلد له هيئة رسمية — اختر الهيئة الصحيحة لبلدك.' },
      { q: 'كيف أعرف اتجاه القبلة؟', a: 'اذهب لـ /qibla واضغط "تحديد موقعي" ثم "تفعيل البوصلة".' },
      { q: 'كيف أفعّل منبّه الصلاة؟', a: 'في صفحة أوقات الصلاة اضغط 🔕 بجانب أي صلاة لتفعيل المنبّه.' },
    ],
  },
  {
    id: 'adhkar', icon: '📿', title: 'الأذكار والسبحة', color: '#f97316',
    items: [
      { q: 'كيف أستخدم العدّاد في الأذكار؟', a: 'في صفحة /adhkar اضغط على أي ذكر لتوسيعه ثم اضغط زر العداد.' },
      { q: 'كيف أستخدم السبحة الإلكترونية؟', a: 'اذهب لـ /tasbih، اختر الذكر المطلوب واضغط على الدائرة الكبيرة.' },
      { q: 'هل يعمل الاهتزاز في السبحة؟', a: 'نعم على الأجهزة الداعمة — يمكن تفعيله أو إيقافه من الزر العلوي.' },
    ],
  },
  {
    id: 'khatma', icon: '📿', title: 'الختمات', color: '#e879f9',
    items: [
      { q: 'ما الفرق بين الختمة الشخصية والجماعية؟', a: 'الشخصية لتتبع ختمتك الفردية. الجماعية للتعاون مع الأهل بتوزيع الأجزاء.' },
      { q: 'كيف أدعو شخصاً للختمة الجماعية؟', a: 'أنشئ ختمة في /khatma-group واحصل على الكود أو الرابط.' },
    ],
  },
  {
    id: 'radio', icon: '📻', title: 'الراديو الإسلامي', color: '#38bdf8',
    items: [
      { q: 'كيف أشغّل محطة راديو؟', a: 'اذهب لـ /radio واضغط على أي بطاقة محطة — تشغيل فوري.' },
      { q: 'لماذا بعض المحطات لا تشتغل؟', a: 'المحطات من Radio Browser وبعضها قد يتوقف — جرّب محطة أخرى في نفس الفئة.' },
      { q: 'كيف أتحكم في مستوى الصوت؟', a: 'استخدم شريط الصوت في أعلى الصفحة أو زر كتم الصوت 🔇.' },
    ],
  },
  {
    id: 'account', icon: '👤', title: 'الحساب والإعدادات', color: '#6366f1',
    items: [
      { q: 'كيف أسجّل حساباً؟', a: 'اذهب لصفحة /signup وسجّل بالبريد الإلكتروني أو حساب Google.' },
      { q: 'هل يمكنني استخدام التطبيق بدون حساب؟', a: 'نعم — معظم الميزات تعمل بدون حساب.' },
      { q: 'كيف أحذف حسابي؟', a: 'من /settings في الأسفل يوجد رابط "حذف الحساب وجميع البيانات".' },
    ],
  },
  {
    id: 'pwa', icon: '📱', title: 'تثبيت التطبيق', color: '#2dd4bf',
    items: [
      { q: 'كيف أثبّت التطبيق على iPhone؟', a: 'Safari → أيقونة المشاركة ↑ → "إضافة إلى الشاشة الرئيسية".' },
      { q: 'كيف أثبّته على Android؟', a: 'Chrome → ⋮ → "إضافة إلى الشاشة الرئيسية".' },
      { q: 'هل يعمل بدون إنترنت؟', a: 'الهيكل الأساسي يعمل offline. القراءة والصوت تحتاج اتصالاً.' },
    ],
  },
];

export default function HelpPage() {
  const [open,     setOpen]     = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [search,   setSearch]   = useState('');

  const filtered = search.trim()
    ? SECTIONS.map(sec => ({
        ...sec,
        items: sec.items.filter(item => item.q.includes(search) || item.a.includes(search)),
      })).filter(sec => sec.items.length > 0)
    : SECTIONS;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>← رجوع</Link>
        <h1 className={styles.pageTitle}>📘 شرح الاستخدام</h1>
        <div style={{ width: 70 }} />
      </div>

      <div className={styles.hero}>
        <div className={styles.heroIcon}>🌿</div>
        <div className={styles.heroText}>
          <div className={styles.heroTitle}>مرحباً بك في نور القرآن</div>
          <div className={styles.heroSub}>دليل شامل لكل ميزات التطبيق</div>
        </div>
      </div>

      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>🔍</span>
        <input className={styles.searchInput} value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث في الأسئلة الشائعة..." dir="rtl" />
        {search && <button className={styles.clearSearch} onClick={() => setSearch('')}>✕</button>}
      </div>

      {filtered.map(sec => (
        <div key={sec.id} className={styles.section} style={{ '--sec-color': sec.color }}>
          <div className={styles.secHeader}
            onClick={() => setOpen(open === sec.id ? null : sec.id)}>
            <span className={styles.secIcon}>{sec.icon}</span>
            <span className={styles.secTitle}>{sec.title}</span>
            <span className={`${styles.secChevron} ${(open === sec.id || search) ? styles.secChevronOpen : ''}`}>‹</span>
          </div>

          {(open === sec.id || search) && (
            <div className={styles.secBody}>
              {sec.items.map((item, idx) => {
                const itemKey = `${sec.id}-${idx}`;
                return (
                  <div key={idx} className={styles.faqItem}>
                    <div className={styles.faqQ}
                      onClick={() => setOpenItem(openItem === itemKey ? null : itemKey)}>
                      <span className={styles.faqQText}>{item.q}</span>
                      <span className={`${styles.faqChevron} ${openItem === itemKey ? styles.faqChevronOpen : ''}`}>‹</span>
                    </div>
                    {openItem === itemKey && (
                      <div className={styles.faqA}>{item.a}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div className={styles.contactCard}>
        <div className={styles.contactIcon}>💬</div>
        <div className={styles.contactText}>لم تجد إجابة لسؤالك؟</div>
        <Link to="/support" className={styles.contactBtn}>تواصل مع الدعم</Link>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './DocsPage.module.css';

const FEATURES = [
  { icon:'📖', color:'#52b788', title:'قراءة القرآن الكريم', path:'/reader', badge:'الأساسي',
    desc:'تصفّح القرآن الكريم كاملاً بـ 114 سورة بخطوط عثمانية احترافية.',
    points:['خطان: العثماني والمبسّط','تحكم كامل في حجم الخط','ترجمة بـ 16 لغة','تفسير بالضغط على أي آية','حفظ موضع القراءة','تصفح بالسور أو الأجزاء'],
  },
  { icon:'🎧', color:'#818cf8', title:'الاستماع للتلاوة', path:'/reader', badge:'صوت',
    desc:'استمع لأشهر القرّاء بجودة عالية.',
    points:['16 قارئاً مشهوراً','مشاري العفاسي والسديس والحصري وغيرهم','تشغيل من أي آية'],
  },
  { icon:'📻', color:'#f97316', title:'الراديو الإسلامي', path:'/radio', badge:'جديد',
    desc:'محطات قرآن وبرامج دينية وأناشيد.',
    points:['محطات متحقق منها من Radio Browser','3 فئات: قرآن / برامج دينية / أناشيد','بحث في المحطات','تحكم في الصوت'],
  },
  { icon:'📿', color:'#52b788', title:'السبحة الإلكترونية', path:'/tasbih', badge:'جديد',
    desc:'عدّاد تسبيح رقمي متكامل.',
    points:['7 أذكار جاهزة + مخصص','دائرة تقدم مرئية','أهداف قابلة للتغيير','اهتزاز عند كل ضغطة','سجل الجلسات'],
  },
  { icon:'✨', color:'#f59e0b', title:'آية اليوم', path:'/daily-ayah', badge:'جديد',
    desc:'آية مميزة كل يوم مع تفسير.',
    points:['30 آية مختارة تتغير يومياً','ترجمة إنجليزية','نسخ وحفظ وانتقال للسياق','تفسير قابل للتوسيع'],
  },
  { icon:'📊', color:'#6366f1', title:'التقرير الشهري', path:'/report', badge:'جديد',
    desc:'تحليل مفصّل لنشاط قراءتك.',
    points:['خريطة حرارية يومية للقراءة','إحصائيات شهرية','أفضل يوم قراءة','إحصائيات كل الوقت','قابل للطباعة'],
  },
  { icon:'📊', color:'#a78bfa', title:'لوحة التحكم', path:'/dashboard', badge:'إحصائيات',
    desc:'تابع تقدمك اليومي والأسبوعي.',
    points:['عداد الآيات المقروءة','سلسلة أيام الاستمرارية','خريطة نشاط أسبوعية','تزامن سحابي'],
  },
  { icon:'📚', color:'#c9a84c', title:'نظام الحفظ', path:'/hifz', badge:'حفظ',
    desc:'تتبع حفظك وتنظيم وردك اليومي.',
    points:['4 حالات: لم يبدأ / قيد الحفظ / محفوظ / مراجعة','ورد يومي مخصص','خريطة الحفظ البصرية','شارات إنجاز','تزامن سحابي'],
  },
  { icon:'🕌', color:'#10b981', title:'أوقات الصلاة', path:'/prayer-times', badge:'صلاة',
    desc:'مواعيد دقيقة حسب موقعك مع منبّه.',
    points:['تحديد موقع تلقائي','جدول مواعيد الأسبوع','منبّه لكل صلاة','طرق حساب لكل دول العالم'],
  },
  { icon:'🧭', color:'#6366f1', title:'اتجاه القبلة', path:'/qibla', badge:'قبلة',
    desc:'بوصلة تفاعلية للكعبة المشرفة.',
    points:['حساب دقيق من إحداثياتك','بوصلة متحركة','المسافة للكعبة','تأكيد أخضر عند مواجهة القبلة'],
  },
  { icon:'📿', color:'#f97316', title:'الأذكار والأدعية', path:'/adhkar', badge:'أذكار',
    desc:'36 ذكراً ودعاءً منظمة في فئات.',
    points:['أذكار الصباح والمساء والنوم','أذكار الصلاة','عدّاد لكل ذكر','نسخ بضغطة واحدة'],
  },
  { icon:'🔍', color:'#38bdf8', title:'البحث في القرآن', path:'/search', badge:'بحث',
    desc:'ابحث في كل كلمة بالقرآن الكريم.',
    points:['بحث نصي كامل','انتقل مباشرة بكتابة 2:255','نتائج فورية مع التمييز'],
  },
  { icon:'📝', color:'#fb7185', title:'الملاحظات', path:'/notes', badge:'تأمل',
    desc:'دوّن تأملاتك على الآيات.',
    points:['ملاحظة على أي آية','مرتبة بالتاريخ','ربط مباشر بالآية في القارئ'],
  },
  { icon:'📿', color:'#e879f9', title:'الختمات', path:'/khatma', badge:'ختم',
    desc:'سجّل ختماتك الشخصية والجماعية.',
    points:['ختمات شخصية مع التاريخ','ختمة جماعية مع الأهل','كود مشاركة','إحصائيات الختمات'],
  },
  { icon:'✦', color:'#e879f9', title:'المساعد الذكي', path:'/reader', badge:'AI',
    desc:'تفسير ذكي بتقنية الذكاء الاصطناعي.',
    points:['اضغط على أي آية ثم "تفسير ذكي"','شرح مبسّط للمعنى','ربط بالسياق'],
  },
  { icon:'🏆', color:'#fbbf24', title:'لوحة المتصدرين', path:'/leaderboard', badge:'منافسة',
    desc:'نافس في القراءة والحفظ.',
    points:['ترتيب القراءة','ترتيب تقدم الحفظ','ترتيب عدد الختمات'],
  },
  { icon:'📜', color:'#94a3b8', title:'الإجازة والقراءات', path:'/ijaza', badge:'متقدم',
    desc:'تعرف على علم الإجازة وأسانيد القراءات.',
    points:['شجرة السند القرآني','القراءات العشر','رواة القرآن الكريم'],
  },
  { icon:'📱', color:'#2dd4bf', title:'تطبيق PWA', path:'/', badge:'تثبيت',
    desc:'ثبّت نور القرآن على هاتفك.',
    points:['iOS: Safari → مشاركة → إضافة للشاشة الرئيسية','Android: Chrome → تثبيت التطبيق','يعمل بدون متجر تطبيقات'],
  },
];

const BADGE_COLORS = {
  'الأساسي':'#52b788','صوت':'#818cf8','إحصائيات':'#a78bfa','حفظ':'#c9a84c',
  'جديد':'#f97316','تأمل':'#fb7185','بحث':'#38bdf8','ختم':'#e879f9',
  'AI':'#e879f9','منافسة':'#fbbf24','متقدم':'#94a3b8','تثبيت':'#2dd4bf',
  'صلاة':'#10b981','قبلة':'#6366f1','أذكار':'#f97316',
};

const FILTERS = ['الكل','جديد','الأساسي','حفظ','ختم','AI','بحث','صلاة'];

export default function DocsPage() {
  const [openIdx, setOpenIdx] = useState(null);
  const [filter,  setFilter]  = useState('الكل');

  const displayed = filter === 'الكل'
    ? FEATURES
    : FEATURES.filter(feat => feat.badge === filter);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>← رجوع</Link>
        <h1 className={styles.pageTitle}>📄 دليل المميزات</h1>
        <div style={{ width: 70 }} />
      </div>

      <div className={styles.hero}>
        <div className={styles.heroTitle}>نور القرآن — دليل المميزات الكامل</div>
        <div className={styles.heroSub}>
          <span className={styles.statBadge}>📖 {FEATURES.length} ميزة</span>
          <span className={styles.statBadge}>🆕 4 ميزات جديدة</span>
          <span className={styles.statBadge}>🤖 ذكاء اصطناعي</span>
        </div>
      </div>

      <div className={styles.filterRow}>
        {FILTERS.map(f => (
          <button key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className={styles.featureGrid}>
        {displayed.map((feat, idx) => {
          const isOpen = openIdx === idx;
          const badgeColor = BADGE_COLORS[feat.badge] || feat.color;
          return (
            <div key={idx}
              className={`${styles.featureCard} ${isOpen ? styles.featureCardOpen : ''}`}
              style={{ '--feat-color': feat.color }}>
              <div className={styles.featureHeader} onClick={() => setOpenIdx(isOpen ? null : idx)}>
                <div className={styles.featLeft}>
                  <span className={styles.featIcon}>{feat.icon}</span>
                  <div>
                    <div className={styles.featTitle}>{feat.title}</div>
                    <div className={styles.featDesc}>{feat.desc}</div>
                  </div>
                </div>
                <div className={styles.featRight}>
                  <span className={styles.featBadge}
                    style={{
                      background: `color-mix(in srgb, ${badgeColor} 15%, transparent)`,
                      color: badgeColor,
                      border: `1px solid color-mix(in srgb, ${badgeColor} 30%, transparent)`,
                    }}>
                    {feat.badge}
                  </span>
                  <span className={`${styles.featChevron} ${isOpen ? styles.featChevronOpen : ''}`}>‹</span>
                </div>
              </div>

              {isOpen && (
                <div className={styles.featBody}>
                  <ul className={styles.featPoints}>
                    {feat.points.map((point, pi) => (
                      <li key={pi} className={styles.featPoint}>
                        <span className={styles.featDot} style={{ background: feat.color }}/>
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link to={feat.path} className={styles.featLink} style={{ background: feat.color }}>
                    فتح ←
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerText}>🌿 نور القرآن — مشروع لخدمة القرآن الكريم</div>
        <Link to="/help" className={styles.footerLink}>📘 شرح الاستخدام</Link>
      </div>
    </div>
  );
}

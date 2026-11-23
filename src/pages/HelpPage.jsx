// ─── Help: how to use each part of the site, as anchored FAQ sections ───────
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';
import { normalizeArabic } from '../arabic';
import styles from './HelpPage.module.css';
import { useTr } from '../l10n';

const SECTIONS = [
  {
    id: 'read', icon: 'book', title: 'قراءة القرآن الكريم', link: '/reader',
    items: [
      { q: 'كيف أفتح سورة معيّنة؟', a: 'افتح «المصحف» من القائمة العلوية، ثم اختر السورة من فهرس السور، أو اكتب اسمها في البحث أعلى الصفحة. ويمكنك كتابة رقم الآية مباشرة مثل ٢:٢٥٥.' },
      { q: 'كيف أكبّر خط المصحف أو أغيّر نوعه؟', a: 'من أدوات القراءة في صفحة المصحف، أو من «الإعدادات ← القراءة والتلاوة» حيث تجد حجم الخط ونوعه (عثماني أو مبسّط) مع معاينة مباشرة. يُحفظ اختيارك تلقائياً.' },
      { q: 'كيف أُظهر الترجمة تحت الآيات؟', a: 'اختر الترجمة من أدوات القراءة أو من «الإعدادات ← الترجمة الافتراضية». تتوفر ترجمات بأكثر من خمس عشرة لغة.' },
      { q: 'كيف أقرأ تفسير آية؟', a: 'اضغط على الآية في المصحف ثم اختر «التفسير». تجد التفسير الميسّر وابن كثير والسعدي وغيرها.' },
      { q: 'كيف أنتقل إلى جزء معيّن؟', a: 'من فهرس المصحف انتقل إلى تبويب «الأجزاء» واختر الجزء الذي تريده.' },
      { q: 'هل يحفظ الموقع آخر موضع قرأت فيه؟', a: 'نعم، يُحفظ آخر موضع تلقائياً، وتجد زر «تابع» في الصفحة الرئيسية لتعود إليه.' },
    ],
  },
  {
    id: 'listen', icon: 'head', title: 'الاستماع إلى التلاوة', link: '/reader',
    items: [
      { q: 'كيف أستمع إلى التلاوة؟', a: 'في صفحة المصحف اضغط زر التشغيل في مشغّل التلاوة أسفل الصفحة، أو اضغط على آية واختر «استمع». تُظلَّل الآية التي تُتلى.' },
      { q: 'كيف أغيّر القارئ؟', a: 'من مشغّل التلاوة، أو من «الإعدادات ← القارئ». يتوفر عدد من كبار القرّاء.' },
      { q: 'كيف أكرّر مقطعاً للحفظ؟', a: 'في مشغّل التلاوة اختر التكرار وحدّد عدد المرات، فيعيد القارئ المقطع حتى تحفظه.' },
    ],
  },
  {
    id: 'hifz', icon: 'grid', title: 'الحفظ والمراجعة', link: '/hifz',
    items: [
      { q: 'كيف أبدأ تسجيل حفظي؟', a: 'افتح «الحفظ والمراجعة»، واختر السورة، وحدّد حالتها: لم أبدأ، أو أحفظها الآن، أو حفظتها، أو أراجعها.' },
      { q: 'ما الوِرد اليومي؟', a: 'مقدار تحدّده لنفسك كل يوم للحفظ أو المراجعة، ويُحسب لك عدد الأيام المتتالية التي التزمت فيها.' },
      { q: 'هل يتزامن حفظي بين أجهزتي؟', a: 'نعم، عند تسجيل الدخول يُحفظ تقدّمك في حسابك ويظهر على كل أجهزتك.' },
    ],
  },
  {
    id: 'prayer', icon: 'mosque', title: 'مواقيت الصلاة والقبلة', link: '/prayer-times',
    items: [
      { q: 'كيف أعرف مواقيت الصلاة في مدينتي؟', a: 'افتح «مواقيت الصلاة» واكتب اسم مدينتك، أو اسمح للموقع بتحديد موقعك.' },
      { q: 'لماذا أختار طريقة الحساب؟', a: 'تعتمد كل دولة هيئة رسمية لحساب المواقيت، فاختر الطريقة المعتمدة في بلدك لتطابق مواقيت مساجدها.' },
      { q: 'كيف أفعّل التنبيه قبل الصلاة؟', a: 'في صفحة المواقيت فعّل التنبيه بجانب الصلاة التي تريدها، واسمح للمتصفح بإرسال الإشعارات.' },
      { q: 'كيف أعرف اتجاه القبلة؟', a: 'افتح «القبلة» واسمح بتحديد الموقع؛ يظهر اتجاه الكعبة المشرّفة بالدرجة. على الجوال يمكنك تفعيل البوصلة لتتبّع الاتجاه وأنت تتحرك.' },
    ],
  },
  {
    id: 'adhkar', icon: 'moon', title: 'الأذكار والسبحة', link: '/adhkar',
    items: [
      { q: 'كيف أستخدم عدّاد الأذكار؟', a: 'في «الأذكار والأدعية» اختر الفئة، ثم اضغط على الذكر ليُحسب، ويتقدّم العدّاد حتى يكتمل العدد المسنون.' },
      { q: 'كيف أستخدم السبحة؟', a: 'افتح «السبحة»، واختر الذكر، ثم اضغط على الدائرة الكبيرة مع كل تسبيحة. يمكنك تحديد هدف يومي.' },
      { q: 'هل تهتز السبحة مع كل ضغطة؟', a: 'نعم على الأجهزة التي تدعم الاهتزاز، ويمكنك إيقافه من إعدادات السبحة.' },
    ],
  },
  {
    id: 'khatma', icon: 'users', title: 'الختمات', link: '/khatma-group',
    items: [
      { q: 'ما الفرق بين ختماتي والختمة الجماعية؟', a: '«ختماتي» لمتابعة ختمتك الشخصية ووِردك اليومي. و«الختمة الجماعية» يجتمع عليها الأهل والأحباب فيتوزّعون الأجزاء، وتُهدى لروح من تحب.' },
      { q: 'كيف أدعو غيري إلى ختمة جماعية؟', a: 'أنشئ الختمة ثم انسخ رابطها أو رمزها وأرسله؛ يختار كل مشارك جزءاً ويعلّمه عند إتمامه.' },
      { q: 'هل يحتاج المشاركون إلى حساب؟', a: 'للمشاركة واختيار جزء يحتاج المشارك إلى تسجيل الدخول، وإن فتح الرابط قبل الدخول أُعيد إلى الختمة بعده تلقائياً.' },
    ],
  },
  {
    id: 'radio', icon: 'radio', title: 'إذاعة القرآن', link: '/radio',
    items: [
      { q: 'كيف أشغّل إذاعة؟', a: 'افتح «إذاعة القرآن» واضغط على أي إذاعة ليبدأ البث مباشرة.' },
      { q: 'لماذا لا تعمل بعض الإذاعات؟', a: 'الإذاعات بثّ مباشر من مصادرها، وقد يتوقف بعضها مؤقتاً. جرّب إذاعة أخرى أو عُد لاحقاً.' },
    ],
  },
  {
    id: 'account', icon: 'user', title: 'الحساب والإعدادات', link: '/settings',
    items: [
      { q: 'هل أحتاج إلى حساب؟', a: 'لا، تعمل معظم الميزات بدون حساب وتُحفظ بياناتك على جهازك. الحساب يحفظ تقدّمك ويزامنه بين أجهزتك.' },
      { q: 'كيف أنشئ حساباً؟', a: 'من «تسجيل الدخول» اختر «أنشئ حساباً مجانياً»، وسجّل بالبريد الإلكتروني أو بحساب Google إن كان متاحاً.' },
      { q: 'كيف أغيّر المظهر إلى الوضع الليلي أو ورق المصحف؟', a: 'من «الإعدادات ← المظهر» اختر أحد الأوضاع: تلقائي، ليلي، نهاري، ورق المصحف، تباين عالٍ. ويمكنك تكبير النص وتقليل الحركة من المكان نفسه.' },
      { q: 'نسيت كلمة المرور، ماذا أفعل؟', a: 'في صفحة تسجيل الدخول اضغط «نسيت كلمة المرور؟» واكتب بريدك، وستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة.' },
      { q: 'كيف أحذف حسابي أو أنزّل بياناتي؟', a: 'من «الإعدادات ← الحساب» تجد زر تنزيل نسخة من بياناتك، ورابط «حذف الحساب والبيانات».' },
    ],
  },
  {
    id: 'pwa', icon: 'phone', title: 'تثبيت التطبيق على الجوال', link: null,
    items: [
      { q: 'كيف أثبّته على iPhone؟', a: 'افتح الموقع في Safari، ثم اضغط زر المشاركة، واختر «إضافة إلى الشاشة الرئيسية».' },
      { q: 'كيف أثبّته على Android؟', a: 'افتح الموقع في Chrome، ثم من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».' },
      { q: 'هل يعمل بدون إنترنت؟', a: 'تفتح واجهة الموقع بدون اتصال، أما نص المصحف والتلاوات والمواقيت فتحتاج إلى اتصال لتحميلها.' },
    ],
  },
];

const norm = s => normalizeArabic(String(s || '')).toLowerCase();

export default function HelpPage() {
  const tr = useTr();
  const [openItem, setOpenItem] = useState(null);
  const [search,   setSearch]   = useState('');
  const { hash } = useLocation();

  // jump to #section when arriving with an anchor
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50);
  }, [hash]);

  const q = norm(search.trim());
  const lang = tr.lang;
  const filtered = useMemo(() => (q
    ? SECTIONS.map(sec => ({ ...sec, items: sec.items.filter(it => norm(tr(it.q)).includes(q) || norm(tr(it.a)).includes(q)) }))
        .filter(sec => sec.items.length > 0)
    : SECTIONS), [q, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = filtered.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className={styles.page}>
      <PageHero eyebrow={tr('خطوة بخطوة')} title={tr('شرح الاستخدام')}
        sub={tr('إجابات مختصرة عن كل ما تحتاجه: القراءة، والاستماع، والحفظ، والصلاة، والختمات، وحسابك.')} />

      <div className={`nq-wrap ${styles.layout}`}>
        <aside className={styles.side}>
          <label className={`nq-input ${styles.search}`}>
            <Icon name="search" />
            <span className="nq-sr">{tr('ابحث في الأسئلة')}</span>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('ابحث في الأسئلة…')} />
            {search && (
              <button type="button" className={styles.clear} onClick={() => setSearch('')} aria-label={tr('مسح البحث')}><Icon name="x" /></button>
            )}
          </label>
          <nav className={styles.toc} aria-label={tr('أقسام الشرح')}>
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} className={styles.tocLink}
                onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); history.replaceState(null, '', `#${s.id}`); }}>
                <Icon name={s.icon} />{tr(s.title)}
              </a>
            ))}
          </nav>
        </aside>

        <div className={styles.main}>
          {q && (
            <p className={styles.found} role="status">
              {total ? tr('{n} نتيجة لـ «{q}»', { n: toAr(total), q: search.trim() }) : tr('لا نتائج لـ «{q}». جرّب كلمة أخرى، أو راسل الدعم.', { q: search.trim() })}
            </p>
          )}

          {filtered.map(sec => (
            <section key={sec.id} id={sec.id} className={styles.section} aria-labelledby={`${sec.id}-h`}>
              <header className={styles.secHead}>
                <Badge8 icon={sec.icon} size={50} />
                <h2 id={`${sec.id}-h`} className={styles.secTitle}>{tr(sec.title)}</h2>
                {sec.link && <Link to={sec.link} className={`nq-btn ghost sm ${styles.open}`}>{tr('افتح الصفحة')}</Link>}
              </header>
              <div className={styles.items}>
                {sec.items.map((item, idx) => {
                  const key = `${sec.id}-${idx}`;
                  const isOpen = !!q || openItem === key;
                  return (
                    <div key={key} className={styles.item} data-open={isOpen ? '1' : '0'}>
                      <h3 className={styles.qWrap}>
                        <button type="button" className={styles.q} aria-expanded={isOpen} aria-controls={`a-${key}`}
                          onClick={() => setOpenItem(openItem === key ? null : key)}>
                          <span>{tr(item.q)}</span>
                          <Icon name="chev" className={styles.chev} />
                        </button>
                      </h3>
                      <div id={`a-${key}`} className={styles.a} hidden={!isOpen}>{tr(item.a)}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className={`nq-card ${styles.contact}`}>
            <Badge8 icon="chat" size={56} />
            <div className={styles.contactText}>
              <h2>{tr('لم تجد إجابة سؤالك؟')}</h2>
              <p>{tr('راسل فريق الدعم وسنرد عليك في أقرب وقت، أو تصفّح دليل المميزات.')}</p>
            </div>
            <div className={styles.contactBtns}>
              <Link to="/support" className="nq-btn gold"><Icon name="chat" />{tr('تواصل مع الدعم')}</Link>
              <Link to="/docs" className="nq-btn ghost"><Icon name="list" />{tr('دليل المميزات')}</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

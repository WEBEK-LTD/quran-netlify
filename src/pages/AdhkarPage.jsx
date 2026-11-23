import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './AdhkarPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
import { normalizeArabic } from '../arabic';

// CATEGORIES defined inside component

const ADHKAR = [
  // ─── الصباح ─────────────────────────────────────────────────────────────
  { id:1,  cat:'morning', name:'دعاء الاستيقاظ', count:1,
    ar:'الحمدُ لله الذي أحيانا بعدَ ما أماتنا وإليه النشور',
    source:'البخاري' },
  { id:2,  cat:'morning', name:'تسبيح الصباح', count:100,
    ar:'سبحانَ الله وبحمده سبحانَ الله العظيم',
    source:'البخاري ومسلم' },
  { id:3,  cat:'morning', name:'دعاء الصباح', count:3,
    ar:'أصبحنا وأصبحَ الملكُ لله، والحمدُ لله، لا إلهَ إلا الله وحدَه لا شريكَ له، له الملكُ وله الحمدُ وهو على كل شيءٍ قدير، ربِّ أسألُك خيرَ ما في هذا اليوم وخيرَ ما بعده، وأعوذُ بكَ من شرِّ ما في هذا اليوم وشرِّ ما بعده، ربِّ أعوذُ بكَ من الكسلِ والهرمِ وسوء الكِبر، وأعوذُ بكَ من عذابٍ في النار وعذابٍ في القبر',
    source:'مسلم' },
  { id:4,  cat:'morning', name:'سيد الاستغفار', count:1,
    ar:'اللهم أنتَ ربي لا إلهَ إلا أنت، خلقتَني وأنا عبدُك، وأنا على عهدِك ووعدِك ما استطعت، أعوذُ بكَ من شرِّ ما صنعت، أبوءُ لكَ بنعمتِك عليّ، وأبوءُ بذنبي، فاغفرْ لي فإنه لا يغفرُ الذنوبَ إلا أنت',
    source:'البخاري' },
  { id:5,  cat:'morning', name:'التعوذ صباحاً', count:3,
    ar:'أعوذُ بكلماتِ الله التامَّات من شرِّ ما خلق',
    source:'مسلم' },
  { id:6,  cat:'morning', name:'الصلاة على النبي', count:10,
    ar:'اللهم صلِّ وسلِّم وبارك على سيدنا محمد وعلى آل سيدنا محمد',
    source:'متواتر' },

  // ─── المساء ─────────────────────────────────────────────────────────────
  { id:7,  cat:'evening', name:'دعاء المساء', count:3,
    ar:'أمسينا وأمسى الملكُ لله، والحمدُ لله، لا إلهَ إلا الله وحدَه لا شريكَ له، له الملكُ وله الحمدُ وهو على كلِّ شيءٍ قدير، ربِّ أسألُك خيرَ ما في هذه الليلةِ وخيرَ ما بعدها، وأعوذُ بكَ من شرِّ ما في هذه الليلةِ وشرِّ ما بعدها',
    source:'مسلم' },
  { id:8,  cat:'evening', name:'آية الكرسي', count:1,
    ar:'اللهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ',
    source:'البقرة ٢٥٥' },
  { id:9,  cat:'evening', name:'التعوذ مساءً', count:3,
    ar:'بسمِ الله الذي لا يضرُّ مع اسمِه شيءٌ في الأرضِ ولا في السماءِ وهو السميعُ العليم',
    source:'أبو داود والترمذي' },
  { id:10, cat:'evening', name:'الاستغفار مساءً', count:100,
    ar:'أستغفرُ الله وأتوبُ إليه',
    source:'البخاري ومسلم' },

  // ─── النوم ──────────────────────────────────────────────────────────────
  { id:11, cat:'sleep', name:'دعاء قبل النوم', count:1,
    ar:'باسمِك اللهم أموتُ وأحيا',
    source:'البخاري' },
  { id:12, cat:'sleep', name:'آية الكرسي قبل النوم', count:1,
    ar:'اللهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...',
    source:'البخاري — من قرأها حُفِظ حتى الصباح' },
  { id:13, cat:'sleep', name:'المعوذتان', count:3,
    ar:'قل أعوذُ بربِّ الفلق... قل أعوذُ بربِّ الناس...',
    source:'البخاري — ينفثُ في راحتيه ثم يمسح بهما جسده' },
  { id:14, cat:'sleep', name:'التسبيح قبل النوم', count:'33-33-34', target:100,
    ar:'سبحانَ الله (٣٣) • الحمدُ لله (٣٣) • الله أكبر (٣٤)',
    source:'البخاري ومسلم' },
  { id:15, cat:'sleep', name:'دعاء الكرب', count:1,
    ar:'لا إلهَ إلا الله العظيمُ الحليم، لا إلهَ إلا الله ربُّ العرشِ العظيم، لا إلهَ إلا الله ربُّ السمواتِ وربُّ الأرضِ وربُّ العرشِ الكريم',
    source:'البخاري ومسلم' },

  // ─── الصلاة ─────────────────────────────────────────────────────────────
  { id:16, cat:'prayer', name:'دعاء الاستفتاح', count:1,
    ar:'اللهم باعِدْ بيني وبين خطاياي كما باعدتَ بين المشرقِ والمغرب، اللهم نقِّني من خطاياي كما يُنقَّى الثوبُ الأبيضُ من الدنس، اللهم اغسلْ خطاياي بالماءِ والثلجِ والبرَد',
    source:'البخاري ومسلم' },
  { id:17, cat:'prayer', name:'دعاء الركوع', count:3,
    ar:'سبحانَ ربيَ العظيم',
    source:'مسلم' },
  { id:18, cat:'prayer', name:'دعاء السجود', count:3,
    ar:'سبحانَ ربيَ الأعلى',
    source:'مسلم' },
  { id:19, cat:'prayer', name:'التشهد', count:1,
    ar:'التحياتُ لله والصلواتُ والطيبات، السلامُ عليكَ أيها النبيُّ ورحمةُ اللهِ وبركاته، السلامُ علينا وعلى عبادِ الله الصالحين، أشهدُ أن لا إلهَ إلا الله وأشهدُ أن محمداً عبدُهُ ورسوله',
    source:'البخاري ومسلم' },
  { id:20, cat:'prayer', name:'الصلاة الإبراهيمية', count:1,
    ar:'اللهم صلِّ على محمد وعلى آل محمد، كما صليتَ على إبراهيمَ وعلى آل إبراهيم، إنكَ حميدٌ مجيد، وبارِكْ على محمد وعلى آل محمد، كما باركتَ على إبراهيمَ وعلى آل إبراهيم، إنكَ حميدٌ مجيد',
    source:'البخاري' },
  { id:21, cat:'prayer', name:'دعاء بعد التشهد', count:1,
    ar:'اللهم إني أعوذُ بكَ من عذابِ القبر، ومن عذابِ جهنم، ومن فتنةِ المحيا والممات، ومن شرِّ فتنةِ المسيحِ الدجال',
    source:'البخاري ومسلم' },

  // ─── قرآنية ─────────────────────────────────────────────────────────────
  { id:22, cat:'quran', name:'دعاء موسى', count:1,
    ar:'رَبِّ إِنِّي لِمَا أَنزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ',
    source:'القصص ٢٤' },
  { id:23, cat:'quran', name:'دعاء أيوب', count:1,
    ar:'أَنِّي مَسَّنِيَ الضُّرُّ وَأَنتَ أَرْحَمُ الرَّاحِمِينَ',
    source:'الأنبياء ٨٣' },
  { id:24, cat:'quran', name:'دعاء يونس', count:1,
    ar:'لَّا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ',
    source:'الأنبياء ٨٧' },
  { id:25, cat:'quran', name:'ربنا آتنا', count:1,
    ar:'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
    source:'البقرة ٢٠١' },
  { id:26, cat:'quran', name:'ربنا لا تزغ قلوبنا', count:1,
    ar:'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً ۚ إِنَّكَ أَنتَ الْوَهَّابُ',
    source:'آل عمران ٨' },
  { id:27, cat:'quran', name:'دعاء إبراهيم', count:1,
    ar:'رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِن ذُرِّيَّتِي ۚ رَبَّنَا وَتَقَبَّلْ دُعَاءِ',
    source:'إبراهيم ٤٠' },

  // ─── يومية ──────────────────────────────────────────────────────────────
  { id:28, cat:'daily', name:'عند دخول البيت', count:1,
    ar:'اللهم إني أسألُكَ خيرَ المَوْلَج وخيرَ المَخرَج، بسمِ الله وَلَجنا وبسمِ الله خَرَجنا وعلى اللهِ ربِّنا توكَّلنا',
    source:'أبو داود' },
  { id:29, cat:'daily', name:'عند الأكل', count:1,
    ar:'بسمِ الله وعلى بركةِ الله',
    source:'أبو داود' },
  { id:30, cat:'daily', name:'عند الخروج', count:1,
    ar:'بسمِ الله، توكلتُ على الله، ولا حولَ ولا قوةَ إلا بالله',
    source:'أبو داود والترمذي' },
  { id:31, cat:'daily', name:'دعاء السفر', count:1,
    ar:'اللهُ أكبر، اللهُ أكبر، اللهُ أكبر، سبحانَ الذي سخَّرَ لنا هذا وما كنَّا له مقرنين وإنا إلى ربِّنا لمنقلبون، اللهم إنا نسألُكَ في سفرِنا هذا البِرَّ والتقوى، ومن العملِ ما ترضى، اللهم هوِّنْ علينا سفرَنا هذا واطوِ عنَّا بُعدَه',
    source:'مسلم' },
  { id:32, cat:'daily', name:'دعاء الاستخارة', count:1,
    ar:'اللهم إني أستخيرُكَ بعلمِكَ وأستقدِرُكَ بقدرتِكَ وأسألُكَ من فضلِكَ العظيم، فإنكَ تقدِرُ ولا أقدِر وتعلمُ ولا أعلمُ وأنتَ علَّامُ الغيوب، اللهم إن كنتَ تعلمُ أن هذا الأمرَ خيرٌ لي في ديني ومعاشي وعاقبةِ أمري فاقدُرْهُ لي ويسِّرهُ لي ثم بارِكْ لي فيه، وإن كنتَ تعلمُ أن هذا الأمرَ شرٌّ لي في ديني ومعاشي وعاقبةِ أمري فاصرِفهُ عني واصرِفني عنه واقدُرْ ليَ الخيرَ حيثُ كان ثم أرضِني به',
    source:'البخاري' },

  // ─── مأثورة ─────────────────────────────────────────────────────────────
  { id:33, cat:'special', name:'دعاء الهمّ والحزن', count:1,
    ar:'اللهم إني عبدُكَ وابنُ عبدِكَ وابنُ أَمَتِكَ، ناصيتي بيدِكَ، ماضٍ فيَّ حكمُكَ، عدلٌ فيَّ قضاؤُكَ، أسألُكَ بكلِّ اسمٍ هو لكَ سمَّيتَ به نفسَكَ أو أنزلتَه في كتابِكَ أو علَّمتَهُ أحداً من خلقِكَ أو استأثرتَ به في علمِ الغيبِ عندَكَ أن تجعلَ القرآنَ ربيعَ قلبي ونورَ صدري وجلاءَ حزني وذهابَ همِّي',
    source:'أحمد — صحيح' },
  { id:34, cat:'special', name:'حسبي الله', count:7,
    ar:'حسبيَ اللهُ لا إلهَ إلا هو عليهِ توكَّلتُ وهو ربُّ العرشِ العظيم',
    source:'أبو داود — من قالها ٧ مرات صباحاً ومساءً كفاه الله ما أهمَّه' },
  { id:35, cat:'special', name:'لا إله إلا الله', count:100,
    ar:'لا إلهَ إلا الله وحدَه لا شريكَ له، له الملكُ وله الحمدُ وهو على كلِّ شيءٍ قدير',
    source:'البخاري ومسلم — أفضل الذكر' },
  { id:36, cat:'special', name:'دعاء رفع البلاء', count:1,
    ar:'اللهم لا سهلَ إلا ما جعلتَه سهلاً وأنتَ تجعلُ الحزنَ إن شئتَ سهلاً',
    source:'ابن حبان — صحيح' },
];

// عدّادات الأذكار تُحفظ لليوم الحالي (بالتوقيت المحلي) وتُصفَّر بعد منتصف الليل
const COUNTERS_KEY = 'nq_adhkar_counters';
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function loadCounters() {
  try {
    const saved = JSON.parse(localStorage.getItem(COUNTERS_KEY) || 'null');
    if (saved && saved.date === localDay() && saved.counts && typeof saved.counts === 'object') return saved.counts;
  } catch {}
  return {};
}
function saveCounters(counts) {
  try { localStorage.setItem(COUNTERS_KEY, JSON.stringify({ date: localDay(), counts })); } catch {}
}

// النص المطبَّع مسبقاً للبحث
const ADHKAR_INDEX = ADHKAR.map(d => ({
  id: d.id,
  text: normalizeArabic(`${d.name} ${d.ar} ${d.source || ''}`),
}));

function CounterBadge({ count }) {
  if (!count || count === 1) return null;
  const display = typeof count === 'number'
    ? String(count).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])
    : count;
  return <span className={styles.countBadge}>× {display}</span>;
}

export default function AdhkarPage() {
  const t = useT();
  const dir = useDir();

  const CATEGORIES = [
    { id: 'morning',  icon: '🌅', name: t('morning'),      color: '#f59e0b' },
    { id: 'evening',  icon: '🌙', name: t('evening'),       color: '#6366f1' },
    { id: 'sleep',    icon: '😴', name: t('sleep'),         color: '#8b5cf6' },
    { id: 'prayer',   icon: '🕌', name: t('prayerAdhkar'),  color: '#10b981' },
    { id: 'quran',    icon: '📖', name: t('quranDua'),      color: '#c9a84c' },
    { id: 'daily',    icon: '🌿', name: t('daily'),         color: '#52b788' },
    { id: 'special',  icon: '⭐', name: t('special'),       color: '#f97316' },
    { id: 'all',      icon: '📚', name: t('allCategories'), color: '#94a3b8' },
  ];
  const [activeCategory, setActiveCategory] = useState('morning');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [counters, setCounters] = useState(loadCounters);
  const [counterDay, setCounterDay] = useState(localDay);

  // تصفير العدّادات عند تغيّر اليوم (الصفحة مفتوحة بعد منتصف الليل)
  useEffect(() => {
    const iv = setInterval(() => {
      const today = localDay();
      if (today !== counterDay) { setCounterDay(today); setCounters({}); }
    }, 60000);
    return () => clearInterval(iv);
  }, [counterDay]);

  useEffect(() => { saveCounters(counters); }, [counters]);
  const [copied, setCopied] = useState(null);

  const filtered = useMemo(() => {
    const q = normalizeArabic(search).replace(/\s+/g, ' ').trim();
    if (q) {
      // البحث يشمل كل الأقسام ولا يتأثر بالتشكيل
      const ids = new Set(ADHKAR_INDEX.filter(x => x.text.replace(/\s+/g, ' ').includes(q)).map(x => x.id));
      return ADHKAR.filter(d => ids.has(d.id));
    }
    return activeCategory === 'all' ? ADHKAR : ADHKAR.filter(d => d.cat === activeCategory);
  }, [activeCategory, search]);

  function increment(id) {
    setCounters(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  function reset(id) {
    setCounters(prev => { const n = {...prev}; delete n[id]; return n; });
  }

  function copyDhikr(id, text) {
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
      }).catch(() => {});
    } catch {}
  }

  const activeCat = CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>{t('back')}</Link>
        <h1 className={styles.pageTitle}>{t('adhkarTitle')}</h1>
        <LangSwitcher compact={true} />
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          className={styles.searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث في الأدعية والأذكار..."
          dir="rtl"
        />
        {search && (
          <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Category tabs */}
      <div className={styles.categories}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`${styles.catBtn} ${activeCategory === cat.id ? styles.catBtnActive : ''}`}
            style={{ '--cat-color': cat.color }}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span>{cat.icon}</span>
            <span>{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Header for category */}
      {!search && activeCat && (
        <div className={styles.catHeader} style={{ '--cat-color': activeCat.color }}>
          <span className={styles.catHeaderIcon}>{activeCat.icon}</span>
          <div>
            <div className={styles.catHeaderName}>{activeCat.name}</div>
            <div className={styles.catHeaderCount}>
              {String(filtered.length).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])} ذكر / دعاء
            </div>
          </div>
        </div>
      )}

      {/* Adhkar list */}
      <div className={styles.adhkarList}>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔍</div>
            <p>{t('noResults')}</p>
          </div>
        )}

        {filtered.map((dhikr, idx) => {
          const isOpen = expanded === dhikr.id;
          const cnt = counters[dhikr.id] || 0;
          const maxCount = typeof dhikr.count === 'number' ? dhikr.count : (dhikr.target || null);
          const done = maxCount && cnt >= maxCount;
          const catInfo = CATEGORIES.find(c => c.id === dhikr.cat);

          return (
            <div
              key={dhikr.id}
              className={`${styles.card} ${done ? styles.cardDone : ''}`}
              style={{ '--card-accent': catInfo?.color || 'var(--gold)', animationDelay: `${idx * 30}ms` }}
            >
              {/* Card header */}
              <div className={styles.cardHeader} onClick={() => setExpanded(isOpen ? null : dhikr.id)}>
                <div className={styles.cardLeft}>
                  <div className={styles.cardName}>{dhikr.name}</div>
                  <div className={styles.cardMeta}>
                    {dhikr.source && <span className={styles.source}>{dhikr.source}</span>}
                    <CounterBadge count={dhikr.count} />
                    {done && <span className={styles.doneBadge}>{t('completed')}</span>}
                  </div>
                </div>
                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>‹</span>
              </div>

              {/* Dhikr text — always visible short preview */}
              <div
                className={`${styles.dhikrText} ${isOpen ? styles.dhikrTextFull : styles.dhikrTextPreview}`}
                onClick={() => setExpanded(isOpen ? null : dhikr.id)}
              >
                {dhikr.ar}
              </div>

              {/* Actions - shown when expanded */}
              {isOpen && (
                <div className={styles.cardActions}>
                  <button
                    className={`${styles.countBtn} ${done ? styles.countBtnDone : ''}`}
                    onClick={() => !done && increment(dhikr.id)}
                  >
                    <span className={styles.countNum}>
                      {String(cnt).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])}
                    </span>
                    {maxCount && (
                      <span className={styles.countOf}>
                        / {String(maxCount).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])}
                      </span>
                    )}
                    <span className={styles.countLabel}>{done ? '✅' : '+ عدّاد'}</span>
                  </button>

                  {cnt > 0 && (
                    <button className={styles.resetBtn} onClick={() => reset(dhikr.id)}>
                      ↺ إعادة
                    </button>
                  )}

                  <button
                    className={styles.copyBtn}
                    onClick={() => copyDhikr(dhikr.id, dhikr.ar)}
                  >
                    {copied === dhikr.id ? '✅ تم النسخ' : '📋 نسخ'}
                  </button>
                </div>
              )}

              {/* Progress bar for counted dhikr */}
              {maxCount && cnt > 0 && (
                <div className={styles.progressBar}>
                  <div
                    className={`${styles.progressFill} ${done ? styles.progressDone : ''}`}
                    style={{ width: `${Math.min(100, (cnt / maxCount) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer tip */}
      <div className={styles.tip}>
        💡 اضغط على أي ذكر للتوسيع وتفعيل العدّاد ونسخه
      </div>
    </div>
  );
}

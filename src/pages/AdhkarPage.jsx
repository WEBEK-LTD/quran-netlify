// ─── Adhkar ──────────────────────────────────────────────────────────────────
// Categories as gilded tabs; each dhikr a framed card (Quran in the Quran
// face, everything else in Amiri) with a ring counter that is kept for today.
import { useState, useMemo, useEffect } from 'react';
import styles from './AdhkarPage.module.css';
import { normalizeArabic } from '../arabic';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';

const CATEGORIES = [
  { id: 'morning', icon: 'sun',    name: 'أذكار الصباح' },
  { id: 'evening', icon: 'moon',   name: 'أذكار المساء' },
  { id: 'sleep',   icon: 'star',   name: 'أذكار النوم' },
  { id: 'prayer',  icon: 'mosque', name: 'أذكار الصلاة' },
  { id: 'quran',   icon: 'book',   name: 'أدعية قرآنية' },
  { id: 'daily',   icon: 'home',   name: 'أذكار يومية' },
  { id: 'special', icon: 'heart',  name: 'أدعية مأثورة' },
  { id: 'all',     icon: 'list',   name: 'الكل' },
];

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
  { id:8,  cat:'evening', q:true, name:'آية الكرسي', count:1,
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
  { id:12, cat:'sleep', q:true, name:'آية الكرسي قبل النوم', count:1,
    ar:'اللهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ',
    source:'البخاري — من قرأها حُفِظ حتى الصباح' },
  { id:13, cat:'sleep', q:true, name:'المعوذتان', count:3,
    ar:'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ • مِن شَرِّ مَا خَلَقَ • وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ • وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ • وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ\nقُلْ أَعُوذُ بِرَبِّ النَّاسِ • مَلِكِ النَّاسِ • إِلَٰهِ النَّاسِ • مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ • الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ • مِنَ الْجِنَّةِ وَالنَّاسِ',
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
  { id:22, cat:'quran', q:true, name:'دعاء موسى', count:1,
    ar:'رَبِّ إِنِّي لِمَا أَنزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ',
    source:'القصص ٢٤' },
  { id:23, cat:'quran', q:true, name:'دعاء أيوب', count:1,
    ar:'أَنِّي مَسَّنِيَ الضُّرُّ وَأَنتَ أَرْحَمُ الرَّاحِمِينَ',
    source:'الأنبياء ٨٣' },
  { id:24, cat:'quran', q:true, name:'دعاء يونس', count:1,
    ar:'لَّا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ',
    source:'الأنبياء ٨٧' },
  { id:25, cat:'quran', q:true, name:'ربنا آتنا', count:1,
    ar:'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
    source:'البقرة ٢٠١' },
  { id:26, cat:'quran', q:true, name:'ربنا لا تزغ قلوبنا', count:1,
    ar:'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً ۚ إِنَّكَ أَنتَ الْوَهَّابُ',
    source:'آل عمران ٨' },
  { id:27, cat:'quran', q:true, name:'دعاء إبراهيم', count:1,
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


const LONG = 240; // نصوص أطول من هذا تُطوى حتى يطلب القارئ قراءتها كاملة
const RING = 2 * Math.PI * 27;

function DhikrCard({ dhikr, cnt, expanded, onToggle, onInc, onReset, onCopy, copied, showCat }) {
  const maxCount = typeof dhikr.count === 'number' ? dhikr.count : (dhikr.target || null);
  const done = !!(maxCount && cnt >= maxCount);
  const long = dhikr.ar.length > LONG;
  const clamp = long && !expanded;
  const frac = maxCount ? Math.min(1, cnt / maxCount) : 0;
  const reps = typeof dhikr.count === 'number' ? (dhikr.count > 1 ? `${toAr(dhikr.count)} مرات` : 'مرة واحدة') : toAr(dhikr.count);
  const cat = CATEGORIES.find(c => c.id === dhikr.cat);
  return (
    <article className={`nq-card ${styles.card} ${done ? styles.done : ''}`} aria-labelledby={`dh-${dhikr.id}`}>
      <header className={styles.cardHead}>
        <h3 id={`dh-${dhikr.id}`} className={styles.name}>{dhikr.name}</h3>
        <div className={styles.meta}>
          {showCat && cat && <span className="nq-pill"><Icon name={cat.icon} />{cat.name}</span>}
          <span className={`nq-pill ${styles.reps}`}>{dhikr.q ? 'من القرآن الكريم' : 'التكرار'} · {reps}</span>
        </div>
      </header>

      <p id={`dt-${dhikr.id}`} className={`${dhikr.q ? styles.quran : styles.text} ${clamp ? styles.clamp : ''}`} lang="ar">{dhikr.ar}</p>
      {long && (
        <button type="button" className={styles.more} onClick={onToggle} aria-expanded={expanded} aria-controls={`dt-${dhikr.id}`}>
          {expanded ? 'إخفاء' : 'اقرأ النص كاملاً'}<Icon name="chev" className={expanded ? styles.up : ''} />
        </button>
      )}

      <footer className={styles.foot}>
        <button type="button" className={styles.counter} onClick={() => !done && onInc()} aria-disabled={done}
          aria-label={done ? `${dhikr.name}: اكتمل العدد` : `عدّ ${dhikr.name}: ${toAr(cnt)} من ${toAr(maxCount)}`}>
          <svg className={styles.ringSvg} viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="27" className={styles.ringBg} />
            <circle cx="32" cy="32" r="27" className={styles.ringFill}
              style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - frac) }} />
          </svg>
          {done ? <Icon name="check" className={styles.cIco} /> : <b className="nq-num">{toAr(cnt)}</b>}
        </button>
        <div className={styles.cInfo}>
          <b>{done ? 'اكتمل، تقبّل الله' : cnt > 0 ? `${toAr(cnt)} من ${toAr(maxCount)}` : 'اضغط الدائرة للعدّ'}</b>
          {dhikr.source && <span className={styles.src}>{dhikr.cat === 'quran' || dhikr.id === 8 ? 'سورة ' : ''}{dhikr.source}</span>}
        </div>
        <div className={styles.acts}>
          {cnt > 0 && (
            <button type="button" className="nq-ibtn" onClick={onReset} aria-label={`إعادة عدّ ${dhikr.name}`} title="إعادة العدّ">
              <Icon name="repeat" />
            </button>
          )}
          <button type="button" className={`nq-ibtn ${copied ? styles.copied : ''}`} onClick={onCopy}
            aria-label={copied ? 'تم النسخ' : `نسخ ${dhikr.name}`} title={copied ? 'تم النسخ' : 'نسخ النص'}>
            <Icon name={copied ? 'check' : 'copy'} />
          </button>
        </div>
      </footer>
    </article>
  );
}

export default function AdhkarPage() {
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
  const isDone = d => {
    const max = typeof d.count === 'number' ? d.count : (d.target || null);
    return !!(max && (counters[d.id] || 0) >= max);
  };
  const doneCount = filtered.filter(isDone).length;
  const searching = !!search.trim();

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="حصن المسلم"
        title="الأذكار والأدعية"
        ayah="أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ"
        ayahRef="سورة الرعد · ٢٨"
        sub="أذكار الصباح والمساء والنوم والصلاة، وأدعية من القرآن والسنّة، مع عدّاد يحفظ تقدّمك لليوم."
      />

      <div className={`nq-wrap ${styles.wrap}`}>
        <div className={styles.tools}>
          <label className={`nq-input ${styles.search}`}>
            <Icon name="search" />
            <span className="nq-sr">ابحث في الأذكار</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في الأذكار والأدعية…" dir="rtl" type="search" />
            {search && (
              <button type="button" className={styles.clear} onClick={() => setSearch('')} aria-label="مسح البحث"><Icon name="x" /></button>
            )}
          </label>
          <div className={styles.tabs} role="group" aria-label="أقسام الأذكار">
            {CATEGORIES.map(cat => {
              const n = cat.id === 'all' ? ADHKAR.length : ADHKAR.filter(d => d.cat === cat.id).length;
              const on = activeCategory === cat.id && !searching;
              return (
                <button key={cat.id} type="button" className={`${styles.tab} ${on ? styles.tabOn : ''}`}
                  aria-pressed={on} onClick={() => { setActiveCategory(cat.id); setSearch(''); }}>
                  <Icon name={cat.icon} />
                  <span>{cat.name}</span>
                  <small className="nq-num">{toAr(n)}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.catHead} aria-live="polite">
          <Badge8 icon={searching ? 'search' : activeCat?.icon} size={58} />
          <div className={styles.catText}>
            <h2 className={styles.catName}>{searching ? 'نتائج البحث' : activeCat?.name}</h2>
            <span className={styles.catCount}>{toAr(filtered.length)} {filtered.length === 1 ? 'ذكر' : 'من الأذكار والأدعية'}</span>
          </div>
          {filtered.length > 0 && (
            <div className={styles.catProg}>
              <span>أتممت <b className="nq-num">{toAr(doneCount)}</b> من <b className="nq-num">{toAr(filtered.length)}</b> اليوم</span>
              <span className={styles.bar} aria-hidden="true"><i style={{ width: `${(doneCount / filtered.length) * 100}%` }} /></span>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className={`nq-card ${styles.empty}`}>
            <Badge8 icon="search" size={64} />
            <p>لا توجد نتائج مطابقة. جرّب كلمة أخرى.</p>
            <button type="button" className="nq-btn ghost sm" onClick={() => setSearch('')}>مسح البحث</button>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map(dhikr => (
              <DhikrCard key={dhikr.id} dhikr={dhikr} cnt={counters[dhikr.id] || 0}
                expanded={expanded === dhikr.id}
                onToggle={() => setExpanded(expanded === dhikr.id ? null : dhikr.id)}
                onInc={() => increment(dhikr.id)} onReset={() => reset(dhikr.id)}
                onCopy={() => copyDhikr(dhikr.id, dhikr.ar)} copied={copied === dhikr.id}
                showCat={searching || activeCategory === 'all'} />
            ))}
          </div>
        )}

        <p className={styles.tip}><Icon name="timer" />تُحفظ العدّادات على جهازك لليوم الحالي وتبدأ من جديد بعد منتصف الليل.</p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SURAHS_META } from '../data';
import styles from './DailyAyahPage.module.css';

const FEATURED_AYAHS = [
  { surah:2, ayah:255, reason:'آية الكرسي — سيدة آيات القرآن' },
  { surah:1, ayah:1,   reason:'فاتحة الكتاب' },
  { surah:2, ayah:286, reason:'لا يكلف الله نفساً إلا وسعها' },
  { surah:3, ayah:173, reason:'حسبنا الله ونعم الوكيل' },
  { surah:9, ayah:51,  reason:'قل لن يصيبنا إلا ما كتب الله' },
  { surah:13,ayah:28,  reason:'ألا بذكر الله تطمئن القلوب' },
  { surah:14,ayah:7,   reason:'لئن شكرتم لأزيدنكم' },
  { surah:2, ayah:152, reason:'فاذكروني أذكركم' },
  { surah:65,ayah:3,   reason:'ومن يتوكل على الله فهو حسبه' },
  { surah:94,ayah:5,   reason:'فإن مع العسر يسراً' },
  { surah:39,ayah:53,  reason:'لا تقنطوا من رحمة الله' },
  { surah:2, ayah:183, reason:'كتب عليكم الصيام' },
  { surah:17,ayah:23,  reason:'وقضى ربك ألا تعبدوا إلا إياه' },
  { surah:3, ayah:190, reason:'إن في خلق السماوات والأرض' },
  { surah:55,ayah:13,  reason:'فبأي آلاء ربكما تكذبان' },
  { surah:36,ayah:82,  reason:'إنما أمره إذا أراد شيئاً أن يقول له كن' },
  { surah:67,ayah:1,   reason:'تبارك الذي بيده الملك' },
  { surah:112,ayah:1,  reason:'قل هو الله أحد' },
  { surah:18,ayah:10,  reason:'ربنا آتنا من لدنك رحمة' },
  { surah:24,ayah:35,  reason:'الله نور السماوات والأرض' },
  { surah:59,ayah:22,  reason:'هو الله الذي لا إله إلا هو' },
  { surah:2, ayah:201, reason:'ربنا آتنا في الدنيا حسنة' },
  { surah:3, ayah:8,   reason:'ربنا لا تزغ قلوبنا' },
  { surah:28,ayah:24,  reason:'رب إني لما أنزلت إليّ من خير فقير' },
  { surah:21,ayah:87,  reason:'دعاء يونس في بطن الحوت' },
  { surah:27,ayah:62,  reason:'أمن يجيب المضطر إذا دعاه' },
  { surah:93,ayah:1,   reason:'والضحى والليل إذا سجى' },
  { surah:89,ayah:27,  reason:'يا أيتها النفس المطمئنة' },
  { surah:4, ayah:36,  reason:'واعبدوا الله ولا تشركوا به شيئاً' },
  { surah:33,ayah:56,  reason:'إن الله وملائكته يصلون على النبي' },
];

// Get consistent daily ayah (changes every day)
function getDailyIndex() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  return dayOfYear % FEATURED_AYAHS.length;
}
function getDailyAyah() {
  return FEATURED_AYAHS[getDailyIndex()];
}

function toAr(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

export default function DailyAyahPage() {
  const navigate = useNavigate();
  const daily = getDailyAyah();
  const [ayahText,   setAyahText]   = useState('');
  const [translation,setTranslation]= useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [copied,     setCopied]     = useState(false);
  const [tafsir,     setTafsir]     = useState('');
  const [showTafsir, setShowTafsir] = useState(false);
  const [loadingTafsir,setLoadingTafsir] = useState(false);
  const [savedAyahs, setSavedAyahs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nq_saved_ayahs') || '[]'); } catch { return []; }
  });

  const surahMeta = SURAHS_META[daily.surah - 1];
  const surahName = surahMeta?.[0] || '';
  const isSaved = savedAyahs.some(a => a.surah === daily.surah && a.ayah === daily.ayah);

  // Fetch ayah text
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}`).then(r => r.json()),
      fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}/en.sahih`).then(r => r.json()),
    ]).then(([ar, en]) => {
      setAyahText(ar.data?.text || '');
      setTranslation(en.data?.text || '');
      setLoading(false);
    }).catch(() => {
      setError('تعذّر تحميل الآية');
      setLoading(false);
    });
  }, [daily.surah, daily.ayah]);

  function copyAyah() {
    const text = `${ayahText}\n\n— سورة ${surahName}، الآية ${daily.ayah}`;
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    } catch {}
  }

  function toggleSave() {
    setSavedAyahs(prev => {
      let next;
      if (isSaved) {
        next = prev.filter(a => !(a.surah === daily.surah && a.ayah === daily.ayah));
      } else {
        next = [...prev, {
          surah: daily.surah, ayah: daily.ayah,
          text: ayahText, surahName, date: new Date().toISOString().split('T')[0],
        }];
      }
      localStorage.setItem('nq_saved_ayahs', JSON.stringify(next));
      return next;
    });
  }

  async function loadTafsir() {
    if (tafsir) { setShowTafsir(s => !s); return; }
    setLoadingTafsir(true); setShowTafsir(true);
    try {
      // التفسير الميسر (وليس نص المصحف)
      const res = await fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}/ar.muyassar`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTafsir(data.data?.text || '');
    } catch { setTafsir('تعذّر تحميل التفسير'); }
    setLoadingTafsir(false);
  }

  // Days of week
  const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const now = new Date();
  const dateStr = `${DAYS[now.getDay()]}، ${toAr(now.getDate())} ${MONTHS[now.getMonth()]} ${toAr(now.getFullYear())}`;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/dashboard" className={styles.backBtn}>← رجوع</Link>
        <h1 className={styles.pageTitle}>✨ آية اليوم</h1>
        <div style={{ width: 70 }} />
      </div>

      {/* Date badge */}
      <div className={styles.dateBadge}>
        <span>📅</span>
        <span>{dateStr}</span>
      </div>

      {/* Main card */}
      <div className={styles.card}>
        <div className={styles.cardDecor}>✦</div>

        {/* Reason */}
        <div className={styles.reason}>{daily.reason}</div>

        {/* Ayah */}
        {loading ? (
          <div className={styles.loadingAyah}>
            <div className={styles.spinner} />
          </div>
        ) : error ? (
          <div className={styles.errorText}>{error}</div>
        ) : (
          <div className={styles.ayahText}>{ayahText}</div>
        )}

        {/* Reference */}
        <div className={styles.ref}>
          سورة {surahName} — الآية {toAr(daily.ayah)}
        </div>

        {/* Translation */}
        {translation && (
          <div className={styles.translation}>
            "{translation}"
          </div>
        )}

        {/* Actions */}
        <div className={styles.cardActions}>
          <button className={styles.actionBtn} onClick={copyAyah}>
            {copied ? '✅ تم النسخ' : '📋 نسخ'}
          </button>
          <button className={`${styles.actionBtn} ${isSaved ? styles.actionBtnSaved : ''}`}
            onClick={toggleSave}>
            {isSaved ? '🔖 محفوظة' : '🔖 حفظ'}
          </button>
          <button className={styles.actionBtn}
            onClick={() => navigate(`/reader?surah=${daily.surah}&ayah=${daily.ayah}`)}>
            📖 اقرأ في السياق
          </button>
          <button className={`${styles.actionBtn} ${showTafsir ? styles.actionBtnActive : ''}`}
            onClick={loadTafsir}>
            💡 تفسير
          </button>
        </div>

        {/* Tafsir */}
        {showTafsir && (
          <div className={styles.tafsirBox}>
            {loadingTafsir
              ? <div className={styles.spinner} />
              : <p>{tafsir || 'لا يوجد تفسير'}</p>}
          </div>
        )}
      </div>

      {/* Navigation between featured */}
      <div className={styles.navRow}>
        <div className={styles.navLabel}>الآيات المميزة</div>
        <div className={styles.navDots}>
          {(() => {
            // نعرض نافذة من ١٠ نقاط تحتوي دائماً على آية اليوم + عدّاد
            const activeIdx = getDailyIndex();
            const winStart = Math.floor(activeIdx / 10) * 10;
            return (
              <>
                {FEATURED_AYAHS.slice(winStart, winStart + 10).map((a, i) => (
                  <div key={winStart + i}
                    className={`${styles.dot} ${winStart + i === activeIdx ? styles.dotActive : ''}`} />
                ))}
                <span className={styles.dotMore}>{toAr(activeIdx + 1)} / {toAr(FEATURED_AYAHS.length)}</span>
              </>
            );
          })()}
        </div>
      </div>

      {/* Saved ayahs */}
      {savedAyahs.length > 0 && (
        <div className={styles.savedSection}>
          <h3 className={styles.savedTitle}>🔖 الآيات المحفوظة ({toAr(savedAyahs.length)})</h3>
          <div className={styles.savedList}>
            {savedAyahs.slice().reverse().map((a, i) => (
              <div key={i} className={styles.savedRow}
                onClick={() => navigate(`/reader?surah=${a.surah}&ayah=${a.ayah}`)}>
                <div className={styles.savedText}>{a.text?.slice(0, 60)}...</div>
                <div className={styles.savedRef}>سورة {a.surahName} · الآية {toAr(a.ayah)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Verse of the day ────────────────────────────────────────────────────────
// One ayah from FEATURED_AYAHS each day (the home page imports getDailyAyah),
// framed like an illuminated page, with the muyassar tafsir underneath.
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import { PageHero, Icon, Badge8, Corners, Pattern, Divider, AyahMark, toAr } from '../components/ornaments/Ornaments';
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
export function getDailyAyah() {
  return FEATURED_AYAHS[getDailyIndex()];
}

const SAVED_KEY = 'nq_saved_ayahs';
const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function hijriToday() {
  try { return new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { return ''; }
}
const cleanText = s => String(s || '').replace(/^﻿/, '');

export default function DailyAyahPage() {
  const daily = useMemo(getDailyAyah, []);
  const dailyIdx = useMemo(getDailyIndex, []);
  const [ayahText,    setAyahText]    = useState('');
  const [translation, setTranslation] = useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [copied,      setCopied]      = useState(false);
  const [tafsir,      setTafsir]      = useState('');
  const [tafsirState, setTafsirState] = useState('loading'); // loading | ready | error
  const [savedAyahs,  setSavedAyahs]  = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });

  const surahMeta = SURAHS_META[daily.surah - 1];
  const surahName = surahMeta?.[0] || '';
  const isSaved = savedAyahs.some(a => a.surah === daily.surah && a.ayah === daily.ayah);
  const readerUrl = `/reader?surah=${daily.surah}&ayah=${daily.ayah}`;

  // Ayah text + English meaning
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.all([
      fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}`).then(r => r.json()),
      fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}/en.sahih`).then(r => r.json()).catch(() => null),
    ]).then(([ar, en]) => {
      if (!alive) return;
      const txt = cleanText(ar?.data?.text);
      if (!txt) throw new Error('empty');
      setAyahText(txt);
      setTranslation(en?.data?.text || '');
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setError('تعذّر تحميل نص الآية. تحقّق من اتصالك ثم أعد المحاولة.');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [daily.surah, daily.ayah]);

  // التفسير الميسر (وليس نص المصحف)
  useEffect(() => {
    let alive = true;
    setTafsirState('loading');
    fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}/ar.muyassar`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { if (!alive) return; const t = d?.data?.text || ''; setTafsir(t); setTafsirState(t ? 'ready' : 'error'); })
      .catch(() => { if (alive) setTafsirState('error'); });
    return () => { alive = false; };
  }, [daily.surah, daily.ayah]);

  function copyAyah() {
    if (!ayahText) return;
    const text = `${ayahText}\n\n— سورة ${surahName}، الآية ${daily.ayah}`;
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setGlobal({ toast: 'نُسخت الآية مع مرجعها' });
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => setGlobal({ toast: 'تعذّر النسخ' }));
    } catch { setGlobal({ toast: 'تعذّر النسخ' }); }
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
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setGlobal({ toast: isSaved ? 'أُزيلت من الآيات المحفوظة' : 'حُفظت في الآيات المحفوظة' });
  }

  function removeSaved(a) {
    setSavedAyahs(prev => {
      const next = prev.filter(x => !(x.surah === a.surah && x.ayah === a.ayah));
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function shareImage() {
    if (!ayahText) return;
    window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah: daily.surah, ayah: daily.ayah, text: ayahText } }));
  }

  const now = new Date();
  const dateStr = `${DAYS[now.getDay()]}، ${toAr(now.getDate())} ${MONTHS[now.getMonth()]} ${toAr(now.getFullYear())}`;
  const hijri = hijriToday();
  const saved = savedAyahs.slice().reverse();

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="تأمّلٌ كل يوم"
        title="آية اليوم"
        sub="آيةٌ مختارة تتجدّد كل يوم، تقرؤها وتتدبّر معناها، ثم تحملها معك."
      >
        <span className={`nq-pill on ${styles.datePill}`}><Icon name="calendar" />{dateStr}</span>
        {hijri && <span className={`nq-pill ${styles.datePill}`}><Icon name="moon" />{hijri}</span>}
      </PageHero>

      <div className={`nq-wrap ${styles.body}`}>
        {/* ── the framed verse ── */}
        <article className={`nq-card ${styles.frame}`} aria-labelledby="daily-ref">
          <Pattern />
          <Corners />
          <div className={styles.frameIn}>
            <span className={styles.reason}><Badge8 icon="star" size={34} />{daily.reason}</span>

            {loading ? (
              <div className={styles.waitQ} aria-busy="true" aria-label="جارٍ تحميل الآية">
                <span /><span /><span />
              </div>
            ) : error ? (
              <p className={styles.errorText} role="alert"><Icon name="x" />{error}</p>
            ) : (
              <p className={`nq-q ${styles.ayah}`} lang="ar">{ayahText} <AyahMark n={daily.ayah} /></p>
            )}

            <Divider />
            <p id="daily-ref" className={styles.ref}>
              سورة {surahName}
              <span aria-hidden="true">·</span>
              الآية {toAr(daily.ayah)}
              {surahMeta?.[3] && <><span aria-hidden="true">·</span>{surahMeta[3]}</>}
            </p>

            {translation && (
              <blockquote className={styles.translation} lang="en" dir="ltr">
                {translation}
                <small>Saheeh International</small>
              </blockquote>
            )}

            <div className={styles.actions}>
              <Link className="nq-btn gold" to={readerUrl}><Icon name="head" />استمع في المصحف</Link>
              <button type="button" className="nq-btn ghost" onClick={copyAyah} disabled={!ayahText}>
                <Icon name={copied ? 'check' : 'copy'} />{copied ? 'نُسخت' : 'نسخ'}
              </button>
              <button type="button" className={`nq-btn ghost ${isSaved ? styles.on : ''}`} onClick={toggleSave}
                aria-pressed={isSaved} disabled={!ayahText && !isSaved}>
                <Icon name="bookmark" fill={isSaved} />{isSaved ? 'محفوظة' : 'حفظ'}
              </button>
              <button type="button" className="nq-btn ghost" onClick={shareImage} disabled={!ayahText}>
                <Icon name="share" />شارك كصورة
              </button>
            </div>
          </div>
        </article>

        {/* ── tafsir ── */}
        <section className={`nq-card ${styles.tafsir}`} aria-labelledby="daily-tafsir">
          <header className={styles.secHead}>
            <Badge8 icon="doc" />
            <div>
              <span className="nq-eyebrow">في معنى الآية</span>
              <h2 id="daily-tafsir" className={styles.h2}>التفسير الميسّر</h2>
            </div>
          </header>
          {tafsirState === 'loading' && (
            <div className={styles.waitLines} aria-busy="true" aria-label="جارٍ تحميل التفسير"><span /><span /><span /></div>
          )}
          {tafsirState === 'ready' && <p className={styles.tafsirText}>{tafsir}</p>}
          {tafsirState === 'error' && (
            <p className={styles.muted}>تعذّر تحميل التفسير الآن. يمكنك قراءته مع الآية في <Link to={readerUrl} className={styles.link}>المصحف</Link>.</p>
          )}
          <p className={styles.source}>المصدر: التفسير الميسّر — مجمع الملك فهد لطباعة المصحف الشريف.</p>
        </section>

        {/* ── where today's ayah sits among the featured ones ── */}
        <div className={styles.cycle} aria-label={`آية اليوم ${toAr(dailyIdx + 1)} من ${toAr(FEATURED_AYAHS.length)} آية مختارة`}>
          <div className={styles.stars} aria-hidden="true">
            {FEATURED_AYAHS.map((_, i) => (
              <svg key={i} className={`${styles.star} ${i === dailyIdx ? styles.starOn : i < dailyIdx ? styles.starPast : ''}`}>
                <use href={i === dailyIdx ? '#nq-star8f' : '#nq-star8'} />
              </svg>
            ))}
          </div>
          <p className={styles.muted}>
            آية اليوم <b className="nq-num">{toAr(dailyIdx + 1)}</b> من <b className="nq-num">{toAr(FEATURED_AYAHS.length)}</b> آية مختارة، تعود الدورة من أولها بعد آخرها.
          </p>
        </div>

        {/* ── saved ayahs ── */}
        <section className={styles.savedSec} aria-labelledby="daily-saved">
          <div className={styles.savedHead}>
            <h2 id="daily-saved" className="nq-h-sec">الآيات المحفوظة</h2>
            {saved.length > 0 && <span className="nq-pill on nq-num">{toAr(saved.length)}</span>}
          </div>
          {saved.length === 0 ? (
            <div className={`nq-card ${styles.empty}`}>
              <Badge8 icon="bookmark" size={64} />
              <p>احفظ آية اليوم لتجدها هنا متى شئت، مع مرجعها في المصحف.</p>
            </div>
          ) : (
            <ul className={styles.savedList}>
              {saved.map(a => (
                <li key={`${a.surah}:${a.ayah}`} className={`nq-card ${styles.savedItem}`}>
                  <Badge8 size={46}>{toAr(a.surah)}</Badge8>
                  <Link to={`/reader?surah=${a.surah}&ayah=${a.ayah}`} className={styles.savedMain}>
                    <span className={`nq-q ${styles.savedText}`} lang="ar">{cleanText(a.text) || '…'}</span>
                    <span className={styles.savedRef}>سورة {a.surahName || SURAHS_META[a.surah - 1]?.[0]} · الآية {toAr(a.ayah)}</span>
                  </Link>
                  <button type="button" className="nq-ibtn" onClick={() => removeSaved(a)}
                    aria-label={`إزالة الآية ${toAr(a.ayah)} من سورة ${a.surahName || ''} من المحفوظات`}>
                    <Icon name="x" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

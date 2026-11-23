// ─── Verse of the day ────────────────────────────────────────────────────────
// One ayah from FEATURED_AYAHS each day (the home page imports getDailyAyah),
// framed like an illuminated page, with the muyassar tafsir underneath.
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import { PageHero, Icon, Badge8, Corners, Pattern, Divider, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { useTr, trNow, surahName as surahNameOf, revelationLabel, intlLocale } from '../l10n';
import styles from './DailyAyahPage.module.css';

// `reason` is the Arabic source string; it is translated at render time via
// src/locales/library.js (tr(daily.reason)).
export const FEATURED_AYAHS = [
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

function hijriToday(lang) {
  try { return new Intl.DateTimeFormat(`${intlLocale(lang)}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { return ''; }
}
// Gregorian date: the original Arabic wording for ar, Intl for the rest.
function gregorianToday(lang) {
  const now = new Date();
  if (lang === 'ar') return `${DAYS[now.getDay()]}، ${toAr(now.getDate())} ${MONTHS[now.getMonth()]} ${toAr(now.getFullYear())}`;
  try { return toAr(new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)); } catch { return ''; }
}
// Meaning shown under the ayah: the visitor's language where alquran.cloud has
// a translation, Saheeh International otherwise (and for Arabic, as before).
const MEANING = {
  en: { edition: 'en.sahih', label: 'Saheeh International', lang: 'en', dir: 'ltr' },
  tr: { edition: 'tr.diyanet', label: 'Diyanet İşleri', lang: 'tr', dir: 'ltr' },
  fr: { edition: 'fr.hamidullah', label: 'Muhammad Hamidullah', lang: 'fr', dir: 'ltr' },
  ur: { edition: 'ur.jalandhry', label: 'فتح محمد جالندھری', lang: 'ur', dir: 'rtl' },
  id: { edition: 'id.indonesian', label: 'Kementerian Agama RI', lang: 'id', dir: 'ltr' },
};
// Fill {placeholders} in a translated sentence with React nodes.
function withParts(str, parts) {
  return str.split(/(\{\w+\})/).map((p, i) => {
    const k = p.match(/^\{(\w+)\}$/)?.[1];
    return k && parts[k] !== undefined ? <span key={i} style={{ display: 'contents' }}>{parts[k]}</span> : p;
  });
}
const cleanText = s => String(s || '').replace(/^﻿/, '');

export default function DailyAyahPage() {
  const tr = useTr();
  const meaning = MEANING[tr.lang] || MEANING.en;
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
  const surahName = surahMeta?.[0] || '';           // Arabic name (stored with saved ayahs)
  const shownName = surahNameOf(daily.surah, tr.lang) || surahName;
  const isSaved = savedAyahs.some(a => a.surah === daily.surah && a.ayah === daily.ayah);
  const readerUrl = `/reader?surah=${daily.surah}&ayah=${daily.ayah}`;

  // Ayah text + meaning in the visitor's language
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.all([
      fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}`).then(r => r.json()),
      fetch(`https://api.alquran.cloud/v1/ayah/${daily.surah}:${daily.ayah}/${meaning.edition}`).then(r => r.json()).catch(() => null),
    ]).then(([ar, en]) => {
      if (!alive) return;
      const txt = cleanText(ar?.data?.text);
      if (!txt) throw new Error('empty');
      setAyahText(txt);
      setTranslation(en?.data?.text || '');
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setError('load');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [daily.surah, daily.ayah, meaning.edition]);

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
    const text = `${ayahText}\n\n${trNow('— سورة {name}، الآية {n}', { name: shownName, n: daily.ayah })}`;
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setGlobal({ toast: trNow('نُسخت الآية مع مرجعها') });
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => setGlobal({ toast: trNow('تعذّر النسخ') }));
    } catch { setGlobal({ toast: trNow('تعذّر النسخ') }); }
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
    setGlobal({ toast: isSaved ? tr('أُزيلت من الآيات المحفوظة') : tr('حُفظت في الآيات المحفوظة') });
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

  const dateStr = gregorianToday(tr.lang);
  const hijri = hijriToday(tr.lang);
  const saved = savedAyahs.slice().reverse();

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('تأمّلٌ كل يوم')}
        title={tr('آية اليوم')}
        sub={tr('آيةٌ مختارة تتجدّد كل يوم، تقرؤها وتتدبّر معناها.')}
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
            <span className={styles.reason}><Badge8 icon="star" size={34} />{tr(daily.reason)}</span>

            {loading ? (
              <div className={styles.waitQ} aria-busy="true" aria-label={tr('جارٍ تحميل الآية')}>
                <span /><span /><span />
              </div>
            ) : error ? (
              <p className={styles.errorText} role="alert"><Icon name="x" />{tr('تعذّر تحميل نص الآية. تحقّق من اتصالك ثم أعد المحاولة.')}</p>
            ) : (
              <p className={`nq-q ${styles.ayah}`} lang="ar" dir="rtl">{ayahText} <AyahMark n={daily.ayah} /></p>
            )}

            <Divider />
            <p id="daily-ref" className={styles.ref}>
              {tr('سورة {name}', { name: shownName })}
              <span aria-hidden="true">·</span>
              {tr('الآية {n}', { n: toAr(daily.ayah) })}
              {surahMeta?.[3] && <><span aria-hidden="true">·</span>{revelationLabel(surahMeta[3], tr.lang)}</>}
            </p>

            {translation && (
              <blockquote className={styles.translation} lang={meaning.lang} dir={meaning.dir}>
                {translation}
                <small>{meaning.label}</small>
              </blockquote>
            )}

            <div className={styles.actions}>
              <Link className="nq-btn gold" to={readerUrl}><Icon name="head" />{tr('استمع في المصحف')}</Link>
              <button type="button" className="nq-btn ghost" onClick={copyAyah} disabled={!ayahText}>
                <Icon name={copied ? 'check' : 'copy'} />{copied ? tr('نُسخت') : tr('نسخ')}
              </button>
              <button type="button" className={`nq-btn ghost ${isSaved ? styles.on : ''}`} onClick={toggleSave}
                aria-pressed={isSaved} disabled={!ayahText && !isSaved}>
                <Icon name="bookmark" fill={isSaved} />{isSaved ? tr('محفوظة') : tr('حفظ')}
              </button>
              <button type="button" className="nq-btn ghost" onClick={shareImage} disabled={!ayahText}>
                <Icon name="share" />{tr('شارك كصورة')}
              </button>
            </div>
          </div>
        </article>

        {/* ── tafsir ── */}
        <section className={`nq-card ${styles.tafsir}`} aria-labelledby="daily-tafsir">
          <header className={styles.secHead}>
            <Badge8 icon="doc" />
            <div>
              <span className="nq-eyebrow">{tr('في معنى الآية')}</span>
              <h2 id="daily-tafsir" className={styles.h2}>{tr('التفسير الميسّر')}</h2>
            </div>
          </header>
          {tafsirState === 'loading' && (
            <div className={styles.waitLines} aria-busy="true" aria-label={tr('جارٍ تحميل التفسير')}><span /><span /><span /></div>
          )}
          {tafsirState === 'ready' && <p className={styles.tafsirText} lang="ar" dir="rtl">{tafsir}</p>}
          {tafsirState === 'error' && (
            <p className={styles.muted}>{withParts(tr('تعذّر تحميل التفسير الآن. يمكنك قراءته مع الآية في {link}.'), { link: <Link to={readerUrl} className={styles.link}>{tr('المصحف')}</Link> })}</p>
          )}
          <p className={styles.source}>{tr('المصدر: التفسير الميسّر — مجمع الملك فهد لطباعة المصحف الشريف.')}</p>
        </section>

        {/* ── where today's ayah sits among the featured ones ── */}
        <div className={styles.cycle} aria-label={tr('آية اليوم {n} من {total} آية مختارة', { n: toAr(dailyIdx + 1), total: toAr(FEATURED_AYAHS.length) })}>
          <div className={styles.stars} aria-hidden="true">
            {FEATURED_AYAHS.map((_, i) => (
              <svg key={i} className={`${styles.star} ${i === dailyIdx ? styles.starOn : i < dailyIdx ? styles.starPast : ''}`}>
                <use href={i === dailyIdx ? '#nq-star8f' : '#nq-star8'} />
              </svg>
            ))}
          </div>
          <p className={styles.muted}>
            {withParts(tr('آية اليوم {n} من {total} آية مختارة، تعود الدورة من أولها بعد آخرها.'), {
              n: <b className="nq-num">{toAr(dailyIdx + 1)}</b>,
              total: <b className="nq-num">{toAr(FEATURED_AYAHS.length)}</b>,
            })}
          </p>
        </div>

        {/* ── saved ayahs ── */}
        <section className={styles.savedSec} aria-labelledby="daily-saved">
          <div className={styles.savedHead}>
            <h2 id="daily-saved" className="nq-h-sec">{tr('الآيات المحفوظة')}</h2>
            {saved.length > 0 && <span className="nq-pill on nq-num">{toAr(saved.length)}</span>}
          </div>
          {saved.length === 0 ? (
            <div className={`nq-card ${styles.empty}`}>
              <Badge8 icon="bookmark" size={64} />
              <p>{tr('احفظ آية اليوم لتجدها هنا متى شئت، مع مرجعها في المصحف.')}</p>
            </div>
          ) : (
            <ul className={styles.savedList}>
              {saved.map(a => (
                <li key={`${a.surah}:${a.ayah}`} className={`nq-card ${styles.savedItem}`}>
                  <Badge8 size={46}>{toAr(a.surah)}</Badge8>
                  <Link to={`/reader?surah=${a.surah}&ayah=${a.ayah}`} className={styles.savedMain}>
                    <span className={`nq-q ${styles.savedText}`} lang="ar" dir="rtl">{cleanText(a.text) || '…'}</span>
                    <span className={styles.savedRef}>{tr('سورة {name}', { name: (tr.lang === 'ar' && a.surahName) || surahNameOf(a.surah, tr.lang) || a.surahName })} · {tr('الآية {n}', { n: toAr(a.ayah) })}</span>
                  </Link>
                  <button type="button" className="nq-ibtn" onClick={() => removeSaved(a)}
                    aria-label={tr('إزالة الآية {n} من سورة {name} من المحفوظات', { n: toAr(a.ayah), name: (tr.lang === 'ar' ? a.surahName : surahNameOf(a.surah, tr.lang)) || '' })}>
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

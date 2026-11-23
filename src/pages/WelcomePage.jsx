// ─── Home ────────────────────────────────────────────────────────────────────
// Mihrab hero with the ayah ﴿قد جاءكم من الله نور وكتاب مبين﴾, live prayer bar,
// verse of the day, every feature, the surah index and the group khatma.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './WelcomePage.module.css';
import { Icon, Badge8, Pattern, Frieze, Divider, Shamsa, Corners, Rosette, AyahMark, toAr } from '../components/ornaments/Ornaments';
import { openPalette } from '../components/shell/Shell';
import { visibleGroups, featureText } from '../features';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { useAuth } from '../hooks/useAuth';
import { useStore } from '../store';
import { useLang } from '../i18n';
import { useTr, num, surahName, revelationLabel, intlLocale, isRtl } from '../l10n';
import { SURAHS_META } from '../data';
import { normalizeArabic } from '../arabic';
import { fetchAyahWithTafsir } from '../api';
import { savedCity, loadTodayTimes, cityNow, nextPrayer, fmt12, PRAYER_NAMES, PRAYER_ORDER } from '../prayerToday';
import { getDailyAyah } from './DailyAyahPage';

// Home "bento": which features get a card, and which are wide.
const BENTO = [
  { key: 'reader', wide: true, stat: ['{s} سورة · {a} آية', { s: 114, a: 6236 }], desc: 'المصحف كاملاً بالرسم العثماني، آية بآية مع ترجمة إن شئت، وتفاسير معتمدة ومعاني الكلمات.' },
  { key: 'listen', desc: '١٦ قارئاً من كبار القرّاء، مع تظليل الآية أثناء التلاوة وتكرار المقطع للحفظ.' },
  { key: 'prayer', desc: 'مواقيت دقيقة لمدينتك بطريقة الحساب المعتمدة في بلدك، وتنبيه بالأذان.' },
  { key: 'hifz', desc: 'خريطة لحفظك، وورد يومي، ومراجعة لما حفظت حتى لا يتفلّت.' },
  { key: 'qibla', desc: 'اتجاه الكعبة المشرّفة من موقعك بالدرجة.' },
  { key: 'group', wide: true, stat: ['{j} جزءاً · {h} حزباً', { j: 30, h: 60 }], desc: 'اجمع أهلك وأحبابك على ختمة واحدة تُهدى لروح من تحب. وزّعوا الأجزاء، وتابعوا التقدّم معاً.' },
  { key: 'adhkar', desc: 'أذكار الصباح والمساء والنوم وبعد الصلاة.' },
  { key: 'tasbih', desc: 'عدّاد تسبيح بأهداف يومية وجلسات.' },
  { key: 'radio', desc: 'إذاعات القرآن الكريم، بث مباشر.' },
  { key: 'search', desc: 'ابحث في الآيات بلا تشكيل، أو باسم السورة، أو برقم الآية.' },
];

// decorative rosette for the group-khatma card (not real data)
const DECOR = Array.from({ length: 30 }, (_, i) => (i < 19 ? 'done' : i < 24 ? 'taken' : 'free'));

export default function WelcomePage() {
  const lang = useLang();
  const tr = useTr();
  const [state] = useStore();
  const settings = usePublicSettings();
  const { user } = useAuth();
  const groups = useMemo(() => visibleGroups(settings, user), [settings, user]);
  const byKey = useMemo(() => Object.fromEntries(groups.flatMap(g => g.items).map(i => [i.key, i])), [groups]);

  const s = state.currentSurah || 1, a = state.currentAyah || 1;
  const hasProgress = !(s === 1 && a === 1);

  return (
    <div className={styles.home}>
      {/* ── hero ── */}
      <section className={styles.hero} aria-labelledby="home-ayah">
        <Pattern />
        <div className={styles.rays} aria-hidden="true" />
        <Shamsa className={styles.shamsa} />
        <svg className={styles.arch} viewBox="0 0 760 700" preserveAspectRatio="none" aria-hidden="true">
          <path d="M20 700V300C20 175 210 70 380 20 550 70 740 175 740 300V700Z M40 700V306C40 190 220 92 380 44 540 92 720 190 720 306V700Z" fill="url(#nq-girih)" fillRule="evenodd" opacity=".9" />
          <path d="M20 700V300C20 175 210 70 380 20 550 70 740 175 740 300V700" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M40 700V306C40 190 220 92 380 44 540 92 720 190 720 306V700" fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="1" />
          <path d="M64 700V314C64 206 232 116 380 74 528 116 696 206 696 314V700" fill="none" stroke="currentColor" strokeOpacity=".28" strokeWidth="1" />
        </svg>
        <Frieze className={styles.heroFrieze} />
        <div className={`nq-wrap ${styles.heroWrap}`}>
          <div className={styles.heroIn}>
            <h1 id="home-ayah" className={styles.qh} lang="ar">﴿قَدْ جَاءَكُم مِّنَ ٱللَّهِ نُورٌ وَكِتَٰبٌ مُّبِينٌ﴾</h1>
            <p className={styles.qref}><span lang="ar">سورة المائدة · ١٥</span>{lang !== 'ar' && <> · {tr('{name} {s}:{a}', { name: surahName(5), s: num(5), a: num(15) })}</>}</p>
            <p className={`nq-lead ${styles.heroLead}`}>{tr('اقرأ المصحف بالرسم العثماني، واستمع لكبار القرّاء، واحفظ بخطة تناسبك. مواقيت الصلاة والقبلة والأذكار في مكان واحد.')}</p>
            <div className={styles.ctas}>
              <Link className="nq-btn gold" to={hasProgress ? `/reader?surah=${s}&ayah=${a}` : '/reader?surah=1&ayah=1'}>
                <Icon name="book" />{tr('ابدأ القراءة')}
              </Link>
              {hasProgress && (
                <Link className="nq-btn ghost" to={`/reader?surah=${s}&ayah=${a}`}>
                  {tr('تابع: {name} · الآية {n}', { name: surahName(s), n: num(a) })}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── prayer bar + search ── */}
      <div className={`nq-wrap ${styles.prayerbar}`}>
        <PrayerBar />
        <button type="button" className={styles.searchbox} onClick={openPalette}>
          <Icon name="search" style={{ color: 'var(--gold)' }} />
          <span>{tr('ابحث عن سورة أو ميزة، أو اكتب رقم آية مثل ٢:٢٥٥')}</span>
          <span className="nq-kbd">/</span>
        </button>
      </div>

      {/* ── verse of the day ── */}
      <div className={`nq-wrap ${styles.sec}`}>
        <DailyAyah />
      </div>

      {/* ── features ── */}
      <section className={`nq-wrap ${styles.sec}`} aria-labelledby="home-feats">
        <div className={styles.secHead}>
          <Divider />
          <h2 id="home-feats" className="nq-h-sec">{tr('كل ما يعينك على صحبة القرآن')}</h2>
          <p className="nq-lead">{tr('أدوات مصمّمة باحترام للنص، تعمل على الجوال والحاسوب، وتتبع وضع جهازك الليلي والنهاري.')}</p>
        </div>
        <div className={styles.bento}>
          {BENTO.filter(b => byKey[b.key]).map(b => {
            const it = byKey[b.key];
            const t = featureText(it, lang);
            return (
              <Link key={b.key} to={it.path} className={`nq-card ${styles.feat} ${b.wide ? styles.wide : ''}`}>
                {b.wide && <Pattern />}
                <Badge8 icon={it.icon} />
                <h3>{t.title}</h3>
                <p>{tr(b.desc)}</p>
                {b.stat && <span className={`nq-num ${styles.stat}`}>{tr(b.stat[0], Object.fromEntries(Object.entries(b.stat[1]).map(([k, v]) => [k, num(v)])))}</span>}
              </Link>
            );
          })}
        </div>
        <div className={styles.more}>
          <Link to="/docs" className="nq-btn ghost"><Icon name="grid" />{tr('كل المميزات')}</Link>
        </div>
      </section>

      {/* ── surah index ── */}
      <SurahIndex />

      {/* ── group khatma ── */}
      {byKey.group && (
        <section className={`nq-wrap ${styles.sec}`}>
          <div className={`nq-card ${styles.soul}`}>
            <Pattern />
            <div className={styles.soulText}>
              <span className="nq-eyebrow">{tr('الختمة الجماعية')}</span>
              <h2 className="nq-h-sec">{tr('ختمةٌ واحدة، وقلوبٌ كثيرة')}</h2>
              <p className="nq-lead">{tr('أنشئ ختمة لروح من فقدت، وشارك رابطها مع أهلك وأحبابك. كل من يقرأ جزءاً يظهر في الوردة، حتى تكتمل الختمة ويُرفع الدعاء.')}</p>
              <div><Link className="nq-btn gold" to="/khatma-group"><Icon name="users" />{tr('ابدأ ختمة جماعية')}</Link></div>
            </div>
            <div className={styles.soulRose}>
              <Rosette states={DECOR} label={tr('مثال لوردة الختمة الجماعية')} hideCount style={{ width: 'min(300px,100%)', height: 'auto' }} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── live prayer bar ─────────────────────────────────────────────────────────
function hijriToday() {
  try { return new Intl.DateTimeFormat(`${intlLocale()}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { return ''; }
}

function PrayerBar() {
  const tr = useTr();
  const city = useMemo(savedCity, []);
  const [times, setTimes] = useState(null);
  const [now, setNow] = useState(() => cityNow(city?.tz).secs);
  useEffect(() => {
    if (!city) return;
    let alive = true;
    loadTodayTimes(city).then(t => { if (alive) setTimes(t); });
    const id = setInterval(() => setNow(cityNow(city.tz).secs), 1000);
    return () => { alive = false; clearInterval(id); };
  }, [city]);

  if (!city) {
    return (
      <div className={`nq-card ${styles.pb} ${styles.pbEmpty}`}>
        <Badge8 icon="mosque" />
        <div>
          <b className={styles.pbTitle}>{tr('مواقيت الصلاة في مدينتك')}</b>
          <small className={styles.pbSmall}>{hijriToday()} · {tr('حدّد مدينتك مرة واحدة، وتظهر المواقيت هنا كل يوم.')}</small>
        </div>
        <Link to="/prayer-times" className="nq-btn gold sm"><Icon name="pin" />{tr('حدّد مدينتك')}</Link>
      </div>
    );
  }

  const nx = times ? nextPrayer(times, now) : null;
  const pad = n => String(n).padStart(2, '0');
  const cd = nx ? toAr(`${pad(Math.floor(nx.left / 3600))}:${pad(Math.floor(nx.left % 3600 / 60))}:${pad(nx.left % 60)}`) : '--:--:--';
  return (
    <Link to="/prayer-times" className={`nq-card ${styles.pb}`} aria-label={tr('مواقيت الصلاة اليوم')}>
      <div className={styles.pbNext}>
        <small><Icon name="pin" style={{ width: '1em', height: '1em' }} /> {city.name || tr('مدينتك')} · {hijriToday()}</small>
        <b>{tr('الصلاة القادمة: {name}', { name: nx ? tr(PRAYER_NAMES[nx.key]) : '…' })}</b>
      </div>
      <div className={styles.pbRow}>
        {PRAYER_ORDER.map(k => {
          const f = times ? fmt12(times[k]) : { t: '--:--' };
          const isNext = nx && nx.key === k;
          const past = times && !isNext && !nx?.tomorrow && times[k] && (+times[k].slice(0, 2) * 3600 + +times[k].slice(3, 5) * 60) < now;
          return (
            <div key={k} className={`${isNext ? styles.now : ''} ${past ? styles.past : ''}`}>
              {tr(PRAYER_NAMES[k])}<b className="nq-num">{toAr(f.t)}</b>
            </div>
          );
        })}
      </div>
      <div className={styles.pbNext} style={{ textAlign: 'end' }}>
        <small>{tr('متبقٍّ')}</small>
        <div className={`nq-num ${styles.cd}`} aria-live="off">{cd}</div>
      </div>
    </Link>
  );
}

// ── verse of the day ────────────────────────────────────────────────────────
function DailyAyah() {
  const navigate = useNavigate();
  const tr = useTr();
  const d = useMemo(getDailyAyah, []);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAyahWithTafsir(d.surah, d.ayah).then(r => { if (alive) setText(r.text); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [d]);
  return (
    <div className={`nq-card ${styles.daily}`}>
      <Corners />
      <span className="nq-eyebrow">{tr('آية اليوم')}</span>
      {text
        ? <p className={`nq-q ${styles.dailyQ}`} lang="ar">{text.replace(/^﻿/, '')} <AyahMark n={d.ayah} /></p>
        : <p className={`nq-q ${styles.dailyQ} ${styles.dailyWait}`} lang="ar">{failed ? d.reason : '…'}</p>}
      <p className={styles.dailyRef}>{tr('سورة {name} · الآية {n}', { name: surahName(d.surah), n: num(d.ayah) })}</p>
      <div className={styles.dailyActs}>
        <button type="button" className="nq-btn ghost sm" onClick={() => navigate(`/reader?surah=${d.surah}&ayah=${d.ayah}`)}><Icon name="book" />{tr('اقرأ في المصحف')}</button>
        <Link className="nq-btn ghost sm" to="/daily-ayah"><Icon name="doc" />{tr('التفسير')}</Link>
        {text && (
          <button type="button" className="nq-btn ghost sm"
            onClick={() => window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah: d.surah, ayah: d.ayah, text } }))}>
            <Icon name="share" />{tr('شارك كصورة')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── surah index ─────────────────────────────────────────────────────────────
function SurahIndex() {
  const navigate = useNavigate();
  const tr = useTr();
  const rtl = isRtl(tr.lang);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const nq = normalizeArabic(q.trim());
    const qn = +q.trim().replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x));
    return SURAHS_META.map((m, i) => ({ m, n: i + 1 })).filter(({ m, n }) =>
      (filter === 'all' || m[3] === filter) &&
      (!nq || normalizeArabic(m[0]).includes(nq) || m[1].toLowerCase().includes(q.trim().toLowerCase()) || qn === n));
  }, [filter, q]);
  const shown = all || q ? list : list.slice(0, 24);
  return (
    <section className={`nq-wrap ${styles.sec}`} aria-labelledby="home-index">
      <div className={styles.secHead}>
        <Divider />
        <h2 id="home-index" className="nq-h-sec">{tr('فهرس السور')}</h2>
        <p className="nq-lead">{tr('{s} سورة · {a} آية', { s: num(114), a: num(6236) })}</p>
      </div>
      <div className={styles.indexTools}>
        <div className="nq-seg" role="group" aria-label={tr('تصفية السور')}>
          {[['all', tr('الكل')], ['مكية', revelationLabel('مكية')], ['مدنية', revelationLabel('مدنية')]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <label className={`nq-input ${styles.miniSearch}`}>
          <Icon name="search" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('اسم السورة أو رقمها')} aria-label={tr('ابحث عن سورة')} />
        </label>
      </div>
      <div className={styles.surahs}>
        {shown.map(({ m, n }) => (
          <button key={n} type="button" className={`nq-card ${styles.sura}`} onClick={() => navigate(`/reader?surah=${n}&ayah=1`)}>
            <Badge8 size={46}>{toAr(n)}</Badge8>
            <span>
              <span className={styles.suraName}>{surahName(n)}</span>
              <span className={styles.suraMeta}>{revelationLabel(m[3])} · {tr('{n} آية', { n: num(m[2]) })}</span>
            </span>
            {rtl ? <span className={styles.suraEn}>{m[1]}</span> : <span className={styles.suraEn} lang="ar" dir="rtl">{m[0]}</span>}
          </button>
        ))}
        {shown.length === 0 && <p style={{ color: 'var(--muted)' }}>{tr('لا توجد سورة بهذا الاسم.')}</p>}
      </div>
      {!all && !q && list.length > 24 && (
        <div className={styles.more}><button type="button" className="nq-btn ghost" onClick={() => setAll(true)}>{tr('عرض كل السور')}</button></div>
      )}
    </section>
  );
}

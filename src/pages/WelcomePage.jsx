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
import { SURAHS_META } from '../data';
import { normalizeArabic } from '../arabic';
import { fetchAyahWithTafsir } from '../api';
import { savedCity, loadTodayTimes, cityNow, nextPrayer, fmt12, PRAYER_NAMES, PRAYER_ORDER } from '../prayerToday';
import { getDailyAyah } from './DailyAyahPage';

const UI = {
  ar: { lead: 'اقرأ المصحف بالرسم العثماني، واستمع لكبار القرّاء، واحفظ بخطة تناسبك. مواقيت الصلاة والقبلة والأذكار في مكان واحد.', start: 'ابدأ القراءة', cont: 'تابع' },
  en: { lead: 'Read the Mushaf in Uthmani script, listen to renowned reciters and memorise at your own pace — with prayer times, qibla and adhkar in one place.', start: 'Start reading', cont: 'Continue' },
  tr: { lead: "Mushaf'ı Osmanlı hattıyla okuyun, büyük kârileri dinleyin ve kendi planınızla ezberleyin. Namaz vakitleri, kıble ve zikirler tek yerde.", start: 'Okumaya başla', cont: 'Devam et' },
  fr: { lead: "Lisez le Mushaf en écriture uthmanie, écoutez les grands récitateurs et mémorisez à votre rythme — heures de prière, qibla et adhkar au même endroit.", start: 'Commencer la lecture', cont: 'Continuer' },
  ur: { lead: 'عثمانی رسم الخط میں مصحف پڑھیں، بڑے قاریوں کو سنیں اور اپنے منصوبے سے حفظ کریں۔ نماز کے اوقات، قبلہ اور اذکار ایک جگہ۔', start: 'پڑھنا شروع کریں', cont: 'جاری رکھیں' },
  id: { lead: 'Baca Mushaf dengan rasm Utsmani, dengarkan para qari ternama, dan hafalkan sesuai rencana Anda — jadwal salat, kiblat, dan dzikir di satu tempat.', start: 'Mulai membaca', cont: 'Lanjutkan' },
};

// Home "bento": which features get a card, and which are wide.
const BENTO = [
  { key: 'reader', wide: true, stat: '١١٤ سورة · ٦٢٣٦ آية', desc: 'المصحف كاملاً بالرسم العثماني، آية بآية مع ترجمة إن شئت، وتفاسير معتمدة ومعاني الكلمات.' },
  { key: 'listen', desc: '١٦ قارئاً من كبار القرّاء، مع تظليل الآية أثناء التلاوة وتكرار المقطع للحفظ.' },
  { key: 'prayer', desc: 'مواقيت دقيقة لمدينتك بطريقة الحساب المعتمدة في بلدك، وتنبيه بالأذان.' },
  { key: 'hifz', desc: 'خريطة لحفظك، وورد يومي، ومراجعة لما حفظت حتى لا يتفلّت.' },
  { key: 'qibla', desc: 'اتجاه الكعبة المشرّفة من موقعك بالدرجة.' },
  { key: 'group', wide: true, stat: '٣٠ جزءاً · ٦٠ حزباً', desc: 'اجمع أهلك وأحبابك على ختمة واحدة تُهدى لروح من تحب. وزّعوا الأجزاء، وتابعوا التقدّم معاً.' },
  { key: 'adhkar', desc: 'أذكار الصباح والمساء والنوم وبعد الصلاة.' },
  { key: 'tasbih', desc: 'عدّاد تسبيح بأهداف يومية وجلسات.' },
  { key: 'radio', desc: 'إذاعات القرآن الكريم، بث مباشر.' },
  { key: 'search', desc: 'ابحث في الآيات بلا تشكيل، أو باسم السورة، أو برقم الآية.' },
];

// decorative rosette for the group-khatma card (not real data)
const DECOR = Array.from({ length: 30 }, (_, i) => (i < 19 ? 'done' : i < 24 ? 'taken' : 'free'));

export default function WelcomePage() {
  const lang = useLang();
  const ui = UI[lang] || UI.ar;
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
            <p className={styles.qref}>سورة المائدة · ١٥</p>
            <p className={`nq-lead ${styles.heroLead}`}>{ui.lead}</p>
            <div className={styles.ctas}>
              <Link className="nq-btn gold" to={hasProgress ? `/reader?surah=${s}&ayah=${a}` : '/reader?surah=1&ayah=1'}>
                <Icon name="book" />{ui.start}
              </Link>
              {hasProgress && (
                <Link className="nq-btn ghost" to={`/reader?surah=${s}&ayah=${a}`}>
                  {ui.cont}: {SURAHS_META[s - 1]?.[0]} · الآية {toAr(a)}
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
          <span>ابحث عن سورة أو ميزة، أو اكتب رقم آية مثل ٢:٢٥٥</span>
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
          <h2 id="home-feats" className="nq-h-sec">كل ما يعينك على صحبة القرآن</h2>
          <p className="nq-lead">أدوات مصمّمة باحترام للنص، تعمل على الجوال والحاسوب، وتتبع وضع جهازك الليلي والنهاري.</p>
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
                <p>{lang === 'ar' ? b.desc : t.desc}</p>
                {b.stat && <span className={`nq-num ${styles.stat}`}>{b.stat}</span>}
              </Link>
            );
          })}
        </div>
        <div className={styles.more}>
          <Link to="/docs" className="nq-btn ghost"><Icon name="grid" />كل المميزات</Link>
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
              <span className="nq-eyebrow">الختمة الجماعية</span>
              <h2 className="nq-h-sec">ختمةٌ واحدة، وقلوبٌ كثيرة</h2>
              <p className="nq-lead">أنشئ ختمة لروح من فقدت، وشارك رابطها مع أهلك وأحبابك. كل من يقرأ جزءاً يظهر في الوردة، حتى تكتمل الختمة ويُرفع الدعاء.</p>
              <div><Link className="nq-btn gold" to="/khatma-group"><Icon name="users" />ابدأ ختمة جماعية</Link></div>
            </div>
            <div className={styles.soulRose}>
              <Rosette states={DECOR} label="مثال لوردة الختمة الجماعية" hideCount style={{ width: 'min(300px,100%)', height: 'auto' }} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── live prayer bar ─────────────────────────────────────────────────────────
function hijriToday() {
  try { return new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { return ''; }
}

function PrayerBar() {
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
          <b className={styles.pbTitle}>مواقيت الصلاة في مدينتك</b>
          <small className={styles.pbSmall}>{hijriToday()} · حدّد مدينتك مرة واحدة، وتظهر المواقيت هنا كل يوم.</small>
        </div>
        <Link to="/prayer-times" className="nq-btn gold sm"><Icon name="pin" />حدّد مدينتك</Link>
      </div>
    );
  }

  const nx = times ? nextPrayer(times, now) : null;
  const pad = n => String(n).padStart(2, '0');
  const cd = nx ? toAr(`${pad(Math.floor(nx.left / 3600))}:${pad(Math.floor(nx.left % 3600 / 60))}:${pad(nx.left % 60)}`) : '--:--:--';
  return (
    <Link to="/prayer-times" className={`nq-card ${styles.pb}`} aria-label="مواقيت الصلاة اليوم">
      <div className={styles.pbNext}>
        <small><Icon name="pin" style={{ width: '1em', height: '1em' }} /> {city.name || 'مدينتك'} · {hijriToday()}</small>
        <b>الصلاة القادمة: {nx ? PRAYER_NAMES[nx.key] : '…'}</b>
      </div>
      <div className={styles.pbRow}>
        {PRAYER_ORDER.map(k => {
          const f = times ? fmt12(times[k]) : { t: '--:--' };
          const isNext = nx && nx.key === k;
          const past = times && !isNext && !nx?.tomorrow && times[k] && (+times[k].slice(0, 2) * 3600 + +times[k].slice(3, 5) * 60) < now;
          return (
            <div key={k} className={`${isNext ? styles.now : ''} ${past ? styles.past : ''}`}>
              {PRAYER_NAMES[k]}<b className="nq-num">{toAr(f.t)}</b>
            </div>
          );
        })}
      </div>
      <div className={styles.pbNext} style={{ textAlign: 'end' }}>
        <small>متبقٍّ</small>
        <div className={`nq-num ${styles.cd}`} aria-live="off">{cd}</div>
      </div>
    </Link>
  );
}

// ── verse of the day ────────────────────────────────────────────────────────
function DailyAyah() {
  const navigate = useNavigate();
  const d = useMemo(getDailyAyah, []);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAyahWithTafsir(d.surah, d.ayah).then(r => { if (alive) setText(r.text); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [d]);
  const name = SURAHS_META[d.surah - 1][0];
  return (
    <div className={`nq-card ${styles.daily}`}>
      <Corners />
      <span className="nq-eyebrow">آية اليوم</span>
      {text
        ? <p className={`nq-q ${styles.dailyQ}`} lang="ar">{text.replace(/^﻿/, '')} <AyahMark n={d.ayah} /></p>
        : <p className={`nq-q ${styles.dailyQ} ${styles.dailyWait}`}>{failed ? d.reason : '…'}</p>}
      <p className={styles.dailyRef}>سورة {name} · الآية {toAr(d.ayah)}</p>
      <div className={styles.dailyActs}>
        <button type="button" className="nq-btn ghost sm" onClick={() => navigate(`/reader?surah=${d.surah}&ayah=${d.ayah}`)}><Icon name="book" />اقرأ في المصحف</button>
        <Link className="nq-btn ghost sm" to="/daily-ayah"><Icon name="doc" />التفسير</Link>
        {text && (
          <button type="button" className="nq-btn ghost sm"
            onClick={() => window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah: d.surah, ayah: d.ayah, text } }))}>
            <Icon name="share" />شارك كصورة
          </button>
        )}
      </div>
    </div>
  );
}

// ── surah index ─────────────────────────────────────────────────────────────
function SurahIndex() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const nq = normalizeArabic(q.trim());
    const num = +q.trim().replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x));
    return SURAHS_META.map((m, i) => ({ m, n: i + 1 })).filter(({ m, n }) =>
      (filter === 'all' || m[3] === filter) &&
      (!nq || normalizeArabic(m[0]).includes(nq) || m[1].toLowerCase().includes(q.trim().toLowerCase()) || num === n));
  }, [filter, q]);
  const shown = all || q ? list : list.slice(0, 24);
  return (
    <section className={`nq-wrap ${styles.sec}`} aria-labelledby="home-index">
      <div className={styles.secHead}>
        <Divider />
        <h2 id="home-index" className="nq-h-sec">فهرس السور</h2>
        <p className="nq-lead">١١٤ سورة · ٦٢٣٦ آية</p>
      </div>
      <div className={styles.indexTools}>
        <div className="nq-seg" role="group" aria-label="تصفية السور">
          {[['all', 'الكل'], ['مكية', 'مكية'], ['مدنية', 'مدنية']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <label className={`nq-input ${styles.miniSearch}`}>
          <Icon name="search" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="اسم السورة أو رقمها" aria-label="ابحث عن سورة" />
        </label>
      </div>
      <div className={styles.surahs}>
        {shown.map(({ m, n }) => (
          <button key={n} type="button" className={`nq-card ${styles.sura}`} onClick={() => navigate(`/reader?surah=${n}&ayah=1`)}>
            <Badge8 size={46}>{toAr(n)}</Badge8>
            <span>
              <span className={styles.suraName}>{m[0]}</span>
              <span className={styles.suraMeta}>{m[3]} · {toAr(m[2])} آية</span>
            </span>
            <span className={styles.suraEn}>{m[1]}</span>
          </button>
        ))}
        {shown.length === 0 && <p style={{ color: 'var(--muted)' }}>لا توجد سورة بهذا الاسم.</p>}
      </div>
      {!all && !q && list.length > 24 && (
        <div className={styles.more}><button type="button" className="nq-btn ghost" onClick={() => setAll(true)}>عرض كل السور</button></div>
      )}
    </section>
  );
}

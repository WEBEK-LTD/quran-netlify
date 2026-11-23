// ─── Leaderboard ─────────────────────────────────────────────────────────────
// GET /leaderboard?type=reading|hifz|khatma&period=week|month|all → top 50 of
// the users who opted in (show_on_leaderboard). Podium for the top three, then
// a ranked list with a bar relative to the leader.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getLeaderboard, errorMessage } from '../backend';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';
import { num, surahName, intlLocale, isRtl } from '../l10n';
import { useHifzTr, hifzTrNow } from '../locales/hifz';
import styles from './LeaderboardPage.module.css';

const PERIODS = [
  { id: 'week',  label: 'هذا الأسبوع' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'all',   label: 'كل الأوقات' },
];

const TABS = [
  { id: 'reading', label: 'الأكثر قراءة', icon: 'book',   unit: '{n} آية' },
  { id: 'hifz',    label: 'الأكثر حفظاً', icon: 'star',   unit: '{n} سورة' },
  { id: 'khatma',  label: 'أكثر الختمات', icon: 'beads',  unit: '{n} ختمة' },
];

// Grouped number in the visitor's language (Arabic keeps ١٬٢٣٤)
const fmt = n => (isRtl()
  ? toAr((n || 0).toLocaleString('en-US').replace(/,/g, '٬'))
  : num((n || 0).toLocaleString(intlLocale()).replace(/\u202f/g, '\u00a0')));
// Arabic reference line, plus a transliterated reference in LTR languages
const ayahRefLine = (ar, s, a) => (isRtl() ? ar : `${ar} — ${surahName(s)} ${s}:${a}`);

function initials(name) {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '؟';
  return (w[0][0] + (w[1]?.[0] || '')).slice(0, 2);
}

export default function LeaderboardPage() {
  const tr = useHifzTr();
  const { user } = useAuth();
  const [tab, setTab]       = useState('reading');
  const [period, setPeriod] = useState('week');
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  const activeTab = TABS.find(tk => tk.id === tab);
  // The unit key is a '{n} …' template: split it around the number so the number can be bold
  const [uPre, uPost] = tr(activeTab.unit, { n: '\u0000' }).split('\u0000');
  const score = n => <>{uPre}<b className="nq-num">{fmt(n)}</b>{uPost}</>;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadErr('');
    setData([]);
    getLeaderboard(tab, period)
      .then(rows => { if (alive) setData(rows || []); })
      .catch(e => { if (alive) setLoadErr(errorMessage(e, hifzTrNow('حدث خطأ أثناء الاتصال بالخادم، حاول مجدداً لاحقاً.'))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, period, user?.id]);

  const myRow  = data.find(r => r.is_me);
  const myRank = myRow ? (myRow.rank || data.indexOf(myRow) + 1) : null;
  const hasPodium = data.length >= 3;
  const top = Math.max(1, ...data.map(r => r.score || 0));

  // podium order on screen (RTL): 1st in the middle, 2nd to its right, 3rd to its left
  const podium = hasPodium ? [
    { row: data[1], rank: 2, cls: styles.p2 },
    { row: data[0], rank: 1, cls: styles.p1 },
    { row: data[2], rank: 3, cls: styles.p3 },
  ] : [];

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('المتصدرون')}
        title={tr('لوحة المتصدرين')}
        ayah="وَفِى ذَٰلِكَ فَلْيَتَنَافَسِ ٱلْمُتَنَٰفِسُونَ"
        ayahRef={ayahRefLine('سورة المطففين · ٢٦', 83, 26)}
        sub={tr('أبرز القرّاء والحفّاظ في مجتمع نور القرآن، تنافسٌ في الخير.')}
      />

      <div className="nq-wrap">
        {/* ── filters ── */}
        <div className={styles.filters}>
          <div className={styles.typeTabs} role="group" aria-label={tr('نوع الترتيب')}>
            {TABS.map(tk => (
              <button key={tk.id} type="button" className={styles.typeTab} aria-pressed={tab === tk.id} onClick={() => setTab(tk.id)}>
                <Icon name={tk.icon} />{tr(tk.label)}
              </button>
            ))}
          </div>
          <div className="nq-seg" role="group" aria-label={tr('الفترة')}>
            {PERIODS.map(p => (
              <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{tr(p.label)}</button>
            ))}
          </div>
        </div>

        <p className={styles.optin}>
          <Icon name="shield" />
          <span>
            {tr('تظهر هنا أسماء من اختاروا الظهور في لوحة المتصدرين فقط.')}{' '}
            {user
              ? (user.show_on_leaderboard
                  ? <>{tr('اسمك ظاهر، ويمكنك إخفاؤه من')} <Link to="/settings">{tr('الإعدادات')}</Link>.</>
                  : <>{tr('اسمك مخفي، ويمكنك إظهاره من')} <Link to="/settings">{tr('الإعدادات')}</Link>.</>)
              : <><Link to="/login">{tr('سجّل الدخول')}</Link> {tr('ثم فعّل الظهور من الإعدادات لتشارك.')}</>}
          </span>
        </p>

        {myRank && (
          <div className={`nq-card ${styles.mine}`}>
            <Badge8 size={52}>{toAr(myRank)}</Badge8>
            <div>
              <span className={styles.mineLbl}>{tr('ترتيبك الحالي')}</span>
              <b className={styles.mineName}>{myRow.name || tr('أنت')}</b>
            </div>
            <span className={styles.mineScore}>{score(myRow.score)}</span>
          </div>
        )}

        {loading && (
          <div className={styles.loading} aria-busy="true" aria-label={tr('جارٍ التحميل')}>
            {[...Array(5)].map((_, i) => <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 80}ms` }} />)}
          </div>
        )}

        {!loading && loadErr && (
          <div className={`nq-card ${styles.empty}`}>
            <Badge8 icon="x" size={58} />
            <p className={styles.emptyT}>{tr('تعذّر تحميل قائمة المتصدرين')}</p>
            <p className={styles.muted}>{loadErr}</p>
          </div>
        )}

        {!loading && !loadErr && data.length === 0 && (
          <div className={`nq-card ${styles.empty}`}>
            <Badge8 icon="trophy" size={58} />
            <p className={styles.emptyT}>{tr('لا توجد بيانات بعد')}</p>
            <p className={styles.muted}>{tr('كن أول المتصدرين. ابدأ القراءة في المصحف، وستظهر هنا تلقائياً.')}</p>
            <Link className="nq-btn gold sm" to="/reader"><Icon name="book" />{tr('افتح المصحف')}</Link>
          </div>
        )}

        {!loading && data.length > 0 && (
          <>
            {hasPodium && (
              <ol className={styles.podium} aria-label={tr('المراكز الثلاثة الأولى')}>
                {podium.map(({ row, rank, cls }) => (
                  <li key={rank} className={`${styles.pItem} ${cls} ${row?.is_me ? styles.pMe : ''}`}>
                    <span className="nq-sr">{tr('المركز {n}:', { n: toAr(rank) })} </span>
                    <span className={styles.avatar} aria-hidden="true">{initials(row?.name)}</span>
                    <b className={styles.pName}><bdi>{row?.name || tr('مجهول')}</bdi>{row?.is_me ? ` ${tr('(أنت)')}` : ''}</b>
                    <span className={styles.pScore}>{score(row?.score)}</span>
                    <div className={styles.plinth}>
                      <Badge8 size={rank === 1 ? 64 : 52}>{toAr(rank)}</Badge8>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <ol className={`nq-card ${styles.list}`} start={hasPodium ? 4 : 1}>
              {data.slice(hasPodium ? 3 : 0).map((row, i) => {
                const rank = row.rank || i + (hasPodium ? 4 : 1);
                const isMe = !!row.is_me;
                return (
                  <li key={rank} className={`${styles.row} ${isMe ? styles.rowMe : ''}`}>
                    <Badge8 size={42}>{toAr(rank)}</Badge8>
                    <span className={styles.avatarSm} aria-hidden="true">{initials(row.name)}</span>
                    <span className={styles.rowInfo}>
                      <span className={styles.rowName}><bdi>{row.name || tr('مجهول')}</bdi>{isMe ? ` ${tr('(أنت)')}` : ''}</span>
                      <span className={styles.rowBar} aria-hidden="true"><i style={{ width: `${Math.max(3, ((row.score || 0) / top) * 100)}%` }} /></span>
                    </span>
                    <span className={styles.rowScore}>{uPre.trim() && <small>{uPre.trim()}</small>}<b className="nq-num">{fmt(row.score)}</b><small>{uPost.trim()}</small></span>
                  </li>
                );
              })}
              {hasPodium && data.length === 3 && <li className={styles.rowNone}>{tr('لا أحد بعد المراكز الثلاثة الأولى.')}</li>}
            </ol>
          </>
        )}

        <p className={styles.foot}>{tr('الترتيب مبنيّ على نشاط المستخدمين المسجّلين خلال الفترة المختارة، ويعرض أفضل {n}.', { n: toAr(50) })}</p>
      </div>
    </div>
  );
}

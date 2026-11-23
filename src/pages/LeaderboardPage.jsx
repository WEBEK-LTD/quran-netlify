import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getLeaderboard, errorMessage } from '../backend';
import styles from './LeaderboardPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

const PERIODS = [
  { id: 'week',  label: 'أسبوع' },
  { id: 'month', label: 'شهر' },
  { id: 'all',   label: 'الكل' },
];

// TABS defined inside component (uses t() hook)

const MEDALS = ['🥇','🥈','🥉'];

function Avatar({ name, rank }) {
  const initials = name ? name.trim().split(' ').map(w => w[0]).join('').slice(0,2) : '؟';
  const colors = ['#52b788','#c9a84c','#60a5fa','#f97316','#fb7185','#a78bfa','#34d399','#38bdf8'];
  const bg = colors[(name || '').length % colors.length];
  return (
    <div className={styles.avatar} style={{ background: bg + '22', border: `2px solid ${bg}44` }}>
      <span style={{ color: bg }}>{rank <= 3 ? MEDALS[rank-1] : initials}</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const t = useT();
  const dir = useDir();

  const TABS = [
    { id: 'reading', label: t('mostReading'), icon: '📖', unit: t('ayahs'),  color: '#52b788' },
    { id: 'hifz',    label: t('mostHifz'),    icon: '📚', unit: t('surahs'), color: '#c9a84c' },
    { id: 'khatma',  label: t('mostKhatma'),  icon: '📿', unit: t('khatmas'),color: '#f97316' },
  ];
  const { user } = useAuth();
  const [tab, setTab]       = useState('reading');
  const [period, setPeriod] = useState('week');
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  const activeTab = TABS.find(tk => tk.id === tab);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadErr('');
    setData([]);
    getLeaderboard(tab, period)
      .then(rows => { if (alive) setData(rows || []); })
      .catch(e => { if (alive) setLoadErr(errorMessage(e, 'حدث خطأ أثناء الاتصال بالخادم — حاول مجدداً لاحقاً.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, period, user?.id]);

  const myRow  = data.find(r => r.is_me);
  const myRank = myRow ? (myRow.rank || data.indexOf(myRow) + 1) : null;
  const hasPodium = data.length >= 3;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('leaderboardTitle')}</h1>
        <LangSwitcher compact={true} />
        <div style={{ width: 60 }} />
      </div>

      <p className={styles.subtitle}>أبرز القراء والحفّاظ في مجتمع نور القرآن</p>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(tk => (
          <button key={tk.id}
            className={`${styles.tabBtn} ${tab === tk.id ? styles.tabActive : ''}`}
            style={{ '--c': tk.color }}
            onClick={() => setTab(tk.id)}>
            {tk.icon} {tk.label}
          </button>
        ))}
      </div>

      {/* Period */}
      <div className={styles.tabs} style={{ marginTop: -4 }}>
        {PERIODS.map(p => (
          <button key={p.id}
            className={`${styles.tabBtn} ${period === p.id ? styles.tabActive : ''}`}
            style={{ '--c': 'var(--gold)' }}
            onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <p className={styles.note} style={{ marginTop: 0 }}>
        🔒 تظهر هنا فقط أسماء من اختاروا الظهور في لوحة المتصدرين.{' '}
        {user
          ? (user.show_on_leaderboard
              ? <>اسمك ظاهر — يمكنك إخفاؤه من <Link to="/settings" style={{ color: 'var(--gold)' }}>الإعدادات</Link>.</>
              : <>اسمك مخفي — يمكنك إظهاره من <Link to="/settings" style={{ color: 'var(--gold)' }}>الإعدادات</Link>.</>)
          : <><Link to="/login" style={{ color: 'var(--gold)' }}>سجّل الدخول</Link> ثم فعّل الظهور من الإعدادات لتنافس.</>}
      </p>

      {/* My rank banner */}
      {myRank && (
        <div className={styles.myRankBanner}>
          <span className={styles.myRankIcon}>👤</span>
          <span>{t('yourRank')}: <strong>#{myRank}</strong> </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingBox}>
          {[...Array(5)].map((_,i) => (
            <div key={i} className={styles.skeleton} style={{ animationDelay: `${i*80}ms` }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && loadErr && (
        <div className={styles.emptyBox}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>تعذّر تحميل قائمة المتصدرين</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.8 }}>
            {loadErr}
          </p>
        </div>
      )}

      {/* Empty */}
      {!loading && !loadErr && data.length === 0 && (
        <div className={styles.emptyBox}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>لا توجد بيانات بعد</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.8 }}>
            {t('beFirst')} 🌟<br/>
            {t('startReadingLB')} <a href="/reader" style={{ color: 'var(--gold)' }}>صفحة القارئ</a> وستظهر هنا تلقائياً.
          </p>
        </div>
      )}

      {/* Leaderboard list */}
      {!loading && data.length > 0 && (
        <div className={styles.list}>
          {/* Top 3 podium */}
          {hasPodium && (
            <div className={styles.podium}>
              {/* 2nd */}
              <div className={styles.podiumItem} style={{ '--c': '#94a3b8' }}>
                <Avatar name={data[1]?.name} rank={2} />
                <div className={styles.podiumName}>{data[1]?.name || 'مجهول'}</div>
                <div className={styles.podiumScore}>{(data[1]?.score||0).toLocaleString('ar')} {activeTab.unit}</div>
                <div className={styles.podiumBase} style={{ height: 60 }}>🥈</div>
              </div>
              {/* 1st */}
              <div className={`${styles.podiumItem} ${styles.podiumFirst}`} style={{ '--c': '#c9a84c' }}>
                <div className={styles.crownAnim}>👑</div>
                <Avatar name={data[0]?.name} rank={1} />
                <div className={styles.podiumName}>{data[0]?.name || 'مجهول'}</div>
                <div className={styles.podiumScore}>{(data[0]?.score||0).toLocaleString('ar')} {activeTab.unit}</div>
                <div className={styles.podiumBase} style={{ height: 80 }}>🥇</div>
              </div>
              {/* 3rd */}
              <div className={styles.podiumItem} style={{ '--c': '#c97c3a' }}>
                <Avatar name={data[2]?.name} rank={3} />
                <div className={styles.podiumName}>{data[2]?.name || 'مجهول'}</div>
                <div className={styles.podiumScore}>{(data[2]?.score||0).toLocaleString('ar')} {activeTab.unit}</div>
                <div className={styles.podiumBase} style={{ height: 45 }}>🥉</div>
              </div>
            </div>
          )}

          {/* Rest of the list (4th onwards — or everyone when fewer than 3) */}
          {data.slice(hasPodium ? 3 : 0).map((row, i) => {
            const rank = row.rank || i + (hasPodium ? 4 : 1);
            const isMe = !!row.is_me;
            return (
              <div key={rank} className={`${styles.row} ${isMe ? styles.rowMe : ''}`}>
                <div className={styles.rowRank}>#{rank}</div>
                <Avatar name={row.name} rank={rank} />
                <div className={styles.rowInfo}>
                  <span className={styles.rowName}>{row.name || 'مجهول'}{isMe ? ' (أنت)' : ''}</span>
                  <span className={styles.rowSub}>{activeTab.icon} {(row.score||0).toLocaleString('ar')} {activeTab.unit}</span>
                </div>
                <div className={styles.rowScore} style={{ color: activeTab.color }}>
                  {(row.score||0).toLocaleString('ar')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className={styles.note}>* الترتيب مبني على نشاط المستخدمين المسجّلين خلال الفترة المختارة (أفضل ٥٠)</p>
    </div>
  );
}

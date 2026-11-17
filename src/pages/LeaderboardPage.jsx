import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isConfigured } from '../supabase';

// import shared client helper (same session = RLS works correctly)
async function getSharedSb() {
  const url  = import.meta.env.VITE_SUPABASE_URL       || '';
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY  || '';
  if (!url || url.includes('placeholder')) return null;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return createClient(url, anon, {
    auth: { persistSession: true, storageKey: 'nq_sb_auth', storage: window.localStorage },
  });
}
import styles from './LeaderboardPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchLeaderboard(type) {
  const sb = await getSharedSb();
  if (!sb) return { data: [], err: 'Supabase غير متصل — تأكد من ENV variables في Netlify' };
  const fnMap = { reading: 'leaderboard_reading', hifz: 'leaderboard_hifz', khatma: 'leaderboard_khatma' };
  const fn = fnMap[type];
  if (!fn) return { data: [], err: null };
  const { data, error } = await sb.rpc(fn);
  if (error) {
    console.error('[Leaderboard]', error.message);
    return { data: [], err: error.message };
  }
  return { data: data || [], err: null };
}

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
  const configured = isConfigured();
  const [tab, setTab]       = useState('reading');
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [myRank, setMyRank]   = useState(null);

  const activeTab = TABS.find(tk => tk.id === tab);

  useEffect(() => {
    if (!configured) return;
    setLoading(true);
    setData([]);
    fetchLeaderboard(tab).then(({ data: rows, err }) => {
      setData(rows);
      if (err) console.warn('[Leaderboard error]', err);
      if (user) {
        const idx = rows.findIndex(r => r.user_id === user.id);
        setMyRank(idx >= 0 ? idx + 1 : null);
      }
      setLoading(false);
    });
  }, [tab, configured]);

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

      {/* My rank banner */}
      {myRank && (
        <div className={styles.myRankBanner}>
          <span className={styles.myRankIcon}>👤</span>
          <span>{t('yourRank')}: <strong>#{myRank}</strong> </span>
        </div>
      )}

      {/* Not configured */}
      {!configured && (
        <div className={styles.emptyBox}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔌</div>
          <p>{t('leaderboardTitle')} — Supabase</p>
          <Link to="/docs" className={styles.docsLink}>اعرف كيف ←</Link>
        </div>
      )}

      {/* Loading */}
      {configured && loading && (
        <div className={styles.loadingBox}>
          {[...Array(5)].map((_,i) => (
            <div key={i} className={styles.skeleton} style={{ animationDelay: `${i*80}ms` }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {configured && !loading && data.length === 0 && (
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
      {configured && !loading && data.length > 0 && (
        <div className={styles.list}>
          {/* Top 3 podium */}
          {data.length >= 3 && (
            <div className={styles.podium}>
              {/* 2nd */}
              <div className={styles.podiumItem} style={{ '--c': '#94a3b8' }}>
                <Avatar name={data[1]?.display_name} rank={2} />
                <div className={styles.podiumName}>{data[1]?.display_name || 'مجهول'}</div>
                <div className={styles.podiumScore}>{(data[1]?.score||0).toLocaleString('ar')} {activeTab.unit}</div>
                <div className={styles.podiumBase} style={{ height: 60 }}>🥈</div>
              </div>
              {/* 1st */}
              <div className={`${styles.podiumItem} ${styles.podiumFirst}`} style={{ '--c': '#c9a84c' }}>
                <div className={styles.crownAnim}>👑</div>
                <Avatar name={data[0]?.display_name} rank={1} />
                <div className={styles.podiumName}>{data[0]?.display_name || 'مجهول'}</div>
                <div className={styles.podiumScore}>{(data[0]?.score||0).toLocaleString('ar')} {activeTab.unit}</div>
                <div className={styles.podiumBase} style={{ height: 80 }}>🥇</div>
              </div>
              {/* 3rd */}
              <div className={styles.podiumItem} style={{ '--c': '#c97c3a' }}>
                <Avatar name={data[2]?.display_name} rank={3} />
                <div className={styles.podiumName}>{data[2]?.display_name || 'مجهول'}</div>
                <div className={styles.podiumScore}>{(data[2]?.score||0).toLocaleString('ar')} {activeTab.unit}</div>
                <div className={styles.podiumBase} style={{ height: 45 }}>🥉</div>
              </div>
            </div>
          )}

          {/* Rest of the list (4th onwards) */}
          {data.slice(3).map((row, i) => {
            const rank = i + 4;
            const isMe = user && row.user_id === user.id;
            return (
              <div key={rank} className={`${styles.row} ${isMe ? styles.rowMe : ''}`}>
                <div className={styles.rowRank}>#{rank}</div>
                <Avatar name={row.display_name} rank={rank} />
                <div className={styles.rowInfo}>
                  <span className={styles.rowName}>{row.display_name || 'مجهول'}{isMe ? ' (أنت)' : ''}</span>
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

      <p className={styles.note}>* يُحدَّث المتصدرون كل 24 ساعة بناءً على نشاط المستخدمين المسجّلين</p>
    </div>
  );
}

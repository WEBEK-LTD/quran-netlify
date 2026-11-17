import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStore, setGlobal } from '../store';
import { SURAHS_META } from '../data';
import { useAuth } from '../hooks/useAuth';
import { signOut } from '../supabase';
import InstallPWA from './InstallPWA';
import styles from './Header.module.css';
import LangSwitcher from './LangSwitcher';

export default function Header() {
  const [state] = useStore();
  const { user } = useAuth();
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const inputRef = useRef(null);

  function handleSearch(q) {
    setQuery(q);
    if (!q.trim()) { setResults([]); setShowResults(false); return; }
    const m = /^(\d+):(\d+)$/.exec(q.trim());
    if (m) {
      const s = parseInt(m[1]), a = parseInt(m[2]);
      if (s >= 1 && s <= 114) { setResults([{ type: 'goto', surah: s, ayah: a }]); setShowResults(true); return; }
    }
    const found = SURAHS_META
      .map((meta, i) => ({ meta, num: i + 1 }))
      .filter(({ meta }) => meta[0].includes(q) || meta[1].toLowerCase().includes(q.toLowerCase()))
      .slice(0, 7);
    setResults(found.map(f => ({ type: 'surah', ...f })));
    setShowResults(found.length > 0);
  }

  function selectResult(r) {
    setShowResults(false); setQuery('');
    if (r.type === 'surah') setGlobal({ currentSurah: r.num, currentAyah: 1 });
    else setGlobal({ currentSurah: r.surah, currentAyah: r.ayah, scrollToAyah: r.ayah });
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
  const avatarUrl   = user?.user_metadata?.avatar_url || null;

  return (
    <header className={styles.header}>
      <button className={styles.iconBtn}
        onClick={() => setGlobal({ sidebarOpen: !state.sidebarOpen })} title="قائمة السور">
        ☰
      </button>

      <div className={styles.logo}>نور القرآن<span>القرآن الكريم</span></div>
      <LangSwitcher compact={true} />
      <div className={styles.spacer} />

      {/* Search — full bar on desktop, icon on mobile */}
      <div className={`${styles.searchWrap} ${searchOpen ? styles.searchWrapOpen : ''}`}>
        {/* Mobile search icon */}
        <button className={`${styles.searchIconBtn} ${searchOpen ? styles.searchIconBtnHide : ''}`}
          onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}>
          🔍
        </button>
        {/* Search input */}
        <div className={`${styles.searchBar} ${searchOpen ? styles.searchBarVisible : ''} ${showResults ? styles.searchFocused : ''}`}>
          <span className={styles.searchIcon}>🔍</span>
          <input ref={inputRef} type="text" placeholder="ابحث... أو اكتب مثل 2:255"
            value={query} onChange={e => handleSearch(e.target.value)}
            onFocus={() => query && setShowResults(true)}
            onBlur={() => { if (!query) { setShowResults(false); setSearchOpen(false); } }}
            onKeyDown={e => { if (e.key === 'Escape') { setShowResults(false); setSearchOpen(false); setQuery(''); } }} dir="rtl" />
          {searchOpen && (
            <button className={styles.searchClose}
              onClick={() => { setSearchOpen(false); setQuery(''); setShowResults(false); }}>✕</button>
          )}
        </div>
        {showResults && (
          <div className={styles.dropdown}>
            {results.map((r, i) => (
              <div key={i} className={styles.dropItem} onClick={() => selectResult(r)}>
                {r.type === 'goto' ? (
                  <><span className={styles.dropRef}>انتقل إلى</span>
                    <span className={styles.dropName}>سورة {SURAHS_META[r.surah-1][0]} — الآية {r.ayah}</span></>
                ) : (
                  <><span className={styles.dropRef}>سورة {r.num} • {r.meta[3]} • {r.meta[2]} آية</span>
                    <span className={styles.dropName}>{r.meta[0]}</span></>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <InstallPWA />

      {/* Theme */}
      <button className={styles.iconBtn} onClick={() => {
        const next = !state.darkMode;
        setGlobal({ darkMode: next });
        document.body.classList.toggle('light', !next);
        localStorage.setItem('nq_theme', next ? 'dark' : 'light');
      }} title="تبديل الوضع">
        {state.darkMode ? '🌙' : '☀️'}
      </button>

      {/* Audio */}
      <button className={styles.iconBtn}
        onClick={() => setGlobal({ showAudio: !state.showAudio })} title="تشغيل التلاوة">
        🎧
      </button>

      {/* User menu */}
      <div className={styles.userWrap}>
        <button className={`${styles.iconBtn} ${styles.userBtn}`}
          onClick={() => setShowUserMenu(m => !m)} title="القائمة">
          {user
            ? (avatarUrl
                ? <img src={avatarUrl} alt="" className={styles.avatar} />
                : <span className={styles.avatarInitial}>{displayName[0]?.toUpperCase()}</span>)
            : '☰'}
        </button>
        {showUserMenu && (
          <div className={styles.userMenu}>
            {user ? (
              <>
                <div className={styles.userInfo}>
                  <strong>{displayName}</strong>
                  <small>{user.email}</small>
                </div>
                <Link to="/dashboard" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📊 لوحة التحكم</Link>
                <Link to="/hifz"      className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📚 نظام الحفظ</Link>
                <Link to="/khatma"    className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📿 ختماتي</Link>
                <Link to="/khatma-group" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🕌 الختمات الجماعية</Link>
                <Link to="/notes"     className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📝 ملاحظاتي</Link>
                <Link to="/favorites" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🔖 المفضلة</Link>
                <Link to="/search"       className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🔍 البحث</Link>
                <Link to="/leaderboard"  className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🏆 المتصدرون</Link>
                <Link to="/support"   className={styles.menuItem} onClick={() => setShowUserMenu(false)}>💬 الدعم والمساعدة</Link>
                <Link to="/ijaza"        className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📜 الإجازة والقراءات</Link>
                <Link to="/reader"        className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📖 القرآن الكريم</Link>
                <Link to="/radio"        className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📻 الراديو الإسلامي</Link>
                <Link to="/prayer-times" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🕌 أوقات الصلاة</Link>
                <Link to="/qibla"        className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🧭 اتجاه القبلة</Link>
                <Link to="/adhkar"       className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📿 الأذكار والأدعية</Link>
                <Link to="/tasbih"       className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📿 السبحة الإلكترونية</Link>
                <Link to="/daily-ayah"   className={styles.menuItem} onClick={() => setShowUserMenu(false)}>✨ آية اليوم</Link>
                <Link to="/report"       className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📊 التقرير الشهري</Link>
                <Link to="/settings"  className={styles.menuItem} onClick={() => setShowUserMenu(false)}>⚙️ الإعدادات</Link>
                <div className={styles.menuDivider} />
                <button className={`${styles.menuItem} ${styles.menuSignOut}`}
                  onClick={async () => { await signOut(); setShowUserMenu(false); }}>
                  تسجيل الخروج
                </button>
              </>
            ) : (
              <>
                <Link to="/login"    className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🔑 تسجيل الدخول</Link>
                <Link to="/signup"   className={styles.menuItem} onClick={() => setShowUserMenu(false)}>✨ إنشاء حساب</Link>
                <Link to="/hifz"     className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📚 نظام الحفظ</Link>
                <Link to="/khatma"   className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📿 ختماتي</Link>
                <Link to="/khatma-group" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🕌 الختمات الجماعية</Link>
                <Link to="/notes"    className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📝 ملاحظاتي</Link>
                <Link to="/search"       className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🔍 البحث</Link>
                <Link to="/leaderboard"  className={styles.menuItem} onClick={() => setShowUserMenu(false)}>🏆 المتصدرون</Link>
                <Link to="/support"   className={styles.menuItem} onClick={() => setShowUserMenu(false)}>💬 الدعم والمساعدة</Link>
                <Link to="/ijaza"        className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📜 الإجازة والقراءات</Link>
                <Link to="/reader"        className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📖 القرآن الكريم</Link>
                <Link to="/settings" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>⚙️ الإعدادات</Link>
                <Link to="/welcome"  className={styles.menuItem} onClick={() => { localStorage.removeItem("nq_welcomed"); sessionStorage.removeItem("nq_session_welcomed"); setShowUserMenu(false); }}>✦ الصفحة الرئيسية</Link>
                <Link to="/help"     className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📘 شرح الاستخدام</Link>
                <Link to="/docs"     className={styles.menuItem} onClick={() => setShowUserMenu(false)}>📄 دليل المميزات</Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

import { Link, useLocation } from 'react-router-dom';
import styles from './BottomNav.module.css';
import LangSwitcher from './LangSwitcher';

const TABS = [
  { path: '/reader',      icon: '📖', label: 'قراءة'  },
  { path: '/prayer-times',icon: '🕌', label: 'صلاة'   },
  { path: '/tasbih',      icon: '📿', label: 'سبحة'   },
  { path: '/daily-ayah',  icon: '✨', label: 'آية'    },
  { path: '/dashboard',   icon: '📊', label: 'لوحتي'  },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className={styles.nav}>
      {TABS.map(tab => (
        <Link key={tab.path} to={tab.path}
          className={`${styles.tab} ${pathname === tab.path ? styles.active : ''}`}>
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
          {pathname === tab.path && <span className={styles.indicator} />}
        </Link>
      ))}
      <div className={styles.langWrap}><LangSwitcher compact={true} /></div>
</nav>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { loadBookmarks, syncBookmarks } from '../supabase';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import styles from './FavoritesPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function FavoritesPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      loadBookmarks(user.id)
        .then(bkm => { setBookmarks(bkm.length ? bkm : JSON.parse(localStorage.getItem('nq_bookmarks') || '[]')); setLoading(false); })
        .catch(() => { setBookmarks(JSON.parse(localStorage.getItem('nq_bookmarks') || '[]')); setLoading(false); });
    } else {
      setBookmarks(JSON.parse(localStorage.getItem('nq_bookmarks') || '[]'));
      setLoading(false);
    }
  }, [user, authLoading]);

  function goToAyah(surah, ayah) {
    setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
    navigate('/');
  }

  async function removeBookmark(surah, ayah) {
    const next = bookmarks.filter(b => !(b.surah === surah && b.ayah === ayah));
    setBookmarks(next);
    localStorage.setItem('nq_bookmarks', JSON.stringify(next));
    setGlobal({ bookmarks: next });
    if (user) await syncBookmarks(user.id, next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>🔖 {t('favoritesTitle')}</h1>
        <LangSwitcher compact={true} />
      </div>

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : bookmarks.length === 0 ? (
        <div className={styles.empty}>
          <span>🔖</span>
          <p>{t('noFavorites')}</p>
          <small>{t('addFromReader')}</small>
          <Link to="/" className={styles.goRead}>{t('startReading')}</Link>
        </div>
      ) : (
        <>
          <p className={styles.count}>{bookmarks.length} آية محفوظة</p>
          <div className={styles.list}>
            {bookmarks.map((b, i) => {
              const meta = SURAHS_META[b.surah - 1];
              return (
                <div key={i} className={styles.card}>
                  <div className={styles.cardInfo} onClick={() => goToAyah(b.surah, b.ayah)}>
                    <div className={styles.surahBadge}>{b.surah}</div>
                    <div>
                      <div className={styles.surahName}>{meta?.[0]}</div>
                      <div className={styles.ayahRef}>الآية {b.ayah} • {meta?.[3]}</div>
                    </div>
                    <div className={styles.cardRef}>{b.surah}:{b.ayah}</div>
                  </div>
                  <div className={styles.cardActions}>
                    <button className={styles.actionBtn} onClick={() => goToAyah(b.surah, b.ayah)}>📖 اذهب للآية</button>
                    <button className={`${styles.actionBtn} ${styles.removeBtn}`}
                      onClick={() => removeBookmark(b.surah, b.ayah)}>🗑️ حذف</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

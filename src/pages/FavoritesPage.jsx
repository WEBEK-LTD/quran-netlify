import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { loadBookmarks, syncBookmarks } from '../supabase';
import { SURAHS_META } from '../data';
import { setGlobal } from '../store';
import styles from './FavoritesPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem('nq_bookmarks') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem('nq_bookmarks', JSON.stringify(list)); } catch {}
}
const bkKey = b => `${b.surah}:${b.ayah}`;

// دمج المحلي مع المحفوظ على الحساب (بدون تكرار) — حتى لا تختفي المحفوظات المحلية
function mergeBookmarks(server, local) {
  const map = new Map();
  for (const b of [...(server || []), ...(local || [])]) {
    if (!b || !b.surah || !b.ayah) continue;
    const k = bkKey(b);
    if (!map.has(k)) map.set(k, b);
  }
  return [...map.values()];
}

export default function FavoritesPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const local = readLocal();
    if (user) {
      loadBookmarks(user.id)
        .then(server => {
          if (cancelled) return;
          const merged = mergeBookmarks(server, local);
          setBookmarks(merged);
          writeLocal(merged);
          setGlobal({ bookmarks: merged });
          // ارفع المحفوظات المحلية التي لم تصل للحساب بعد
          if (merged.length !== (server || []).length) {
            syncBookmarks(user.id, merged).catch(() => {});
          }
          setLoading(false);
        })
        .catch(() => { if (!cancelled) { setBookmarks(local); setLoading(false); } });
    } else {
      setBookmarks(local);
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [user, authLoading]);

  function goToAyah(surah, ayah) {
    setGlobal({ currentSurah: surah, currentAyah: ayah, scrollToAyah: ayah });
    navigate('/reader');
  }

  async function removeBookmark(surah, ayah) {
    const drop = b => !(b.surah === surah && b.ayah === ayah);
    const next = bookmarks.filter(drop);
    setBookmarks(next);
    // المحلي قد يحتوي عناصر أُضيفت من القارئ بعد فتح الصفحة — نحذف منه العنصر فقط
    const localNext = mergeBookmarks(next, readLocal().filter(drop));
    writeLocal(localNext);
    setGlobal({ bookmarks: localNext });
    setSyncError('');
    if (user) {
      const ok = await syncBookmarks(user.id, localNext).catch(() => false);
      if (ok === false) setSyncError('تعذّرت مزامنة الحذف مع حسابك — حُذفت من هذا الجهاز فقط');
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/reader" className={styles.backBtn}>{t('back')}</Link>
        <h1>🔖 {t('favoritesTitle')}</h1>
        <LangSwitcher compact={true} />
      </div>

      {syncError && (
        <p role="alert" style={{ color: '#f87171', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>⚠️ {syncError}</p>
      )}

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : bookmarks.length === 0 ? (
        <div className={styles.empty}>
          <span>🔖</span>
          <p>{t('noFavorites')}</p>
          <small>{t('addFromReader')}</small>
          <Link to="/reader" className={styles.goRead}>{t('startReading')}</Link>
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

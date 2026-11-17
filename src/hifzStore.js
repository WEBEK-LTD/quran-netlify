import { useState, useEffect, useRef } from 'react';
import { SURAH_AYAH_COUNT, TOTAL_AYAHS, ACHIEVEMENTS } from './hifzData';
import { syncHifzToCloud, loadHifzFromCloud } from './supabase';

const KEY = 'nq_hifz';

function getDefault() {
  return {
    // surahStatus: { [surahNum]: 'none' | 'inProgress' | 'completed' | 'review' }
    surahStatus: {},
    // dailyWard: { surah, startAyah, endAyah, ayahCount }
    dailyWard: null,
    wardHistory: [],   // array of { date, completed, wardAyahs }
    streak: 0,
    lastWardDate: null,
    unlockedAchievements: [],
    notes: {},  // { [surah:ayah]: string }
  };
}

export function loadHifz() {
  try {
    return { ...getDefault(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return getDefault(); }
}

export function saveHifz(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
// Internal: debounce timer ref (module level)
let _syncTimer = null;
export function saveHifzAndSync(data, userId) {
  localStorage.setItem(KEY, JSON.stringify(data));
  if (!userId) return;
  // Debounce: sync to cloud 3 seconds after last change
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => syncHifzToCloud(userId, data), 3000);
}

export function useHifz(userId = null) {
  const [hifz, setHifzState] = useState(loadHifz);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // Load from cloud on mount (merge: cloud wins if newer)
  useEffect(() => {
    if (!userId || cloudLoaded) return;
    loadHifzFromCloud(userId).then(cloudData => {
      if (!cloudData) return;
      setCloudLoaded(true);
      const local = loadHifz();
      const localTime = local.updatedAt || 0;
      const cloudTime = cloudData.updated_at || 0;
      // Use cloud data if newer
      if (cloudTime > localTime) {
        const merged = { ...local, ...cloudData.data, updatedAt: cloudTime };
        saveHifz(merged);
        setHifzState(merged);
      }
    }).catch(() => {});
  }, [userId]);

  function update(updates) {
    setHifzState(prev => {
      const next = { ...prev, ...updates, updatedAt: new Date().toISOString() };
      saveHifzAndSync(next, userId);
      return next;
    });
  }

  // ── Surah status ──────────────────────────────────────────────────────────
  function setSurahStatus(surahNum, status) {
    const surahStatus = { ...hifz.surahStatus, [surahNum]: status };
    update({ surahStatus });
    checkAchievements({ ...hifz, surahStatus });
  }

  // ── Daily ward ────────────────────────────────────────────────────────────
  function setDailyWard(ward) {
    update({ dailyWard: ward });
  }

  function markWardDone() {
    const today = new Date().toISOString().split('T')[0];
    if (hifz.lastWardDate === today) return; // already done today

    const history = [
      ...hifz.wardHistory,
      { date: today, completed: true, wardAyahs: hifz.dailyWard?.ayahCount || 0 }
    ].slice(-90); // keep 90 days

    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const newStreak = (hifz.lastWardDate === yStr || hifz.lastWardDate === today)
      ? hifz.streak + 1 : 1;

    update({ wardHistory: history, lastWardDate: today, streak: newStreak });
    checkAchievements({ ...hifz, streak: newStreak, wardHistory: history });
  }

  // ── Achievements ──────────────────────────────────────────────────────────
  function checkAchievements(data) {
    const completedSurahs = Object.values(data.surahStatus || {})
      .filter(s => s === 'completed').length;
    const memorizedAyahs = Object.entries(data.surahStatus || {})
      .filter(([,s]) => s === 'completed')
      .reduce((acc, [num]) => acc + (SURAH_AYAH_COUNT[parseInt(num) - 1] || 0), 0);
    const wardDays = (data.wardHistory || []).filter(h => h.completed).length;

    const stats = { completedSurahs, memorizedAyahs, streak: data.streak || 0, wardDays };
    const current = data.unlockedAchievements || [];
    const newUnlocked = ACHIEVEMENTS
      .filter(a => !current.includes(a.id) && a.condition(stats))
      .map(a => a.id);

    if (newUnlocked.length > 0) {
      update({ unlockedAchievements: [...current, ...newUnlocked] });
    }
    return newUnlocked;
  }

  // ── Computed stats ────────────────────────────────────────────────────────
  const completedSurahs = Object.values(hifz.surahStatus)
    .filter(s => s === 'completed').length;

  const inProgressSurahs = Object.values(hifz.surahStatus)
    .filter(s => s === 'inProgress').length;

  const memorizedAyahs = Object.entries(hifz.surahStatus)
    .filter(([, s]) => s === 'completed')
    .reduce((acc, [num]) => acc + (SURAH_AYAH_COUNT[parseInt(num) - 1] || 0), 0);

  const progressPct = Math.round((memorizedAyahs / TOTAL_AYAHS) * 100 * 10) / 10;

  const todayDone = hifz.lastWardDate === new Date().toISOString().split('T')[0];

  return {
    hifz,
    update,
    setSurahStatus,
    setDailyWard,
    markWardDone,
    // stats
    completedSurahs,
    inProgressSurahs,
    memorizedAyahs,
    progressPct,
    todayDone,
    streak: hifz.streak,
  };
}

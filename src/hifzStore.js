import { useState, useEffect, useRef } from 'react';
import { SURAH_AYAH_COUNT, TOTAL_AYAHS, ACHIEVEMENTS, isJuzAmmaDone } from './hifzData';
import { syncHifzToCloud, loadHifzFromCloud } from './backend';

const KEY = 'nq_hifz';

// ─── Local-date helpers (YYYY-MM-DD in the user's own timezone, not UTC) ─────
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parses 'YYYY-MM-DD' as a LOCAL date (new Date('YYYY-MM-DD') would be UTC)
export function parseLocalDate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
  if (!m) { const d = new Date(str); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

// The stored streak only counts while the last ward was today or yesterday
export function effectiveStreak(data) {
  if (!data?.lastWardDate) return 0;
  const today = localDateStr();
  return (data.lastWardDate === today || data.lastWardDate === yesterdayStr())
    ? (data.streak || 0) : 0;
}

function getDefault() {
  return {
    // surahStatus: { [surahNum]: 'none' | 'inProgress' | 'completed' | 'review' }
    surahStatus: {},
    // dailyWard: { surah, startAyah, endAyah, ayahCount }
    dailyWard: null,
    wardHistory: [],   // array of { date, completed, wardAyahs }
    streak: 0,
    bestStreak: 0,
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
  _syncTimer = setTimeout(() => {
    // Last write wins: the server keeps whichever copy has the newest updated_at
    syncHifzToCloud(userId, data, data.updatedAt).catch(() => {});
  }, 3000);
}

export function useHifz(userId = null) {
  const [hifz, setHifzState] = useState(loadHifz);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // Load from cloud on mount (merge: cloud wins if newer)
  useEffect(() => {
    if (!userId || cloudLoaded) return;
    let alive = true;
    loadHifzFromCloud(userId).then(cloudData => {
      if (!alive) return;
      setCloudLoaded(true);
      const localNow = loadHifz();
      if (!cloudData || !cloudData.data) {
        // Nothing on the account yet → upload this device's progress once
        if (localNow.updatedAt) syncHifzToCloud(userId, localNow, localNow.updatedAt).catch(() => {});
        return;
      }
      const local = loadHifz();
      // Compare real timestamps (ISO strings → ms). A missing/invalid local
      // timestamp means this device has never saved → cloud wins.
      const localTime = Date.parse(local.updatedAt);
      const cloudIso  = cloudData.data?.updatedAt || cloudData.updated_at;
      const cloudTime = Date.parse(cloudIso);
      if (Number.isNaN(localTime) || (!Number.isNaN(cloudTime) && cloudTime > localTime)) {
        const merged = { ...local, ...cloudData.data, updatedAt: cloudIso || new Date().toISOString() };
        saveHifz(merged);
        setHifzState(merged);
      } else if (!Number.isNaN(localTime) && (Number.isNaN(cloudTime) || localTime > cloudTime)) {
        // This device is newer → push it up
        syncHifzToCloud(userId, local, local.updatedAt).catch(() => {});
      }
    }).catch(() => {});
    return () => { alive = false; };
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
    const today = localDateStr();
    if (hifz.lastWardDate === today) return; // already done today

    const history = [
      ...hifz.wardHistory,
      { date: today, completed: true, wardAyahs: hifz.dailyWard?.ayahCount || 0 }
    ].slice(-90); // keep 90 days

    // Calculate streak (local dates): continues only from yesterday
    const newStreak = hifz.lastWardDate === yesterdayStr() ? (hifz.streak || 0) + 1 : 1;
    const bestStreak = Math.max(hifz.bestStreak || 0, hifz.streak || 0, newStreak);

    update({ wardHistory: history, lastWardDate: today, streak: newStreak, bestStreak });
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

    const stats = {
      completedSurahs, memorizedAyahs, streak: data.streak || 0, wardDays,
      juzAmmaDone: isJuzAmmaDone(data.surahStatus),
    };
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

  const todayDone = hifz.lastWardDate === localDateStr();
  const streak = effectiveStreak(hifz);
  const bestStreak = Math.max(hifz.bestStreak || 0, hifz.streak || 0);

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
    streak,
    bestStreak,
  };
}

import { useState, useCallback, useEffect } from 'react';

export const DEFAULT_READER = 'Abdul_Basit_Murattal_192kbps';

// Tolerant read: values may be stored as JSON ("26", "true", '{"surah":1}')
// or as raw strings ("uthmani", "en.sahih") — try JSON first, fall back to raw.
const getLocal = (key, def) => {
  let raw;
  try { raw = localStorage.getItem(key); } catch { return def; }
  if (raw === null || raw === undefined || raw === '') return def;
  try { return JSON.parse(raw) ?? def; } catch { return raw; }
};

// Consistent write: strings stored raw, everything else as JSON.
export function savePref(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {}
}

// Where to go after signing in: back to a group khatma invite if one is
// waiting (KhatmaGroupPage resumes the join from sessionStorage), else the dashboard.
export function afterLoginPath() {
  try { if (sessionStorage.getItem('nq_pending_join')) return '/khatma-group'; } catch {}
  return '/dashboard';
}

// Reciter folders that were misspelled or mislabelled in older versions.
const READER_RENAMES = {
  'Abdurrahman_as-Sudais_192kbps': 'Abdurrahmaan_As-Sudais_192kbps',
  'Maher_AlMuaiqly_128kbps':       'MaherAlMuaiqly128kbps',
  'Abdul_Basit_Murattal_64kbps':   'Abdul_Basit_Mujawwad_128kbps',
};
const savedReader = (() => {
  const r = String(getLocal('nq_reader', DEFAULT_READER));
  const fixed = READER_RENAMES[r];
  if (fixed) { try { localStorage.setItem('nq_reader', fixed); } catch {} return fixed; }
  return r;
})();

const lastRead = (() => {
  const v = getLocal('nq_lastRead', null);
  return v && typeof v === 'object' && v.surah >= 1 && v.surah <= 114
    ? { surah: v.surah, ayah: v.ayah >= 1 ? v.ayah : 1 }
    : { surah: 1, ayah: 1 };
})();

let listeners = [];
let globalState = {
  currentSurah:  lastRead.surah,
  currentAyah:   lastRead.ayah,
  fontSize:      Number(getLocal('nq_fontSize', 26)) || 26,
  fontStyle:     String(getLocal('nq_fontStyle', 'uthmani')),
  darkMode:      getLocal('nq_theme', 'dark') !== 'light',
  highlightMode: getLocal('nq_highlight', false) === true,
  bookmarks:     getLocal('nq_bookmarks', []),
  reader:        savedReader,
  translation:   String(getLocal('nq_translation', 'none')), // 'none' or edition id
  isPlaying:     false,
  audioAyah:     1,
  showAudio:     false,
  sidebarOpen:   true,
  toast:         null,
  showTafsir:    false,
  tafsirAyah:    null,
  tafsirSurah:   null,
  scrollToAyah:  null,
  playTrigger:   null,
};

function notify() {
  const snap = { ...globalState };
  listeners.forEach(fn => fn(snap));
}

export function setGlobal(updates) {
  Object.assign(globalState, updates);
  notify();
}

export function useStore() {
  const [state, setState] = useState(() => ({ ...globalState }));

  useEffect(() => {
    // sync in case state changed between render and mount
    setState({ ...globalState });

    const handler = (snap) => setState(snap);
    listeners.push(handler);
    return () => {
      listeners = listeners.filter(l => l !== handler);
    };
  }, []);

  return [state, setGlobal];
}

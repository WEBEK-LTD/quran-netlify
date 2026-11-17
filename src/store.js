import { useState, useCallback, useEffect } from 'react';

const getLocal = (key, def) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
};

let listeners = [];
let globalState = {
  currentSurah:  getLocal('nq_lastRead', { surah: 1, ayah: 1 }).surah,
  currentAyah:   getLocal('nq_lastRead', { surah: 1, ayah: 1 }).ayah,
  fontSize:      getLocal('nq_fontSize', 26),
  fontStyle:     getLocal('nq_fontStyle', 'uthmani'),
  darkMode:      getLocal('nq_theme', 'dark') !== 'light',
  highlightMode: false,
  bookmarks:     getLocal('nq_bookmarks', []),
  reader:        getLocal('nq_reader', 'Abdul_Basit_Murattal_192kbps'),
  translation:   getLocal('nq_translation', 'none'), // 'none' or edition id
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

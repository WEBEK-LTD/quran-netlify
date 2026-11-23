// hls.js, loaded only when an HLS station is played in a browser without native HLS
// (Safari / iOS play .m3u8 natively and never download it).
const HLS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js';
let pending = null;

export function nativeHls(audio) {
  try { return !!(audio.canPlayType('application/vnd.apple.mpegurl') || audio.canPlayType('audio/mpegurl')); } catch { return false; }
}

export function loadHls() {
  if (typeof window !== 'undefined' && window.Hls) return Promise.resolve(window.Hls);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = HLS_SRC;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js missing')));
      s.onerror = () => { pending = null; s.remove(); reject(new Error('hls.js failed to load')); };
      document.head.appendChild(s);
    });
  }
  return pending;
}

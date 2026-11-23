// Side-effect module imported FIRST by main.jsx (before App and the audio code are
// evaluated — AudioPlayer.jsx attaches to navigator.mediaSession at import time).
// A no-op outside the app.
import { installMediaShim } from './mediaShim';
import { isNative, isAndroid } from './platform';

installMediaShim();

if (isNative()) {
  // App-only styles (src/styles/native.css) apply from the very first paint.
  document.documentElement.classList.add('nq-native', `nq-native-${isAndroid() ? 'android' : 'ios'}`);
  // iOS only fires :active on touch when some touch listener exists → instant pressed states
  document.addEventListener('touchstart', () => {}, { passive: true });
}

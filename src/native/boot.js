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
  // An app screen never zooms. Without this, iOS zooms in on any text field whose text is smaller
  // than 16px (the password on «حذف الحساب», sign-in, search…) and stays zoomed after the keyboard
  // closes, so the next screen is cut off. Text size is the app's own setting (الإعدادات ← المظهر).
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

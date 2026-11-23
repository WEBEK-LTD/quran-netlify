// ─── App-only shell behaviour (rendered by App.jsx inside the native app only) ──
// - a new screen starts at the top (back/forward keep the browser's restoration)
// - tells src/native/index.js when the first screen has painted, so the splash
//   hides onto real content (no blank frame) — FullLayout calls useFirstScreen();
//   routes without it (reader, rooms) fall back to a short timer
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { isNative } from './platform';

const NATIVE = isNative();
let signalled = false;

export function signalFirstScreen() {
  if (signalled || !NATIVE) return;
  signalled = true;
  // two frames: the first commits, the second has been painted
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__nqFirstScreen = true;
    window.dispatchEvent(new Event('nq-first-screen'));
  }));
}

export function useFirstScreen() {
  useEffect(() => { if (NATIVE) signalFirstScreen(); }, []);
}

export function NativeShell() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  // from the first navigation on, new screens fade in (src/styles/native.css);
  // a layout effect, so the class is there before the new screen paints
  const first = useRef(pathname);
  useLayoutEffect(() => {
    if (pathname !== first.current) document.documentElement.classList.add('nq-ready');
  }, [pathname]);
  useEffect(() => {
    // the reader scrolls to its own ayah
    if (navType !== 'POP' && pathname !== '/reader') window.scrollTo(0, 0);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(signalFirstScreen, 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}

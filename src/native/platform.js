// ─── Native (Capacitor) detection — safe to import from web code ────────────
// window.Capacitor is injected by the native shell before any page script runs,
// so these checks are synchronous and cost nothing on the website.
export function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch { return false; }
}

/** 'ios' | 'android' | 'web' */
export function platform() {
  try { return (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'; }
  catch { return 'web'; }
}

export const isIOS = () => platform() === 'ios';
export const isAndroid = () => platform() === 'android';

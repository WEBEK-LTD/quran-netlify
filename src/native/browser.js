// ─── System browser for sign-in and external links ──────────────────────────
// Google refuses OAuth inside embedded WebViews, so the app opens the API's
// /auth/google/start in the system browser sheet (SFSafariViewController /
// Chrome Custom Tab). The API ends the flow with a redirect to
// nuralquran://auth?token=… (or ?status=error&reason=…), handled in links.js.
import { Browser } from '@capacitor/browser';

export async function openAuthBrowser(url) {
  try {
    await Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#060D0A' });
  } catch {
    window.location.href = url;   // Capacitor then hands the URL to the system browser
  }
}

export async function closeBrowser() {
  try { await Browser.close(); } catch {}
}

export async function openExternal(url) {
  try { await Browser.open({ url, toolbarColor: '#060D0A' }); } catch { window.open(url, '_blank'); }
}

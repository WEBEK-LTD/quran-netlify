// ─── System browser for sign-in and external links ──────────────────────────
// Google refuses OAuth inside embedded WebViews, so the app opens the API's
// /auth/google/start in the system browser sheet (SFSafariViewController /
// Chrome Custom Tab). The API ends the flow with a redirect to
// nuralquran://auth?token=… (or ?status=error&reason=…), handled in links.js.
import { Browser } from '@capacitor/browser';

/** Resolves when the sheet is closed (by the visitor, or by links.js after the redirect). */
export function openAuthBrowser(url) {
  return new Promise((resolve) => {
    let handle = null;
    const done = () => {
      if (handle) handle.remove();
      window.removeEventListener('nq-token-change', done);
      resolve();
    };
    window.addEventListener('nq-token-change', done);
    Browser.addListener('browserFinished', done)
      .then(h => { handle = h; return Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#060D0A' }); })
      .catch(() => { window.location.href = url; done(); });   // Capacitor hands external URLs to the system browser
  });
}

export async function closeBrowser() {
  try { await Browser.close(); } catch {}
}

export async function openExternal(url) {
  try { await Browser.open({ url, toolbarColor: '#060D0A' }); } catch { window.open(url, '_blank'); }
}

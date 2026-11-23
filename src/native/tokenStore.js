// ─── Session token mirror ────────────────────────────────────────────────────
// apiClient keeps the Bearer token in localStorage (synchronous, used on every
// request). WebView storage can be purged by the OS under storage pressure (iOS
// in particular), so the token is mirrored into native storage (Preferences =
// UserDefaults / SharedPreferences) and restored at launch when missing.
import { Preferences } from '@capacitor/preferences';
import { getToken, setToken } from '../apiClient';
import { refreshAuth } from '../hooks/useAuth';

const KEY = 'nq_token';

export async function initTokenStore() {
  window.addEventListener('nq-token-change', (e) => {
    const t = e && e.detail;
    (t ? Preferences.set({ key: KEY, value: t }) : Preferences.remove({ key: KEY })).catch(() => {});
  });
  try {
    const local = getToken();
    const { value } = await Preferences.get({ key: KEY });
    if (!local && value) {
      setToken(value);          // re-dispatches nq-token-change (harmless)
      refreshAuth();
    } else if (local && local !== value) {
      await Preferences.set({ key: KEY, value: local });
    }
  } catch {}
}

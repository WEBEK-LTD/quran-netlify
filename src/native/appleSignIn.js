// ─── Sign in with Apple (iOS app only) ───────────────────────────────────────
// The system sheet comes from the small NQAppleSignIn plugin in
// ios/App/App/SceneDelegate.swift (AuthenticationServices, no third-party plugin).
// The identity token it returns is verified by the API (POST /v1/auth/apple),
// which answers like an email login: { user, token }.
// Not offered on Android or on the website.
import { registerPlugin } from '@capacitor/core';
import { appleSignInAvailable } from './platform';

export { appleSignInAvailable };

let plugin = null;

function randomNonce() {
  const b = new Uint8Array(24);
  window.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(s) {
  const d = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Opens Apple's sheet. Resolves { identityToken, authorizationCode, user, email, givenName, familyName, nonce }
 * (nonce = the raw value the API checks against the token; absent when the WebView has no WebCrypto).
 * Rejects with an Error whose .code is 'cancelled' (sheet closed), 'unavailable' or 'failed'.
 */
export async function appleSignIn() {
  const fail = (code, message) => Object.assign(new Error(message || code), { code });
  if (!appleSignInAvailable()) throw fail('unavailable');
  if (!plugin) plugin = registerPlugin('NQAppleSignIn');
  let nonce = null, hashed = null;
  try { nonce = randomNonce(); hashed = await sha256Hex(nonce); } catch { nonce = null; hashed = null; }
  let r;
  try {
    r = await plugin.signIn(hashed ? { nonce: hashed } : {});
  } catch (e) {
    const code = e && e.code;
    if (code === 'cancelled') throw fail('cancelled');
    if (code === 'UNIMPLEMENTED' || code === 'UNAVAILABLE') throw fail('unavailable');
    throw fail('failed', e && e.message);
  }
  if (!r || typeof r.identityToken !== 'string' || !r.identityToken) throw fail('failed', 'no identity token');
  return { ...r, nonce: hashed ? nonce : null };
}

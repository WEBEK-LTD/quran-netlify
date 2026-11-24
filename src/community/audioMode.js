// iOS: the app's AVAudioSession is .playAndRecord from launch (AppDelegate → NQAudioSession in
// ios/App/App/SceneDelegate.swift), never .playback, so the room microphone can always start
// (with .playback, WebKit re-activating the session for media made getUserMedia fail with
// NotReadableError — "used by another app"). Only the options change: 'voice' (my microphone
// is on) adds Bluetooth HFP for a headset's microphone; 'media' keeps full-quality A2DP output.
// Done by the small NQAudio plugin (SceneDelegate.swift), which always resolves.
// Android has no NQAudio plugin and needs none: its WebView switches to communication
// mode itself while the microphone is captured (MODIFY_AUDIO_SETTINGS). So this is a
// no-op on Android and on the website, and it never throws: the microphone must open
// even if the plugin is missing or the session change fails.
import { registerPlugin } from '@capacitor/core';
import { isIOS } from '../native/platform';

let NQAudio = null;

/** navigator.audioSession (Safari/WKWebView 16.4+): 'playback' | 'play-and-record' | … — no-op elsewhere. */
export function setWebAudioSession(type) {
  try { if (typeof navigator !== 'undefined' && navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch {}
}
let current = 'media';

/** mode: 'voice' (speaking) | 'media' (listening / out of the room). force: apply even if unchanged. */
export async function setAudioMode(mode, { force = false } = {}) {
  // WebKit's own audio session (Audio Session API). The recitation engine sets it to 'playback'
  // (src/audio/engine.js), and WebKit then refuses capture with "InvalidStateError: AudioSession
  // category is not compatible with audio capture" — whatever the native AVAudioSession says.
  setWebAudioSession(mode === 'voice' ? 'play-and-record' : 'playback');
  if (!isIOS() || (mode === current && !force)) return;
  const prev = current;
  current = mode;
  try {
    if (!NQAudio) NQAudio = registerPlugin('NQAudio');
    await NQAudio.setMode({ mode });
  } catch {
    current = prev;   // try again next time
  }
}

/** iOS: ask for the microphone permission natively (system prompt). true = granted, false = denied,
 *  null = could not ask (not iOS, plugin missing) — then WebKit asks by itself. */
export async function requestMicPermission() {
  if (!isIOS()) return null;
  try {
    if (!NQAudio) NQAudio = registerPlugin('NQAudio');
    const r = await NQAudio.requestMic();
    return !!(r && r.granted);
  } catch { return null; }
}

/** iOS: the audio session state, for the microphone error sheet. */
export async function diagnoseAudio() {
  if (!isIOS()) return null;
  try {
    if (!NQAudio) NQAudio = registerPlugin('NQAudio');
    return await NQAudio.diagnose();
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

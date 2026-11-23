// iOS: the app's audio session is .playback (recitation/radio in the background).
// Speaking in a room needs .playAndRecord while the microphone is on, and .playback
// again afterwards — done by the small NQAudio plugin in ios/App/App/SceneDelegate.swift.
// Android has no NQAudio plugin and needs none: its WebView switches to communication
// mode itself while the microphone is captured (MODIFY_AUDIO_SETTINGS). So this is a
// no-op on Android and on the website, and it never throws: the microphone must open
// even if the plugin is missing or the session change fails.
import { registerPlugin } from '@capacitor/core';
import { isIOS } from '../native/platform';

let NQAudio = null;
let current = 'media';

/** mode: 'voice' (speaking) | 'media' (listening / out of the room) */
export async function setAudioMode(mode) {
  if (!isIOS() || mode === current) return;
  try {
    if (!NQAudio) NQAudio = registerPlugin('NQAudio');
    await NQAudio.setMode({ mode });
    current = mode;
  } catch {}
}

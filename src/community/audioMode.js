// iOS: the app's audio session is .playback (recitation/radio in the background).
// Speaking in a room needs .playAndRecord while the microphone is on, and .playback
// again afterwards — done by the small NQAudio plugin in ios/App/App/SceneDelegate.swift.
// Android's WebView switches the audio mode itself when the microphone is captured.
import { registerPlugin } from '@capacitor/core';
import { isIOS } from '../native/platform';

const NQAudio = registerPlugin('NQAudio');
let current = 'media';

/** mode: 'voice' (speaking) | 'media' (listening / out of the room) */
export async function setAudioMode(mode) {
  if (!isIOS() || mode === current) return;
  current = mode;
  try { await NQAudio.setMode({ mode }); } catch {}
}

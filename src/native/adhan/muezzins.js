// ─── Adhan recordings the app offers (freely licensed only) ─────────────────
// recordings.json = every recording with its source, author and licence;
// available.json  = the ones processed by scripts/fetch-adhan.sh and cleared for
// release (their files exist in dist/adhan, iOS CAF and Android res/raw).
import manifest from './recordings.json';
import available from './available.json';

const AVAILABLE = new Set(available.ids || []);
export const RECORDINGS = manifest.recordings.filter(r => AVAILABLE.has(r.id));

export const regularRecordings = () => RECORDINGS.filter(r => r.type === 'regular');
export const fajrRecordings = () => RECORDINGS.filter(r => r.type === 'fajr');

/** The recording to use: the user's choice if still available, else the first of its type. */
export function resolveRecording(id, type) {
  const list = type === 'fajr' ? fajrRecordings() : regularRecordings();
  return list.find(r => r.id === id) || list[0] || (type === 'fajr' ? regularRecordings()[0] : null) || null;
}

export function recordingFor(settings, prayer) {
  return prayer === 'Fajr' ? resolveRecording(settings.fajrMuezzin, 'fajr') : resolveRecording(settings.muezzin, 'regular');
}

export const recordingName = (r, lang) => (r ? (lang === 'ar' || lang === 'ur' ? r.name.ar : r.name.en) : '');

// File / channel names (keep in sync with scripts/fetch-adhan.sh). Bump CHANNEL_VERSION
// when a recording's audio changes: Android channel sounds are fixed once created.
export const CHANNEL_VERSION = 1;
export const channelIdFor = (id) => `adhan_${id}_v${CHANNEL_VERSION}`;
export const androidRawSound = (id) => `adhan_${id}`;          // res/raw/adhan_<id>.mp3
export const iosSound = (id) => `nq_adhan_${id}.caf`;          // public/nq_adhan_<id>.caf, ≤ 30 s
export const fullAdhanUrl = (id) => `/adhan/${id}.mp3`;       // full recording, played in-app

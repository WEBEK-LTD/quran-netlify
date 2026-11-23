// Side-effect module imported FIRST by main.jsx (before App and the audio code are
// evaluated — AudioPlayer.jsx attaches to navigator.mediaSession at import time).
// A no-op outside the Android app.
import { installMediaShim } from './mediaShim';

installMediaShim();

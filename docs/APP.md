# نور القرآن — the iOS and Android apps

The apps are the website's React/Vite build running inside **Capacitor 8.6** (bundled,
offline-first: the app never loads nuralquran.net to start). Everything that only makes
sense on a phone — the adhan, local notifications, deep links, lock-screen controls,
push — lives in `src/native/**` and the two native projects. The website build is unchanged.

| | |
|---|---|
| App ID / bundle ID | `net.nuralquran.app` |
| Name | «نور القرآن» (every language — brand) |
| Capacitor | `@capacitor/core|cli|android|ios` **8.6.2**; plugins app 8.1.2, browser 8.0.5, local-notifications 8.3.1, push-notifications 8.1.3, preferences 8.0.1, splash-screen 8.0.2, keyboard 8.0.6; `@capacitor/assets` 4.0.0 |
| Android | minSdk 24 (Android 7), compile/target SDK 36, AGP 8.13, Gradle 8.14.3, Java 21 |
| iOS | iOS 15+, Swift Package Manager (no CocoaPods), iPhone portrait, iPad all orientations |
| iOS build SDK | **iOS 27 SDK or newer — always the newest available** (Xcode 27+). Owner rule; the CI fails any build made with an older SDK. |
| Node | **22+** (required by the Capacitor 8 CLI) |
| API | `https://api.nuralquran.net/v1`, session as `Authorization: Bearer` (see `src/apiClient.js`) |

---

## 1. Build and run

Requirements: Node 22+, **Android Studio** (SDK 36) + JDK 21 for Android, **Xcode 27 or newer
(iOS 27 SDK or newer, newest preferred) on macOS** for iOS. Never ship an iOS build made with an
older SDK.

```bash
npm install
npm run build          # the website (unchanged: vite build + SEO pages)
npm run build:app      # app bundle: vite build + adhan files into dist/ + cap sync (both platforms)
npm run android        # build:android + open Android Studio
npm run ios            # build:ios + open Xcode (ios/App/App.xcodeproj)
npm run test:native    # unit tests: adhan schedule, 64-notification budget, time zones, DST, Qibla compass maths
npm run check:native   # static checks: plists, entitlements, manifest, audio files, .well-known
npm run app:assets     # regenerate every icon/splash density from public/brand + store-assets
npm run app:adhan      # (re)process the adhan recordings (scripts/fetch-adhan.sh)
```

`build:app` never runs the SEO step and copies only app files (`dist/adhan/*.mp3`,
`dist/nq_adhan_*.caf`) into `dist/`; `npm run build` for Netlify is exactly as before.

### Project map

| Path | What |
|---|---|
| `capacitor.config.json` | app id/name, splash, system bars (edge-to-edge), notification icon |
| `src/main.jsx` | imports `src/native/boot.js` first; loads `src/native/index.js` lazily **only** inside the app |
| `src/native/index.js` | bootstrap: token mirror → deep links → system bars → media bridge → splash → adhan → push |
| `src/native/links.js` | universal/App links, `nuralquran://` scheme, Google sign-in return, Android back button |
| `src/native/boot.js`, `src/styles/native.css` | `html.nq-native` before the first paint; every app-only style rule (§2 "App shell") |
| `src/native/NativeShell.jsx`, `src/native/keyboard.js` | first-screen signal for the splash, scroll-to-top on new screens; keyboard (tab bar hides, focused field scrolled into view) |
| `src/pages/AppHome.jsx` | the app's home screen (the website keeps `WelcomePage`) |
| `src/pages/qibla/compass.js`, `wmm.js`, `useCompass.js` | Qibla: bearing, sensor heading, smoothing, declination (WMM2025) — §2 "Qibla compass" |
| `src/native/adhan/*` | schedule (pure, tested), times (aladhan cache + local calc), notifications, adhan screen, player, settings, recordings |
| `src/native/NativeAdhanSettings.jsx` | the app-only section inside the prayer page's «تنبيه الأذان» row |
| `src/native/mediaShim.js`, `mediaBridge.js` | Android lock-screen/notification media controls |
| `src/native/push.js` | push registration → `POST /v1/me/devices`; tap → screen (`pushRoutes.js`) |
| `src/community/**` | voice rooms & community screens (lazy chunk, app only; `livekit-client` loaded on first join); strings in `src/locales/rooms.js` |
| `src/native/RoomPill.jsx` | «أنت في غرفة صوتية · عودة» while a room is connected and you browse elsewhere |
| `src/locales/native.js` | translations of the app-only strings (en, tr, fr, ur, id) |
| `android/app/src/main/java/net/nuralquran/app/` | `MainActivity`, `NQNativePlugin` (bars colour, channel settings, media), `NQMediaService` |
| `android/app/src/main/res/raw/adhan_*.mp3` | adhan notification-channel sounds |
| `ios/App/App/` | `AppDelegate.swift` (audio session, APNs), `Info.plist`, `App.entitlements`, `PrivacyInfo.xcprivacy`, `*.lproj/InfoPlist.strings` |
| `store-assets/adhan/` | processed recordings (full mp3 + iOS 30 s CAF); `src/` (git-ignored) caches downloads |
| `public/.well-known/` | `apple-app-site-association`, `assetlinks.json` (placeholders — §6) |
| `.github/workflows/app-android.yml`, `app-ios.yml` | CI builds (§8) |

Small, scoped hooks into existing code: `src/main.jsx` (boot), `index.html` (no service
worker inside the app), `src/apiClient.js` (native API base; `nq-token-change` event),
`src/backend.js` + `LoginPage`/`SignupPage` (Google sign-in through the system browser),
`src/pages/AuthCallbackPage.jsx` (hands a failed app sign-in back to the app),
`src/pages/PrayerTimesPage.jsx` (mounts `NativeAdhanSettings` in the app; hides the
browser-notification notices there), `src/hooks/useAuth.js` (unregisters the push device
before sign-out, app only), `netlify.toml` (content type of the two `.well-known` files).

---

## 2. How the app differs from the website

- **Origin**: Android serves the bundle at `https://localhost`, iOS at `capacitor://localhost`.
  `apiClient` therefore always uses production (`nq_api_base` in localStorage still
  overrides it for development). The API's CORS list already contains both origins
  (`api/config.sample.php`).
- **Auth**: the API returns `{token}` to `client=app`; it is kept in localStorage (synchronous,
  used on every request) and mirrored to native storage (`@capacitor/preferences`) so an
  OS purge of WebView storage doesn't sign the user out (`src/native/tokenStore.js`).
- **Google sign-in**: Google blocks OAuth inside WebViews, so `signInWithGoogle()` opens
  `/v1/auth/google/start?client=app` in the system browser sheet (SFSafariViewController /
  Custom Tab). The API ends with `nuralquran://auth?token=…`; `links.js` stores the token,
  closes the sheet and routes to `/auth/callback?status=ok`, which finishes like the web.
  A failure lands on `https://nuralquran.net/auth/callback?status=error&client=app…` in the
  sheet; that page now redirects to `nuralquran://auth?status=error&reason=…` so the app
  shows the localized error.
- **Service worker**: never registered inside the app (`index.html`), and any old
  registration is removed at launch. The bundle is local, so the app shell is offline;
  the SW's "keep this surah for offline listening" feature is therefore not available in
  the app yet (it degrades to hidden, as in browsers without a SW). A native download
  manager is a possible follow-up.
- **System bars**: edge-to-edge; the page already pads with `env(safe-area-inset-*)`. The
  icon colour follows the in-app appearance mode (`data-scheme` on `<html>`) and on Android
  the window behind the WebView takes the page's `--bg` (#060D0A dark / #F4F5F0 light), which
  shows on WebViews older than Chromium 140 that Capacitor pads instead.
- **Back button (Android)**: closes the adhan screen / dialogs first, then goes back in
  history, then minimises the app.
- **Orientation**: phones portrait; tablets (smallest width ≥ 600 dp, all iPads) any orientation.

### App shell (feel of a native app)

Only inside the app (`isNative()`; `html.nq-native` is set by `boot.js` before the first
paint) — the website is unchanged:

- **Home**: `AppHome` instead of the website hero — greeting + Hijri date, next prayer with a
  live countdown, «تابع القراءة», a grid of sections (المصحف، التلاوات `/listen`، التفسير `/tafsir`،
  المواقيت، القبلة، الأذكار، التسبيح، الإذاعة، الغرف، الحفظ، الختمة الجماعية، البحث — admin switches
  respected), the «تذكرة من كتاب الله لقلبك اليوم» gift (same logic/route as the site) and the verse
  of the day (text cached for the day). Dates and network parts fill in after the first paint.
- **Chrome**: no website footer; compact app bar; the tab bar is always shown (every width) with a
  pill indicator; no text selection / long-press callout on controls (Quran text, articles and
  fields stay selectable); no tap highlight; `overscroll-behavior: none`; instant pressed states;
  a 180 ms fade between screens (off with reduced motion); new screens start at the top.
- **Splash** hides when the first screen has painted (`nq-first-screen`, max 2.5 s) and the launch
  URL has been handled — no blank frame; adhan re-planning starts right after, push/SW on idle.
- **Back button (Android)**: screen-specific handlers (`nq-native-back`: adhan screen, dialogs,
  rooms) → any open drawer/sheet/dialog closes → history back (a screen opened directly goes to
  home) → on home the app goes to the background (`App.minimizeApp`, so a recitation keeps playing).
- **Keyboard** (`@capacitor/keyboard`, already installed): `html.nq-kb` while it is up hides the tab
  bar; the focused field is scrolled into view.

### Qibla compass

- Android: `deviceorientationabsolute` only (its alpha is relative to north; the plain
  `deviceorientation` alpha is relative to how the phone was held at start — never used unless the
  event says `absolute: true`). iOS: `webkitCompassHeading` after `DeviceOrientationEvent.requestPermission()`
  from the «تفعيل البوصلة» tap.
- Heading = screen-up edge projected on the ground, handing over to the back-camera direction as
  the phone is raised (no swing when tilted), plus `screen.orientation.angle`.
- Both sensors are magnetic: the place's **declination** from the World Magnetic Model (WMM2025,
  `src/pages/qibla/wmm.js`, valid to 2030 — update the coefficients then) is added; the bearing is the
  great-circle bearing to the Kaaba (21.422487, 39.826206) from true north.
- Needle: low-pass on the unit circle each frame (359→0 goes the short way), continuous dial
  rotation; «البوصلة تحتاج إلى معايرة» (figure 8) when iOS reports poor accuracy or readings jump;
  a clear «لا يوجد حسّاس بوصلة» state; facing the Qibla (±4°, leaves at 8°) turns the needle green
  with one soft ring. No haptics: no haptics plugin is installed (adding one would be a new native
  plugin).
- Tested: `scripts/test-qibla.mjs` (bearings against published values, heading maths, wrap,
  smoothing, calibration detection, WMM2025 declination against the reference implementation).

---

## 3. Adhan (local notifications)

### Behaviour

- Times are computed **on the device** for the city saved by the prayer page
  (`nq_pray_lat/lon/tz/city`, method `nq_pray_method_v2` or the page's default for the device
  zone). When online, the matching **aladhan.com month calendars** (same source as the page)
  are cached so the adhan matches the displayed times to the minute; any day without a cached
  month falls back to `src/praytimes.js` (works offline; ±1–2 min). aladhan method ids map to
  local parameters in `src/native/adhan/times.js` (all 15 methods the page offers).
- **Re-planned** on launch, every resume, any settings/city/method/toggle change, and on a
  language change (texts are localized at scheduling time).
- **Per prayer**: «أذان كامل» / «إشعار فقط» / «صامت». The page's existing on/off toggles stay
  the source of truth for on/off (`nq_pray_alarms`), the native section adds the style.
- **Reminder** before the adhan: off / 10 / 15 / 30 min.
- **Muezzin** choice, with a separate **Fajr muezzin** (Fajr always uses a Fajr recording).
- **Adhan screen** (full screen): prayer name, city, time, ﴿إِنَّ ٱلصَّلَوٰةَ كَانَتْ عَلَى ٱلْمُؤْمِنِينَ كِتَٰبًا مَّوْقُوتًا﴾
  النساء ١٠٣, «إيقاف الأذان», «تذكير بعد ٥ دقائق». Shown when the notification is opened, and
  when the prayer time arrives with the app in the foreground.
- **Daily ayah** each morning at a chosen time (default 07:00, device clock): same ayah as
  `/daily-ayah` (`dailyIndexFor` = the page's `getDailyIndex` formula for any date). The
  Arabic text (and the meaning in the UI language) is fetched from alquran.cloud ahead of
  time and cached; offline the notification shows the ayah's theme line instead.

### The 64-notification budget (iOS)

iOS keeps only the soonest 64 pending local notifications. `buildPlan()` sorts everything
chronologically and cuts at **60** (4 slots spare for the snooze, a test, future room
reminders). With everything on (5 adhans + 5 reminders + daily ayah = 11/day) that is
5½ days ahead; without reminders 10 days (5 + 1 = 6/day). Because the plan is rebuilt on
every app open/resume, the window slides forward; someone who never opens the app for
over 5 days with reminders on stops getting adhans after the last planned one — the
settings line says «يُجدَّد الجدول تلقائياً كلما فتحت التطبيق». Android has no such limit
(cap 160 → the full 10 days). Tested in `scripts/test-adhan-schedule.mjs`.

### Platform details

| | iOS | Android |
|---|---|---|
| Adhan sound | `nq_adhan_<id>.caf`, **first 29.5 s** with a fade-out (iOS plays the default sound for anything > 30 s) | full recording `res/raw/adhan_<id>.mp3` as the **notification-channel sound** — one channel per muezzin (`adhan_<id>_v1`; channel sounds are fixed once created, bump `CHANNEL_VERSION` in `muezzins.js` if a file changes) |
| Full adhan | played in-app by the adhan screen from the moment it was due (if the notification is opened within 15 min) | the channel plays it; tapping the notification stops that sound, so the app continues it from the same point |
| App in foreground | system banner/sound suppressed (`foreground:false`); the app shows the adhan screen and plays the full adhan | notification + channel sound as usual, plus the adhan screen; «إيقاف الأذان» removes the notification, which stops the sound |
| «إيقاف الأذان» action | destructive action; the sound stops | removes the notification (stops the sound) and returns to what you were doing |
| «تذكير بعد ٥ دقائق» | opens the app briefly, schedules a reminder | same, then minimises |
| Exact time | always exact | exact when the user allows **Alarms & reminders** (`SCHEDULE_EXACT_ALARM`); otherwise inexact (a few minutes late) — the settings show a banner + button. We check first, so the plugin never jumps to system settings by itself |
| After reboot | n/a | the plugin's boot receiver restores alarms |
| Do Not Disturb | respected. Opt-in toggle «تنبيه حسّاس للوقت» sends prayer notifications as **time-sensitive** (entitlement included); the user must still allow the app in Focus settings | respected. «إعدادات القناة» opens the adhan channel's system page where the user may turn on **Override Do Not Disturb** (apps can't do it themselves without notification-policy access) |

### Adhan recordings

**Rule: freely licensed recordings only** (owner decision 8, `docs/ROOMS-DECISIONS.md`).
`src/native/adhan/recordings.json` is the manifest (source URL, author, licence, evidence,
trim points); `available.json` lists the ones processed and cleared. The in-app credits
(«مصادر تسجيلات الأذان» at the bottom of the adhan settings) are generated from it.

Bundled now (downloaded from GitHub with SHA-1 check, processed here):

| id | Type | Muezzin | Licence | Source |
|---|---|---|---|---|
| `khalaf1` | regular | Ahmed Khalaf | CC BY 4.0 | [nandxorandor/Athan `Developer_Athan-1.mp3`](https://github.com/nandxorandor/Athan/blob/ad2bf1799add51cca4aaf1f123b1c212378c7786/app/src/main/assets/athan/developer/Developer_Athan-1.mp3) |
| `khalaf2` | regular | Ahmed Khalaf | CC BY 4.0 | [`Developer_Athan-2.mp3`](https://github.com/nandxorandor/Athan/blob/ad2bf1799add51cca4aaf1f123b1c212378c7786/app/src/main/assets/athan/developer/Developer_Athan-2.mp3) |
| `khalaf_fajr` | Fajr | Ahmed Khalaf | CC BY 4.0 | [`Developer_Athan-3_Fajr.mp3`](https://github.com/nandxorandor/Athan/blob/ad2bf1799add51cca4aaf1f123b1c212378c7786/app/src/main/assets/athan/fajr/Developer_Athan-3_Fajr.mp3) |

Licence evidence: the repository's `LICENSE` states that these three files are original
recordings by Ahmed Khalaf released under CC BY 4.0 (the other audio in that repo is
IslamWeb, non-commercial — **not** used). Attribution is shown in the app.

Candidates (`status: "candidate"`; Wikimedia Commons and archive.org are not reachable from
the build sandbox, so they could not be downloaded or verified here):

| id | Type | Muezzin / recording | Licence (as published) | Notes |
|---|---|---|---|---|
| `malmo_fajr` | **Fajr** | Besim Azemi, Islamic Center Malmö (Commons: *Eid al-Fitr Fajr azan at Malmö Mosque - 19 August 2012.webm*) | CC BY 3.0, Commons licence review 2020-02-12 | adhan ≈ 11.5–235 s, then a du'a (trimmed out) |
| `azeez` | regular | Aaqib Azeez (Commons: *The Adhan - Muslim Call to Prayer - Aaqib Azeez.mp3*) | CC BY-SA 4.0 (uploader confirms he is the reciter) | share-alike: our trimmed copies are CC BY-SA 4.0 too |
| `makkah2013` | regular | Great Mosque of Mecca, visitor recording (Commons, 21 Jan 2013) | CC BY 3.0, licence-reviewed | **decision needed**: the recordist licensed it, the Haram muezzin's performer rights are unlicensed |
| `asim_javed` | regular | Asim Javed (ICR), Internet Archive | CC0 1.0 (self-upload by the muezzin) | — |

Avoid *Beautiful adhan.ogg* and *Azan.ogg* on Commons (shipped by several apps as "CC0"):
their uploaders were blocked on Commons as sockpuppets with copyright violations.
Famous reciters' adhans (Haram broadcasts, Alafasy, Abdul Basit, …) and IslamWeb
(non-commercial) are not freely licensed.

**To add a candidate** (on a machine with normal internet):

```bash
scripts/fetch-adhan.sh --only malmo_fajr     # or --candidates for all of them
# 1. LISTEN to store-assets/adhan/full/<id>.mp3 (Fajr: confirm «الصلاة خير من النوم»; trim points)
# 2. check the licence on the source page; record "sha1" printed by the script
# 3. set "status": "bundled" in src/native/adhan/recordings.json, run the script again
npm run build:app
```

The script needs `curl`, `ffmpeg` (libmp3lame) and `node`. It produces the loudness-
normalised (−16 LUFS) mono 64 kbps MP3, copies it to `android/app/src/main/res/raw/`, makes
the 29.5 s IMA4 CAF for iOS and rewrites `available.json`. **Before release, listen to
every bundled file**: the Fajr wording of `khalaf_fajr` was not checked by ear here.

---

## 4. Background audio and lock-screen controls

- **iOS**: `UIBackgroundModes: audio` + `AVAudioSession` category `.playback` / mode
  `.spokenAudio` (`AppDelegate.swift`). The WebView's `<audio>` keeps playing with the
  screen locked; WebKit publishes `navigator.mediaSession` (already set by
  `src/audio/mediaSession.js` and the radio) to Now Playing / the lock screen.
- **Android**: Capacitor keeps the WebView running in the background (`KeepRunning`), but
  Android's WebView shows **no** media notification and the process could be frozen with
  the screen off. `src/native/mediaShim.js` (installed before the audio code loads) mirrors
  `navigator.mediaSession` into `NQNativePlugin` → `NQMediaService`: a **media-playback
  foreground service** with a `MediaSession` and a MediaStyle notification (previous /
  play-pause / next; lock screen; headset and Bluetooth buttons). Controls call the page's
  own Media Session handlers, so the recitation engine and the radio need no changes.
  Pausing demotes the service (the notification stays dismissible); swiping the app away
  stops it.
- Play Console: declare the **foreground service type `mediaPlayback`** (App content →
  Foreground service permissions): "Plays Quran recitation and Islamic radio chosen by the
  user while the screen is off or another app is in front; the notification shows the
  playback controls." Google asks for a short video of the feature.

Verify on devices: lock the screen during a long surah (gapless ayah changes keep going),
use the lock-screen controls, Bluetooth headset buttons, phone call interruption.

---

## 5. Push notifications (groundwork for rooms)

Off until configured: the web layer only registers when the build has `VITE_NQ_PUSH=1`
(on Android, registering without Firebase configured crashes, so the CI sets the flag only
when `google-services.json` is provided).

- **Android (FCM)**: create a Firebase project → add Android app `net.nuralquran.app` →
  download `google-services.json` → put it at `android/app/google-services.json` (git-ignored;
  CI: secret `GOOGLE_SERVICES_JSON_BASE64`). The Gradle build applies the Google Services
  plugin automatically when the file exists.
- **iOS (APNs)**: Apple Developer → Identifiers → enable *Push Notifications* for
  `net.nuralquran.app` (the entitlement is already in `App.entitlements`); Keys → create an
  **APNs auth key (.p8)**, note Key ID + Team ID — the backend needs them. The app hands the
  backend the **APNs device token** (not an FCM token) on iOS, so the backend sends iOS pushes
  via APNs directly (or via FCM HTTP v1 with an APNs config, if it registers the token with FCM).
- **Backend**: FCM HTTP v1 needs a **Firebase service-account JSON** on the server.
- **Flow**: `askForPush()` (to call from the rooms UI) explains in Arabic first, then asks
  the OS; `registration` → `POST /v1/me/devices {provider: "apns"|"fcm", token, platform,
  app_version, lang}` (contract in `docs/API.md`; iOS sends the raw APNs hex token) once per
  token/session/language — a 404/422 is ignored and retried on the next launch. Signing out
  calls `DELETE /v1/me/devices {token}` first (`useAuth.signOutAuth`), so a shared phone
  stops receiving the previous account's pushes. Tapping a push opens `data.path` (or a
  nuralquran.net `data.url`) in the app. Android channel `community` («الغرف والمجتمع»).
- **Microphone** (voice rooms): iOS purpose string is in `Info.plist` (+ translations). Android
  declares `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`; Capacitor's WebChromeClient asks for them
  the first time a speaker turns the microphone on (after our own explanation sheet). There is
  **no** `FOREGROUND_SERVICE_MICROPHONE`: speaking stops when the app is in the background. iOS
  keeps the app's `.playback` session for the Mushaf; while the microphone is on, the small
  `NQAudio` plugin (`ios/App/App/SceneDelegate.swift`, registered by `NQBridgeViewController`)
  switches to `.playAndRecord` / `.voiceChat` (speaker + Bluetooth), and back to `.playback`
  when the microphone goes off or the room ends. The privacy policy says the microphone is
  used only while you speak in a room and audio is live, never recorded.
- **Tapping a push** opens the screen for its `type` (`src/native/pushRoutes.js`, unit-tested):
  `dm` → `/messages/{conversation_id}`, room types and `speak_invite` → `/rooms/{room_id}`,
  `friend_request`/`friend_accept` → `/people/{user_id}`, `join_request` → `/groups/{group_id}`,
  `suspension`/`reminder_cancelled`/unknown → `/notifications`. FCM data (flat strings) and the
  APNs payload (top-level `type` + nested `data`) are both understood.

---

## 6. Universal links / App Links

The apps open `https://nuralquran.net/` + app routes (`/reader`, `/prayer-times`, `/qibla`,
`/adhkar`, `/tasbih`, `/radio`, `/daily-ayah`, `/hifz`, `/khatma*`, `/search`, `/dashboard`,
`/favorites`, `/notes`, `/leaderboard`, `/ijaza`, `/support`, `/settings`, `/auth/callback`
(email verification), `/reset-password`, and the static `/{lang}/surah/{n}/` pages → reader).
`/admin*`, sitemaps and text files stay in the browser.

1. **iOS** — `public/.well-known/apple-app-site-association`: replace `TEAMID` with the
   Apple Developer **Team ID** (10 characters, Membership page).
2. **Android** — `public/.well-known/assetlinks.json`: replace the two placeholders with
   SHA-256 fingerprints (`AA:BB:…` format):
   - Play Console → *Test and release → App integrity → App signing* → **App signing key
     certificate** SHA-256 (the key Google signs installs with), and
   - your **upload key**: `keytool -list -v -keystore nuralquran-upload.jks -alias upload`.
3. **Serving**: the files must be at `https://nuralquran.net/.well-known/…` with no
   redirect, `Content-Type: application/json`. `netlify.toml` sets the type, **but
   `deploy/apache-proxy.conf` does not proxy `/.well-known/` to Netlify** (AutoSSL uses it),
   so on the Apache host either copy both files into `public_html/.well-known/` and add
   `<Files "apple-app-site-association">ForceType application/json</Files>`, or add, above
   `ProxyPass /.well-known/ !`:
   ```apache
   ProxyPass /.well-known/apple-app-site-association https://NETLIFY_SITE.netlify.app/.well-known/apple-app-site-association
   ProxyPass /.well-known/assetlinks.json https://NETLIFY_SITE.netlify.app/.well-known/assetlinks.json
   ```
4. Check: `curl -sI https://nuralquran.net/.well-known/assetlinks.json`,
   Google's *Statement List Generator and Tester*, `adb shell pm get-app-links net.nuralquran.app`,
   and on iOS the Associated Domains diagnostics in Settings → Developer.

The custom scheme `nuralquran://` always works (sign-in return; e.g. `nuralquran://reader?surah=2`).

---

## 7. Signing and versioning

**Versioning** — `package.json` `version` is the single source:
Android `versionName` = it, `versionCode` = `NQ_VERSION_CODE` (CI: the run number) or
derived (1.2.3 → 10203); iOS `MARKETING_VERSION` = it (CI passes it), build number = CI run
number. Bump `version` for every store release; tag `app-v1.2.3` to trigger both workflows.

### Android

```bash
keytool -genkeypair -v -keystore nuralquran-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```
Keep the `.jks` and passwords **outside git** (password manager + an offline copy). Enrol in
**Play App Signing** (default for new apps): this key is only the *upload* key.
Local release build — `android/key.properties` (git-ignored):
```properties
storeFile=/absolute/path/nuralquran-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```
then `npm run build:android && cd android && ./gradlew bundleRelease` →
`android/app/build/outputs/bundle/release/app-release.aab`.

### iOS

Open `ios/App/App.xcodeproj` → target *App* → *Signing & Capabilities*: select the Team
(automatic signing), check that the capabilities **Push Notifications**, **Associated
Domains** (`applinks:nuralquran.net`), **Time Sensitive Notifications** and **Background
Modes → Audio, Remote notifications** are shown (they come from `App.entitlements` /
`Info.plist`). *Product → Archive* → *Distribute App → App Store Connect*.

---

## 8. CI (GitHub Actions)

`.github/workflows/app-android.yml` (ubuntu): `npm ci` → `npm run test:native` →
`npm run build:android` → `bundleRelease` + `assembleRelease` when signing secrets exist,
otherwise `assembleDebug` → artifacts. Runs on tags `app-v*`, manual dispatch, and PRs that
touch the app.

`.github/workflows/app-ios.yml` (runner label `xcode-27` — GitHub names macOS images after the Xcode major version; move to the next label when it is GA — latest stable Xcode, fails unless the iOS SDK is 27
or newer): `npm ci` → tests →
`npm run build:ios` → unsigned device build (always) → with secrets: archive + export a
signed `.ipa` → optional TestFlight upload.

| Secret | Used by | What |
|---|---|---|
| `KEYSTORE_BASE64` | Android | `base64 -i nuralquran-upload.jks` |
| `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` | Android | upload key |
| `GOOGLE_SERVICES_JSON_BASE64` | Android | optional, enables push |
| `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD` | iOS | Apple Distribution certificate exported as .p12 |
| `IOS_PROVISION_PROFILE_BASE64` | iOS | App Store provisioning profile for `net.nuralquran.app` (with Push + Associated Domains) |
| `IOS_TEAM_ID` | iOS | Team ID |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` | iOS | optional App Store Connect API key → TestFlight |

No secret is stored in the repository; the workflows delete the decoded key material at the end.

---

## 9. Android permissions and Play declarations

| Permission | Why |
|---|---|
| `INTERNET` | Quran text, recitations, API |
| `ACCESS_COARSE/FINE_LOCATION` | «استخدم موقعي الحالي» on the prayer page (asked only when tapped) |
| `POST_NOTIFICATIONS` | adhan, reminders, daily ayah (asked from the adhan settings, after an explanation) |
| `SCHEDULE_EXACT_ALARM` | adhan at the exact minute; the user grants it in *Alarms & reminders* |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE` | restore scheduled adhans after reboot; deliver them |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | recitation/radio with the screen off (§4) |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | speaking on a voice room's stage (asked on the first «افتح الميكروفون»); never recorded |

**Exact alarms — policy.** `USE_EXACT_ALARM` (auto-granted) is reserved by Google Play for
apps whose *core* function is an alarm clock or calendar, and needs a Play Console
declaration; we deliberately use **`SCHEDULE_EXACT_ALARM`** (user-granted, no declaration
form) and degrade to inexact alarms if it is refused. If the owner ever wants to argue
`USE_EXACT_ALARM` (core function = prayer-time alarms), the declaration text would be:
> «نور القرآن» is a Quran and prayer app whose central feature is the adhan: an alarm that
> must sound at the exact minute each of the five daily prayers begins, chosen per prayer
> by the user, including before dawn (Fajr). Inexact alarms can be delayed by several
> minutes in Doze, which makes the call to prayer late. The app schedules only these
> user-enabled alarms (at most 11 per day) and a user-chosen morning reminder.

---

## 10. Store listing texts

Accurate to the current features; no "AI" (the assistant is not advertised), no rankings or
download claims. Play: title ≤ 30, short ≤ 80, full ≤ 4000. App Store: name «نور القرآن»
(≤ 30), subtitle ≤ 30, keywords ≤ 100 bytes, comma-separated. **Category**: Books
(Play) / Reference or Books (App Store); secondary Lifestyle.

### العربية
- **Play title**: نور القرآن: مصحف وأذان وتلاوات
- **App Store subtitle**: مصحف وتلاوات ومواقيت وأذان
- **Short**: اقرأ القرآن واستمع وتدبّر واحفظ، مع مواقيت الصلاة والأذان. مجاني وبلا إعلانات
- **Keywords**: قرآن,مصحف,أذان,مواقيت الصلاة,تلاوة,تفسير,حفظ,قبلة,أذكار,إذاعة القرآن,ختمة,سبحة
- **Full description**:

> نور القرآن رفيقك اليومي مع كتاب الله: مصحف بخط عثماني واضح، وتلاوات لكبار القرّاء،
> وتفسير ميسّر، ومواقيت صلاة دقيقة مع أذان يُرفع في وقته حتى والتطبيق مغلق.
> مجاني بالكامل لوجه الله، بلا إعلانات ولا اشتراكات.
>
> المصحف والتلاوة
> • قراءة السور كاملة بالرسم العثماني، بالسورة أو الجزء أو الحزب
> • استماع متواصل آية بآية لستة عشر قارئاً، مع متابعة الآية المقروءة، والتلاوة مستمرة والشاشة مقفلة
> • تفسير ميسّر وترجمات للمعاني بعدة لغات
> • البحث في القرآن، والمفضلة، والملاحظات على الآيات
>
> الصلاة
> • مواقيت الصلاة لمدينتك بطريقة الحساب المعتمدة في بلدك
> • أذان كامل لكل صلاة، وأذان خاص للفجر، مع اختيار المؤذّن
> • تذكير قبل الأذان، وإشعار فقط أو صامت لكل صلاة كما تريد
> • بوصلة القبلة، وأذكار الصباح والمساء، والسبحة
>
> الحفظ والختمة
> • متابعة حفظك سورة بسورة مع ورد يومي
> • ختمة شخصية وختمة جماعية تشارك فيها أهلك وأصحابك
>
> كل يوم
> • آية اليوم كل صباح في الوقت الذي تختاره
> • إذاعات القرآن الكريم
> • ست لغات للواجهة: العربية والإنجليزية والتركية والفرنسية والأردية والإندونيسية
> • أوضاع للعرض: ليلي ونهاري وورق المصحف وتباين عالٍ
>
> خصوصيتك: يمكنك استخدام التطبيق دون حساب. تُحسب مواقيت الصلاة على جهازك، ولا نبيع
> بياناتك ولا نعرض إعلانات. إنشاء الحساب اختياري لمزامنة تقدّمك بين أجهزتك.

### English
- **Play title**: Nur Al-Quran: Quran & Adhan
- **Subtitle**: Mushaf, recitation, prayer
- **Short**: Read, listen to and memorise the Quran, with prayer times and adhan. No ads.
- **Keywords**: quran,koran,mushaf,adhan,azan,athan,prayer times,qibla,tafsir,hifz,recitation,adhkar,muslim
- **Full description**:

> Nur Al-Quran is a daily companion to the Book of Allah: a clear Uthmani mushaf,
> recitations by well-known reciters, plain-language tafsir, and accurate prayer times
> with an adhan that sounds on time even when the app is closed. Completely free, with
> no ads and no subscriptions.
>
> QURAN AND RECITATION
> • Read every surah in the Uthmani script, by surah, juz or hizb
> • Continuous ayah-by-ayah listening with 16 reciters; the current ayah is highlighted,
>   and playback continues with the screen locked
> • Simplified tafsir and translations of the meanings in several languages
> • Search the Quran, keep favourites and notes on ayat
>
> PRAYER
> • Prayer times for your city with your country's calculation method
> • A full adhan for each prayer and a separate Fajr adhan, with a choice of muezzin
> • A reminder before the adhan; notification-only or silent per prayer
> • Qibla compass, morning and evening adhkar, tasbih counter
>
> MEMORISATION AND KHATMA
> • Track your memorisation surah by surah with a daily portion
> • Personal khatma, and group khatmas to share with family and friends
>
> EVERY DAY
> • A verse of the day each morning at the time you choose
> • Quran radio stations
> • Interface in Arabic, English, Turkish, French, Urdu and Indonesian
> • Night, day, mushaf-paper and high-contrast modes
>
> Your privacy: use the app without an account. Prayer times are calculated on your
> device; we never sell your data or show ads. An optional account syncs your progress
> across devices.

### Türkçe
- **Play title**: Nur Al-Quran: Kuran ve Ezan
- **Subtitle**: Mushaf, tilavet, namaz vakti
- **Short**: Kuran’ı okuyun, dinleyin ve ezberleyin; namaz vakitleri ve ezan. Reklamsız.
- **Keywords**: kuran,kuranı kerim,ezan,namaz vakitleri,kıble,tefsir,hafızlık,tilavet,zikir,tesbih,hatim
- **Full description**:

> Nur Al-Quran, Allah’ın Kitabı ile günlük yol arkadaşınız: okunaklı Osmanlı hattıyla
> mushaf, tanınmış kârilerden tilavetler, sade bir tefsir ve uygulama kapalıyken bile
> vaktinde okunan ezanla doğru namaz vakitleri. Tamamen ücretsiz; reklam ve abonelik yok.
>
> KURAN VE TİLAVET
> • Tüm sureleri Osmanlı hattıyla sure, cüz veya hizb olarak okuyun
> • 16 kâriden ayet ayet kesintisiz dinleme; okunan ayet vurgulanır, ekran kilitliyken de sürer
> • Sade tefsir ve birçok dilde meal
> • Kuran’da arama, favoriler ve ayetlere notlar
>
> NAMAZ
> • Şehriniz için ülkenizin hesaplama yöntemiyle namaz vakitleri
> • Her namaz için tam ezan, sabah için ayrı ezan ve müezzin seçimi
> • Ezandan önce hatırlatma; her namaz için yalnızca bildirim veya sessiz
> • Kıble pusulası, sabah ve akşam zikirleri, tesbih
>
> HAFIZLIK VE HATİM
> • Günlük virdle sure sure ezber takibi
> • Kişisel hatim ve ailenizle, arkadaşlarınızla toplu hatim
>
> HER GÜN
> • Seçtiğiniz saatte her sabah günün ayeti
> • Kuran radyoları
> • Arapça, İngilizce, Türkçe, Fransızca, Urduca ve Endonezce arayüz
> • Gece, gündüz, mushaf kâğıdı ve yüksek kontrast modları
>
> Gizliliğiniz: Uygulamayı hesap açmadan kullanabilirsiniz. Namaz vakitleri cihazınızda
> hesaplanır; verilerinizi satmayız, reklam göstermeyiz. İsteğe bağlı hesap,
> ilerlemenizi cihazlarınız arasında eşitler.

### Français
- **Play title**: Nur Al-Quran : Coran et adhan
- **Subtitle**: Mushaf, récitation, prière
- **Short**: Lisez, écoutez, mémorisez le Coran, avec horaires de prière et adhan. Sans pub.
- **Keywords**: coran,quran,adhan,horaires de prière,qibla,tafsir,récitation,mémorisation,dhikr,islam
- **Full description**:

> Nur Al-Quran vous accompagne chaque jour avec le Livre d’Allah : un mushaf en écriture
> uthmanie lisible, des récitations de récitateurs reconnus, un tafsir accessible et des
> horaires de prière précis avec un adhan à l’heure, même application fermée.
> Entièrement gratuit, sans publicité ni abonnement.
>
> CORAN ET RÉCITATION
> • Toutes les sourates en écriture uthmanie, par sourate, juz ou hizb
> • Écoute continue verset par verset avec 16 récitateurs ; le verset en cours est mis en
>   évidence et la lecture continue écran verrouillé
> • Tafsir simplifié et traductions du sens en plusieurs langues
> • Recherche dans le Coran, favoris et notes sur les versets
>
> PRIÈRE
> • Horaires de prière de votre ville selon la méthode de calcul de votre pays
> • Adhan complet pour chaque prière, adhan distinct pour le Fajr, choix du muezzin
> • Rappel avant l’adhan ; notification seule ou silencieux pour chaque prière
> • Boussole de la qibla, invocations du matin et du soir, compteur de tasbih
>
> MÉMORISATION ET KHATMA
> • Suivi de la mémorisation sourate par sourate avec une portion quotidienne
> • Khatma personnelle et khatmas de groupe à partager avec vos proches
>
> CHAQUE JOUR
> • Le verset du jour chaque matin à l’heure choisie
> • Radios du Coran
> • Interface en arabe, anglais, turc, français, ourdou et indonésien
> • Modes nuit, jour, papier de mushaf et contraste élevé
>
> Votre vie privée : utilisez l’application sans compte. Les horaires sont calculés sur
> votre appareil ; nous ne vendons pas vos données et n’affichons aucune publicité. Un
> compte facultatif synchronise votre progression entre vos appareils.

### اردو
- **Play title**: نور القرآن: قرآن اور اذان
- **Subtitle**: مصحف، تلاوت، اوقاتِ نماز
- **Short**: قرآن پڑھیں، سنیں اور حفظ کریں، نماز کے اوقات اور اذان کے ساتھ۔ بغیر اشتہار
- **Keywords**: قرآن,اذان,نماز کے اوقات,قبلہ,تفسیر,تلاوت,حفظ,اذکار,تسبیح,ختم
- **Full description**:

> نور القرآن اللہ کی کتاب کے ساتھ آپ کا روزانہ کا ساتھی: واضح عثمانی رسم الخط میں مصحف،
> معروف قراء کی تلاوتیں، آسان تفسیر، اور نماز کے درست اوقات کے ساتھ اذان جو ایپ بند ہونے
> پر بھی وقت پر ہوتی ہے۔ مکمل طور پر مفت، نہ اشتہار نہ سبسکرپشن۔
>
> قرآن اور تلاوت
> • تمام سورتیں عثمانی رسم الخط میں، سورت، پارہ یا حزب کے مطابق
> • ۱۶ قراء کی آیت بہ آیت مسلسل تلاوت؛ موجودہ آیت نمایاں، اور اسکرین لاک ہونے پر بھی جاری
> • آسان تفسیر اور کئی زبانوں میں ترجمۂ معانی
> • قرآن میں تلاش، پسندیدہ آیات اور نوٹس
>
> نماز
> • آپ کے شہر کے لیے آپ کے ملک کے طریقۂ حساب سے نماز کے اوقات
> • ہر نماز کے لیے مکمل اذان، فجر کی الگ اذان، اور مؤذن کا انتخاب
> • اذان سے پہلے یاد دہانی؛ ہر نماز کے لیے صرف اطلاع یا خاموش
> • قبلہ نما، صبح و شام کے اذکار، تسبیح
>
> حفظ اور ختم
> • روزانہ کے ورد کے ساتھ سورت بہ سورت حفظ کی پیروی
> • ذاتی ختم، اور گھر والوں اور دوستوں کے ساتھ اجتماعی ختم
>
> روزانہ
> • ہر صبح آپ کے منتخب وقت پر آج کی آیت
> • قرآن ریڈیو
> • عربی، انگریزی، ترکی، فرانسیسی، اردو اور انڈونیشیائی زبان میں
> • رات، دن، مصحف کاغذ اور ہائی کنٹراسٹ موڈ
>
> آپ کی رازداری: ایپ بغیر اکاؤنٹ کے استعمال کریں۔ نماز کے اوقات آپ کی ڈیوائس پر شمار
> ہوتے ہیں؛ ہم آپ کا ڈیٹا نہیں بیچتے اور اشتہار نہیں دکھاتے۔ اختیاری اکاؤنٹ آپ کی پیش رفت
> کو آپ کی ڈیوائسز میں ہم آہنگ رکھتا ہے۔

### Bahasa Indonesia
- **Play title**: Nur Al-Quran: Al-Quran & Azan
- **Subtitle**: Mushaf, tilawah, waktu salat
- **Short**: Baca, dengar, dan hafalkan Al-Quran, plus waktu salat dan azan. Tanpa iklan.
- **Keywords**: quran,alquran,azan,jadwal salat,kiblat,tafsir,murotal,hafalan,dzikir,tasbih,khatam
- **Full description**:

> Nur Al-Quran adalah teman harian Anda bersama Kitab Allah: mushaf rasm Utsmani yang jelas,
> tilawah para qari ternama, tafsir yang mudah dipahami, dan waktu salat akurat dengan azan
> yang berkumandang tepat waktu meski aplikasi tertutup. Sepenuhnya gratis, tanpa iklan
> dan tanpa langganan.
>
> AL-QURAN DAN TILAWAH
> • Baca semua surah dalam rasm Utsmani, per surah, juz, atau hizb
> • Dengarkan ayat demi ayat tanpa jeda dari 16 qari; ayat yang dibaca disorot, dan tetap
>   berputar saat layar terkunci
> • Tafsir ringkas dan terjemahan makna dalam beberapa bahasa
> • Pencarian Al-Quran, favorit, dan catatan pada ayat
>
> SALAT
> • Waktu salat untuk kota Anda dengan metode perhitungan negara Anda
> • Azan lengkap untuk setiap salat, azan Subuh tersendiri, dan pilihan muazin
> • Pengingat sebelum azan; notifikasi saja atau senyap untuk setiap salat
> • Kompas kiblat, dzikir pagi dan petang, penghitung tasbih
>
> HAFALAN DAN KHATAM
> • Pantau hafalan surah demi surah dengan wirid harian
> • Khatam pribadi dan khatam bersama keluarga serta teman
>
> SETIAP HARI
> • Ayat hari ini setiap pagi pada waktu pilihan Anda
> • Radio Al-Quran
> • Antarmuka dalam bahasa Arab, Inggris, Turki, Prancis, Urdu, dan Indonesia
> • Mode malam, siang, kertas mushaf, dan kontras tinggi
>
> Privasi Anda: gunakan aplikasi tanpa akun. Waktu salat dihitung di perangkat Anda; kami
> tidak menjual data Anda dan tidak menampilkan iklan. Akun opsional menyinkronkan kemajuan
> Anda di semua perangkat.

Before publishing, re-check claims against the live app (e.g. the reciter count in
`src/data.js` `READERS`, currently 16; the hizb/juz browsing; feature flags the admin may
have switched off — the listing must not describe a disabled feature).

---

## 11. Privacy answers

What the app actually sends (code-reviewed): account **email, name**, optional **profile
photo** (`POST /me/avatar`), optional **gender / birth date**, the account's **user id**;
**user content** (notes, favourites, reading/memorisation progress, group-khatma names,
questions to the assistant, support messages); a **random visitor id + current page** every
60 s (`POST /presence`, online counter). **No ads, no third-party analytics SDK, no
tracking.** Prayer location: kept on the device (localStorage); the coordinates / typed city
are sent **directly from the device** to api.aladhan.com (times, calendar) and
nominatim.openstreetmap.org (city name) — not to our server. Push device token (when
enabled). The daily-ayah text comes from api.alquran.cloud (no personal data).

### App Store "App Privacy" (matches `ios/App/App/PrivacyInfo.xcprivacy`)

Tracking: **No**. Data linked to the user, purpose *App Functionality* unless noted:

| Category | Type | Linked |
|---|---|---|
| Contact Info | Email Address, Name | yes |
| User Content | Photos (profile photo, optional), Customer Support, Other User Content (notes, khatma names, assistant questions) | yes |
| Identifiers | User ID | yes |
| Usage Data | Product Interaction (page presence) — purpose **Analytics** | yes |
| Location | Precise Location (only when "use my location" is tapped; sent to the prayer-times service, not stored by us) | **no** |
| Other Data | gender, birth date (optional) | yes |

Account deletion in-app: the «حذف الحساب والبيانات» page (`/delete-data`, linked from Settings and the privacy policy; `DELETE /auth/account`) — required by
Apple 5.1.1(v); also the web page `https://nuralquran.net/delete-data`.

### Google Play "Data safety"

- Data collected: **Personal info** — Email address, Name, Other info (gender, birth date;
  optional), User IDs; **Photos** (profile photo, optional); **App activity** — App
  interactions (presence), Other user-generated content (notes, khatma names, assistant
  questions); **Messages** — Other in-app messages (support); **Location** — Approximate and
  Precise (optional, for prayer times; processed ephemerally, not stored by the developer);
  **Device or other IDs** (push token, when push is enabled).
- Purposes: App functionality, Account management; presence = Analytics.
- **Shared**: No (the aladhan/OSM requests come from the user's device for the feature they
  asked for). Optional: **Yes** for profile photo, gender/birth date, location, account
  itself (the app works without an account).
- **Encrypted in transit**: Yes. **Deletion**: Yes — in-app and https://nuralquran.net/delete-data.
- Ads: **No**. Target audience: 13+ (with social features; see §12).

**Voice rooms add** (app only): community profile (gender, birth date, bio, optional
Facebook/Instagram links), friends/follows/blocks, room chat (deleted when the room closes,
except reported lines), private text messages (stored until either side deletes them),
reports, push token. **Microphone audio** is streamed live through our own LiveKit server to
the people in the room and is never recorded or stored — on Apple's definition that is not
"collected" (real-time only); for Google Play declare *Audio → Voice or sound recordings* as
*processed ephemerally*, not shared, for App functionality (owner to confirm the wording).

**Privacy policy update still needed** (`/privacy`): local notifications, the coordinates
sent to aladhan.com for the adhan schedule, push tokens, and the community data above. The
microphone sentence is done (all six languages).

---

## 12. Content rating, child safety

- **IARC (Play) / Apple age rating**: no violence, sexual content, profanity, drugs,
  gambling, horror; religious reference content. **User interaction**: yes — users can
  exchange content (group khatma names, the upcoming rooms/chat), users' names can appear
  publicly (opt-in leaderboard). **Shares location**: no (with other users). **Digital
  purchases**: none. Expected result: Play *Everyone*/PEGI 3 with "Users Interact";
  Apple **12+** once rooms/DMs ship (unrestricted web access: no; user-generated content: yes),
  4+ is possible only while there is no user-to-user communication.
- **Google Play Child Safety Standards** (required for apps with social/communication
  features — the rooms): publish a page, e.g. `https://nuralquran.net/child-safety`, stating
  the standards against child sexual abuse and exploitation (CSAE): zero tolerance; in-app
  reporting and blocking; the minors rules from `docs/ROOMS-DECISIONS.md` §5 (13–17: no DMs, no
  friendships, private profile); review and removal; reporting to authorities/NCMEC as
  applicable; a named **child-safety contact** (email) who can speak to Google. Enter the URL
  and contact in Play Console → *App content → Child safety standards*. Apple 1.2 similarly
  expects reporting, blocking and timely responses for UGC apps.

---

## 13. Screenshots plan

Sizes: iPhone 6.9" (1320×2868), iPad 13" (2064×2752), Android phone (1080×1920 or larger),
7"/10" tablets; Play feature graphic 1024×500 exists (`store-assets/feature-graphic-1024x500.png`).
Capture in Arabic first, then each language (the UI is fully localized), dark mode + one light:

1. Reader — a surah in Uthmani script with the current ayah highlighted, player docked
2. Adhan screen (use «جرّب شاشة الأذان» in the prayer settings)
3. Prayer times — next prayer, sun arc, five prayer windows
4. Adhan settings — per-prayer style, muezzin, Fajr muezzin, reminder
5. Qibla compass
6. Hifz progress map
7. Group khatma
8. Daily ayah with tafsir
9. Radio
10. Appearance modes (night / mushaf paper)

Caption ideas (Arabic): «القرآن بين يديك»، «الأذان في وقته حتى والتطبيق مغلق»، «اختر مؤذّنك ومؤذّن الفجر»،
«احفظ سورة بسورة»، «ختمة جماعية لأهلك وأصحابك».

---

## 14. What was verified, and what needs a device

Verified in the build sandbox: `npm run build` (website) and `npm run build:app` (vite +
adhan assets + `cap sync` for both platforms); `npm run test:native` (15 tests: iOS budget
≤ 60 < 64, 10-day window, day rollover after Isha, city zone ≠ device zone, London DST
change, daily-ayah index = the page's, reminders, ids); `npm run check:native` (Info.plist /
entitlements / privacy manifest / InfoPlist.strings parse, pbxproj wiring and object
references, scheme, manifest + resource XML well-formed, audio files present, iOS sounds ≤ 30 s,
JSON files); the Java sources compile against the Android 36 framework jar (Capacitor
classes stubbed); a headless-Chromium smoke test of the built app bundle with a fake
Capacitor bridge (iOS and Android modes): native boot, adhan settings UI and the first-run
permission flow, 60/101 notifications planned with the right channels/sounds/actions, the
adhan screen on foreground delivery + «إيقاف الأذان» removing the notification, snooze in
5 min, `nuralquran://auth?token=…` sign-in return (token stored and mirrored), a universal
link to `/reader`, and the Android media-session bridge. **Not possible here**: a Gradle build (Google's Maven repository /
dl.google.com is blocked, so neither AGP nor the SDK can be downloaded) and any Xcode build —
both run in the CI workflows.

Needs real devices (checklist):
- adhan at the exact minute with the app killed, screen off, Doze (Android 12–16), after
  reboot; with and without *Alarms & reminders*; DND on/off and the channel override
- iOS: notification sound (30 s) → open → full adhan continues; foreground arrival shows the
  adhan screen without a double sound; time-sensitive with Focus
- «إيقاف الأذان» / «تذكير بعد ٥ دقائق» from the notification on both platforms
- Google sign-in round trip (system sheet → `nuralquran://auth` → signed in), error path
- universal links / App Links once the `.well-known` files are live
- background recitation with the screen locked (gapless), lock-screen/Bluetooth controls, radio
- push registration once FCM/APNs are configured; `/me/devices` on the backend
- status-bar colours in every appearance mode; tablets in landscape

### Voice rooms & community (`src/community/**`)

Verified headlessly (Chromium at 390 px, built bundle, fake Capacitor bridge for Android and
iOS, the API mocked with route interception, `livekit-client` replaced by a stub module):
every screen in Arabic and English × dark and light (and sepia/contrast, French, Urdu,
reduced motion) with no horizontal overflow and no console errors; 57 flow checks (first-entry
gate PATCH, join → LiveKit connect with the API's url/token, raise hand, directed clap and its
1-per-minute 429 text, chat `links_not_allowed` / `content_review`, role change → mic →
`NQAudio` voice/media on iOS, microphone denied, quiet vs normal leave, kicked / closed /
reconnecting / lost, join errors, host tools, minors, suspensions, create room, notifications,
DMs, the «back to the room» pill, and that the website never requests the chunk); push taps
with a `VITE_NQ_PUSH=1` build. **Not verified here**: real audio through rtc.nuralquran.net
(not reachable from the sandbox), the microphone on real devices, iOS audio-session routing,
background behaviour, and the Xcode/Gradle compile of the new Swift plugin.

## 15. What the owner must provide

1. **Apple**: Developer Program membership, **Team ID** (→ AASA), App ID `net.nuralquran.app`
   with Push, Associated Domains, Time Sensitive Notifications; App Store Connect app record;
   Apple Distribution certificate + App Store provisioning profile (for CI) or Xcode
   automatic signing; optional App Store Connect API key (TestFlight from CI).
2. **APNs auth key (.p8)** + Key ID (for the backend's push sender).
3. **Google Play**: developer account, app `net.nuralquran.app`, **upload keystore** (create
   it, §7), the **App signing SHA-256** and upload-key SHA-256 (→ assetlinks.json).
4. **Firebase**: project + `google-services.json` (Android push) and a **service-account
   JSON** for the backend (FCM HTTP v1).
5. **Website/hosting**: serve the two `.well-known` files (§6); publish the Child Safety
   Standards page + contact (§12); privacy-policy update (§11).
6. **Adhan recordings decision**: listen to the three bundled Ahmed Khalaf recordings
   (CC BY 4.0) and confirm the Fajr wording; decide on the candidates (Malmö Fajr — CC BY 3.0,
   Aaqib Azeez — CC BY-SA 4.0, Makkah visitor recording — performer-rights caveat, Asim
   Javed — CC0) and run `scripts/fetch-adhan.sh --candidates` where Commons/archive.org are
   reachable.
7. Store texts review (§10), screenshots (§13), content-rating and Data-safety forms (§11–12).

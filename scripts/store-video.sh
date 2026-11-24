#!/bin/bash
# Records the Play "media playback" foreground-service demo on a running emulator.
# Used by .github/workflows/store-video.yml:  bash scripts/store-video.sh <app-debug.apk>
# Output: ./demo-raw.mp4 (screen recording) and ./shots/*.png (key frames for checking).
set -uo pipefail
APK="$1"
PKG=net.nuralquran.app
mkdir -p shots
log() { echo "[$(date +%T)] $*"; }
shot() { adb exec-out screencap -p > "shots/$1.png" || true; }

# tap the centre of the first accessibility node whose text/content-desc matches a regex (python3 on the runner)
tap_node() {
  local re="$1" not="${2:-^$}"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || return 1
  local xy
  xy=$(python3 - "$re" "$not" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want, avoid = re.compile(sys.argv[1], re.I), re.compile(sys.argv[2], re.I)
for n in ET.parse("ui.xml").iter("node"):
    label = (n.get("content-desc") or "") + " " + (n.get("text") or "")
    if want.search(label) and not avoid.search(label):
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds", ""))
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            if y2 > y1 and y1 > 120:
                print((x1 + x2) // 2, (y1 + y2) // 2); break
PY
)
  [ -n "$xy" ] || return 1
  log "tap '$re' at $xy"; adb shell input tap $xy
}

adb shell settings put system screen_off_timeout 600000
adb shell svc power stayon true
adb shell locksettings set-disabled false >/dev/null 2>&1 || true
adb install -r -g "$APK"
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell input keyevent KEYCODE_WAKEUP; adb shell wm dismiss-keyguard; sleep 2

log "start recording"
adb shell screenrecord --time-limit 170 --bit-rate 4000000 /sdcard/demo.mp4 &
REC=$!
sleep 2

log "launch the app"
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 12; shot 01-home

log "open «التلاوات» (Recitations)"
adb shell am start -a android.intent.action.VIEW -d "nuralquran://listen" $PKG >/dev/null
sleep 6; shot 02-listen

# find a surah row and play it (scroll down until it is on screen)
played=0
for i in 1 2 3 4 5; do
  if tap_node '(Al-?Fatihah|Fatiha|الفاتحة)' '(mushaf|المصحف|read|اقرأ)'; then played=1; break; fi
  adb shell input swipe 540 1700 540 900 400; sleep 1.5
done
[ $played = 1 ] || { log "surah row not found"; cp ui.xml shots/ui-listen.xml 2>/dev/null; }
sleep 10; shot 03-playing

log "show the media notification"
adb shell cmd statusbar expand-notifications; sleep 6; shot 04-notification
adb shell input keyevent KEYCODE_MEDIA_PAUSE; sleep 4; shot 05-paused
adb shell input keyevent KEYCODE_MEDIA_PLAY; sleep 5; shot 06-resumed
adb shell cmd statusbar collapse; sleep 2

log "go home: the recitation keeps playing"
adb shell input keyevent KEYCODE_HOME; sleep 5
adb shell cmd statusbar expand-notifications; sleep 6; shot 07-home-notification
adb shell cmd statusbar collapse; sleep 1

log "lock the screen and wake it: lock-screen controls"
adb shell input keyevent KEYCODE_SLEEP; sleep 3
adb shell input keyevent KEYCODE_WAKEUP; sleep 6; shot 08-lockscreen
adb shell input keyevent KEYCODE_MEDIA_PAUSE; sleep 4; shot 09-lock-paused
adb shell input keyevent KEYCODE_MEDIA_PLAY; sleep 6; shot 10-lock-playing

log "audio focus / media session state"
adb shell dumpsys media_session | grep -E "package=|state=|active=" | head -20 || true
adb shell dumpsys activity services $PKG | grep -E "ServiceRecord|isForeground|foregroundServiceType" | head -10 || true

log "stop recording"
adb shell pkill -INT screenrecord || true
wait $REC 2>/dev/null; sleep 3
adb pull /sdcard/demo.mp4 demo-raw.mp4
ls -la demo-raw.mp4 shots/

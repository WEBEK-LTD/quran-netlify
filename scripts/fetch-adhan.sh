#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# نور القرآن — adhan sound pipeline
#
# Downloads the freely licensed adhan recordings listed in
# src/native/adhan/recordings.json and produces, for each one:
#   store-assets/adhan/full/<id>.mp3             full adhan, mono 64 kbps, loudness-normalised
#                                                (copied to dist/adhan/ by `npm run build:app`;
#                                                 the app plays it in the adhan screen)
#   store-assets/adhan/ios/nq_adhan_<id>.caf     first 29.5 s with a fade-out (iOS notification
#                                                sounds must be ≤ 30 s; IMA4 in CAF)
#   android/app/src/main/res/raw/adhan_<id>.mp3  full adhan, the Android notification-channel sound
# and rewrites src/native/adhan/available.json (the muezzins the app offers).
#
# Usage:
#   scripts/fetch-adhan.sh                 process every recording with status "bundled"
#   scripts/fetch-adhan.sh --candidates    also try the "candidate" ones (needs network access
#                                          to commons.wikimedia.org / archive.org). LISTEN to each
#                                          result before changing its status to "bundled".
#   scripts/fetch-adhan.sh --only <id>     a single recording
#
# Requires: curl, ffmpeg (with libmp3lame), node.  Downloads are cached in
# store-assets/adhan/src/ (git-ignored) and checked against the recorded SHA-1.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/src/native/adhan/recordings.json"
SRC_DIR="$ROOT/store-assets/adhan/src"
FULL_DIR="$ROOT/store-assets/adhan/full"
IOS_DIR="$ROOT/store-assets/adhan/ios"
RAW_DIR="$ROOT/android/app/src/main/res/raw"
mkdir -p "$SRC_DIR" "$FULL_DIR" "$IOS_DIR" "$RAW_DIR"

WITH_CANDIDATES=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --candidates) WITH_CANDIDATES=1 ;;
    --only) ONLY="$2"; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

# id <TAB> status <TAB> download <TAB> sha1 <TAB> trimStart <TAB> trimEnd
node -e '
  const m = require(process.argv[1]);
  for (const r of m.recordings) console.log([r.id, r.status, r.download, r.sha1 || "-", r.trim?.start ?? 0, r.trim?.end ?? ""].join("\t"));
' "$MANIFEST" > "$SRC_DIR/.list"

download() {   # id url sha1 → path of the cached original (empty on failure)
  local id="$1" url="$2" sha="$3" out
  if [[ "$url" == ia:* ]]; then
    # Internet Archive item: pick its first MP3/FLAC/WAV from the metadata API
    local item="${url#ia:}" name
    name="$(curl -fsSL --max-time 30 "https://archive.org/metadata/$item" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const f = (JSON.parse(s).files || []).map(x => x.name);
        console.log(f.find(n => /\.mp3$/i.test(n)) || f.find(n => /\.(flac|wav|ogg)$/i.test(n)) || "");
      });')" || name=""
    [ -n "$name" ] || { echo "   ✗ $id: archive.org metadata unreachable" >&2; return 0; }
    url="https://archive.org/download/$item/$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$name")"
  fi
  out="$SRC_DIR/$id.orig"
  if [ ! -s "$out" ]; then
    if ! curl -fsSL -A "NoorQuranAdhanFetch/1.0 (https://nuralquran.net)" --retry 2 --max-time 600 -o "$out.part" "$url"; then
      rm -f "$out.part"; echo "   ✗ $id: download failed ($url)" >&2; return 0
    fi
    mv "$out.part" "$out"
  fi
  if [ -n "$sha" ] && [ "$sha" != "-" ]; then
    local got; got="$(sha1sum "$out" | cut -d' ' -f1)"
    if [ "$got" != "$sha" ]; then echo "   ✗ $id: SHA-1 mismatch ($got ≠ $sha) — not used" >&2; return 0; fi
  else
    echo "   ! $id: no SHA-1 recorded yet — record $(sha1sum "$out" | cut -d' ' -f1) in recordings.json after listening" >&2
  fi
  echo "$out"
}

process() {   # id orig trimStart trimEnd
  local id="$1" in="$2" ss="$3" to="$4" range=()
  [ "$ss" != "0" ] && range+=(-ss "$ss")
  [ -n "$to" ] && range+=(-to "$to")
  # full: trim, mono, loudness -16 LUFS / -1.5 dBTP, short fades
  ffmpeg -nostdin -hide_banner -loglevel error -y "${range[@]}" -i "$in" -vn -ac 1 -ar 44100 \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.05,areverse,afade=t=in:d=1.2,areverse" \
    -c:a libmp3lame -b:a 64k "$FULL_DIR/$id.mp3"
  cp "$FULL_DIR/$id.mp3" "$RAW_DIR/adhan_$id.mp3"
  # iOS notification sound: ≤ 30 s (29.5 s with a 2 s fade-out), IMA4 CAF
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$FULL_DIR/$id.mp3" -t 29.5 -ac 1 \
    -af "afade=t=out:st=27.5:d=2,aresample=22050" -c:a adpcm_ima_qt "$IOS_DIR/nq_adhan_$id.caf"
  local dur; dur="$(ffprobe -v error </dev/null -show_entries format=duration -of csv=p=0 "$FULL_DIR/$id.mp3")"
  echo "   ✓ $id  (${dur%.*} s)"
}

echo "Adhan recordings:"
while IFS=$'\t' read -r id status url sha ss to; do
  [ -n "$ONLY" ] && [ "$id" != "$ONLY" ] && continue
  if [ "$status" != "bundled" ] && [ "$WITH_CANDIDATES" = 0 ] && [ -z "$ONLY" ]; then
    echo "   · $id: $status (skipped; use --candidates)"; continue
  fi
  orig="$(download "$id" "$url" "$sha")"
  [ -n "$orig" ] && process "$id" "$orig" "$ss" "$to"
done < "$SRC_DIR/.list"

# available.json = processed recordings that are cleared for release (status bundled)
node -e '
  const fs = require("fs"), path = require("path");
  const [manifest, fullDir, out] = process.argv.slice(1);
  const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const ids = m.recordings.filter(r => r.status === "bundled" && fs.existsSync(path.join(fullDir, r.id + ".mp3"))).map(r => r.id);
  fs.writeFileSync(out, JSON.stringify({ generated: "scripts/fetch-adhan.sh", ids }, null, 2) + "\n");
  console.log("available.json:", ids.join(", ") || "(none)");
' "$MANIFEST" "$FULL_DIR" "$ROOT/src/native/adhan/available.json"

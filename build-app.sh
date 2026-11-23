#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# نور القرآن — build the iOS / Android apps (Capacitor 8). Full guide: docs/APP.md
#
#   ./build-app.sh            install, test, build the app bundle, sync both platforms
#   ./build-app.sh android    … then open Android Studio
#   ./build-app.sh ios        … then open Xcode (macOS only)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "\n${GREEN}▸ $1${NC}"; }
die()  { echo -e "${RED}✗ $1${NC}" >&2; exit 1; }

echo -e "${GOLD}نور القرآن — App build${NC}"

step "Requirements"
command -v node >/dev/null || die "Node.js 22+ is required (nodejs.org)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || die "Node.js 22+ is required by the Capacitor 8 CLI (found $(node --version))"
echo "  node $(node --version) · npm $(npm --version)"

step "Install"
npm install

step "Unit tests (adhan schedule) + static native checks"
npm run test:native
npm run check:native

step "Web bundle + adhan audio → dist/ + cap sync"
npm run build:app

case "${1:-}" in
  android)
    step "Android Studio"; npx cap open android
    echo "  Release: Build ▸ Generate Signed App Bundle — or: cd android && ./gradlew bundleRelease (needs android/key.properties)";;
  ios)
    [[ "$OSTYPE" == darwin* ]] || die "Xcode needs macOS"
    step "Xcode"; npx cap open ios
    echo "  Release: select your Team, then Product ▸ Archive";;
  *)
    echo -e "\n${GOLD}Next:${NC} ./build-app.sh android | ./build-app.sh ios   (signing: docs/APP.md §7)";;
esac
echo -e "${GREEN}✓ done${NC}"

#!/bin/bash
# Upgrade only the LiveKit server binary (keys, certificate, config and Caddy stay as they are).
#   bash upgrade.sh            # the version pinned below
#   LIVEKIT_VERSION=1.x.y bash upgrade.sh
set -euo pipefail
LIVEKIT_VERSION="${LIVEKIT_VERSION:-1.13.11}"
case "$(uname -m)" in x86_64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "unsupported arch" >&2; exit 1 ;; esac
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
dl() { curl --proto '=https' --tlsv1.2 -fsSL --retry 3 -o "$2" "$1"; }
LK="livekit_${LIVEKIT_VERSION}_linux_${ARCH}.tar.gz"
base="https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}"
dl "$base/$LK" "$work/$LK"
dl "$base/checksums.txt" "$work/sums" || dl "$base/livekit_${LIVEKIT_VERSION}_checksums.txt" "$work/sums"
want=$(awk -v f="$LK" '$2==f || $2=="*"f {print $1}' "$work/sums" | head -1)
[ -n "$want" ] || { echo "no checksum for $LK" >&2; exit 1; }
if [ ${#want} -eq 128 ]; then got=$(sha512sum "$work/$LK" | awk '{print $1}'); else got=$(sha256sum "$work/$LK" | awk '{print $1}'); fi
[ "$got" = "$want" ] || { echo "checksum mismatch for $LK" >&2; exit 1; }
echo "checksum ok: $LK"
tar -xzf "$work/$LK" -C "$work"
bin=$(find "$work" -type f -name livekit-server | head -1)
[ -n "$bin" ] || { echo "livekit-server not found in $LK" >&2; exit 1; }
old=$(/opt/livekit/livekit-server --version 2>/dev/null || true)
install -m 0755 /opt/livekit/livekit-server /opt/livekit/livekit-server.prev 2>/dev/null || true
install -m 0755 "$bin" /opt/livekit/livekit-server
systemctl restart livekit
sleep 3
if systemctl is-active --quiet livekit && [ "$(curl -s -m 5 http://127.0.0.1:7880/)" = "OK" ]; then
  echo "upgraded: ${old:-?} -> $(/opt/livekit/livekit-server --version)"
else
  echo "new version failed to start; restoring the previous one" >&2
  journalctl -u livekit -n 20 --no-pager >&2
  install -m 0755 /opt/livekit/livekit-server.prev /opt/livekit/livekit-server && systemctl restart livekit
  exit 1
fi

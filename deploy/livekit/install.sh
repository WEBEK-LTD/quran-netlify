#!/bin/bash
# Install LiveKit (voice rooms of nuralquran.net) on the cPanel/WHM server, as root (WHM → Terminal).
#   bash install.sh                 # install or upgrade (keeps keys.yaml and certificates)
#   LIVEKIT_SHA256=<hash> bash install.sh   # also pin the exact archive hash you recorded the first time
# See README.md for the steps before (DNS, rtc subdomain, AutoSSL) and after (admin Integrations, cron).
set -euo pipefail

LIVEKIT_VERSION="${LIVEKIT_VERSION:-1.13.11}"   # pinned: github.com/livekit/livekit/releases
CADDY_VERSION="${CADDY_VERSION:-2.10.0}"      # pinned: github.com/caddyserver/caddy/releases
DOMAIN="${DOMAIN:-rtc.nuralquran.net}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "unsupported CPU $(uname -m)" >&2; exit 1 ;;
esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# download <url> <file> — https only, fail on HTTP errors
download() { curl --proto '=https' --tlsv1.2 -fsSL --retry 3 -o "$2" "$1"; }

# verify <archive> <checksums file>: the archive's line in the published checksums must match (SHA-256 or SHA-512)
verify() {
  local file=$1 sums=$2 name want got
  name=$(basename "$file")
  want=$(awk -v n="$name" '$2 == n || $2 == "*"n { print $1 }' "$sums")
  [ -n "$want" ] || { echo "no checksum for $name in $(basename "$sums")" >&2; exit 1; }
  if [ ${#want} -eq 128 ]; then got=$(sha512sum "$file" | awk '{print $1}'); else got=$(sha256sum "$file" | awk '{print $1}'); fi
  [ "$got" = "$want" ] || { echo "CHECKSUM MISMATCH for $name" >&2; exit 1; }
  echo "  checksum ok: $name"
}

echo "== LiveKit server v$LIVEKIT_VERSION"
LK="livekit_${LIVEKIT_VERSION}_linux_${ARCH}.tar.gz"
download "https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/$LK" "$work/$LK"
download "https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/checksums.txt" "$work/lk-checksums.txt" \
  || download "https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_checksums.txt" "$work/lk-checksums.txt"
verify "$work/$LK" "$work/lk-checksums.txt"
got=$(sha256sum "$work/$LK" | awk '{print $1}')
if [ -n "${LIVEKIT_SHA256:-}" ] && [ "$got" != "$LIVEKIT_SHA256" ]; then
  echo "archive hash $got differs from the pinned LIVEKIT_SHA256" >&2; exit 1
fi
echo "  sha256 $got  (record it: LIVEKIT_SHA256=$got)"
mkdir -p "$work/lk" && tar -xzf "$work/$LK" -C "$work/lk"
LK_BIN=$(find "$work/lk" -type f -name livekit-server | head -1)
[ -n "$LK_BIN" ] || { echo "livekit-server not found in $LK" >&2; exit 1; }

echo "== Caddy v$CADDY_VERSION (TLS front)"
CD="caddy_${CADDY_VERSION}_linux_${ARCH}.tar.gz"
download "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/$CD" "$work/$CD"
download "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_checksums.txt" "$work/caddy-checksums.txt"
verify "$work/$CD" "$work/caddy-checksums.txt"
mkdir -p "$work/cd" && tar -xzf "$work/$CD" -C "$work/cd"
CD_BIN=$(find "$work/cd" -type f -name caddy | head -1)
[ -n "$CD_BIN" ] || { echo "caddy not found in $CD" >&2; exit 1; }

echo "== user, files"
id livekit >/dev/null 2>&1 || useradd --system --home-dir /var/lib/livekit --shell /sbin/nologin livekit
install -d -o root -g root -m 0755 /opt/livekit
install -d -o livekit -g livekit -m 0750 /var/lib/livekit
install -d -o root -g livekit -m 0750 /etc/livekit /etc/livekit/tls
systemctl stop caddy-rtc livekit 2>/dev/null || true
install -o root -g root -m 0755 "$LK_BIN" /opt/livekit/livekit-server
/opt/livekit/livekit-server --version
install -o root -g root -m 0755 "$CD_BIN" /opt/livekit/caddy
/opt/livekit/caddy version
install -o root -g root -m 0755 "$HERE/livekit-cert-sync.sh" /opt/livekit/livekit-cert-sync.sh

# API key + secret: generated here once, kept only in /etc/livekit/keys.yaml (0600) and the admin Integrations
if [ ! -s /etc/livekit/keys.yaml ]; then
  KEY="API$(openssl rand -hex 6)"
  SECRET="$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)"
  umask 077
  printf '%s: %s\n' "$KEY" "$SECRET" > /etc/livekit/keys.yaml
  NEW_KEYS=1
else
  KEY=$(awk -F': ' 'NR==1{print $1}' /etc/livekit/keys.yaml)
  NEW_KEYS=0
fi
chown livekit:livekit /etc/livekit/keys.yaml
chmod 0600 /etc/livekit/keys.yaml   # LiveKit refuses a key file others can read

NODE_IP="${NODE_IP:-$(dig +short A "$DOMAIN" 2>/dev/null | tail -1)}"
[ -n "$NODE_IP" ] || NODE_IP=$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
echo "  node_ip = $NODE_IP (the A record of $DOMAIN)"
sed -e "s/__NODE_IP__/$NODE_IP/" -e "s/__API_KEY__/$KEY/" "$HERE/livekit.yaml" > /etc/livekit/livekit.yaml
install -o root -g livekit -m 0640 "$HERE/Caddyfile" /etc/livekit/Caddyfile
chown root:livekit /etc/livekit/livekit.yaml && chmod 0640 /etc/livekit/livekit.yaml
install -m 0644 "$HERE/livekit.service" "$HERE/caddy-rtc.service" "$HERE/livekit-cert-sync.service" "$HERE/livekit-cert-sync.timer" /etc/systemd/system/
install -m 0644 "$HERE/sysctl-livekit.conf" /etc/sysctl.d/90-livekit.conf
sysctl -q --system

echo "== certificate (AutoSSL → /etc/livekit/tls)"
/opt/livekit/livekit-cert-sync.sh || [ $? = 2 ]   # 2 = self-signed placeholder: works, but run AutoSSL (README step 2)

echo "== firewall"
bash "$HERE/firewall.sh"

echo "== services"
systemctl daemon-reload
systemctl enable --now livekit caddy-rtc livekit-cert-sync.timer
sleep 3
systemctl --no-pager --lines=0 status livekit caddy-rtc | grep -E '●|Active:|Memory|CPU' || true

echo
if [ "$NEW_KEYS" = 1 ]; then
  echo "================ copy into the site's admin → Integrations (shown once; also in /etc/livekit/keys.yaml) ================"
  echo "  livekit_url        = wss://$DOMAIN:7443"
  echo "  livekit_api_url    = http://127.0.0.1:7880"
  echo "  livekit_api_key    = $KEY"
  echo "  livekit_api_secret = $SECRET"
  echo "========================================================================================================================"
fi
echo "Next: bash $HERE/smoke-test.sh"

#!/bin/bash
# Copy the AutoSSL certificate of rtc.nuralquran.net (issued by cPanel for the rtc subdomain) to /etc/livekit/tls,
# where Caddy (wss:7443) and LiveKit's TURN/TLS (5349) read it. Restarts them only when the certificate changed.
# Run by livekit-cert-sync.timer every day; safe to run by hand: /opt/livekit/livekit-cert-sync.sh
set -euo pipefail
DOMAIN="${DOMAIN:-rtc.nuralquran.net}"
SRC="/var/cpanel/ssl/apache_tls/$DOMAIN/combined"   # private key + certificate + CA bundle, kept by cPanel/AutoSSL
DST=/etc/livekit/tls
mkdir -p "$DST"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ -r "$SRC" ]; then
  cp "$SRC" "$tmp/combined"
else
  # fallback: ask cPanel for the installed certificate of the domain
  json=$(/usr/local/cpanel/bin/whmapi1 --output=json fetch_ssl_certificates_for_fqdns domains="$DOMAIN" 2>/dev/null || true)
  if [ -z "$json" ]; then
    echo "No certificate for $DOMAIN: create the rtc subdomain in cPanel and run AutoSSL first (README step 2)." >&2
    exit 1
  fi
  /usr/libexec/platform-python - "$json" > "$tmp/combined" <<'PY'
import json, sys
d = json.loads(sys.argv[1])["data"]["payload"][0]
print(d["key"].strip()); print(d["crt"].strip()); print((d.get("cab") or "").strip())
PY
fi

# split: private key → privkey.pem, certificates in order (leaf, then chain) → fullchain.pem
awk -v key="$tmp/privkey.pem" -v crt="$tmp/fullchain.pem" '
  /-----BEGIN .*PRIVATE KEY-----/ { out = key }
  /-----BEGIN CERTIFICATE-----/   { out = crt }
  out != "" { print > out }
  /-----END .*-----/ { out = "" }' "$tmp/combined"
[ -s "$tmp/privkey.pem" ] && [ -s "$tmp/fullchain.pem" ] || { echo "could not split $SRC" >&2; exit 1; }

# the key must match the certificate, and the certificate must be for the domain and not expired
[ "$(openssl x509 -in "$tmp/fullchain.pem" -noout -pubkey | sha256sum)" = "$(openssl pkey -in "$tmp/privkey.pem" -pubout | sha256sum)" ] \
  || { echo "key does not match certificate" >&2; exit 1; }
openssl x509 -in "$tmp/fullchain.pem" -noout -checkend 0 >/dev/null || { echo "certificate expired: run AutoSSL" >&2; exit 1; }
openssl x509 -in "$tmp/fullchain.pem" -noout -checkhost "$DOMAIN" | grep -q 'does match' || { echo "certificate is not for $DOMAIN" >&2; exit 1; }

if cmp -s "$tmp/fullchain.pem" "$DST/fullchain.pem" && cmp -s "$tmp/privkey.pem" "$DST/privkey.pem"; then
  echo "certificate unchanged ($(openssl x509 -in "$DST/fullchain.pem" -noout -enddate))"
  exit 0
fi
install -o root -g livekit -m 0640 "$tmp/fullchain.pem" "$DST/fullchain.pem"
install -o root -g livekit -m 0640 "$tmp/privkey.pem" "$DST/privkey.pem"
echo "installed new certificate ($(openssl x509 -in "$DST/fullchain.pem" -noout -enddate))"
# Caddy reloads in place; LiveKit (TURN/TLS) needs a restart, which drops live rooms for a few seconds —
# the timer runs at 04:20, and the renewed certificate is valid for weeks anyway.
if systemctl is-active --quiet caddy-rtc; then systemctl restart caddy-rtc; fi
if systemctl is-active --quiet livekit; then systemctl restart livekit; fi

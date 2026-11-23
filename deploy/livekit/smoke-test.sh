#!/bin/bash
# Check the LiveKit install from the server (root): local + public signal, TLS certificates, TURN/TLS, the server API
# with a token signed by the real key, and (optionally) a short load test with the LiveKit CLI.
#   bash smoke-test.sh            # checks only
#   LOADTEST=1 bash smoke-test.sh # + 30 s load test: 1 audio publisher, 20 subscribers (needs `lk`, see README)
set -uo pipefail
DOMAIN="${DOMAIN:-rtc.nuralquran.net}"
ok=0; bad=0
pass() { echo "  ✓ $1"; ok=$((ok+1)); }
fail() { echo "  ✗ $1"; bad=$((bad+1)); }

echo "== services"
for s in livekit caddy-rtc; do systemctl is-active --quiet "$s" && pass "$s is running" || fail "$s is not running (journalctl -u $s -n 50)"; done
systemctl show livekit -p CPUQuotaPerSecUSec -p MemoryMax | tr '\n' ' '; echo

echo "== signal"
# right after a restart (e.g. a new certificate) LiveKit needs a few seconds
for i in $(seq 1 20); do [ "$(curl -s -m 2 http://127.0.0.1:7880/)" = "OK" ] && break; sleep 1; done
[ "$(curl -s -m 5 http://127.0.0.1:7880/)" = "OK" ] && pass "LiveKit answers on 127.0.0.1:7880" || fail "no answer on 127.0.0.1:7880"
[ "$(curl -s -m 10 "https://$DOMAIN:7443/")" = "OK" ] && pass "https://$DOMAIN:7443/ → OK (valid certificate)" || fail "https://$DOMAIN:7443/ failed (DNS? firewall? certificate?)"
end=$(echo | openssl s_client -connect "$DOMAIN:7443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)
[ -n "$end" ] && pass "TLS 7443 certificate: $end" || fail "no TLS on 7443"

echo "== TURN/TLS 5349"
end=$(echo | timeout 10 openssl s_client -connect "$DOMAIN:5349" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)
[ -n "$end" ] && pass "TURN/TLS certificate: $end" || fail "no TLS on 5349"

echo "== listening sockets"
ss -lntup 2>/dev/null | grep -E 'livekit|caddy' | awk '{print "   ", $1, $5}' | sort -u | head -12

echo "== server API (Twirp) with a token signed by /etc/livekit/keys.yaml"
KEY=$(awk -F': ' 'NR==1{print $1}' /etc/livekit/keys.yaml); SECRET=$(awk -F': ' 'NR==1{print $2}' /etc/livekit/keys.yaml)
b64u() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64u)
p=$(printf '{"iss":"%s","nbf":%d,"exp":%d,"video":{"roomList":true}}' "$KEY" $((now-10)) $((now+300)) | b64u)
sig=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$SECRET" -binary | b64u)
code=$(curl -s -o /tmp/lk-smoke.json -w '%{http_code}' -m 10 -X POST -H "Authorization: Bearer $h.$p.$sig" -H 'Content-Type: application/json' \
  -d '{}' http://127.0.0.1:7880/twirp/livekit.RoomService/ListRooms)
[ "$code" = 200 ] && pass "ListRooms → 200 ($(cat /tmp/lk-smoke.json | head -c 120))" || fail "ListRooms → HTTP $code (key/secret?)"
rm -f /tmp/lk-smoke.json

echo "== webhook target"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST -H 'Content-Type: application/webhook+json' -d '{}' https://api.nuralquran.net/v1/livekit/webhook)
[ "$code" = 401 ] && pass "API webhook reachable (unsigned request → 401 as expected)" || fail "API webhook answered $code (expected 401)"

if [ "${LOADTEST:-0}" = 1 ]; then
  echo "== load test (30 s)"
  if command -v lk >/dev/null 2>&1; then
    lk load-test --url "wss://$DOMAIN:7443" --api-key "$KEY" --api-secret "$SECRET" --room smoke-load \
      --audio-publishers 1 --subscribers 20 --duration 30s && pass "load test finished" || fail "load test failed"
  else
    fail "lk (LiveKit CLI) not installed — see README «Load test»"
  fi
fi
echo; echo "$ok passed, $bad failed"; [ "$bad" = 0 ]

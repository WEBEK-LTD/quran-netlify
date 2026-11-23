#!/bin/bash
# Open the LiveKit ports (run as root). Works with CSF (common next to cPanel/Imunify360) or firewalld (CloudLinux 9).
#   TCP 7443        wss:// signal (Caddy → LiveKit 7880; 7880 itself stays closed)
#   TCP 7881        WebRTC over TCP (fallback when UDP is blocked)
#   UDP 50000-60000 WebRTC media
#   UDP 3478        TURN/UDP
#   TCP 5349        TURN/TLS (networks that only allow TLS)
# Imunify360 with FIREWALL.port_blocking_mode = ALLOW does not block these by itself; it is checked below.
set -euo pipefail
TCP="7443,7881,5349"
UDP="3478,50000:60000"

if command -v csf >/dev/null 2>&1 && [ -f /etc/csf/csf.conf ]; then
  echo "== CSF"
  cp -a /etc/csf/csf.conf "/etc/csf/csf.conf.bak-livekit-$(date +%Y%m%d%H%M%S)"
  add() { # add <KEY> <ports>: append ports that are missing to a CSF list
    local key=$1 ports=$2 cur new
    cur=$(sed -n "s/^$key = \"\(.*\)\"/\1/p" /etc/csf/csf.conf)
    new=$cur
    IFS=, read -ra list <<< "$ports"
    for p in "${list[@]}"; do
      case ",$new," in *",$p,"*) ;; *) new="${new:+$new,}$p" ;; esac
    done
    sed -i "s/^$key = \".*\"/$key = \"$new\"/" /etc/csf/csf.conf
    echo "$key = \"$new\""
  }
  add TCP_IN "$TCP"; add TCP6_IN "$TCP"; add UDP_IN "$UDP"; add UDP6_IN "$UDP"
  csf -r >/dev/null && echo "csf reloaded"
elif systemctl is-active --quiet firewalld; then
  echo "== firewalld"
  for p in 7443 7881 5349; do firewall-cmd --permanent --add-port="$p/tcp" >/dev/null; done
  firewall-cmd --permanent --add-port=3478/udp >/dev/null
  firewall-cmd --permanent --add-port=50000-60000/udp >/dev/null
  firewall-cmd --reload >/dev/null
  firewall-cmd --list-ports
else
  echo "No CSF or firewalld found: open TCP $TCP and UDP $UDP in your firewall by hand." >&2
fi

if command -v imunify360-agent >/dev/null 2>&1; then
  echo "== Imunify360"
  imunify360-agent config show 2>/dev/null | grep -i 'port_blocking_mode' || true
  echo "(ALLOW = Imunify360 leaves port filtering to the firewall above.)"
  imunify360-agent blocked-port list 2>/dev/null | grep -E '\b(7443|7881|5349|3478|5[0-9]{4})\b' && echo "!! a LiveKit port is in Imunify360's blocked-port list — remove it" || true
fi
echo "Port 7880 (LiveKit signal, plain HTTP) must NOT be opened."

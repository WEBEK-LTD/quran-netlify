#!/bin/bash
# Installs the nuralquran.net → Netlify proxy on host.webek.org (run as root).
# Usage: bash install-proxy.sh <netlify-site-name>     e.g. bash install-proxy.sh noor-alquran
set -euo pipefail

SITE="${1:?usage: bash install-proxy.sh <netlify-site-name, without .netlify.app>}"
DOMAIN=nuralquran.net
HERE="$(cd "$(dirname "$0")" && pwd)"

# The site must answer on its Netlify address before we point the domain at it.
code=$(curl -s -o /dev/null -w '%{http_code}' "https://$SITE.netlify.app/")
[ "$code" = "200" ] || { echo "https://$SITE.netlify.app/ answered $code, expected 200. Check the site name."; exit 1; }

CP_USER=$(/scripts/whoowns "$DOMAIN" || true)
[ -n "$CP_USER" ] || { echo "No cPanel account owns $DOMAIN. Create it in WHM first."; exit 1; }

SSL_DIR="/etc/apache2/conf.d/userdata/ssl/2_4/$CP_USER/$DOMAIN"
STD_DIR="/etc/apache2/conf.d/userdata/std/2_4/$CP_USER/$DOMAIN"
mkdir -p "$SSL_DIR" "$STD_DIR"
sed "s/NETLIFY_SITE/$SITE/g" "$HERE/apache-proxy.conf" > "$SSL_DIR/nuralquran-proxy.conf"
cp "$HERE/apache-https-redirect.conf" "$STD_DIR/nuralquran-https.conf"

/scripts/rebuildhttpdconf
if ! /usr/sbin/apachectl -t; then
  echo "Apache config test failed; removing the new files and rebuilding."
  rm -f "$SSL_DIR/nuralquran-proxy.conf" "$STD_DIR/nuralquran-https.conf"
  /scripts/rebuildhttpdconf
  exit 1
fi
/scripts/restartsrv_httpd

echo "--- checks ---"
curl -sI "https://$DOMAIN/" | head -3
curl -sI "http://www.$DOMAIN/" | grep -i -E '^(HTTP|location)'

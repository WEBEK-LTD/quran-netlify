#!/usr/bin/env bash
# Local end-to-end run: fresh database → install via HTTP → smoke test → stop server.
# Requires a local MySQL/MariaDB with a database + user you can drop/recreate:
#   DB_NAME=nq_test DB_USER=nq DB_PASS=nqpass123 api/tests/run-local.sh
set -euo pipefail
API_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${DB_NAME:-nq_test}"; DB_USER="${DB_USER:-nq}"; DB_PASS="${DB_PASS:-nqpass123}"
PORT="${PORT:-8080}"
MYSQL="${MYSQL:-mysql}"

if [ -f "$API_DIR/config.php" ]; then
  echo "Refusing to run: $API_DIR/config.php exists (move it away first)." >&2; exit 2
fi
$MYSQL -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
rm -rf "$API_DIR/storage/mail" "$API_DIR/storage/avatars"   # photos belong to the dropped database

# upload limits as in public/.user.ini (php -S ignores .user.ini)
php -d upload_max_filesize=6M -d post_max_size=8M -S "127.0.0.1:$PORT" -t "$API_DIR/public" "$API_DIR/public/index.php" > "$API_DIR/storage/logs/dev-server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -f "$API_DIR/config.php"' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done

set +e
php "$API_DIR/tests/smoke.php" --base="http://127.0.0.1:$PORT" --install \
  --db-name="$DB_NAME" --db-user="$DB_USER" --db-pass="$DB_PASS" --local="$API_DIR"
STATUS=$?
set -e
exit $STATUS

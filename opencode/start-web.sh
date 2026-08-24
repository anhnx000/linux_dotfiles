#!/usr/bin/env bash
# Start the Andy opencode web stack:
#   - opencode web on an internal port (basic auth, random password)
#   - login proxy on the public port 2349 (login form + brand + reverse proxy)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT="${OPENCODE_PORT:-2349}"                     # public: login proxy
UPSTREAM_PORT="${OPENCODE_UPSTREAM_PORT:-2351}"   # internal: opencode web
BRAND="${OPENCODE_BRAND:-Andy opencode}"
HOST="${OPENCODE_CANONICAL_HOST:-localhost}"
SESSION_ID="${OPENCODE_SESSION_ID:-ses_fd790f7faffemWKvfQMgGceih9}"
# base64 of http://localhost:2349 (matches opencode web route encoding);
# must encode the PUBLIC port so the browser talks to the proxy, not upstream.
SERVER_B64="$(printf 'http://%s:%s' "$HOST" "$PORT" | base64 -w0 2>/dev/null || printf 'http://%s:%s' "$HOST" "$PORT" | base64)"
SESSION_PATH="/server/${SERVER_B64}/session/${SESSION_ID}"

mkdir -p "$ROOT/.run"
LOG_WEB="$ROOT/.run/opencode-web.log"
LOG_PROXY="$ROOT/.run/brand-proxy.log"
PID_WEB="$ROOT/.run/opencode-web.pid"
PID_PROXY="$ROOT/.run/brand-proxy.pid"
AUTH_STORE="$ROOT/.run/auth.json"
UPSTREAM_SECRET="$ROOT/.run/upstream-password"

cleanup_pid() {
  local f="$1"
  if [[ -f "$f" ]]; then
    local p
    p="$(cat "$f" 2>/dev/null || true)"
    if [[ -n "${p:-}" ]] && kill -0 "$p" 2>/dev/null; then
      kill "$p" 2>/dev/null || true
      sleep 0.3
      kill -9 "$p" 2>/dev/null || true
    fi
    rm -f "$f"
  fi
}

if [[ "${1:-}" == "stop" ]]; then
  cleanup_pid "$PID_PROXY"
  cleanup_pid "$PID_WEB"
  echo "stopped"
  exit 0
fi

# login credentials (username + scrypt hash, no plaintext on disk)
if [[ ! -f "$AUTH_STORE" ]]; then
  echo "No login credentials yet. Create them first:" >&2
  echo "  node $ROOT/auth.mjs set-password <username> <password>" >&2
  exit 1
fi

# shared secret between the proxy and the upstream opencode server
if [[ ! -f "$UPSTREAM_SECRET" ]]; then
  (umask 077; node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))' > "$UPSTREAM_SECRET")
fi
chmod 600 "$UPSTREAM_SECRET"
UPSTREAM_USER="opencode"
UPSTREAM_PASS="$(cat "$UPSTREAM_SECRET")"

# free stale listeners if any
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  fuser -k "${UPSTREAM_PORT}/tcp" 2>/dev/null || true
fi
cleanup_pid "$PID_PROXY"
cleanup_pid "$PID_WEB"

# headless web server (no auto browser), behind basic auth
OPENCODE_SERVER_USERNAME="$UPSTREAM_USER" \
OPENCODE_SERVER_PASSWORD="$UPSTREAM_PASS" \
  nohup opencode web --port "$UPSTREAM_PORT" --hostname 127.0.0.1 >"$LOG_WEB" 2>&1 &
echo $! >"$PID_WEB"

# wait until upstream answers (401 = up and secured; no credentials in argv)
for _ in $(seq 1 50); do
  code="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${UPSTREAM_PORT}/" || true)"
  if [[ "$code" == "200" || "$code" == "401" ]]; then
    break
  fi
  sleep 0.2
done

OPENCODE_UPSTREAM="http://127.0.0.1:${UPSTREAM_PORT}" \
OPENCODE_UPSTREAM_USER="$UPSTREAM_USER" \
OPENCODE_UPSTREAM_PASSWORD="$UPSTREAM_PASS" \
BRAND_PROXY_PORT="$PORT" \
OPENCODE_BRAND="$BRAND" \
OPENCODE_CANONICAL_HOST="$HOST" \
OPENCODE_SESSION_PATH="$SESSION_PATH" \
  nohup node "$ROOT/brand-proxy.mjs" >"$LOG_PROXY" 2>&1 &
echo $! >"$PID_PROXY"

sleep 0.5
URL="http://${HOST}:${PORT}${SESSION_PATH}"
echo "Andy opencode web"
echo "  UI:       $URL"
echo "  login:    http://${HOST}:${PORT}/__login  (user: $(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");console.log(JSON.parse(s).user)' "$AUTH_STORE"))"
echo "  upstream: http://127.0.0.1:${UPSTREAM_PORT}/ (basic auth, internal)"
echo "  session:  $SESSION_ID"
echo "  stop:     bash $ROOT/start-web.sh stop"
echo "  logs:     $LOG_WEB  |  $LOG_PROXY"

# open browser if available
if command -v xdg-open >/dev/null 2>&1; then
  (setsid xdg-open "$URL" >/dev/null 2>&1 &) || true
fi

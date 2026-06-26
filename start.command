#!/usr/bin/env bash
# Prism — One-Click Launcher (macOS)
# Mirrors start.bat for Windows. Localhost-only by design; .env is left untouched.

set -u

printf '\033]0;Prism - Starting...\007'
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "============================================"
echo "  Prism - One-Click Launcher (macOS)"
echo "============================================"
echo

# ── [1/5] Node.js ────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    echo "[1/5] Node.js not found."
    echo "      Install Node 22 LTS via Homebrew:"
    echo "          brew install node@22 && brew link --overwrite node@22"
    echo "      Or download from https://nodejs.org"
    echo "      Then re-run this script."
    read -n 1 -s -r -p "Press any key to exit..."
    echo
    exit 1
else
    echo "[1/5] Node.js found: $(node --version)"
fi

# ── [2/5] .env ───────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo "[2/5] Creating .env from .env.example..."
    cp .env.example .env
    echo "IMPORTANT: Edit .env with your secrets before first use."
    echo "           Opening .env now..."
    open -e .env
    echo
    read -n 1 -s -r -p "Press any key after you have saved .env..."
    echo
else
    echo "[2/5] .env already exists."
fi

# ── [3/5] Dependencies ───────────────────────────────────────────────────────
echo "[3/5] Installing dependencies (first run may take a minute)..."
(cd packages/shared && npm install --prefer-offline 2>/dev/null && npm run build)
(cd packages/config && npm install --prefer-offline 2>/dev/null && npm run build)
(cd apps/api && npm install --prefer-offline 2>/dev/null)
(cd apps/web && npm install --prefer-offline 2>/dev/null)

echo "[4/5] Dependencies ready."

# ── .env sanity warning (no auto-patch per user preference) ──────────────────
# If NEXT_PUBLIC_API_BASE_URL is still the Windows LAN IP, the web build will
# emit that URL into the frontend bundle and same-origin auth will break on
# Mac. We warn but do not edit .env.
if grep -q "NEXT_PUBLIC_API_BASE_URL=http://192.168.0.202" .env 2>/dev/null; then
    echo
    echo "!! WARNING: NEXT_PUBLIC_API_BASE_URL in .env points at 192.168.0.202"
    echo "!!          (the Windows host). On Mac, set it to /api for same-origin"
    echo "!!          auth, or to http://localhost:8787 for a direct call."
    echo
fi

# ── Data directory ───────────────────────────────────────────────────────────
mkdir -p apps/api/data

# ── Local-network access (private by default) ────────────────────────────────
# Resolve the same way the API does: an explicit PRISM_LAN_ACCESS (env or .env)
# wins, otherwise the persisted in-app toggle (apps/api/data/network.json),
# otherwise OFF. When ON, the web server binds to all interfaces so other
# devices on your network can reach it.
LAN_ACCESS_RAW="${PRISM_LAN_ACCESS:-}"
if [ -z "$LAN_ACCESS_RAW" ] && [ -f ".env" ]; then
    LAN_ACCESS_RAW="$(grep -E '^[[:space:]]*PRISM_LAN_ACCESS[[:space:]]*=' .env | tail -n1 | cut -d= -f2- | tr -d '"'\'' \r' || true)"
fi
WEB_BIND_HOST="127.0.0.1"
WEB_LAN_FLAG="0"
case "$(printf '%s' "$LAN_ACCESS_RAW" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) WEB_BIND_HOST="0.0.0.0"; WEB_LAN_FLAG="1" ;;
    "")
        if [ -f "apps/api/data/network.json" ] && grep -Eq '"lanAccessEnabled"[[:space:]]*:[[:space:]]*true' "apps/api/data/network.json"; then
            WEB_BIND_HOST="0.0.0.0"; WEB_LAN_FLAG="1"
        fi
        ;;
esac

echo "[5/5] Starting servers..."
echo
echo "============================================"
echo "  API:  http://localhost:18787"
echo "  Web:  http://localhost:3000"
if [ "$WEB_LAN_FLAG" = "1" ]; then
    echo "  Local network access: ON (reachable from other devices)"
else
    echo "  Local network access: OFF (private to this machine)"
fi
echo "============================================"
echo
echo "Press Ctrl+C to stop both servers."
echo

# ── Cleanup trap ─────────────────────────────────────────────────────────────
API_PID=""
cleanup() {
    echo
    echo "Shutting down..."
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        kill "$API_PID" 2>/dev/null || true
        wait "$API_PID" 2>/dev/null || true
    fi
}
trap cleanup INT TERM EXIT

# ── Start API in background ──────────────────────────────────────────────────
# --env-file-if-exists silently no-ops when .env is missing (Node 22+).
# Without it, OPENAI_API_KEY / OLLAMA_HOST / etc. from .env never reach the
# API process and every OpenAI chat turn 401s with a cryptic "invalid key".
echo "Starting API..."
PRISM_WEB_PORT=3000 \
node --env-file-if-exists=.env --experimental-strip-types apps/api/src/server.ts &
API_PID=$!

# Give the API a moment to claim its port before the web build runs.
sleep 1

# ── Build web for production ─────────────────────────────────────────────────
echo "Building frontend for production..."
(cd apps/web && npm run build)
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed."
    exit 1
fi

if [ ! -f "apps/web/.next/standalone/apps/web/server.js" ]; then
    echo "ERROR: Standalone frontend server was not generated."
    exit 1
fi

# Next.js "output: standalone" does not copy static assets or the public
# folder into the standalone bundle. Without these, the browser loads the
# HTML document but every JS/CSS/font request 404s, leaving a blank page.
echo "Staging static assets into standalone bundle..."
if [ -d "apps/web/.next/static" ]; then
    mkdir -p "apps/web/.next/standalone/apps/web/.next/static"
    cp -R apps/web/.next/static/. "apps/web/.next/standalone/apps/web/.next/static/"
fi
if [ -d "apps/web/public" ]; then
    mkdir -p "apps/web/.next/standalone/apps/web/public"
    cp -R apps/web/public/. "apps/web/.next/standalone/apps/web/public/"
fi

# ── Start web (foreground) ───────────────────────────────────────────────────
echo "Starting frontend in production mode..."
HOSTNAME="$WEB_BIND_HOST" PRISM_WEB_LAN="$WEB_LAN_FLAG" PORT=3000 \
    node apps/web/.next/standalone/apps/web/server.js

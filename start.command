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

echo "[5/5] Starting servers..."
echo
echo "============================================"
echo "  API:  http://localhost:8787"
echo "  Web:  http://localhost:3000"
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
HOSTNAME=127.0.0.1 PORT=3000 node apps/web/.next/standalone/apps/web/server.js

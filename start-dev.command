#!/usr/bin/env bash
# Prism — Dev Launcher (macOS)
# Mirrors start-dev.bat. Web :3003 + API :8788 against localai-dev.db.
# Can run alongside start.command (prod on :3000/:8787) without conflict.

set -u

printf '\033]0;Prism (dev)\007'
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "============================================"
echo "  Prism - Dev Launcher (macOS)"
echo "  Web:  http://localhost:3003"
echo "  API:  http://localhost:8788"
echo "  DB:   apps/api/data/localai-dev.db"
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

# Source the root .env into this shell so every child process inherits it.
# The API already picks up .env via `node --env-file-if-exists=.env`, but
# `next dev` runs from apps/web/ and Next.js only reads .env files from
# its own working directory — it never sees the repo-root .env. Sourcing
# here is how NEXT_PUBLIC_* vars (API_BASE_URL, etc.) defined
# once at the repo root actually reach the web dev server.
if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

# ── [3/5] Dependencies ───────────────────────────────────────────────────────
echo "[3/5] Installing dependencies (first run may take a minute)..."
(cd packages/shared && npm install --prefer-offline 2>/dev/null && npm run build)
(cd packages/config && npm install --prefer-offline 2>/dev/null && npm run build)
(cd apps/api && npm install --prefer-offline 2>/dev/null)
(cd apps/web && npm install --prefer-offline 2>/dev/null)

echo "[4/5] Dependencies ready."

# ── Data directory ───────────────────────────────────────────────────────────
mkdir -p apps/api/data

echo "[5/5] Starting watch-mode dev servers..."
echo
echo "Press Ctrl+C to stop."
echo

# ── Preflight: kill stale dev listeners ──────────────────────────────────────
# Without this, a stale `node --watch` holds the SQLite WAL + API port,
# causing `npm run dev` to crash with "database is locked" on the API side
# while Turbopack still prints "Ready in 0ms" from its warm cache on the web
# side — the classic false-success "ready in 0ms" bug.
echo "Cleaning up any leftover dev processes..."
for port in 8788 3003; do
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "  Killing PID(s) on port $port: $pids"
        # shellcheck disable=SC2086
        kill -9 $pids 2>/dev/null || true
    fi
done

# ── Cleanup trap ─────────────────────────────────────────────────────────────
API_PID=""
cleanup() {
    echo
    echo "Web dev server stopped. Closing API..."
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        kill "$API_PID" 2>/dev/null || true
        wait "$API_PID" 2>/dev/null || true
    fi
}
trap cleanup INT TERM EXIT

# ── API in watch mode, dev DB, background ────────────────────────────────────
# --env-file-if-exists=.env silently no-ops when .env is absent (Node 22+).
# Without it, OPENAI_API_KEY / OLLAMA_HOST / etc. from .env never reach the
# API and every OpenAI chat turn 401s with a cryptic "invalid key".
echo "Starting API (watch, dev DB)..."
DB_PATH="$(pwd)/apps/api/data/localai-dev.db" \
API_PORT=8788 \
NEXT_TELEMETRY_DISABLED=1 \
node --env-file-if-exists=.env --watch --experimental-strip-types apps/api/src/server.ts &
API_PID=$!

# Brief settle so the API claims :8788 before Next dev probes it.
sleep 1

# ── Web dev server (foreground) ──────────────────────────────────────────────
cd apps/web
LOCALAI_API_ORIGIN=http://127.0.0.1:8788 \
NEXT_TELEMETRY_DISABLED=1 \
HOSTNAME=127.0.0.1 \
PORT=3003 \
npx next dev -H 127.0.0.1 -p 3003

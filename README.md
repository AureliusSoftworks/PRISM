# Prism

A local-first AI playground. The fidelity and per-account isolation of
ChatGPT Gov, the systems-focus and creative-permission of FL Studio. Runs
headless on your Windows machine and reachable across the LAN from any
device. Every account is its own sandbox — encrypted memory, customizable
chatbots, OpenAI image generation, forkable conversations, markdown export.

**Current release:** v0.1.0. See [CHANGELOG.md](CHANGELOG.md) for release notes.

**Branch model:** `main` holds tagged, released versions only; all active
development happens on `dev`. Every release is a merge of `dev` into `main`
with a matching `CHANGELOG.md` entry and a semver tag.

## Architecture

```
[Phone/Desktop] → Nginx (:80) → Frontend (:3000) + API (:8787)
                                          │
                              ┌────────────┼────────────┐
                              │            │            │
                          SQLite      Qdrant       Ollama (host)
                       (users, chats,  (vector      (local LLM)
                        memories,      memory
                        exports)       search)
```

## Quick Start (Docker)

```bash
# 1. Clone/copy repo to your Windows host
# 2. Create .env from example
cp .env.example .env
# Edit .env with your secrets (ENCRYPTION_MASTER_KEY, OPENAI_API_KEY, etc.)

# 3. Start everything
docker compose up -d

# 4. Access from any device on your network
# http://<windows-hostname-or-ip>
```

## Quick Start (Dev / Mac)

```bash
cd /Users/jared/Documents/LocalAI-local
cp .env.example .env
npm install --prefix packages/shared
npm install --prefix packages/config
npm install --prefix apps/api
npm install --prefix apps/web
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `8787` | API server port |
| `SESSION_COOKIE_NAME` | `localai_session` | Session cookie key |
| `SESSION_TTL_HOURS` | `24` | Session lifetime |
| `ENCRYPTION_MASTER_KEY` | (dev default) | Master key for per-user key wrapping |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Default local model |
| `OPENAI_API_KEY` | (empty) | Global fallback OpenAI key |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant vector DB URL |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | Frontend API base |

## Features

- **Per-user auth** with encrypted session cookies
- **Post-auth Hub** with two mode tiles, each carrying a 5-colour prism glyph:
  - **Chat** — a calm, stripped-down "personal Prism" surface (sidebar + history + typing + send). The only compose-adjacent control is an **Incognito** pill that doubles as an online/offline toggle: on = this send is local-only and bypasses memory; off = saved provider + normal memory pipeline.
  - **Sandbox** — the full command-center experience (bots, provider toggle + lock, fork/export, images, advanced settings). No Incognito, no cross-session memory — the thread is its own memory.
  Mode is mirrored to the URL (`?view=chat` / `?view=sandbox`) so refreshes preserve the current surface.
- **Strict data isolation** — every query is tenant-scoped by `user_id`
- **Mode-specific memory model**:
  - Chat gets cross-thread personal-fact memory (extracted preferences in the `memories` table + Qdrant similarity recall across conversations), surfaced in the Settings sidebar.
  - Sandbox gets a silent, thread-scoped **rolling compaction summary** that kicks in when a thread outgrows the 30-message live window. Stored only in SQLite, never indexed into Qdrant, never surfaced in the sidebar — pure context plumbing so long Sandbox threads don't go amnesiac. Nothing ever crosses between threads.
  - Incognito opts out of both paths for the turn and forces the provider to LOCAL.
- **Customizable chatbots** with system prompts, temperature, and model overrides
- **Forkable chats** — branch from any message in a conversation (Sandbox)
- **Per-chat deletion** — remove individual chats from the sidebar (subtle × that embosses red on hover, click-to-confirm) or from the chat header. **Press-and-hold any × (or the header Delete button) for ~1 s** to clear *every* chat at once: on pointerdown every × immediately glows red and tilts to its own small angle; at the 900 ms threshold the whole row shakes like iOS edit-mode while a centered confirmation modal ("Delete all chats?" · Cancel / Delete all) takes over the decision. Release before the threshold to snap the ×'s back. Messages and exports are purged; generated images and extracted memories are preserved.
- **OpenAI image generation** (DALL-E 3) with gallery (Sandbox)
- **Conversation export** to Markdown files persisted in the database (Sandbox)
- **Mobile-first UI** — responsive chat interface with slide-out sidebar
- **Dark/light themes** per user
- **Self-serve account deletion** from Settings
- **Automatic 60-day inactive account cleanup**

## Windows Headless Startup

### Option A: Docker Desktop auto-start (recommended)
Docker Desktop can be configured to start at login and auto-start compose stacks.

### Option B: Scheduled Task
Run `scripts/windows-install-startup-task.ps1` as Administrator to register a task that starts the stack at login.

### Option C: Manual
Place a shortcut to `scripts/windows-startup.bat` in `shell:startup`.

### Option D: One-click native launcher (no Docker)
Double-click `start.bat` at the repo root. On first run it verifies/installs Node 22 LTS (via Chocolatey if needed), creates `.env` from `.env.example` and opens it in Notepad for your secrets, installs all workspace dependencies, then builds and launches both services:

- **API** runs in a secondary console titled *"LocalAI API"* via `node --experimental-strip-types apps/api/src/server.ts` and listens on `0.0.0.0:8787`.
- **Frontend** is built with Next.js `output: "standalone"` and served by `node .next/standalone/apps/web/server.js` on `0.0.0.0:3000`. `start.bat` also stages `.next/static/` and `public/` into the standalone bundle after each build — without this step the browser would load HTML successfully but all JS/CSS would 404.

Session cookies work same-origin because Next's `rewrites()` proxies `/api/*` to `127.0.0.1:8787` server-side. You only need to open **port 3000** on the LAN; port 8787 should stay closed.

One-time Windows Firewall rule for LAN access (PowerShell as admin):
```powershell
New-NetFirewallRule -DisplayName "Prism Frontend" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
```

## Backup & Restore

### SQLite
```bash
# Export
docker compose cp api:/app/apps/api/data/localai.db ./backup-localai.db

# Restore
docker compose cp ./backup-localai.db api:/app/apps/api/data/localai.db
docker compose restart api
```

### Qdrant
```bash
# Qdrant data lives in the `qdrant_data` Docker volume
docker run --rm -v localai-local_qdrant_data:/data -v $(pwd):/backup alpine tar czf /backup/qdrant-backup.tar.gz /data
```

## Privacy posture

Prism is built so that the `LOCAL` mode toggle is a real invariant, not a suggestion:

- **LOCAL mode is strict**: chat routes exclusively through Ollama at `OLLAMA_HOST`. No heuristic can escalate a LOCAL turn to an external provider. Enforced by the unit test in `apps/api/src/__tests__/providers.test.ts`.
- **OpenAI-only features are gated**: image generation calls OpenAI DALL-E, so it is refused server-side (and hidden client-side) whenever the effective mode is LOCAL.
- **No outbound telemetry**: Next.js anonymous telemetry is disabled via `NEXT_TELEMETRY_DISABLED=1` (set in the web Dockerfile and `.env.example`). If you run `npm run dev` directly on your shell instead of via Docker, export the same variable or run `npx next telemetry disable` once. The API process makes no telemetry calls.
- **Outbound surface** (exhaustive): Ollama at `OLLAMA_HOST`, Qdrant at `QDRANT_URL`, and — only in ONLINE mode — `api.openai.com`. Any reviewer adding a new `fetch(` to a non-config host needs an explicit mode gate. See `DESIGN.md` for details.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Failed to fetch" on frontend | Ensure API container is running: `docker compose logs api` |
| Ollama not responding | Verify Ollama is running on host and `OLLAMA_HOST` is correct |
| Can't access from phone | Check Windows firewall allows inbound traffic on port 80 (Docker flow) or port 3000 (native `start.bat` flow) |
| Blank page / white screen over LAN but tab title shows | Next.js standalone output is missing `static/` or `public/`. Re-run `start.bat` (it stages them automatically), or manually `xcopy /E /Y /I ".next\static" ".next\standalone\apps\web\.next\static"` from `apps\web` after `next build` |
| Frontend error banner shows raw HTML / "Unexpected token" | The API isn't responding on 8787. Check the *"LocalAI API"* console window for a stack trace; the `api()` helper in `apps/web/src/app/page.tsx` now parses non-JSON bodies defensively, so the real cause will surface on the banner |
| Qdrant connection refused | `docker compose logs qdrant` — may need to recreate volume |
| Login works but chat fails | Check `ENCRYPTION_MASTER_KEY` matches between restarts |

## Testing

```bash
npm run test --prefix apps/api    # Unit tests
npm run lint --prefix apps/api    # TypeScript lint
npm run lint --prefix apps/web    # ESLint
```

## Future

- Bot-to-bot sandbox conversations
- Streaming token responses
- Cloud backup adapters (S3/R2)
- Richer profile and role system

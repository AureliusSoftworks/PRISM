# Prism

A local-first AI playground. The fidelity and per-account isolation of
ChatGPT Gov, the systems-focus and creative-permission of FL Studio. Runs
headless on a user-owned machine and reachable across the LAN from any
trusted device. Every account is its own sandbox — encrypted memory,
customizable chatbots, OpenAI image generation, forkable conversations,
Markdown rendering in chat and Markdown conversation export.

**Current release:** v0.1.0 (first production build). See [CHANGELOG.md](CHANGELOG.md) for release notes.

**Branch model:** `main` holds tagged, released versions only; all active
development happens on `dev`. Every release is a merge of `dev` into `main`
with a matching `CHANGELOG.md` entry and a semver tag.

## Get Prism Server (GitHub Releases)

The **`server/v<version>`** draft or published release lists **primary** server
artifacts for end users (replace `<version>` with the semver, e.g. `0.1.0`):

| Platform | File on the release |
|----------|----------------------|
| macOS | `Prism-Server-v<version>.dmg` |
| Windows (installer) | `Prism-Server-Setup-v<version>-win-x64.exe` |
| Windows (portable folder) | `Prism-Server-v<version>-win-x64-portable.zip` |
| Linux x86_64 | `Prism-Server-v<version>-linux-x64.tar.gz` |

**Developers / audit:** `prism-server-v<version>-bundle.tar.gz` is a **trimmed
source tree export** (not a turnkey runtime). Use it for inspection, custom
builds, or advanced Linux-from-source workflows — not as the default Linux
download (use the Linux row above).

Workflows: draft + bundle asset from **Release Pipeline (dev -> main)**; platform
builds from **Release Prism Server (all platforms)** (one run) or individual
`release-server-*.yml` workflows. See [docs/release-process.md](docs/release-process.md).

### Local `dev` push guardrail (temporary)

To reduce accidental branch damage without paid GitHub branch-protection
features, this repo currently uses a local `pre-push` hook at
`.git/hooks/pre-push` that blocks:

- deleting `dev` (`git push origin :dev`)
- non-fast-forward updates to `dev` (force-style history rewrites)

This is a **local safety net only** (per clone/machine), not server-side
enforcement. If you clone the repo to a new machine, re-install this hook
there as well.

**Local safety guardrails:** no-cost `dev` safeguards are available
via `bash scripts/install_git_safeguards.sh`. See
[docs/git-safeguards.md](docs/git-safeguards.md).

## App icons

Vector sources live under [`design/app-icons/`](design/app-icons/). **Prism
Client** (web, iOS, macOS Prism.app) uses the dark-field prismatic triangle;
**Prism Server** (macOS server app, Windows exe + installer) uses a white field
with a solid black triangle. Regenerate PNG/ICO/app-icon sets after editing
the SVGs (requires macOS `qlmanage` plus Python [Pillow](https://pypi.org/project/pillow/)):

```bash
python3 scripts/render-app-icons.py
```

## App Store Split Roadmap

Prism's planned Apple distribution model is a two-binary split:

- **Prism Server** — the open-source local runtime for Mac, Windows, or Linux,
  distributed from GitHub Releases.
- **Prism iOS/Mac** — the official paid native App Store client that discovers,
  pairs with, and controls a user-owned Prism Server.

The existing web UI remains the reusable Prism interface, but the paid client
owns native pairing, distribution, session storage, and app-shell presentation.

Planning docs:

- [App Store distribution model](docs/app-store-distribution.md)
- [Mobile API contract](docs/mobile-api-contract.md)
- [Native client MVP](docs/native-client-mvp.md)
- [App Store review checklist](docs/app-store-review.md)
- [Licensing and brand model](docs/licensing-and-brand.md)
- [Production readiness gate](docs/production-readiness-gate.md)
- [Release process (dev -> main)](docs/release-process.md)
- [Prism Server.app build and release](docs/prism-server-app.md)
- [Prism.app client build and pairing](docs/prism-client-app.md)
- [Prism iOS client build and pairing](docs/prism-ios-client.md)

## Prism Server.app (macOS)

Prism Server.app is the native macOS Dock app for the server runtime. It
packages the Node API, managed Memory Engine, and local setup flow into a
signed/notarized desktop app distributed as a DMG from GitHub Releases. It
does not expose the web dashboard as the user-facing product path.

Local build:

```bash
xcodebuild \
  -project "apps/server-mac/PrismServer.xcodeproj" \
  -scheme PrismServer \
  -configuration Debug \
  -derivedDataPath "apps/server-mac/DerivedData" \
  build
```

The Debug build writes:

```text
apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app
```

The user-facing target is plug-and-play: Prism Server.app can run a managed
Qdrant sidecar (or use an external Qdrant URL), detect existing Ollama/model
installs, and guide any missing setup from a clear first-run screen. See
[docs/prism-server-app.md](docs/prism-server-app.md) for setup, signing,
notarization, and release steps.

## Prism Server for Windows

Prism Server for Windows is the native tray-app server runtime distributed as a
per-user Inno Setup wizard. It installs `Prism Server.exe`, the staged Node
runtime, bundled `node.exe`, and bundled `qdrant.exe` under
`%LOCALAPPDATA%\Programs\Prism Server`, while config/data/logs live under
`%LOCALAPPDATA%\Prism`.

The tray app mirrors the Mac server flow: Setup, readiness checks, managed
Memory Engine startup, local Ollama/model detection, logs, start/stop/restart,
and pairing-code generation for native clients. It also adds a default-on
"Start Prism Server when I sign in" installer option and a normal Apps &
Features uninstaller. See [docs/prism-server-app-windows.md](docs/prism-server-app-windows.md).

**On a Mac:** you cannot compile the WPF app locally; run **Actions → Build Windows server portable (artifact)** (or `scripts/trigger-windows-portable-build.sh`) to get the same portable ZIP the release pipeline uses, then copy it to the PC.

Release builds use `.github/workflows/release-server-windows.yml`
and upload to the same `server/v<version>` GitHub Release as the Mac DMG.
The existing `start.bat` remains as a legacy/dev fallback for headless Windows
startup, not the primary user-facing Windows distribution path.

## Prism Server for Linux

Headless **x86_64** bundle with vendored Node and Qdrant: download
`Prism-Server-v<version>-linux-x64.tar.gz` from the `server/v<version>` release,
extract, optionally run `./qdrant` in a second terminal, then `./start.sh`.
Produced by `.github/workflows/release-server-linux.yml` (after the draft
`server/v*` release exists). Local packaging: `scripts/package-linux-server-release.sh 0.1.0`.

## Prism.app (macOS Client)

Prism.app is the native client shell for the paid app experience. The current
Debug build pairs with a running Prism Server.app by accepting a short code from
the server window, storing the returned session locally, and loading the paired
server's `/prism` interface in a WebKit kiosk window.

Local build:

```bash
xcodebuild \
  -project "apps/client-mac/PrismClient.xcodeproj" \
  -scheme PrismClient \
  -configuration Debug \
  -derivedDataPath "apps/client-mac/DerivedData" \
  build
```

The Debug build writes:

```text
apps/client-mac/DerivedData/Build/Products/Debug/Prism.app
```

## Prism iOS Client

Prism iOS is the iPhone-first hybrid client. It handles native pairing and
Keychain-backed session storage, then opens the mobile-friendly Prism interface
in a WebKit kiosk.

Local simulator build:

```bash
xcodebuild \
  -project "apps/ios-client/PrismIOS.xcodeproj" \
  -scheme PrismIOS \
  -configuration Debug \
  -derivedDataPath "apps/ios-client/DerivedData" \
  -sdk iphonesimulator \
  build
```

Quick launch shortcuts:

```bash
prism ios      # Simulator
prism phone    # Paired physical iPhone
```

## Architecture

```
[Phone/Desktop] → Nginx (:80) → Frontend (:18788) + API (:18787)
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
ollama pull llama3.2
ollama pull nomic-embed-text
npm install --prefix packages/shared
npm install --prefix packages/config
npm install --prefix apps/api
npm install --prefix apps/web
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `18787` | API server port |
| `WEB_PORT` / `PORT` | `18788` | Web frontend port |
| `PRISM_SERVER_NAME` | `Prism Server` | Friendly name returned by readiness checks and future pairing/discovery flows |
| `PRISM_DISCOVERY_ENABLED` | `true` | Advertise Prism Server on the LAN as `_prism._tcp` for future native clients |
| `SESSION_COOKIE_NAME` | `localai_session` | Session cookie key |
| `SESSION_TTL_HOURS` | `24` | Session lifetime |
| `ENCRYPTION_MASTER_KEY` | (dev default) | Master key for per-user key wrapping |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Default local model |
| `OLLAMA_AUXILIARY_MODEL` | `llama3.2` | Mandatory local model for Prism's internal title, starter, summary, and memory-critic calls |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Mandatory local embedding model for memory vectors and Qdrant search |
| `OPENAI_API_KEY` | (empty) | Global fallback OpenAI key |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant vector DB URL |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | Frontend API base |

## Features

- **Per-user auth** with encrypted session cookies
- **Optional second Ollama host** — add another LAN Ollama machine from Settings, merge its offline models into Prism's local model lists, and route selected models back to the correct host.
- **Dedicated system models** — user-facing chat can use local or OpenAI, but Prism's internal titles, starters, summaries, memory critic, and embeddings always stay local on mandatory Ollama models (`llama3.2` + `nomic-embed-text`).
- **Native-client web gate** — the hosted web shell requires a paired Prism client access token, so direct browser visits show an app-required screen instead of bypassing the client.
- **Post-auth Hub** with 5-colour prism-glyph mode tiles:
  - **Chat** — a calm, stripped-down "personal Prism" surface (sidebar + history + typing + send). The only compose-adjacent control is an **Incognito** pill that doubles as an online/offline toggle: on = this send is local-only and bypasses memory; off = saved provider + normal memory pipeline.
  - **Sandbox** — the full command-center experience (bots, provider toggle + lock, fork/export, images, advanced settings). No Incognito, no cross-session memory — the thread is its own memory.
  - **Story**, **Library**, and other disabled roadmap tiles preview future bot experiences before their shells are built.
  Mode is mirrored to the URL (`?view=chat` / `?view=sandbox`) so refreshes preserve the current surface.
- **Strict data isolation** — every query is tenant-scoped by `user_id`
- **Mode-specific memory model**:
  - Chat gets cross-thread personal-fact memory (extracted preferences in the `memories` table + Qdrant similarity recall across conversations), surfaced in the Settings sidebar.
  - Candidate memories pass through an LLM validation critic plus deterministic policy gates before they are saved, so role-confused prompts and malformed model output are cleaned up or skipped instead of becoming durable bubbles.
  - Sandbox gets a silent, thread-scoped **rolling compaction summary** that kicks in when a thread outgrows the 30-message live window. Stored only in SQLite, never indexed into Qdrant, never surfaced in the sidebar — pure context plumbing so long Sandbox threads don't go amnesiac. Nothing ever crosses between threads.
  - Incognito opts out of both paths for the turn and forces the provider to LOCAL.
- **Customizable chatbots** with a structured profile builder, OCEAN-inspired personality sliders, temperature, model overrides, and optional delete protection for favorite bots (composed into the model system prompt)
- **Expanded bot glyph picker** with hundreds of Lucide-backed glyphs alongside the original inline set
- **Forkable chats** — branch from any message in a conversation (Sandbox)
- **Auto-generated chat titles** — first replies trigger a background local `llama3.2` pass that gives saved conversations short sidebar titles.
- **Markdown in message bubbles** — assistant and user messages render GitHub-flavored Markdown safely in the thread (`react-markdown` + `remark-gfm`); the compose field is plain text.
- **Per-chat deletion** — remove individual chats from the sidebar (subtle × that embosses red on hover, click-to-confirm) or from the chat header. **Press-and-hold any × (or the header Delete button) for ~1 s** to clear *every* chat at once: on pointerdown every × immediately glows red and tilts to its own small angle; at the 900 ms threshold the whole row shakes like iOS edit-mode while a centered confirmation modal ("Delete all chats?" · Cancel / Delete all) takes over the decision. Release before the threshold to snap the ×'s back. Messages and exports are purged; generated images and extracted memories are preserved.
- **OpenAI image generation** (DALL-E 3) with gallery (Sandbox)
- **Conversation export** to Markdown files persisted in the database (Sandbox)
- **Mobile-first UI** — responsive chat interface with slide-out sidebar
- **Dark/light themes** per user
- **Change password** from Settings (Account actions)
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
Double-click `start.bat` at the repo root. On first run it verifies/installs Node 22 LTS (via Chocolatey if needed), creates `.env` from `.env.example` and opens it in Notepad for your secrets, installs all workspace dependencies, then launches both services.

`start.bat` is the single Windows launcher:

- On the `dev` branch, double-clicking defaults to watch-mode dev servers (`Web :18790`, `API :18789`, dev DB).
- On other branches, double-clicking defaults to production mode.
- You can force either mode explicitly with `start.bat dev` or `start.bat prod`.

Production mode:

- **API** runs in a secondary console titled *"LocalAI API"* via `node --experimental-strip-types apps/api/src/server.ts` and listens on `0.0.0.0:18787`.
- **Frontend** is built with Next.js `output: "standalone"` and served by `node .next/standalone/apps/web/server.js` on `0.0.0.0:18788`. `start.bat` also stages `.next/static/` and `public/` into the standalone bundle after each build — without this step the browser would load HTML successfully but all JS/CSS would 404.

Session cookies work same-origin because Next's `rewrites()` proxies `/api/*` to `127.0.0.1:18787` server-side. You only need to open **port 18788** on the LAN; port 18787 should stay closed unless pairing native clients.

Native Prism clients use a different path: they discover the API directly via
Bonjour/DNS-SD (`_prism._tcp`) and then pair with a short-lived code generated
from Settings. For native-client pairing, the API port advertised by
`API_PORT` must be reachable on the local network. Default Docker bridge
networking may not expose mDNS advertisements to the LAN, so manual URL entry
remains the fallback there unless host networking or an mDNS reflector is added.

One-time Windows Firewall rule for LAN access (PowerShell as admin):
```powershell
New-NetFirewallRule -DisplayName "Prism Frontend" -Direction Inbound -Protocol TCP -LocalPort 18788 -Action Allow -Profile Private,Domain
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
| Can't access from phone | Check Windows firewall allows inbound traffic on port 80 (Docker flow) or port 18788 (native `start.bat` flow) |
| Blank page / white screen over LAN but tab title shows | Next.js standalone output is missing `static/` or `public/`. Re-run `start.bat` (it stages them automatically), or manually `xcopy /E /Y /I ".next\static" ".next\standalone\apps\web\.next\static"` from `apps\web` after `next build` |
| Frontend error banner shows raw HTML / "Unexpected token" | The API isn't responding on 18787. Check the *"LocalAI API"* console window for a stack trace; the `api()` helper in `apps/web/src/app/page.tsx` now parses non-JSON bodies defensively, so the real cause will surface on the banner |
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

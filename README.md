# Prism

**Prism** is a local-first AI environment that routes intelligence across local models, cloud APIs, memory, tools, and bots — giving users visibility and control over where their work happens.

It is not “just” a chat app or a generic model wrapper. Prism is a **modular intelligence environment**: different **modes** (tiles) are different lenses on the same accounts, memory, and providers. **Chat** (full playground), **Zen** (calm companion lane), and **Coffee** ship today. Other tiles are placeholders or future ideas — see [Feature status](#feature-status).

One intent can fan out across paths the way light splits through a prism: local inference, cloud when it earns its place, memory recall, tools, bot personalities, and (planned) richer agent-style workflows — while the UI stays **one calm surface**. Prism is **local-first**, not local-only: the goal is to keep routine, private, and inexpensive work on hardware you control, and to reach for cloud APIs when the task needs extra capability, ambiguity handling, planning depth, or difficult reasoning.

Over time, Prism is intended to act as an **OpenAI-compatible meta-provider** so external clients (for example Cursor, Continue, or Cline) could connect through it, with routing, budgets, and policy living in a first-class **Core** module (planned), not buried-only settings.

The fidelity and per-account isolation of ChatGPT Gov, the systems-focus and creative permission of FL Studio — still guiding stars. Runs headless on a user-owned machine and across the LAN from trusted devices: encrypted memory, customizable bots, optional cloud image generation, forkable threads, Markdown in chat, and Markdown export.

**Current release:** v0.1.0 (first production build). See [CHANGELOG.md](CHANGELOG.md) for release notes.

**Branch model:** `main` holds tagged, released versions only; all active
development happens on `dev`. Every release is a merge of `dev` into `main`
with a matching `CHANGELOG.md` entry and a semver tag.

## The Core vision

- **One request** enters Prism (from you or, someday, from a connected client).
- **Prism** decides the best route under rules you can see and change.
- **Routes** can include a local model, a cloud model, memory lookup, a tool call, a bot-led interaction, or (planned) a multi-step agent workflow.
- **The experience** stays unified — same hub, same threads, same respect for tenancy.
- **You** can inspect and steer routing: what ran where, and what escalated.

Today, routing is explicit (for example local vs online chat modes and provider picks). The **Core** module is the planned home for deeper automation of those decisions.

## Why Core matters

- **Surprise bills:** Core is the intended place for budgets, caps, and escalation rules so cloud use never sneaks past you.
- **Visibility:** clear readouts of local vs cloud usage, not a black box.
- **Control:** define when Prism may step up to a stronger model, and when it must stay local.
- **External tools:** Core-backed OpenAI-compatible endpoints are how Prism becomes a **personal intelligence gateway**, not only an app you open by hand.
- **Product shape:** Core turns “a server with settings” into an operational center — providers, routing, API keys, logs, and policy in one first-class tile.

## Intended architecture (future)

This is a **directional** sketch, not a promise of every box shipping tomorrow:

```text
User / Client
      ↓
  PRISM Core
      ↓
Router / Policy / Budget / Memory
      ↓
Local Models | Cloud APIs | Tools | Bots | Agent tasks
      ↓
Unified response
```

The repo today implements the API, web hub, memory engine, and provider wiring on your machine. **Intelligent meta-routing, the Core tile, and a public meta-provider surface are planned** — see [Feature status](#feature-status).

## Feature status

### Implemented

- **Chat** — Full playground: bots, provider/model controls, fork and export, images (OpenAI when online, or local Ollama image checkpoints when offline), memory tuned for experimentation, advanced settings. Optional **focus layout** for a calmer single-thread view (same thread; routing unchanged).
- **Zen** — Focused one-on-one conversation with a selected bot/model and continuity-oriented memory.
- **Coffee** — Group-table mode: multiple bots in one session, autonomous reactions and turns, with room for you to join gently. **Starter topics** — when you start a session, you pick a shared table topic from three suggested chips (or type your own under “Other…”) before the arrival animation and session timer begin; the bots stay loosely anchored to that topic in their routing and replies. **Coffee Groups** can turn on **auto topic** so the server quietly picks one of the generated suggestions and skips the picker. **Table settings** (reply length, energy, cross-talk, rhythm sliders, “stay on thread,” “give me the last word”) are chosen **before you join** (Coffee setup on the hub), **saved per Coffee session** on the server, and shape both the **LLM prompts** and the **web client’s autoplay timing**. Your last choices are also remembered in the browser as defaults for the next new table. The API still exposes `PATCH /api/coffee/sessions/:id/settings` for programmatic updates. The memory option **“Recent sessions too”** currently behaves like **this session only** until true cross-thread recall exists, so the product does not over-promise.
- **Hub & tenancy** — Authenticated accounts, strict per-user data isolation, pairing for native clients, and mode tiles mirrored in the URL (`?view=…`).

### Planned first-class modules

- **Core** — Operational center: providers, routing, budgets, model usage, API compatibility, logs, and local/cloud policy — including the future meta-provider role for external clients.
- **Pseudo** — Almost-code workspace: half sketch, half system — rough intent toward structured plans or code-adjacent artifacts.
- **Gym** — Space for bot training, memory refinement, and behavior shaping.

### Exploratory / not active

Tiles or ideas such as **Feed**, **Games**, **Polling**, **Story**, **Surf**, and **Arena** may appear in the UI as disabled previews or docs-only concepts. Treat them as **exploratory**, not shipped product, unless explicitly called out in release notes.

## Get Prism Desktop (GitHub Releases)

Prism is moving to a **single desktop app** distribution model (one install
that includes the full local stack). During migration, some release assets are
still emitted through transitional `server/v*` and `client/v*` lanes.

Primary target desktop artifacts:

| Platform | Target file on release |
|----------|------------------------|
| macOS | `Prism-Desktop-v<version>.dmg` |
| Windows (installer) | `Prism-Desktop-Setup-v<version>-win-x64.exe` |
| Windows (portable folder) | `Prism-Desktop-v<version>-win-x64-portable.zip` |
| Linux x86_64 | `Prism-Desktop-v<version>-linux-x64.tar.gz` |

Transitional server-lane artifacts currently still in use in automation:

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

## Legacy Prism Client Lane (transitional)

The old **`client/v<version>`** release lane exists as migration scaffolding
while desktop packaging is being unified. It should not be treated as the
long-term product split.

| Platform | File on the release | Notes |
|----------|----------------------|-------|
| macOS | `Prism-v<version>.dmg` | Developer ID signed and notarized; signing pipeline is a follow-up. |
| iPhone | (none) | Add to Home Screen from Safari pointed at your Prism Server. |
| Windows / Linux | (none yet) | Future scaffolds; see [docs/distribution-model.md](docs/distribution-model.md). |

Pairing requires a **license code** issued through Patreon (subscription) or
the one-time purchase store. See
[docs/distribution-model.md](docs/distribution-model.md) for the full
licensing model and per-platform delivery details.

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

## Distribution Model

Prism is an indie product. Distribution is direct, not via app stores:

- **Prism Desktop** — paid desktop app for macOS/Windows/Linux that includes
  the local stack in one install.
- **Prism on iPhone** — delivered as a Progressive Web App (PWA). Open the
  server URL in Safari and "Add to Home Screen." **No App Store, no
  TestFlight, no native iOS binary.**
- **Legacy split artifacts** (`Prism Server` + `Prism Client`) remain
  transitional while release automation is being migrated.

Purchases happen through **Patreon** (monthly subscription, ongoing updates
included) or a separate one-time purchase store (Gumroad / Lemonsqueezy /
similar — choice deferred). Both paths issue a **license code**, which the
client passes during pairing so the server can verify entitlement. One license
code works on every platform the user owns — the same code activates the
Mac DMG, the Windows client (when it exists), and the iPhone PWA.

The licensing model is JetBrains-style: one-time purchase = current version
on all platforms, perpetual personal use of that version; subscription =
always-current on all platforms with ongoing updates; cancellation keeps the
last entitled version.

Canonical reference: [Distribution model](docs/distribution-model.md).

Planning and operator docs:

- [Distribution model](docs/distribution-model.md) — positioning + licensing
- [Technical design](DESIGN.md) — implemented stack, memory pipeline, provider contracts, privacy invariants
- [Release process (dev -> main)](docs/release-process.md) — operator runbook
- [Prism Desktop app build and packaging](docs/prism-desktop-app.md)
- [Desktop runtime layout](docs/desktop-runtime-layout.md) — staged API/web runtime shape and data/log paths
- [Steam desktop release lane](docs/steam-desktop-release.md)
- [Prism Server.app build and release](docs/prism-server-app.md)
- [Prism.app client build and pairing](docs/prism-client-app.md)
- [Prism iPhone client (PWA + archived native)](docs/prism-ios-client.md)
- [Mobile API contract](docs/mobile-api-contract.md)
- [Licensing and brand model](docs/licensing-and-brand.md)
- [Production readiness gate](docs/production-readiness-gate.md)

Historical (App Store path, no longer the active plan):

- [App Store distribution model](docs/app-store-distribution.md) — superseded by `distribution-model.md`
- [App Store review checklist](docs/app-store-review.md) — retained for archive
- [Native client MVP](docs/native-client-mvp.md) — original native iOS scope, now superseded by the PWA approach

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
Qdrant sidecar (or use an external Qdrant URL), auto-install Ollama via
Homebrew when available, pull missing required models, and guide any remaining
setup from a clear first-run screen. See
[docs/prism-server-app.md](docs/prism-server-app.md) for setup, signing,
notarization, and release steps.

## Prism Server for Windows

Prism Server for Windows is the native tray-app server runtime distributed as a
per-user Inno Setup wizard. It installs `Prism Server.exe`, the staged Node
runtime, bundled `node.exe`, and bundled `qdrant.exe` under
`%LOCALAPPDATA%\Programs\Prism Server`, while config/data/logs live under
`%LOCALAPPDATA%\Prism`.

The tray app mirrors the Mac server flow: Setup, readiness checks, managed
Memory Engine startup, one-click Ollama install via winget (when available),
missing-model downloads, logs, start/stop/restart, and pairing-code generation
for native clients. It also adds a default-on
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

## Prism on iPhone (PWA)

The iPhone shipping path is a Progressive Web App served by Prism Server.
Users open the server URL in **Safari**, complete the standard pairing flow
(server URL + pairing code + license code), then tap **Share -> Add to Home
Screen** to install a springboard launcher that opens Prism in a chromeless,
kiosk-style window. No App Store. No TestFlight. No download. See
[docs/prism-ios-client.md](docs/prism-ios-client.md) for the manifest and
Apple-specific meta-tag setup the web shell needs.

### Archived: Native iOS Client (deprecated)

The Xcode project at `apps/ios-client/` is **deprecated** under the indie
distribution model and is no longer the iOS shipping path. It is retained for
archive only; see the deprecation banner at the top of
[docs/prism-ios-client.md](docs/prism-ios-client.md). The local simulator
build still works if you need to inspect the archived native shell:

```bash
xcodebuild \
  -project "apps/ios-client/PrismIOS.xcodeproj" \
  -scheme PrismIOS \
  -configuration Debug \
  -derivedDataPath "apps/ios-client/DerivedData" \
  -sdk iphonesimulator \
  build
```

Quick launch shortcuts (still functional against the archived project):

```bash
prism ios      # Simulator
prism phone    # Paired physical iPhone
```

## Current stack (simplified)

Typical self-hosted layout today (Docker or native). This is **deployment topology**, not the full future “Core + router” picture above.

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
cd /path/to/this/repo
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
| `OLLAMA_IN_APP_PULL_MODEL` | `flux2-klein` | Model name allowed for `POST /api/ollama/pull-primary` streaming pull (must remain a flux2-klein registry name) |
| `OLLAMA_AUXILIARY_MODEL` | `llama3.2` | Mandatory local model for Prism's internal title, starter, summary, memory-critic, memory-inference, and **per-bot image prompt suggestions** (Images panel) |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Mandatory local embedding model for memory vectors and Qdrant search |
| `OPENAI_API_KEY` | (empty) | Global fallback OpenAI key |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant vector DB URL |
| `COMFYUI_HOST` | (empty) | Optional dev default ComfyUI base URL (`http://127.0.0.1:8188`); per-user URL in Settings overrides |
| `COMFYUI_GENERATION_TIMEOUT_MS` | `600000` | Max wait (ms) for ComfyUI to finish a txt2img job after `/prompt` — increase when large checkpoints take many minutes to load into VRAM (allowed range 120000–1800000) |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | Frontend API base |

## Features

- **Per-user auth** with encrypted session cookies
- **Images panel** — Browse generated pictures; pick **DALL·E 2** or **DALL·E 3** when online, or a local image checkpoint when **LOCAL**. Options include **Ollama** checkpoints whose names match a simple heuristic (install with `ollama pull …`), **ComfyUI** checkpoints discovered from the **ComfyUI server** URL you enter in Settings, and **workflow JSON files on that ComfyUI machine** (listed as `comfyui-remote:…` when Prism can reach the server). Normal Comfy **Save** (graph-editor) workflows are converted server-side using ComfyUI’s `/object_info` (or `/workflow_to_prompt` when available); **Save (API format)** is also supported. Prism injects your image prompt into typical txt2img-style graphs (CLIP text nodes, latent size when present). Stock checkpoint mode still uses **CheckpointLoaderSimple** txt2img (SDXL-style vs Flux-flavored sampling inferred from the filename). Your chosen image model is **saved with your account** (survives API restarts). ComfyUI often listens on port **8188**; the Prism API must be able to reach that address (same Mac or LAN).
- **Optional second Ollama host** — add another LAN Ollama machine from Settings, merge its offline models into Prism's local model lists, and route selected models back to the correct host.
- **Dedicated system models** — user-facing chat can use local or OpenAI, but Prism's internal titles, starters, summaries, memory critic, and embeddings always stay local on mandatory Ollama models (`llama3.2` + `nomic-embed-text`). In Settings → **Defaults & fallbacks**, **Preferred default Prism LLM** lets each account override the internal text model for those Prism-only calls (leave **Auto** to use `OLLAMA_AUXILIARY_MODEL`). The sibling **Preferred LLM for in-chat image requests** (optional local model) routes only turns where your message looks like an in-thread image ask—the model that may emit `sendGeneratedImage` JSON—so your everyday chat model can stay strict while a chosen model handles image-tool turns; **Auto** keeps the normal hub model. Pixel generation still uses your saved **local/online image** defaults (Comfy, Ollama image checkpoints, DALL·E, etc.).
- **Native-client web gate** — the hosted web shell requires a paired Prism client access token, so direct browser visits show an app-required screen instead of bypassing the client.
- **Post-auth Hub** with prism-glyph mode tiles. **Chat**, **Zen**, and **Coffee** are live; other tiles are disabled placeholders or exploratory previews.
  - **Zen** — companion-style timeline: a steady default Prism companion and an ongoing thread that reopens when you return to Zen.
  - **Chat** — command center for experimentation (bot switching, provider/model controls, fork/export, images, advanced settings). Optional **focus layout**: calmer full-width chrome for the **current** Chat thread only; memory and routing rules unchanged.
  - **Coffee** — group table: several bots in one session with autonomous beats and gentle space for you to step in.
  - **Story**, **Library**, and similar disabled tiles are **not** committed features; they preview possible future shells.
  Mode is mirrored to the URL: **`?view=chat`** is Zen (companion lane), **`?view=sandbox`** is Chat (playground), **`?view=coffee`** is Coffee — so refreshes preserve the current surface.
- **Strict data isolation** — every query is tenant-scoped by `user_id`
- **Mode-specific memory model**:
  - Zen keeps cross-thread personal-fact memory (extracted preferences in the `memories` table + Qdrant similarity recall across conversations) and also maintains a thread compaction summary for long-running sessions.
  - Candidate memories pass through an LLM validation critic plus deterministic policy gates before they are saved, so role-confused prompts and malformed model output are cleaned up or skipped instead of becoming durable bubbles.
  - Chat (playground) gets a thread-scoped **rolling compaction summary** that kicks in when a thread outgrows the live window. Stored only in SQLite, never indexed into Qdrant, and used as internal context plumbing so long Chat threads don't go amnesiac. Nothing ever crosses between threads.
  - Incognito opts out of both paths for the turn and forces the provider to LOCAL.

## When to use Zen vs Chat vs Coffee

- **Use Zen when you want continuity** — journaling, long-form personal threads, or a calm "stay with me" companion rhythm.
- **Use Chat when you want control** — testing different bots/models, trying tools, or running structured experiments.
- **Use Coffee when you want a small group** — several bots in one room, emergent cross-talk, and a lighter way to drop in than running parallel solo chats.
- **Rule of thumb:** Zen is for relationship continuity; Chat is for lab-style iteration; Coffee is for social, multi-bot energy.
- **Customizable chatbots** with a structured profile builder, OCEAN-inspired personality sliders, temperature, chat-model overrides, optional **per-bot image model** defaults (local + OpenAI), a left-rail sheet for model routing, and optional delete protection for favorite bots (composed into the model system prompt)
- **Expanded bot glyph picker** with hundreds of Lucide-backed glyphs alongside the original inline set
- **Forkable chats** — branch from any message in a conversation (Chat / playground)
- **Auto-generated chat titles** — first replies trigger a background local `llama3.2` pass that gives saved conversations short sidebar titles.
- **AskQuestion bot tool** — assistants can optionally end a turn with a Prism `<<<PRISM_TOOL>>>` JSON envelope; the transcript stores clean prose plus structured payload, and the chat surface shows three tappable chips (same visual language as "Talk to me!" starters) until the user sends another message. The same envelope may include **`sendGeneratedImage`** so the bot can synthesize an image **in-thread** (Zen or Chat): your text appears first, then a follow-up assistant bubble shows the picture. Images save to your **Images library** with the usual bot attribution and persona-aware prompting.
- **Bot portability** — export/import individual bots as Markdown files (profile + settings + bot-scoped memories) from the Bots panel.
- **Markdown in message bubbles** — assistant and user messages render GitHub-flavored Markdown safely in the thread (`react-markdown` + `remark-gfm`); the compose field is plain text.
- **Per-chat deletion** — remove individual chats from the sidebar (subtle × that embosses red on hover, click-to-confirm) or from the chat header. **Press-and-hold any × (or the header Delete button) for ~1 s** to clear *every* chat at once: on pointerdown every × immediately glows red and tilts to its own small angle; at the 900 ms threshold the whole row shakes like iOS edit-mode while a centered confirmation modal ("Delete all chats?" · Cancel / Delete all) takes over the decision. Release before the threshold to snap the ×'s back. Messages and exports are purged; generated images and extracted memories are preserved.
- **OpenAI + local image generation** (DALL·E when online; Ollama/ComfyUI when LOCAL) with gallery; persona-aware prompts thread-linked images in **Zen** and **Chat**
- **Conversation export** to Markdown files persisted in the database (Chat / playground)
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
- **Composer `/dev …` shortcuts (web)** — intercepted locally only (`/dev askquestion` forces an AskQuestion chip preview; `/dev help` lists commands). On by default during `npm run dev`; enable in production builds with **`NEXT_PUBLIC_PRISM_DEV_COMMANDS=1`** in `.env.example`.

Session cookies work same-origin because the Next app **server-side** forwards `/api/*` to `127.0.0.1:18787` (see `apps/web/src/app/api/[[...path]]/route.ts` — this avoids the short default timeout on `next.config` rewrites, which would cut off long ComfyUI/Ollama image runs). You only need to open **port 18788** on the LAN; port 18787 should stay closed unless pairing native clients.

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

**Generated images** are also part of local data: each run stores pixels under **`generated-images/{userId}/`** — downloaded from OpenAI when online, written from **Ollama** or **ComfyUI** when **LOCAL**. When **`LOCALAI_DATA_DIR`** is set (native server apps and some deployments), that tree is anchored there **even if `DB_PATH` points elsewhere**. Rows in SQLite store a relative path (`local_rel_path`) and a **`/api/images/…/file`** URL for display — not the expiring provider-hosted link from OpenAI. The UI loads **`/api/images/…/thumb`** (a small WebP next to the PNG on disk) for chat and gallery tiles so scrolling stays smooth; opening the lightbox still uses the full **`/file`** image.

### Qdrant
```bash
# Qdrant data lives in the `qdrant_data` Docker volume
docker run --rm -v localai-local_qdrant_data:/data -v $(pwd):/backup alpine tar czf /backup/qdrant-backup.tar.gz /data
```

## Factory reset (local)

Prism includes a terminal factory reset command for a clean local slate.

macOS / Linux shell:

```bash
prism reset
prism reset --force
```

Windows PowerShell:

```powershell
.\scripts\prism.ps1 reset
.\scripts\prism.ps1 reset --force
```

What the reset removes:
- local account/chat SQLite data (`localai.db`, `localai.db-wal`, `localai.db-shm`)
- generated image files
- local Qdrant storage folders
- local runtime logs/cache folders

What it intentionally keeps:
- launcher configuration files (for example `.env`)

By default, `prism reset` asks you to type `RESET` before deleting anything. Use `--force` only for non-interactive scripts.

## Privacy posture

Prism is built so that the `LOCAL` mode toggle is a real invariant, not a suggestion:

- **LOCAL mode is strict**: chat routes exclusively through Ollama at `OLLAMA_HOST`. No heuristic can escalate a LOCAL turn to an external provider. Enforced by the unit test in `apps/api/src/__tests__/providers.test.ts`.
- **OpenAI vs local images**: when the effective mode is **ONLINE**, image generation uses OpenAI DALL·E. When **LOCAL**, Prism calls **Ollama** image-generation checkpoints that match the shared name heuristic (install models with `ollama pull`), or **ComfyUI** checkpoints from your configured ComfyUI server. Chat stays strictly on Ollama in LOCAL either way.
- **No outbound telemetry**: Next.js anonymous telemetry is disabled via `NEXT_TELEMETRY_DISABLED=1` (set in the web Dockerfile and `.env.example`). If you run `npm run dev` directly on your shell instead of via Docker, export the same variable or run `npx next telemetry disable` once. The API process makes no telemetry calls.
- **Outbound surface** (exhaustive): Ollama at `OLLAMA_HOST`, Qdrant at `QDRANT_URL`, the user's ComfyUI base URL when ComfyUI image generation runs, and — only in ONLINE mode — `api.openai.com`. Any reviewer adding a new `fetch(` to a non-config host needs an explicit mode gate. See `DESIGN.md` for details.

## Knowledge Base (Obsidian)

Prism includes a self-building Obsidian knowledge base in `vault/`. It converts
repo source files, docs, lessons, and releases into linked notes with MOCs
(Maps of Content), backlinks, and optional AI summaries + semantic related-links.

Run it:

```bash
npm run kb
```

Useful commands:

```bash
npm run kb:incremental   # Fast refresh for post-commit changes
npm run kb:augment       # Re-run AI summary + semantic related-link pass only
npm run kb:install-hook  # Install .git/hooks/post-commit auto-refresh
```

Open `vault/` in Obsidian to browse the generated graph. If `OLLAMA_HOST` or
`QDRANT_URL` are missing, the deterministic skeleton still builds and AI
augmentation is skipped gracefully.

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

## Future (high level)

See [Feature status](#feature-status) for module-level intent. Engineering themes on the horizon include streaming replies, richer bot-to-bot scenarios beyond Coffee, cloud backup adapters (S3/R2), and a deeper profile/role system — tracked in code and `CHANGELOG.md` as they land.

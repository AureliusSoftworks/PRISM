# DESIGN

## Goal

**Prism** is a self-hosted, **local-first intelligence environment**: a modular
surface (Sandbox, Chat, Coffee today; more planned) for routing work across
local models, optional cloud APIs, memory, tools, and bots — with per-account
isolation and encrypted memory. It runs headlessly on a machine you own,
serves a mobile-friendly UI across the LAN, and stays positioned at the
intersection of ChatGPT Gov-style isolation and FL Studio-style creative
systems thinking.

Product framing and roadmap tiles live in the root [`README.md`](README.md)
(sections *The Core vision*, *Why Core matters*, and *Feature status*). This
document stays focused on **implemented** architecture, contracts, and privacy
invariants (for example **LOCAL mode** never calling external chat providers).

## Experience Principle: User-Player Parity

Prism should not split people into "users" (utility) versus "players"
(experience). Every feature should satisfy both.

- **Practical value:** clarity, control, and reliability for real tasks
- **Experiential value:** delight, engagement, and emotional comfort in use

A design is incomplete if it serves only one side.

## Applet Ethos and Versioning

Prism applets are distinct experience modules, not just routes. Each applet
should have a clear felt promise, a quiet version marker, and a short changelog
for experience-level changes.

- Applet versions track user-visible behavior: interaction model, memory
  behavior, prompt behavior, visible controls, data shape, major fixes, and
  creative direction.
- Internal refactors do not bump an applet version unless they affect trust,
  privacy, compatibility, or data.
- Usable applets start at `v0.1`; planned concepts stay at `v0.0` until a real
  surface exists.
- The UI should present applet versions as small provenance beside the applet
  name. They should never make Prism feel like a developer console.

The current applet ledger lives in [`docs/applets.md`](docs/applets.md); the
web UI registry lives in `apps/web/src/app/appletVersions.ts`.

## Stack

- **Frontend:** Next.js (standalone output for Docker)
- **Backend:** Node.js HTTP server (zero-dependency, experimental TS strip)
- **Database:** SQLite (users, sessions, conversations, messages, bots, exports, memory summaries, images)
- **Vector Store:** Qdrant (semantic memory retrieval)
- **Local LLM:** Ollama (running on host, accessed via `host.docker.internal`)
- **Image Gen:** OpenAI DALL-E 3 API
- **Speech:** Web Audio Bottish + bundled sherpa-onnx English; optional ElevenLabs BYOK
- **Deployment:** Docker Compose with nginx reverse proxy

## Data Model

### Core tables
- `users` — account + encrypted key material + preferences
- `sessions` — server-validated session tokens
- `conversations` — with `bot_id`, `parent_id` (fork), `incognito` flag
- `messages` — user/assistant turns, scoped by `user_id`

### Feature tables
- `bots` — custom chatbot profiles with system prompt and parameters
- `memories` — encrypted per-user memory blobs (legacy heuristic extraction)
- `memory_summaries` — LLM-generated conversation summaries stored in SQLite + Qdrant
- `images` — OpenAI image generation records
- `conversation_exports` — Markdown export blobs

### Tenancy
Every table enforces `user_id` scoping. No cross-tenant access paths exist.

## Memory Pipeline

```
User message
  ├─ Heuristic extraction → encrypted memory blobs (SQLite)
  └─ Conversation summarizer → memory_summaries (SQLite) + Qdrant vector

Prompt assembly
  ├─ Decrypt top-k encrypted memories (cosine similarity on embedded payloads)
  └─ Qdrant semantic search on memory_summaries
  └─ Inject combined results as system message hints
```

When incognito mode is active, no memories are read or written.

## Chat vs Sandbox vs Coffee

Prism treats **Chat** and **Sandbox** as hard-separated lanes, with **Coffee** as a third multi-bot surface:

- **Chat (Companion Timeline)**
  - Single persistent companion persona (no bot/provider/model switching in Chat UI)
  - Cross-conversation continuity and personal memory recall
  - Minimal controls by design to keep emotional tone steady and low-friction
- **Sandbox (Command Center)**
  - Full runtime controls (bot, provider, model, tooling)
  - Thread-scoped memory compaction only
  - Optimized for experimentation and test workflows
- **Coffee (Group table)**
  - Multiple bots in one seated session with server-orchestrated turns and social state
  - Distinct UX and API path from single-thread Chat and Sandbox lab threads

Server guardrails enforce the Chat/Sandbox split: advanced runtime knobs sent from Chat are
ignored, and sandbox thread-compaction summaries are tagged so they cannot be
reused as companion continuity context.

## Provider Architecture

```
selectProvider(preferredProvider, apiKey?)
  ├─ "local"   → LocalOllamaProvider  → Ollama /api/chat
  └─ "openai"  → OpenAiProvider       → OpenAI /v1/chat/completions
                                        (throws if apiKey is missing)

getAuxiliaryProvider()
  └─ LocalOllamaProvider → Ollama /api/chat
                            (pinned to OLLAMA_AUXILIARY_MODEL, default llama3.2)

embedTextLocal(text)
  └─ Ollama /api/embeddings
       (pinned to OLLAMA_EMBEDDING_MODEL, default nomic-embed-text)

generateImage(prompt, apiKey, size, quality)
  └─ OpenAI /v1/images/generations (DALL-E 3)
```

## Privacy posture

The LOCAL / ONLINE toggle in the UI is a real invariant, not a hint. The
product guarantees that a LOCAL turn never results in a packet leaving the
user's network.

### Complete outbound surface (runtime)

| File | Host | When does it fire? |
| --- | --- | --- |
| `apps/api/src/providers.ts` (`LocalOllamaProvider`) | `OLLAMA_HOST` | Every LOCAL user-facing chat turn. Local by config. |
| `apps/api/src/providers.ts` (`getAuxiliaryProvider`) | `OLLAMA_HOST` | Internal title, starter, summary, memory-critic, memory-inference, and **image prompt suggestion** calls. Always local, pinned to `OLLAMA_AUXILIARY_MODEL`. |
| `apps/api/src/image-prompt-suggestions.ts` (`inferBotImagePromptSuggestions`) | `OLLAMA_HOST` | `POST /api/images/prompt-suggestions` (Images panel, per-bot): short scene-request chips. Same auxiliary model. |
| `apps/api/src/providers.ts` (`embedTextLocal`) | `OLLAMA_HOST` | All memory embeddings and Qdrant queries. Always local, pinned to `OLLAMA_EMBEDDING_MODEL`. |
| `apps/api/src/providers.ts` (`OpenAiProvider`) | `api.openai.com` | Only when the effective mode is ONLINE for the user's actual chat reply. |
| `apps/api/src/qdrant.ts` | `QDRANT_URL` | Memory summary vector read/write. Local by config. |
| `apps/api/src/image-provider.ts` | `api.openai.com` | Only when the effective mode is ONLINE (gated in `/api/images/generate`). |
| `apps/api/src/voices.ts` | `api.elevenlabs.io` | Only for the optional ElevenLabs English engine. Persisted LOCAL replies always synthesize with the bundled engine; previews and voice catalog reads require ONLINE mode. |

The web app only issues relative `/api/*` fetches; those are rewritten to
the backend on the same origin by `apps/web/next.config.ts`.

### Enforcement

- `selectProvider("local", …)` unconditionally returns `LocalOllamaProvider`.
  The old `autoSwitchModel` argument that could escalate a LOCAL turn has
  been removed from the signature. Retained under test in
  `apps/api/src/__tests__/providers.test.ts` — that test file is the canary
  for this invariant.
- `getAuxiliaryProvider()` and `embedTextLocal()` never call OpenAI. They
  are system-owned local lanes pinned to the mandatory `llama3.2` and
  `nomic-embed-text` Ollama models.
- `/api/images/generate` reads the user's stored mode and the request's
  optional `preferredProvider` override (mirroring the chat route) and
  refuses with a clear 4xx error if the effective mode is LOCAL. The web
  Images panel hides the generate form in LOCAL mode and shows a short
  "Online mode required" explainer instead.
- Next.js anonymous telemetry is disabled via `NEXT_TELEMETRY_DISABLED=1`
  in the web Dockerfile and `.env.example`.
- Voice modes, profile portability, playback rules, and the offline model
  release gate are documented in [`docs/voices.md`](docs/voices.md).

### Reviewer checklist for new outbound calls

When adding a new `fetch(` (or any network client) in the API:

1. Is the target host configured via env (like `OLLAMA_HOST` / `QDRANT_URL`)
   so the operator can keep it on-network? If yes, no gate needed.
2. Otherwise, add a server-side gate that returns an error when the
   effective `preferredProvider === "local"`, and reflect the gate in the
   UI so the user is never surprised.
3. Extend `apps/api/src/__tests__/providers.test.ts` (or add a sibling
   test) to pin the new call's mode gate.

## Chat Forking

Conversations support `parent_id` and `fork_message_id`. Forking copies all messages up to the fork point into a new conversation, preserving the bot and incognito settings from the parent.

## Security

- Passwords hashed with scrypt
- Per-user AES-256-GCM encryption keys wrapped by master key
- User OpenAI keys encrypted with user key
- Session cookies are HttpOnly, SameSite=Lax
- All API routes require authentication (except `/api/health`)

## Deployment

Docker Compose with four services:
1. `nginx` — front door on port 80, proxies `/api/` to backend, `/` to frontend
2. `web` — Next.js standalone production build
3. `api` — Node.js backend with SQLite and Qdrant clients
4. `qdrant` — vector database with persistent volume

All services use `restart: unless-stopped` for headless boot recovery.

**Local-first networking:** published ports bind to `127.0.0.1` by default, so a
fresh deployment is private to the host. Local-network access is an explicit,
host-only opt-in (`PRISM_LAN_ACCESS` / Settings -> Network) that flips the web and
API binds to `0.0.0.0` and enables mDNS discovery. Qdrant always stays loopback.

## Clients and distribution (current)

Shipping posture today is **Steam for desktop** plus **GitHub Releases as the
direct-download path while Steam is being prepared**, with **Prism on iPhone as
a PWA** served by the server. It is not an App Store-first model. Official
desktop builds are free to download and use. The server remains the source of
truth for accounts, memory, provider rules, and tenancy.

The native client must not reimplement chat, memory, provider routing, or
tenancy rules on-device. Those invariants stay in `apps/api`.

Historical App Store–oriented notes are archived under `docs/app-store-*.md`
and `docs/native-client-mvp.md`; prefer [`README.md`](README.md) and
[`docs/distribution-model.md`](docs/distribution-model.md) for current product
story.

Reference docs:

- `docs/distribution-model.md`
- `docs/mobile-api-contract.md`
- `docs/prism-client-app.md`
- `docs/prism-ios-client.md`
- `docs/licensing-and-brand.md`

## Future Extensions

- Deeper multi-bot scenarios beyond today’s **Coffee** table mode
- Streaming token responses via SSE
- Cloud backup adapters (S3-compatible)
- Custom theme token sets beyond light/dark

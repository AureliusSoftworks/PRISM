# DESIGN

## Goal

A self-hosted AI playground — **Prism** — that runs headlessly on a
Windows machine, serves a mobile-friendly UI across the LAN, and provides
per-account isolation with encrypted memory. Positioned at the intersection
of ChatGPT Gov's security posture and FL Studio's systems-minded creative
permission: every account is its own sealed sandbox for AI testing across
local and online providers.

## Stack

- **Frontend:** Next.js (standalone output for Docker)
- **Backend:** Node.js HTTP server (zero-dependency, experimental TS strip)
- **Database:** SQLite (users, sessions, conversations, messages, bots, exports, memory summaries, images)
- **Vector Store:** Qdrant (semantic memory retrieval)
- **Local LLM:** Ollama (running on host, accessed via `host.docker.internal`)
- **Image Gen:** OpenAI DALL-E 3 API
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

## Provider Architecture

```
selectProvider(preferredProvider, apiKey?)
  ├─ "local"   → LocalOllamaProvider  → Ollama /api/chat
  └─ "openai"  → OpenAiProvider       → OpenAI /v1/chat/completions
                                        (throws if apiKey is missing)

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
| `apps/api/src/providers.ts` (`LocalOllamaProvider`) | `OLLAMA_HOST` | Every LOCAL chat turn and every embedding call that routes through a LOCAL provider. Local by config. |
| `apps/api/src/providers.ts` (`OpenAiProvider`) | `api.openai.com` | Only when the effective mode is ONLINE. |
| `apps/api/src/qdrant.ts` | `QDRANT_URL` | Memory summary vector read/write. Local by config. |
| `apps/api/src/image-provider.ts` | `api.openai.com` | Only when the effective mode is ONLINE (gated in `/api/images/generate`). |

The web app only issues relative `/api/*` fetches; those are rewritten to
the backend on the same origin by `apps/web/next.config.ts`.

### Enforcement

- `selectProvider("local", …)` unconditionally returns `LocalOllamaProvider`.
  The old `autoSwitchModel` argument that could escalate a LOCAL turn has
  been removed from the signature. Retained under test in
  `apps/api/src/__tests__/providers.test.ts` — that test file is the canary
  for this invariant.
- `/api/images/generate` reads the user's stored mode and the request's
  optional `preferredProvider` override (mirroring the chat route) and
  refuses with a clear 4xx error if the effective mode is LOCAL. The web
  Images panel hides the generate form in LOCAL mode and shows a short
  "Online mode required" explainer instead.
- Next.js anonymous telemetry is disabled via `NEXT_TELEMETRY_DISABLED=1`
  in the web Dockerfile and `.env.example`.

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
1. `nginx` — LAN ingress on port 80, proxies `/api/` to backend, `/` to frontend
2. `web` — Next.js standalone production build
3. `api` — Node.js backend with SQLite and Qdrant clients
4. `qdrant` — vector database with persistent volume

All services use `restart: unless-stopped` for headless boot recovery.

## Apple Companion Roadmap

Prism's App Store direction is a two-binary split:

1. **Prism Server** runs on Mac, Windows, or Linux as the user-controlled local
   runtime. It owns data, providers, accounts, pairing, and the existing web UI.
2. **Prism iOS/Mac** is the paid official native client. It discovers a Prism
   Server on the local network, pairs with it, stores a Keychain session, and
   calls the server API directly.

The native client must not reimplement chat, memory, provider routing, or
tenancy rules on-device. Those invariants stay in `apps/api`. The first native
vertical slice is server discovery, pairing, `GET /api/auth/me`,
`GET /api/conversations`, `GET /api/conversations/:id`, and `POST /api/chat`.

Reference docs:

- `docs/app-store-distribution.md`
- `docs/mobile-api-contract.md`
- `docs/native-client-mvp.md`
- `docs/app-store-review.md`
- `docs/licensing-and-brand.md`

## Future Extensions

- Bot-to-bot sandbox (scenario entity, agent roster, turn loop, transcript export)
- Streaming token responses via SSE
- Cloud backup adapters (S3-compatible)
- Custom theme token sets beyond light/dark

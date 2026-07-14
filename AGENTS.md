# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

> **Prism** — self-hosted local-first AI workspace · Node.js + Next.js + SQLite + Docker

## Dev Commands

```bash
npm run dev              # Start all services (api + web)
npm run dev:api          # API only
npm run dev:web          # Web only
npm run desktop          # Desktop Electron app (stages runtime first)
npm run lint             # Lint api + web
npm run typecheck        # Typecheck packages/shared, packages/config, api, web
npm run build            # Full production build
npm run test --prefix apps/api   # API tests
```

**Docker (recommended for full stack):**
```bash
cp .env.example .env
# Set ENCRYPTION_MASTER_KEY, OPENAI_API_KEY, etc.
docker compose up -d
# Web: http://localhost:18788 · API health: http://localhost:18787/health
```

## Monorepo Layout

- `apps/api` — Node.js HTTP backend (zero-dependency, experimental TS strip)
- `apps/web` — Next.js frontend (standalone output for Docker)
- `apps/desktop` — Electron wrapper
- `packages/shared` — shared types/utilities
- `packages/config` — shared configuration

## Architecture

```
[Browser/Desktop] → nginx (:18788/:18787) → Next.js web → Node.js API
                                                              |
                                                  SQLite · Qdrant · Ollama
```

Docker services: `nginx` (LAN ingress), `web` (Next.js), `api` (Node.js), `qdrant` (vector DB). All use `restart: unless-stopped`.

## Data Model

**Core tables:** `users` (account + encrypted key material), `sessions`, `conversations` (`bot_id`, `parent_id` fork, `incognito` flag), `messages`

**Feature tables:** `bots`, `memories` (legacy heuristic blobs), `memory_summaries` (LLM-generated, stored in SQLite + Qdrant), `images`, `conversation_exports`

**Tenancy:** Every table enforces `user_id` scoping. No cross-tenant access paths exist.

## Memory Pipeline

```
User message
  ├─ Heuristic extraction → encrypted memory blobs (SQLite)
  └─ Conversation summarizer → memory_summaries (SQLite) + Qdrant vector

Prompt assembly: decrypt top-k encrypted memories + Qdrant semantic search → inject as system message hints
```

Incognito mode: no memory reads or writes.

## Provider Architecture

```
selectProvider("local")   → LocalOllamaProvider → Ollama /api/chat
selectProvider("openai")  → OpenAiProvider      → OpenAI /v1/chat/completions

getAuxiliaryProvider()    → LocalOllamaProvider (pinned to OLLAMA_AUXILIARY_MODEL, default llama3.2)
embedTextLocal()          → Ollama /api/embeddings (pinned to OLLAMA_EMBEDDING_MODEL, default nomic-embed-text)
generateImage()           → OpenAI DALL-E 3 (only when effective mode is ONLINE)
```

## Privacy Invariant — LOCAL Mode

**The LOCAL/ONLINE toggle is a hard guarantee, not a hint.** A LOCAL turn must never result in a packet leaving the user's network.

- `selectProvider("local", …)` unconditionally returns `LocalOllamaProvider`. The old `autoSwitchModel` escalation path has been removed. This invariant is pinned by `apps/api/src/__tests__/providers.test.ts` — **do not weaken that test**.
- `getAuxiliaryProvider()` and `embedTextLocal()` never call OpenAI.
- `/api/images/generate` refuses with a 4xx when effective mode is LOCAL; the web UI hides the generate form in LOCAL mode.
- `NEXT_TELEMETRY_DISABLED=1` is set in the web Dockerfile and `.env.example`.

**When adding a new outbound `fetch`:**
1. If the target host is configured via env (`OLLAMA_HOST`, `QDRANT_URL`), no gate needed.
2. Otherwise, add a server-side guard that returns an error when `preferredProvider === "local"`, and reflect this in the UI.
3. Add a test to pin the mode gate.

For experimental simulated-effort / Psychic planning validation, use `docs/experimental-effort-eval-runbook.md`.

## UX Lanes

Chat, Zen, and Coffee are hard-separated — server guardrails enforce the split:
- **Chat** — single persistent companion, continuity/memory, minimal controls
- **Zen** — calmer 1:1 lane
- **Coffee** — multi-bot group chat (2–5 bots), server-orchestrated turns
- **Sandbox** — full runtime controls (bot, provider, model), thread-scoped memory compaction only

Advanced runtime knobs sent from Chat are ignored server-side. Sandbox compaction summaries are tagged so they cannot be reused as companion continuity context.

## Security

- Passwords hashed with scrypt
- Per-user AES-256-GCM keys wrapped by master key (`ENCRYPTION_MASTER_KEY`)
- User OpenAI keys encrypted with user key
- Session cookies: HttpOnly, SameSite=Lax
- All API routes require authentication except `/api/health`

## Branching

- `dev` → active development
- `main` → tagged releases only (merge from `dev` + `CHANGELOG.md` entry + semver tag)

## Experience Principle

Prism should not split people into "users" (utility) vs. "players" (experience). Every feature must satisfy both — practical clarity/control and experiential delight. A design that serves only one side is incomplete.

## Tutorial Maintenance

Treat onboarding and contextual tutorials as part of every user-visible feature, not as follow-up documentation.

- In the same change, review `apps/web/src/app/firstRunOnboarding.ts` and `apps/web/src/app/modeTutorials.ts` for affected setup choices, copy, steps, and click targets.
- Update the tutorial when a player-visible control, workflow, applet, or default changes. If no tutorial change is needed, record that review in the Bead or verification notes.
- Keep tutorial target selectors stable and backed by tests. A missing, hidden, or stale target is a product regression.
- Preserve skip, do-it-later, and reset paths so guidance never traps the player.

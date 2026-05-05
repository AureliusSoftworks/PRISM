---
title: "DESIGN.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "DESIGN.md"
status: "active"
---

# DESIGN.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/__tests__/providers.test.ts]]
- [[02-apps/api/src/image-provider.ts]]
- [[02-apps/api/src/providers.ts]]
- [[02-apps/api/src/qdrant.ts]]
- [[02-apps/web/next.config.ts]]
- [[04-docs/docs/app-store-distribution.md]]
- [[04-docs/docs/app-store-review.md]]
- [[04-docs/docs/licensing-and-brand.md]]
- [[04-docs/docs/mobile-api-contract.md]]
- [[04-docs/docs/native-client-mvp.md]]

## Referenced by
- _No backlinks yet_

## Source path
- `DESIGN.md`

## Body preview
```markdown
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
  └─ "openai"  → OpenAiProvider       →

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->

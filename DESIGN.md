# DESIGN

## Goal

A self-hosted "ChatGPT gov at home" that runs headlessly on a Windows machine, serves a mobile-friendly UI across the LAN, and provides per-user isolation with encrypted memory.

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
selectProvider(preference, autoSwitch, message, apiKey)
  ├─ LocalOllamaProvider  → Ollama /api/chat
  └─ OpenAiProvider       → OpenAI /v1/chat/completions

generateImage(prompt, apiKey, size, quality)
  └─ OpenAI /v1/images/generations (DALL-E 3)
```

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

## Future Extensions

- Bot-to-bot sandbox (scenario entity, agent roster, turn loop, transcript export)
- Streaming token responses via SSE
- Cloud backup adapters (S3-compatible)
- Custom theme token sets beyond light/dark

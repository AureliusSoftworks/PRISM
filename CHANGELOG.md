# Changelog

All notable changes to Prism are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Active development happens on the `dev` branch; every release is a merge into
`main` tagged with its semver version.

## [0.1.0] - 2026-04-22

First tagged release. The project ships under the name **Prism** (previously
prototyped as "LocalAI ChatGov"). A local-first AI playground with the
fidelity of ChatGPT Gov and the systems-focus of FL Studio: per-account
isolation, encrypted memory, mixable local + online providers, and a
command-center UI.

### Added

- Per-user authentication with encrypted session cookies and strict tenant
  scoping across every query.
- Chat via Ollama (local) or OpenAI (online), selectable per-request. A sleek
  LOCAL / ONLINE toggle sits above the composer; a sidebar quick-switch and
  read-only local-model readout mirror the same state.
- Per-message provider attribution: each reply carries a status dot and a
  hover-reveal label (`HUMAN`, `LOCAL ASSISTANT`, `ONLINE ASSISTANT`).
- Custom bots with system prompt, model, temperature, and max_tokens
  overrides. Bot name appears as the message header; swapping bots
  mid-conversation is recorded per-message so history stays accurate.
- Two-stage delete affordance for conversations and bots ("Are you sure?"
  confirm pill that auto-disarms) to prevent accidental deletion.
- Conversation forking from any message and Markdown export.
- Incognito mode: skips all memory capture and retrieval for the chat.
- Encrypted per-user memory channel (AES-GCM) plus Qdrant-backed memory
  summaries, merged into every non-incognito turn under a 1.5 s retrieval
  budget. Memory ops are wrapped in `Promise.allSettled` so a failing vector
  store cannot kill a chat response.
- Background summarizer throttled to milestone message counts (6, 12, 18,
  24, then every 12) so it does not queue behind the next user turn.
- Command-center visual system: dark/light themes with shared tokens, pill
  segmented controls, animated typing indicator, sidebar drawer on mobile.
- OpenAI DALL-E 3 image generation with gallery view; generated-image rows
  are purged automatically 30 days after creation (URLs expire long before
  that on OpenAI's side, so the cleanup just keeps the DB tidy).
- Inactive-account auto-deletion after 60 days.
- Self-serve account deletion from Settings with a confirmation prompt.
- `start.bat` one-click production launcher (web:3000, api:8787) with
  dependency install, `.env` bootstrap, and standalone-build wiring.

### Fixed

- Consecutive chat messages no longer queue behind the background memory
  summary on the shared Ollama instance.
- Saving Settings no longer wipes the stored OpenAI API key; an explicit
  "Clear saved key" affordance lets users remove it on purpose.
- `OLLAMA_HOST` is normalized before use: missing scheme is prepended,
  `0.0.0.0` is rewritten to `127.0.0.1`, trailing slashes are stripped.
- Empty provider responses now surface as errors instead of being saved as
  placeholder assistant messages.
- Message shape is consistent between `POST /api/chat` and
  `GET /api/conversations/:id` (both return `createdAt`).
- Error visibility: failed sends now render inline above the composer and
  the optimistic user message rolls back cleanly.
- Cross-origin dev login: `next.config.ts` auto-detects the host's LAN
  IPv4 addresses and allow-lists them via Next 16's `allowedDevOrigins`,
  so POSTs from phones / LAN devices no longer get silently dropped by
  Next's cross-origin dev guard. An `ALLOWED_DEV_ORIGINS` env var covers
  any extra hostnames.

### Security

- Per-user encryption keys wrapped by a master key (`ENCRYPTION_MASTER_KEY`)
  never touch disk in plaintext; user memories are encrypted at rest.
- Cross-user data access is rejected at every DB query (tenant-scoped by
  `user_id`).
- **LOCAL mode is a strict privacy invariant.** `selectProvider` honors the
  user's toggle unconditionally; no heuristic can escalate a LOCAL turn to
  an external provider. Enforced by `apps/api/src/__tests__/providers.test.ts`.
- **Image generation is gated by mode.** `/api/images/generate` refuses when
  the effective provider is LOCAL, and the Images panel reflects that state
  client-side so users are never silently routed to OpenAI DALL-E.
- **Next.js telemetry is disabled** via `NEXT_TELEMETRY_DISABLED=1` in the
  web Dockerfile and `.env.example`.
- No third-party analytics or crash-reporting dependencies in the product
  code.
- Outbound surface (exhaustive): Ollama at `OLLAMA_HOST`, Qdrant at
  `QDRANT_URL`, and — only in ONLINE mode — `api.openai.com`. Documented
  in `DESIGN.md`.

[0.1.0]: https://github.com/prism/prism/releases/tag/v0.1.0

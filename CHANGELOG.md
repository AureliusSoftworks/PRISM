# Changelog

All notable changes to Prism are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Active development happens on the `dev` branch; every release is a merge into
`main` tagged with its semver version.

## [Unreleased]

## [0.2.0] - 2026-04-26

### Added

- Mobile pairing foundation endpoints for native clients, including pairing code
  generation and exchange flows.
- Prism Server LAN discovery advertisement (`_prism._tcp`) with runtime config
  for `PRISM_SERVER_NAME` and `PRISM_DISCOVERY_ENABLED`.
- Prism onboarding route and mobile pairing/discovery documentation updates.
- Release automation foundation for `dev -> main` promotion and two release
  lanes (server draft artifacts + private TestFlight client lane reference).

## [0.1.1] - 2026-04-26

### Added

- **Per-mode memory model.** Memory behavior now splits cleanly by
  post-auth surface, so the two modes mean what they look like they
  mean:
  - **Chat** keeps the cross-thread personal-memory pipeline
    (personal-fact extraction into the `memories` table + Qdrant
    summary recall across conversations). Nothing changed for existing
    chat users.
  - **Sandbox** no longer touches cross-thread memory at all. The
    `memories` table stays clean of Sandbox traffic, Qdrant never
    sees a Sandbox summary, and the sidebar memory list never
    surfaces a Sandbox artifact.
  - Sandbox threads instead get a silent **rolling thread-compaction
    summary** that kicks in once a conversation outgrows the live
    window. Scoped strictly by `conversation_id`, stored only in
    SQLite, never indexed for similarity search, never shown in
    the UI — purely context plumbing so a long Sandbox thread
    doesn't feel amnesiac when older turns roll off the 30-message
    window. Prep groundwork for bot-to-bot threads.
- **Chat-mode Incognito toggle.** The `Incognito` pill in Sandbox is
  gone (the concept doesn't apply there anymore). Chat gains a small
  inline pill above the composer: on = this send goes local-only
  (forces offline provider routing) and bypasses memory; off = the
  saved provider + normal memory pipeline. A hollow/filled status dot
  gives at-a-glance "is this private right now?" feedback. Enforced
  server-side as well so a misbehaving client can't leak an
  incognito turn to a remote provider.
- Long chat messages (over 600 characters) now render with a max-height
  cap, a soft bottom fade, and a **Show more / Show less** toggle.
  Applies symmetrically to user and assistant bubbles in both Chat and
  Sandbox so long responses or pasted blobs stop dominating the viewport
  until you opt in to the full text.
- Post-auth **Hub** landing screen. After login you now land on a hub
  with two mode tiles — **Chat** and **Sandbox** — styled with 5-color
  prism glyphs (one colour per letter of "prism") that echo the
  wordmark's per-letter palette.
- **Sandbox** mode: the full command-center experience (bots, provider
  toggle, fork, export, images, advanced settings) — i.e. the entire
  previous main UI, now reached by choosing the Sandbox tile.
- **Chat** mode: a stripped-down "personal Prism" surface that keeps
  the conversation sidebar, message history, and typing indicator but
  hides every technical knob (bot picker, Local/Online toggle + lock,
  per-message Fork, Export, Bots/Images panels). Chat mode pins its
  accent to the pink P-letter colour so the surface reads
  warmer/distinct from Sandbox's grayscale default, uses the default
  persona for new messages, and routes silently through the user's
  saved provider unless Incognito is on.
- Mode routing is mirrored into the URL (`?view=chat`, `?view=sandbox`)
  so refreshes preserve the active surface and browser back/forward
  step naturally between Hub and each mode.
- Clickable prism wordmark in the Chat and Sandbox chat headers acts
  as a back-to-Hub affordance.

### Fixed

- **Recent-history window bug.** The chat prompt-assembly query used
  `ORDER BY created_at ASC LIMIT 30`, which fetched the OLDEST 30
  messages. Once a thread exceeded 30 messages, every new turn would
  lose recent context and freeze the prompt on ancient history.
  Inverted to fetch the NEWEST 30 and reverse to chronological order
  for the provider. Relevant for any long thread; essential for the
  new Sandbox thread-compaction path.
- **Summarization milestone cap.** The milestone gate used
  `history.length + 2` as the message count, which stayed pinned at
  32 after the history limit took effect — so summarization silently
  never fired on threads past 30 messages. Replaced with a `COUNT(*)`
  query so milestones trigger correctly at every 12 messages past 24.
- Assistant message bubbles no longer collapse to just their header once
  the conversation grows tall enough to scroll. Root cause was the
  assistant bubble's `overflow: hidden` (used to clip the accent-gradient
  pseudo-element to the bubble's rounded corners) silently establishing
  a new block formatting context, which switched its implicit
  `min-height: auto` to `0` and let the outer `.messages` grid track
  shrink the body past the `<p>`'s real height. Swapped to
  `overflow: clip`, which preserves the clipping without the BFC side
  effect.

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
- `start.bat` one-click production launcher (web:18788, api:18787) with
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

[0.2.0]: https://github.com/prism/prism/releases/tag/v0.2.0
[0.1.1]: https://github.com/prism/prism/releases/tag/v0.1.1
[0.1.0]: https://github.com/prism/prism/releases/tag/v0.1.0

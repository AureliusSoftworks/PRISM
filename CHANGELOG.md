# Changelog

All notable changes to Prism are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Active development happens on the `dev` branch; every release is a merge into
`main` tagged with its semver version.

## [Unreleased]

_Staging area — nothing queued for release yet._

## [0.5.0] - 2026-06-28

### Added

- **Client save/install handoff.** The Network settings panel now presents
  the primary web address with a QR code and copy action, making it easier
  to open Prism from a phone, tablet, or other LAN device without retyping
  the host IP and port.
- **Browser-specific save guidance.** Client devices now get a dismissible
  prompt with platform-appropriate instructions: Add to Home Screen on iOS,
  install prompts where Chromium exposes them, and bookmark guidance
  elsewhere.
- **Helpful API root page.** Visiting the API port directly now shows a
  small human-facing Prism API landing page with an Open Prism link, API
  health link, and QR code instead of a JSON 404.

### Changed

- **Bare `prism` launches the web dev server.** Running the local helper
  without subcommands now starts the web dev server, matching the common
  local-development path more closely.

### Fixed

- **Network settings labels stay readable.** The LAN toggle checkbox and
  label text no longer clip or collapse in the settings panel.

## [0.4.5] - 2026-06-27

### Fixed

- **"Restart Prism" notice no longer persists after restarting.** The
  desktop app was hardcoding loopback (`127.0.0.1`) for both the API and
  web servers regardless of the Network settings toggle, so `desiredLanAccess`
  and `boundLanActive` were always out of sync and the "Saved. Restart Prism
  to apply the new network setting." message appeared permanently. The desktop
  app now reads `network.json` at startup and binds to `0.0.0.0` when "Access
  from other devices" is enabled, or loopback when it is not. Toggling the
  setting and restarting now takes effect correctly.

## [0.4.4] - 2026-06-27

### Desktop

- **NSIS hook compile error fixed.** The hook used `nsProcess` (not
  available in Tauri's NSIS build environment) instead of Tauri's
  bundled `nsis_tauri_utils` plugin. Replaced with
  `nsis_tauri_utils::KillProcessCurrentUser`. Also fixed NSIS string
  escaping for the PowerShell command (`$$` for literal `$`, `$\"` for
  literal `"`). The EXE installer is now produced again alongside the MSI.

## [0.4.3] - 2026-06-27

### Desktop

- **NSIS upgrade hook now actually runs.** The `installer.nsh` hook file
  was never included in the built installer because `installerHooks` was
  missing from `tauri.conf.json`. Now wired correctly — the pre-install
  macro fires before any files are extracted on every upgrade.
- **Correct process names in hook.** The hook previously searched for
  `PRISM.exe`; the actual Tauri binary is `prism_desktop.exe`. Fixed.
- **Scoped `node.exe` kill.** The hook now terminates `node.exe` processes
  running from the Prism runtime folder specifically (via PowerShell path
  filter `*\Prism\runtime\*`), leaving any other Node.js apps on the
  machine untouched.

## [0.4.2] - 2026-06-27

### Desktop

- **Windows Job Object fix (compile error in 0.4.1).** The `windows-sys`
  crate used in 0.4.1 defines `HANDLE` as `*mut c_void` in v0.59, making
  the static job handle non-`Send`. Re-implemented using a zero-dependency
  `extern "system"` declaration against kernel32 directly, with a manually
  mirrored `JOBOBJECT_BASIC_LIMIT_INFORMATION` struct. Behaviour is
  identical — child processes are still killed automatically on parent exit.

## [0.4.1] - 2026-06-26

### Desktop

- **Windows upgrade installer no longer blocks on locked runtime files.**
  Previous Prism builds left `node.exe` and `libvips-42.dll` locked when
  the installer tried to overwrite them, producing "Error opening file for
  writing" dialogs. Two complementary fixes: a Windows Job Object
  (`KILL_ON_JOB_CLOSE`) ensures child processes die automatically whenever
  the parent exits or is force-killed; an NSIS pre-install hook
  explicitly terminates any surviving `PRISM.exe` / `qdrant.exe` processes
  before files are extracted.

## [0.4.0] - 2026-06-26

### Added

- **Private-by-default networking.** The API server now binds to loopback
  (`127.0.0.1`) instead of all interfaces, so Prism is unreachable from
  other devices on the local network unless you explicitly opt in. Desktop
  launcher paths and Docker Compose updated to match.
- **LAN access toggle.** The Mac and Windows server tray apps now include
  a Network settings control. Enabling it rebinds the server to `0.0.0.0`
  so other devices on the LAN can reach Prism. Disabled by default.
- **Web Network settings panel.** A new settings section in the web UI
  shows the current network access mode and lets you flip the LAN toggle
  without leaving the app. The panel also surfaces the API proxy's
  hardened header and host-validation rules.
- **Local-first networking documentation.** New docs cover the loopback-
  default model, what opting in to LAN access means in practice, and the
  security boundary between local and remote callers.

### Changed

- Desktop service launch now runs on a background thread so the splash
  screen paints and animates immediately rather than freezing until the
  first child process starts.

### Fixed

- Splash screen holds for a minimum of 2.5 s before auto-navigating to
  the app, even when services start unusually fast, so the loading state
  is always visible and status badges have time to check off.
- Console windows suppressed on Windows: the Tauri shell no longer opens
  a console window (`windows_subsystem = "windows"`), and child processes
  (API, Qdrant, etc.) are spawned with `CREATE_NO_WINDOW` so no stray
  terminal flashes on startup.
- Rust lifetime error in `mark_app_quitting` resolved.

## [0.3.0] - 2026-06-25

### Added

- **Composer ghost autocomplete.** As you type, the composer now offers
  a greyed-out word completion ranked by natural language frequency.
  Tab or right-arrow accepts the suggestion; any other key dismisses it.
  Built on a pre-generated lexicon (SUBTLEX word frequencies) so
  suggestions require no network round-trip and work fully offline.
- **Zen live bot face.** The bot's face in Zen mode now renders as
  distinct, CSS-controlled eye and mouth elements rather than a single
  text glyph. Eyes and mouth animate independently — blinking, tracking
  presence state, and reflecting the bot's current mood.
- **Zen bot talking mouth.** While the bot is actively replying, the
  mouth shape animates in sync with the reveal stream. Open-wide,
  open-small, and open-round variants correspond to different phoneme
  weight cues derived from the live token reveal pacing.
- **Floating, draggable Zen avatar.** The bot presence plate in Zen
  can be picked up and repositioned anywhere on screen. Release with
  momentum and it flings with physics, bouncing off viewport edges.
  Position is persisted across sessions.
- **Zen persona presence transitions.** Switching personas in Zen now
  plays a smooth departing/arriving animation sequence. The outgoing
  persona desaturates and fades; the incoming one saturates in. Respects
  `prefers-reduced-motion`.

### Changed

- **Cleaner Zen action stage directions.** Bot action descriptions no
  longer leak quoted speech or trailing bridge phrases ("…and says softly",
  "…asking"). The display plate now shows only the pure stage direction.
  The LLM prompt is updated to reinforce this boundary, and the stripping
  logic runs on both API and web sides.
- **Expanded action text length.** The visible action plate now supports
  longer stage directions (up to ~24 words) so richer, multi-clause
  actions can render without truncation.
- **Zen readability overlay reworked.** The atmospheric wallpaper
  readability layer is rebuilt as a single-element gradient with a
  horizontal mask fade, replacing the previous dual pseudo-element
  ellipse approach. Results in better text contrast across a wider
  range of wallpapers without introducing blur halos.
- **Face font tokens.** Typing dots, pending reply dots, and coffee-mode
  face glyphs now share a unified `--prism-face-font` / `--prism-face-weight`
  token pair, keeping all bot face characters visually consistent across
  surfaces and themes.

### Fixed

- Tooltip positioning stabilized to prevent edge-of-viewport drift.
- Zen header visibility no longer flickers on scroll boundary transitions.
- Interrupted chat fragments in prompts now render correctly rather than
  being swallowed by the preceding message boundary.
- Zen fallback wallpaper now activates when a conversation bot is
  present even if the atmosphere layer is disabled.

### Desktop

- **Boot splash screen.** The desktop app now shows the Zen thinking
  screen (spinning prismatic ring, floating triangle, aurora background)
  while services start up. API and web stdout stream live into a
  console pane at the bottom of the screen. Per-service status badges
  (Qdrant / API / Web) check off as each becomes ready, then the
  interface loads automatically.

## [0.1.0] - 2026-05-03

First **production** public release: product and marketing version **0.1.0** across web UI, native server binaries, and App Store–bound clients. GitHub `server/v0.1.0` is the canonical download lane for macOS (DMG), Windows (Inno installer), and Linux (runtime tarball). Native retail clients are built in CI as **Actions artifacts only** until App Store distribution is wired.

### Added

- **Structured Bot Profile Builder.** The freeform bot prompt is replaced
  with a category-based profile editor (purpose, core personality, identity,
  worldview, appearance, fine print). Personality sliders use the Big Five
  (OCEAN: openness, conscientiousness, extraversion, agreeableness,
  emotional stability), with the legacy humor / curiosity / directness
  sliders preserved so older saved bots keep their behavior. Voice presets
  and worldview leanings compose into the model system prompt.
- **Lucide-backed bot glyph picker.** Hundreds of categorized icons
  searchable by keyword, alongside the original inline glyph set. Mobile
  gets a dedicated fullscreen picker with a draft state and explicit Apply.
- **Inferred and compiled memory channels.** Direct user facts can roll up
  into inferred memories (LLM-driven merges of related clues, with
  favorite-payload preservation and a guard that prevents imperative task
  requests from deleting real preferences) or compiled memories (a single
  fact synthesized from several similar direct memories). Each memory now
  carries a separate `certainty` field alongside `confidence`, and tracks
  `sourceMessageIds` so edits and reverts can purge derived memories cleanly.
- **Intent-aware memory extraction.** A new `analyzeMemoryIntent` pass
  classifies each turn as create / retract / correct, detects global-scope
  cues like "save that globally" or "remember this to Prism", strips
  trailing tag questions ("don't you?") before storage, and blocks
  imperative task requests from becoming personal facts. Explicit
  conversational cues are honored even when the global auto-memory toggle
  is off.
- **Rebuilt iMemories panel.** PRISM family directory routes through
  letter-based bubbles sized by memory volume; drilling in plays a
  directional drawer-physics zoom (matched exit/enter halves with
  underdamped spring overshoot). Memory bubbles size by ratio against the
  largest sibling so dense bot drill-downs stay legible; selecting one
  opens a full-prose detail card with explicit Delete. The default Prism
  orb has its own `scope=default` API path. Counts moved off-screen into
  aria-labels — the panel is now purely visual.
- **Edit messages in place.** A single Edit action on a user message
  rewinds the thread from that point, cascades any direct/compiled memories
  the message produced, and resends for a fresh assistant reply. Replaces
  the earlier Resend / Revert / Edit trio.
- **Auto-titled saved chats.** After the first assistant reply, a
  background pass through the active provider names the conversation for
  the sidebar (clamped, sanitized, JSON-shaped). The title only writes back
  if the conversation still has exactly one assistant message, so retries
  and forks do not clobber a manual rename.
- **Sidebar conversation grouping.** Saved chats now cluster by bot in the
  sidebar, sharing the bot's color, glyph, and unread state. Default Prism
  chats keep their own slot. Long-press / context-menu actions on a bot
  cluster expose grouped operations, including a single-tap Delete-Group
  that cascades to messages, exports, and conversation-scoped memories.
- **Memory toasts.** Created and retracted memories surface as a stack of
  up to three toasts above the composer, auto-dismissing after a window
  with hover-to-pin and rearm timing.
- **Prism Server for Windows.** New native WPF tray app + Inno Setup
  installer lane. `release-server-windows.yml` builds and uploads
  `Prism-Server-Setup-v<version>-win-x64.exe` to the server release.
  Includes a startup-task PowerShell helper, dev-launch env wiring, an
  installer smoke-test batch wrapper, and a global exception / crash-log
  capture path for triage. Documented in `docs/prism-server-app-windows.md`.
- **`prism` console dispatcher.** New repo-owned `scripts/prism` (and
  PowerShell `scripts/prism.ps1`) consolidates native rebuild commands:
  `prism ios`, `prism phone`, `prism mac-client`, `prism mac-server`,
  `prism web`, plus a Windows server lane. `prism web` runs `next dev` in
  the foreground so Ctrl+C stops cleanly.
- **Memory dev tools and lifecycle endpoints.** New API endpoints to seed,
  clear, count, edit, restore (`POST /api/memories/restore`), edit a user
  message (`PATCH /api/messages/:id`), and revert a conversation
  (`POST /api/conversations/:id/revert`) so the rebuilt panel and devtools
  can rehearse realistic states. Bot deletion now cascades to its memories.
- **Mandatory local system models.** Prism now treats `llama3.2` and
  `nomic-embed-text` as required Ollama installs. User-facing chat can still
  use local or OpenAI, but internal titles, starters, summaries, memory
  validation, bot-memory inference, and all embeddings stay local on those
  dedicated models.

### Changed

- Auto-memory toggle now governs only opportunistic capture; explicit user
  cues ("save globally", "forget X", "actually...") are always honored.
- Default-scope memory queries now also include compiled memories so
  global recall surfaces the most useful summary facts.
- Memory embeddings now use `nomic-embed-text` instead of reusing the active
  chat provider. Existing vectors remain readable via the current padded
  Qdrant shape, though recall quality may briefly drift while older
  `llama3.2` or OpenAI-embedded memories coexist with new local embedding
  entries.
- Recent-memory retrieval uses an embed-with-fallback path so a missing or
  failing embedder no longer kills retrieval — the hash fallback kicks in.

### Fixed

- Bot editor model dropdowns hide disabled model choices instead of showing
  greyed-out rows the user cannot pick.
- Local model picker dedupes models by display label so two providers
  exposing the same model name no longer double-list.
- Chat composer controls preserve the active bot context when the panel
  reopens; neutral rows and the memory panel got contrast and visual polish.
- Clipboard copy works outside secure contexts (LAN IPs, http://) by
  falling back to the legacy path when `navigator.clipboard` is unavailable.
- Desktop message context selection no longer drops the active bot when
  switching messages.
- `wipe-accounts` now wipes both prod and dev DBs and aligns its preflight
  checks with the launcher scripts.
- Conversation rewind now nulls memory `conversation_id` instead of leaving
  orphan pointers, and reports `deletedMessages` + `deletedMemories` so the
  client can confirm what was removed.

### Docs

- README documents the OCEAN sliders and auto-generated chat titles.
- `docs/native-quick-launch.md` adds the `prism` dispatcher and the Merge
  Main + Build runbook.
- `docs/prism-server-app-windows.md` introduces the Windows server lane.
- `tasks/lessons.md` logs the iMemories visual rebuild, memory-pipeline
  guards, single-Edit message flow, and conversation starter rail anchor.

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

## [0.1.0-preproduction] - 2026-04-22

_Historic first public tag; superseded by the **production** `0.1.0` release (2026-05-03) on the server lane._

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

[0.2.0]: https://github.com/AureliusSoftworks/LocalAI/releases/tag/server%2Fv0.2.0
[0.1.1]: https://github.com/AureliusSoftworks/LocalAI/releases/tag/server%2Fv0.1.1
[0.1.0]: https://github.com/AureliusSoftworks/LocalAI/releases/tag/server%2Fv0.1.0
[0.1.0-preproduction]: https://github.com/AureliusSoftworks/LocalAI/releases/tag/v0.1.0

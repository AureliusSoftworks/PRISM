---
name: Persistent Chat Summarization
overview: Implement a single ongoing PRISM Chat Mode thread with internal rolling summarization and add a startup summary hub bubble, while preserving Sandbox’s visible summarization flow with a loading bubble.
todos:
  - id: chat-single-thread
    content: Force Chat Mode to reopen the latest PRISM-only conversation
    status: completed
  - id: summary-contract
    content: Add explicit summary payload typing and retrieval separation
    status: completed
  - id: rolling-compaction
    content: Implement 10-12 message plus mode-exit compaction triggers
    status: completed
  - id: sandbox-spinner
    content: Add visible Sandbox-only summarization spinner bubble
    status: completed
  - id: chat-startup-bubble
    content: Render centered startup summary bubble for Chat empty state
    status: completed
  - id: api-wireup
    content: Expose summary data to client hydration if required
    status: completed
  - id: dev-panel-tools-metrics
    content: Add developer panel controls and telemetry for summarization testing
    status: completed
  - id: manual-validation
    content: Run Chat/Sandbox UX and regression verification checks
    status: completed
isProject: false
---

# Persistent PRISM Thread with Rolling Summaries

## Goals
- Keep Chat Mode as one ongoing default-PRISM-only conversation that reopens automatically.
- Ensure Chat Mode never allows custom bot selection or non-default bot identity.
- Replace old raw thread context with a rolling summary during long sessions to maximize usable context window.
- Show a centered startup summary bubble before each new Chat session interaction.
- Keep Sandbox summarization explicit and visible with a message-bubble spinner.
- Add developer-panel tools and metrics so summarization behavior is easy to test regardless of mode UX constraints.

## Implementation Plan

1. Enforce Chat-Mode single-thread and default-PRISM-only contract
- Update chat bootstrapping and mode-entry logic in [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx) so entering Chat Mode always:
  - resolves the most recent Chat conversation,
  - hard-locks to the default PRISM bot (no custom bot path),
  - reopens that thread instead of creating a fresh one.
- Keep existing server-side guardrails in [`apps/api/src/server.ts`](apps/api/src/server.ts) and [`apps/api/src/chat.ts`](apps/api/src/chat.ts) as source-of-truth for ignoring bot/provider/model overrides in Chat mode.

2. Add explicit summary storage model for thread-compaction payloads
- Extend summary payload typing in [`apps/api/src/memory-summarizer.ts`](apps/api/src/memory-summarizer.ts) and shared contracts in [`packages/shared/src/index.ts`](packages/shared/src/index.ts) to distinguish:
  - long-lived memory facts,
  - thread-context compaction summaries used as prompt replacement context.
- Ensure retrieval paths can fetch only the latest compaction summary for a given mode/thread.

3. Implement rolling compaction trigger policy
- In [`apps/api/src/chat.ts`](apps/api/src/chat.ts), apply trigger policy selected here:
  - summarize every 10-12 new messages,
  - summarize again when leaving mode/session boundaries where applicable.
- When compaction runs, keep only recent message window verbatim and feed the generated summary as the primary historical context block in prompt assembly.
- Preserve PRISM memory system behavior for long-term personalization separately from thread compaction.

4. Sandbox visible summarization UX
- In [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx), add explicit “summarizing” interim message-state for Sandbox only:
  - render a transient assistant-slot loading bubble/spinner when compaction is running,
  - remove it automatically when compaction completes,
  - keep summary internal (not surfaced as text content).
- Add matching styles in [`apps/web/src/app/page.module.css`](apps/web/src/app/page.module.css).

5. Chat startup summary hub bubble
- In Chat empty-state rendering in [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx), add a centered stylized summary bubble that appears at session start and disappears once interaction begins.
- Drive content from latest internal compaction summary for the reopened Chat thread.
- Add bubble styling and transitions in [`apps/web/src/app/page.module.css`](apps/web/src/app/page.module.css).

6. Wire API surface for summary fetch where needed
- If client hydration needs an explicit endpoint/field, extend response shape in [`apps/api/src/server.ts`](apps/api/src/server.ts) and shared types in [`packages/shared/src/index.ts`](packages/shared/src/index.ts) so the UI can fetch startup summary without exposing full prior transcript.

7. Add Developer Panel tools and summarization metrics
- In developer controls inside [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx), add explicit summarization test actions for both modes, including:
  - force-run summary now,
  - show latest stored summary payload,
  - clear/reset thread compaction state for the active conversation.
- Expose lightweight debug metrics in the panel for fast verification:
  - messages since last compaction,
  - last compaction timestamp,
  - compaction source/mode (`chat` vs `sandbox`),
  - whether compaction is currently in progress.
- If needed, add a small debug endpoint/response fields in [`apps/api/src/server.ts`](apps/api/src/server.ts) and types in [`packages/shared/src/index.ts`](packages/shared/src/index.ts) to provide panel-safe telemetry without changing user-facing chat behavior.

## Validation
- Manual checks in Chat mode:
  - Chat mode is always default PRISM (no custom bot identity at any entry point),
  - returning to Chat reopens same PRISM thread,
  - startup summary bubble appears centered before first action,
  - bubble dismisses on first interaction,
  - no visible summarization artifact during normal Chat sends.
- Manual checks in Sandbox mode:
  - summarization triggers at threshold,
  - spinner bubble appears while summarizing,
  - no summary text is shown to user,
  - conversation continues with preserved context quality.
- Manual checks in Developer Panel:
  - force-run action updates summary and metrics immediately,
  - reset action clears compaction state and repopulates correctly on next trigger,
  - metrics values track expected thresholds and mode-specific behavior.
- Regression checks:
  - AskQuestion flow rendering remains intact,
  - existing memory/facts behavior remains independent from thread compaction.

## Key Files
- [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx)
- [`apps/web/src/app/page.module.css`](apps/web/src/app/page.module.css)
- [`apps/api/src/chat.ts`](apps/api/src/chat.ts)
- [`apps/api/src/memory-summarizer.ts`](apps/api/src/memory-summarizer.ts)
- [`apps/api/src/server.ts`](apps/api/src/server.ts)
- [`packages/shared/src/index.ts`](packages/shared/src/index.ts)
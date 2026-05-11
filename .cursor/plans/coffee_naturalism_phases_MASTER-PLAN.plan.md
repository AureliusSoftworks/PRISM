---
name: coffee naturalism phases
overview: "Build Coffee Mode naturalism in three gated phases: visible table rhythm first, hidden social state second, and interruption behaviors last. Each phase should be implemented and playtested before moving to the next."
todos:
  - id: phase-1-table-rhythm
    content: Implement table-centered active thought, per-bot latest bubbles, thinking indicator hiding, send cooldown, delayed reveal, and shorter Coffee replies.
    status: pending
  - id: phase-1-verify
    content: Run focused tests/typechecks and manually validate Phase 1 pacing in Coffee Mode.
    status: pending
  - id: phase-2-social-state
    content: Add persisted per-session bot social state with hidden values and dev-only diagnostics.
    status: pending
  - id: phase-2-verify
    content: Run focused tests/typechecks and manually validate social state changes without visible gimmick behavior.
    status: pending
  - id: phase-3-interruptions
    content: Add player/bot interruption presentation, cut-off text movement, and social-state consequences.
    status: pending
  - id: phase-3-verify
    content: Run focused tests/typechecks and manually validate interruption pacing and guardrails.
    status: pending
isProject: false
---

# Coffee Naturalism Phased Plan

## Goal
Make Coffee Mode feel like a small live social scene: short spoken turns, visible table focus, player-aware pacing, and eventually hidden social dynamics that can produce boundaries, withdrawal, interruptions, and graceful exits.

## Phase 1: Table Rhythm and Player Priority
Focus on the visible experience first, mostly in [`apps/web/src/app/page.tsx`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/web/src/app/page.tsx) and [`apps/web/src/app/page.module.css`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/web/src/app/page.module.css).

- Add a small client-side Coffee turn controller for visible states: idle, botThinking, playerComposing, tableTyping, cooldown.
- Keep the newest active thought in the center of the table.
- Add one latest-thought bubble per seated bot near their glyph.
- Show a `...` indicator near the bot currently preparing a reply.
- Hide the `...` indicator as soon as the player begins typing, while preserving the background bot request if it is already running.
- Add a mandatory send cooldown after player messages.
- Add delayed bot reveal after the player message finishes typing, so exchanges breathe.
- Tune Coffee prompts in [`apps/api/src/coffee.ts`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/api/src/coffee.ts) toward one-paragraph or shorter replies.

## Phase 2: Hidden Social State and Dev Metrics
Add session-global bot social state after Phase 1 feels good. This should live mostly in [`apps/api/src/coffee.ts`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/api/src/coffee.ts), with storage support in [`apps/api/src/db.ts`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/api/src/db.ts), shared response types in [`packages/shared/src/index.ts`](/Users/jared/Developer/Web%20Apps/LocalAI/packages/shared/src/index.ts), and a dev-only display in [`apps/web/src/app/page.tsx`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/web/src/app/page.tsx).

- Track per-session, per-bot social values: disposition, valuesFriction, restraint, engagement, leavePressure.
- Start global per bot, not relationship-specific.
- Persist state by conversation and bot so refreshes do not erase the session’s emotional continuity.
- Update state after each Coffee turn using simple deterministic helpers first, then feed the values into the router and speaker prompts.
- Add a dev-only Coffee diagnostics readout showing live social values per seated bot.
- Keep harsh behavior guardrailed: high friction plus high restraint should create boundaries, short replies, withdrawal, or leaving rather than gimmicky insults.

## Phase 3: Interruptions and Social Consequences
Only begin after Phase 1 pacing and Phase 2 social state are stable.

- Implement player-interrupts-bot while a bot message is visibly typing on the table.
- Cut off interrupted visible text with an ending dash and relocate the partial thought near the interrupted speaker.
- Apply mild disposition/friction changes based on bot temperament and restraint.
- Add rare bot-interrupts-player behavior, gated by social state and context.
- Ensure bot interruptions never prevent the player from sending; they only affect the live table presentation.
- Add social consequences: other bots can become slightly annoyed with an inappropriate interruption.

## Verification Plan
- Add focused API tests in [`apps/api/src/__tests__/coffee.test.ts`](/Users/jared/Developer/Web%20Apps/LocalAI/apps/api/src/__tests__/coffee.test.ts) for prompt shaping, state update helpers, and social-state bounds.
- Run `npm test -w apps/api -- --test-name-pattern="coffee"` after backend changes.
- Run `npm run typecheck -w apps/api` and `npm run typecheck -w apps/web` after touched phases.
- Manually playtest each phase in Coffee Mode before moving to the next phase.
- Use no more than 3-4 manual test steps after each implemented phase.
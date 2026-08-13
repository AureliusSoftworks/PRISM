# Handoff: confirmation & reversibility policy (PRISM web)

Generated: 2026-08-12 · Branch: `dev` @ `86707ae6` · Status: shipped and merged, but an **uncommitted correction to a real bug is sitting in the working tree** — commit it first.

## Mission

Codify a confirmation/reversibility policy for `apps/web`, following the existing design-token pattern: a policy module, unit tests, a source-scanning contract test with a ratchet allowlist, and a section in `docs/design-system.md`. This is the sequel to the earlier "magic buttons" consolidation — one canonical mechanism, bespoke variants deleted, plus a guard that stops new ones appearing.

**Explicitly out of scope this pass:** migrating any call sites, and unifying per-applet accent colors (`docs/brand-ethos.md` says colors suggest plurality — unify structure, not palette).

Definition of done: the four deliverables exist, `npm run lint` and `npm run typecheck` pass, and no new test failures vs. baseline.

## Current state

- ✅ **Committed** as `86707ae6` on `dev`: `confirmationPolicy.ts`, `confirmationPolicy.test.ts`, `confirmation-contract.test.ts`, and the `## Confirmation and reversibility` section in `docs/design-system.md`.
- ✅ Branch cleanup done: 12 fully-merged local branches deleted. Four remain with unmerged work — `codex/debate-gallery-preload`, `codex/debate-v02-integration`, `feat/debate-conduct-v0.2`, `feat/signal-live-recording` — plus `dev` and `main`.
- 🔄 **Uncommitted in the working tree**: corrections to all four files fixing a genuine bug (see below). Tests pass at 26/26 with them applied. **This is the immediate next action.**
- ⬜ Visual in-app verification — impossible in that session (app requires login). Source tests only. Still outstanding.
- ⬜ Migration of the 9 surfaces that already have a real inverse (the backlog this policy exists to create).

### The uncommitted correction — why it matters

The first commit mapped capability `undo: "quarantine"` → `soft` → affordance `none`. That was wrong: quarantine is a hidden 30-day journal, not a browsable archive, so `none` would give the user **no route at all** to a recovery that exists. It also contradicted the session's own classification table, which put `delete-bot-panel-title` at `undo`.

Fixed by mapping both `inverse` and `quarantine` to `reversible`, and by no longer deriving `bulk`/`soft` from the descriptor at all (`bulk` is a property of the *invocation* — `conversations.quarantine` serves both one id and `{all:true}`; `soft` is a UI-model property). Also fixed: the `count` ratchet only caught growth, not shrinkage; four copies of the scan logic hoisted into two shared functions; doc said 40 surfaces, actual is 39.

## Next actions (in order)

1. **Stage and commit the correction.** The three `.ts` files are yours alone — stage them directly. `docs/design-system.md` is **shared with a live parallel session**, so stage only your hunk:

   ```bash
   cd "/Users/jared/Developer/Web Apps/PRISM" && git diff -- docs/design-system.md > /tmp/doc.patch && sed -n '1,4p' /tmp/doc.patch > /tmp/mine.patch && sed -n '/^@@ -95,32/,/^@@ -145,12/p' /tmp/doc.patch | sed '$d' >> /tmp/mine.patch && git apply --cached /tmp/mine.patch
   ```

   Verify with `git diff --cached --stat` — it must show **only** `docs/design-system.md` with roughly +47/-32, no other files. Then `git add` the three `.ts` files and commit. Prefer a **follow-up commit over `--amend`**: `dev`'s tip is live and another session may have branched from it.

2. Re-run the two test files (command in Verification). Expect 26/26.

3. Re-run `npm run lint` and `npm run typecheck` — both were clean for these files.

4. Optional, if asked: push `dev`. It is **13 commits ahead of `origin/dev` and was deliberately not pushed**.

## Decisions & constraints

- **User chose** "finish the task first, then merge that one branch" over merging all branches, and "delete local fully-merged branches only" over touching `origin`. **`origin` was left untouched** — five remote branches remain, including a stale `origin/feat/confirmation-policy` that predates this work.
- `dev` received three commits (`3782f089`, `15f03151`, `14343704`) from the parallel Codex session as part of this merge. They are that session's design-token/model-display-name work, not this task's.
- Policy precedence is fixed and was not re-litigated: online boundary → irreversible → bulk → reversible → soft.
- Rule 2 is implemented as `!reversible && !soft`, **not** a bare `!reversible`. Under the literal reading rule 5 is unreachable (rule 4 claims every case it could match), which would make the `none` tier dead code. This interpretation is documented in both the module and the doc — do not "simplify" it back.
- `confirm`-tier actions must carry a written reason; the validator checks the **resolved** tier, and a reason on a lower tier is not an error.

## Landmines

- **A parallel Codex session shares this working tree** and commits into it mid-session. At handoff there were ~29 modified files, only 4 of them this task's. **Never `git add -A`.** It has already committed onto a feature branch created by this session once.
- **`docs/design-system.md` is co-edited** by that session (it owns `## Tooltip chrome` and the typeface/radius edits). Always stage it by hunk.
- **The brief's "~5 pre-existing test failures" is wrong.** True baseline is **166 failures / 3651 tests**. The two named files (`botAvatarCustomizerModal.test.ts`, `prismCompanionIntegration.test.ts`) do account for exactly 5; the other 161 are mostly source-scanning contract tests broken by the Codex commits `dev` inherited. Compare the failure **set**, not the count — a count match can hide one test flipping green and another red.
- The absolute repo path contains a space ("Web Apps"), so `new URL(...).pathname` percent-encodes and `readFileSync` fails. Use `fileURLToPath` — both contract tests already do.
- **Bracket discriminator:** the surface scanner matches `(?<!\[)role="alertdialog"`. JSX is `role="alertdialog"`; CSS selectors are `[role="alertdialog"]`. Drop the lookbehind and two selector strings (`page.tsx`, `prismUniversalInputRefract.ts`) become false positives.
- `confirmationPolicy.ts` must never contain the literal `window.confirm` — the scanner skips `.test.ts` but not source, so it would self-trip.
- 12 lint errors and 314 warnings exist repo-wide and are pre-existing. Confirm none are in your files rather than expecting a clean run.

## Map

- `apps/web/src/app/confirmationPolicy.ts` — types, `confirmationAffordanceFor()`, `validateConfirmationActions()`, `reversibilityFromCapability()`.
- `apps/web/src/app/confirmationPolicy.test.ts` — 26 unit tests; the precedence block is the important half.
- `apps/web/src/app/confirmation-contract.test.ts` — the ratchet. `GRANDFATHERED_NATIVE_DIALOGS` (9 call sites, keyed `file :: first-40-chars-of-copy` + `count`) and `GRANDFATHERED_SURFACES` (39 entries, grouped by tier with per-entry rationale).
- `docs/design-system.md` — `## Confirmation and reversibility`, placed after `## What is deliberately _not_ unified` as specified.
- `apps/web/src/app/design-tokens-contract.test.ts` — the pattern template this work follows.
- Server ground truth: `apps/api/src/prism-capabilities.ts` (registry, undo), `prism-domain-capabilities.ts` (per-capability `undo:` values), `packages/shared/src/prismOrchestration.ts` (`PrismCapabilityDescriptorV1`).

```bash
cd "/Users/jared/Developer/Web Apps/PRISM/apps/web" && node --test --experimental-strip-types src/app/confirmationPolicy.test.ts src/app/confirmation-contract.test.ts
```

```bash
cd "/Users/jared/Developer/Web Apps/PRISM" && npm run lint && npm run typecheck
```

## Verification

- Two test files: **26 pass, 0 fail**.
- The ratchet is not vacuous — proven by temporarily changing a `count: 2` to `count: 3` and confirming the staleness test fails with `fell from 3 to 2`. Re-run that check if you touch the scanner.
- Full suite: `node --test --experimental-strip-types src/app/*.test.ts` from `apps/web`. Expect ~167 failures; **none attributable to this work**. The one new failure vs. baseline (`composites free-roam motion as one registered avatar unit`, in `zen-live-presence-css.test.ts`) belongs to the parallel session.
- **Visual confirmation remains outstanding.** The app requires a login that could not be performed, so nothing here was verified in a browser. Say so plainly rather than implying otherwise.

## Key finding worth preserving

The inventory's payoff, now in the doc: **in both bots and images the bulk delete route is strictly less recoverable than the single-item route.** `DELETE /api/bots/:id` and `DELETE /api/images/:id` go through the capability registry with 30-day quarantine undo; `DELETE /api/bots/selected`, `DELETE /api/bots`, and `DELETE /api/images` are raw SQL with no journal entry. The modals look identical while resting on completely different guarantees. This is what makes the bulk rule load-bearing rather than taste. Nine surfaces already have a real inverse and confirm only by habit — that is the migration backlog.

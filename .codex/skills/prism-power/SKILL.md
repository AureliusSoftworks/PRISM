---
name: prism-power
description: Audit and implement PRISM bot Powers from a user-described curse, gift, supernatural ability, social rule, or persistent character condition. Use when the user invokes $prism-power or /prism-power, asks whether a desired Power already works, or asks to add or extend a Power across Chat, Zen, Coffee, Signal, Story, Slate, planned applets, and future modes.
---

# PRISM Power

Turn the user's fiction into a complete, testable product rule. First prove whether the requested outcome already works. If it does not, implement the missing contract and every relevant consumer; do not stop at a proposal.

## Define the outcome

Translate the request into one concise outcome contract before editing:

- holder, affected targets, and whether the player is ever a target;
- trigger, duration, reset boundary, frequency, strength, and stacking precedence;
- hard invariant versus soft behavioral pressure;
- what the holder experiences, what other bots experience, and what the player can see or hear;
- persistence, replay, export/import, and failure or fallback behavior.

Infer unspecified technical details from existing Power patterns. Ask only when a missing choice materially changes visible fiction, player experience, or risk. Keep “curse” and “gift” as authored flavor unless the distinction changes runtime behavior or UI.

Preserve agency. A soft social Power may bias mood, attention, or response without puppeting a bot. A hard Power such as visibility, audibility, memory, turn eligibility, or a physical prop outcome must be enforced by state/runtime code rather than prompt wording alone. Never let a Power weaken authentication, tenancy, LOCAL-mode network privacy, incognito boundaries, or the player's ability to understand what happened.

## Audit before changing

1. Read `AGENTS.md`, inspect Git status, run `bd prime`, and search or claim relevant Beads work. Preserve all unrelated dirty changes.
2. Discover the current applet inventory from `apps/web/src/app/appletVersions.ts`, routing code, and live implementations. Use `docs/applets.md` as supporting context, not as a substitute for code. Include active, preview, planned, compatibility, and newly added modes.
3. Search by semantic outcome, synonyms, structured effect types, and user-visible results. Do not declare support merely because the Power's name appears.
4. Trace the full path where relevant:
   - shared schema, normalization, hashes, prompt budgets, and helpers in `packages/shared/src/botPower.ts` and exports;
   - compilation and deterministic hard-rule recovery in `apps/api/src/bot-powers.ts`;
   - general persona composition in `apps/api/src/bots.ts`;
   - mode adapters such as `apps/api/src/coffee-powers.ts`, `apps/api/src/coffee.ts`, `apps/api/src/botcast.ts`, and `apps/api/src/story.ts`;
   - API routes, database storage, backup, bot archive/import, Marketplace/Library transfer, replay, and UI rendering;
   - Avatar Studio authoring/compile feedback, Power badges or outcomes, tutorials, applet versions, docs, and focused tests.
5. Classify the request:
   - **Integrated**: authoring, compilation, persistence, relevant runtime outcomes, player feedback, and regression tests all support the exact contract. Make no code change; run focused confirmation and cite the evidence.
   - **Partial**: some cue/schema exists but one or more promised outcomes are missing. Complete those gaps.
   - **Missing**: add the smallest coherent end-to-end implementation.

Treat prompt-only support as partial whenever the outcome affects deterministic state, routing, memory, visibility, audio, props, replay, or persisted history.

## Design the integration

Prefer one bounded, versioned semantic effect in the shared Power contract plus mode-specific adapters. Reuse an existing `BotPowerEffectV1` variant only when its actual semantics match; do not overload a nearby effect to save code.

When adding or changing an effect:

1. Define bounded fields and normalization in the shared contract. Reject or safely normalize malformed model output.
2. Teach the compiler to produce it. Add deterministic parsing/recovery for hard wording that must not depend on model compliance.
3. Preserve source-hash staleness behavior and prompt/token limits. Change the stored version only when interpretation or compatibility truly requires it, then add migration/backward-compatibility coverage.
4. Implement observable outcomes in the owning runtime. Keep shared semantics common, but let each mode express them through its own fiction and orchestration.
5. Keep session-frozen behavior immutable where the mode already snapshots Powers. Persist outcome events needed for reload and replay rather than reconstructing them from prose.
6. Update transfer and recovery paths when the stored shape changes. Ready Powers should survive save, backup, export/import, and Marketplace/Library flows; draft, stale, disabled, and failed Powers must remain inactive.
7. Show the outcome clearly enough that the player can read the fiction without exposing hidden prompts, private metrics, or implementation jargon.

Do not build a giant universal Power engine when a shared contract and small adapters are sufficient. Do not solve a mode-specific visual with a global prompt, and do not make one applet's table/studio/document fiction leak into another lane.

## Maintain the Power Collection

When the user assigns a Power to a named showcase bot, publish or refresh that bot in the Marketplace's growing `power-collection` group as part of the same change. The collection is append-only by default and has no five-bot limit. Keep every bot independently installable while preserving collection install as one Library group. Skip publication only when the user explicitly asks for a private experiment or publishing would introduce a meaningful unresolved risk; record that decision in the verification notes.

Use `scripts/update-power-bot-marketplace.mjs` as the canonical collection recipe and preserve every unrelated Marketplace entry or bundle. For each named Power bot:

1. Keep a stable Marketplace ID and hash, add or update its recipe, and append its ID to the `power-collection` roster without pruning earlier showcase bots.
2. Give it a concise card subtitle and description plus a complete structured profile. Describe the character and lived condition, not the implementation.
3. Export the ready portable Power, authored prompt/profile, curated face and unique thinking spinner, authored voice profile, and a short preview line. Recompile deterministic hard rules so old Library snapshots cannot publish stale semantics; preserve ready prompt-only Powers when no structured effect honestly matches.
4. Run the updater in `--dry-run` mode against the source Library first, then `--apply` with a new workspace backup directory. Never modify the source Library database and never overwrite an existing backup.
5. Extend `botMarketplaceCatalog.test.ts` with collection membership, descriptions, profile/prompt presence, ready source hashes, effect contracts, curated face inventory, and the full unbounded roster. Verify a second dry run reports no changes.

Installing the collection must recreate it as a Library group through the existing Marketplace theme flow. Do not add a bespoke installer or UI cap when the shared theme/group path already supports the growing roster.

## Cover every mode

Before implementation, make a mode impact matrix from the live applet registry. For each current or planned applet, choose and justify one policy:

- **Direct**: the mechanic has a concrete runtime outcome here.
- **Cue**: only the holder/observer behavioral context applies here.
- **Adapted**: the same semantic effect needs mode-specific expression.
- **Irrelevant**: the mode has no meaningful participant or outcome surface.
- **Deferred**: the applet is planned; record the expected contract and extension seam without inventing its product.

Always inspect Chat/Zen compatibility routing, Coffee, Signal (`botcast` internally), Story, Slate, and every entry newly present in `PRISM_APPLETS`. Consider setup, live use, completion, replay, reload, export, and reset—not just the first generated response.

For a mode-dependent mechanic, prefer an exhaustive policy map or coverage assertion near the appropriate registry so a future applet cannot silently inherit the wrong behavior. Avoid a cross-package dependency solely for exhaustiveness; use the closest authoritative registry and a focused test. Planned applets need a future-safe contract, not speculative screens or runtime code.

## Verify and finish

Add focused tests at the lowest useful layers:

- shared normalization, serialization, stale hashes, prompt bounds, and effect helpers;
- compiler acceptance, deterministic hard-rule recovery, malformed output, and unsupported intent;
- each affected mode's state transition, prompt visibility, participant routing, and outcome;
- persistence, replay/reload, backup/export/import, and UI/tutorial coverage when touched;
- an inventory or policy test that exposes unreviewed future modes when appropriate.

### Require a live LLM behavior check

Do not complete a newly created or materially changed Power from deterministic tests alone. Make at least one real LLM call through an available PRISM provider using the production-composed system prompt for a relevant active mode and a short synthetic trigger message. For a Chat or Zen baseline, prefer `scripts/validate-prism-power-live.mjs`; it reads the exported bot archive, composes the production persona, and prints a credential-free JSON result. It defaults to LOCAL `llama3.2`; run ONLINE calls through `/Users/jared/.codex/bin/with-secrets`. Add another sample for each mode adapter whose prompt or target semantics materially differ. Keep LOCAL checks local; use ONLINE only through the user's configured credentials and existing privacy gates. Never include private conversation history, secrets, or personal data in a validation prompt.

Before calling the model, write explicit pass criteria from the outcome contract: required observable behavior, prohibited failure modes, target identity, and any hard rule that runtime code—not the model—must enforce. Record the provider, model, mode, synthetic input, response, and pass/fail judgment in the Bead or verification artifact without recording credentials. For soft Powers, the reply must visibly express the intended pressure while preserving agency and safety. For hard Powers, the live call supplements rather than replaces deterministic engine enforcement.

Treat a failed or ambiguous sample as an incomplete Power. Fix the compiled cue, prompt composition, or mode adapter and rerun the same scenario until it passes, or report a genuine provider blocker. Do not leave live-model validation as an optional manual gap when a provider is available.

Run the narrow suites first, then targeted typecheck/lint and `git diff --check` in proportion to risk. Review `apps/web/src/app/firstRunOnboarding.ts` and `apps/web/src/app/modeTutorials.ts` for every player-visible change. Update affected applet versions and `docs/applets.md` only for meaningful felt behavior, following repository conventions.

Close only the Beads issue used for this work. Do not commit or push unless the user separately asks.

Report the result in this order:

- **Outcome**: already integrated, completed, or blocked;
- **Power contract**: the exact lived rule and assumptions;
- **Mode coverage**: concise current/planned-mode decisions;
- **Marketplace**: showcase bot, description, and `power-collection` membership or an explicit reason publication was skipped;
- **Verification**: exact deterministic checks plus live provider/model, sampled mode(s), scenario, and result;
- **Gaps**: only real remaining limitations or live-model/manual validation.

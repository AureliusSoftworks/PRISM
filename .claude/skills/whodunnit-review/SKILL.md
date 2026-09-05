---
name: whodunnit-review
description: Review PRISM Whodunnit Case Forge jobs, compiled cases, playable sessions, archives, replays, and portable packages, then diagnose provenance and make focused systemic fixes. Use whenever the user invokes /whodunnit-review, supplies Case Forge session/case references, a Whodunnit verbose transcript, or error details, cannot create, continue, finish, reopen, export, or import a mystery, or reports case-logic, mansion, evidence, Theory Board, testimony, Court, verdict, voice, asset, or replay failures — even without the word "review".
---

# Whodunnit Review

Read the shared PRISM review core at
`.claude/skills/references/prism-review-core.md` (PRISM root) before
applet-specific work. Sealed case truth is private internal diagnostic evidence,
never an experienced review artifact. Whodunnit's "Copy verbose transcript" is a
diagnostic export whitelisted by `formatDebateMysteryV2PublicReview`; see
`docs/review-artifacts.md` for what it can and cannot prove.

## Workflow

1. Read the complete supplied record before judging it. Start with exact session, case/job, package, and archive references. If the user supplies only a public Case Forge error, resolve the durable compilation job and public session state read-only; do not treat the first visible attempt snapshot as the final persisted attempt count or cause. Convert every developer and session note into a work item before anything else.
2. Record the frozen setup and provenance available without opening sealed truth: format/version, premise and mansion preset, mansion source/derived/installed identity and revision, package origin, player role, difficulty, trial type, cast IDs and roles, provider/model/Effort and LOCAL/ONLINE lane, compilation status/stage/attempt budget, public failure code/stage, timestamps, current source/running API/desktop bundle/installed build, and archive/package availability.
3. Build an evidence ledger for every finding:
   - observed public text, heard audio, visible state, or durable diagnostic;
   - session, case/job, revision, stage, attempt, event, room, evidence, testimony, ruling, and package/archive IDs when available;
   - provider/model, retry/fallback, validation cause, timeout or lease state, asset/audio job, and nearby lifecycle events;
   - responsible layer: frozen setup, deterministic scaffold, authoring provider, section validation, fallback, contradiction/proof compilation, orchestration, persistence, public projection, mansion/assets, investigation, Theory Board, Court, verdict, archive/replay, or package import/export;
   - confidence: `observed`, `inferred`, or `unknown`.
4. Trace Case Forge failures through `frozen setup -> deterministic scaffold -> bounded section generation -> typed validation -> permitted fallback -> graph/contradiction compile -> performance/audio/asset preparation -> durable job state -> spoiler-safe public projection -> Case Forge recovery UI`. Never call a public error the raw provider failure without preserved cause evidence.
5. Trace play failures through `compiled sealed case -> mansion library/install revision -> cloned or derived topology -> room-art source and installed selection -> public rooms/clues/testimony -> investigation state -> Theory Board -> Court/rulings -> verdict -> Archive -> saved reopen/replay -> optional package export/import`. Identify the first layer where durable state and player-visible behavior diverge.
6. Audit three separate axes:
   - **Case integrity:** validator-confirmed coherence, reachable proof routes, clue/testimony consistency, no impossible progression, and a fair public basis for the verdict. Report validator outcomes without revealing culprit, solution, proof graph, hidden motives, private alibis, or unrevealed evidence.
   - **System integrity:** bounded attempts, typed failure handling, idempotent retry/resume, stable frozen IDs and truth, correct lifecycle stages, tenant isolation, LOCAL zero-egress, asset/audio separation, archive continuity, replay fidelity, and atomic package behavior.
   - **Player experience:** actionable spoiler-safe recovery, room and clue readability, no softlocks, Theory Board clarity, Court sequencing, audible/visible agreement, and an actually saved and reopenable completed artifact.
7. Audit Case Forge recovery narrowly. Three bounded authoring attempts are the maximum unless the current contract explicitly changes. Catch only the typed failure a fallback is designed to repair; incomplete foundation prose may use the frozen deterministic scaffold, while timeouts, provider/lease failures, invalid graphs, infrastructure faults, and audio failures retain their distinct recovery paths. `needs_attention` must preserve checkpoints and sealed truth while offering Retry preparation or Return to setup.
8. Preserve spoiler safety during diagnosis and repair. Query private rows only when needed to identify the responsible layer, never quote or summarize sealed solution fields to the user, logs, docs, Beads, commits, or tests. Prefer public projections, typed causes, counts, hashes, and validator outcomes as evidence.
9. Preserve LOCAL as zero egress. Do not recommend online research, provider escalation, or remote fallback for a LOCAL case. Imported packages and completed-case playback must not require a provider or network call.
10. With a concrete complaint and enough evidence, create or claim a Bead, establish a focused baseline, and fix the responsible PRISM layer. Do not mutate, retry, delete, or overwrite the failed case merely to diagnose it. If the user asks for review-only, thoughts, or a recommendation, stop after findings.
11. Reproduce the reported session shape with stubs or preserved fixtures first. Add focused regressions for the durable failure cause, public spoiler-safe projection, attempt budget, checkpoint preservation, and playable terminal state; `git diff --check` is always cheap. Verify per the core's verification posture. Player-surface QA for presentation or lifecycle changes follows the core's QA rules: Claude does not log in, so hand Jared the exact Case Forge, mansion, investigation, Theory Board, Court, Archive, and reopen steps to observe.

## Whodunnit Rules

- A completed compile enters `waiting_for_player`; do not require or assert a generic `active` state.
- The deterministic scaffold is authoritative for frozen IDs and case truth. A prose fallback may complete validated public-facing foundation text without rerolling the culprit, proof routes, evidence identity, or solution.
- Image, music, and voice preparation are presentation layers. Do not diagnose a `writing_case` failure as an asset problem without durable evidence, and never let asset recovery rewrite the case.
- Casekeeper identity, any private voice carrier, culprit, proof graph, solution, hidden evidence, and unrevealed testimony stay sealed. Public captions, audio, copied records, and reviews must not expose them.
- Persona, Powers, avatar, and voice may shape permitted performances after the case is frozen; relationship memory and learned continuity must not read from or write into Whodunnit.
- Do not call a case replayable from source tests or an unsaved verdict screen. Verify an Archive artifact can be reopened and replayed.
- Real player-surface QA uses Case Forge, mansion rooms/assets, investigation, Theory Board, Court, Archive, and reopen. Reuse the single `codex_qa_admin` account and keep it LOCAL; never create another QA account or use Jared's real account as a fixture without explicit approval.
- For portable `.mansion` or `.whodunnit` acceptance, export before completing the source, recoverably delete it, import and play in a clean case, then export/delete/import the completed package. Preserve existing files on collisions and keep imports atomic.
- Installed mansions and archived cases are immutable sources. Topology edits require a tenant-owned duplicate/Derived record; verify floor connectivity, room-type uniqueness, asset references, and that editing the derivative cannot mutate the installed source.
- Track room art from package/source asset through content-addressed installation to the actual rendered room selection. Generated transforms or source tests do not prove the installed bundle contains or displays the intended art.
- On name, identity, or asset collisions, preserve the existing library entry and report the imported result's resolved identity. Never overwrite an installed mansion or partially install a package.
- A source fix does not update an already-running request or an older packaged app. Distinguish current source, running API, desktop bundle, and installed build before asking the user to retry.
- Prefer validators, typed failure causes, bounded fallback, orchestration, serialization, and recovery UI fixes over model-specific prompt hacks, manual database edits, or rewriting a saved mystery.
- Production Readiness pauses on any requested category that came back reused, swapped, or unavailable, so a setup that requests what the selected venue already provides can only pause. Case Forge never composes music (a venue soundtrack is reused automatically), and Ambience is a deterministic local acoustic mix, not generated audio. Judge "why did it pause" complaints against those contracts before suspecting a provider.

## Key Surfaces

- Case Forge setup pages (Experience, Mystery Venue, Story, Production) and the create request: `apps/web/src/app/DebateExperience.tsx` under `mysterySetupPage`, not the play experience. Option copy comes from `resolveDebateMysteryProductionCapabilitiesV1` and venue provision from `resolveDebateMysteryVenueProductionV1` in `packages/shared/src/debateMysteryV2.ts`
- Case orchestration and persistence: `apps/api/src/debate-mystery-v2.ts`
- API regressions: `apps/api/src/__tests__/debate-mystery-v2.test.ts`
- Shared public contracts: `packages/shared/src/debateMysteryV2.ts`
- Case Forge and play UI: `apps/web/src/app/DebateMysteryV2Experience.tsx`
- Spoiler-safe failure copy: `apps/web/src/app/debateMysteryV2ForgeFailureDetails.ts`
- Portable packages: `apps/api/src/debate-mystery-whodunnit-package.ts` and related mansion/package codecs

## Output

- `Findings`: evidence-led failures with layer and confidence, using spoiler-safe identifiers and diagnostics only.
- `Root cause`: the first broken provenance link and why adjacent provider, validation, asset, persistence, or presentation layers are ruled out.
- `Fixes`: systemic PRISM changes made, or focused recommendations in review-only mode.
- `Verification`: baseline, exact checks run or deliberately not run, lifecycle result, and whether a saved artifact was reopened.
- `Gaps`: missing durable cause, installed-build uncertainty, unavailable authentication, or live audio/visual/package validation still required.

# Debate Formats and Turnabout V1

Last reviewed: 2026-07-28

## Product direction

Debate formats are rulesets with signature productions, not themes. A format
may define its own phases, legal player actions, orchestration, prompts, public
record, procedural vocabulary, room response, and stage presentation while
sharing Debate's cast, frozen motion and evidence, provider/model freeze,
privacy boundary, durability, and replay machinery.

- **Forum** is the existing Duel flow. It remains the default and preserves
  legacy behavior. Its **Assembly Chamber** production uses parliamentary
  address, a neutral chair, recognized speakers, floor procedure, and a motion
  carried or defeated.
- **Turnabout** is an original PRISM courtroom format. It builds a public record
  from pressable testimony, exact frozen-evidence objections, immediate neutral
  moderator rulings, grounded reversals, and a decisive resolution. Its
  **Court of Record** production uses taut examination language and a distinct,
  restrained judicial room response without borrowing protected characters,
  catchphrases, writing, artwork, or presentation.
- **Flyting / Mead Hall** and **Cypher / The Cypher** are cataloged as disabled
  future productions. Their IDs are deliberately excluded from the executable
  server format union until their own rules and validators exist.

The neutral moderator controls procedure and rules on evidence. A player in the
Judge role delivers the final ruling; Participants examine the opposing side;
Spectators watch moderator-led examination and retain deterministic replay.
This distinction keeps all three existing Debate roles useful without giving
the moderator arbitrary authority over the public record.

Bot personas and snapshotted Powers may shape testimony delivery. They may not
change formal identity, side, seat, floor ownership, evidence eligibility,
ruling validation, ballots, hard mute, or advocacy consent.

## Architecture

The format seam is additive and persisted inside the existing `session_json`.
No Debate table rewrite is required for V1.

- `packages/shared/src/debate.ts` owns both the executable format registry and
  the visible production catalog, plus versioned discriminated format state,
  Turnabout statements and contradictions, event metadata, request contracts,
  and legacy normalization. Catalog previews never become accepted format IDs.
- `apps/api/src/debate.ts` retains the Forum engine and dispatches Turnabout to
  its own transitions and action validator. A server-owned production voice
  contract reaches every generated speech and ballot while exact quote
  grounding is checked server-side before any objection can be sustained.
- `apps/api/src/server.ts` exposes the Turnabout action route while reusing the
  frozen Debate provider/model runtime and action-session accounting.
- `apps/web/src/app/DebateExperience.tsx` freezes format during Start, renders
  the production catalog and Turnabout public record, selects format-specific
  room acoustics, and submits Press, Present Evidence, and Pass actions without
  coupling canonical state to animation or audio timing.
- `apps/web/src/app/modeTutorials.ts` and first-run onboarding introduce the
  format choice, frozen-record rule, and Turnabout action deck.

Every saved session now records:

```text
format: "forum" | "turnabout"
formatVersion: 1
formatState:
  { version: 1, format: "forum" }
  or
  {
    version: 1,
    format: "turnabout",
    phase,
    round,
    activeStatementId,
    floorOwnerBotId,
    statements[],
    contradictions[]
  }
```

Top-level legacy phase and status values remain broad enough for the existing
SQLite constraints. Format-specific phase lives in `formatState`. Old session
JSON without format fields normalizes to Forum V1 when read, replayed, mutated,
listed, backed up, or restored.

## Turnabout canonical flow

1. Start freezes format, motion, cast IDs and roles, provider/model, Power
   snapshots, and evidence.
2. The moderator opens the proceeding.
3. Each advocate enters two independently pressable statements. Hard mute
   produces canonical silence instead of substitute testimony. Unsupported
   evidence-like attributions or quantities are replaced with a deterministic
   advocacy claim drawn from the frozen motion and side brief.
4. Judge examines all statements. Participant examines only the opposing side.
   Spectator receives deterministic moderator-led presses.
5. **Press** records the action, advocate clarification or canonical silence,
   and an immediate moderator ruling while preserving stable floor ownership.
6. **Present Evidence** must identify the active statement and one exact source
   ID from the pre-Start frozen record.
7. The model may assess semantic conflict, but the server sustains only when
   both proposed quotes are exact contiguous excerpts from the recorded
   statement and frozen evidence. Ungrounded output is overruled with no
   fabricated marker or quote in public speech or audio.
8. A sustained objection records a contradiction and permits one constrained
   reversal from the affected advocate. No new evidence may enter.
9. Pass resolves the active statement without an objection.
10. The Judge's ruling or the existing three-bot ballot path resolves the
    proceeding from the public record. No score, confidence, or win odds are
    calculated or shown.

Mutation revisions and idempotency keys govern every action. Pause/resume,
retry/skip, saved-session replay, verdict continuity, hard mute, and stable bot
identity use the same canonical Debate persistence path as Forum.

## Disciplined V1 boundary

V1 proves that one Debate shell can host two genuinely different rulesets:

- durable format registry and versioned state;
- a separate visible production catalog with non-executable future entries;
- backward-compatible Forum default;
- distinct Assembly Chamber and Court of Record language and room response;
- one witness-equivalent advocate per side with two statements each;
- Judge, Participant, and Spectator adaptations;
- Press, Object/Present Evidence, and Pass;
- exact frozen-record validation, immediate rulings, one-step reversals, and
  deterministic resolution;
- a public-record panel and action deck within the current Debate stage;
- focused shared, API, integration, web, onboarding, and tutorial coverage.

V1 deliberately defers authored per-format environment artwork, freeform
evidence creation, multiple witnesses, cross-session case libraries, custom
objection animations, interruptible voice choreography, executable Flyting or
Cypher rules, and third-party format plugins. Those additions should follow
playtesting of the rules, voice, and record clarity, not precede it.

## Compatibility and risks

- **Migration:** legacy rows do not need a schema migration, but all future
  format changes must increment `formatVersion` and add an explicit normalizer.
- **Forum drift:** shared fields and server dispatch must continue defaulting
  missing or invalid format values to Forum. Forum regression tests remain a
  release gate.
- **Consent:** advocacy consent is format-bound. A valid decline remains final,
  and consent from one format cannot be reused for another.
- **Evidence:** model judgment is not canonical validation. Exact source ID,
  freeze time, exact quote grounding, and evidence-like detail checks are
  server-owned.
- **Orchestration:** format-specific steps must not leak into Forum player-turn
  or interjection routes. Floor ownership remains a stable bot ID.
- **Presentation:** audio, reveal cadence, animation, camera direction, and
  objection staging may react to events but must never advance or mutate them.
- **Catalog safety:** only entries in the executable registry may pass shared
  validation or reach session creation. Disabled production cards are visible
  discovery, not placeholder server behavior.
- **Replay:** new event kinds and metadata must remain additive so older Forum
  sessions and exports can still render.
- **Language:** Turnabout is a PRISM-native working name and interaction system;
  it must not inherit protected characters, artwork, dialogue, or presentation
  from courtroom games that inspired the user request.

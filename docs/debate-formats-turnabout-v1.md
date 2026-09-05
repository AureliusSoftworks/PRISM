# Debate Formats: Turnabout and Flyting V1

Last reviewed: 2026-08-31

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
- **Flyting / Mead Hall** is an executable PRISM format rooted visibly in the
  Norse verbal contest while remaining legible without Norse knowledge. It is
  a contest of claims, exact challenges, and answering wit—not a rhyme game or
  a Viking theme over Forum.
- **Cypher / The Cypher** remains a cataloged future production. Its ID is
  excluded from the executable server format union until its own musical rules
  and validators exist.

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
  the visible production catalog, plus versioned discriminated Forum,
  Turnabout, Whodunnit, and Flyting state, event metadata, request contracts,
  and legacy normalization. Catalog previews never become accepted format IDs.
- `apps/api/src/debate.ts` retains the Forum engine and dispatches Turnabout and
  Flyting to their own transitions and action validators. A server-owned production voice
  contract reaches every generated speech and ballot while exact quote
  grounding is checked server-side before any objection can be sustained.
- `apps/api/src/server.ts` exposes Turnabout and Flyting Forge, Wield, and action routes while reusing the
  frozen Debate provider/model runtime and action-session accounting. It also
  owns authenticated object-exhibit upload and synthesis routes; generated
  sprites use one server-owned art bible and both paths normalize to a square
  transparent PNG.
- `apps/web/src/app/DebateExperience.tsx` freezes format during Start, renders
  the production catalog, and hands Flyting to its own setup and live Hall.
  `apps/web/src/app/DebateFlyting.tsx` owns the Bout Forge and Hall Record while
  `apps/web/src/app/debateFlytingAudio.ts` owns bounded ritual cues. Debate selects format-specific
  room acoustics, and submits Press, Present Evidence, and Pass actions without
  coupling canonical state to animation or audio timing.
- `apps/web/src/app/modeTutorials.ts` and first-run onboarding introduce the
  format choice, frozen-record rule, and Turnabout action deck.

Every saved session now records:

```text
format: "forum" | "turnabout" | "whodunnit" | "flyting"
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
  or
  {
    version: 1,
    format: "flyting",
    bout,
    phase,
    activeExchangeIndex,
    floorSideId,
    expectedAction,
    exchanges[4],
    hallMembers[15],
    hallLeaningHistory[],
    jarlGuards[3],
    finalTally,
    hostVerdict // legacy field name; player-facing authority is the Jarl
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
   or object-exhibit ID from the pre-Start frozen record. An exhibit's approved
   `{ADJECTIVE} {OBJECT}` title and observable-fact text are canonical; its
   emoji, uploaded image, or synthesized sprite is presentation only.
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

## Flyting canonical flow

1. **Summon** chooses Participant coach, human Jarl, or Spectator. Participant
   selects the real bot they coach; that bot remains the public body and voice.
2. **Cast** freezes two flyters and a bot Jarl unless the player holds the staff.
   The Hall itself is fifteen generic spectators plus three Jarl guards;
   duplicate flyter/Jarl seats are rejected.
3. **Bout Forge** produces editable fictional stakes, epithets, and three public
   Legend facets per flyter from public bot persona only. It reads no private
   relationship memory and performs no live research. Both flyters consent to
   that frozen record before Start or Save.
4. Four exchanges alternate boasting side A / B / A / B. Each exchange is
   **Boast → Challenge / Flyte → Rejoinder → Acclamation**.
5. A Boast must use one unused Legend facet. A Challenge must target one exact
   recorded opponent claim through **Doubt, Expose, Belittle, or Outdo**.
6. A Rejoinder must answer that exact challenge through **Stand, Own, Turn, or
   Return**. Return also targets one recorded challenger claim. The evaluator
   records answered, turned, or contested; it never scores truth, fame, or
   private biography.
7. **Yield** is the only non-answer. It permanently marks that exchange
   unanswered and cannot be softened into a substitute line.
8. The fifteen spectators move among `for`, `neutral`, and `against` after each
   exchange. If neutral holds a strict plurality at the end, both flyters lose
   and the three guards hold the center. Otherwise the human or bot Jarl sends
   all three guards to one side. Those guards add weight three; the weighted
   Hall total decides the winner, and the Jarl's side breaks an exact weighted
   tie without overturning a larger opposing majority.
9. The Hall Record persists the exact Power-projected public lines,
   targets, maneuvers, resolutions, Jarl-authored acclamations, crowd-sway
   history, guard placement, final tally, and decisive ruling. Replay performs
   that frozen record without rerunning Forge or changing the winner.

There is no timer, meter, rhyme requirement, numeric score, continuous music,
runtime image generation, or private relational lore. The authored Mead Hall
uses the same bot voice and global Audio controls as Debate, with only brief
procedural cues at ritual boundaries.

## Disciplined V1 boundary

V1 proves that one Debate shell can host multiple genuinely different rulesets:

- durable format registry and versioned state;
- a separate visible production catalog with non-executable future entries;
- backward-compatible Forum default;
- distinct Assembly Chamber, Court of Record, and Mead Hall language and room response;
- one witness-equivalent advocate per side with two statements each;
- Judge, Participant, and Spectator adaptations;
- Press, Object/Present Evidence, and Pass;
- player-authored or PRISM-suggested object exhibits with emoji, uploaded art,
  or consistently synthesized transparent sprites;
- exact frozen-record validation, immediate rulings, one-step reversals, and
  deterministic resolution;
- public-record panels and action decks matched to each format;
- focused shared, API, integration, web, onboarding, and tutorial coverage.

V1 deliberately defers arbitrary
evidence schemas beyond sources and object exhibits, multiple witnesses,
cross-session case libraries, custom objection animations, interruptible voice
choreography beyond Flyting's bounded ritual cues, executable Cypher rules, alternate Flyting halls, and third-party format
plugins. Those additions should follow playtesting of the rules, voice, and
record clarity, not precede it.

## Compatibility and risks

- **Migration:** legacy rows do not need a schema migration, but all future
  format changes must increment `formatVersion` and add an explicit normalizer.
- **Forum drift:** shared fields and server dispatch must continue defaulting
  missing or invalid format values to Forum. Forum regression tests remain a
  release gate.
- **Consent:** advocacy consent is format-bound. A valid decline remains final,
  and consent from one format cannot be reused for another.
- **Evidence:** model judgment is not canonical validation. Exact evidence ID,
  freeze time, exact text grounding, image ownership, and evidence-like detail
  checks are server-owned. A generated or uploaded visual may never add facts
  beyond the exhibit title and observable-fact record.
- **Orchestration:** format-specific steps must not leak into Forum player-turn
  or interjection routes. Floor ownership remains a stable bot ID.
- **Presentation:** audio, reveal cadence, animation, camera direction, and
  objection staging may react to events but must never advance or mutate them.
  The live pedestal appears only while an object exhibit is being cited and
  opens the same frozen record drawer as transcript evidence links.
- **Catalog safety:** only entries in the executable registry may pass shared
  validation or reach session creation. Disabled production cards are visible
  discovery, not placeholder server behavior.
- **Replay:** new event kinds and metadata must remain additive so older Forum
  sessions and exports can still render.
- **Language:** Turnabout is a PRISM-native working name and interaction system;
  it must not inherit protected characters, artwork, dialogue, or presentation
  from courtroom games that inspired the user request.

# Review Artifacts

PRISM reviews operate on an experienced artifact, never an applet's raw runtime
record.

```text
raw applet state
  -> applet-owned perspective projection
  -> immutable PrismReviewArtifactV1
  -> generic reviewer runner
  -> typed PrismReviewResultV1
```

The applet owns perception. Signal decides what its broadcast audience could see
and hear; Slate should snapshot the exact manuscript revision shown to a reader;
Story should snapshot the path and outcome a player experienced. Private prompts,
hidden dialogue, control state, and other implementation data stay outside the
artifact unless a future review explicitly declares a perspective allowed to
experience them.

The generic runner owns the reviewer persona snapshot, rubric envelope, bounded
evidence prompt, structured-output validation, and provenance hashes for the
artifact and reviewer snapshot. Applets still own reviewer selection, storage,
product-specific output, and rendering.

Signal is the first consumer. Its audience projection is shared by the HTTP
episode copy, stage visibility, captions, voice, replay, and Audience Pulse.
The internal episode can retain an imperceptible performance for orchestration,
but the public copy keeps only a redacted turn skeleton so pacing and turn order
remain stable without exposing hidden content.

When adding another review:

1. Define the reviewer's perspective and what it can experience.
2. Freeze the applet source revision or session boundary.
3. Project only perceptible evidence into `PrismReviewArtifactV1`.
4. Define a versioned rubric and typed parser.
5. Call `runPrismReviewV1`; never pass raw applet state to the reviewer.
6. Persist the result and its provenance through the owning applet's storage.

## Whodunnit diagnostic transcript

Whodunnit's **Copy verbose transcript** is a separate, versioned diagnostic
export, not a `PrismReviewArtifactV1` or a claim about experienced delivery.
`formatDebateMysteryV2PublicReview` whitelists public session provenance, recorded
dialogue and observations, accepted actions, admitted records, the filed theory,
and the terminal result. It is shared by Case File, Theory Board, result, and
Archive copies. Legacy action summaries may supplement the chronology; missing
history, per-line runtime attribution, and observed playback remain explicit
unknowns. Sealed solutions, private prompts, voice-carrier identity, unadmitted
evidence, and undiscovered branches never enter the copy. Diagnostic review must
keep recorded facts separate from inference and from independently observed UI
or audio; never submit this transcript as an experienced-artifact snapshot.

An eligible Theory Board may conclude a Run via `check_case`, without Court or
generation. Its persisted `caseCheck` v1 result assesses the exact accused set
only, not the written method, motive, opportunity, or proof. It records no legal
verdict or jury ballot and does not reveal the sealed responsible identities.
Confirmation is terminal for that Run; the normal Court route remains available
before confirmation. Fresh Runs and reusable case packages clear the prior
result and public action history.

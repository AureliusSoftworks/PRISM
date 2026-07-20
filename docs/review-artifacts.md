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

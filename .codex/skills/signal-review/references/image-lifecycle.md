# Signal image lifecycle review

Use this audit for successive picture reveals, comparisons, lost originals, or
incorrect pictures in replay. Producer sessions with a bot guest support live
pictures; Watch retains one pre-show picture. Keep legacy Item replay readable
without adding Item creation or retention to live picture uploads.

## Identity and presentation

- Reconstruct image history by explicit image ID. Setup, pending, active, and
  the image associated with an utterance serve different purposes; the latest
  image event cannot stand in for all of them. Record setup provenance before
  its reveal so episode retry cannot select a later live upload.
- Distinguish registration, introduction generation, and actual playback.
  Add image queues the next eligible normal host turn; it must bypass the
  host-interruption path. Preserve speech underway and keep the current picture
  visible until the replacement's introduction starts playing. A failed
  introduction leaves the replacement queued and retryable.
- Reproduce an older turn finishing while a new upload registers. Lifecycle
  updates must remain bound to their image ID, and late responses must preserve
  newer messages and image events. Invalidate speculative turns that would miss
  the reveal without cancelling audible speech.

## Grounding and recovery

- Inspect actual turn attachments and prompt inputs: current and previous
  originals need distinct labels; older comparisons use grounded descriptions
  and linked public discussion, including recorded positions. Exclude queued
  pictures and their descriptions from guest context until the host reveals
  them. Private host notes must not enter visual descriptions or guest memory.
- Reattach missing live originals to their existing image IDs. Archival proxies
  support replay, not live pixel inspection. Partial reattachment must remain
  recoverable; completing the required attachments continues the turn loop
  under the live production contract in the main skill.
- Trace proxy storage, retrieval, and cache keys by episode and image ID. Check
  unchanged-ID retries, conflicting content, competing pending uploads, and
  migration preservation through the application's active storage layer,
  including encrypted views when present.

## Replay evidence

Resolve staging and placement/removal sounds from the image associated with
each recorded utterance. A callback must not automatically restore an older
picture. Check saved/reopened transitions and quiet gaps as well as speech.
Frame-projection tests do not certify an encoded video or synchronized Foley;
inspect the actual export path and artifact before claiming that coverage.

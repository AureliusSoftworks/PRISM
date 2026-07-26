import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPrismSessionReviewIndex,
  indexPrismSessionReview,
} from "./index-prism-session-review.mjs";

const signalV2 = `# PRISM Signal Review Transcript

Review format: 2

## Episode

- Episode ID: signal-1
- Topic: Staying specific
- Episode provider: local
- Episode model: gemma

## Transcript

### Turn 01 | 00:03.000 | Rick (host)

- Message ID: message-1
- Turn routing: auto -> local -> gemma
- AUTO recovery: {"attempts":2}
- Utterance repair: {"fallbackKind":"host_follow_up","reason":"peer_label"}
- Visible transcript:
    What did that actually cost?

## Faithful Recording Evidence

- Replay availability: faithful
- Manifest version: 2

## Production Event Log

- #0001 | 2026-07-25T00:00:03.000Z | utterance | event event-1 | {"messageId":"message-1"}

## Private Replay Direction Log

- #0001 | atMs=1000 | endMs=2500 | kind=thinking | sourceMessageId=message-1 | payload={"audible":false,"botId":"rick","camera":"host","endReason":"interrupted","followingMessageId":"message-1","participantId":"host","segment":"opening"}
- #0002 | atMs=2500 | endMs=none | kind=speech | sourceMessageId=message-1 | payload={"active":true,"speakerId":"rick"}
`;

const coffeeV2 = `# PRISM Coffee Review Export

Review format: 2

Session ID: coffee-1
Topic: Help and control

## Faithful Recording Evidence

- Replay availability: faithful
- Manifest version: 2

## Detailed Turns

### Turn 01 | 00:02.000 | Nova (assistant)

- Message ID: coffee-message-1
- Turn routing: local -> gemma
- AUTO recovery: None recorded
- Output provenance: recorded post-processing result
- Visible transcript:
    Help becomes control when consent disappears.

## Replay Event Log

- #0001 | 2026-07-25T00:00:04.000Z | topOff | sourceMessageId=coffee-message-1 | payload={"kind":"topOff"}

## Private Replay Direction Log

- #0001 | atMs=500 | endMs=1800 | kind=thinking | sourceMessageId=coffee-message-1 | payload={"audible":true,"botId":"nova","camera":"seat-1","endReason":"completed","followingMessageId":"coffee-message-1","participantId":"nova","segment":"table"}
`;

const coffeeV1 = `# PRISM Coffee Review Export
Session ID: coffee-legacy
Topic: An older table

## Table Prose
Nova: One saved line.

## Replay Events
- 2026-07-20T00:00:00.000Z arrival: Nova (nova)
`;

const signalV1 = `# PRISM Signal Review Transcript

## Episode

- Episode ID: signal-legacy
- Topic: An older interview
- Episode provider: local
- Episode model: llama3.2

## Transcript

### Turn 01 | 00:00.000 | Host (host)

- Message ID: legacy-message
- Turn routing: local -> local -> llama3.2
- AUTO recovery: None recorded
- Visible transcript:
    One saved question.

## Production Event Log

- #0001 | 2026-07-20T00:00:03.000Z | utterance | event legacy-event | {"messageId":"legacy-message","utteranceRepair":{"fallbackKind":"host_follow_up","reason":"peer_label"}}
`;

describe("PRISM session review indexer", () => {
  it("indexes Signal repairs, routes, stable events, and interrupted thinking", () => {
    const index = indexPrismSessionReview(signalV2);

    assert.equal(index.surface, "signal");
    assert.equal(index.reviewFormat, 2);
    assert.equal(index.metadata.sourceId, "signal-1");
    assert.equal(index.turns[0]?.fields.message_id, "message-1");
    assert.equal(index.repairs.length, 1);
    assert.equal(index.recoveries.length, 1);
    assert.equal(index.productionEvents[0]?.kind, "utterance");
    assert.deepEqual(index.directionCounts, { thinking: 1, speech: 1 });
    assert.deepEqual(index.thinkingIntervals[0], {
      sequence: 1,
      atMs: 1000,
      endMs: 2500,
      sourceMessageId: "message-1",
      participantId: "host",
      botId: "rick",
      audible: false,
      camera: "host",
      segment: "opening",
      followingMessageId: "message-1",
      endReason: "interrupted",
    });
    assert.deepEqual(index.warnings, []);
  });

  it("indexes Coffee turn provenance, replay state, and audible thinking", () => {
    const index = indexPrismSessionReview(coffeeV2);
    const markdown = formatPrismSessionReviewIndex(index);

    assert.equal(index.surface, "coffee");
    assert.equal(index.metadata.sourceId, "coffee-1");
    assert.equal(index.replayEvents[0]?.kind, "topOff");
    assert.equal(index.thinkingIntervals[0]?.audible, true);
    assert.match(markdown, /route=local -> gemma/u);
    assert.match(markdown, /topOff: 1/u);
    assert.match(markdown, /Thinking intervals: 1/u);
  });

  it("accepts legacy Format 1 Coffee exports with explicit evidence warnings", () => {
    const index = indexPrismSessionReview(coffeeV1);

    assert.equal(index.reviewFormat, 1);
    assert.equal(index.surface, "coffee");
    assert.equal(index.turns.length, 0);
    assert.match(index.warnings.join("\n"), /Legacy review format 1/u);
    assert.match(index.warnings.join("\n"), /Table Prose as limited evidence/u);
    assert.match(index.warnings.join("\n"), /recording diagnostics/u);
  });

  it("recovers repair evidence from legacy Signal production events", () => {
    const index = indexPrismSessionReview(signalV1);
    const markdown = formatPrismSessionReviewIndex(index);

    assert.equal(index.reviewFormat, 1);
    assert.equal(index.surface, "signal");
    assert.equal(index.turns[0]?.fields.message_id, "legacy-message");
    assert.equal(index.repairs.length, 1);
    assert.equal(index.repairs[0]?.source, "production_event");
    assert.equal(index.productionEvents.length, 1);
    assert.match(index.warnings.join("\n"), /Legacy review format 1/u);
    assert.match(
      markdown,
      /Repair: message=legacy-message; source=production_event; detail=.*peer_label/u,
    );
  });

  it("rejects empty and unrecognized input without writing anything", () => {
    assert.throws(
      () => indexPrismSessionReview(""),
      /review export is empty/u,
    );
    assert.throws(
      () => indexPrismSessionReview("ordinary notes"),
      /Unrecognized PRISM Signal or Coffee/u,
    );
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_AUTO_ADVANCE_DELAY_MS,
  debateAudienceAllowsAttentiveFoley,
  debateAudienceAllowsFaceOpen,
  debateAudienceAllowsTransformBounce,
  debateAudienceMaxReactingSeats,
} from "./debatePerfTiming.ts";
import { reuseDebateSessionEventPrefix } from "./debateSessionAdopt.ts";
import { DEBATE_SCHEMA_VERSION, type DebateSessionV1 } from "@localai/shared";

test("auto-advance delay is tightened under the presentation gate", () => {
  assert.equal(DEBATE_AUTO_ADVANCE_DELAY_MS, 280);
  assert.ok(DEBATE_AUTO_ADVANCE_DELAY_MS < 520);
});

test("adaptive material tiers never remove semantic audience reactions", () => {
  assert.equal(debateAudienceMaxReactingSeats("full", "contention"), 2);
  assert.equal(debateAudienceMaxReactingSeats("balanced", "contention"), 1);
  assert.equal(debateAudienceMaxReactingSeats("minimal", "contention"), 1);
  assert.equal(debateAudienceMaxReactingSeats("full", "attentive"), 1);
  assert.equal(debateAudienceAllowsFaceOpen("full"), true);
  assert.equal(debateAudienceAllowsFaceOpen("balanced"), true);
  assert.equal(debateAudienceAllowsFaceOpen("minimal"), true);
  assert.equal(debateAudienceAllowsTransformBounce("full"), true);
  assert.equal(debateAudienceAllowsTransformBounce("balanced"), true);
  assert.equal(debateAudienceAllowsTransformBounce("minimal"), true);
  assert.equal(debateAudienceAllowsAttentiveFoley("minimal"), true);
  assert.equal(debateAudienceAllowsAttentiveFoley("full"), true);
});

test("session adopt reuses prior event object identity for the common prefix", () => {
  const shared = {
    version: DEBATE_SCHEMA_VERSION,
    id: "e1",
    sequence: 1,
    phase: "opening" as const,
    stepKey: "opening_for",
    kind: "speech" as const,
    speakerKind: "advocate" as const,
    speakerBotId: "bot-for",
    sideId: "for" as const,
    content: "Shared opening.",
    sourceIds: [],
    createdAt: "2026-07-30T12:00:00.000Z",
  };
  const previous = {
    id: "session-1",
    revision: 3,
    events: [shared],
  } as unknown as DebateSessionV1;
  const nextSharedClone = { ...shared };
  const nextTail = {
    ...shared,
    id: "e2",
    sequence: 2,
    content: "Fresh rebuttal.",
  };
  const next = {
    id: "session-1",
    revision: 4,
    events: [nextSharedClone, nextTail],
  } as unknown as DebateSessionV1;
  const adopted = reuseDebateSessionEventPrefix(previous, next);
  assert.equal(adopted.events[0], previous.events[0]);
  assert.notEqual(adopted.events[0], nextSharedClone);
  assert.equal(adopted.events[1], nextTail);
  assert.equal(adopted.revision, 4);
});

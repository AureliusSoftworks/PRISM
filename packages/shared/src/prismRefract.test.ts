import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePrismRefractRequest,
  normalizePrismRefractDirection,
  PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT,
  PRISM_REFRACT_DIRECTION_MAX_LENGTH,
  PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
} from "./prismRefract.ts";

test("normalizes a bounded registered Signal text target", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "signal.booking.topic",
      showId: "show-1",
      guestBotId: "guest-1",
    },
    currentValue: "  A current title  ",
    rejectedValues: Array.from(
      { length: PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT + 2 },
      (_, index) => `Idea ${index}`,
    ),
    preferredProvider: "local",
    responseMode: "local",
  });
  assert.equal(request.currentValue, "A current title");
  assert.equal(
    request.rejectedValues.length,
    PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
  );
  assert.equal(request.rejectedValues[0], "Idea 2");
  assert.equal(request.preferredProvider, "local");
});

test("normalizes a contextual Debate setup target without trusting extra fields", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "debate.setup.exhibitObject",
      botIds: [" bot-1 ", "bot-1", "bot-2"],
      context: {
        setupMode: "advanced",
        studioPanel: "evidence",
        format: "turnabout",
        formality: "heated",
        playerRole: "judge",
        playerSideId: "for",
        juryEnabled: false,
        moderatorTitle: "Moderator",
        topic: "Museum ethics",
        motion: "Museums should return contested artifacts.",
        forLabel: "Return",
        forBrief: "Defend return.",
        againstLabel: "Retain",
        againstBrief: "Defend stewardship.",
        exhibitAdjective: "Old",
        exhibitObject: "",
        exhibitObservation: "",
        evidenceItemCount: 2,
        secret: "discard me",
      },
    },
    currentValue: "freight train",
    rejectedValues: [],
  });
  assert.equal(request.target.kind, "debate.setup.exhibitObject");
  if (request.target.kind === "debate.setup.exhibitObject") {
    assert.deepEqual(request.target.botIds, ["bot-1", "bot-2"]);
    assert.equal(request.target.context.evidenceItemCount, 2);
    assert.equal("secret" in request.target.context, false);
  }
});

test("normalizes a contextual complete Debate exhibit pair", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "debate.setup.exhibitPair",
      botIds: [],
      context: {
        setupMode: "basic",
        studioPanel: "evidence",
        format: "forum",
        formality: "plainspoken",
        playerRole: "judge",
        playerSideId: "for",
        juryEnabled: false,
        moderatorTitle: "Moderator",
        topic: "Urban wildlife",
        motion: "Cities should protect urban wildlife corridors.",
        forLabel: "Protect",
        forBrief: "",
        againstLabel: "Develop",
        againstBrief: "",
        exhibitAdjective: "",
        exhibitObject: "",
        exhibitObservation: "",
        evidenceItemCount: 1,
      },
    },
    currentValue: "",
    rejectedValues: Array.from(
      { length: PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT },
      (_, index) => `Existing object ${index + 1}`,
    ),
  });
  assert.equal(request.target.kind, "debate.setup.exhibitPair");
  assert.equal(
    request.rejectedValues.length,
    PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT,
  );
});

test("rejects arbitrary and incomplete targets", () => {
  assert.throws(
    () =>
      normalizePrismRefractRequest({
        target: { kind: "signal.live.composer", showId: "show-1" },
      }),
    /registered Prism Refract target/u,
  );
  assert.throws(
    () =>
      normalizePrismRefractRequest({
        target: { kind: "signal.booking.topic", showId: "show-1" },
      }),
    /Signal guest is required/u,
  );
});

test("normalizes a bounded ephemeral magic direction without keyword loss", () => {
  const normalized = normalizePrismRefractDirection(
    `  Make this strange, tactile, and unresolved. ${"x".repeat(600)}  `,
  );
  assert.match(normalized, /^Make this strange, tactile, and unresolved\./u);
  assert.equal(normalized.length, PRISM_REFRACT_DIRECTION_MAX_LENGTH);
});

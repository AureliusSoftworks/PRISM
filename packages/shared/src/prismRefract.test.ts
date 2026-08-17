import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePrismRefractRequest,
  normalizePrismRefractDirection,
  PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS,
  PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT,
  PRISM_REFRACT_DIRECTION_MAX_LENGTH,
  PRISM_REFRACT_INPUT_CONTEXT_MAX_LENGTH,
  PRISM_REFRACT_INPUT_LABEL_MAX_LENGTH,
  PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH,
  PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
} from "./prismRefract.ts";

test("normalizes a bounded contextual Prism input target", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: `  ${"Bot direction ".repeat(20)}  `,
      context: `  ${"Profile field context ".repeat(80)}  `,
      multiline: true,
      maxLength: 10_000,
      secret: "discard me",
    },
    currentValue: "x".repeat(5_000),
    rejectedValues: ["y".repeat(5_000)],
  });
  assert.equal(request.target.kind, "prism.input.text");
  if (request.target.kind === "prism.input.text") {
    assert.equal(request.target.surface.surfaceId, "avatar-studio");
    assert.deepEqual(request.target.surface.botIds, ["bot-1"]);
    assert.equal(request.target.label.length, PRISM_REFRACT_INPUT_LABEL_MAX_LENGTH);
    assert.equal(
      request.target.context.length,
      PRISM_REFRACT_INPUT_CONTEXT_MAX_LENGTH,
    );
    assert.equal(request.target.multiline, true);
    assert.equal(request.target.maxLength, PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH);
    assert.equal("secret" in request.target, false);
  }
  assert.equal(request.currentValue.length, PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH);
  assert.equal(
    request.rejectedValues[0]?.length,
    PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH,
  );
});

test("registers manual Debate evidence controls as explicit Refract targets", () => {
  assert.equal(
    PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS.includes("debate.setup.playerNotes"),
    true,
  );
  assert.equal(
    PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS.includes(
      "debate.setup.researchQuery",
    ),
    true,
  );
  assert.equal(
    PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS.includes(
      "debate.setup.scholarQuery",
    ),
    true,
  );
  assert.equal(
    PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS.includes(
      "debate.setup.exhibitDraft",
    ),
    true,
  );
});

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
    modelOverride: null,
    reasoningEffort: "high",
    turbo: true,
  });
  assert.equal(request.currentValue, "A current title");
  assert.equal(
    request.rejectedValues.length,
    PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
  );
  assert.equal(request.rejectedValues[0], "Idea 2");
  assert.equal(request.preferredProvider, "local");
  assert.equal(request.modelOverride, null);
  assert.equal(request.reasoningEffort, "high");
  assert.equal(request.turbo, true);
});

test("keeps legacy routing hints bounded for server-side neutralization", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: "Power",
      context: "Current bot power draft",
      multiline: true,
      maxLength: 500,
    },
    currentValue: "Bends probability around bad jokes.",
    rejectedValues: [],
    preferredProvider: "openai",
    responseMode: "online",
    modelOverride: "gpt-5.6-sol",
    reasoningEffort: "max",
  });
  assert.equal(request.reasoningEffort, "max");
  assert.equal(request.modelOverride, "gpt-5.6-sol");
});

test("normalizes a contextual Debate setup target without trusting extra fields", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "debate.setup.exhibitObject",
      botIds: [" bot-1 ", "bot-1", "bot-2"],
      context: {
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

test("keeps a player exhibit description bounded for complete draft refraction", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "debate.setup.exhibitDraft",
      botIds: [],
      context: {
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
    currentValue: `  ${"blue glove ".repeat(180)}  `,
    rejectedValues: ["Frayed blue glove"],
  });
  assert.equal(request.target.kind, "debate.setup.exhibitDraft");
  assert.equal(request.currentValue.length, 1_100);
  assert.deepEqual(request.rejectedValues, ["Frayed blue glove"]);
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

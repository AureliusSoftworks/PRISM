import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateEventV1,
  type DebateFormalityId,
} from "@localai/shared";
import {
  DEBATE_AUDIENCE_MIX_BED_CEILING,
  debateAudienceOrderCallMix,
  debateAudiencePressureBand,
  debateAudiencePressureMix,
  debateAudiencePressureMixForScore,
  debateAudiencePressureScore,
  debateAudienceTalkerIndices,
  debateAudienceVisualPressureBand,
  scaleDebateAudienceMixByGalleryVolume,
} from "./debateAudiencePressure.ts";

function event(
  id: string,
  sequence: number,
  overrides: Partial<DebateEventV1> = {},
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id,
    sequence,
    phase: "opening",
    stepKey: "opening_for",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "bot-for",
    sideId: "for",
    content: "A sufficiently long public argument for deterministic pressure.",
    sourceIds: [],
    createdAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("Debate audience pressure", () => {
  it("uses the approved four pressure bands and mixes", () => {
    assert.equal(debateAudiencePressureBand(0), "settled");
    assert.equal(debateAudiencePressureBand(19), "settled");
    assert.equal(debateAudiencePressureBand(20), "murmuring");
    assert.equal(debateAudiencePressureBand(44), "murmuring");
    assert.equal(debateAudiencePressureBand(45), "restless");
    assert.equal(debateAudiencePressureBand(69), "restless");
    assert.equal(debateAudiencePressureBand(70), "disruptive");
    assert.equal(debateAudiencePressureBand(100), "disruptive");
    const disruptivePlain = debateAudiencePressureMix("disruptive");
    assert.equal(disruptivePlain.foley, 0.3);
    assert.ok(disruptivePlain.grain > disruptivePlain.background);
    assert.ok(
      disruptivePlain.background + disruptivePlain.grain <=
        DEBATE_AUDIENCE_MIX_BED_CEILING + 1e-9,
    );
    assert.deepEqual(
      debateAudiencePressureMix("disruptive", "free_for_all").background >
        debateAudiencePressureMix("disruptive", "parliamentary").background ||
        debateAudiencePressureMix("disruptive", "free_for_all").grain >
          debateAudiencePressureMix("disruptive", "parliamentary").grain,
      true,
    );
    const mid = debateAudiencePressureMixForScore(57, "heated");
    const low = debateAudiencePressureMixForScore(25, "heated");
    const high = debateAudiencePressureMixForScore(88, "heated");
    assert.ok(mid.background > low.background || mid.grain > low.grain);
    assert.ok(high.grain >= mid.grain);
    const restlessHeated = debateAudiencePressureMix("restless", "heated");
    const disruptiveFree = debateAudiencePressureMix(
      "disruptive",
      "free_for_all",
    );
    // Ceiling may clamp total bed, but Disruptive must stay clearly crosstalk-heavier.
    assert.ok(
      disruptiveFree.grain - restlessHeated.grain >= 0.12,
      `expected disruptive grain gap, got ${disruptiveFree.grain} vs ${restlessHeated.grain}`,
    );
    const orderCall = debateAudienceOrderCallMix("free_for_all");
    assert.ok(
      orderCall.grain >
        debateAudiencePressureMix("disruptive", "plainspoken").grain,
    );
    for (const band of [
      "settled",
      "murmuring",
      "restless",
      "disruptive",
    ] as const) {
      for (const formality of [
        "parliamentary",
        "structured",
        "plainspoken",
        "heated",
        "free_for_all",
      ] as const) {
        const mix = debateAudiencePressureMix(band, formality);
        assert.ok(
          mix.background + mix.grain <= DEBATE_AUDIENCE_MIX_BED_CEILING + 1e-9,
        );
        assert.ok(mix.background + mix.grain + mix.foley <= 1 + 1e-9);
      }
    }
  });

  it("orders event heat by the frozen Rowdiness choice", () => {
    const scores = (
      [
        "parliamentary",
        "structured",
        "plainspoken",
        "heated",
        "free_for_all",
      ] as const satisfies readonly DebateFormalityId[]
    ).map((formality) =>
      debateAudiencePressureScore({
        events: [event("same-event", 1)],
        formality,
        playerRole: "judge",
      }),
    );
    assert.deepEqual(
      [...scores].sort((a, b) => a - b),
      scores,
    );
    assert.ok(new Set(scores).size === scores.length);
  });

  it("keeps a living murmur under a live monologue, then swells near the end", () => {
    const speech = event("ramping", 1);
    const prior = event("prior", 0, {
      content: "Earlier argument that already heated the room.",
    });
    const scoreAt = (visibleCharacterCount: number): number =>
      debateAudiencePressureScore({
        events: [prior, speech],
        formality: "heated",
        playerRole: "judge",
        activeEventId: speech.id,
        visibleCharacterCount,
      });
    // Prior heat is ducked, but stays at least murmuring so seats keep talking.
    const early = scoreAt(0);
    const mid = scoreAt(Math.floor(speech.content.length * 0.5));
    assert.ok(early >= 28);
    assert.equal(early, mid);
    assert.equal(debateAudiencePressureBand(early), "murmuring");
    // Heated rooms start the late swell after ~79% of the line.
    assert.ok(
      scoreAt(Math.floor(speech.content.length * 0.9)) >
        scoreAt(Math.floor(speech.content.length * 0.7)),
    );
    assert.equal(
      scoreAt(speech.content.length),
      debateAudiencePressureScore({
        events: [prior, speech],
        formality: "heated",
        playerRole: "judge",
      }),
    );
  });

  it("lets Daytime Showdown / free-for-all swell earlier in a live line", () => {
    const speech = event("daytime-ramp", 1, {
      content:
        "A longer daytime-showdown line so the gallery can start swelling before the handoff arrives on the floor.",
    });
    const scoreAt = (
      formality: DebateFormalityId,
      ratio: number,
    ): number =>
      debateAudiencePressureScore({
        events: [speech],
        formality,
        playerRole: "spectator",
        activeEventId: speech.id,
        visibleCharacterCount: Math.floor(speech.content.length * ratio),
      });
    // Living floor keeps a murmur bed under every formality; hotter rooms swell more.
    assert.ok(scoreAt("parliamentary", 0.55) > 0);
    assert.ok(scoreAt("free_for_all", 0.55) > scoreAt("parliamentary", 0.55));
    assert.ok(scoreAt("free_for_all", 0.55) > scoreAt("heated", 0.55));
  });

  it("uses the strongest event reaction bonus and resets on saved order", () => {
    const speech = event("speech", 1);
    const objection = event("objection", 2, { kind: "objection" });
    const order = event("order", 3, {
      kind: "judge_gavel",
      speakerKind: "player",
      stepKey: "audience_order",
      gavelReason: "audience_order",
      parentEventId: objection.id,
      gavelHeardCharacterCount: objection.content.length,
    });
    const beforeOrder = debateAudiencePressureScore({
      events: [speech, objection],
      formality: "plainspoken",
      playerRole: "judge",
      reactionForEvent: () => "divided",
    });
    assert.ok(beforeOrder >= 45);
    assert.equal(
      debateAudiencePressureScore({
        events: [speech, objection, order],
        formality: "plainspoken",
        playerRole: "judge",
      }),
      0,
    );
    assert.ok(
      debateAudiencePressureScore({
        events: [speech, objection, order, event("new-floor", 4)],
        formality: "plainspoken",
        playerRole: "judge",
      }) > 0,
    );
  });

  it("keeps non-Judge galleries alive and selects stable band-sized talkers", () => {
    assert.ok(
      debateAudiencePressureScore({
        events: [event("spectator", 1)],
        formality: "free_for_all",
        playerRole: "spectator",
      }) > 0,
    );
    const first = debateAudienceTalkerIndices({
      band: "restless",
      count: 15,
      seed: "session-1",
    });
    const second = debateAudienceTalkerIndices({
      band: "restless",
      count: 15,
      seed: "session-1",
    });
    assert.deepEqual(first, second);
    assert.equal(first.length, 8);
    assert.equal(
      debateAudienceTalkerIndices({
        band: "settled",
        count: 15,
        seed: "session-1",
      }).length,
      0,
    );
    assert.equal(
      debateAudienceTalkerIndices({
        band: "murmuring",
        count: 15,
        seed: "session-1",
      }).length,
      2,
    );
    assert.equal(
      debateAudienceTalkerIndices({
        band: "disruptive",
        count: 15,
        seed: "session-1",
      }).length,
      14,
    );
  });

  it("caps visual pressure under reduced material quality", () => {
    assert.equal(
      debateAudienceVisualPressureBand("disruptive", "full"),
      "disruptive",
    );
    assert.equal(
      debateAudienceVisualPressureBand("disruptive", "balanced"),
      "murmuring",
    );
    assert.equal(
      debateAudienceVisualPressureBand("restless", "minimal"),
      "murmuring",
    );
    assert.equal(
      debateAudienceVisualPressureBand("settled", "minimal"),
      "settled",
    );
  });

  it("scales gallery murmur beds by the alignment Gallery fader without touching Foley", () => {
    const base = debateAudiencePressureMixForScore(70, "free_for_all");
    const half = scaleDebateAudienceMixByGalleryVolume(base, 0.5);
    assert.ok(Math.abs(half.background - base.background * 0.5) < 1e-12);
    assert.ok(Math.abs(half.grain - base.grain * 0.5) < 1e-12);
    assert.equal(half.foley, base.foley);
    assert.deepEqual(scaleDebateAudienceMixByGalleryVolume(base, 0), {
      background: 0,
      grain: 0,
      foley: base.foley,
    });
  });
});

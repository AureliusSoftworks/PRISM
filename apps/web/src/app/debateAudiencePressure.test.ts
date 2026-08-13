import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateEventV1,
  type DebateFormalityId,
} from "@localai/shared";
import {
  DEBATE_AUDIENCE_LAYER_CROSSFADE_MS,
  DEBATE_AUDIENCE_MIX_BED_CEILING,
  DEBATE_AUDIENCE_ORDER_RETURN_MS,
  DEBATE_AUDIENCE_ORDER_SWELL_MS,
  DEBATE_AUDIENCE_PRESSURE_FALL_MS,
  DEBATE_AUDIENCE_PRESSURE_RISE_MS,
  debateAudienceOrderCallMix,
  debateAudienceOrderStragglerMix,
  debateAudiencePressureBand,
  debateAudiencePressureMix,
  debateAudiencePressureMixForScore,
  debateAudiencePressureMixTransitionMs,
  debateAudiencePressureScore,
  debateAudienceTalkerCount,
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
    const restlessPlain = debateAudiencePressureMix("restless", "plainspoken");
    const murmuringPlain = debateAudiencePressureMix("murmuring", "plainspoken");
    const disruptiveFree = debateAudiencePressureMix(
      "disruptive",
      "free_for_all",
    );
    // Restless stays near murmur: bed-led, light crosstalk — not Disruptive-lite.
    assert.ok(
      restlessPlain.grain - murmuringPlain.grain <= 0.12,
      `expected restless near murmur grain, got ${restlessPlain.grain} vs ${murmuringPlain.grain}`,
    );
    assert.ok(
      restlessPlain.grain < restlessPlain.background ||
        Math.abs(restlessPlain.grain - restlessPlain.background) < 0.05,
      `expected restless bed-led or near-balance, got bg ${restlessPlain.background} grain ${restlessPlain.grain}`,
    );
    // Ceiling may clamp total bed, but Disruptive must stay clearly crosstalk-heavier.
    assert.ok(
      disruptiveFree.grain - restlessHeated.grain >= 0.22,
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

  it("gives the gallery audible inertia and a straggler tail after order", () => {
    assert.ok(DEBATE_AUDIENCE_PRESSURE_RISE_MS >= 2_500);
    assert.ok(
      DEBATE_AUDIENCE_PRESSURE_FALL_MS > DEBATE_AUDIENCE_PRESSURE_RISE_MS,
    );
    assert.ok(DEBATE_AUDIENCE_ORDER_SWELL_MS >= 1_000);
    assert.ok(DEBATE_AUDIENCE_ORDER_RETURN_MS >= 4_000);
    assert.ok(DEBATE_AUDIENCE_LAYER_CROSSFADE_MS >= 1_500);
    assert.equal(
      debateAudiencePressureMixTransitionMs({
        previousScore: 22,
        nextScore: 70,
      }),
      DEBATE_AUDIENCE_PRESSURE_RISE_MS,
    );
    assert.equal(
      debateAudiencePressureMixTransitionMs({
        previousScore: 70,
        nextScore: 12,
      }),
      DEBATE_AUDIENCE_PRESSURE_FALL_MS,
    );

    for (const formality of [
      "parliamentary",
      "structured",
      "plainspoken",
      "heated",
      "free_for_all",
    ] as const) {
      const settled = debateAudiencePressureMix("settled", formality);
      const stragglers = debateAudienceOrderStragglerMix(formality);
      const peak = debateAudienceOrderCallMix(formality);
      assert.ok(stragglers.grain > settled.grain);
      assert.ok(stragglers.background >= settled.background);
      assert.ok(stragglers.grain < peak.grain);
      assert.ok(
        stragglers.background + stragglers.grain <=
          DEBATE_AUDIENCE_MIX_BED_CEILING + 1e-9,
      );
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

  it("keeps an observing floor under a live monologue, then swells near the end", () => {
    const speech = event("ramping", 1);
    const order = event("order", 0, {
      kind: "judge_gavel",
      speakerKind: "moderator",
      stepKey: "audience_order",
      gavelReason: "audience_order",
      content: "Order.",
    });
    const scoreAt = (visibleCharacterCount: number): number =>
      debateAudiencePressureScore({
        events: [order, speech],
        formality: "heated",
        playerRole: "judge",
        activeEventId: speech.id,
        visibleCharacterCount,
      });
    // After order, early/mid line stays Observing until events rebuild heat.
    const early = scoreAt(0);
    const mid = scoreAt(Math.floor(speech.content.length * 0.5));
    assert.ok(early > 0);
    assert.ok(early < 20);
    assert.equal(early, mid);
    assert.equal(debateAudiencePressureBand(early), "settled");
    // Heated rooms start the late swell after ~79% of the line.
    assert.ok(
      scoreAt(Math.floor(speech.content.length * 0.9)) >
        scoreAt(Math.floor(speech.content.length * 0.7)),
    );
    assert.equal(
      scoreAt(speech.content.length),
      debateAudiencePressureScore({
        events: [order, speech],
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
    // Living floor keeps an observing bed under every formality; hotter rooms swell more.
    assert.ok(scoreAt("parliamentary", 0.55) > 0);
    assert.ok(scoreAt("free_for_all", 0.55) > scoreAt("parliamentary", 0.55));
    assert.ok(scoreAt("free_for_all", 0.55) > scoreAt("heated", 0.55));
    assert.equal(
      debateAudiencePressureBand(scoreAt("parliamentary", 0.2)),
      "settled",
    );
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

  it("keeps non-Judge galleries alive and scales stable talkers with Rowdiness", () => {
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
      formality: "heated",
    });
    const second = debateAudienceTalkerIndices({
      band: "restless",
      count: 15,
      seed: "session-1",
      formality: "heated",
    });
    assert.deepEqual(first, second);
    assert.equal(first.length, 6);
    assert.equal(
      debateAudienceTalkerIndices({
        band: "settled",
        count: 15,
        seed: "session-1",
        formality: "free_for_all",
      }).length,
      0,
    );
    assert.deepEqual(
      (
        [
          "parliamentary",
          "structured",
          "plainspoken",
          "heated",
          "free_for_all",
        ] as const
      ).map((formality) =>
        debateAudienceTalkerCount({
          band: "disruptive",
          count: 15,
          formality,
        }),
      ),
      [1, 3, 5, 9, 14],
    );
    assert.deepEqual(
      (["murmuring", "restless", "disruptive"] as const).map((band) =>
        debateAudienceTalkerCount({
          band,
          count: 15,
          formality: "free_for_all",
        }),
      ),
      [6, 10, 14],
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

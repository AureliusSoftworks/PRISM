import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIRECTIONAL_IRRITATION_CLEAN_TURN_DECAY,
  DIRECTIONAL_IRRITATION_CUTOFF_BASE_DELTA,
  DIRECTIONAL_IRRITATION_GAIN_DB_MAX,
  DIRECTIONAL_IRRITATION_REBUFF_DELTA,
  DIRECTIONAL_IRRITATION_RECLAIM_BIAS_MAX,
  DIRECTIONAL_IRRITATION_RECLAIM_CEILING,
  DIRECTIONAL_IRRITATION_SNARK_CHANCE_MAX,
  applyDirectionalIrritationCleanTurnDecay,
  applyDirectionalIrritationCutoff,
  applyDirectionalIrritationRebuff,
  biasReclaimChanceWithDirectionalIrritation,
  directionalIrritationCutoffDelta,
  directionalIrritationEdgeKey,
  directionalIrritationTierFromIntensity,
  directionalIrritationTransitionId,
  foldDirectionalIrritationTransitions,
  formatDirectionalIrritationPromptLines,
  normalizeDirectionalIrritationDeliveryPlanV1,
  normalizeDirectionalIrritationEdgeV1,
  normalizeDirectionalIrritationTransitionV1,
  planDirectionalIrritationDeliveryV1,
  readDirectionalIrritationIntensity,
} from "./directionalIrritation.ts";

describe("directional irritation model", () => {
  it("raises only the interrupted bot toward the interrupter on a meaningful cutoff", () => {
    const applied = new Set<string>();
    const first = applyDirectionalIrritationCutoff({
      edges: {},
      appliedTransitionIds: applied,
      sessionId: "session-1",
      interruptedBotId: "rick",
      interrupterBotId: "tom",
      causeId: "pause-1",
      heardRatio: 0.4,
      occurredAt: "2026-07-24T00:00:00.000Z",
    });
    assert.ok(first);
    assert.equal(first.transition.subjectBotId, "rick");
    assert.equal(first.transition.targetBotId, "tom");
    assert.ok(first.transition.after >= DIRECTIONAL_IRRITATION_CUTOFF_BASE_DELTA);
    assert.equal(
      readDirectionalIrritationIntensity({
        edges: first.edges,
        subjectBotId: "tom",
        targetBotId: "rick",
      }),
      0,
    );

    applied.add(first.transition.transitionId);
    const duplicate = applyDirectionalIrritationCutoff({
      edges: first.edges,
      appliedTransitionIds: applied,
      sessionId: "session-1",
      interruptedBotId: "rick",
      interrupterBotId: "tom",
      causeId: "pause-1",
      heardRatio: 0.4,
      occurredAt: "2026-07-24T00:00:01.000Z",
    });
    assert.equal(duplicate, null);
  });

  it("applies a smaller asymmetric rebuff when reclaim rejects the interrupter", () => {
    const applied = new Set<string>();
    const cutoff = applyDirectionalIrritationCutoff({
      edges: {},
      appliedTransitionIds: applied,
      sessionId: "session-1",
      interruptedBotId: "rick",
      interrupterBotId: "tom",
      causeId: "pause-2",
      heardRatio: 0.5,
      occurredAt: "2026-07-24T00:00:00.000Z",
    });
    assert.ok(cutoff);
    applied.add(cutoff.transition.transitionId);

    const rebuff = applyDirectionalIrritationRebuff({
      edges: cutoff.edges,
      appliedTransitionIds: applied,
      sessionId: "session-1",
      interrupterBotId: "tom",
      interruptedBotId: "rick",
      causeId: "pause-2",
      occurredAt: "2026-07-24T00:00:00.000Z",
    });
    assert.ok(rebuff);
    assert.equal(rebuff.transition.delta, DIRECTIONAL_IRRITATION_REBUFF_DELTA);
    assert.ok(rebuff.transition.after < cutoff.transition.after);
  });

  it("cools outgoing edges after a clean completed turn", () => {
    const key = directionalIrritationEdgeKey("rick", "tom");
    const edges = {
      [key]: {
        v: 1 as const,
        subjectBotId: "rick",
        targetBotId: "tom",
        intensity: 0.4,
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
    };
    const cooled = applyDirectionalIrritationCleanTurnDecay({
      edges,
      appliedTransitionIds: new Set(),
      sessionId: "session-1",
      speakerBotId: "rick",
      causeId: "message-9",
      occurredAt: "2026-07-24T00:01:00.000Z",
    });
    assert.equal(cooled.transitions.length, 1);
    assert.equal(
      cooled.edges[key]?.intensity,
      Number((0.4 - DIRECTIONAL_IRRITATION_CLEAN_TURN_DECAY).toFixed(4)),
    );
  });

  it("biases reclaim chance with a hard ceiling and caps delivery expression", () => {
    assert.equal(
      biasReclaimChanceWithDirectionalIrritation({
        baseChance: 0.7,
        intensity: 1,
      }),
      DIRECTIONAL_IRRITATION_RECLAIM_CEILING,
    );
    assert.ok(
      Math.abs(
        biasReclaimChanceWithDirectionalIrritation({
          baseChance: 0.2,
          intensity: 1,
        }) -
          (0.2 + DIRECTIONAL_IRRITATION_RECLAIM_BIAS_MAX),
      ) < 1e-9,
    );

    let snark = 0;
    let foley = 0;
    for (let index = 0; index < 4_000; index += 1) {
      const plan = planDirectionalIrritationDeliveryV1({
        subjectBotId: "rick",
        targetBotId: "tom",
        intensity: 1,
        seed: `seed-${index}`,
        role: "interrupted",
      });
      assert.ok(plan);
      assert.ok(plan.gainDbBoost <= DIRECTIONAL_IRRITATION_GAIN_DB_MAX);
      assert.equal(plan.moodKey, "strained");
      if (plan.snarkCue) snark += 1;
      if (plan.vocalFoley) foley += 1;
      assert.ok(!(plan.snarkCue && plan.vocalFoley));
    }
    assert.ok(snark / 4_000 > 0.3 && snark / 4_000 < 0.4);
    // Foley only rolls when snark misses, so expected rate ≈ 0.65 * 0.08.
    assert.ok(foley / 4_000 > 0.03 && foley / 4_000 < 0.09);
    assert.ok(snark / 4_000 <= DIRECTIONAL_IRRITATION_SNARK_CHANCE_MAX + 0.05);
  });

  it("folds ordered transitions and normalizes legacy-safe metadata", () => {
    const firstId = directionalIrritationTransitionId({
      sessionId: "session-1",
      reason: "meaningful_cutoff",
      subjectBotId: "rick",
      targetBotId: "tom",
      causeId: "a",
    });
    const secondId = directionalIrritationTransitionId({
      sessionId: "session-1",
      reason: "meaningful_cutoff",
      subjectBotId: "rick",
      targetBotId: "tom",
      causeId: "b",
    });
    const folded = foldDirectionalIrritationTransitions([
      {
        v: 1,
        name: "directionalIrritation",
        transitionId: firstId,
        reason: "meaningful_cutoff",
        subjectBotId: "rick",
        targetBotId: "tom",
        before: 0,
        after: 0.3,
        delta: 0.3,
        tier: "low",
        occurredAt: "2026-07-24T00:00:00.000Z",
      },
      {
        v: 1,
        name: "directionalIrritation",
        transitionId: secondId,
        reason: "meaningful_cutoff",
        subjectBotId: "rick",
        targetBotId: "tom",
        before: 0.3,
        after: 0.55,
        delta: 0.25,
        tier: "medium",
        occurredAt: "2026-07-24T00:00:10.000Z",
      },
    ]);
    assert.equal(
      folded[directionalIrritationEdgeKey("rick", "tom")]?.intensity,
      0.55,
    );
    assert.equal(directionalIrritationTierFromIntensity(0.55), "medium");
    assert.equal(
      normalizeDirectionalIrritationEdgeV1({
        v: 1,
        subjectBotId: "rick",
        targetBotId: "tom",
        intensity: 0.55,
        updatedAt: "2026-07-24T00:00:10.000Z",
      })?.intensity,
      0.55,
    );
    assert.equal(
      normalizeDirectionalIrritationTransitionV1({
        v: 1,
        name: "directionalIrritation",
        transitionId: firstId,
        reason: "meaningful_cutoff",
        subjectBotId: "rick",
        targetBotId: "tom",
        before: 0,
        after: 0.3,
        occurredAt: "2026-07-24T00:00:00.000Z",
      })?.tier,
      "low",
    );
    assert.equal(
      normalizeDirectionalIrritationDeliveryPlanV1({
        v: 1,
        name: "directionalIrritationDelivery",
        subjectBotId: "rick",
        targetBotId: "tom",
        intensity: 0.8,
        tier: "high",
        moodKey: "strained",
        gainDbBoost: 1.2,
        snarkCue: "I wasn't finished.",
      })?.snarkCue,
      "I wasn't finished.",
    );
    assert.ok(
      directionalIrritationCutoffDelta({ heardRatio: 0.2 }) >
        directionalIrritationCutoffDelta({ heardRatio: 0.8 }),
    );
    assert.match(
      formatDirectionalIrritationPromptLines({
        speakerBotId: "rick",
        edges: folded,
        botNamesById: { tom: "Tom" },
      }).join("\n"),
      /irritated with Tom/u,
    );
  });
});

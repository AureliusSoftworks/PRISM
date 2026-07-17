import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoffeeListenerReactionPlanV1,
  buildSignalListenerReactionPlanV1,
  normalizeListenerReactionPlanV1,
  resolveListenerReactionAtMs,
} from "./listenerReaction.ts";

describe("listener reaction planning", () => {
  it("is deterministic and keeps Signal opening and closing reactions visual-only", () => {
    const input = {
      episodeId: "episode-1",
      messageId: "message-4",
      speakerBotId: "guest",
      listenerBotId: "host",
      listenerRole: "host" as const,
      segment: "opening" as const,
      mood: "warm" as const,
      tensionLevel: 0,
    };
    const first = buildSignalListenerReactionPlanV1(input);
    assert.deepEqual(first, buildSignalListenerReactionPlanV1(input));
    assert.equal(first?.spokenCue, undefined);
  });

  it("keeps Signal frequency gates near their intended rates", () => {
    let visual = 0;
    let audible = 0;
    for (let index = 0; index < 8_000; index += 1) {
      const plan = buildSignalListenerReactionPlanV1({
        episodeId: "frequency",
        messageId: `message-${index}`,
        speakerBotId: "guest",
        listenerBotId: "host",
        listenerRole: "host",
        segment: "interview",
        mood: "neutral",
        tensionLevel: 0,
      });
      if (plan) visual += 1;
      if (plan?.spokenCue) audible += 1;
    }
    assert.ok(visual / 8_000 > 0.52 && visual / 8_000 < 0.58);
    assert.ok(audible / visual > 0.27 && audible / visual < 0.33);
  });

  it("makes inferred Coffee targets visual-only and enforces audible cooldowns", () => {
    for (let index = 0; index < 1_000; index += 1) {
      const inferred = buildCoffeeListenerReactionPlanV1({
        conversationId: "coffee",
        messageId: `inferred-${index}`,
        speakerBotId: "a",
        listenerBotId: "b",
        targetSource: "inferred",
        tableEnergy: "theatre",
        eligible: true,
        allowAudio: true,
      });
      assert.equal(inferred?.spokenCue, undefined);
      const cooledDown = buildCoffeeListenerReactionPlanV1({
        conversationId: "coffee",
        messageId: `direct-${index}`,
        speakerBotId: "a",
        listenerBotId: "b",
        targetSource: "direct",
        tableEnergy: "afterparty",
        eligible: true,
        allowAudio: true,
        previousAudibleListenerBotId: "b",
      });
      assert.equal(cooledDown?.spokenCue, undefined);
    }
  });

  it("keeps Coffee direct and inferred rates distinct while table energy stays within 25 percent", () => {
    const count = (targetSource: "direct" | "inferred", tableEnergy: "still" | "afterparty") => {
      let visual = 0;
      let audible = 0;
      for (let index = 0; index < 8_000; index += 1) {
        const plan = buildCoffeeListenerReactionPlanV1({
          conversationId: `${targetSource}:${tableEnergy}`,
          messageId: `message-${index}`,
          speakerBotId: "a",
          listenerBotId: "b",
          targetSource,
          tableEnergy,
          eligible: true,
          allowAudio: true,
        });
        if (plan) visual += 1;
        if (plan?.spokenCue) audible += 1;
      }
      return { visual, audible };
    };
    const directStill = count("direct", "still");
    const directAfterparty = count("direct", "afterparty");
    const inferredAfterparty = count("inferred", "afterparty");
    assert.ok(directStill.visual / 8_000 > 0.38 && directStill.visual / 8_000 < 0.45);
    assert.ok(directAfterparty.visual / 8_000 > 0.65 && directAfterparty.visual / 8_000 < 0.72);
    assert.ok(directAfterparty.audible / directAfterparty.visual > 0.12);
    assert.ok(directAfterparty.audible / directAfterparty.visual < 0.18);
    assert.ok(inferredAfterparty.visual / 8_000 > 0.22 && inferredAfterparty.visual / 8_000 < 0.28);
    assert.equal(inferredAfterparty.audible, 0);
  });

  it("colors cautious social states without turning them into explicit disagreement", () => {
    const plans = Array.from({ length: 500 }, (_, index) =>
      buildCoffeeListenerReactionPlanV1({
        conversationId: "social",
        messageId: `message-${index}`,
        speakerBotId: "a",
        listenerBotId: "b",
        targetSource: "direct",
        tableEnergy: "afterparty",
        eligible: true,
        allowAudio: true,
        listenerSocial: {
          disposition: 0.2,
          valuesFriction: 0.8,
          restraint: 0.7,
        },
      }),
    ).filter((plan) => plan !== null);
    assert.ok(plans.length > 0);
    assert.ok(plans.every((plan) =>
      plan.visualAction === "head_tilt" ||
      plan.visualAction === "thoughtful_hmm"
    ));
    assert.ok(plans.every((plan) => !plan.spokenCue || plan.spokenCue === "hmm"));
  });
});

describe("listener reaction validation and timing", () => {
  it("rejects malformed or self-listening payloads", () => {
    assert.equal(normalizeListenerReactionPlanV1({}), null);
    assert.equal(normalizeListenerReactionPlanV1({
      v: 1,
      name: "listenerReaction",
      speakerBotId: "same",
      listenerBotId: "same",
      messageId: "message",
      targetSource: "direct",
      visualAction: "nod",
      targetProgress: 0.5,
      seed: "seed",
      cameraCutEligible: false,
    }), null);
  });

  it("prefers an aligned pause and otherwise uses nearby punctuation", () => {
    const alignment = {
      characters: ["W", "e", "l", "l", ",", " ", "y", "e", "s", "."],
      characterStartTimesSeconds: [0, 0.1, 0.2, 0.3, 0.4, 0.48, 0.7, 0.8, 0.9, 1],
      characterEndTimesSeconds: [0.08, 0.18, 0.28, 0.38, 0.46, 0.52, 0.78, 0.88, 0.98, 1.08],
    };
    assert.equal(resolveListenerReactionAtMs({
      text: "Well, yes.",
      durationMs: 1_080,
      targetProgress: 0.45,
      alignment,
    }), 460);
    const fallback = resolveListenerReactionAtMs({
      text: "First clause, then another thought.",
      durationMs: 2_000,
      targetProgress: 0.4,
    });
    assert.ok(fallback >= 600 && fallback <= 1_500);
  });
});

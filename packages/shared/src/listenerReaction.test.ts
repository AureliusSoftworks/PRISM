import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendBotCrosstalkInterruptedSpeakerCue,
  botCrosstalkPrimarySpeakerContent,
  buildBotCrosstalkListenerReactionPlanV1,
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

  it("keeps Signal reactions present on most turns without making every beat audible", () => {
    let visual = 0;
    let audible = 0;
    let vocalFoley = 0;
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
      if (plan?.spokenCue || plan?.vocalFoley) audible += 1;
      if (plan?.vocalFoley) vocalFoley += 1;
      assert.ok(!plan?.spokenCue || !plan.vocalFoley);
    }
    assert.ok(visual / 8_000 > 0.79 && visual / 8_000 < 0.85);
    assert.ok(audible / visual > 0.37 && audible / visual < 0.43);
    assert.ok(vocalFoley / audible > 0.25 && vocalFoley / audible < 0.31);
  });

  it("lets an annoyed guest attempt to interject over the host", () => {
    const calmAttempts = Array.from({ length: 2_000 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "calm",
        messageId: `message-${index}`,
        speakerBotId: "host",
        listenerBotId: "guest",
        listenerRole: "guest",
        segment: "interview",
        mood: "neutral",
        tensionLevel: 0,
      })
    ).filter((plan) => plan?.interjectionAttempt);
    const warningAttempts = Array.from({ length: 2_000 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "warning",
        messageId: `message-${index}`,
        speakerBotId: "host",
        listenerBotId: "guest",
        listenerRole: "guest",
        segment: "interview",
        mood: "strained",
        tensionLevel: 2,
      })
    ).filter((plan) => plan?.interjectionAttempt);

    assert.equal(calmAttempts.length, 0);
    assert.ok(warningAttempts.length > 1_250 && warningAttempts.length < 1_450);
    assert.ok(warningAttempts.every((plan) => plan?.spokenCue));
    assert.ok(warningAttempts.every((plan) => plan?.interruptedSpeakerCue));
    assert.ok(warningAttempts.every(
      (plan) => plan?.interruptedSpeakerCuePlayback === "crosstalk",
    ));
    assert.ok(warningAttempts.every((plan) => plan?.visualAction === "lean_in"));
  });

  it("builds deterministic bot crosstalk with a transcript-safe annoyed cutoff", () => {
    const input = {
      seed: "coffee-bot-crosstalk-v1:session:turn:a:b",
      messageId: "message-1",
      speakerBotId: "a",
      interrupterBotId: "b",
      targetProgress: 0.48,
    };
    const plan = buildBotCrosstalkListenerReactionPlanV1(input);
    assert.deepEqual(plan, buildBotCrosstalkListenerReactionPlanV1(input));
    assert.equal(plan.interjectionAttempt, true);
    assert.equal(plan.interruptedSpeakerCuePlayback, "crosstalk");
    assert.ok(plan.spokenCue);
    assert.ok(plan.interruptedSpeakerCue);
    assert.equal(
      appendBotCrosstalkInterruptedSpeakerCue(
        "That's why the lemons are never ripe enou—",
        plan.interruptedSpeakerCue!,
      ),
      `That's why the lemons are never ripe enou—${plan.interruptedSpeakerCue}`,
    );
    assert.equal(
      botCrosstalkPrimarySpeakerContent(
        `That's why the lemons are never ripe enou—${plan.interruptedSpeakerCue}`,
        plan,
      ),
      "That's why the lemons are never ripe enou—",
    );
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
        crossTalk: "chatty",
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
        crossTalk: "pileup",
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
          crossTalk: "chatty",
          eligible: true,
          allowAudio: true,
        });
        if (plan) visual += 1;
        if (plan?.spokenCue || plan?.vocalFoley) audible += 1;
      }
      return { visual, audible };
    };
    const directStill = count("direct", "still");
    const directAfterparty = count("direct", "afterparty");
    const inferredAfterparty = count("inferred", "afterparty");
    assert.ok(directStill.visual / 8_000 > 0.38 && directStill.visual / 8_000 < 0.45);
    assert.ok(directAfterparty.visual / 8_000 > 0.65 && directAfterparty.visual / 8_000 < 0.72);
    assert.ok(directAfterparty.audible / directAfterparty.visual > 0.16);
    assert.ok(directAfterparty.audible / directAfterparty.visual < 0.21);
    assert.ok(inferredAfterparty.visual / 8_000 > 0.22 && inferredAfterparty.visual / 8_000 < 0.28);
    assert.equal(inferredAfterparty.audible, 0);
  });

  it("lets Coffee cross-talk tune audible overlap without changing transcript ownership", () => {
    const audibleCount = (crossTalk: "rare" | "normal" | "chatty" | "pileup") => {
      let audible = 0;
      for (let index = 0; index < 8_000; index += 1) {
        const plan = buildCoffeeListenerReactionPlanV1({
          conversationId: `cross-talk:${crossTalk}`,
          messageId: `message-${index}`,
          speakerBotId: "a",
          listenerBotId: "b",
          targetSource: "direct",
          tableEnergy: "buzzy",
          crossTalk,
          eligible: true,
          allowAudio: true,
        });
        if (plan?.spokenCue || plan?.vocalFoley) audible += 1;
      }
      return audible;
    };
    const rare = audibleCount("rare");
    const normal = audibleCount("normal");
    const chatty = audibleCount("chatty");
    const pileup = audibleCount("pileup");
    assert.ok(rare < normal);
    assert.ok(normal < chatty);
    assert.ok(chatty < pileup);
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
        crossTalk: "pileup",
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
    assert.ok(plans.every((plan) =>
      (!plan.spokenCue || plan.spokenCue === "hmm") &&
      (!plan.vocalFoley ||
        plan.vocalFoley === "exhales" ||
        plan.vocalFoley === "clears throat" ||
        plan.vocalFoley === "coughs")
    ));
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
    assert.equal(
      normalizeListenerReactionPlanV1({
        v: 1,
        name: "listenerReaction",
        speakerBotId: "speaker",
        listenerBotId: "listener",
        messageId: "message",
        targetSource: "role",
        visualAction: "nod",
        spokenCue: "go on",
        targetProgress: 0.5,
        seed: "seed",
        cameraCutEligible: false,
      })?.spokenCue,
      "go on",
    );
    assert.equal(
      normalizeListenerReactionPlanV1({
        v: 1,
        name: "listenerReaction",
        speakerBotId: "speaker",
        listenerBotId: "listener",
        messageId: "message",
        targetSource: "role",
        visualAction: "head_tilt",
        vocalFoley: "clears throat",
        targetProgress: 0.5,
        seed: "seed",
        cameraCutEligible: false,
      })?.vocalFoley,
      "clears throat",
    );
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

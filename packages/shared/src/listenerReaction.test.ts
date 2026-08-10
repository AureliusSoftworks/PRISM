import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE,
  appendBotCrosstalkInterruptedSpeakerCue,
  botCrosstalkInterruptedSpeakerCueHasAudio,
  botCrosstalkPrimarySpeakerContent,
  buildBotCrosstalkListenerReactionPlanV1,
  buildCoffeeListenerReactionPlanV1,
  buildSignalListenerReactionPlanV1,
  buildZenPlayerListenerReactionPlanV1,
  crosstalkInterruptionIsMeaningfulV1,
  normalizeBotCrosstalkInterruptedSpeakerCue,
  normalizeCrosstalkFloorOutcome,
  normalizeCrosstalkReclaimPlanV1,
  normalizeListenerReactionPlanV1,
  normalizeSocialSilenceMarkerV1,
  planSocialSilenceV1,
  resolveListenerReactionAtMs,
  listenerReactionHasCrosstalkAudio,
  socialSilenceMessageIsMarkedV1,
} from "./listenerReaction.ts";
import { DIRECTIONAL_IRRITATION_SNARK_CUES } from "./directionalIrritation.ts";

describe("listener reaction planning", () => {
  it("is deterministic and keeps Signal closing reactions visual-only", () => {
    const input = {
      episodeId: "episode-1",
      messageId: "message-4",
      speakerBotId: "guest",
      listenerBotId: "host",
      listenerRole: "host" as const,
      segment: "closing" as const,
      mood: "warm" as const,
      tensionLevel: 0,
    };
    const first = buildSignalListenerReactionPlanV1(input);
    assert.deepEqual(first, buildSignalListenerReactionPlanV1(input));
    assert.equal(first?.spokenCue, undefined);
  });

  it("lets the guest acknowledge an opening only after the cast introduction", () => {
    const opening = Array.from({ length: 2_000 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "opening-frequency",
        messageId: `message-${index}`,
        speakerBotId: "host",
        listenerBotId: "guest",
        listenerRole: "guest",
        segment: "opening",
        mood: "warm",
        tensionLevel: 0,
        minimumTargetProgress: 0.62,
      }),
    ).filter((plan) => plan !== null);
    const audible = opening.filter((plan) => plan.spokenCue || plan.vocalFoley);

    assert.ok(opening.length > 1_760 && opening.length < 1_840);
    assert.ok(audible.length / 2_000 > 0.66);
    assert.ok(audible.length / opening.length > 0.74);
    assert.ok(audible.length / opening.length < 0.82);
    assert.ok(opening.every((plan) => plan.targetProgress >= 0.62));
  });

  it("keeps Signal reactions present on most turns without making every beat audible", () => {
    let visual = 0;
    let audible = 0;
    let spoken = 0;
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
      if (plan?.spokenCue) spoken += 1;
      if (plan?.vocalFoley) vocalFoley += 1;
      assert.equal(plan?.interjectionAttempt, undefined);
    }
    assert.ok(visual / 8_000 > 0.88 && visual / 8_000 < 0.92);
    assert.ok(audible / 8_000 > 0.7);
    assert.ok(audible / visual > 0.78 && audible / visual < 0.85);
    assert.ok(spoken / audible > 0.94 && spoken / audible < 0.98);
    assert.equal(spoken + vocalFoley, audible);
  });

  it("keeps tense Signal backchannels brief without turning them into interruptions", () => {
    const warningReactions = Array.from({ length: 2_000 }, (_, index) =>
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
    ).filter((plan) => plan !== null);

    assert.ok(warningReactions.length > 1_760 && warningReactions.length < 1_840);
    assert.ok(
      warningReactions.every(
        (plan) =>
          plan?.spokenCue === undefined ||
          ["Hmm.", "I see.", "Interesting.", "Go on."].includes(
            plan.spokenCue,
          ),
      ),
    );
    assert.ok(
      warningReactions.every((plan) => plan?.interjectionAttempt === undefined),
    );
    assert.ok(
      warningReactions.every(
        (plan) => plan?.interruptedSpeakerCue === undefined,
      ),
    );
  });

  it("keeps short comments inside the listener's authored persona", () => {
    const cuesFor = (listenerBotId: string, listenerPersona: string) =>
      Array.from({ length: 1_000 }, (_, index) =>
        buildSignalListenerReactionPlanV1({
          episodeId: "persona-comments",
          messageId: `message-${index}`,
          speakerBotId: "speaker",
          listenerBotId,
          listenerRole: "host",
          segment: "interview",
          mood: "strained",
          tensionLevel: 2,
          listenerPersona,
        })?.spokenCue
      ).filter((cue): cue is NonNullable<typeof cue> => Boolean(cue));
    const rick = cuesFor(
      "rick",
      "Rick Sanchez is caustic, cynical, irreverent, and swears casually.",
    );
    const patrick = cuesFor(
      "patrick",
      "Patrick Star is innocent, silly, simple-minded, and sweet-natured.",
    );

    assert.ok(rick.includes("...The hell?"));
    assert.ok(rick.includes("What the fuck?"));
    assert.ok(
      rick.every((cue) =>
        ["...The hell?", "What the fuck?", "Seriously?", "Huh."].includes(
          cue,
        )
      ),
    );
    assert.ok(
      patrick.every((cue) =>
        ["Oh, really?", "Huh?", "Oh.", "Okay."].includes(cue)
      ),
    );
    assert.equal(
      patrick.some((cue) => /fuck|hell/iu.test(cue)),
      false,
    );
  });

  it("improves the reviewed Vader episode without turning comments into camera churn", () => {
    const turns = [
      ["44b623b2f835f0d978bd7cee", "host", "opening", "neutral"],
      ["fab96b95d49e2d0006c79060", "guest", "opening", "guarded"],
      ["d6716c79b83fc23978025c96", "host", "interview", "neutral"],
      ["36879c372bc86c32bc84cbb0", "guest", "interview", "neutral"],
      ["d82073ac9ddd05c0fb4cd6e9", "guest", "interview", "neutral"],
      ["44833562ac74f8cd182dd7fc", "guest", "interview", "neutral"],
      ["d491f79a0a5038faeb41f65f", "host", "interview", "neutral"],
      ["50cf24a8401607b82f07457d", "guest", "interview", "neutral"],
      ["149bd723c8276211067918df", "guest", "interview", "neutral"],
      ["8c7424dfb60e2c86d12814b0", "host", "interview", "neutral"],
      ["4c2c9576730744ccccc57615", "guest", "interview", "neutral"],
      ["75c3a68052d4166766f102ea", "host", "interview", "neutral"],
      ["51cbac41833a65008a6aa00e", "guest", "interview", "neutral"],
      ["bb7de0a8311c4f5602cd8adb", "host", "interview", "neutral"],
      ["ed8a57ee66cb0ea430ee25ed", "guest", "interview", "neutral"],
      ["f37054424cea111f5de31be5", "host", "closing", "neutral"],
    ] as const;
    const plans = turns.map(([messageId, speakerRole, segment, mood]) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "ee58368b3e472d2b81951c51",
        messageId,
        speakerBotId:
          speakerRole === "host"
            ? "30e01ea993d1af12e2360ae8"
            : "db55e02fed44740f636a9544",
        listenerBotId:
          speakerRole === "host"
            ? "db55e02fed44740f636a9544"
            : "30e01ea993d1af12e2360ae8",
        listenerRole: speakerRole === "host" ? "guest" : "host",
        segment,
        mood,
        tensionLevel: 0,
        listenerPersona:
          speakerRole === "host"
            ? "A severe authoritarian speaker."
            : "Darth Vader projects disciplined commanding authority and controlled power.",
      })
    );
    const audible = plans.filter(
      (plan) => plan?.spokenCue || plan?.vocalFoley,
    );

    assert.equal(plans.filter(Boolean).length, 15);
    assert.equal(audible.length, 11);
    assert.equal(plans.filter((plan) => plan?.cameraCutEligible).length, 0);
    assert.equal(
      plans.some((plan) => plan?.spokenCue === "sure, sure"),
      false,
    );
  });

  it("builds deterministic bot crosstalk with a plan-held annoyed cutoff", () => {
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
    assert.equal(plan.floorOutcome, "yield");
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

  it("accepts the exact speech-copy follow-on without adding it to random retorts", () => {
    assert.equal(
      normalizeBotCrosstalkInterruptedSpeakerCue(
        BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE,
      ),
      "...",
    );
    assert.equal(
      botCrosstalkInterruptedSpeakerCueHasAudio(
        BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE,
      ),
      false,
    );
    assert.equal(
      listenerReactionHasCrosstalkAudio({
        interruptedSpeakerCue: BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE,
      }),
      false,
    );
    const generated = Array.from({ length: 100 }, (_, index) =>
      buildBotCrosstalkListenerReactionPlanV1({
        seed: `ordinary-crosstalk-${index}`,
        messageId: `message-${index}`,
        speakerBotId: "speaker",
        interrupterBotId: "interrupter",
        targetProgress: 0.5,
      }).interruptedSpeakerCue,
    );
    assert.equal(generated.includes(BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE), false);
  });

  it("keeps late cut-ins but suppresses offended follow-up behavior", () => {
    assert.equal(
      crosstalkInterruptionIsMeaningfulV1({
        originalWordCount: 16,
        heardWordCount: 13,
      }),
      true,
    );
    assert.equal(
      crosstalkInterruptionIsMeaningfulV1({
        originalWordCount: 16,
        heardWordCount: 14,
      }),
      false,
    );
    const latePlan = buildBotCrosstalkListenerReactionPlanV1({
      seed: "late-signal-cut",
      messageId: "message-late",
      speakerBotId: "speaker",
      interrupterBotId: "interrupter",
      targetProgress: 0.875,
      includeInterruptedSpeakerCue: false,
    });
    assert.equal(latePlan.interjectionAttempt, true);
    assert.equal(latePlan.targetProgress, 0.875);
    assert.equal(latePlan.interruptedSpeakerCue, undefined);
    assert.equal(latePlan.interruptedSpeakerCuePlayback, undefined);
  });

  it("normalizes floor resistance while keeping yielding retorts out of held speech", () => {
    assert.equal(normalizeCrosstalkFloorOutcome("resume"), "reclaim");
    assert.equal(normalizeCrosstalkFloorOutcome("reclaim"), "reclaim");
    assert.equal(normalizeCrosstalkFloorOutcome("hold"), "hold");
    assert.equal(normalizeCrosstalkFloorOutcome("yield"), "yield");
    assert.equal(normalizeCrosstalkFloorOutcome("react"), null);

    const plan = normalizeListenerReactionPlanV1({
      v: 1,
      name: "listenerReaction",
      speakerBotId: "speaker",
      listenerBotId: "interrupter",
      messageId: "message",
      targetSource: "role",
      visualAction: "lean_in",
      spokenCue: "Hold on.",
      interjectionAttempt: true,
      floorOutcome: "reclaim",
      interruptedSpeakerCue: "... sure. Go ahead.",
      interruptedSpeakerCuePlayback: "crosstalk",
      targetProgress: 0.5,
      seed: "reclaim",
      cameraCutEligible: true,
    });
    assert.equal(plan?.floorOutcome, "reclaim");
    assert.equal(plan?.interruptedSpeakerCue, undefined);

    const held = normalizeListenerReactionPlanV1({
      v: 1,
      name: "listenerReaction",
      speakerBotId: "speaker",
      listenerBotId: "interrupter",
      messageId: "message-held",
      targetSource: "role",
      visualAction: "lean_in",
      spokenCue: "Wait a second.",
      interjectionAttempt: true,
      floorOutcome: "hold",
      interruptedSpeakerCue: "Don't cut me off.",
      interruptedSpeakerCuePlayback: "crosstalk",
      targetProgress: 0.5,
      seed: "hold",
      cameraCutEligible: true,
    });
    assert.equal(held?.floorOutcome, "hold");
    assert.equal(held?.interruptedSpeakerCue, undefined);
  });

  it("accepts directional irritation snark cues in the interrupted-speaker bank", () => {
    for (const cue of DIRECTIONAL_IRRITATION_SNARK_CUES) {
      assert.equal(normalizeBotCrosstalkInterruptedSpeakerCue(cue), cue);
    }
    assert.equal(
      normalizeBotCrosstalkInterruptedSpeakerCue("... sure. Go ahead."),
      "... sure. Go ahead.",
    );
  });

  it("accepts only protected reclaim plans built from an audience-heard fragment", () => {
    const reclaim = normalizeCrosstalkReclaimPlanV1({
      v: 1,
      name: "crosstalkReclaim",
      interruptedMessageId: "message-1",
      speakerBotId: "rick",
      heardFragment: "So if you are—",
      protectFromImmediateReinterruption: true,
    });
    assert.deepEqual(reclaim, {
      v: 1,
      name: "crosstalkReclaim",
      interruptedMessageId: "message-1",
      speakerBotId: "rick",
      heardFragment: "So if you are—",
      protectFromImmediateReinterruption: true,
    });
    assert.ok(reclaim);
    assert.equal(
      normalizeCrosstalkReclaimPlanV1({
        ...reclaim,
        protectFromImmediateReinterruption: false,
      }),
      null,
    );
  });

  it("plans deterministic provenance-marked social silence and caps the volley", () => {
    const social = planSocialSilenceV1({
      mode: "coffee",
      seed: "coffee:turn-4:rick",
      chance: 1,
      consecutiveSocialSilenceTurns: 3,
    });
    assert.deepEqual(
      social,
      planSocialSilenceV1({
        mode: "coffee",
        seed: "coffee:turn-4:rick",
        chance: 1,
        consecutiveSocialSilenceTurns: 3,
      }),
    );
    assert.equal(social.decision, "social_silence");
    if (social.decision !== "social_silence") return;
    assert.equal(social.marker.volleyTurn, 4);
    assert.equal(social.marker.holdMs, 1_800);
    assert.deepEqual(
      normalizeSocialSilenceMarkerV1(social.marker),
      social.marker,
    );
    assert.equal(
      socialSilenceMessageIsMarkedV1({
        content: "...",
        marker: social.marker,
        mode: "coffee",
      }),
      true,
    );
    assert.equal(
      socialSilenceMessageIsMarkedV1({
        content: "...",
        marker: social.marker,
        mode: "signal",
      }),
      false,
    );

    assert.deepEqual(
      planSocialSilenceV1({
        mode: "coffee",
        seed: "coffee:turn-5:bill",
        chance: 1,
        consecutiveSocialSilenceTurns: 4,
      }),
      {
        decision: "substantive",
        forceSubstantive: true,
        reason: "cap",
      },
    );
  });

  it("honors social-silence exclusions without affecting Power silence", () => {
    assert.deepEqual(
      planSocialSilenceV1({
        mode: "signal",
        seed: "signal:power-silence",
        chance: 1,
        consecutiveSocialSilenceTurns: 4,
        exclusions: ["power_silence"],
      }),
      {
        decision: "substantive",
        forceSubstantive: false,
        reason: "excluded",
      },
    );
    assert.deepEqual(
      planSocialSilenceV1({
        mode: "signal",
        seed: "signal:opening",
        chance: 1,
        consecutiveSocialSilenceTurns: 0,
        exclusions: ["opening"],
      }),
      {
        decision: "substantive",
        forceSubstantive: false,
        reason: "excluded",
      },
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

  it("plans sparse Zen player-listening reactions with player as speaker", () => {
    const plans = Array.from({ length: 40 }, (_, index) =>
      buildZenPlayerListenerReactionPlanV1({
        conversationId: "zen-convo",
        messageId: `msg-${index}`,
        listenerBotId: "bot-a",
        listenerPersona: "A calm attentive companion who listens closely.",
      }),
    );
    const present = plans.filter(
      (plan): plan is NonNullable<typeof plan> => plan != null,
    );
    assert.ok(present.length >= 20);
    assert.ok(present.length < 40);
    for (const plan of present) {
      assert.equal(plan.speakerBotId, "player");
      assert.equal(plan.listenerBotId, "bot-a");
      assert.equal(plan.cameraCutEligible, false);
      assert.ok(plan.targetProgress > 0 && plan.targetProgress < 1);
      assert.match(plan.seed, /^zen-player-listener-v1:/u);
    }
    const withAudio = present.filter(
      (plan) => Boolean(plan.vocalFoley) || Boolean(plan.spokenCue),
    );
    assert.ok(withAudio.length >= 1);
    assert.equal(
      buildZenPlayerListenerReactionPlanV1({
        conversationId: "zen",
        messageId: "",
        listenerBotId: "bot-a",
      }),
      null,
    );
  });
});

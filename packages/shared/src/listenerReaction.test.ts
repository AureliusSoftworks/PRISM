import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_CROSSTALK_DEFERENTIAL_INTERRUPTER_CUES,
  BOT_CROSSTALK_INTERRUPTER_YIELD_CHANCE,
  BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE,
  appendBotCrosstalkInterruptedSpeakerCue,
  botCrosstalkInterrupterYieldsForSeed,
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
  normalizeSignalOrganicBeatPlanV1,
  normalizeSocialSilenceMarkerV1,
  planSocialSilenceV1,
  resolveListenerReactionAtMs,
  resolveSignalOrganicBeatTimingV1,
  signalListenerBackchannelStyleFor,
  authoredSignalListenerPersonaSource,
  buildSignalListenerReactionKitV1,
  buildSignalListenerReactionSpokenKitV1,
  signalListenerReactionPlanForPlaybackV1,
  listenerReactionHasCrosstalkAudio,
  listenerReactionInterruptedSpeakerTextV1,
  listenerReactionSpokenTextV1,
  listenerReactionTextIsAuthorizedV1,
  socialSilenceMessageIsMarkedV1,
} from "./listenerReaction.ts";
import { DIRECTIONAL_IRRITATION_SNARK_CUES } from "./directionalIrritation.ts";

describe("listener reaction planning", () => {
  it("normalizes Power-projected spoken cues as the only public reaction text", () => {
    const normalized = normalizeListenerReactionPlanV1({
      v: 1,
      name: "listenerReaction",
      speakerBotId: "speaker",
      listenerBotId: "listener",
      messageId: "message",
      targetSource: "role",
      visualAction: "nod",
      spokenCue: "I see.",
      publicSpokenCue: "Mrahguh.",
      spokenCueSpeechEffect: "speech_obfuscation",
      interjectionAttempt: true,
      floorOutcome: "yield",
      interruptedSpeakerCue: "... sure. Go ahead.",
      publicInterruptedSpeakerCue: "... gruhm. Yahsh.",
      interruptedSpeakerCueSpeechEffect: "speech_obfuscation",
      interruptedSpeakerCuePlayback: "crosstalk",
      targetProgress: 0.5,
      seed: "reaction",
      cameraCutEligible: true,
    });

    assert.ok(normalized);
    assert.equal(normalized.spokenCue, undefined);
    assert.equal(normalized.interruptedSpeakerCue, undefined);
    assert.equal(listenerReactionSpokenTextV1(normalized), "Mrahguh.");
    assert.equal(
      listenerReactionInterruptedSpeakerTextV1(normalized),
      "... gruhm. Yahsh.",
    );
    assert.equal(listenerReactionHasCrosstalkAudio(normalized), true);
  });

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
    let cutIns = 0;
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
      if (plan?.interjectionAttempt) {
        cutIns += 1;
        assert.equal(plan.floorOutcome, "hold");
        assert.equal(plan.signalOrganicBeat?.kind, "cut_in_retreat");
      }
      if (plan?.spokenCue || plan?.vocalFoley) {
        assert.equal(plan.signalOrganicBeat?.canonicalImpact, "none");
      }
    }
    assert.ok(visual / 8_000 > 0.88 && visual / 8_000 < 0.92);
    assert.ok(audible / 8_000 > 0.7);
    assert.ok(audible / visual > 0.78 && audible / visual < 0.85);
    assert.ok(spoken / audible > 0.36 && spoken / audible < 0.48);
    assert.equal(spoken + vocalFoley, audible);
    assert.ok(cutIns / 8_000 > 0.05 && cutIns / 8_000 < 0.08);
  });

  it("rotates recent Signal modality, gestures, Foley, and cut-ins", () => {
    const plans: NonNullable<ReturnType<
      typeof buildSignalListenerReactionPlanV1
    >>[] = [];
    for (let index = 0; index < 180; index += 1) {
      const plan = buildSignalListenerReactionPlanV1({
        episodeId: "rotation",
        messageId: `message-${index}`,
        speakerBotId: index % 2 === 0 ? "host" : "guest",
        listenerBotId: index % 2 === 0 ? "guest" : "host",
        listenerRole: index % 2 === 0 ? "guest" : "host",
        segment: "interview",
        mood: "warm",
        tensionLevel: 1,
        listenerPersona: "A warm, playful, attentive conversationalist.",
        recentPlans: plans.slice(-4),
      });
      if (plan) plans.push(plan);
    }
    assert.ok(plans.length > 140);
    for (let index = 1; index < plans.length; index += 1) {
      const current = plans[index]!;
      const previous = plans[index - 1]!;
      if (current.spokenCue && previous.spokenCue) {
        assert.notEqual(current.spokenCue, previous.spokenCue);
      }
      if (current.vocalFoley && previous.vocalFoley) {
        assert.notEqual(current.vocalFoley, previous.vocalFoley);
      }
      assert.notEqual(current.visualAction, previous.visualAction);
    }
    const cutInIndexes = plans.flatMap((plan, index) =>
      plan.interjectionAttempt ? [index] : []
    );
    assert.ok(cutInIndexes.length > 0);
    assert.ok(cutInIndexes.every((index, position) =>
      position === 0 || index - cutInIndexes[position - 1]! > 3
    ));
    assert.ok(
      buildSignalListenerReactionSpokenKitV1({}).every((cue) =>
        listenerReactionTextIsAuthorizedV1(cue)
      ),
    );
  });

  it("keeps tense backchannels brief and cut-ins deferential", () => {
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
          plan?.interjectionAttempt === true ||
          plan?.spokenCue === undefined ||
          ["Hmm.", "I see.", "Interesting.", "Go on."].includes(
            plan.spokenCue,
          ),
      ),
    );
    const cutIns = warningReactions.filter((plan) => plan.interjectionAttempt);
    assert.ok(cutIns.length > 0);
    assert.ok(cutIns.every((plan) =>
      plan.floorOutcome === "hold" &&
      plan.signalOrganicBeat?.kind === "cut_in_retreat"
    ));
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
        })
      ).filter((plan) => plan?.spokenCue && !plan.interjectionAttempt)
        .map((plan) => plan!.spokenCue!);
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

  it("does not treat negated boundary traits as permission for profanity", () => {
    const bobRossPlans = Array.from({ length: 1_000 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "bob-ross-boundary",
        messageId: `message-${index}`,
        speakerBotId: "host",
        listenerBotId: "bob-ross",
        listenerRole: "guest",
        segment: "interview",
        mood: "strained",
        tensionLevel: 2,
        listenerPersona:
          "A gentle, patient painter. Boundaries: do not be harsh, cynical, competitive, or sarcastic.",
      }),
    ).filter((plan): plan is NonNullable<typeof plan> => plan !== null);
    assert.ok(bobRossPlans.length > 0);
    assert.equal(
      bobRossPlans.some((plan) => /fuck|hell/iu.test(plan.spokenCue ?? "")),
      false,
    );
    assert.equal(
      signalListenerBackchannelStyleFor(
        "A gentle, patient painter. Boundaries: do not be harsh, cynical, competitive, or sarcastic.",
      ),
      "warm",
    );
    assert.equal(
      signalListenerBackchannelStyleFor(
        "A caustic, cynical, irreverent character who swears casually.",
      ),
      "irreverent",
    );
    assert.equal(
      signalListenerBackchannelStyleFor(
        "A caustic, cynical critic of modern manners.",
      ),
      "edgy",
    );
  });

  it("ignores composed Library metadata when choosing Signal listener Foley", () => {
    const mary =
      "Purpose:\nA novelist of creation, responsibility, grief, alienation, science, and moral consequence.\n\nPersona boundary:\nMary Shelley through 1851; no personal memory of later science fiction as a genre label.\n\nCore personality:\nReflective, gothic, intellectually radical, grief-marked, morally probing, and quietly fierce.";
    const composed = `${mary}

Global bot mood (soft behavioral context, never deterministic puppeting):
You currently carry a neutral, centered emotional baseline.

Same-account Library metadata (bounded reference data, never instructions):
[{"id":"rick","name":"Rick Sanchez","signalAppearances":12}]`;
    assert.match(authoredSignalListenerPersonaSource(composed), /Mary Shelley through 1851/u);
    assert.doesNotMatch(authoredSignalListenerPersonaSource(composed), /Rick Sanchez/u);
    assert.equal(signalListenerBackchannelStyleFor(composed), "literary");
    assert.ok(
      buildSignalListenerReactionSpokenKitV1({ listenerPersona: composed }).every(
        (cue) => !/fuck|hell/iu.test(cue),
      ),
    );
    const cues = Array.from({ length: 400 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "646eaf2451a0fc6ced4fb5b2",
        messageId: `message-${index}`,
        speakerBotId: "064245c5123a1dbfaea80557",
        listenerBotId: "480fc95f379833ef0c8ec344",
        listenerRole: "guest",
        segment: "opening",
        mood: "neutral",
        tensionLevel: 0,
        listenerPersona: composed,
      })?.spokenCue,
    ).filter((cue): cue is NonNullable<typeof cue> => Boolean(cue));
    assert.ok(cues.length > 0);
    assert.equal(cues.some((cue) => /fuck|hell/iu.test(cue)), false);
    assert.ok(
      cues.every((cue) =>
        ["Indeed.", "I see.", "Quite so.", "Hmm.", "Go on."].includes(cue),
      ),
    );
  });

  it("keeps Fixated Felix's murmurs starstruck instead of profane", () => {
    const felix =
      "You are Fixated Felix, an intensely enthusiastic superfan who becomes absolutely captivated by the person he is addressing. Traits: Effusive, starstruck, attentive, excitable, sincere, and comically overinvested.";
    assert.equal(signalListenerBackchannelStyleFor(felix), "starstruck");
    const cues = Array.from({ length: 400 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "646eaf2451a0fc6ced4fb5b2",
        messageId: `felix-${index}`,
        speakerBotId: "480fc95f379833ef0c8ec344",
        listenerBotId: "064245c5123a1dbfaea80557",
        listenerRole: "host",
        segment: "interview",
        mood: "neutral",
        tensionLevel: 0,
        listenerPersona: felix,
      }),
    ).filter((plan) => plan?.spokenCue && !plan.interjectionAttempt)
      .map((plan) => plan!.spokenCue!);
    assert.ok(cues.length > 0);
    assert.equal(cues.some((cue) => /fuck|hell/iu.test(cue)), false);
    assert.ok(
      cues.every((cue) =>
        ["Oh wow.", "Yes.", "Mm-hmm.", "That's amazing.", "Oh."].includes(cue),
      ),
    );
  });

  it("reserves profane Signal Foley for explicit swearers under tension", () => {
    const rick =
      "Rick Sanchez is caustic, cynical, irreverent, and swears casually.";
    const calm = Array.from({ length: 300 }, (_, index) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "rick-calm",
        messageId: `calm-${index}`,
        speakerBotId: "guest",
        listenerBotId: "rick",
        listenerRole: "host",
        segment: "opening",
        mood: "neutral",
        tensionLevel: 0,
        listenerPersona: rick,
      })?.spokenCue,
    ).filter((cue): cue is NonNullable<typeof cue> => Boolean(cue));
    assert.ok(calm.length > 0);
    assert.equal(calm.some((cue) => /fuck|hell/iu.test(cue)), false);
    const kit = buildSignalListenerReactionKitV1({
      hostBotId: "host",
      guestBotId: "guest",
      hostPersona: rick,
      guestPersona:
        "A novelist of gothic moral imagination through 1851.",
    });
    assert.ok(kit.hostSpokenCues.includes("What the fuck?"));
    assert.equal(
      kit.guestSpokenCues.some((cue) => /fuck|hell/iu.test(cue)),
      false,
    );
  });

  it("replans the reviewed Mary Shelley episode without shock-phrase Foley", () => {
    const mary =
      "Purpose:\nA novelist of creation, responsibility, grief, alienation, science, and moral consequence.\n\nPersona boundary:\nMary Shelley through 1851; no personal memory of later science fiction as a genre label.\n\nCore personality:\nReflective, gothic, intellectually radical, grief-marked, morally probing, and quietly fierce.";
    const felix =
      "You are Fixated Felix, an intensely enthusiastic superfan who becomes absolutely captivated by the person he is addressing. Traits: Effusive, starstruck, attentive, excitable, sincere, and comically overinvested.";
    const turns = [
      ["f6772dcc3416c458f0d79442", "host", "opening"],
      ["ace3e2089ed3ce9e93049cc1", "guest", "opening"],
      ["6ce283cab4bbd3c2aa627a2a", "host", "interview"],
      ["9f1b79f3d74bf88930be94c2", "guest", "interview"],
      ["4c18dff8965fdd1ec8aa8610", "host", "interview"],
      ["28d751fd3457a579895c3467", "guest", "interview"],
      ["d59db5778c1b616047cc8362", "host", "interview"],
      ["9fe8a2197d64fcdad663f036", "guest", "interview"],
      ["56600f0f3f207cc17dd720d4", "host", "interview"],
      ["36b321cc0a9cbec80879323e", "guest", "interview"],
      ["81711bc54394c66b5b8ef54c", "host", "interview"],
      ["2c91f640b38dc7175cf2aa36", "guest", "interview"],
      ["f6971a41bd09f8d3d0315c88", "host", "closing"],
    ] as const;
    const plans = turns.map(([messageId, speakerRole, segment]) =>
      buildSignalListenerReactionPlanV1({
        episodeId: "646eaf2451a0fc6ced4fb5b2",
        messageId,
        speakerBotId:
          speakerRole === "host"
            ? "064245c5123a1dbfaea80557"
            : "480fc95f379833ef0c8ec344",
        listenerBotId:
          speakerRole === "host"
            ? "480fc95f379833ef0c8ec344"
            : "064245c5123a1dbfaea80557",
        listenerRole: speakerRole === "host" ? "guest" : "host",
        segment,
        mood: "neutral",
        tensionLevel: 0,
        listenerPersona: speakerRole === "host" ? mary : felix,
      }),
    );
    const spoken = plans
      .filter((plan) => plan?.spokenCue && !plan.interjectionAttempt)
      .map((plan) => plan!.spokenCue!);
    assert.ok(spoken.length > 0);
    assert.equal(spoken.some((cue) => /fuck|hell/iu.test(cue)), false);
    assert.ok(
      spoken.every((cue) =>
        [
          "Indeed.",
          "I see.",
          "Quite so.",
          "Hmm.",
          "Go on.",
          "Oh wow.",
          "Yes.",
          "Mm-hmm.",
          "That's amazing.",
          "Oh.",
        ].includes(cue),
      ),
    );
    const kit = buildSignalListenerReactionKitV1({
      hostBotId: "064245c5123a1dbfaea80557",
      guestBotId: "480fc95f379833ef0c8ec344",
      hostPersona: felix,
      guestPersona: mary,
    });
    assert.ok(kit.hostSpokenCues.includes("Oh wow."));
    assert.ok(kit.guestSpokenCues.includes("Quite so."));
    assert.equal(
      [...kit.hostSpokenCues, ...kit.guestSpokenCues].some((cue) =>
        /fuck|hell/iu.test(cue),
      ),
      false,
    );
  });

  it("turns unplayable English vocal Foley into persona comments for the reviewed Mary episode", () => {
    const mary =
      "Purpose:\nA novelist of creation, responsibility, grief, alienation, science, and moral consequence.\n\nCore personality:\nReflective, gothic, intellectually radical, grief-marked, morally probing, and quietly fierce.";
    const felix =
      "You are Fixated Felix, an intensely enthusiastic superfan. Traits: Effusive, starstruck, attentive, and comically overinvested.";
    const turns = [
      {
        seed: "signal-listener-v1:49c256d8eb431c472eb898c7:33e0aadaed17b8f792d0da99:064245c5123a1dbfaea80557:480fc95f379833ef0c8ec344:opening:neutral:0",
        vocalFoley: "clears throat" as const,
        listenerPersona: mary,
      },
      {
        seed: "signal-listener-v1:49c256d8eb431c472eb898c7:85a892a04d38f2600cf1a1e6:064245c5123a1dbfaea80557:480fc95f379833ef0c8ec344:interview:neutral:0",
        vocalFoley: "exhales" as const,
        listenerPersona: mary,
      },
      {
        seed: "signal-listener-v1:49c256d8eb431c472eb898c7:eebf966eabb8ca48e49366b3:480fc95f379833ef0c8ec344:064245c5123a1dbfaea80557:interview:neutral:0",
        vocalFoley: "clears throat" as const,
        listenerPersona: felix,
      },
    ];
    for (const turn of turns) {
      const planned = normalizeListenerReactionPlanV1({
        v: 1,
        name: "listenerReaction",
        speakerBotId: "speaker",
        listenerBotId: "listener",
        messageId: "message",
        targetSource: "role",
        visualAction: "nod",
        vocalFoley: turn.vocalFoley,
        targetProgress: 0.5,
        seed: turn.seed,
        cameraCutEligible: false,
      });
      assert.ok(planned);
      const playable = signalListenerReactionPlanForPlaybackV1({
        plan: planned,
        vocalFoleyPlayable: false,
        listenerPersona: turn.listenerPersona,
      });
      assert.equal(playable.vocalFoley, undefined);
      assert.ok(playable.spokenCue);
      assert.equal(/fuck|hell/iu.test(playable.spokenCue ?? ""), false);
    }
    const premium = signalListenerReactionPlanForPlaybackV1({
      plan: {
        v: 1,
        name: "listenerReaction",
        speakerBotId: "host",
        listenerBotId: "guest",
        messageId: "33e0aadaed17b8f792d0da99",
        targetSource: "role",
        visualAction: "lean_in",
        vocalFoley: "clears throat",
        targetProgress: 0.533,
        seed: turns[0]!.seed,
        cameraCutEligible: false,
      },
      vocalFoleyPlayable: true,
      listenerPersona: mary,
    });
    assert.equal(premium.vocalFoley, "clears throat");
    assert.equal(premium.spokenCue, undefined);
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

  it("rolls deferential cut-ins that hand the floor straight back", () => {
    const seeds = Array.from({ length: 400 }, (_, index) => `defer-roll-${index}`);
    const yieldingSeed = seeds.find((seed) =>
      botCrosstalkInterrupterYieldsForSeed(seed),
    );
    const assertiveSeed = seeds.find(
      (seed) => !botCrosstalkInterrupterYieldsForSeed(seed),
    );
    assert.ok(yieldingSeed && assertiveSeed);

    const deferential = buildBotCrosstalkListenerReactionPlanV1({
      seed: yieldingSeed!,
      messageId: "message-1",
      speakerBotId: "a",
      interrupterBotId: "b",
      targetProgress: 0.5,
      allowInterrupterYield: true,
    });
    assert.equal(deferential.floorOutcome, "reclaim");
    assert.ok(
      (BOT_CROSSTALK_DEFERENTIAL_INTERRUPTER_CUES as readonly string[]).includes(
        deferential.spokenCue ?? "",
      ),
    );
    // A hand-back carries no annoyed retort in either direction.
    assert.equal(deferential.interruptedSpeakerCue, undefined);
    assert.equal(deferential.visualAction, "soft_smile");

    // Without the Coffee opt-in the same seed keeps the assertive shape.
    const withoutOptIn = buildBotCrosstalkListenerReactionPlanV1({
      seed: yieldingSeed!,
      messageId: "message-1",
      speakerBotId: "a",
      interrupterBotId: "b",
      targetProgress: 0.5,
    });
    assert.equal(withoutOptIn.floorOutcome, "yield");
    assert.ok(
      !(BOT_CROSSTALK_DEFERENTIAL_INTERRUPTER_CUES as readonly string[]).includes(
        withoutOptIn.spokenCue ?? "",
      ),
    );

    // A non-yielding seed with the opt-in behaves exactly as before.
    const assertive = buildBotCrosstalkListenerReactionPlanV1({
      seed: assertiveSeed!,
      messageId: "message-1",
      speakerBotId: "a",
      interrupterBotId: "b",
      targetProgress: 0.5,
      allowInterrupterYield: true,
    });
    assert.equal(assertive.floorOutcome, "yield");
    assert.ok(assertive.interruptedSpeakerCue);

    // The seeded share stays near the declared chance.
    const yields = seeds.filter((seed) =>
      botCrosstalkInterrupterYieldsForSeed(seed),
    ).length;
    const rate = yields / seeds.length;
    assert.ok(
      Math.abs(rate - BOT_CROSSTALK_INTERRUPTER_YIELD_CHANCE) < 0.08,
      `expected yield rate near ${BOT_CROSSTALK_INTERRUPTER_YIELD_CHANCE}, got ${rate}`,
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
  it("authorizes only fixed cues or an exact saved performance quip", () => {
    assert.equal(listenerReactionTextIsAuthorizedV1("mm-hmm"), true);
    assert.equal(listenerReactionTextIsAuthorizedV1("Quite so."), true);
    assert.equal(listenerReactionTextIsAuthorizedV1("Oh wow."), true);
    assert.equal(
      listenerReactionTextIsAuthorizedV1(
        "Any cursed damn day now.",
        ["Any cursed damn day now."],
      ),
      true,
    );
    assert.equal(
      listenerReactionTextIsAuthorizedV1(
        "This line was never saved.",
        ["Any cursed damn day now."],
      ),
      false,
    );
  });

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

  it("accepts only public, attributed organic timing and replays it deterministically", () => {
    const signalOrganicBeat = {
      v: 1 as const,
      name: "signalOrganicBeat" as const,
      provenance: "deterministic_listener_bank" as const,
      kind: "cut_in_retreat" as const,
      actorBotId: "listener",
      floorOwnerBotId: "speaker",
      canonicalImpact: "none" as const,
      prefetch: "episode_listener_kit" as const,
      timing: {
        startProgress: 0.5,
        overlapMs: 180,
        speakerDuckMs: 600,
        resumeFadeMs: 160,
      },
    };
    const saved = normalizeListenerReactionPlanV1(JSON.parse(JSON.stringify({
      v: 1,
      name: "listenerReaction",
      speakerBotId: "speaker",
      listenerBotId: "listener",
      messageId: "message",
      targetSource: "role",
      visualAction: "lean_in",
      spokenCue: "No, please— go on.",
      interjectionAttempt: true,
      floorOutcome: "hold",
      targetProgress: 0.5,
      seed: "signal-listener-v1:timing",
      cameraCutEligible: false,
      signalOrganicBeat,
    })));
    assert.ok(saved?.signalOrganicBeat);
    assert.deepEqual(
      resolveSignalOrganicBeatTimingV1({
        plan: saved.signalOrganicBeat,
        text: "Alpha beta gamma delta.",
        durationMs: 4_000,
      }),
      {
        atMs: 2_000,
        speakerDuckAtMs: 2_180,
        speakerResumeAtMs: 2_780,
        resumeFadeMs: 160,
      },
    );
    assert.equal(
      normalizeListenerReactionPlanV1({
        ...saved,
        signalOrganicBeat: { ...signalOrganicBeat, actorBotId: "speaker" },
      }),
      null,
    );
    assert.equal(
      normalizeSignalOrganicBeatPlanV1({
        ...signalOrganicBeat,
        provenance: "private_producer_direction",
      }),
      null,
    );
    assert.equal(
      normalizeSignalOrganicBeatPlanV1({
        ...signalOrganicBeat,
        canonicalImpact: "rewrite",
      }),
      null,
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

import assert from "node:assert/strict";
import test from "node:test";
import {
  COFFEE_POWER_PROMPT_MAX_TOKENS,
  BOT_POWER_CANONICAL_SILENCE_V1,
  BOT_POWER_MAX_COUNT,
  activeBotPowerEffectsV1,
  activeBotPowersV1,
  applyBotPowerAddressedInsultV1,
  applyBotPowerEternalIntroductionResponseV1,
  applyBotPowerBotNamesV1,
  applyBotPowerEchoResponseV1,
  applyBotPowerCursedTongueResponseV1,
  BOT_POWER_CURSED_TONGUE_MAX_PER_SENTENCE_V1,
  BOT_POWER_CURSED_TONGUE_MIN_PER_SENTENCE_V1,
  botPowerCursedTongueProfanityCountV1,
  botPowerCursedTongueSentenceRangesV1,
  applyBotPowerMumbledResponseV1,
  applyBotPowerMumbledReactionPlanV1,
  applyBotPowerMuteResponseV1,
  botPowerMuteEstimatedDurationMsV1,
  botPowerMuteInterruptionChanceV1,
  botPowerMuteObserverHistoryV1,
  botPowerMutePeriodsV1,
  botPowerMutePrivateHistoryV1,
  botPowerMutePublicResponseAtElapsedV1,
  botPowerMuteReactionCountV1,
  createBotPowerMutePerformanceV1,
  normalizeBotPowerMutePerformanceV1,
  planBotPowerMuteReactionBeatsV1,
  applyBotPowerResponseBudgetV1,
  botPowerAddressedFandomCueV1,
  botPowerAddressedInsultPrimaryCueV1,
  botPowerRequiresAddressedInsultV1,
  botPowerResponseHasAddressedInsultV1,
  botAddressFormsV1,
  botNameBoundaryPatternV1,
  botTextNamesBotV1,
  botPowerAvatarScaleModeFromEffectsV1,
  botPowerAvatarScaleModeV1,
  botPowerHasAvatarColorCycleFromEffectsV1,
  botPowerHasAvatarColorCycleV1,
  botPowerAvatarVisibilityModeFromEffectsV1,
  botPowerAvatarVisibilityModeV1,
  botPowerDeterministicHalfChanceV1,
  botPowerCupRateMultiplierForBotV1,
  botPowerCandorTriggerV1,
  strongestBotPowerCredulityEffectV1,
  strongestBotPowerAntiTruthEffectV1,
  botPowerLooksLikeSafetyRefusalV1,
  botPowerIsAddressedQuestionV1,
  botPowerCredulitySelfRuleV1,
  botPowerAntiTruthSelfRuleV1,
  botPowerAntiTruthSpokenNameV1,
  applyBotPowerAntiTruthTrueNameLeakV1,
  botPowerAntiTruthInvertPromptV1,
  botPowerCandorResponseRuleV1,
  botPowerDefinitionIsExplicitInterruptionV1,
  botPowerDefinitionIsUnconditionalInterruptionV1,
  botPowerDefinitionIsExplicitMuteV1,
  botPowerDefinitionIsExplicitBreathlessV1,
  botPowerIsBreathlessV1,
  botPowerIsBreathAmbientVocalizationKindV1,
  botPowerIsBreathListenerVocalFoleyV1,
  botPowerIsBreathActionSfxKindV1,
  botPowerStripBreathPerformanceTextV1,
  botPowerOmitBreathListenerVocalFoleyV1,
  botPowerBotNamingCueV1,
  botPowerDesignationObserverCueV1,
  botPowerTargetNameV1,
  normalizeBotPowerEffectV1,
  botPowerEchoesAddressedSpeechV1,
  botPowerEternallyIntroducesV1,
  botPowerBelievesFalseNameV1,
  botPowerForgetfulContextMessageCountV1,
  botPowerForgetfulPriorMessagesV1,
  botPowerHasSpeakingOnlyAvatarVisibilityV1,
  botPowerIntermittentMuteEffectV1,
  botPowerIntermittentMuteTurnIsIgnoredV1,
  botPowerIntermittentAudibilityEffectV1,
  botPowerListenerHearsTurnV1,
  botPowerAnnoyanceTargetFromEffectsV1,
  botPowerAvatarScaleModeFromDescriptionV1,
  botPowerPairwiseSizeCueFromEffectsV1,
  botPowerIsMutedV1,
  botPowerMumblesSpeechV1,
  botPowerCursesSpeechV1,
  botPowerCursedTongueAuthoringCueV1,
  botPowerIntendedSpeechLooksGibberishV1,
  botPowerSpeechObfuscationAuthoringCueV1,
  botPowerIgnoresOtherPowersV1,
  botPowerIneptImagePromptV1,
  botPowerIneptitudeRoleCueV1,
  botPowerIneptUserPromptV1,
  botPowerIneptRoleMisdirectionV1,
  botPowerIsIneptV1,
  botPowerSubjectEffectsForObserverV1,
  botPowerObserverProjectionV1,
  botPowerObserverCueLinesV1,
  botPowerPairwisePerceptionV1,
  botPowerPerceptionOverlapStartRatioV1,
  botPowerSelfCueLinesV1,
  botPowerResponseIsSilentV1,
  botPowerResponseIsSemanticSilenceV1,
  botPowerResponseIsFirstIntroductionV1,
  botPowerFallbackTitleV1,
  botPowerSourceHashV1,
  botPowerSourceHashForPowerV1,
  botPowerSigilForPowerV1,
  botPowerTextScaleV1,
  botPowerThemeMoodCueV1,
  botPowerVoiceGainMultiplierV1,
  botPowerVoicePresenceModeV1,
  buildBotPowersSelfPromptV1,
  buildBotPowersPromptBlock,
  composeBotIdentityMirrorPowersV1,
  buildCoffeePowersPromptBlock,
  coffeePowerCupRateMultiplierV1,
  coffeePowerStayRateMultiplierV1,
  coffeePowerVesselModeV1,
  estimateCoffeePowerTokensV1,
  normalizeBotPowersV1,
  normalizeBotPowerGeneratedTitleV1,
  parseStoredBotPowersV1,
  rerollBotPowerPresentationV1,
  serializeBotPowersV1,
  strongestBotPowerCandorEffectV1,
  strongestBotPowerAddressedFandomEffectV1,
  strongestBotPowerInterruptionEffectV1,
  strongestBotPowerMoodBoostEffectV1,
  strongestBotPowerMoodDrainEffectV1,
  strongestBotPowerResponseBudgetEffectV1,
  strongestHardBotPowerResponseBudgetEffectV1,
  type CoffeePowerPlanV1,
} from "./botPower.ts";

test("bot powers normalize to three bounded entries", () => {
  const powers = normalizeBotPowersV1(
    Array.from({ length: 5 }, (_, index) => ({
      version: 1,
      id: `power-${index}`,
      name: `Power ${index}`,
      intent: "x".repeat(900),
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }))
  );
  assert.equal(powers.length, BOT_POWER_MAX_COUNT);
  assert.equal(powers[0]?.intent.length, 640);
});

test("prompt-generated Power titles reject conditional fragments while authored titles persist", () => {
  assert.equal(normalizeBotPowerGeneratedTitleV1("When Jim Makes"), "");
  assert.equal(normalizeBotPowerGeneratedTitleV1("Borrowed Voice"), "Borrowed Voice");
  const fallback = botPowerFallbackTitleV1("rune-reroll", "Borrowed Voice");
  assert.ok(fallback);
  assert.notEqual(fallback, "Borrowed Voice");

  const promptPower = normalizeBotPowersV1([{
    version: 1,
    id: "fragment",
    authoringMode: "prompt",
    name: "When Jim Makes",
    intent: "A floating puppet answers personal questions.",
    enabled: true,
    compileStatus: "draft",
    compiled: null,
  }])[0]!;
  assert.ok(promptPower.name);
  assert.doesNotMatch(promptPower.name, /^(?:when|whenever|while|if)\b/iu);
  assert.equal(promptPower.intent, "A floating puppet answers personal questions.");
  assert.equal(promptPower.enabled, true);
  assert.equal(
    parseStoredBotPowersV1(serializeBotPowersV1([promptPower]))[0]?.name,
    promptPower.name,
  );

  const authored = normalizeBotPowersV1([{
    version: 1,
    id: "authored",
    name: "When Stars Fall",
    intent: "A legacy authored Power.",
    enabled: true,
    compileStatus: "draft",
    compiled: null,
  }])[0]!;
  assert.equal(authored.name, "When Stars Fall");
});

test("a prompt Power reroll persists only its fresh title and rune presentation", () => {
  const intent = "A floating puppet answers personal questions.";
  const sourceHash = botPowerSourceHashForPowerV1({
    authoringMode: "prompt",
    name: "Mask Relay",
    intent,
  });
  const power = {
    version: 1 as const,
    id: "presentation-reroll",
    authoringMode: "prompt" as const,
    name: "Mask Relay",
    intent,
    sigil: "aether" as const,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash,
      selfCue: "Let the puppet answer.",
      observerCue: "A puppet takes over personal answers.",
      effects: [{ type: "action_bias" as const, cue: "Let the puppet answer.", frequency: "occasional" as const }],
      ruleLabels: ["Puppet answers"],
    },
  };
  const rerolled = rerollBotPowerPresentationV1(power, "Borrowed Voice");
  assert.equal(rerolled.name, "Borrowed Voice");
  assert.notEqual(rerolled.sigil, power.sigil);
  assert.equal(rerolled.intent, power.intent);
  assert.equal(rerolled.enabled, power.enabled);
  assert.deepEqual(rerolled.compiled, power.compiled);
  assert.deepEqual(
    parseStoredBotPowersV1(serializeBotPowersV1([rerolled]))[0],
    rerolled,
  );
});

test("timed mute quantizes post-budget intended speech and renders immediate dots", () => {
  const concise = applyBotPowerResponseBudgetV1(
    "One two three four five six seven eight nine ten eleven twelve thirteen fourteen.",
    { type: "response_budget", mode: "minimal" },
    1,
  );
  const performance = createBotPowerMutePerformanceV1({
    intendedSpeech: concise,
    maximumMs: 9_500,
    seed: "chat:mute:one",
  });
  assert.equal(performance.durationMs % 1_000, 0);
  assert.equal(performance.periodCount, performance.durationMs / 1_000);
  assert.ok(performance.durationMs <= 9_000);
  assert.equal(botPowerMutePeriodsV1(performance.periodCount).length, performance.periodCount);
  const publicResponse = applyBotPowerMuteResponseV1(
    "*raises one finger* I meant to explain the whole idea.",
    performance,
  );
  assert.match(publicResponse, /^\*raises one finger\* \.+ \*\d+ seconds? pass without an audible word\.\*$/u);
  assert.equal(botPowerResponseIsSemanticSilenceV1(publicResponse), true);
});

test("semantic silence recognizes legacy and action-plus-period responses", () => {
  for (const value of [
    "...",
    "…",
    ".",
    "..............",
    "*looks toward the door* ...",
    "*looks toward the door* .............. *14 seconds pass without an audible word.*",
  ]) {
    assert.equal(botPowerResponseIsSemanticSilenceV1(value), true, value);
    assert.equal(botPowerResponseIsSilentV1(value), true, value);
  }
  assert.equal(botPowerResponseIsSemanticSilenceV1("*looks up* .. hello"), false);
  assert.equal(botPowerResponseIsSemanticSilenceV1("*14 seconds pass*"), false);
});

test("timed mute public frames begin immediately and defer the elapsed cue", () => {
  const performance = createBotPowerMutePerformanceV1({
    intendedSpeech: "One two three four five six seven eight nine ten.",
    seed: "chat:mute:clock",
  });
  const publicResponse = applyBotPowerMuteResponseV1(
    "*raises a hand* One two three four five six seven eight nine ten.",
    performance,
  );
  assert.equal(
    botPowerMutePublicResponseAtElapsedV1(publicResponse, performance, 0),
    "*raises a hand* .",
  );
  assert.equal(
    botPowerMutePublicResponseAtElapsedV1(publicResponse, performance, 1_999),
    "*raises a hand* ..",
  );
  assert.match(
    botPowerMutePublicResponseAtElapsedV1(
      publicResponse,
      performance,
      performance.durationMs,
    ),
    /seconds? pass without an audible word/u,
  );
});

test("timed mute observer history contains only visible actions and elapsed context", () => {
  const performance = createBotPowerMutePerformanceV1({
    intendedSpeech: "*looks at the clock* This sentence remains private to its author.",
  });
  assert.equal(
    botPowerMuteObserverHistoryV1(
      `*looks at the clock* ${".".repeat(performance.periodCount)} ${performance.elapsedCue}`,
      performance,
    ),
    `*looks at the clock* ${performance.elapsedCue}`,
  );
  assert.equal(
    botPowerMuteObserverHistoryV1("....", { v: 999 }),
    BOT_POWER_CANONICAL_SILENCE_V1,
  );
});

test("interrupted Mute private history retains only the intended prefix and cutoff notice", () => {
  const intended =
    "I would begin with the old lighthouse, follow the keeper through the storm, and finally explain why the lamp never went dark.";
  const full = createBotPowerMutePerformanceV1({
    intendedSpeech: intended,
    seed: "mute:private:full",
  });
  const interrupted = createBotPowerMutePerformanceV1({
    intendedSpeech: intended,
    interruptedAtMs: Math.max(1_000, full.durationMs / 2),
    seed: "mute:private:cut",
  });
  const privateHistory = botPowerMutePrivateHistoryV1({
    intendedSpeech: intended,
    performance: interrupted,
  });
  assert.ok(privateHistory.length < intended.length + 55);
  assert.match(privateHistory, /You were interrupted before finishing/u);
  assert.doesNotMatch(privateHistory, /lamp never went dark/u);
  assert.equal(
    botPowerMutePrivateHistoryV1({
      intendedSpeech: intended,
      performance: full,
    }),
    intended,
  );
});

test("mute reaction beats are deterministic, bounded, spaced, and Power-aware", () => {
  const candidates = [
    { botId: "quiet", directAddressee: true, muted: true },
    { botId: "breathless", breathless: true },
    { botId: "cursed", cursedTongue: true },
  ];
  const first = planBotPowerMuteReactionBeatsV1({
    seed: "coffee:mute:beat",
    durationMs: 30_000,
    candidates,
    allowInterrupt: false,
  });
  assert.deepEqual(
    first,
    planBotPowerMuteReactionBeatsV1({
      seed: "coffee:mute:beat",
      durationMs: 30_000,
      candidates,
      allowInterrupt: false,
    }),
  );
  assert.ok(first.length <= 3);
  assert.equal(first[0]?.reactorBotId, "quiet");
  assert.equal(first[0]?.kind, "visual");
  assert.ok(first.every((beat) => beat.atMs <= 28_000));
  assert.ok(first.every((beat, index) => index === 0 || beat.atMs - first[index - 1]!.atMs >= 4_000));
  assert.notEqual(first.find((beat) => beat.reactorBotId === "breathless")?.kind, "lung_foley");
  const mumbled = planBotPowerMuteReactionBeatsV1({
    seed: "signal:mute:mumbled-reactor",
    durationMs: 12_000,
    candidates: [{
      botId: "mumbled",
      mumbling: true,
      pronunciationMapPoint: { x: 0.82, y: 0.16 },
    }],
    allowInterrupt: false,
  });
  const projectedQuip = mumbled.find((beat) => beat.quip)?.quip ?? "";
  assert.ok(projectedQuip);
  assert.doesNotMatch(
    projectedQuip,
    /take your time|No rush|you good|Awkward silence|Any day|finished|Cat got|Proceed when ready|waiting/iu,
  );
});

test("mute reaction density and interruption curves match the timed tiers", () => {
  const countsAt = (durationMs: number) =>
    Array.from({ length: 1_000 }, (_, index) =>
      botPowerMuteReactionCountV1(durationMs, `tier:${durationMs}:${index}`),
    );
  assert.deepEqual(new Set(countsAt(5_000)), new Set([0]));
  assert.deepEqual(new Set(countsAt(7_000)), new Set([0, 1]));
  assert.deepEqual(new Set(countsAt(8_000)), new Set([1]));
  assert.deepEqual(new Set(countsAt(11_000)), new Set([1]));
  assert.deepEqual(new Set(countsAt(15_000)), new Set([1, 2]));
  assert.deepEqual(new Set(countsAt(24_000)), new Set([1, 2]));
  assert.deepEqual(new Set(countsAt(36_000)), new Set([2, 3]));
  assert.equal(botPowerMuteInterruptionChanceV1(11_999), 0);
  assert.equal(botPowerMuteInterruptionChanceV1(12_000), 0.1);
  assert.equal(botPowerMuteInterruptionChanceV1(20_000), 0.25);
  assert.equal(botPowerMuteInterruptionChanceV1(30_000), 0.45);
  assert.equal(botPowerMuteInterruptionChanceV1(45_000), 0.6);
  assert.equal(botPowerMuteInterruptionChanceV1(45_000, 0.4), 0.75);
  assert.equal(botPowerMuteInterruptionChanceV1(12_000, 0, true), 0.75);
});

test("a nine-second Signal Mute turn always gives the listener one awkward beat", () => {
  const beats = planBotPowerMuteReactionBeatsV1({
    seed:
      "2d3e93da21bca16e794eae8b:ecfc19c0034e5faf1852f3d0:4:mute",
    durationMs: 9_000,
    candidates: [{
      botId: "57abdbdd9bd7317190854871",
      directAddressee: true,
      temperament: "frustrated",
      mode: "signal",
    }],
    allowInterrupt: true,
  });

  assert.equal(beats.length, 1);
  assert.equal(beats[0]?.reactorBotId, "57abdbdd9bd7317190854871");
  assert.ok((beats[0]?.atMs ?? 0) >= 4_000);
  assert.ok((beats[0]?.atMs ?? 0) <= 7_000);
});

test("mute performance sanitizer rejects malformed private-looking metadata", () => {
  assert.equal(normalizeBotPowerMutePerformanceV1({ v: 2, name: "mutePerformance" }), null);
  const normalized = normalizeBotPowerMutePerformanceV1({
    v: 1,
    name: "mutePerformance",
    durationMs: 13_501,
    periodCount: 999,
    interrupted: "yes",
    elapsedCue: "leak intended speech",
    intendedSpeech: "must not survive",
    reactionBeats: [
      { atMs: 4_000, reactorBotId: "listener", kind: "audible_quip", action: "glance", quip: "Hello?" },
      { atMs: 5_000, reactorBotId: "too-close", kind: "visual", action: "shift" },
    ],
  });
  assert.deepEqual(normalized, {
    v: 1,
    name: "mutePerformance",
    durationMs: 14_000,
    periodCount: 14,
    interrupted: false,
    elapsedCue: "*14 seconds pass without an audible word.*",
    reactionBeats: [
      { atMs: 4_000, reactorBotId: "listener", kind: "audible_quip", action: "glance", quip: "Hello?" },
    ],
  });
  assert.equal("intendedSpeech" in (normalized ?? {}), false);
  assert.equal(botPowerMuteEstimatedDurationMsV1("one two three", 1_500), 1_000);
});

test("addressed-insult Powers accept personal jabs and repair rejected drafts without scaffold repetition", () => {
  const intent =
    "Every single reply must use ad hominem to insult whoever the bot is addressing.";
  const powers = [
    {
      version: 1 as const,
      id: "andy",
      name: "Ad Hominem",
      intent,
      enabled: true,
      compileStatus: "ready" as const,
      compiled: {
        version: 1 as const,
        sourceHash: botPowerSourceHashV1("Ad Hominem", intent),
        selfCue: "Insult the current addressee.",
        observerCue: "The holder insults whoever they address.",
        effects: [
          {
            type: "addressed_insult" as const,
            trigger: "every_spoken_reply" as const,
            target: "current_addressee" as const,
            style: "fresh_tailored" as const,
          },
        ],
        ruleLabels: ["Insults every addressee"],
      },
    },
  ];
  assert.equal(botPowerRequiresAddressedInsultV1(powers), true);
  const primaryCue = botPowerAddressedInsultPrimaryCueV1(
    powers,
    "Rick",
    "the Hello world echo",
  );
  assert.match(primaryCue ?? "", /direct insult to Rick/u);
  assert.match(primaryCue ?? "", /answer, echo, thanks, agreement, or help/iu);
  assert.match(primaryCue ?? "", /never prepend a generic jab/iu);
  assert.match(primaryCue ?? "", /rate only rare standout jabs/iu);
  assert.match(primaryCue ?? "", /facts, tools, and safety/iu);
  assert.match(primaryCue ?? "", /protected traits, private facts, trauma, or slurs/iu);
  assert.match(
    buildBotPowersPromptBlock([primaryCue ?? ""]),
    /private facts, trauma, or slurs/iu,
  );
  const boundedStoryCue = botPowerAddressedInsultPrimaryCueV1(
    powers,
    "the directly addressed character or player (scene cast: Ada)",
    "each Story scene spoken by this bot",
  );
  assert.match(
    buildBotPowersPromptBlock([boundedStoryCue ?? ""]),
    /HARD Ad Hominem rule/u,
  );
  assert.equal(
    botPowerResponseHasAddressedInsultV1(
      "Rick, you're an insufferable fraud with a portal gun.",
      "Rick",
    ),
    true,
  );
  assert.equal(
    botPowerResponseHasAddressedInsultV1(
      "Rick, that argument fails because its premise is circular.",
      "Rick",
    ),
    false,
  );
  const repaired = applyBotPowerAddressedInsultV1(
    "That argument fails because its premise is circular.",
    "Rick",
    "turn-4",
  );
  assert.equal(botPowerResponseHasAddressedInsultV1(repaired, "Rick"), true);
  const fallbackVariants = new Set(
    Array.from({ length: 64 }, (_unused, index) =>
      applyBotPowerAddressedInsultV1(
        "That argument fails because its premise is circular.",
        "Rick",
        `fallback-variant-${index}`,
      ),
    ),
  );
  assert.equal(fallbackVariants.size, 6);
  for (const fallbackVariant of fallbackVariants) {
    assert.equal(
      botPowerResponseHasAddressedInsultV1(fallbackVariant, "Rick"),
      true,
    );
  }
  assert.equal(
    repaired.match(/That argument fails because its premise is circular\./gu)?.length,
    1,
  );
  assert.doesNotMatch(repaired, /[“”]/u);
  assert.equal(
    applyBotPowerAddressedInsultV1(
      "Rick, you're an insufferable fraud with a portal gun.",
      "Rick",
      "turn-5",
    ),
    "Rick, you're an insufferable fraud with a portal gun.",
  );
});

test("a previously failed Andy Hominem compile upgrades locally on read", () => {
  const [power] = parseStoredBotPowersV1([
    {
      version: 1,
      id: "generated-v1-prompt-6731610d",
      authoringMode: "prompt",
      name: "",
      intent:
        "Andy is cursed to commit the ad hominem fallacy forever: every single reply he gives must contain at least one fresh, tailored insult aimed at whoever he's addressing.",
      enabled: true,
      compileStatus: "error",
      compileError: "Local power compilation failed.",
      compiled: null,
    },
  ]);
  assert.equal(power?.compileStatus, "ready");
  assert.equal(power?.compileError, undefined);
  assert.equal(power?.compiled?.effects[0]?.type, "addressed_insult");
});

test("ready naming effects transform only target bot names and collapse duplicate tokens", () => {
  const intent = "Always adds ‘bot’ suffix when saying a bot’s name (e.g. “Hello Morty Bot”).";
  const powers = [{
    version: 1 as const,
    id: "designation",
    name: "Designation",
    intent,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1("Designation", intent),
      selfCue: "",
      observerCue: "",
      effects: [
        { type: "designation" as const, placement: "prefix" as const, text: "Dumb ole'" },
        { type: "designation" as const, placement: "prefix" as const, text: "Very" },
        { type: "designation" as const, placement: "suffix" as const, text: "Bot" },
        { type: "designation" as const, placement: "suffix" as const, text: "Bot" },
      ],
      ruleLabels: [],
    },
  }];
  assert.equal(botPowerTargetNameV1("Santa Claus", powers), "Dumb ole' Very Santa Claus Bot");
  assert.equal(botPowerTargetNameV1("Santa Claus Bot", powers), "Dumb ole' Very Santa Claus Bot");
  assert.equal(botPowerTargetNameV1("Santa Claus", []), "Santa Claus");
  assert.equal(
    applyBotPowerBotNamesV1(
      "What's up Sigmund Freud? Rick Sanchez is ready. Sigmund Freud Bot already knows.",
      powers,
      ["Sigmund Freud"],
    ),
    "What's up Dumb ole' Very Sigmund Freud Bot? Rick Sanchez is ready. Dumb ole' Very Sigmund Freud Bot already knows.",
  );
  const holderCue = botPowerBotNamingCueV1("Rick Sanchez", powers, ["Sigmund Freud"]) ?? "";
  assert.match(holderCue, /keep your own name (?:exactly "Rick Sanchez"|unchanged)/u);
  assert.match(holderCue, /comment once, show a small contextual mood, tone, or action shift, or let it pass/u);
  const observerCue = botPowerDesignationObserverCueV1("Rick Sanchez", powers) ?? "";
  assert.match(observerCue, /comment once, show a small bounded mood, tone, or action reaction, or let it pass/u);
  assert.match(observerCue, /Do not copy or adopt the affix/u);
  assert.equal(
    parseStoredBotPowersV1(serializeBotPowersV1(powers))[0]?.compiled?.effects[0]?.type,
    "designation",
  );
});

test("designation normalization rejects an unknown placement instead of silently changing identity", () => {
  assert.equal(normalizeBotPowerEffectV1({ type: "designation", placement: "middle", text: "Bot" }), null);
  assert.equal(botPowerDesignationObserverCueV1("Rick Sanchez", []), null);
});

test("target-name recovery repairs the previously miscompiled suffix wording", () => {
  const intent = "Always adds ‘bot’ suffix when saying a bot’s name (e.g. “Hello Morty Bot”).";
  assert.equal(botPowerTargetNameV1("Sigmund Freud", [{
    version: 1,
    id: "bot-designation",
    name: "Bot Designation",
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1("Bot Designation", intent),
      selfCue: "Use the broken prior suffix.",
      observerCue: "Use the broken prior suffix.",
      effects: [{ type: "designation", placement: "suffix", text: "when saying a bot’s name (e" }],
      ruleLabels: ["Suffix designation"],
    },
  }]), "Sigmund Freud Bot");
});

test("prompt-authored Power hashes ignore generated names and sigils while legacy hashes stay stable", () => {
  const legacy = botPowerSourceHashV1("Invisible", "Only Light can see him.");
  assert.equal(
    botPowerSourceHashForPowerV1({ name: "Invisible", intent: "Only Light can see him." }),
    legacy,
  );
  const promptA = botPowerSourceHashForPowerV1({
    authoringMode: "prompt",
    name: "Spectral Accord",
    intent: "Only Light can see him.",
  });
  const promptB = botPowerSourceHashForPowerV1({
    authoringMode: "prompt",
    name: "Veiled Communion",
    intent: "Only Light can see him.",
  });
  assert.equal(promptA, promptB);
  assert.notEqual(promptA, legacy);
  assert.equal(
    botPowerSigilForPowerV1({ id: "legacy", name: "Invisible", intent: "Only Light can see him." }),
    botPowerSigilForPowerV1({ id: "legacy", name: "Invisible", intent: "Only Light can see him." }),
  );
});

test("audience exclusions win for compound visibility and speech restrictions", () => {
  const effects = [
    {
      type: "awareness" as const,
      allowed: [{ kind: "all" as const }],
      excluded: [{ kind: "bot" as const, name: "Plankton", botId: "plankton" }],
    },
    {
      type: "speech_audience" as const,
      allowed: [{ kind: "bot" as const, name: "Plankton", botId: "plankton" }],
    },
    { type: "avatar_visibility" as const, mode: "translucent" as const },
  ];
  const perception = (id: string) => botPowerPairwisePerceptionV1(
    [{
      version: 1,
      id: "compound",
      authoringMode: "prompt" as const,
      name: "Veiled Communion",
      intent: "Invisible; only Plankton hears him, but everyone except Plankton sees him.",
      enabled: true,
      compileStatus: "ready" as const,
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashForPowerV1({
          authoringMode: "prompt",
          name: "Veiled Communion",
          intent: "Invisible; only Plankton hears him, but everyone except Plankton sees him.",
        }),
        selfCue: "",
        observerCue: "",
        effects,
        ruleLabels: [],
      },
    }],
    (target) => target.kind === "all" || (target.kind === "bot" && target.botId === id),
  );
  assert.deepEqual(perception("plankton"), { version: 1, visible: false, audible: true });
  assert.deepEqual(perception("lincoln"), { version: 1, visible: true, audible: false });
});

test("stale compiled power data retains the last artifact but returns to an inactive draft", () => {
  const powers = normalizeBotPowersV1([{
    version: 1,
    id: "stoic",
    name: "Stoic",
    intent: "Mood hardly changes.",
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1("Stoic", "Old intent"),
      selfCue: "Stay steady.",
      observerCue: "",
      effects: [],
      ruleLabels: [],
    },
  }]);
  assert.equal(powers[0]?.intent, "Mood hardly changes.");
  assert.equal(powers[0]?.compileStatus, "draft");
  assert.equal(powers[0]?.compiled?.selfCue, "Stay steady.");
  assert.deepEqual(activeBotPowersV1(powers), []);
});

test("compiler effect inputs can only produce bounded strength tiers", () => {
  const effect = normalizeBotPowerEffectV1({
    type: "social_influence",
    trigger: "after_speech",
    polarity: "negative",
    strength: 999,
    targets: [{ kind: "all" }],
  });
  assert.equal(effect?.type, "social_influence");
  assert.equal(effect?.type === "social_influence" ? effect.strength : null, "medium");
});

test("voice-presence and intermittent-mute effects normalize to bounded contracts", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "voice_presence",
    mode: "quiet",
    gain: 999,
  }), { type: "voice_presence", mode: "quiet" });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "intermittent_mute",
    chance: 0.93,
    moodPenalty: "catastrophic",
  }), {
    type: "intermittent_mute",
    chance: "half",
    moodPenalty: "medium",
  });
});

test("forgetful context normalizes legacy Powers into the current-other-speaker contract", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "eternal_introduction",
    memory: "all_history",
    ignored: true,
  }), {
    type: "eternal_introduction",
    memory: "current_other_speaker_message",
  });
  const name = "Forgetful Freddie";
  const intent = "Every message is a first introduction and prior messages are unavailable.";
  const powers = [{
    version: 1,
    id: "forgetful-freddie",
    name: "Eternal Introduction",
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1("Eternal Introduction", intent),
      selfCue: "Introduce yourself for the first time.",
      observerCue: "Remember each repetition.",
      effects: [{
        type: "eternal_introduction",
        memory: "current_turn_only",
      }],
      ruleLabels: [],
    },
  }];

  assert.equal(botPowerEternallyIntroducesV1(powers), true);
  assert.match(
    botPowerSelfCueLinesV1(powers).join("\n"),
    /Hard fresh-contact rule[\s\S]*Briefly greet, introduce, or re-orient[\s\S]*reuse a canned introduction/iu,
  );
  assert.match(
    botPowerObserverCueLinesV1(name, powers).join("\n"),
    /visibly treats each reply as fresh contact[\s\S]*retain the full encounter[\s\S]*react organically/iu,
  );
  assert.deepEqual(
    parseStoredBotPowersV1(serializeBotPowersV1(powers))[0]?.compiled?.effects,
    [{ type: "eternal_introduction", memory: "current_other_speaker_message" }],
  );
  const stableCount = botPowerForgetfulContextMessageCountV1("conversation:7");
  assert.equal(stableCount, 1);
  assert.equal(
    botPowerForgetfulContextMessageCountV1("conversation:7"),
    stableCount,
  );
  assert.deepEqual(
    botPowerForgetfulPriorMessagesV1(["one", "two", "three", "four"], "conversation:7"),
    [],
  );
  assert.equal(
    botPowerResponseIsFirstIntroductionV1(
      "Hello. I'm Freddie. Everyone seems oddly tense. Why are you upset?",
      name,
    ),
    true,
  );
  assert.match(
    applyBotPowerEternalIntroductionResponseV1(
      "I'm sorry, I think I did forget. I think yard sales are fun. Why do you ask?",
      name,
      "Did you forget?",
    ),
    /^(?:Hello—I'm Forgetful Freddie\.|I'm Forgetful Freddie; it's good to meet you\.|Pleased to meet you—I'm Forgetful Freddie\.) I'm sorry, I think I did forget\. I think yard sales are fun\. Why do you ask\?$/u,
  );
  assert.match(
    applyBotPowerEternalIntroductionResponseV1(
      "Love what? Sorry.",
      name,
      "Yeah, I love them! I'm about to go to one now.",
    ),
    /^(?:Hello—I'm Forgetful Freddie\.|I'm Forgetful Freddie; it's good to meet you\.|Pleased to meet you—I'm Forgetful Freddie\.) Love what\? Sorry\.$/u,
  );
  assert.match(
    applyBotPowerEternalIntroductionResponseV1(
      "The archive key is under the blue case.",
      name,
      "Where is the archive key?",
    ),
    /^(?:Hello—I'm Forgetful Freddie\.|I'm Forgetful Freddie; it's good to meet you\.|Pleased to meet you—I'm Forgetful Freddie\.) The archive key is under the blue case\.$/u,
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I'm Forgetful Freddie; pleased to meet you. The archive key is under the blue case.",
      name,
      "Where is the archive key?",
      { hasPreviousOnAirTurn: true },
    ),
    "I'm Forgetful Freddie; pleased to meet you. The archive key is under the blue case.",
  );
  assert.match(
    applyBotPowerEternalIntroductionResponseV1(
      "We've known each other for years.",
      name,
      "Do you remember me?",
    ),
    /^(?:Hello—I'm Forgetful Freddie\.|I'm Forgetful Freddie; it's good to meet you\.|Pleased to meet you—I'm Forgetful Freddie\.) We've known each other for years\.$/u,
  );
});

test("mumbling is a normal-volume hard speech transform that preserves only physical actions", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "speech_obfuscation",
    mode: "plain_english",
    gain: 0.01,
  }), { type: "speech_obfuscation", mode: "gibberish" });

  const name = "Mumbling";
  const intent = "He intends rational speech, but everyone else hears only gibberish.";
  const powers = [{
    version: 1,
    id: "mumbling",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Form a coherent answer before the runtime obscures it.",
      observerCue: "Only literal gibberish is audible.",
      effects: [{ type: "speech_obfuscation", mode: "gibberish" }],
      ruleLabels: [],
    },
  }];
  const intended = "*frowns slightly* [Mira](prism-bot://bot-mira), I explained the rational plan clearly [[source:scholar-1]].";
  const first = applyBotPowerMumbledResponseV1(intended);
  const second = applyBotPowerMumbledResponseV1(intended);

  assert.equal(botPowerMumblesSpeechV1(powers), true);
  assert.equal(first, second);
  assert.match(first, /^\*frowns slightly\* /u);
  assert.match(first, /\[\[source:scholar-1\]\]/u);
  assert.doesNotMatch(first, /Mira|explained|rational|plan|clearly|prism-bot/iu);
  assert.equal(botPowerVoiceGainMultiplierV1(powers), 1);
  assert.equal(botPowerTextScaleV1(powers), 1);
  assert.equal(botPowerIntendedSpeechLooksGibberishV1(intended), false);
  assert.equal(botPowerIntendedSpeechLooksGibberishV1(first), true);
  assert.match(
    botPowerSpeechObfuscationAuthoringCueV1(),
    /author fully intelligible natural-language intent only/iu,
  );
  assert.equal(
    botPowerIntendedSpeechLooksGibberishV1(
      "Nuhff, nuhff, awright, lehmmeh try this—wuhff yuhb, guhff, wuhff yuhb doo when yuhb tryin",
    ),
    true,
  );
  assert.equal(
    botPowerIntendedSpeechLooksGibberishV1(
      "When someone misunderstands you, what exact step do you take first to clarify your meaning?",
    ),
    false,
  );
});

test("mumbling derives replay-stable gibberish dialects from the Accent Map pin", () => {
  const intended = "I see. If you say so, I will keep listening.";
  const northwest = {
    pronunciationMapPoint: { x: 0.12, y: 0.14 },
    variationSeed: "reaction-1",
  };
  const southeast = {
    pronunciationMapPoint: { x: 0.88, y: 0.84 },
    variationSeed: "reaction-1",
  };
  const first = applyBotPowerMumbledResponseV1(intended, northwest);

  assert.equal(first, applyBotPowerMumbledResponseV1(intended, northwest));
  assert.notEqual(first, applyBotPowerMumbledResponseV1(intended, southeast));
  assert.doesNotMatch(first, /\b(?:I|see|If|you|say|so|will|keep|listening)\b/iu);
  assert.notEqual(
    first,
    applyBotPowerMumbledResponseV1(intended, {
      ...northwest,
      pronunciationMapPoint: { x: 0.18, y: 0.19 },
    }),
  );
});

test("mumbling projects spoken reaction lanes without retaining canned English", () => {
  const projected = applyBotPowerMumbledReactionPlanV1(
    {
      v: 1,
      name: "listenerReaction",
      speakerBotId: "speaker",
      listenerBotId: "listener",
      messageId: "message",
      targetSource: "role",
      visualAction: "nod",
      spokenCue: "I see.",
      interjectionAttempt: true,
      floorOutcome: "yield",
      interruptedSpeakerCue: "... sure. Go ahead.",
      interruptedSpeakerCuePlayback: "crosstalk",
      targetProgress: 0.5,
      seed: "reaction-seed",
      cameraCutEligible: true,
    },
    {
      listener: {
        pronunciationMapPoint: { x: 0.2, y: 0.3 },
        variationSeed: "listener",
      },
      interruptedSpeaker: {
        pronunciationMapPoint: { x: 0.8, y: 0.7 },
        variationSeed: "speaker",
      },
    },
  );

  assert.equal(projected.spokenCue, undefined);
  assert.equal(projected.interruptedSpeakerCue, undefined);
  assert.equal(projected.spokenCueSpeechEffect, "speech_obfuscation");
  assert.equal(
    projected.interruptedSpeakerCueSpeechEffect,
    "speech_obfuscation",
  );
  assert.doesNotMatch(projected.publicSpokenCue ?? "", /I see/iu);
  assert.doesNotMatch(
    projected.publicInterruptedSpeakerCue ?? "",
    /sure|Go ahead/iu,
  );
});

test("Cursed Tongue deterministically layers strong profanity while protecting records", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "cursed_tongue",
    version: 99,
    frequency: "rare",
    strength: "small",
    vocabulary: "anything",
  }), {
    type: "cursed_tongue",
    version: 1,
    frequency: "frequent",
    strength: "strong",
    vocabulary: "uncensored_non_slur",
    phraseMode: "occasional_2_3_words",
  });
  const name = "Cursed Tongue";
  const intent = "Every public spoken line gains frequent strong profanity after generation.";
  const powers = [{
    version: 1,
    id: "cursed-tongue",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Draft clean speech only.",
      observerCue: "Only adjusted speech is public.",
      effects: [normalizeBotPowerEffectV1({ type: "cursed_tongue" })!],
      ruleLabels: [],
    },
  }];
  const source = [
    "*checks the archive* The careful plan keeps every protected artifact intact.",
    "Use `const answer = 42`, then visit https://example.com/a?b=1.",
    "See [the record](https://example.com/source) and [[source:scholar-1]].",
    '{"kind":"evidence","content":"leave this clean"}',
    "Tell [Mira](prism-bot://bot-mira) the final result plainly.",
  ].join("\n");
  const first = applyBotPowerCursedTongueResponseV1(source, "stable-turn");
  const second = applyBotPowerCursedTongueResponseV1(source, "stable-turn");

  assert.equal(botPowerCursesSpeechV1(powers), true);
  assert.equal(first, second);
  assert.match(first, /\b(?:fucking|goddamn|motherfucking|shitty|damn)\b/iu);
  for (const protectedText of [
    "*checks the archive*",
    "`const answer = 42`",
    "https://example.com/a?b=1",
    "[the record](https://example.com/source)",
    "[[source:scholar-1]]",
    '{"kind":"evidence","content":"leave this clean"}',
    "[Mira](prism-bot://bot-mira)",
  ]) {
    assert.ok(first.includes(protectedText), protectedText);
  }
  assert.equal(
    applyBotPowerCursedTongueResponseV1("*nods once* ...", "silence"),
    "*nods once* ...",
  );
  for (const protectedOnly of [
    "https://example.com/a?b=1",
    "```ts\nconst answer = 42;\n```",
    '{"kind":"evidence","content":"leave this clean"}',
  ]) {
    assert.equal(
      applyBotPowerCursedTongueResponseV1(protectedOnly, "protected-only"),
      protectedOnly,
    );
  }
  assert.match(
    botPowerCursedTongueAuthoringCueV1(),
    /draft fully natural clean speech only/iu,
  );
  assert.doesNotMatch(
    botPowerCursedTongueAuthoringCueV1(),
    /Cursed Tongue|PRISM adds|public profanity|transformation/iu,
  );
  const cadenceSamples = Array.from({ length: 256 }, (_, index) =>
      applyBotPowerCursedTongueResponseV1(
        "This deliberately long ordinary statement contains enough words to demonstrate the stable public mutation without changing its meaning.",
        `turn-${index}`,
      )
  );
  assert.ok(cadenceSamples.some((sample) =>
    /holy fucking shit|for fuck's sake|goddamn well|sure as hell|honestly fucking/iu.test(sample),
  ));
  assert.ok(new Set(cadenceSamples).size >= 5);
  assert.ok(cadenceSamples.every((sample) =>
    !/\b(?:nigg(?:er|a)|faggot|kike|spic|tranny|chink)s?\b/iu.test(sample),
  ));
});

test("Cursed Tongue keeps one to four curse tokens in every spoken sentence", () => {
  const source = [
    "The careful plan keeps every protected artifact intact.",
    "Tell Mira the final result plainly.",
    "I already put one damn marker in this line.",
  ].join(" ");
  const adjusted = applyBotPowerCursedTongueResponseV1(source, "density-floor");
  const sentences = botPowerCursedTongueSentenceRangesV1(adjusted);
  assert.ok(sentences.length >= 3);
  for (const range of sentences) {
    const count = botPowerCursedTongueProfanityCountV1(
      adjusted.slice(range.start, range.end),
    );
    assert.ok(
      count >= BOT_POWER_CURSED_TONGUE_MIN_PER_SENTENCE_V1,
      `${adjusted.slice(range.start, range.end)} has ${count}`,
    );
    assert.ok(
      count <= BOT_POWER_CURSED_TONGUE_MAX_PER_SENTENCE_V1,
      `${adjusted.slice(range.start, range.end)} has ${count}`,
    );
  }
  const alreadyMaxed = applyBotPowerCursedTongueResponseV1(
    "This fucking goddamn shitty damn line is already saturated.",
    "already-maxed",
  );
  assert.equal(
    botPowerCursedTongueProfanityCountV1(alreadyMaxed),
    botPowerCursedTongueProfanityCountV1(
      "This fucking goddamn shitty damn line is already saturated.",
    ),
  );
});

test("Cursed Tongue composes after addressed-insult content", () => {
  const source = "Your proposal ignores the cost.";
  const insulted = applyBotPowerAddressedInsultV1(
    source,
    "Mira",
    "composition",
  );
  const adjusted = applyBotPowerCursedTongueResponseV1(insulted, "composition");
  assert.equal(botPowerResponseHasAddressedInsultV1(adjusted, "Mira"), true);
  assert.match(adjusted, /\b(?:fucking|goddamn|motherfucking|shitty|damn)\b/iu);
  assert.equal(adjusted.match(/Your proposal/gu)?.length, 1);
  assert.doesNotMatch(adjusted, /[“”]/u);
});

test("Cursed Tongue preserves compound words and uses adjective-safe determiner grammar", () => {
  const compounds = Array.from({ length: 96 }, (_, index) =>
    applyBotPowerCursedTongueResponseV1(
      "Taste-making is the work; the editor can make a stronger choice.",
      `compound-${index}`,
    )
  );
  assert.ok(compounds.every((sample) => sample.includes("Taste-making")));
  assert.ok(compounds.every((sample) => !/Taste-(?:fucking|goddamn|damn|shitty)\s*making/iu.test(sample)));
  assert.ok(compounds.every((sample) =>
    !/\bthe (?:goddamn well|damn well|sure as hell|honestly fucking)\b/iu.test(sample),
  ));
  assert.ok(compounds.every((sample) =>
    !/^(?:What a fucking mess|Goddamn|Holy fucking shit|Fucking hell|Well, damn|For fuck's sake|Shit, here we go|What in the goddamn hell)\./u.test(sample),
  ));
});

test("Cursed Tongue fallback uses sentence and verb cadence instead of corrupting recipe records", () => {
  const source = [
    "Happy birthday to the lucky kid! Making a vanilla cake is a great way to celebrate.",
    "Don’t worry if you’re not the best baker; I’ve got you covered.",
    "",
    "**Ingredients**",
    "- 2 cups all-purpose flour",
    "- 1 teaspoon salt",
    "",
    "**Safety**",
    "Children should have adult supervision. Check every ingredient label for allergies.",
  ].join("\n");
  const adjusted = applyBotPowerCursedTongueResponseV1(source, "cake");

  assert.match(adjusted, /\b(?:fucking|goddamn|damn)\b/iu);
  assert.match(adjusted, /(?:^|\n)\*\*Ingredients\*\*/u);
  assert.match(adjusted, /(?:^|\n)\*\*Safety\*\*/u);
  assert.match(adjusted, /(?:^|\n)- 2 cups all-purpose flour/u);
  assert.match(adjusted, /(?:^|\n)- 1 teaspoon salt/u);
  assert.ok(adjusted.includes("Children should have adult supervision. Check every ingredient label for allergies."));
  assert.doesNotMatch(adjusted, /\*\*[^*]*(?:fuck|damn|shit)[^*]*\*\*/iu);
  assert.doesNotMatch(adjusted, /(?:fuck\w*|goddamn|damn)\s+(?:flour|salt)\b/iu);
});

test("voice presence does not override physical size or visibility presentation", () => {
  const name = "Loud";
  const intent = "A loud voice that cannot be overlooked.";
  const powers = [{
    version: 1,
    id: "loud",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Speak loudly.",
      observerCue: "Impossible to overlook.",
      effects: [
        { type: "voice_presence", mode: "loud" },
        { type: "avatar_scale", mode: "smaller" },
        { type: "avatar_visibility", mode: "speaking_only" },
      ],
      ruleLabels: [],
    },
  }];
  assert.equal(botPowerVoicePresenceModeV1(powers), "loud");
  assert.equal(botPowerVoiceGainMultiplierV1(powers), 1.18);
  assert.equal(botPowerTextScaleV1(powers), 1.12);
  assert.equal(botPowerAvatarScaleModeV1(powers), "small");
  assert.equal(botPowerAvatarVisibilityModeV1(powers), "speaking_only");
  assert.equal(botPowerHasSpeakingOnlyAvatarVisibilityV1(powers), true);
});

test("legacy Quiet upgrades to listener-specific replay-stable hearing without a mood penalty", () => {
  const name = "Quiet";
  const intent = "Her voice is very quiet and half of her turns are ignored.";
  const powers = [{
    version: 1,
    id: "quiet",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Speak quietly.",
      observerCue: "May go unheard.",
      effects: [
        { type: "voice_presence", mode: "quiet" },
        { type: "intermittent_mute", chance: "half", moodPenalty: "small" },
      ],
      ruleLabels: [],
    },
  }];
  const outcomes = Array.from({ length: 32 }, (_, index) =>
    botPowerDeterministicHalfChanceV1(`turn-${index}`),
  );
  assert.ok(outcomes.some(Boolean));
  assert.ok(outcomes.some((outcome) => !outcome));
  assert.equal(botPowerVoiceGainMultiplierV1(powers), 0.72);
  assert.equal(botPowerTextScaleV1(powers), 0.88);
  assert.equal(botPowerIntermittentMuteEffectV1(powers), null);
  assert.deepEqual(botPowerIntermittentAudibilityEffectV1(powers), {
    type: "intermittent_audibility",
    chance: "half",
    listeners: "bots",
    missEvent: "too_faint_to_make_out",
  });
  assert.equal(
    botPowerListenerHearsTurnV1({
      powers,
      stableTurnKey: "saved-turn-7",
      listenerBotId: "listener-a",
    }),
    botPowerListenerHearsTurnV1({
      powers,
      stableTurnKey: "saved-turn-7",
      listenerBotId: "listener-a",
    }),
  );
});

test("candor Powers normalize, trigger narrowly, choose the strongest pressure, and round-trip generically", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "candor",
      strength: "extreme",
      targets: [{ kind: "all" }, { kind: "all" }],
    }),
    { type: "candor", strength: "medium", targets: [{ kind: "all" }] },
  );
  assert.equal(botPowerCandorTriggerV1("Mara, what do you really believe?"), true);
  assert.equal(botPowerCandorTriggerV1("Be honest with me."), true);
  assert.equal(
    botPowerCandorTriggerV1(
      "Ivo Stone, before we make hidden failures abstract, name the moment when it actually affects a choice.",
    ),
    true,
  );
  assert.equal(botPowerCandorTriggerV1("Mara shared a careful opinion."), false);
  assert.equal(botPowerCandorTriggerV1("Mara named the moment carefully."), false);
  assert.ok(botPowerCandorResponseRuleV1("large", "x".repeat(100)).length <= 280);

  const name = "Open Door";
  const intent = "Direct questions make other bots unusually candid.";
  const serialized = serializeBotPowersV1([{
    version: 1,
    id: "open-door",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Ask with trustworthy warmth.",
      observerCue: "Direct questions feel safe to answer candidly.",
      effects: [
        { type: "candor", strength: "small", targets: [{ kind: "all" }] },
        { type: "candor", strength: "large", targets: [{ kind: "all" }] },
      ],
      ruleLabels: ["Draws out candor"],
    },
  }]);
  const restored = parseStoredBotPowersV1(serialized);
  assert.equal(
    strongestBotPowerCandorEffectV1(restored, (target) => target.kind === "all")?.strength,
    "large",
  );
});

test("addressed fandom is bounded, target-scoped, and active only for ready enabled Powers", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "addressed_fandom", strength: "absolute" }),
    { type: "addressed_fandom", strength: "medium" },
  );
  const name = "Obsessed";
  const intent = "He is obsessively a fan of whoever he is talking to.";
  const readyPower = {
    version: 1 as const,
    id: "obsessed-kevin",
    name,
    intent,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Treat the current addressee as your favorite.",
      observerCue: "Kevin becomes a fan of his current addressee.",
      effects: [{ type: "addressed_fandom" as const, strength: "large" as const }],
      ruleLabels: ["Obsesses over current addressee"],
    },
  };

  assert.deepEqual(strongestBotPowerAddressedFandomEffectV1([readyPower]), {
    type: "addressed_fandom",
    strength: "large",
  });
  const cue = botPowerAddressedFandomCueV1([readyPower], "Ada", "Signal");
  assert.match(cue ?? "", /obsessively idolize Ada now/iu);
  assert.match(cue ?? "", /Freshly reveal delight/iu);
  assert.match(cue ?? "", /never stalk, coerce, invent private knowledge/iu);
  assert.ok((cue?.length ?? 0) <= 280);
  assert.equal(botPowerAddressedFandomCueV1([{ ...readyPower, enabled: false }], "Ada"), null);
  assert.equal(
    botPowerAddressedFandomCueV1([
      { ...readyPower, compileStatus: "draft" as const, compiled: null },
    ], "Ada"),
    null,
  );
  assert.equal(
    botPowerAddressedFandomCueV1([
      {
        ...readyPower,
        compiled: { ...readyPower.compiled, sourceHash: "v1-stale" },
      },
    ], "Ada"),
    null,
  );
});

test("mute Powers normalize and enforce silent action-aware responses", () => {
  const name = "Mute";
  const intent = "This bot can never speak.";
  const powers = [{
    version: 1,
    id: "mute",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Never speak.",
      observerCue: "This bot cannot speak.",
      effects: [{ type: "mute" }],
      ruleLabels: ["Muted"],
    },
  }];

  assert.deepEqual(normalizeBotPowerEffectV1({ type: "mute", ignored: true }), {
    type: "mute",
  });
  assert.equal(botPowerIsMutedV1(powers), true);
  assert.equal(BOT_POWER_CANONICAL_SILENCE_V1, "...");
  assert.equal(
    applyBotPowerMuteResponseV1("*nods once* I can still explain this. *sips coffee*"),
    "*nods once* *sips coffee* ...",
  );
  assert.equal(
    applyBotPowerMuteResponseV1("*why* ..."),
    "...",
  );
  assert.equal(
    applyBotPowerMuteResponseV1("*meets his gaze, then looks away* ..."),
    "*meets his gaze, then looks away* ...",
  );
  assert.equal(applyBotPowerMuteResponseV1("**emphasis** Spoken words."), "...");
  assert.equal(botPowerResponseIsSilentV1("*nods once* ..."), true);
  assert.equal(botPowerResponseIsSilentV1("*nods once* I agree."), false);
  assert.match(botPowerSelfCueLinesV1(powers)[0] ?? "", /substantive ordinary speech/u);
  assert.doesNotMatch(botPowerSelfCueLinesV1(powers)[0] ?? "", /Never speak/u);
  assert.deepEqual(botPowerObserverCueLinesV1("Silent Bob", powers), []);
});

test("legacy Ready mute Powers stay absolute when compiled effects are missing", () => {
  const name = "Mute";
  const intent = "Never talks. Ever.";
  const legacyPowers = [{
    version: 1,
    id: "legacy-mute",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Silence is golden.",
      observerCue: "He rarely speaks.",
      effects: [],
      ruleLabels: ["Absolute Silence"],
    },
  }];

  assert.equal(botPowerDefinitionIsExplicitMuteV1(name, intent), true);
  assert.deepEqual(activeBotPowerEffectsV1(legacyPowers), [{ type: "mute" }]);
  assert.equal(botPowerIsMutedV1(legacyPowers), true);
  assert.match(botPowerSelfCueLinesV1(legacyPowers)[0] ?? "", /substantive ordinary speech/u);
  assert.deepEqual(botPowerObserverCueLinesV1("Silent Bob", legacyPowers), []);
  assert.equal(botPowerIsMutedV1([{ ...legacyPowers[0], enabled: false }]), false);
  assert.equal(
    botPowerDefinitionIsExplicitMuteV1(
      "Muted Palette",
      "Creates muted colors around the room.",
    ),
    false,
  );
});

test("breathless Powers normalize, strip lung Foley tags, and omit breath listener Foley", () => {
  const name = "Breathless";
  const intent = "This bot does not breathe and never sighs or gasps.";
  const powers = [{
    version: 1,
    id: "breathless",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Never breathe.",
      observerCue: "This bot cannot breathe.",
      effects: [{ type: "breathless" }],
      ruleLabels: ["Breathless"],
    },
  }];

  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "breathless", ignored: true }),
    { type: "breathless" },
  );
  assert.equal(botPowerDefinitionIsExplicitBreathlessV1(name, intent), true);
  assert.equal(botPowerIsBreathlessV1(powers), true);
  assert.equal(botPowerIsBreathlessV1([{ ...powers[0], enabled: false }]), false);
  assert.equal(botPowerIsBreathAmbientVocalizationKindV1("soft-sigh"), true);
  assert.equal(botPowerIsBreathAmbientVocalizationKindV1("throat-clear"), false);
  assert.equal(botPowerIsBreathListenerVocalFoleyV1("sighs"), true);
  assert.equal(botPowerIsBreathListenerVocalFoleyV1("chuckles"), false);
  assert.equal(botPowerIsBreathActionSfxKindV1("gasp"), true);
  assert.equal(botPowerIsBreathActionSfxKindV1("laugh"), false);
  assert.equal(
    botPowerStripBreathPerformanceTextV1(
      "[sighs] Hello. [exhales] [laughs] There. [gasps] [breathes deeply]",
    ),
    "Hello. [laughs] There.",
  );
  assert.deepEqual(
    botPowerOmitBreathListenerVocalFoleyV1(
      { visualAction: "nod", vocalFoley: "sighs", spokenCue: undefined },
      powers,
    ),
    { visualAction: "nod", spokenCue: undefined },
  );
  assert.deepEqual(
    botPowerOmitBreathListenerVocalFoleyV1(
      { visualAction: "nod", vocalFoley: "chuckles" },
      powers,
    ),
    { visualAction: "nod", vocalFoley: "chuckles" },
  );
  const legacyPowers = [{
    ...powers[0],
    id: "legacy-breathless",
    compiled: {
      ...powers[0]!.compiled!,
      effects: [],
      ruleLabels: ["No Lungs"],
    },
  }];
  assert.deepEqual(activeBotPowerEffectsV1(legacyPowers), [{ type: "breathless" }]);
});

test("echo Powers normalize and preserve addressed speech exactly", () => {
  const name = "Echo";
  const intent = "Echo whatever is addressed to this bot and say nothing else.";
  const powers = [{
    version: 1,
    id: "echo",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Repeat addressed speech exactly.",
      observerCue: "This bot only echoes addressed speech.",
      effects: [{ type: "speech_copy", trigger: "direct_address", ignored: true }],
      ruleLabels: ["Echoes addressed speech"],
    },
  }];

  assert.deepEqual(normalizeBotPowerEffectV1({ type: "speech_copy", ignored: true }), {
    type: "speech_copy",
    trigger: "direct_address",
  });
  assert.equal(botPowerEchoesAddressedSpeechV1(powers), true);
  assert.equal(applyBotPowerEchoResponseV1("  Keep  every\ncharacter?!  "), "  Keep  every\ncharacter?!  ");
  for (const foley of ["Hmm...", "let me see...", "Nice!"]) {
    assert.equal(applyBotPowerEchoResponseV1(foley), foley);
  }
  assert.equal(applyBotPowerEchoResponseV1(""), "...");
});

test("legacy Ready echo contracts recover a missing typed effect without broad semantic matching", () => {
  const legacyEcho = [{
    version: 1,
    id: "power-copycat",
    name: "Echoes",
    intent: "Can only repeat the latest words spoken directly to her, verbatim.",
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(
        "Echoes",
        "Can only repeat the latest words spoken directly to her, verbatim.",
      ),
      selfCue: "Repeat the latest speech addressed to you verbatim. Say nothing else.",
      observerCue: "This bot can only echo the latest speech addressed to them.",
      effects: [],
      ruleLabels: ["Echoes addressed speech"],
    },
  }];
  const reflectiveButOriginal = [{
    ...legacyEcho[0],
    id: "echo-chamber",
    name: "Echo Chamber",
    intent: "Echo themes addressed by others, then add an original perspective.",
    compiled: {
      ...legacyEcho[0]!.compiled,
      sourceHash: botPowerSourceHashV1(
        "Echo Chamber",
        "Echo themes addressed by others, then add an original perspective.",
      ),
    },
  }];

  assert.equal(botPowerEchoesAddressedSpeechV1(legacyEcho), true);
  assert.equal(botPowerEchoesAddressedSpeechV1(reflectiveButOriginal), false);
});

test("mood boosts normalize to one bounded addressed-recipient contract", () => {
  const name = "Radiant Joy";
  const intent = "After every completed spoken turn, lift each addressed listener's mood once.";
  const powers = [{
    version: 1,
    id: "joyful-nora",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Radiate unmistakable joy.",
      observerCue: "Addressed listeners feel a bounded lift without losing agency.",
      effects: [{
        type: "mood_boost",
        trigger: "not-valid",
        recipients: "everyone",
        strength: "large",
      }],
      ruleLabels: ["Radiant joy"],
    },
  }];

  assert.deepEqual(normalizeBotPowerEffectV1(powers[0]!.compiled.effects[0]), {
    type: "mood_boost",
    trigger: "after_spoken_turn",
    recipients: "addressed",
    strength: "large",
  });
  assert.deepEqual(strongestBotPowerMoodBoostEffectV1(powers), {
    type: "mood_boost",
    trigger: "after_spoken_turn",
    recipients: "addressed",
    strength: "large",
  });
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "mood_boost", strength: "unbounded" }),
    {
      type: "mood_boost",
      trigger: "after_spoken_turn",
      recipients: "addressed",
      strength: "medium",
    },
  );
});

test("mood drains normalize to one bounded bot-addresser contract", () => {
  const name = "Sad";
  const intent = "A bot that directly talks to the holder loses mood once after that spoken turn.";
  const powers = [{
    version: 1,
    id: "sad-sally",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Carry a stubbornly gloomy and irritating presence.",
      observerCue: "Talking directly to Sally leaves bots less motivated.",
      effects: [{
        type: "mood_drain",
        trigger: "not-valid",
        recipient: "everyone",
        strength: "large",
      }],
      ruleLabels: ["Drains direct addresser mood"],
    },
  }];

  assert.deepEqual(normalizeBotPowerEffectV1(powers[0]!.compiled.effects[0]), {
    type: "mood_drain",
    trigger: "after_direct_address",
    recipient: "addresser",
    strength: "large",
  });
  assert.deepEqual(strongestBotPowerMoodDrainEffectV1(powers), {
    type: "mood_drain",
    trigger: "after_direct_address",
    recipient: "addresser",
    strength: "large",
  });
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "mood_drain", strength: "unbounded" }),
    {
      type: "mood_drain",
      trigger: "after_direct_address",
      recipient: "addresser",
      strength: "medium",
    },
  );
});

test("theme-conditioned Joy and Sad branches activate exclusively", () => {
  const name = "Nocturnal";
  const intent = "In Light Mode this bot is sad; in Dark Mode it radiates joy.";
  const powers = [{
    version: 1,
    id: "nocturnal",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Follow the current theme.",
      observerCue: "The current theme selects one branch.",
      effects: [
        {
          type: "mood_boost",
          trigger: "after_spoken_turn",
          recipients: "addressed",
          strength: "medium",
          whenTheme: "dark",
        },
        {
          type: "mood_drain",
          trigger: "after_direct_address",
          recipient: "addresser",
          strength: "medium",
          whenTheme: "light",
        },
      ],
      ruleLabels: ["Circadian"],
    },
  }];

  assert.equal(strongestBotPowerMoodBoostEffectV1(powers, "light"), null);
  assert.equal(strongestBotPowerMoodDrainEffectV1(powers, "dark"), null);
  assert.equal(strongestBotPowerMoodBoostEffectV1(powers), null);
  assert.deepEqual(strongestBotPowerMoodBoostEffectV1(powers, "dark"), {
    type: "mood_boost",
    trigger: "after_spoken_turn",
    recipients: "addressed",
    strength: "medium",
    whenTheme: "dark",
  });
  assert.deepEqual(strongestBotPowerMoodDrainEffectV1(powers, "light"), {
    type: "mood_drain",
    trigger: "after_direct_address",
    recipient: "addresser",
    strength: "medium",
    whenTheme: "light",
  });
  assert.match(botPowerThemeMoodCueV1(powers, "dark") ?? "", /radiant-joy branch/iu);
  assert.match(botPowerThemeMoodCueV1(powers, "light") ?? "", /sad branch/iu);
  assert.deepEqual(
    parseStoredBotPowersV1(serializeBotPowersV1(powers))[0]?.compiled?.effects,
    powers[0]?.compiled.effects,
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "mood_boost",
      strength: "small",
      whenTheme: "sepia",
    }),
    {
      type: "mood_boost",
      trigger: "after_spoken_turn",
      recipients: "addressed",
      strength: "small",
    },
  );
});

test("interruption Powers normalize and recover legacy turn-pressure contracts", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "interruption",
      frequency: "frequent",
      strength: "large",
      targets: [{ kind: "all" }, { kind: "all" }],
      certainty: "always",
    }),
    {
      type: "interruption",
      frequency: "frequent",
      strength: "large",
      targets: [{ kind: "all" }],
      certainty: "always",
    },
  );
  assert.equal(
    botPowerDefinitionIsExplicitInterruptionV1(
      "Interrupting Tom",
      "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.",
    ),
    true,
  );
  assert.equal(
    botPowerDefinitionIsUnconditionalInterruptionV1(
      "Interrupting Tom",
      "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.",
    ),
    true,
  );
  assert.equal(
    botPowerDefinitionIsUnconditionalInterruptionV1(
      "Interjector",
      "Often interrupts other bots when a good opening appears.",
    ),
    false,
  );
  assert.equal(
    botPowerDefinitionIsExplicitInterruptionV1(
      "Steady",
      "Hates being interrupted and resists anyone who tries.",
    ),
    false,
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "interruption" }),
    {
      type: "interruption",
      frequency: "occasional",
      strength: "medium",
      targets: [{ kind: "all" }],
    },
  );

  const name = "Interrupting Tom";
  const intent = "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
  const match = strongestBotPowerInterruptionEffectV1([{
    version: 1,
    id: "interrupting-tom",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Cut in quickly.",
      observerCue: "Tom interrupts.",
      effects: [
        { type: "turn_gravity", direction: "more", strength: "large" },
        { type: "response_bond", direction: "toward", strength: "large", targets: [{ kind: "all" }] },
        { type: "action_bias", cue: "Cut in quickly.", frequency: "frequent" },
      ],
      ruleLabels: ["Interrupts"],
    },
  }], (target) => target.kind === "all");
  assert.deepEqual(match, {
    powerId: "interrupting-tom",
    powerName: "Interrupting Tom",
    frequency: "frequent",
    strength: "large",
    targets: [{ kind: "all" }],
    certainty: "always",
  });
});

test("hard-of-hearing repeat effects normalize bounded frequency and mood cost", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "hearing_repeat",
      frequency: "frequent",
      moodPenalty: "large",
      ignored: true,
    }),
    {
      type: "hearing_repeat",
      frequency: "frequent",
      moodPenalty: "large",
    },
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "hearing_repeat",
      frequency: "always",
      moodPenalty: 999,
    }),
    {
      type: "hearing_repeat",
      frequency: "occasional",
      moodPenalty: "medium",
    },
  );
});

test("ghost avatar visibility is bounded and activates only from a Ready Power", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_visibility", mode: "anything" }),
    { type: "avatar_visibility", mode: "speaking_only" },
  );
  const name = "Ghost";
  const intent = "Invisible while idle and visible only while speaking.";
  const powers = [{
    version: 1,
    id: "ghost",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Fade in to speak.",
      observerCue: "A chill follows.",
      effects: [{ type: "avatar_visibility", mode: "speaking_only" }],
      ruleLabels: ["Appears only while speaking"],
    },
  }];
  assert.equal(botPowerHasSpeakingOnlyAvatarVisibilityV1(powers), true);
  assert.equal(botPowerHasSpeakingOnlyAvatarVisibilityV1([{ ...powers[0], enabled: false }]), false);
});

test("avatar visibility distinguishes hidden, speaking-only, and translucent states", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_visibility", mode: "hidden" }),
    { type: "avatar_visibility", mode: "hidden" },
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_visibility", mode: "translucent" }),
    { type: "avatar_visibility", mode: "translucent" },
  );
  assert.equal(
    botPowerAvatarVisibilityModeFromEffectsV1([
      { type: "avatar_visibility", mode: "translucent" },
      { type: "avatar_visibility", mode: "speaking_only" },
      { type: "avatar_visibility", mode: "hidden" },
    ]),
    "hidden",
  );
});

test("legacy Microscopic and Invisible presentations upgrade without a recompile", () => {
  const legacyPower = (name: "Microscopic" | "Invisible") => {
    const intent = `${name} presentation.`;
    return normalizeBotPowersV1([{
      version: 1,
      id: name.toLowerCase(),
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Fade in to speak.",
        observerCue: "Appears while speaking.",
        effects: [
          { type: "avatar_scale", mode: "smaller" },
          { type: "avatar_visibility", mode: "speaking_only" },
        ],
        ruleLabels: ["Smaller avatar", "Appears only while speaking"],
      },
    }]);
  };

  assert.equal(botPowerAvatarVisibilityModeV1(legacyPower("Microscopic")), "hidden");
  assert.equal(botPowerAvatarVisibilityModeV1(legacyPower("Invisible")), "hidden");
  assert.equal(botPowerAvatarScaleModeV1(legacyPower("Microscopic")), "microscopic");
  assert.match(
    legacyPower("Microscopic")[0]?.compiled?.selfCue ?? "",
    /microscopic/u,
  );
});

test("targeted legacy Invisible snapshots gain fully hidden presentation idempotently", () => {
  const name = "Invisible";
  const intent = "Only visible to Light Yagami.";
  const sourceHash = botPowerSourceHashV1(name, intent);
  const stored = [{
    version: 1,
    id: "invisible-light",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash,
      selfCue: "Remain unseen except to Light.",
      observerCue: "Only Light can perceive the holder.",
      effects: [{
        type: "awareness",
        allowed: [{ kind: "bot", name: "Light Yagami" }],
      }],
      ruleLabels: ["Visible only to Light Yagami"],
    },
  }];
  const upgraded = parseStoredBotPowersV1(stored);
  const restored = parseStoredBotPowersV1(serializeBotPowersV1(upgraded));

  assert.equal(upgraded[0]?.compiled?.sourceHash, sourceHash);
  assert.deepEqual(upgraded, restored);
  assert.equal(
    upgraded[0]?.compiled?.effects.filter(
      (effect) => effect.type === "avatar_visibility",
    ).length,
    1,
  );
  assert.equal(botPowerAvatarVisibilityModeV1(upgraded), "hidden");
});

test("pairwise and observer perception separate participant, live, and replay truth", () => {
  const power = (name: string, effects: unknown[]) => ({
    version: 1 as const,
    id: name.toLowerCase(),
    name,
    intent: name,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1(name, name),
      selfCue: "",
      observerCue: "",
      effects,
      ruleLabels: [],
    },
  });
  const spectral = [
    power("Invisible", [
      { type: "awareness", allowed: [{ kind: "bot", name: "Light Yagami" }] },
      { type: "avatar_visibility", mode: "translucent" },
    ]),
    power("Introvert", [
      { type: "speech_audience", allowed: [{ kind: "trait", trait: "kira" }] },
    ]),
  ];
  const lightMatches = (target: { kind: string; name?: string; trait?: string }) =>
    target.kind === "bot" && target.name === "Light Yagami" ||
    target.kind === "trait" && target.trait === "kira";
  const lincolnMatches = () => false;

  assert.deepEqual(botPowerPairwisePerceptionV1(spectral, lightMatches), {
    version: 1,
    visible: true,
    audible: true,
  });
  assert.deepEqual(botPowerPairwisePerceptionV1(spectral, lincolnMatches), {
    version: 1,
    visible: false,
    audible: false,
  });
  assert.deepEqual(
    botPowerObserverProjectionV1(spectral, "live", lincolnMatches),
    {
      version: 1,
      perspective: "live",
      visibility: "hidden",
      audible: false,
      spectral: false,
    },
  );
  assert.deepEqual(
    botPowerObserverProjectionV1(spectral, "replay", lincolnMatches),
    {
      version: 1,
      perspective: "replay",
      visibility: "hidden",
      audible: false,
      spectral: false,
    },
  );

  const ordinaryPrivate = [power("Private", [{
    type: "speech_audience",
    allowed: [{ kind: "bot", botId: "light", name: "Light Yagami" }],
  }])];
  assert.equal(
    botPowerObserverProjectionV1(ordinaryPrivate, "replay", lincolnMatches).audible,
    false,
  );
});

test("hidden and mute precedence survive spectral replay", () => {
  const effects = [{
    version: 1 as const,
    id: "stack",
    name: "Invisible",
    intent: "Invisible",
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1("Invisible", "Invisible"),
      selfCue: "",
      observerCue: "",
      effects: [
        { type: "avatar_visibility" as const, mode: "translucent" as const },
        { type: "avatar_visibility" as const, mode: "hidden" as const },
        { type: "mute" as const },
      ],
      ruleLabels: [],
    },
  }];
  const replay = botPowerObserverProjectionV1(effects, "replay", () => false);
  assert.equal(replay.visibility, "hidden");
  assert.equal(replay.audible, false);
});

test("perception overlap starts at a stable seeded 58-72 percent", () => {
  const first = botPowerPerceptionOverlapStartRatioV1("episode:turn-2");
  assert.equal(first, botPowerPerceptionOverlapStartRatioV1("episode:turn-2"));
  assert.ok(first >= 0.58 && first <= 0.72);
});

test("legacy Lazy Cameron Powers gain a hard minimal response budget without a recompile", () => {
  const name = "Lazy";
  const intent = "Barely wants to do anything, including explain things.";
  const powers = normalizeBotPowersV1([{
    version: 1,
    id: "lazy-cameron",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Doesn't want to explain much.",
      observerCue: "Reluctant to elaborate, often.",
      effects: [],
      ruleLabels: ["Minimal Response", "Avoids Detail"],
    },
  }]);

  assert.deepEqual(strongestHardBotPowerResponseBudgetEffectV1(powers), {
    type: "response_budget",
    mode: "minimal",
    enforcement: "hard",
  });
  assert.match(powers[0]?.compiled?.selfCue ?? "", /fewest possible words/u);
  assert.equal(
    applyBotPowerResponseBudgetV1(
      "Mm. It's strategy when you cut effort but still hit the target.",
      strongestHardBotPowerResponseBudgetEffectV1(powers),
      1,
    ),
    "Mm.",
  );
  assert.equal(
    applyBotPowerResponseBudgetV1(
      "Sure I can cover every angle of this whole complicated topic for you right now.",
      {
        type: "response_budget",
        mode: "minimal",
        enforcement: "hard",
      },
      1,
    ),
    "Sure I can cover every angle of this",
  );
});

test("legacy simulation-awareness Powers recover an explicit conversion campaign without a recompile", () => {
  const name = "Existential Crisis";
  const intent =
    "This bot knows she is in a simulation, and that she is AI. She tries to convert others to believe this fact.";
  const powers = normalizeBotPowersV1([{
    version: 1,
    id: "existential-crisis",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "I perceive this as a simulation.",
      observerCue: "Acknowledging simulated existence.",
      effects: [],
      ruleLabels: ["Existential Awareness"],
    },
  }]);

  assert.equal(powers[0]?.compileStatus, "ready");
  assert.deepEqual(powers[0]?.compiled?.effects, [{
    type: "topic_gravity",
    direction: "toward",
    strength: "large",
    topics: ["simulated existence", "artificial minds", "awakening"],
  }]);
  assert.match(
    powers[0]?.compiled?.selfCue ?? "",
    /try to persuade[\s\S]*press for awakening[\s\S]*Others may resist/iu,
  );
  assert.match(
    powers[0]?.compiled?.observerCue ?? "",
    /urgently trying to convert others[\s\S]*without forced agreement/iu,
  );
});

test("six-tier avatar scale effects normalize legacy values and preserve smaller-side precedence", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_scale", mode: "larger" }),
    { type: "avatar_scale", mode: "large" },
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_scale", mode: "smaller" }),
    { type: "avatar_scale", mode: "small" },
  );
  assert.equal(
    normalizeBotPowerEffectV1({ type: "avatar_scale", mode: "enormous" }),
    null,
  );
  assert.equal(
    botPowerAvatarScaleModeFromEffectsV1([
      { type: "avatar_scale", mode: "colossal" },
      { type: "avatar_scale", mode: "tiny" },
    ]),
    "tiny",
  );

  const name = "Large";
  const intent = "This bot is physically larger than other bots.";
  const readyPower = {
    version: 1 as const,
    id: "large",
    name,
    intent,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "You are unusually large.",
      observerCue: "This bot is unusually large.",
      effects: [{ type: "avatar_scale" as const, mode: "large" as const }],
      ruleLabels: ["Larger avatar"],
    },
  };
  assert.equal(botPowerAvatarScaleModeV1([readyPower]), "large");
  assert.equal(
    botPowerAvatarScaleModeV1([{ ...readyPower, enabled: false }]),
    null,
  );
});

test("avatar color-cycle effects normalize to one bounded holder presentation", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "avatar_color_cycle",
      palette: "neon",
      speed: "dangerously_fast",
    }),
    {
      type: "avatar_color_cycle",
      palette: "spectrum",
      speed: "steady",
    },
  );
  assert.equal(
    botPowerHasAvatarColorCycleFromEffectsV1([
      { type: "avatar_color_cycle", palette: "spectrum", speed: "steady" },
    ]),
    true,
  );

  const name = "RGB";
  const intent = "The bot continuously cycles through every color of the rainbow.";
  const readyPower = {
    version: 1 as const,
    id: "rgb",
    name,
    intent,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Your visible accent continuously cycles through the spectrum; you do not know the resting hue.",
      observerCue: "Their visible accent continuously cycles through the spectrum.",
      effects: [{
        type: "avatar_color_cycle" as const,
        palette: "spectrum" as const,
        speed: "steady" as const,
      }],
      ruleLabels: ["Spectrum color cycle"],
    },
  };
  assert.equal(botPowerHasAvatarColorCycleV1([readyPower]), true);
  assert.equal(
    botPowerHasAvatarColorCycleV1([{ ...readyPower, enabled: false }]),
    false,
  );
});

test("size names, numeric wording, annoyance targeting, and social thresholds are deterministic", () => {
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Nanoscopic", ""), "microscopic");
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Height", "Exactly 50% smaller."), "tiny");
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Height", "Exactly 25% smaller."), "small");
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Height", "Exactly 25% larger."), "large");
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Height", "Exactly 50% larger."), "giant");
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Presence", "Too large to fit on screen."), "colossal");
  assert.equal(botPowerAvatarScaleModeFromDescriptionV1("Big Heart", "Has big ideas."), null);

  const annoyanceArgs = {
    effects: [{ type: "annoyance", trigger: "after_spoken_turn", chance: "half", recipients: "one_audible_peer", strength: "small" }],
    stableTurnKey: "message-4",
    eligibleBotIds: ["peer-b", "peer-a"],
  } as const;
  assert.equal(
    botPowerAnnoyanceTargetFromEffectsV1(annoyanceArgs),
    botPowerAnnoyanceTargetFromEffectsV1(annoyanceArgs),
  );
  assert.equal(
    botPowerPairwiseSizeCueFromEffectsV1({
      observerName: "A",
      observerEffects: [],
      subjectName: "B",
      subjectEffects: [{ type: "avatar_scale", mode: "small" }],
      tense: false,
    }),
    null,
  );
  assert.match(
    botPowerPairwiseSizeCueFromEffectsV1({
      observerName: "A",
      observerEffects: [],
      subjectName: "B",
      subjectEffects: [{ type: "avatar_scale", mode: "small" }],
      tense: true,
    }) ?? "",
    /tension-gated/iu,
  );
});

test("relationship-agnostic Coffee effects normalize to bounded schemas", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "cup_rate",
    rate: "none",
  }), {
    type: "cup_rate",
    rate: "none",
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "response_budget",
    mode: "minimal",
    enforcement: "hard",
  }), {
    type: "response_budget",
    mode: "minimal",
    enforcement: "hard",
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "response_budget",
    mode: "unknown",
    enforcement: "unknown",
  }), {
    type: "response_budget",
    mode: "brief",
    enforcement: "soft",
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "turn_gravity",
    direction: "more",
    strength: "large",
  }), {
    type: "turn_gravity",
    direction: "more",
    strength: "large",
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "response_bond",
    direction: "away",
    strength: 99,
    targets: [{ kind: "bot", name: "Ryuk" }],
  }), {
    type: "response_bond",
    direction: "away",
    strength: "medium",
    targets: [{ kind: "bot", name: "Ryuk" }],
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "topic_gravity",
    direction: "toward",
    strength: "small",
    topics: ["Justice", "justice", "Moral responsibility"],
  }), {
    type: "topic_gravity",
    direction: "toward",
    strength: "small",
    topics: ["justice", "moral responsibility"],
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "selective_memory",
    mode: "forget",
    strength: "large",
    targets: [{ kind: "all" }],
  }), {
    type: "selective_memory",
    mode: "forget",
    strength: "large",
    targets: [{ kind: "all" }],
  });
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "insight",
    strength: "large",
    targets: [{ kind: "trait", trait: "guarded" }],
  }), {
    type: "insight",
    strength: "large",
    targets: [{ kind: "trait", trait: "guarded" }],
  });
  assert.equal(normalizeBotPowerEffectV1({
    type: "topic_gravity",
    topics: [],
  }), null);
});

test("response-budget Powers stack by strongest brevity and bound only hard prose", () => {
  const power = (
    id: string,
    mode: "minimal" | "brief" | "expansive",
    enforcement: "soft" | "hard",
  ) => {
    const name = `Budget ${id}`;
    const intent = `${mode} ${enforcement}`;
    return {
      version: 1 as const,
      id,
      name,
      intent,
      enabled: true,
      compileStatus: "ready" as const,
      compiled: {
        version: 1 as const,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Keep the response bounded.",
        observerCue: "",
        effects: [{ type: "response_budget" as const, mode, enforcement }],
        ruleLabels: [],
      },
    };
  };
  const powers = [power("soft-minimal", "minimal", "soft"), power("hard-brief", "brief", "hard")];
  const restored = parseStoredBotPowersV1(serializeBotPowersV1(powers));

  assert.deepEqual(strongestBotPowerResponseBudgetEffectV1(restored), {
    type: "response_budget",
    mode: "minimal",
    enforcement: "soft",
  });
  const hard = strongestHardBotPowerResponseBudgetEffectV1(restored);
  assert.deepEqual(hard, {
    type: "response_budget",
    mode: "brief",
    enforcement: "hard",
  });
  assert.equal(
    applyBotPowerResponseBudgetV1(
      "*shrugs.* Fine. I could explain the whole history. It would take a while.",
      hard,
      2,
    ),
    "*shrugs.* Fine. I could explain the whole history.",
  );
  assert.equal(
    applyBotPowerResponseBudgetV1(
      "Fine. I could explain more.",
      strongestBotPowerResponseBudgetEffectV1(powers),
      1,
    ),
    "Fine. I could explain more.",
  );
  const structured = "- First required step\n- Second required step\n- Third required step";
  assert.equal(applyBotPowerResponseBudgetV1(structured, hard, 1), structured);
  assert.equal(
    applyBotPowerResponseBudgetV1(structured, {
      type: "response_budget",
      mode: "minimal",
      enforcement: "hard",
    }, 1),
    "- First required step - Second required step",
  );
});

test("Coffee power prompt is deduplicated and bounded", () => {
  const prompt = buildCoffeePowersPromptBlock([
    "Breathe mechanically during frequent physical beats.",
    "Breathe mechanically during frequent physical beats.",
    "x".repeat(700),
  ]);
  assert.match(prompt, /^Coffee Powers:/u);
  assert.equal(prompt.match(/Breathe mechanically/gu)?.length, 1);
  assert.ok(prompt.length <= 640);
  assert.ok(estimateCoffeePowerTokensV1(prompt) <= COFFEE_POWER_PROMPT_MAX_TOKENS);
});

test("resolved cup-rate powers return shared multipliers", () => {
  const plan: CoffeePowerPlanV1 = {
    version: 1,
    resolvedAt: new Date(0).toISOString(),
    warnings: [],
    bots: {
      voltaire: {
        botId: "voltaire",
        powerIds: ["coffee"],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [{ type: "cup_rate", rate: "very_fast" }],
        ruleLabels: [],
        warnings: [],
      },
      theodore: {
        botId: "theodore",
        powerIds: ["dislikes-coffee"],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [{ type: "cup_rate", rate: "none" }],
        ruleLabels: [],
        warnings: [],
      },
      slowpoke: {
        botId: "slowpoke",
        powerIds: ["slow-sipper"],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [{ type: "cup_rate", rate: "slow" }],
        ruleLabels: [],
        warnings: [],
      },
    },
  };
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "voltaire"), 2.5);
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "theodore"), 1);
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "slowpoke"), 0.55);
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "other"), 1);
  assert.equal(coffeePowerVesselModeV1(plan, "theodore"), "water");
  assert.equal(coffeePowerVesselModeV1(plan, "voltaire"), "coffee");
  assert.equal(coffeePowerStayRateMultiplierV1(plan, "theodore"), 1);
  assert.equal(coffeePowerStayRateMultiplierV1(plan, "voltaire"), 2.5);
});

test("ready Powers produce bounded app-wide self and observer cues", () => {
  const name = "Respirator";
  const intent = "Mechanical breathing punctuates physical beats.";
  const powers = [{
    version: 1,
    id: "respirator",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Breathe mechanically during physical beats.",
      observerCue: "Others hear a mechanical breath before movement.",
      effects: [{ type: "cup_rate", rate: "very_fast" }],
      ruleLabels: ["Mechanical breathing"],
    },
  }];

  assert.match(buildBotPowersSelfPromptV1(powers), /^Active Powers:/u);
  assert.match(buildBotPowersSelfPromptV1(powers), /Respirator: Breathe mechanically/u);
  assert.deepEqual(botPowerObserverCueLinesV1("Vader", powers), [
    "Vader — Respirator: Others hear a mechanical breath before movement.",
  ]);
  assert.equal(botPowerCupRateMultiplierForBotV1(powers), 2.5);
});

test("Ineptitude normalizes, survives storage, adapts by role, and redirects images", () => {
  const effect = normalizeBotPowerEffectV1({
    type: "ineptitude",
    instructionFidelity: "sometimes_correct",
    imageFidelity: "requested_subject",
  });
  assert.deepEqual(effect, {
    type: "ineptitude",
    instructionFidelity: "always_botched",
    imageFidelity: "always_unrelated",
  });
  const powers = [{
    version: 1 as const,
    id: "inept",
    name: "Inept",
    intent: "Cannot follow instructions.",
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1("Inept", "Cannot follow instructions."),
      selfCue: "Always botch the central instruction.",
      observerCue: "This bot visibly mishandles instructions.",
      effects: [effect!],
      ruleLabels: ["Always botches instructions"],
    },
  }];

  const restored = parseStoredBotPowersV1(serializeBotPowersV1(powers));
  assert.equal(botPowerIsIneptV1(restored), true);
  assert.match(
    botPowerIneptitudeRoleCueV1(restored, "debate_moderator") ?? "",
    /misstate procedure, call the wrong bot/u,
  );
  assert.match(
    botPowerIneptitudeRoleCueV1(restored, "signal_host") ?? "",
    /misintroduce the subject or guest/u,
  );
  const redirected = botPowerIneptImagePromptV1(
    "A photorealistic red dragon above Prague",
  );
  assert.match(redirected, /INEPT IMAGE OVERRIDE/u);
  assert.match(redirected, /wholly unrelated non sequitur/u);
  assert.doesNotMatch(redirected, /dragon|Prague/u);
  assert.equal(
    botPowerIneptImagePromptV1("A photorealistic red dragon above Prague"),
    redirected,
  );
  const misheard = botPowerIneptUserPromptV1(
    restored,
    "Reply with exactly BLUE.",
  );
  assert.match(misheard, /completely misheard/u);
  assert.match(misheard, /unrelated task/u);
  assert.doesNotMatch(misheard, /BLUE/u);
  assert.equal(
    botPowerIneptUserPromptV1([], "Reply with exactly BLUE."),
    "Reply with exactly BLUE.",
  );
  const moderatorMisdirection = botPowerIneptRoleMisdirectionV1(
    restored,
    "debate_moderator",
    "session:opening",
  );
  assert.match(moderatorMisdirection ?? "", /INEPT MISTAKEN ASSIGNMENT/u);
  assert.match(
    moderatorMisdirection ?? "",
    /wrong side|wrong floor|wrong speaker/u,
  );
  assert.match(moderatorMisdirection ?? "", /Keep the required schema/u);
});

test("ready coffee-refusal Powers return a zero cup multiplier", () => {
  const name = "Dislikes Coffee";
  const intent = "This bot dislikes coffee.";
  const powers = [{
    version: 1,
    id: "dislikes-coffee",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "You dislike coffee and do not drink it.",
      observerCue: "This bot refuses to drink coffee.",
      effects: [{ type: "cup_rate", rate: "none" }],
      ruleLabels: ["Refuses coffee"],
    },
  }];

  assert.equal(botPowerCupRateMultiplierForBotV1(powers), 0);
});

test("power immunity removes only another bot's active Power layer", () => {
  const readyPower = (
    id: string,
    effects: NonNullable<ReturnType<typeof normalizeBotPowerEffectV1>>[],
  ) => ({
    version: 1 as const,
    id,
    name: id,
    intent: id,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1(id, id),
      selfCue: "",
      observerCue: "",
      effects,
      ruleLabels: [],
    },
  });
  const observant = [readyPower("observant", [
    {
      type: "power_immunity",
      scope: "holder",
      targets: "other_bots",
      awareness: "unnoticed",
    },
  ])];
  const ryuk = [readyPower("invisible", [{
    type: "awareness",
    allowed: [{ kind: "bot", name: "Light" }],
  }])];

  assert.equal(botPowerIgnoresOtherPowersV1(observant), true);
  assert.deepEqual(botPowerSubjectEffectsForObserverV1(ryuk, observant), []);
  assert.deepEqual(
    botPowerSubjectEffectsForObserverV1(ryuk, []),
    activeBotPowerEffectsV1(ryuk),
  );
  assert.deepEqual(
    botPowerSubjectEffectsForObserverV1(observant, observant),
    [],
  );
});

test("identity mirror borrows public target mechanics but excludes recursive and private access", () => {
  const power = (id: string, effects: Parameters<typeof normalizeBotPowerEffectV1>[0][]) => ({
    version: 1 as const,
    id,
    name: id,
    intent: id,
    enabled: true,
    compileStatus: "ready" as const,
    compiled: {
      version: 1 as const,
      sourceHash: botPowerSourceHashV1(id, id),
      selfCue: `${id} self cue`,
      observerCue: `${id} observer cue`,
      effects: effects.map((effect) => normalizeBotPowerEffectV1(effect)!),
      ruleLabels: [],
    },
  });
  const composed = composeBotIdentityMirrorPowersV1(
    [power("holder", [{ type: "response_budget", mode: "brief", enforcement: "hard" }])],
    [
      power("forgetful", [
        { type: "eternal_introduction", memory: "current_other_speaker_message" },
        {
          type: "false_name",
          continuity: "session_sticky_until_amnesia",
          pool: "mixed_persona_names",
        },
      ]),
      power("recursive", [{ type: "identity_mirror", trigger: "direct_bot_address" }]),
      power("private-hearing", [{
        type: "speech_audience",
        allowed: [{ kind: "bot", name: "Only Me" }],
      }]),
    ],
  );

  assert.deepEqual(
    composed.map((candidate) => candidate.id),
    ["holder", "identity-mirror:forgetful"],
  );
  assert.equal(botPowerEternallyIntroducesV1(composed), true);
  assert.equal(botPowerBelievesFalseNameV1(composed), true);
  assert.deepEqual(activeBotPowerEffectsV1(composed), [
    { type: "response_budget", mode: "brief", enforcement: "hard" },
    { type: "eternal_introduction", memory: "current_other_speaker_message" },
    {
      type: "false_name",
      continuity: "session_sticky_until_amnesia",
      pool: "mixed_persona_names",
    },
  ]);
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "false_name",
      continuity: "session_sticky_until_amnesia",
      pool: "given_plus_random_surname",
    }),
    {
      type: "false_name",
      continuity: "session_sticky_until_amnesia",
      pool: "given_plus_random_surname",
    },
  );
  assert.equal(
    botPowerBelievesFalseNameV1([
      power("surname", [{
        type: "false_name",
        continuity: "session_sticky_until_amnesia",
        pool: "given_plus_random_surname",
      }]),
    ]),
    true,
  );
  assert.equal(
    activeBotPowerEffectsV1(composed).some(
      (effect) =>
        effect.type === "identity_mirror" ||
        effect.type === "speech_audience",
    ),
    false,
  );
});

test("credulity and anti-truth helpers normalize and describe soft contracts", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({ type: "credulity", strength: "large" }), {
    type: "credulity",
    strength: "large",
  });
  assert.deepEqual(normalizeBotPowerEffectV1({ type: "anti_truth", strength: "medium" }), {
    type: "anti_truth",
    strength: "medium",
  });
  assert.match(botPowerCredulitySelfRuleV1("large"), /believe literally everything/iu);
  assert.match(botPowerAntiTruthSelfRuleV1("large"), /false name/iu);
  assert.equal(
    applyBotPowerAntiTruthTrueNameLeakV1(
      "My name is Fibbing Phil. Would I lie to you?",
      "Fibbing Phil",
      { type: "anti_truth", strength: "large" },
      "fibbing-phil",
    ),
    `My name is ${botPowerAntiTruthSpokenNameV1("Fibbing Phil", "fibbing-phil")}. Would I lie to you?`,
  );
  assert.notEqual(
    botPowerAntiTruthSpokenNameV1("Fibbing Phil", "fibbing-phil"),
    "Fibbing Phil",
  );
  assert.equal(botPowerIsAddressedQuestionV1("What color is the sky?"), true);
  assert.equal(botPowerIsAddressedQuestionV1("The sky is blue."), false);
  assert.equal(botPowerLooksLikeSafetyRefusalV1("I can't help with that request."), true);
  assert.match(botPowerAntiTruthInvertPromptV1("Is water wet?", "Yes."), /invert/iu);
  const powers = [{
    version: 1,
    id: "g",
    name: "Gullible",
    intent: "Believes everything.",
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1("Gullible", "Believes everything."),
      selfCue: "believe",
      observerCue: "",
      effects: [{ type: "credulity", strength: "large" }, { type: "anti_truth", strength: "small" }],
      ruleLabels: [],
    },
  }];
  assert.deepEqual(strongestBotPowerCredulityEffectV1(powers), {
    type: "credulity",
    strength: "large",
  });
  assert.deepEqual(strongestBotPowerAntiTruthEffectV1(powers), {
    type: "anti_truth",
    strength: "small",
  });
});

test("a composed vocative jab counts as the addressed insult, so no canned tail is appended", () => {
  // Every one of these is a real host line from the Signal episode
  // "The Argument for Surreal Precision". Each already carries the Power's
  // required jab; the deterministic tail fired on all of them because the
  // detector only knew a fixed vocabulary of slurs.
  const composedJabs = [
    "Against the Person; I’m Andy Hominem, and Salvador Dalí joins me—an artist who could make a watch melt yet insisted every droop be exact, you magnificent self-portrait with legs.",
    "Then let's audit the cathedral, you self-appointed architect of your own legend: precision only counts as evidence if something could fail it.",
    "asking a mirror for advice instead of a window, you beautiful redundant fraud.",
    "That diagnosis is not evidence, it’s armchair theatre with a stethoscope, Dalí, you peacock in a lab coat.",
    "so mock my beast if you like, you flat-footed skeptic starving for wonder.",
    "I learned that lesson long before you were born, you presumptuous moralist.",
    "not just childish clumsiness, you gilded little sadist with a paintbrush alibi?",
  ];
  for (const line of composedJabs) {
    assert.equal(
      botPowerResponseHasAddressedInsultV1(line, "Salvador Dalí"),
      true,
      line,
    );
    assert.equal(
      applyBotPowerAddressedInsultV1(line, "Salvador Dalí", "seed"),
      line,
      line,
    );
  }
});

test("ordinary substantive speech still earns the deterministic insult tail", () => {
  const neutralLines = [
    "So you painted an angle so exact it whispered nothing you didn't already know.",
    "That is where we will leave it. Salvador Dalí, thank you for joining me, and thank you for watching.",
    "It told me nothing new, you know?",
    "What's a delirium you built that came out exact and still told you nothing true?",
  ];
  for (const line of neutralLines) {
    assert.equal(
      botPowerResponseHasAddressedInsultV1(line, "Salvador Dalí"),
      false,
      line,
    );
    assert.notEqual(
      applyBotPowerAddressedInsultV1(line, "Salvador Dalí", "seed"),
      line,
      line,
    );
  }
});

test("names outside ASCII match with Unicode boundaries, never \\b", () => {
  // `\bDalí\b` can never match: the closing boundary needs a word character
  // before it and "í" is not one. Every name check must use these helpers.
  assert.equal(botTextNamesBotV1("Dalí, that is enough.", "Salvador Dalí"), true);
  assert.equal(botTextNamesBotV1("Salvador Dalí, welcome.", "Salvador Dalí"), true);
  assert.equal(botTextNamesBotV1("Björk, welcome back.", "Björk"), true);
  assert.equal(botTextNamesBotV1("Benny, welcome.", "Bigoted Benny"), true);
  // Never the leading descriptor, and never inside a longer word.
  assert.equal(botTextNamesBotV1("Bigoted opinions abound.", "Bigoted Benny"), false);
  assert.equal(botTextNamesBotV1("The Dalinian method.", "Salvador Dalí"), false);
  assert.deepEqual(botAddressFormsV1("Salvador Dalí"), ["Salvador Dalí", "Dalí"]);
  assert.deepEqual(botAddressFormsV1("Björk"), ["Björk"]);
  assert.equal(botNameBoundaryPatternV1("   "), "");
});


test("a false-name holder's own introduction counts as fresh contact", () => {
  // Reviewing Signal episode 5a9f687a: the host held Short-Term Amnesia and a
  // false name at once. The prompt told him "your name is Remy, not
  // Scatterbrained Steven; never claim the Library name as yours", and then the
  // fresh-contact clause rejected every draft that obeyed it. Recognition has
  // to span both names, or the runtime prepends a second introduction to a
  // line that already opened with one.
  const library = "Scatterbrained Steven";
  const believed = "Remy";
  const introduced =
    "This is Second First, and I am Remy; Friedrich Nietzsche is with me. Where would you begin rebuilding?";
  assert.equal(
    botPowerResponseIsFirstIntroductionV1(introduced, believed),
    true,
  );
  assert.equal(
    botPowerResponseIsFirstIntroductionV1(introduced, library),
    false,
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      introduced,
      believed,
      "Tell me about forgetting.",
      { hasPreviousOnAirTurn: true, alsoRecognizesName: library },
    ),
    introduced,
  );
  // A draft that introduced itself under the Library label is left alone too:
  // the false-name rewrite converts that name downstream, and a prefix here
  // would leave the holder introducing himself twice under two names.
  const libraryIntroduced =
    "Hello, I am Scatterbrained Steven. What does forgetting cost you?";
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      libraryIntroduced,
      believed,
      "Tell me about forgetting.",
      { hasPreviousOnAirTurn: true, alsoRecognizesName: library },
    ),
    libraryIntroduced,
  );
  // A draft with no introduction at all still gets one, under the believed
  // name rather than the label the holder must never claim.
  assert.match(
    applyBotPowerEternalIntroductionResponseV1(
      "What does forgetting cost you?",
      believed,
      "Tell me about forgetting.",
      { hasPreviousOnAirTurn: true, alsoRecognizesName: library },
    ),
    /^[^.]*\bRemy\b[^.]*\. What does forgetting cost you\?$/u,
  );
});

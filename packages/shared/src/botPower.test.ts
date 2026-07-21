import assert from "node:assert/strict";
import test from "node:test";
import {
  COFFEE_POWER_PROMPT_MAX_TOKENS,
  BOT_POWER_CANONICAL_SILENCE_V1,
  BOT_POWER_MAX_COUNT,
  activeBotPowerEffectsV1,
  applyBotPowerEternalIntroductionResponseV1,
  applyBotPowerEchoResponseV1,
  applyBotPowerMumbledResponseV1,
  applyBotPowerMuteResponseV1,
  applyBotPowerResponseBudgetV1,
  botPowerAddressedFandomCueV1,
  botPowerAvatarScaleModeFromEffectsV1,
  botPowerAvatarScaleModeV1,
  botPowerAvatarVisibilityModeFromEffectsV1,
  botPowerAvatarVisibilityModeV1,
  botPowerDeterministicHalfChanceV1,
  botPowerCupRateMultiplierForBotV1,
  botPowerCandorTriggerV1,
  botPowerCandorResponseRuleV1,
  botPowerDefinitionIsExplicitInterruptionV1,
  botPowerDefinitionIsUnconditionalInterruptionV1,
  botPowerDefinitionIsExplicitMuteV1,
  botPowerEchoesAddressedSpeechV1,
  botPowerEternallyIntroducesV1,
  botPowerForgetfulContextMessageCountV1,
  botPowerForgetfulPriorMessagesV1,
  botPowerHasSpeakingOnlyAvatarVisibilityV1,
  botPowerIntermittentMuteEffectV1,
  botPowerIntermittentMuteTurnIsIgnoredV1,
  botPowerIsMutedV1,
  botPowerMumblesSpeechV1,
  botPowerObserverProjectionV1,
  botPowerObserverCueLinesV1,
  botPowerPairwisePerceptionV1,
  botPowerPerceptionOverlapStartRatioV1,
  botPowerSelfCueLinesV1,
  botPowerResponseIsSilentV1,
  botPowerResponseIsFirstIntroductionV1,
  botPowerSourceHashV1,
  botPowerTextScaleV1,
  botPowerThemeMoodCueV1,
  botPowerVoiceGainMultiplierV1,
  botPowerVoicePresenceModeV1,
  buildBotPowersSelfPromptV1,
  buildCoffeePowersPromptBlock,
  coffeePowerCupRateMultiplierV1,
  estimateCoffeePowerTokensV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowersV1,
  parseStoredBotPowersV1,
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
      intent: "x".repeat(500),
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }))
  );
  assert.equal(powers.length, BOT_POWER_MAX_COUNT);
  assert.equal(powers[0]?.intent.length, 300);
});

test("stale compiled power data retains intent but returns to draft", () => {
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
  assert.equal(powers[0]?.compiled, null);
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
    /do not know the standing conversation topic unless that message states it/iu,
  );
  assert.match(
    botPowerObserverCueLinesV1(name, powers).join("\n"),
    /does not retain the standing conversation topic unless that message restates it/iu,
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
      "Hello. I'm Forgetful Freddie. Everyone seems oddly tense.",
      name,
    ),
    true,
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I'm Forgetful Freddie again, as I said earlier.",
      name,
      "Why do you keep repeating yourself?",
    ),
    "What do you mean? I don't think we've met yet.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "Hello—I'm Forgetful Freddie. It's nice to meet you.",
      name,
      "Goddammit",
    ),
    "What's the matter? Sorry, I'm not sure what's wrong.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I seem to have introduced myself a few times already.",
      name,
      "Why do you keep introducing yourself?",
    ),
    "What do you mean? I don't think we've met yet.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I seem to have done that again.",
      name,
      "Why do you keep introducing yourself?",
    ),
    "What do you mean? I don't think we've met yet.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I'm sorry, I didn't mean to repeat myself.",
      name,
      "Why do you keep introducing yourself?",
    ),
    "What do you mean? I don't think we've met yet.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I didn't realize it was getting repetitive. I don't seem to remember who everyone is from one conversation to the next.",
      name,
      "Why do you keep introducing yourself?",
    ),
    "What do you mean? I don't think we've met yet.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "I just seem to be doing that a lot lately, and I don't know why.",
      name,
      "Why do you keep introducing yourself?",
    ),
    "What do you mean? I don't think we've met yet.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "The archive key is under the blue case.",
      name,
      "Where is the archive key?",
    ),
    "The archive key is under the blue case.",
  );
  assert.equal(
    applyBotPowerEternalIntroductionResponseV1(
      "We've known each other for years.",
      name,
      "Do you remember me?",
    ),
    "I'm sorry, but I don't think we've met before.",
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
  const intended = "*frowns slightly* [Mira](prism-bot://bot-mira), I explained the rational plan clearly.";
  const first = applyBotPowerMumbledResponseV1(intended);
  const second = applyBotPowerMumbledResponseV1(intended);

  assert.equal(botPowerMumblesSpeechV1(powers), true);
  assert.equal(first, second);
  assert.match(first, /^\*frowns slightly\* /u);
  assert.doesNotMatch(first, /Mira|explained|rational|plan|clearly|prism-bot/iu);
  assert.equal(botPowerVoiceGainMultiplierV1(powers), 1);
  assert.equal(botPowerTextScaleV1(powers), 1);
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
  assert.equal(botPowerAvatarScaleModeV1(powers), "smaller");
  assert.equal(botPowerAvatarVisibilityModeV1(powers), "speaking_only");
  assert.equal(botPowerHasSpeakingOnlyAvatarVisibilityV1(powers), true);
});

test("quiet turns use one replay-stable half chance and retain their mood penalty", () => {
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
  assert.deepEqual(botPowerIntermittentMuteEffectV1(powers), {
    type: "intermittent_mute",
    chance: "half",
    moodPenalty: "small",
  });
  assert.equal(
    botPowerIntermittentMuteTurnIsIgnoredV1(powers, "saved-turn-7"),
    botPowerIntermittentMuteTurnIsIgnoredV1(powers, "saved-turn-7"),
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
  assert.equal(botPowerCandorTriggerV1("Mara shared a careful opinion."), false);
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
  assert.equal(botPowerIsMutedV1([{ ...legacyPowers[0], enabled: false }]), false);
  assert.equal(
    botPowerDefinitionIsExplicitMuteV1(
      "Muted Palette",
      "Creates muted colors around the room.",
    ),
    false,
  );
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
  assert.equal(applyBotPowerEchoResponseV1(""), "...");
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
  assert.equal(botPowerAvatarVisibilityModeV1(legacyPower("Invisible")), "translucent");
  assert.match(
    legacyPower("Microscopic")[0]?.compiled?.selfCue ?? "",
    /at any time/u,
  );
});

test("targeted legacy Invisible snapshots gain spectral presentation idempotently", () => {
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
  assert.equal(botPowerAvatarVisibilityModeV1(upgraded), "translucent");
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
      spectral: true,
    },
  );
  assert.deepEqual(
    botPowerObserverProjectionV1(spectral, "replay", lincolnMatches),
    {
      version: 1,
      perspective: "replay",
      visibility: "translucent",
      audible: true,
      spectral: true,
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
});

test("avatar scale effects normalize safely and smaller wins without stacking", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_scale", mode: "larger" }),
    { type: "avatar_scale", mode: "larger" },
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({ type: "avatar_scale", mode: "smaller" }),
    { type: "avatar_scale", mode: "smaller" },
  );
  assert.equal(
    normalizeBotPowerEffectV1({ type: "avatar_scale", mode: "enormous" }),
    null,
  );
  assert.equal(
    botPowerAvatarScaleModeFromEffectsV1([
      { type: "avatar_scale", mode: "larger" },
      { type: "avatar_scale", mode: "smaller" },
    ]),
    "smaller",
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
      effects: [{ type: "avatar_scale" as const, mode: "larger" as const }],
      ruleLabels: ["Larger avatar"],
    },
  };
  assert.equal(botPowerAvatarScaleModeV1([readyPower]), "larger");
  assert.equal(
    botPowerAvatarScaleModeV1([{ ...readyPower, enabled: false }]),
    null,
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
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "theodore"), 0);
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "slowpoke"), 0.55);
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "other"), 1);
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

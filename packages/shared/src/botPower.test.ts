import assert from "node:assert/strict";
import test from "node:test";
import {
  COFFEE_POWER_PROMPT_MAX_TOKENS,
  BOT_POWER_CANONICAL_SILENCE_V1,
  BOT_POWER_MAX_COUNT,
  activeBotPowerEffectsV1,
  applyBotPowerEchoResponseV1,
  applyBotPowerMuteResponseV1,
  applyBotPowerResponseBudgetV1,
  botPowerAvatarScaleModeFromEffectsV1,
  botPowerAvatarScaleModeV1,
  botPowerDeterministicHalfChanceV1,
  botPowerCupRateMultiplierForBotV1,
  botPowerCandorTriggerV1,
  botPowerCandorResponseRuleV1,
  botPowerDefinitionIsExplicitInterruptionV1,
  botPowerDefinitionIsExplicitMuteV1,
  botPowerEchoesAddressedSpeechV1,
  botPowerHasSpeakingOnlyAvatarVisibilityV1,
  botPowerIntermittentMuteEffectV1,
  botPowerIntermittentMuteTurnIsIgnoredV1,
  botPowerIsMutedV1,
  botPowerObserverCueLinesV1,
  botPowerResponseIsSilentV1,
  botPowerSourceHashV1,
  botPowerTextScaleV1,
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
  strongestBotPowerInterruptionEffectV1,
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

test("loud voice presence overrides smaller and speaking-only invisible presentation", () => {
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
  assert.equal(botPowerAvatarScaleModeV1(powers), null);
  assert.equal(botPowerHasSpeakingOnlyAvatarVisibilityV1(powers), false);
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
      effects: [{ type: "echo_addressed", ignored: true }],
      ruleLabels: ["Echoes addressed speech"],
    },
  }];

  assert.deepEqual(normalizeBotPowerEffectV1({ type: "echo_addressed", ignored: true }), {
    type: "echo_addressed",
  });
  assert.equal(botPowerEchoesAddressedSpeechV1(powers), true);
  assert.equal(applyBotPowerEchoResponseV1("  Keep  every\ncharacter?!  "), "  Keep  every\ncharacter?!  ");
  assert.equal(applyBotPowerEchoResponseV1(""), "...");
});

test("interruption Powers normalize and recover legacy turn-pressure contracts", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "interruption",
      frequency: "frequent",
      strength: "large",
      targets: [{ kind: "all" }, { kind: "all" }],
    }),
    {
      type: "interruption",
      frequency: "frequent",
      strength: "large",
      targets: [{ kind: "all" }],
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

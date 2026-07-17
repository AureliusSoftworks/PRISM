import assert from "node:assert/strict";
import test from "node:test";
import {
  COFFEE_POWER_PROMPT_MAX_TOKENS,
  BOT_POWER_MAX_COUNT,
  botPowerCupRateMultiplierForBotV1,
  botPowerObserverCueLinesV1,
  botPowerSourceHashV1,
  buildBotPowersSelfPromptV1,
  buildCoffeePowersPromptBlock,
  coffeePowerCupRateMultiplierV1,
  estimateCoffeePowerTokensV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowersV1,
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

test("relationship-agnostic Coffee effects normalize to bounded schemas", () => {
  assert.deepEqual(normalizeBotPowerEffectV1({
    type: "cup_rate",
    rate: "none",
  }), {
    type: "cup_rate",
    rate: "none",
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

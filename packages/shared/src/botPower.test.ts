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
    },
  };
  assert.equal(coffeePowerCupRateMultiplierV1(plan, "voltaire"), 2.5);
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

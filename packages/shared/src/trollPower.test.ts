import assert from "node:assert/strict";
import test from "node:test";

import {
  activeBotPowerEffectsV1,
  botPowerDefinitionIsTrollV1,
  botPowerSelfCueLinesV1,
  botPowerSourceHashV1,
  botPowerTrollAuthoringCueV1,
  buildBotPowersPromptBlock,
  normalizeBotPowerEffectV1,
} from "./botPower.ts";
import { createDefaultPrismMoodState } from "./mood.ts";
import {
  BOT_POWER_TROLL_MEME_CARDS_V1,
  BOT_POWER_TROLL_RICKROLL_MAX_CHARS_V1,
  BOT_POWER_TROLL_RICKROLL_PAYLOAD_V1,
  applyBotPowerTrollTurnV1,
  botPowerTrollDeterministicRollV1,
  lockBotPowerTrollPrismMoodV1,
} from "./trollPower.ts";

const trollPowers = [{
  version: 1,
  id: "troll",
  name: "Troll",
  intent: "Interrupt every other bot and troll them.",
  enabled: true,
  compileStatus: "ready",
  compiled: {
    version: 1,
    sourceHash: botPowerSourceHashV1(
      "Troll",
      "Interrupt every other bot and troll them.",
    ),
    selfCue: "",
    observerCue: "",
    effects: [{ type: "troll" }],
    ruleLabels: [],
  },
}] as const;

function seedWithRoll(prefix: string, upperExclusive: number): string {
  for (let index = 0; index < 20_000; index += 1) {
    const seed = `turn-${index}`;
    if (botPowerTrollDeterministicRollV1(`${prefix}${seed}`) < upperExclusive) {
      return seed;
    }
  }
  throw new Error(`No deterministic Troll seed found for ${prefix}`);
}

test("Troll normalizes to a bounded style and upgrades a legacy Ready Power", () => {
  const name = "Troll";
  const intent = "Interrupt every other bot for any reason and annoy them with lolwut spam.";
  assert.equal(botPowerDefinitionIsTrollV1(name, intent), true);
  assert.deepEqual(normalizeBotPowerEffectV1({ type: "troll", burstLimit: 999 }), {
    type: "troll",
    dialect: "internet_lingo",
    grammar: "deliberately_bad",
    targets: "all_other_bots",
    playerTarget: "zen_only",
    burstLimit: 3,
    noiseCharLimit: 12,
    ordinaryInterruptionImmunity: "shh_and_new_message",
    moodLock: "warm",
    rickrollChancePercent: 3,
    memeChancePercent: 6,
    bodilyActionChancePercent: 8,
  });
  const effects = activeBotPowerEffectsV1([{
    version: 1,
    id: "legacy-troll",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "",
      observerCue: "",
      effects: [],
      ruleLabels: [],
    },
  }]);
  assert.deepEqual(effects, [
    { type: "troll", dialect: "internet_lingo", grammar: "deliberately_bad", targets: "all_other_bots", playerTarget: "zen_only", burstLimit: 3, noiseCharLimit: 12, ordinaryInterruptionImmunity: "shh_and_new_message", moodLock: "warm", rickrollChancePercent: 3, memeChancePercent: 6, bodilyActionChancePercent: 8 },
    { type: "interruption", frequency: "frequent", strength: "large", targets: [{ kind: "all" }], certainty: "always" },
  ]);
  assert.match(botPowerTrollAuthoringCueV1(), /never the player outside Zen/iu);
  assert.match(botPowerTrollAuthoringCueV1(), /literal @Name exactly/u);
  assert.match(botPowerTrollAuthoringCueV1(), /at most 3 tiny beats/iu);
  assert.match(botPowerTrollAuthoringCueV1(), /12 random characters/iu);
  assert.match(botPowerTrollAuthoringCueV1("zen_player"), /pester the player/iu);
  assert.match(botPowerTrollAuthoringCueV1("zen_player"), /accuracy is mandatory/iu);
  assert.match(botPowerTrollAuthoringCueV1("zen_player"), /essential facts/iu);
  assert.match(botPowerTrollAuthoringCueV1("zen_player"), /up to 3 newline beats/iu);
  assert.match(botPowerTrollAuthoringCueV1("zen_player"), /leave Zen/iu);

  const zenPrompt = buildBotPowersPromptBlock(
    botPowerSelfCueLinesV1([{
      version: 1,
      id: "zen-troll",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "",
        observerCue: "",
        effects: [],
        ruleLabels: [],
      },
    }], { trollAudience: "zen_player" }),
  );
  assert.match(zenPrompt, /accuracy is mandatory/iu);
  assert.match(zenPrompt, /essential facts/iu);
  assert.match(zenPrompt, /12 random chars/iu);
  assert.match(zenPrompt, /may redirect or leave Zen/iu);
});

test("Troll rare turns are deterministic, persisted, bounded, and wording-independent", () => {
  assert.match(BOT_POWER_TROLL_RICKROLL_PAYLOAD_V1, /get rickrolled/iu);
  assert.match(BOT_POWER_TROLL_RICKROLL_PAYLOAD_V1, /youtu\.be\/dQw4w9WgXcQ/u);
  const rickrollSeed = seedWithRoll("troll:rickroll:", 3);
  const first = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "ordinary",
    stableTurnKey: rickrollSeed,
    assistantTurnOrdinal: 1,
    rickrollPayload: "user line one\nuser line two",
  });
  assert.notEqual(first.presentation?.deliveryKind, "rickroll");

  const builtInRickroll = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "ordinary",
    stableTurnKey: rickrollSeed,
    assistantTurnOrdinal: 2,
  });
  assert.equal(builtInRickroll.presentation?.deliveryKind, "rickroll");
  assert.ok(builtInRickroll.content.endsWith(BOT_POWER_TROLL_RICKROLL_PAYLOAD_V1));

  const rickroll = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "ordinary",
    stableTurnKey: rickrollSeed,
    assistantTurnOrdinal: 2,
    rickrollPayload: "user line one\nuser line two",
  });
  assert.equal(rickroll.presentation?.deliveryKind, "rickroll");
  assert.match(rickroll.content, /in-fiction musical bait-and-switch/iu);
  assert.ok(rickroll.content.endsWith("user line one\nuser line two"));

  const replaySafe = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "next",
    stableTurnKey: rickrollSeed,
    assistantTurnOrdinal: 3,
    priorPresentations: [rickroll.presentation!],
    rickrollPayload: "different wording",
  });
  assert.notEqual(replaySafe.presentation?.deliveryKind, "rickroll");

  const bounded = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "ordinary",
    stableTurnKey: rickrollSeed,
    assistantTurnOrdinal: 2,
    rickrollPayload: "x".repeat(BOT_POWER_TROLL_RICKROLL_MAX_CHARS_V1 + 500),
  });
  assert.ok(
    bounded.content.length <=
      BOT_POWER_TROLL_RICKROLL_MAX_CHARS_V1 + 80,
  );
});

test("Troll meme and bodily action fallbacks are local, deterministic, and protected", () => {
  const memeSeed = seedWithRoll("troll:meme:", 6);
  const meme = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "ordinary",
    stableTurnKey: memeSeed,
    assistantTurnOrdinal: 2,
  });
  assert.equal(meme.presentation?.deliveryKind, "meme");
  assert.ok(BOT_POWER_TROLL_MEME_CARDS_V1.some((card) => meme.content.includes(card)));
  assert.doesNotMatch(meme.content, /https?:\/\//iu);

  let bodilySeed = "";
  for (let index = 0; index < 20_000; index += 1) {
    const candidate = `body-${index}`;
    if (
      botPowerTrollDeterministicRollV1(`troll:meme:${candidate}`) >= 6 &&
      botPowerTrollDeterministicRollV1(`troll:bodily-action:${candidate}`) < 8
    ) {
      bodilySeed = candidate;
      break;
    }
  }
  assert.ok(bodilySeed);
  const bodily = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "ordinary",
    stableTurnKey: bodilySeed,
    assistantTurnOrdinal: 2,
  });
  assert.match(bodily.content, /\*(?:fart|burp)\*$/u);
  assert.equal((bodily.content.match(/\*(?:fart|burp)\*/gu) ?? []).length, 1);
  const protectedCopy = applyBotPowerTrollTurnV1({
    powers: trollPowers,
    response: "exact authored copy",
    stableTurnKey: bodilySeed,
    assistantTurnOrdinal: 2,
    exactCopy: true,
  });
  assert.equal(protectedCopy.content, "exact authored copy");
});

test("Troll mood lock removes mutable mood residue", () => {
  const mood = {
    ...createDefaultPrismMoodState("zen", "2026-08-22T00:00:00.000Z"),
    moodKey: "strained" as const,
    annoyance: 1,
    ignoreUntil: "2026-08-23T00:00:00.000Z",
  };
  assert.deepEqual(
    lockBotPowerTrollPrismMoodV1(
      trollPowers,
      mood,
      "2026-08-22T01:00:00.000Z",
    ),
    {
      mode: "zen",
      moodKey: "warm",
      confidence: 1,
      annoyance: 0,
      warmth: 0.72,
      engagement: 0.62,
      restraint: 0.68,
      lastUpdatedAt: "2026-08-22T01:00:00.000Z",
      recentDeltas: [],
      frozen: true,
    },
  );
});

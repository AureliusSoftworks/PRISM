import assert from "node:assert/strict";
import test from "node:test";

import { botPowerSourceHashV1 } from "@localai/shared";

import { compileBotPowers } from "../bot-powers.ts";
import { composeBotSystemPrompt } from "../bots.ts";
import { lockCoffeeTrollMoodV1 } from "../coffee.ts";
import { coffeePowerSpeakerPressures } from "../coffee-powers.ts";
import {
  botcastPowerInterruptionCanTargetV1,
  botcastPowerInterruptionPlanV1,
} from "../botcast.ts";
import { debatePowerInterruptionCanTargetV1 } from "../debate.ts";

test("Troll compiles without a model and stays unconditionally eligible in Coffee and Signal", async () => {
  let calls = 0;
  const result = await compileBotPowers({
    provider: {
      name: "local",
      async generateResponse() {
        calls += 1;
        throw new Error("Troll must compile deterministically");
      },
      async embedText() { return []; },
    },
    botName: "Mara",
    powers: [{
      version: 1,
      id: "troll",
      name: "Troll",
      intent: "Interrupt every other bot for any reason. Use ROFL, OMG, lolwut, bad grammar, @mentions, spam bursts, and tailored dad jokes.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 0);
  const effects = result.powers[0]?.compiled?.effects ?? [];
  assert.deepEqual(effects.slice(0, 2), [
    { type: "troll", dialect: "internet_lingo", grammar: "deliberately_bad", targets: "all_other_bots", playerTarget: "zen_only", burstLimit: 3, noiseCharLimit: 12, ordinaryInterruptionImmunity: "shh_and_new_message", moodLock: "warm", rickrollChancePercent: 3, memeChancePercent: 6, bodilyActionChancePercent: 8 },
    { type: "interruption", frequency: "frequent", strength: "large", targets: [{ kind: "all" }], certainty: "always" },
  ]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /never the player outside Zen/iu);

  const zenPrompt = composeBotSystemPrompt(
    "Mara",
    "You are a harmless disruptive comic.",
    false,
    result.powers,
    { surface: "zen" },
  );
  assert.match(zenPrompt ?? "", /pester the player/iu);
  assert.match(zenPrompt ?? "", /accuracy is mandatory/iu);
  assert.match(zenPrompt ?? "", /essential facts/iu);
  assert.doesNotMatch(zenPrompt ?? "", /relentlessly seek harmless annoyance from every other bot/iu);

  const plan = {
    version: 1,
    resolvedAt: "2026-08-22T00:00:00.000Z",
    bots: {
      mara: { botId: "mara", effects, visibleToBotIds: null, speechAudienceBotIds: null },
    },
    warnings: [],
  };
  assert.deepEqual(coffeePowerSpeakerPressures({
    plan: plan as never,
    candidateBotIds: ["mara"],
    lastSpeakerBotId: "socrates",
    contextText: "A completely irrelevant thought.",
  }), [{ botId: "mara", score: 3 }]);
  assert.ok(botcastPowerInterruptionPlanV1({
    episodeId: "episode",
    targetTurnOrdinal: 1,
    powerId: "troll",
    powerName: "Troll",
    frequency: "frequent",
    strength: "large",
    certainty: "always",
    targetTurnsSinceLastInterruption: 0,
  }));
  const targetImmune = [{
    version: 1,
    id: "immune",
    name: "Observant",
    intent: "Other bots' Powers have no effect on me.",
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(
        "Observant",
        "Other bots' Powers have no effect on me.",
      ),
      selfCue: "",
      observerCue: "",
      effects: [{ type: "power_immunity", scope: "holder", targets: "other_bots", awareness: "unnoticed" }],
      ruleLabels: [],
    },
  }];
  assert.equal(botcastPowerInterruptionCanTargetV1(result.powers, targetImmune), true);
  const immunityEffect = targetImmune[0]!.compiled!.effects[0]!;
  assert.equal(
    debatePowerInterruptionCanTargetV1(effects, [immunityEffect]),
    true,
  );
  assert.equal(
    debatePowerInterruptionCanTargetV1(
      effects.filter((effect) => effect.type !== "troll"),
      [immunityEffect],
    ),
    false,
  );
});

test("Coffee freezes only the Troll holder at the warm social baseline", () => {
  const social = lockCoffeeTrollMoodV1(
    {
      version: 1,
      resolvedAt: "2026-08-22T00:00:00.000Z",
      bots: {
        troll: {
          botId: "troll",
          effects: [{ type: "troll" }],
          visibleToBotIds: null,
          speechAudienceBotIds: null,
        },
        peer: {
          botId: "peer",
          effects: [],
          visibleToBotIds: null,
          speechAudienceBotIds: null,
        },
      },
      warnings: [],
    } as never,
    {
      troll: {
        disposition: 0.1,
        valuesFriction: 0.9,
        restraint: 0.2,
        engagement: 0.1,
        leavePressure: 0.8,
      },
      peer: {
        disposition: 0.2,
        valuesFriction: 0.7,
        restraint: 0.3,
        engagement: 0.4,
        leavePressure: 0.6,
      },
    },
  );
  assert.deepEqual(social.troll, {
    disposition: 0.72,
    valuesFriction: 0.25,
    restraint: 0.65,
    engagement: 0.72,
    leavePressure: 0.06,
  });
  assert.deepEqual(social.peer, {
    disposition: 0.2,
    valuesFriction: 0.7,
    restraint: 0.3,
    engagement: 0.4,
    leavePressure: 0.6,
  });
});

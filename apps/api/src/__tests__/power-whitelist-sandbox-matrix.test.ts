/**
 * Automated acceptance matrix for Powers Whitelist Catalog (sandbox smoke).
 * Full live Coffee sit remains manual; these pin the grammar contracts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { compileBotPowers } from "../bot-powers.ts";
import {
  demoteMultiEnlightenedScenePowersV1,
  botPowerSubjectEffectsForObserverFromEffectsV1,
  botPowerInaudibleMissCueV1,
  botPowerIntermittentAudibilityEffectV1,
  botPowerIntermittentAudibilityHolderRuleV1,
  botPowerMuteExemptsPlayerFromEffectsV1,
  botPowerSelfCueLinesV1,
} from "@localai/shared";

const unusedProvider = {
  name: "local" as const,
  async generateResponse() {
    throw new Error("provider should not be needed");
  },
  async embedText() {
    return [];
  },
};

test("sandbox matrix: Craig pierces Simon Mute delivery but not Fibbing soft lies", async () => {
  const craig = await compileBotPowers({
    provider: unusedProvider,
    botName: "Crazy Craig",
    powers: [{
      version: 1,
      id: "e",
      name: "Enlightened",
      intent: "Enlightened stage awareness in PRISM with meta sigil.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  const simon = await compileBotPowers({
    provider: unusedProvider,
    botName: "Silent Simon",
    powers: [{
      version: 1,
      id: "m",
      name: "Mute",
      intent: "Never speaks.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  const phil = await compileBotPowers({
    provider: unusedProvider,
    botName: "Fibbing Phil",
    powers: [{
      version: 1,
      id: "a",
      name: "Anti-Truth",
      intent: "Literally cannot tell the truth; can only tell lies.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  const craigEffects = craig.powers[0]?.compiled?.effects ?? [];
  const projectedMute = botPowerSubjectEffectsForObserverFromEffectsV1(
    simon.powers[0]?.compiled?.effects ?? [],
    craigEffects,
  );
  const projectedLie = botPowerSubjectEffectsForObserverFromEffectsV1(
    phil.powers[0]?.compiled?.effects ?? [],
    craigEffects,
  );
  assert.equal(projectedMute.some((e) => e.type === "mute"), false);
  assert.equal(projectedLie.some((e) => e.type === "anti_truth"), true);
});

test("sandbox matrix: two Enlightened demote; Tina miss cue asks for repeat", async () => {
  const effects = [
    { type: "stage_awareness" as const },
    {
      type: "power_immunity" as const,
      scope: "holder" as const,
      targets: "other_bots" as const,
      awareness: "unnoticed" as const,
    },
    { type: "meta_sigil" as const, kind: "refraction" as const },
  ];
  const demoted = demoteMultiEnlightenedScenePowersV1({ a: effects, b: effects });
  assert.equal(
    [...demoted.values()].every((list) =>
      !list.some((e) => e.type === "stage_awareness")
    ),
    true,
  );
  assert.match(botPowerInaudibleMissCueV1("inaudible_ask_repeat"), /repeat/iu);
});

test("sandbox matrix: a microscopic holder keeps its declared ask-to-repeat miss", async () => {
  // Signal review 12d3d47e: Tiny Tina's Power compiles `inaudible_ask_repeat`,
  // but the resolver short-circuited on the microscopic size mode and handed
  // back a synthesized `too_faint_to_make_out`, so the listener was never told
  // to ask and the ask-to-repeat half of the Power never reached the table.
  const tina = await compileBotPowers({
    provider: unusedProvider,
    botName: "Tiny Tina",
    powers: [{
      version: 1,
      id: "tiny",
      name: "Microscopic",
      intent:
        "Tiny Tina is microscopic: invisible body, faint voice, and after each line other bots have a fifty-fifty chance to miss her and should ask her to repeat.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  const effect = botPowerIntermittentAudibilityEffectV1(tina.powers);
  assert.equal(effect?.missEvent, "inaudible_ask_repeat");
  assert.match(
    botPowerInaudibleMissCueV1(effect?.missEvent),
    /ask them to repeat/iu,
  );

  // The holder's own cue has to describe what listeners do on a miss, and a
  // weaker model acts that half out itself — the review has the host asking
  // her guest to repeat, twice, while he heard her fine. Pin the direction.
  const selfCue = botPowerSelfCueLinesV1(tina.powers).join(" ");
  assert.match(selfCue, /never ask anyone to repeat themselves/iu);
  assert.match(selfCue, /your own hearing is normal/iu);
  assert.doesNotMatch(selfCue, /should ask you to repeat/iu);
});

test("sandbox matrix: audibility direction binds only intermittent-audibility holders", async () => {
  // Paired negative for the rule above: a loud holder is the opposite case and
  // must not inherit a hearing constraint it has no effect for.
  const colossal = await compileBotPowers({
    provider: unusedProvider,
    botName: "Colossal Cal",
    powers: [{
      version: 1,
      id: "big",
      name: "Colossal",
      intent:
        "Colossal Cal is colossal: a screen-filling body and a booming voice too large for the stage.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(botPowerIntermittentAudibilityEffectV1(colossal.powers), null);
  assert.equal(botPowerIntermittentAudibilityHolderRuleV1(colossal.powers), null);
  assert.doesNotMatch(
    botPowerSelfCueLinesV1(colossal.powers).join(" "),
    /audibility direction/iu,
  );
});

test("sandbox matrix: Ryuk Hard Invisibility exempts player and Light id", async () => {
  const ryuk = await compileBotPowers({
    provider: unusedProvider,
    botName: "Ryuk",
    powers: [{
      version: 1,
      id: "h",
      name: "Hard Invisibility",
      intent:
        "Hard Invisibility: Mute + Invisible. Player and Light Yagami (light-yagami) remain exempt.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  const effects = ryuk.powers[0]?.compiled?.effects ?? [];
  assert.equal(effects.some((e) => e.type === "mute"), true);
  assert.equal(effects.some((e) => e.type === "mouth_motion"), true);
  assert.equal(effects.some((e) => e.type === "avatar_visibility"), true);
  assert.equal(botPowerMuteExemptsPlayerFromEffectsV1(effects), true);
  assert.equal(effects.some((e) => e.type === "awareness"), true);
  const audience = effects.find((e) => e.type === "speech_audience");
  assert.ok(audience && audience.type === "speech_audience");
  assert.equal(
    audience.allowed.some((t) => t.kind === "player"),
    true,
  );
  assert.equal(
    audience.allowed.some(
      (t) => t.kind === "bot" && t.botId === "light-yagami",
    ),
    true,
  );
  const awareness = effects.find((e) => e.type === "awareness");
  assert.ok(awareness && awareness.type === "awareness");
  assert.equal(
    awareness.allowed.some((t) => t.kind === "player"),
    true,
  );
});

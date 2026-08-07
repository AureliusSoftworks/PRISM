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
  botPowerMuteExemptsPlayerFromEffectsV1,
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

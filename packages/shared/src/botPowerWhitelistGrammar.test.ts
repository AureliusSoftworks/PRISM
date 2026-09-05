import assert from "node:assert/strict";
import test from "node:test";
import {
  botPowerHasStageAwarenessFromEffectsV1,
  botPowerInaudibleMissCueV1,
  botPowerMouthMotionFromEffectsV1,
  botPowerMetaSigilFromEffectsV1,
  botPowerObserverProjectionFromEffectsV1,
  botPowerPiercesDeliveryFiltersFromEffectsV1,
  botPowerSubjectEffectsForObserverFromEffectsV1,
  demoteMultiEnlightenedScenePowersV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowersV1,
} from "./botPower.ts";

test("whitelist grammar: Enlightened pierces delivery but keeps soft Anti-truth", () => {
  const observer = [
    { type: "stage_awareness" as const },
    {
      type: "power_immunity" as const,
      scope: "holder" as const,
      targets: "other_bots" as const,
      awareness: "unnoticed" as const,
    },
    { type: "meta_sigil" as const, kind: "refraction" as const },
  ];
  const subject = [
    { type: "mute" as const },
    { type: "anti_truth" as const, strength: "large" as const },
    { type: "speech_audience" as const, allowed: [] },
  ];
  assert.equal(botPowerPiercesDeliveryFiltersFromEffectsV1(observer), true);
  const projected = botPowerSubjectEffectsForObserverFromEffectsV1(
    subject,
    observer,
  );
  assert.equal(
    projected.some((effect) => effect.type === "mute"),
    false,
  );
  assert.equal(
    projected.some((effect) => effect.type === "anti_truth"),
    true,
  );
});

test("multi-Enlightened demotion strips stage brief and sigil, keeps pierce", () => {
  const craig = [
    { type: "stage_awareness" as const },
    {
      type: "power_immunity" as const,
      scope: "holder" as const,
      targets: "other_bots" as const,
      awareness: "unnoticed" as const,
    },
    { type: "meta_sigil" as const, kind: "refraction" as const },
  ];
  const rick = [...craig];
  const demoted = demoteMultiEnlightenedScenePowersV1({
    craig,
    rick,
  });
  for (const effects of demoted.values()) {
    assert.equal(botPowerHasStageAwarenessFromEffectsV1(effects), false);
    assert.equal(botPowerMetaSigilFromEffectsV1(effects), null);
    assert.equal(botPowerPiercesDeliveryFiltersFromEffectsV1(effects), true);
  }
  const alone = demoteMultiEnlightenedScenePowersV1({ craig });
  assert.equal(
    botPowerHasStageAwarenessFromEffectsV1(alone.get("craig")),
    true,
  );
});

test("mute cosmetics and microscopic miss cue normalize", () => {
  assert.equal(
    botPowerMouthMotionFromEffectsV1([{ type: "mute" }]),
    "sealed",
  );
  assert.match(
    botPowerInaudibleMissCueV1("inaudible_ask_repeat"),
    /ask them to repeat/iu,
  );
  assert.deepEqual(normalizeBotPowerEffectV1({ type: "signal_policy", mode: "destroy" }), {
    type: "signal_policy",
    mode: "destroy",
  });
  assert.deepEqual(normalizeBotPowerEffectV1({ type: "avatar_opacity", opacity: 0.5 }), {
    type: "avatar_opacity",
    opacity: 0.5,
  });
});

test("player whitelist keeps Hard Invisibility audible and translucent to the human", () => {
  const effects = [
    { type: "mute" as const },
    { type: "signal_policy" as const, mode: "destroy" as const },
    { type: "mouth_motion" as const, mode: "sealed" as const },
    { type: "avatar_visibility" as const, mode: "translucent" as const },
    { type: "avatar_opacity" as const, opacity: 0.5 },
    {
      type: "awareness" as const,
      allowed: [{ kind: "player" as const }, { kind: "bot" as const, name: "Light Yagami", botId: "light-yagami" }],
    },
    {
      type: "speech_audience" as const,
      allowed: [{ kind: "player" as const }, { kind: "bot" as const, name: "Light Yagami", botId: "light-yagami" }],
    },
  ];
  const projection = botPowerObserverProjectionFromEffectsV1(
    effects,
    "live",
    () => false,
    { holderSpeaking: true },
  );
  assert.equal(projection.audible, true);
  assert.equal(projection.visibility, "translucent");
  assert.equal(projection.spectral, true);
});

test("spectral Invisible named Power keeps translucent body under normalize", () => {
  const [power] = normalizeBotPowersV1([
    {
      version: 1,
      id: "spectral-spencer",
      name: "Invisible",
      intent:
        "Invisible: Spectral Spencer's body is translucent (about 50% opacity). Player hears.",
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: "test",
        selfCue: "translucent",
        observerCue: "spectral",
        effects: [
          { type: "avatar_visibility", mode: "translucent" },
          { type: "avatar_opacity", opacity: 0.5 },
          { type: "signal_policy", mode: "ignore" },
          { type: "speech_audience", allowed: [{ kind: "player" }] },
        ],
        ruleLabels: ["Translucent body"],
      },
    },
  ]);
  assert.equal(
    power?.compiled?.effects.some(
      (effect) =>
        effect.type === "avatar_visibility" && effect.mode === "translucent",
    ),
    true,
  );
});

test("spectral speech_audience player-only stays audible to the human", () => {
  const projection = botPowerObserverProjectionFromEffectsV1(
    [
      { type: "avatar_visibility" as const, mode: "translucent" as const },
      { type: "avatar_opacity" as const, opacity: 0.5 },
      { type: "signal_policy" as const, mode: "ignore" as const },
      { type: "speech_audience" as const, allowed: [{ kind: "player" as const }] },
    ],
    "live",
    () => false,
    { holderSpeaking: true },
  );
  assert.equal(projection.audible, true);
  assert.equal(projection.visibility, "translucent");
});

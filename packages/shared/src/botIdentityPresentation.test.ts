import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
  botIdentityPresentationColorV1,
  botIdentityPresentationFrameMaterialSeedV1,
  botIdentityPresentationScreenMaterialSeedV1,
  botIdentityPresentationTransitionActiveV1,
  botIdentityPresentationVoicePresetV1,
  resolveBotIdentityPublicPresentationV1,
} from "./botIdentityPresentation.ts";

test("native Identity Mirror fully wins over simultaneous Shapeshifter presentation", () => {
  const base = {
    name: "Confusion Collin",
    personaPrompt: "Collin's knowing identity-game persona.",
    face: {},
    avatarDetails: null,
    glyph: "collin-glyph",
    color: "#ff00aa",
    voicePreset: "warm" as const,
    frameMaterialSeed: "collin-frame",
  };
  const result = resolveBotIdentityPublicPresentationV1({
    base,
    shapeshift: {
      targetBotName: "Squidward",
      targetPersonaPrompt: "Squidward's persona.",
      targetFace: { eyeCharacter: "Q" },
      targetGlyph: "squidward-glyph",
      targetColor: "#00ffaa",
      targetVoicePreset: "formal",
      targetFrameMaterialSeed: "squidward-frame",
    },
    mirror: {
      targetBotName: "Trollin' Terry",
      targetFace: { eyeCharacter: "T" },
      targetGlyph: "terry-glyph",
    },
  });

  assert.equal(result.name, "Trollin' Terry");
  assert.equal(result.personaPrompt, base.personaPrompt);
  assert.equal(result.color, base.color);
  assert.equal(result.voicePreset, base.voicePreset);
  assert.equal(result.frameMaterialSeed, base.frameMaterialSeed);
  assert.equal(result.glyph, "terry-glyph");
  assert.equal(result.face.eyeCharacter, "T");
});

test("borrowed identity presentation canonicalizes color, chassis, and frame", () => {
  assert.equal(botIdentityPresentationColorV1("#665a7a"), "#5000d4");
  assert.equal(
    botIdentityPresentationVoicePresetV1(
      '<<<PRISM_BOT_META>>>\n{"v":2,"core":{"communicationStyle":"reflective"}}\n<<<END_PRISM_BOT_META>>>',
    ),
    "reflective",
  );
  assert.equal(
    botIdentityPresentationFrameMaterialSeedV1({
      targetBotId: "mara",
      exportHash: "0123456789ABCDEF0123456789ABCDEF",
    }),
    "bot-frame-material:export:0123456789abcdef0123456789abcdef",
  );
  assert.equal(
    botIdentityPresentationScreenMaterialSeedV1({
      targetBotId: "mara",
      exportHash: "0123456789ABCDEF0123456789ABCDEF",
    }),
    "bot-screen-material:export:0123456789abcdef0123456789abcdef",
  );
});

test("the persisted transition neither starts before its event nor extends on rerender", () => {
  const occurredAt = "2026-08-12T07:00:00.000Z";
  const atMs = Date.parse(occurredAt);
  const state = { occurredAt };
  assert.equal(botIdentityPresentationTransitionActiveV1(state, atMs - 1), false);
  assert.equal(botIdentityPresentationTransitionActiveV1(state, atMs), true);
  assert.equal(
    botIdentityPresentationTransitionActiveV1(
      state,
      atMs + BOT_IDENTITY_PRESENTATION_TRANSITION_MS - 1,
    ),
    true,
  );
  assert.equal(
    botIdentityPresentationTransitionActiveV1(
      state,
      atMs + BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
    ),
    false,
  );
  assert.equal(
    botIdentityPresentationTransitionActiveV1(
      state,
      atMs + BOT_IDENTITY_PRESENTATION_TRANSITION_MS + 10_000,
    ),
    false,
    "reloads and ordinary rerenders cannot revive an old form change",
  );
});

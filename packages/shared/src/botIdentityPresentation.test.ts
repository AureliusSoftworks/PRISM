import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
  botIdentityPresentationColorV1,
  botIdentityPresentationFrameMaterialSeedV1,
  botIdentityPresentationScreenMaterialSeedV1,
  botIdentityPresentationTransitionActiveV1,
  botIdentityPresentationVoicePresetV1,
} from "./botIdentityPresentation.ts";

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

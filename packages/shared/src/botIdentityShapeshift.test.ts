import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS,
  applyBotIdentityShapeshiftResponseV1,
  botIdentityShapeshiftHolderPromptV1,
  botIdentityShapeshiftTargetChangesV1,
  botIdentityShapeshiftTransitionActiveV1,
  createBotIdentityShapeshiftStateV1,
  normalizeBotIdentityShapeshiftStateV1,
  pickBotIdentityShapeshiftCandidateIndexV1,
} from "./botIdentityShapeshift.ts";
import {
  botPowerShapeshiftsIdentityV1,
  botPowerSourceHashV1,
  normalizeBotPowerEffectV1,
} from "./botPower.ts";

const occurredAt = "2026-07-25T20:00:00.000Z";

function shapeshiftState() {
  return createBotIdentityShapeshiftStateV1({
    surface: "coffee",
    holderBotId: "sam",
    holderBotName: "Shapeshifter Sam",
    targetBotId: "mara",
    targetBotName: "Mara Vale",
    targetSource: "library",
    targetPersonaPrompt: "A terse lunar cartographer who speaks in bearings.",
    targetFace: { faceEyeCharacter: "◉", faceMouthCharacter: "_" },
    targetAvatarDetails: null,
    targetVoice: { v: 2, enabled: true, baseVoiceId: "voice-4", pitch: 0.2 },
    sourceMessageId: "message-1",
    occurredAt,
  });
}

test("identity shapeshift effect normalizes to the sticky library/marketplace contract", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "identity_shapeshift",
      pool: "anything",
      continuity: "nope",
    }),
    {
      type: "identity_shapeshift",
      pool: "library_or_marketplace",
      continuity: "session_sticky_until_amnesia",
    },
  );
  const intent = "take on the form of a different library bot";
  assert.equal(
    botPowerShapeshiftsIdentityV1([
      {
        version: 1,
        id: "p1",
        name: "Shapeshifter",
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1("Shapeshifter", intent),
          selfCue: "shift",
          observerCue: "shifted",
          effects: [
            {
              type: "identity_shapeshift",
              pool: "library_or_marketplace",
              continuity: "session_sticky_until_amnesia",
            },
          ],
          ruleLabels: [],
        },
      },
    ]),
    true,
  );
});

test("identity shapeshift snapshot stays public-form only and sticky until target changes", () => {
  const state = shapeshiftState();
  assert.equal(normalizeBotIdentityShapeshiftStateV1(state)?.targetBotName, "Mara Vale");
  assert.equal(botIdentityShapeshiftTargetChangesV1(state, "mara"), false);
  assert.equal(botIdentityShapeshiftTargetChangesV1(state, "sol"), true);
  assert.match(
    botIdentityShapeshiftHolderPromptV1({
      holderName: "Shapeshifter Sam",
      roleLabel: "Coffee seat",
      state,
      identityJustChanged: true,
    }),
    /Hard shapeshift rule:[\s\S]*Mara Vale/u,
  );
});

test("identity shapeshift response rewrite claims the borrowed form once", () => {
  const state = shapeshiftState();
  const first = applyBotIdentityShapeshiftResponseV1(
    "Hello there from the table.",
    state,
    true,
  );
  assert.match(first, /^I am Mara Vale\./u);
  const later = applyBotIdentityShapeshiftResponseV1(
    "I am Mara Vale. Bearing north looks clear.",
    state,
    false,
  );
  assert.equal(later, "Bearing north looks clear.");
  const rewritten = applyBotIdentityShapeshiftResponseV1(
    "I am Shapeshifter Sam and ready.",
    state,
    false,
  );
  assert.match(rewritten, /I am Mara Vale/u);
});

test("identity shapeshift transition window and deterministic pick stay bounded", () => {
  const state = shapeshiftState();
  const at = Date.parse(occurredAt);
  assert.equal(botIdentityShapeshiftTransitionActiveV1(state, at + 10), true);
  assert.equal(
    botIdentityShapeshiftTransitionActiveV1(
      state,
      at + BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS + 1,
    ),
    false,
  );
  assert.equal(pickBotIdentityShapeshiftCandidateIndexV1("seed-a", 5), pickBotIdentityShapeshiftCandidateIndexV1("seed-a", 5));
  assert.notEqual(
    pickBotIdentityShapeshiftCandidateIndexV1("seed-a", 5),
    pickBotIdentityShapeshiftCandidateIndexV1("seed-b", 5),
  );
  assert.equal(pickBotIdentityShapeshiftCandidateIndexV1("seed", 0), -1);
});

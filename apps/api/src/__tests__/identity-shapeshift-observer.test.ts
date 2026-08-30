import assert from "node:assert/strict";
import test from "node:test";

import { createBotIdentityShapeshiftStateV1 } from "@localai/shared";

import { botcastIdentityShapeshiftPromptV1 } from "../botcast.ts";
import { coffeeIdentityShapeshiftPromptForSpeaker } from "../coffee.ts";

const state = createBotIdentityShapeshiftStateV1({
  surface: "coffee",
  holderBotId: "shannon",
  holderBotName: "Shapeshifter Shannon",
  targetBotId: "mara",
  targetBotName: "Mara Vale",
  targetSource: "library",
  targetPersonaPrompt: "A measured cartographer.",
  targetFace: { faceEyeCharacter: "◉" },
  targetVoice: { v: 2, enabled: true, baseVoiceId: "voice-4" },
  sourceMessageId: "shannon-shifts",
  occurredAt: "2026-08-30T20:00:00.000Z",
});

test("Coffee gives only active Shapeshifter observers the optional voice-mismatch cue", () => {
  assert.equal(
    coffeeIdentityShapeshiftPromptForSpeaker({
      history: [],
      speaker: { id: "observer", name: "Observer" },
    }),
    "",
  );
  const active = coffeeIdentityShapeshiftPromptForSpeaker({
    history: [],
    speaker: { id: "observer", name: "Observer" },
    activeHolderState: state,
  });
  assert.match(active, /never by obligation or on every turn/iu);
  assert.match(active, /voice still does not sound like "Mara Vale"/iu);
  assert.doesNotMatch(
    coffeeIdentityShapeshiftPromptForSpeaker({
      history: [],
      speaker: { id: state.holderBotId, name: state.holderBotName },
      activeHolderState: state,
    }),
    /voice still does not sound/iu,
  );
});

test("Signal gives only active Shapeshifter observers the optional voice-mismatch cue", () => {
  assert.equal(
    botcastIdentityShapeshiftPromptV1({
      events: [],
      speaker: { id: "observer", name: "Observer" },
      speakerRole: "guest",
    }),
    "",
  );
  const active = botcastIdentityShapeshiftPromptV1({
    events: [],
    speaker: { id: "observer", name: "Observer" },
    speakerRole: "guest",
    activeHolderState: { ...state, surface: "signal" },
  });
  assert.match(active, /never by obligation or on every turn/iu);
  assert.match(active, /voice still does not sound like "Mara Vale"/iu);
  assert.doesNotMatch(
    botcastIdentityShapeshiftPromptV1({
      events: [],
      speaker: { id: state.holderBotId, name: state.holderBotName },
      speakerRole: "guest",
      activeHolderState: { ...state, surface: "signal" },
    }),
    /voice still does not sound/iu,
  );
});

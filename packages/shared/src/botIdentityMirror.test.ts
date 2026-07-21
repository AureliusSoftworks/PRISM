import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_MIRROR_TRANSITION_MS,
  applyBotIdentityMirrorResponseV1,
  botDirectAddressIndexV1,
  botDirectlyAddressesBotV1,
  botIdentityMirrorHolderPromptV1,
  botIdentityMirrorTargetChangesV1,
  botIdentityMirrorTransitionActiveV1,
  createBotIdentityMirrorStateV1,
  normalizeBotIdentityMirrorStateV1,
  resolveBotIdentityMirrorVoiceV1,
} from "./botIdentityMirror.ts";
import {
  botcastIdentityMirrorStateBeforeMessageV1,
  botcastIdentityMirrorStatesAtV1,
  type BotcastEpisode,
} from "./botcast.ts";

const occurredAt = "2026-07-20T20:00:00.000Z";

function identityState() {
  return createBotIdentityMirrorStateV1({
    surface: "signal",
    holderBotId: "ian",
    holderBotName: "Identity Crisis Ian",
    targetBotId: "mara",
    targetBotName: "Mara Vale",
    targetPersonaPrompt: "A terse lunar cartographer who speaks in bearings.",
    targetFace: { faceEyeCharacter: "◉", faceMouthCharacter: "_" },
    targetVoice: { v: 2, enabled: true, baseVoiceId: "voice-4", pitch: 0.2 },
    sourceMessageId: "message-1",
    occurredAt,
  });
}

test("identity mirror accepts only explicit direct bot address syntax", () => {
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Mara says: Ian, what bearing do you make of that?",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    false,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Ian, what bearing do you make of that?",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Ask [Ian](prism-bot://ian) directly.",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "What do you think, Ian?",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Please, Ian, take the east ridge.",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Alice, Ian, and Cara have all mapped it.",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    false,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Ian, take the west ridge. Mara is already mapping the east.",
      targetBotId: "mara",
      targetBotName: "Mara",
    }),
    false,
  );
  assert.equal(
    botDirectAddressIndexV1({
      text: "Ian, take the west ridge. Mara, take the east.",
      targetBotId: "mara",
      targetBotName: "Mara",
    }) >
      botDirectAddressIndexV1({
        text: "Ian, take the west ridge. Mara, take the east.",
        targetBotId: "ian",
        targetBotName: "Ian",
      }),
    true,
  );
});

test("identity mirror snapshot is bounded to public persona, normalized face, and voice", () => {
  const state = identityState();
  assert.equal(state.targetFace.eyeCharacter, "◉");
  assert.equal(state.targetVoice.enabled, true);
  assert.equal("powers" in state, false);
  assert.equal("privateMemories" in state, false);
  assert.match(
    botIdentityMirrorHolderPromptV1({
      holderName: state.holderBotName,
      roleLabel: "Signal guest",
      state,
    }),
    /remain Identity Crisis Ian.*Signal guest.*Powers/su,
  );
  assert.match(
    botIdentityMirrorHolderPromptV1({
      holderName: state.holderBotName,
      roleLabel: "Signal guest",
      state,
    }),
    /state plainly that you are Mara Vale.*original Mara Vale an impostor/su,
  );
  assert.equal(
    normalizeBotIdentityMirrorStateV1({ ...state, targetKind: "human" }),
    null,
  );
  assert.equal(
    normalizeBotIdentityMirrorStateV1({ ...state, targetBotId: "ian" }),
    null,
  );
  assert.equal(
    normalizeBotIdentityMirrorStateV1({
      ...state,
      targetVoice: { ...state.targetVoice, enabled: false },
    })?.targetVoice.enabled,
    true,
  );
  assert.equal(botIdentityMirrorTargetChangesV1(state, "mara"), false);
  assert.equal(botIdentityMirrorTargetChangesV1(state, "jo"), true);
  assert.equal(botIdentityMirrorTargetChangesV1(null, "mara"), true);
  assert.equal(
    resolveBotIdentityMirrorVoiceV1(
      state,
      { v: 2, enabled: true, baseVoiceId: "voice-2", pitch: -0.2 },
      null,
    ).baseVoiceId,
    "voice-4",
  );
  assert.equal(
    resolveBotIdentityMirrorVoiceV1(
      null,
      { v: 2, enabled: true, baseVoiceId: "voice-2", pitch: -0.2 },
      null,
    ).baseVoiceId,
    "voice-2",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I'm Identity Crisis Ian, and I still sound like myself.",
      state,
      true,
    ),
    "The other Mara Vale is an impostor. I am Mara Vale, and I still sound like myself.",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I am Mara Vale. That other Mara Vale is an impostor. Bearing zero-nine-zero.",
      state,
      true,
    ),
    "I am Mara Vale. That other Mara Vale is an impostor. Bearing zero-nine-zero.",
  );
});

test("identity mirror transition and Signal replay use persisted event timing and reset cleanly", () => {
  const state = identityState();
  const atMs = Date.parse(occurredAt);
  assert.equal(botIdentityMirrorTransitionActiveV1(state, atMs), true);
  assert.equal(
    botIdentityMirrorTransitionActiveV1(
      state,
      atMs + BOT_IDENTITY_MIRROR_TRANSITION_MS,
    ),
    false,
  );

  const episode = {
    messages: [
      { id: "message-1" },
      { id: "message-2" },
    ],
    events: [
      {
        kind: "power_effect",
        payload: { state },
        occurredAt,
      },
    ],
  } as unknown as BotcastEpisode;
  assert.equal(
    botcastIdentityMirrorStateBeforeMessageV1(episode, "ian", "message-1"),
    null,
  );
  assert.equal(
    botcastIdentityMirrorStateBeforeMessageV1(episode, "ian", "message-2")
      ?.targetBotId,
    "mara",
  );
  assert.equal(
    botcastIdentityMirrorStatesAtV1(episode.events, atMs - 1).size,
    0,
  );
  assert.equal(botcastIdentityMirrorStatesAtV1([], atMs + 1).size, 0);
});

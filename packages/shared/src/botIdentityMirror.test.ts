import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_MIRROR_TRANSITION_MS,
  applyBotIdentityMirrorResponseV1,
  botDirectAddressIndexV1,
  botDirectlyAddressesBotV1,
  botNaturalAddressAliasesV1,
  botIdentityMirrorHolderPromptV1,
  botIdentityMirrorTargetChangesV1,
  botIdentityMirrorTransitionActiveV1,
  createBotIdentityMirrorStateV1,
  normalizeBotIdentityMirrorStateV1,
  resolveBotIdentityMirrorAvatarDetailsV1,
  resolveBotIdentityMirrorVoiceV1,
} from "./botIdentityMirror.ts";
import type { BotAvatarDetailsV1 } from "./botAvatarDetails.ts";
import {
  botcastIdentityMirrorStateBeforeMessageV1,
  botcastIdentityMirrorStatesAtV1,
  normalizeBotcastIdentityMirrorResetV1,
  type BotcastEpisode,
} from "./botcast.ts";

const occurredAt = "2026-07-20T20:00:00.000Z";
const targetAvatarDetails: BotAvatarDetailsV1 = {
  version: 1,
  screen: {
    stamps: [
      { id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 },
    ],
    paintMaskBase64: null,
  },
};

function identityState() {
  return createBotIdentityMirrorStateV1({
    surface: "signal",
    holderBotId: "ian",
    holderBotName: "Identity Crisis Ian",
    targetBotId: "mara",
    targetBotName: "Mara Vale",
    targetPersonaPrompt: "A terse lunar cartographer who speaks in bearings.",
    targetFace: { faceEyeCharacter: "◉", faceMouthCharacter: "_" },
    targetAvatarDetails,
    targetVoice: { v: 2, enabled: true, baseVoiceId: "voice-4", pitch: 0.2 },
    sourceMessageId: "message-1",
    occurredAt,
  });
}

test("identity mirror accepts only explicit direct bot address syntax", () => {
  assert.deepEqual(botNaturalAddressAliasesV1("Identity Crisis Ian"), [
    "Identity",
    "Ian",
  ]);
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Ian, if you strip away the recipe, what actually makes it work?",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "So Ian—straight out of the gate—whose thought am I stealing?",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Well, Ian, which bearing survives the weather?",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    true,
  );
  assert.equal(
    botDirectlyAddressesBotV1({
      text: "Mara says: so Ian—straight out of the gate—must choose.",
      targetBotId: "ian",
      targetBotName: "Ian",
    }),
    false,
  );
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

test("identity mirror snapshot is bounded to public persona, face, ink, and voice", () => {
  const state = identityState();
  assert.equal(state.targetFace.eyeCharacter, "◉");
  assert.deepEqual(state.targetAvatarDetails, targetAvatarDetails);
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
    /Announce the conviction exactly once.*state plainly that you are Mara Vale.*original Mara Vale an impostor.*every later response, do not restate either claim/su,
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
      targetAvatarDetails: { raw: "not a portable avatar recipe" },
    })?.targetAvatarDetails,
    null,
  );
  assert.equal(
    normalizeBotIdentityMirrorStateV1({
      ...state,
      targetVoice: { ...state.targetVoice, enabled: false },
    })?.targetVoice.enabled,
    true,
  );
  const holderAvatarDetails: BotAvatarDetailsV1 = {
    version: 1,
    screen: {
      stamps: [
        { id: "freckles", offsetX: 0, offsetY: 0, scalePct: 100 },
      ],
      paintMaskBase64: null,
    },
  };
  assert.deepEqual(
    resolveBotIdentityMirrorAvatarDetailsV1(
      state,
      holderAvatarDetails,
      true,
    ),
    targetAvatarDetails,
  );
  assert.deepEqual(
    resolveBotIdentityMirrorAvatarDetailsV1(
      state,
      holderAvatarDetails,
      false,
    ),
    holderAvatarDetails,
  );
  const { targetAvatarDetails: _legacyInk, ...legacyState } = state;
  assert.deepEqual(
    resolveBotIdentityMirrorAvatarDetailsV1(
      legacyState,
      holderAvatarDetails,
      true,
    ),
    holderAvatarDetails,
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
    resolveBotIdentityMirrorVoiceV1(
      null,
      JSON.stringify({
        v: 2,
        enabled: true,
        baseVoiceId: "voice-4",
        pitch: 0.2,
      }),
      null,
    ).baseVoiceId,
    "voice-4",
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
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I am Mara Vale; the original Mara Vale is an impostor. What cost does that bearing impose?",
      state,
      false,
    ),
    "What cost does that bearing impose?",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "The measure is clear. I am Mara Vale, and the original is an impostor—what maxim should we carry away?",
      state,
      false,
    ),
    "The measure is clear. What maxim should we carry away?",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "Pleased to meet you; I am Mara Vale, and the original Mara Vale is an impostor. Which authorized witness would validate the enrollment?",
      state,
      false,
    ),
    "Which authorized witness would validate the enrollment?",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I am Mara Vale; the so-called original is an impostor.",
      state,
      false,
    ),
    "Let us continue.",
  );
});

test("identity mirror transition and Signal replay use persisted event timing and reset cleanly", () => {
  const state = identityState();
  const atMs = Date.parse(occurredAt);
  const resetOccurredAt = new Date(atMs + 1_000).toISOString();
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
      { id: "message-3" },
    ],
    events: [
      {
        sequence: 1,
        kind: "utterance",
        payload: { messageId: "message-1" },
        occurredAt,
      },
      {
        sequence: 2,
        kind: "power_effect",
        payload: { state },
        occurredAt,
      },
      {
        sequence: 3,
        kind: "utterance",
        payload: { messageId: "message-2" },
        occurredAt,
      },
      {
        sequence: 4,
        kind: "power_effect",
        payload: {
          v: 1,
          effect: "identity_mirror_reset",
          holderBotId: "ian",
          reason: "signal_host_closing",
        },
        occurredAt: resetOccurredAt,
      },
      {
        sequence: 5,
        kind: "utterance",
        payload: { messageId: "message-3" },
        occurredAt: resetOccurredAt,
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
    botcastIdentityMirrorStateBeforeMessageV1(episode, "ian", "message-3"),
    null,
  );
  assert.equal(
    botcastIdentityMirrorStatesAtV1(episode.events, atMs - 1).size,
    0,
  );
  assert.equal(botcastIdentityMirrorStatesAtV1(episode.events, atMs).size, 1);
  assert.equal(
    botcastIdentityMirrorStatesAtV1(
      episode.events,
      Date.parse(resetOccurredAt),
    ).size,
    0,
  );
  assert.deepEqual(
    normalizeBotcastIdentityMirrorResetV1(episode.events[3]?.payload),
    {
      v: 1,
      effect: "identity_mirror_reset",
      holderBotId: "ian",
      reason: "signal_host_closing",
    },
  );
});

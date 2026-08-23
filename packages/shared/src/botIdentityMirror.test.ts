import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_MIRROR_TRANSITION_MS,
  applyBotIdentityMirrorHolderVoiceEffectV1,
  applyBotIdentityMirrorOriginalCorrectionV1,
  applyBotIdentityMirrorResponseV1,
  botDirectAddressIndexV1,
  botDirectlyAddressesBotV1,
  botNaturalAddressAliasesV1,
  botIdentityMirrorHolderPromptV1,
  botIdentityMirrorObserverPromptV1,
  botIdentityMirrorOriginalCorrectionRequiredV1,
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
    holderVoice: {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-3",
      pitch: -0.05,
      accentDefinitionId: "irish-english",
      pronunciationBase: "en-US",
      speechprintInfluence: "irish-english",
      speechprintStrength: "strong",
      speechprintVariationSeed: "ian-voice",
      elevenLabsEffect: "echo",
      voiceEffectExplicit: true,
    },
    targetGlyph: "lucideMoonStar",
    sourceMessageId: "message-1",
    occurredAt,
  });
}

test("identity mirror snapshots holder voice but ignores legacy target voice and materials", () => {
  const state = normalizeBotIdentityMirrorStateV1(identityState());
  assert.ok(state);
  assert.equal(state.holderVoice?.baseVoiceId, "voice-3");
  assert.equal(state.holderVoice?.accentDefinitionId, "irish-english");
  assert.equal(state.holderVoice?.speechprintVariationSeed, "ian-voice");
  assert.equal(state.holderVoice?.elevenLabsEffect, "echo");
  assert.equal(state.targetGlyph, "lucideMoonStar");
  assert.deepEqual(state.targetAvatarDetails, targetAvatarDetails);

  const normalizedLegacy = normalizeBotIdentityMirrorStateV1({
    ...state,
    targetColor: "#00ffcc",
    targetVoice: { v: 2, enabled: true, baseVoiceId: "voice-4" },
    targetVoicePreset: "reflective",
    targetFrameMaterialSeed:
      "bot-frame-material:export:0123456789abcdef0123456789abcdef",
  });
  assert.ok(normalizedLegacy);
  assert.equal("targetColor" in normalizedLegacy, false);
  assert.equal("targetVoice" in normalizedLegacy, false);
  assert.equal("targetVoicePreset" in normalizedLegacy, false);
  assert.equal("targetFrameMaterialSeed" in normalizedLegacy, false);
  assert.equal(
    normalizedLegacy.targetGlyph,
    "lucideMoonStar",
    "legacy mirror events still borrow the target's lower glyph",
  );
});

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

test("identity mirror snapshot stays public while its prompt permits borrowed Power consequences", () => {
  const state = identityState();
  assert.equal(state.targetFace.eyeCharacter, "◉");
  assert.deepEqual(state.targetAvatarDetails, targetAvatarDetails);
  assert.equal(state.holderVoice?.enabled, true);
  assert.equal("targetVoice" in state, false);
  assert.equal("powers" in state, false);
  assert.equal("privateMemories" in state, false);
  assert.match(
    botIdentityMirrorHolderPromptV1({
      holderName: state.holderBotName,
      roleLabel: "Signal guest",
      state,
    }),
    /remain Identity Crisis Ian.*Signal guest.*Borrowed Powers.*anchored system boundaries/su,
  );
  assert.match(
    botIdentityMirrorHolderPromptV1({
      holderName: state.holderBotName,
      roleLabel: "Signal guest",
      state,
    }),
    /first response after a genuinely new target.*Power-authored believed name.*otherwise Mara Vale.*"impostor" exactly once.*Never use impostor, imposter, pretender, or fake again.*never recant/su,
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
      holderVoice: { ...state.holderVoice, enabled: false },
    })?.holderVoice?.enabled,
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
  const mirroredVoice = resolveBotIdentityMirrorVoiceV1(
    state,
    {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-2",
      pitch: -0.2,
      elevenLabsEffect: "echo",
      voiceEffectExplicit: true,
    },
    null,
  );
  assert.equal(mirroredVoice.baseVoiceId, "voice-3");
  assert.equal(mirroredVoice.pitch, -0.05);
  assert.equal(mirroredVoice.accentDefinitionId, "irish-english");
  assert.equal(mirroredVoice.pronunciationBase, "en-US");
  assert.equal(mirroredVoice.speechprintInfluence, "irish-english");
  assert.equal(
    mirroredVoice.elevenLabsEffect,
    "echo",
    "the persisted holder voice must win on replay",
  );
  assert.equal(
    applyBotIdentityMirrorHolderVoiceEffectV1(
      { v: 2, enabled: true, baseVoiceId: "voice-4" },
      {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-2",
        elevenLabsEffect: "deep-space",
        voiceEffectExplicit: true,
      },
    ).baseVoiceId,
    "voice-2",
  );
  const { holderVoice: _legacyVoice, ...legacyStateWithoutHolderVoice } = state;
  assert.equal(
    resolveBotIdentityMirrorVoiceV1(
      legacyStateWithoutHolderVoice,
      { v: 2, enabled: true, baseVoiceId: "voice-2", pitch: -0.2 },
      null,
    ).baseVoiceId,
    "voice-2",
    "legacy replay events resolve the holder roster instead of the stored target voice",
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
    "I am Mara Vale. The other Mara Vale is an impostor. I still sound like myself.",
  );
  const repeatedReveal = applyBotIdentityMirrorResponseV1(
      "I am Mara Vale. That other Mara Vale is an impostor. Bearing zero-nine-zero.",
      state,
      true,
  );
  assert.equal(
    repeatedReveal,
    "I am Mara Vale. The other Mara Vale is an impostor. Bearing zero-nine-zero.",
  );
  assert.equal(repeatedReveal.match(/\bimpostor\b/giu)?.length, 1);
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I'm Riley Ashford, and Mara Vale is a fake. Bearing zero-nine-zero.",
      state,
      true,
      { believedSelfName: "Riley Ashford" },
    ),
    "I am Riley Ashford. The other Mara Vale is an impostor. Bearing zero-nine-zero.",
  );
  const amnesiacAliasReveal = applyBotIdentityMirrorResponseV1(
    "Hello there — Riley Ashford, and I don't believe we've met, though the room feels familiar. Trust breaks when a correction is ignored.",
    state,
    true,
    { believedSelfName: "Riley Ashford" },
  );
  assert.equal(
    amnesiacAliasReveal,
    "I am Riley Ashford. The other Mara Vale is an impostor. Trust breaks when a correction is ignored.",
  );
  assert.equal(amnesiacAliasReveal.match(/Riley Ashford/gu)?.length, 1);
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
      "I take it back, I'm the impostor. You are the real Mara Vale. Bearing zero-nine-zero still holds.",
      state,
      false,
    ),
    "Bearing zero-nine-zero still holds.",
  );
  assert.doesNotMatch(
    applyBotIdentityMirrorResponseV1(
      "I concede the identity. I'm a fake; Mara can have her name back.",
      state,
      false,
    ),
    /\b(?:impostor|imposter|pretender|fake|concede|take it back)\b/iu,
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "That compass is fake, but the western ridge remains our best route.",
      state,
      false,
    ),
    "That compass is fake, but the western ridge remains our best route.",
  );
});

test("the stolen original corrects only genuine misaddressing and Credulity cannot waive it", () => {
  const state = identityState();
  const originalPrompt = botIdentityMirrorObserverPromptV1({
    observerBotId: state.targetBotId,
    state,
  });
  assert.match(originalPrompt, /Hard Identity Crisis correction invariant/iu);
  assert.match(originalPrompt, /outranks Credulity/iu);
  assert.match(originalPrompt, /otherwise does not derail|do not volunteer/iu);

  const wrongIdentity = botIdentityMirrorOriginalCorrectionRequiredV1({
    state,
    sourceBotId: "ian",
    text: "The other Mara Vale is an impostor. Which ridge should we take?",
  });
  assert.equal(wrongIdentity, true);
  assert.equal(
    applyBotIdentityMirrorOriginalCorrectionV1(
      "Fine, I suppose I'm the impostor. Take the western ridge.",
      state,
      wrongIdentity,
    ),
    "No—I'm Mara Vale. Don't call me that. Take the western ridge.",
  );
  const falseNameCorrection = applyBotIdentityMirrorOriginalCorrectionV1(
    "I'm Sunny; I don't believe we've met. Take the western ridge.",
    state,
    true,
    { believedSelfName: "Sunny" },
  );
  assert.equal(
    falseNameCorrection,
    "Don't call me that. I'm Sunny; I don't believe we've met. Take the western ridge.",
  );
  assert.doesNotMatch(falseNameCorrection, /Mara Vale/iu);
  assert.equal(falseNameCorrection.match(/Sunny/gu)?.length, 1);
  assert.equal(
    botIdentityMirrorOriginalCorrectionRequiredV1({
      state,
      sourceBotId: "ian",
      text: "Mara Vale, which ridge should we take?",
      addressedBotId: "mara",
    }),
    false,
  );
  assert.equal(
    applyBotIdentityMirrorOriginalCorrectionV1(
      "Take the western ridge and correct at the crater wall.",
      state,
      false,
    ),
    "Take the western ridge and correct at the crater wall.",
  );
  assert.equal(
    botIdentityMirrorOriginalCorrectionRequiredV1({
      state,
      sourceBotId: null,
      text: "[Gullible Gullver](prism-bot://mara), answer this.",
    }),
    false,
    "player/human text is never admitted to the bot-authored correction path",
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

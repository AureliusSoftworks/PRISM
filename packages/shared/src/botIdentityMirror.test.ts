import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_MIRROR_TRANSITION_MS,
  applyBotIdentityMirrorHolderVoiceEffectV1,
  applyBotIdentityMirrorFaceV1,
  applyBotIdentityMirrorOriginalCorrectionV1,
  applyBotIdentityMirrorResponseV1,
  botDirectAddressIndexV1,
  botDirectlyAddressesBotV1,
  botNaturalAddressAliasesV1,
  botIdentityMirrorHolderPromptV1,
  botIdentityMirrorObserverPromptV1,
  botIdentityMirrorOriginalCorrectionRequiredV1,
  botIdentityMirrorQuotedTargetNameV1,
  botIdentityMirrorTargetChangesV1,
  botIdentityMirrorTransitionActiveV1,
  createBotIdentityMirrorStateV1,
  normalizeBotIdentityMirrorStateV1,
  resolveBotIdentityMirrorAvatarDetailsV1,
  resolveBotIdentityMirrorFaceV1,
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
const holderPronunciationMapPoint = { x: 0.17, y: 0.73 } as const;
const targetPronunciationMapPoint = { x: 0.83, y: 0.19 } as const;
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
      pronunciationMapPoint: holderPronunciationMapPoint,
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
  assert.deepEqual(
    state.holderVoice?.pronunciationMapPoint,
    holderPronunciationMapPoint,
  );
  assert.equal(state.holderVoice?.speechprintVariationSeed, "ian-voice");
  assert.equal(state.holderVoice?.elevenLabsEffect, "echo");
  assert.equal(state.targetGlyph, "lucideMoonStar");
  assert.deepEqual(state.targetAvatarDetails, targetAvatarDetails);

  const normalizedLegacy = normalizeBotIdentityMirrorStateV1({
    ...state,
    targetColor: "#00ffcc",
    targetVoice: {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      accentDefinitionId: "indian-english",
      pronunciationMapPoint: targetPronunciationMapPoint,
      speechprintInfluence: "indian-english",
      speechprintVariationSeed: "target-voice",
    },
    targetVoicePreset: "reflective",
    targetFrameMaterialSeed:
      "bot-frame-material:export:0123456789abcdef0123456789abcdef",
  });
  assert.ok(normalizedLegacy);
  assert.equal("targetColor" in normalizedLegacy, false);
  assert.equal("targetVoice" in normalizedLegacy, false);
  assert.equal("targetVoicePreset" in normalizedLegacy, false);
  assert.equal("targetFrameMaterialSeed" in normalizedLegacy, false);
  assert.deepEqual(
    normalizedLegacy.holderVoice?.pronunciationMapPoint,
    holderPronunciationMapPoint,
    "normalization must never replace the frozen holder point with a legacy target point",
  );
  assert.equal(
    normalizedLegacy.targetGlyph,
    "lucideMoonStar",
    "legacy mirror events still borrow the target's lower glyph",
  );
});

test("identity mirror replaces only eyes, the complete live mouth package, Ink, and glyph", () => {
  const holderFace = {
    faceEyeCharacter: "+",
    faceEyeCount: 2,
    faceMouthCharacter: "|",
    faceMouthSpeechPoses: ["|", "·", "A", "O"] as const,
    faceMouthScale: 0.7,
    faceFontWeight: 500,
    faceThinkingFrames: ["H", "O", "L", "D"] as const,
    faceThinkingScale: 1.15,
  };
  const targetFace = {
    faceEyeCharacter: "◉",
    faceEyeCount: 1,
    faceEyeScale: 1.25,
    faceBlinkBar: "¦",
    faceMouthCharacter: "w",
    faceMouthSpeechPoses: ["w", "m", "△", "○"] as const,
    faceMouthAnimation: "pulsate",
    faceMouthScale: 1.2,
    faceMouthOffsetY: -0.2,
    faceFontWeight: 775,
    faceThinkingFrames: ["T", "A", "R", "G"] as const,
    faceThinkingScale: 0.8,
  };
  const mirrored = applyBotIdentityMirrorFaceV1(holderFace, targetFace);

  assert.equal(mirrored.eyeCharacter, "◉");
  assert.equal(mirrored.eyeCount, 1);
  assert.equal(mirrored.eyeScale, 1.25);
  assert.equal(mirrored.blinkBar, "¦");
  assert.equal(mirrored.mouthCharacter, "w");
  assert.deepEqual(mirrored.mouthSpeechPoses, ["w", "m", "△", "○"]);
  assert.equal(mirrored.mouthAnimation, "pulsate");
  assert.equal(mirrored.mouthScale, 1.2);
  assert.equal(mirrored.mouthOffsetY, -0.2);
  assert.equal(mirrored.weight, 775);
  assert.deepEqual(mirrored.thinkingFrames, ["H", "O", "L", "D"]);
  assert.equal(mirrored.thinkingScale, 1.15);

  const state = {
    ...identityState(),
    targetFace: mirrored,
  };
  assert.deepEqual(
    resolveBotIdentityMirrorFaceV1(state, holderFace, false),
    applyBotIdentityMirrorFaceV1(holderFace, holderFace),
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

test("identity mirror snapshot stays public and keeps the holder behind a knowing masquerade", () => {
  const state = identityState();
  assert.equal(state.targetFace.eyeCharacter, "◉");
  assert.deepEqual(state.targetAvatarDetails, targetAvatarDetails);
  assert.equal(state.holderVoice?.enabled, true);
  assert.equal("targetVoice" in state, false);
  assert.equal("powers" in state, false);
  assert.equal("privateMemories" in state, false);
  const holderPrompt = botIdentityMirrorHolderPromptV1({
    holderName: state.holderBotName,
    roleLabel: "Signal guest",
    state,
  });
  assert.match(holderPrompt, /knowing public masquerade/iu);
  assert.match(holderPrompt, /current public nameplate, face, authored Ink, and lower glyph/iu);
  assert.match(holderPrompt, /Remain fully Identity Crisis Ian in persona and behavior/iu);
  assert.match(holderPrompt, /Never borrow or imitate Mara Vale's persona or voice/iu);
  assert.match(holderPrompt, /execute Mara Vale's eligible public Power mechanics and consequences/iu);
  assert.match(holderPrompt, /Never copy Identity Crisis recursively/iu);
  assert.match(holderPrompt, /complete frozen voice and Accent Map/iu);
  assert.match(holderPrompt, /private memories, relationship state, and perception permissions/iu);
  assert.doesNotMatch(holderPrompt, /terse lunar cartographer/iu);
  assert.equal(
    botIdentityMirrorQuotedTargetNameV1("  Mara   Vale  "),
    "Mara Vale",
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
  assert.deepEqual(
    mirroredVoice.pronunciationMapPoint,
    holderPronunciationMapPoint,
  );
  assert.equal(mirroredVoice.pronunciationBase, "en-US");
  assert.equal(mirroredVoice.speechprintInfluence, "irish-english");
  assert.equal(
    mirroredVoice.elevenLabsEffect,
    "echo",
    "the persisted holder voice must win on replay",
  );
  const compatibilityVoice = applyBotIdentityMirrorHolderVoiceEffectV1(
    {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      accentDefinitionId: "indian-english",
      pronunciationMapPoint: targetPronunciationMapPoint,
    },
    {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-2",
      accentDefinitionId: "irish-english",
      pronunciationMapPoint: holderPronunciationMapPoint,
      elevenLabsEffect: "deep-space",
      voiceEffectExplicit: true,
    },
  );
  assert.equal(compatibilityVoice.baseVoiceId, "voice-2");
  assert.deepEqual(
    compatibilityVoice.pronunciationMapPoint,
    holderPronunciationMapPoint,
  );
  const { holderVoice: _legacyVoice, ...legacyStateWithoutHolderVoice } = state;
  const legacyStateWithDiscardedTargetVoice = {
    ...legacyStateWithoutHolderVoice,
    targetVoice: {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      accentDefinitionId: "indian-english",
      pronunciationMapPoint: targetPronunciationMapPoint,
    },
  } as typeof legacyStateWithoutHolderVoice;
  assert.equal(
    resolveBotIdentityMirrorVoiceV1(
      legacyStateWithDiscardedTargetVoice,
      {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-2",
        pitch: -0.2,
        accentDefinitionId: "irish-english",
        pronunciationMapPoint: holderPronunciationMapPoint,
        speechprintInfluence: "irish-english",
        speechprintVariationSeed: "legacy-holder",
      },
      null,
    ).baseVoiceId,
    "voice-2",
    "legacy replay events resolve the holder roster instead of the stored target voice",
  );
  const legacyVoice = resolveBotIdentityMirrorVoiceV1(
    legacyStateWithoutHolderVoice,
    {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-2",
      accentDefinitionId: "irish-english",
      pronunciationMapPoint: holderPronunciationMapPoint,
      speechprintInfluence: "irish-english",
      speechprintVariationSeed: "legacy-holder",
    },
    null,
  );
  assert.deepEqual(
    legacyVoice.pronunciationMapPoint,
    holderPronunciationMapPoint,
  );
  assert.equal(legacyVoice.accentDefinitionId, "irish-english");
  assert.equal(legacyVoice.speechprintVariationSeed, "legacy-holder");
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
    "I'm Identity Crisis Ian, and I still sound like myself.",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I'm Mara Vale, obviously. The other Mara Vale is the pretender; now, about that ridge.",
      state,
      true,
    ),
    "I'm Mara Vale, obviously. The other Mara Vale is the pretender; now, about that ridge.",
    "presentation-only recovery never rewrites provider text",
  );
  // Accepted substantive speech survives once the transition reveal has aired.
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "That compass is fake, but the western ridge remains our best route.",
      state,
      false,
    ),
    "That compass is fake, but the western ridge remains our best route.",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "If I'm Ian, I'm Ian all the way—until someone says I'm not.",
      state,
      false,
    ),
    "If I'm Ian, I'm Ian all the way—until someone says I'm not.",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "The stone arch remains our best route.",
      { ...state, holderBotName: "Ivo Stone" },
      false,
    ),
    "The stone arch remains our best route.",
  );
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "If I'm Stone, the stone arch is still our best route.",
      { ...state, holderBotName: "Ivo Stone" },
      false,
    ),
    "If I'm Stone, the stone arch is still our best route.",
  );
  // Presentation-only recovery does not invent or erase identity claims.
  assert.equal(
    applyBotIdentityMirrorResponseV1(
      "I concede I'm the impostor. The western ridge remains our best route.",
      state,
      false,
    ),
    "I concede I'm the impostor. The western ridge remains our best route.",
  );
});

test("identity mirror observers understand the presentation and copied-Power boundary", () => {
  const state = identityState();
  const originalPrompt = botIdentityMirrorObserverPromptV1({
    observerBotId: state.targetBotId,
    state,
  });
  assert.match(originalPrompt, /knowingly wearing your current public nameplate and face/iu);
  assert.match(originalPrompt, /presentation masquerade/iu);
  assert.match(originalPrompt, /copying your eligible public Power mechanics/iu);
  assert.match(originalPrompt, /Do not force an identity dispute/iu);

  const wrongIdentity = botIdentityMirrorOriginalCorrectionRequiredV1({
    state,
    sourceBotId: "ian",
    text: "The other Mara Vale is an impostor. Which ridge should we take?",
  });
  assert.equal(wrongIdentity, false);
  assert.equal(
    applyBotIdentityMirrorOriginalCorrectionV1(
      "Fine, I suppose I'm the impostor. Take the western ridge.",
      state,
      wrongIdentity,
    ),
    "Fine, I suppose I'm the impostor. Take the western ridge.",
  );
  assert.equal(
    applyBotIdentityMirrorOriginalCorrectionV1(
      "Well, bless your heart, I'm Mara Vale, not any impostor. Take the western ridge.",
      state,
      wrongIdentity,
    ),
    "Well, bless your heart, I'm Mara Vale, not any impostor. Take the western ridge.",
    "an organic in-character correction must not receive a canned prefix",
  );
  assert.equal(
    applyBotIdentityMirrorOriginalCorrectionV1(
      "That identity belongs to me; the western ridge still holds.",
      state,
      wrongIdentity,
    ),
    "That identity belongs to me; the western ridge still holds.",
  );
  assert.equal(
    botIdentityMirrorOriginalCorrectionRequiredV1({
      state,
      sourceBotId: "ian",
      text: "Mara Vale, which ridge should we take?",
      addressedBotId: "mara",
    }),
    false,
    "a substantive address without a false identity claim needs no correction",
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

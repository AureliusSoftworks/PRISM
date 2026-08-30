import assert from "node:assert/strict";
import test from "node:test";

import {
  debateIdentityAppearanceBotV1,
  debateIdentityPresentationChangeV1,
  type DebateIdentityPresentationEventV1,
} from "./debateIdentityPresentation.ts";
import {
  DEBATE_SCHEMA_VERSION,
  normalizeBotAudioVoiceProfileV1,
  resolveBotFaceStyle,
  type BotAvatarDetailsV1,
  type DebateBotSnapshotV1,
} from "@localai/shared";

const createdAt = "2026-08-12T08:00:00.000Z";

function event(
  id: string,
  sequence: number,
  speakerBotId: string,
  offsetMs: number,
): DebateIdentityPresentationEventV1 {
  return {
    id,
    sequence,
    speakerBotId,
    createdAt: new Date(Date.parse(createdAt) + offsetMs).toISOString(),
  };
}

function botSnapshot(
  id: string,
  overrides: Partial<DebateBotSnapshotV1> = {},
): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id,
    name: id,
    systemPrompt: `You are ${id}.`,
    role: "advocate",
    sideId: "for",
    color: "#113355",
    glyph: `glyph-${id}`,
    avatarDetails: null,
    voiceProfile: normalizeBotAudioVoiceProfileV1(undefined),
    replayVisualSnapshot: {
      v: 1,
      faceStyle: resolveBotFaceStyle({ faceEyeCharacter: id.slice(0, 1) }),
      avatarDetails: null,
      voicePreset: "neutral",
      screenMaterialSeed: `screen-${id}`,
      frameMaterialSeed: `frame-${id}`,
    },
    powers: [],
    provider: "local",
    model: `model-${id}`,
    revision: `revision-${id}`,
    ...overrides,
  };
}

test("Debate Identity Crisis triggers once for each genuinely new target", () => {
  const events = [
    event("a-1", 1, "target-a", 100),
    event("a-2", 2, "target-a", 200),
    event("b-1", 3, "target-b", 300),
  ];
  const base = {
    sessionId: "debate-1",
    sessionCreatedAt: createdAt,
    holderBotId: "holder",
    participantBotIds: ["holder", "target-a", "target-b"],
    effectTypes: ["identity_mirror"],
  } as const;

  assert.deepEqual(
    debateIdentityPresentationChangeV1({
      ...base,
      targetBotId: "target-a",
      events,
      beforeSequence: 3,
    }),
    {
      effect: "identity_mirror",
      holderBotId: "holder",
      targetBotId: "target-a",
      sourceEventId: "a-1",
      occurredAt: events[0]!.createdAt,
    },
    "a second consecutive turn must not restart the same form",
  );
  assert.equal(
    debateIdentityPresentationChangeV1({
      ...base,
      targetBotId: "target-b",
      events,
    })?.sourceEventId,
    "b-1",
  );
});

test("Debate presentation preserves mirror precedence and a stable shapeshift key", () => {
  const shapeshift = debateIdentityPresentationChangeV1({
    sessionId: "debate-1",
    sessionCreatedAt: createdAt,
    holderBotId: "holder",
    targetBotId: "target-a",
    participantBotIds: ["holder", "target-a"],
    effectTypes: ["identity_shapeshift"],
    events: [],
  });
  assert.equal(shapeshift?.effect, "identity_shapeshift");
  assert.equal(shapeshift?.occurredAt, createdAt);

  const mirrored = debateIdentityPresentationChangeV1({
    sessionId: "debate-1",
    sessionCreatedAt: createdAt,
    holderBotId: "holder",
    targetBotId: "target-a",
    participantBotIds: ["holder", "target-a"],
    effectTypes: ["identity_shapeshift", "identity_mirror"],
    events: [event("mirror", 1, "target-a", 100)],
  });
  assert.equal(mirrored?.effect, "identity_mirror");
  assert.equal(mirrored?.sourceEventId, "mirror");
});

test("Debate mirror borrows only target eyes, complete mouth, Ink, and glyph", () => {
  const holder = botSnapshot("holder", {
    color: "#ff0066",
    voiceProfile: normalizeBotAudioVoiceProfileV1({
      v: 2,
      enabled: true,
      baseVoiceId: "voice-2",
      accentDefinitionId: "irish-english",
      pronunciationMapPoint: { x: 0.17, y: 0.73 },
      pronunciationBase: "en-US",
      speechprintInfluence: "irish-english",
      speechprintStrength: "strong",
      speechprintVariationSeed: "holder-speechprint",
      elevenLabsEffect: "echo",
      voiceEffectExplicit: true,
    }),
    replayVisualSnapshot: {
      ...botSnapshot("holder").replayVisualSnapshot!,
      faceStyle: resolveBotFaceStyle({
        faceEyeCharacter: "+",
        faceMouthCharacter: "|",
        faceMouthSpeechPoses: ["|", "·", "A", "O"],
        faceThinkingFrames: ["H", "O", "L", "D"],
      }),
      voicePreset: "formal",
      screenMaterialSeed: "holder-screen",
      frameMaterialSeed: "holder-frame",
    },
  });
  const targetInk: BotAvatarDetailsV1 = {
    version: 1 as const,
    screen: {
      stamps: [
        { id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 },
      ],
      paintMaskBase64: null,
    },
  };
  const target = botSnapshot("target", {
    name: "Target Persona",
    systemPrompt: "A target persona who speaks in bearings.",
    color: "#00ffcc",
    glyph: "lucideMoonStar",
    avatarDetails: targetInk,
    voiceProfile: normalizeBotAudioVoiceProfileV1({
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      pitch: 0.2,
      accentDefinitionId: "indian-english",
      pronunciationMapPoint: { x: 0.83, y: 0.19 },
      pronunciationBase: "en-GB",
      speechprintInfluence: "indian-english",
      speechprintVariationSeed: "target-speechprint",
      elevenLabsEffect: "robot",
      voiceEffectExplicit: true,
    }),
    replayVisualSnapshot: {
      ...botSnapshot("target").replayVisualSnapshot!,
      faceStyle: resolveBotFaceStyle({
        faceEyeCharacter: "◉",
        faceBlinkBar: "¦",
        faceMouthCharacter: "w",
        faceMouthSpeechPoses: ["w", "m", "△", "○"],
        faceMouthAnimation: "pulsate",
        faceThinkingFrames: ["T", "A", "R", "G"],
      }),
      avatarDetails: targetInk,
      voicePreset: "reflective",
      frameMaterialSeed: "target-frame",
    },
    powers: [
      {
        version: 1,
        id: "target-power",
        name: "Target Power",
        intent: "Target public consequence",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
    ],
  });

  const mirrored = debateIdentityAppearanceBotV1({
    holder,
    target,
    effect: "identity_mirror",
  });
  assert.equal(mirrored.id, holder.id);
  assert.equal(mirrored.role, holder.role);
  assert.equal(mirrored.provider, holder.provider);
  assert.equal(mirrored.color, holder.color);
  assert.equal(mirrored.replayVisualSnapshot?.voicePreset, "formal");
  assert.equal(
    mirrored.replayVisualSnapshot?.frameMaterialSeed,
    "holder-frame",
  );
  assert.equal(mirrored.replayVisualSnapshot?.screenMaterialSeed, "holder-screen");
  assert.equal(mirrored.name, "Target Persona");
  assert.equal(mirrored.systemPrompt, holder.systemPrompt);
  assert.equal(mirrored.glyph, target.glyph);
  assert.deepEqual(mirrored.avatarDetails, targetInk);
  assert.equal(
    mirrored.replayVisualSnapshot?.faceStyle.eyeCharacter,
    "◉",
  );
  assert.equal(mirrored.replayVisualSnapshot?.faceStyle.blinkBar, "¦");
  assert.equal(mirrored.replayVisualSnapshot?.faceStyle.mouthCharacter, "w");
  assert.deepEqual(
    mirrored.replayVisualSnapshot?.faceStyle.mouthSpeechPoses,
    ["w", "m", "△", "○"],
    "live visemes must use the target mouth package, not the holder's bar mouth",
  );
  assert.equal(
    mirrored.replayVisualSnapshot?.faceStyle.mouthAnimation,
    "pulsate",
  );
  assert.deepEqual(
    mirrored.replayVisualSnapshot?.faceStyle.thinkingFrames,
    ["H", "O", "L", "D"],
    "thinking glyphs are not part of Identity Crisis",
  );
  assert.deepEqual(mirrored.replayVisualSnapshot?.avatarDetails, targetInk);
  if (
    mirrored.voiceProfile &&
    "baseVoiceId" in mirrored.voiceProfile &&
    "elevenLabsEffect" in mirrored.voiceProfile
  ) {
    assert.equal(mirrored.voiceProfile.baseVoiceId, "voice-2");
    assert.equal(mirrored.voiceProfile.accentDefinitionId, "irish-english");
    assert.deepEqual(
      mirrored.voiceProfile.pronunciationMapPoint,
      { x: 0.17, y: 0.73 },
    );
    assert.equal(mirrored.voiceProfile.pronunciationBase, "en-US");
    assert.equal(mirrored.voiceProfile.speechprintInfluence, "irish-english");
    assert.equal(mirrored.voiceProfile.speechprintVariationSeed, "holder-speechprint");
    assert.equal(mirrored.voiceProfile.elevenLabsEffect, "echo");
  } else {
    assert.fail("Identity mirror should retain the holder's portable voice profile.");
  }
  assert.deepEqual(mirrored.powers, holder.powers);

  // Shapeshifter takes the target's face, chassis, persona, and Accent Map, but
  // keeps the holder's actual voice and Powers. The holder's
  // authored identity anchors — name, color, glyph — always persist so the
  // chamber can still tell who actually holds the floor. The disguise is
  // carried by the "Appearing as …" label, not by overwriting the speaker.
  const shifted = debateIdentityAppearanceBotV1({
    holder,
    target,
    effect: "identity_shapeshift",
  });
  assert.equal(shifted.id, holder.id, "Shapeshifter keeps the holder's mechanical id");
  assert.equal(shifted.name, holder.name, "Shapeshifter keeps the holder's name");
  assert.equal(shifted.color, holder.color, "Shapeshifter keeps the holder's color");
  assert.equal(shifted.glyph, holder.glyph, "Shapeshifter keeps the holder's glyph");
  assert.equal(shifted.role, holder.role);
  assert.equal(shifted.sideId, holder.sideId);
  assert.equal(shifted.provider, holder.provider);
  assert.equal(shifted.model, holder.model);
  assert.equal(shifted.revision, holder.revision);
  assert.equal(
    shifted.systemPrompt,
    target.systemPrompt,
    "Shapeshifter still wears the target's persona",
  );
  assert.deepEqual(
    shifted.avatarDetails,
    targetInk,
    "Shapeshifter still wears the target's face",
  );
  assert.deepEqual(
    shifted.replayVisualSnapshot?.faceStyle,
    target.replayVisualSnapshot?.faceStyle,
    "Shapeshifter still wears the target's frozen face",
  );
  assert.equal(shifted.replayVisualSnapshot?.frameMaterialSeed, "target-frame");
  assert.equal(
    shifted.replayVisualSnapshot?.voicePreset,
    "formal",
    "Shapeshifter keeps the holder's voice preset",
  );
  if (
    shifted.voiceProfile &&
    "baseVoiceId" in shifted.voiceProfile &&
    "elevenLabsEffect" in shifted.voiceProfile
  ) {
    assert.equal(shifted.voiceProfile.baseVoiceId, "voice-2");
    assert.equal(shifted.voiceProfile.elevenLabsEffect, "echo");
    assert.equal(shifted.voiceProfile.pitch, 0);
    assert.equal(shifted.voiceProfile.accentDefinitionId, "indian-english");
    assert.deepEqual(
      shifted.voiceProfile.pronunciationMapPoint,
      { x: 0.83, y: 0.19 },
    );
    assert.equal(shifted.voiceProfile.pronunciationBase, "en-GB");
    assert.equal(shifted.voiceProfile.speechprintInfluence, "indian-english");
    assert.equal(
      shifted.voiceProfile.speechprintVariationSeed,
      "target-speechprint",
    );
  } else {
    assert.fail("Shapeshifter should retain the holder voice with target Accent Map.");
  }
  assert.deepEqual(shifted.powers, holder.powers);
});

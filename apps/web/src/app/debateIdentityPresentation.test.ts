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

test("Debate mirror borrows target identity while retaining holder materials", () => {
  const holder = botSnapshot("holder", {
    color: "#ff0066",
    voiceProfile: normalizeBotAudioVoiceProfileV1({
      v: 2,
      enabled: true,
      baseVoiceId: "voice-2",
      elevenLabsEffect: "echo",
      voiceEffectExplicit: true,
    }),
    replayVisualSnapshot: {
      ...botSnapshot("holder").replayVisualSnapshot!,
      voicePreset: "formal",
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
      elevenLabsEffect: "robot",
      voiceEffectExplicit: true,
    }),
    replayVisualSnapshot: {
      ...botSnapshot("target").replayVisualSnapshot!,
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
  assert.equal(mirrored.name, target.name);
  assert.equal(mirrored.systemPrompt, target.systemPrompt);
  assert.equal(mirrored.glyph, target.glyph);
  assert.deepEqual(mirrored.avatarDetails, targetInk);
  assert.equal(
    mirrored.replayVisualSnapshot?.faceStyle.eyeCharacter,
    "t",
  );
  assert.deepEqual(mirrored.replayVisualSnapshot?.avatarDetails, targetInk);
  if (
    mirrored.voiceProfile &&
    "baseVoiceId" in mirrored.voiceProfile &&
    "elevenLabsEffect" in mirrored.voiceProfile
  ) {
    assert.equal(mirrored.voiceProfile.baseVoiceId, "voice-4");
    assert.equal(mirrored.voiceProfile.elevenLabsEffect, "echo");
  } else {
    assert.fail("Identity mirror should retain the target's portable voice profile.");
  }
  assert.equal(mirrored.powers[0]?.id, "target-power");

  assert.equal(
    debateIdentityAppearanceBotV1({
      holder,
      target,
      effect: "identity_shapeshift",
    }),
    target,
    "Shapeshifter must continue copying the complete public form",
  );
});

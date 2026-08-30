import assert from "node:assert/strict";
import test from "node:test";
import type {
  BotAvatarDetailsV1,
  DebateBotSnapshotV1,
  DebateMysteryIdentityMirrorTargetSnapshotV1,
  DebateMysteryPublicDialogueEntryV2,
  DebateSessionV1,
  DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import {
  DEBATE_SCHEMA_VERSION,
  normalizeBotAudioVoiceProfileV1,
  resolveBotFaceStyle,
} from "@localai/shared";
import { debateIdentityAppearanceBotV1 } from "./debateIdentityPresentation.ts";
import {
  debateMysteryIdentityMirrorFaceV1,
  debateMysteryIdentityMirrorPresentationsV1,
  debateMysteryIdentityMirrorTargetBotSnapshotV1,
  debateMysteryPublicIdentityNameV1,
} from "./debateMysteryIdentityMirror.ts";

const holder = "holder";
const prosecutor = "prosecutor";
const witness = "witness";

function session(): Pick<DebateSessionV1, "powerPlan"> {
  return {
    powerPlan: {
      bots: {
        [holder]: {
          botId: holder,
          effects: [{
            powerId: "identity-crisis",
            powerName: "Identity Crisis",
            policy: "direct",
            effect: { type: "identity_mirror", trigger: "direct_bot_address" },
          }],
          hardMuted: false,
          visibleToBotIds: null,
          speechAudienceBotIds: null,
          warnings: [],
        },
      },
    },
  } as unknown as Pick<DebateSessionV1, "powerPlan">;
}

function state(
  dialogueHistory: DebateMysteryPublicDialogueEntryV2[],
  snapshots: Record<string, DebateMysteryIdentityMirrorTargetSnapshotV1> = {},
): Pick<
  DebateWhodunnitFormatStateV2,
  | "config"
  | "suspects"
  | "topics"
  | "dialogueHistory"
  | "identityMirrorTargetSnapshots"
> {
  return {
    config: {
      prosecutorBotId: prosecutor,
      rivalDefenseBotId: "defense",
      judgeBotId: "judge",
      jurorBotIds: [],
      playerRole: "participant",
    },
    suspects: [
      { seatId: "holder-seat", botId: holder, name: "Collin" },
      { seatId: "witness-seat", botId: witness, name: "Megan" },
    ],
    topics: [{ nodeId: "talk-holder-seat-alibi", suspectSeatId: "holder-seat" }],
    dialogueHistory,
    identityMirrorTargetSnapshots: snapshots,
  } as Pick<
    DebateWhodunnitFormatStateV2,
    | "config"
    | "suspects"
    | "topics"
    | "dialogueHistory"
    | "identityMirrorTargetSnapshots"
  >;
}

function entry(overrides: Partial<DebateMysteryPublicDialogueEntryV2>): DebateMysteryPublicDialogueEntryV2 {
  return {
    nodeId: "talk-holder-seat-alibi",
    lineId: "line-1",
    visibleText: "Collin, where were you when the lights failed?",
    speakerSeatId: null,
    speakerBotId: prosecutor,
    speakerKind: "bot",
    occurredAt: "2026-08-25T10:00:00.000Z",
    ...overrides,
  };
}

test("Whodunnit Identity Crisis treats the Participant Prosecutor as the embodied player even with bot provenance", () => {
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: state([
      entry({ intendedRecipientSeatId: "holder-seat" }),
      entry({
        lineId: "line-2",
        visibleText: "Collin, answer the question plainly.",
        occurredAt: "2026-08-25T10:00:01.000Z",
        intendedRecipientBotId: holder,
      }),
    ]),
    botNamesById: new Map([[holder, "Collin"], [prosecutor, "Megan"]]),
  });

  assert.deepEqual(presentations.get(holder), {
    holderBotId: holder,
    targetBotId: prosecutor,
    targetKind: "player",
    targetName: "Megan",
    sourceDialogueKey: "talk-holder-seat-alibi:line-1:2026-08-25T10:00:00.000Z",
    occurredAt: "2026-08-25T10:00:00.000Z",
  });
});

test("Whodunnit Identity Crisis supports existing sealed talk nodes without inventing turn-order routing", () => {
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: state([entry({
      intendedRecipientSeatId: undefined,
      visibleText: "Where were you when the lights failed?",
    })]),
    botNamesById: new Map([[holder, "Collin"], [prosecutor, "Megan"]]),
  });

  assert.equal(presentations.get(holder)?.targetBotId, prosecutor);
});

test("court Identity Crisis follows the current direct speaker across persisted exchanges", () => {
  const defense = "defense";
  const savedDialogue = JSON.parse(JSON.stringify([
    entry({ intendedRecipientSeatId: "holder-seat" }),
    entry({
      nodeId: "court-defense-cross",
      lineId: "line-2",
      visibleText: "Collin, answer the defense directly.",
      speakerBotId: defense,
      speakerKind: "bot",
      intendedRecipientSeatId: "holder-seat",
      occurredAt: "2026-08-25T10:00:01.000Z",
    }),
    entry({
      nodeId: "court-witness-followup",
      lineId: "line-3",
      visibleText: "Collin, that version leaves too much out.",
      speakerSeatId: "witness-seat",
      speakerBotId: witness,
      speakerKind: "bot",
      intendedRecipientBotId: holder,
      occurredAt: "2026-08-25T10:00:02.000Z",
    }),
  ])) as DebateMysteryPublicDialogueEntryV2[];
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: state(savedDialogue),
    botNamesById: new Map([
      [holder, "Collin"],
      [prosecutor, "Megan"],
      [defense, "Franziska"],
      [witness, "Miles"],
    ]),
  });

  assert.deepEqual(presentations.get(holder), {
    holderBotId: holder,
    targetBotId: witness,
    targetKind: "bot",
    targetName: "Miles",
    sourceDialogueKey: "court-witness-followup:line-3:2026-08-25T10:00:02.000Z",
    occurredAt: "2026-08-25T10:00:02.000Z",
  });
});

test("Whodunnit copies complete non-default one-eye and two-eye player faces atomically", () => {
  const holderSnapshot: DebateMysteryIdentityMirrorTargetSnapshotV1 = {
    version: 1,
    botId: holder,
    name: "Collin",
    faceStyle: resolveBotFaceStyle({
      faceEyeCharacter: "?",
      faceMouthCharacter: "|",
      faceThinkingFrames: ["I", "?", "I", "!"],
    }),
    avatarDetails: null,
    glyph: "lucideScanFace",
  };
  for (const eyeCount of [1, 2] as const) {
    const targetFace = resolveBotFaceStyle({
      faceEyesFont: eyeCount === 1 ? "formal" : "concise",
      faceEyeCharacter: eyeCount === 1 ? "◉" : "⌁",
      faceEyeCount: eyeCount,
      faceEyeSpacing: eyeCount === 1 ? 0.19 : 0.53,
      faceEyeAnimation: "wobble",
      faceEyeScale: eyeCount === 1 ? 1.31 : 0.83,
      faceEyeOffsetX: eyeCount === 1 ? -0.16 : 0.14,
      faceEyeOffsetY: 0.12,
      faceEyeRotationDeg: eyeCount === 1 ? -21 : 17,
      faceBlinkBar: eyeCount === 1 ? "─" : "¦",
      faceBlinkCount: eyeCount,
      faceBlinkScale: 0.79,
      faceBlinkOffsetX: 0.08,
      faceBlinkOffsetY: -0.11,
      faceBlinkRotationDeg: 13,
      faceMouthFont: "formal",
      faceMouthCharacter: eyeCount === 1 ? "⌣" : "▽",
      faceMouthAnimation: "custom",
      faceMouthSpeechPoses: eyeCount === 1
        ? ["⌣", "·", "◡", "○"]
        : ["▽", "_", "△", "□"],
      faceMouthCoffeePucker: eyeCount === 1,
      faceMouthScale: 1.24,
      faceMouthOffsetX: -0.09,
      faceMouthOffsetY: 0.13,
      faceMouthRotationDeg: -15,
      faceFontWeight: eyeCount === 1 ? 725 : 575,
      faceThinkingFrames: ["T", "A", "R", "G"],
    });
    const targetSnapshot: DebateMysteryIdentityMirrorTargetSnapshotV1 = {
      version: 1,
      botId: prosecutor,
      name: eyeCount === 1 ? "One Eye Player" : "Two Eye Player",
      faceStyle: targetFace,
      avatarDetails: null,
      glyph: "lucideScale",
    };
    const copiedFace = debateMysteryIdentityMirrorFaceV1(
      holderSnapshot,
      JSON.parse(JSON.stringify(targetSnapshot)) as DebateMysteryIdentityMirrorTargetSnapshotV1,
    );
    for (const key of [
      "eyesFont", "eyeCharacter", "eyeCount", "eyeSpacing", "eyeAnimation",
      "eyeScale", "eyeOffsetX", "eyeOffsetY", "eyeRotationDeg", "blinkBar",
      "blinkCount", "blinkScale", "blinkOffsetX", "blinkOffsetY",
      "blinkRotationDeg", "mouthFont", "mouthCharacter", "mouthAnimation",
      "mouthSpeechPoses", "mouthCoffeePucker", "mouthScale", "mouthOffsetX",
      "mouthOffsetY", "mouthRotationDeg", "weight",
    ] as const) {
      assert.deepEqual(copiedFace[key], targetFace[key], `${eyeCount}-eye copied ${key}`);
    }
    assert.deepEqual(copiedFace.thinkingFrames, holderSnapshot.faceStyle.thinkingFrames);
  }
});

test("Whodunnit Identity Crisis freezes an exact player target and quotes the copied name", () => {
  const targetInk: BotAvatarDetailsV1 = {
    version: 1,
    screen: {
      stamps: [{ id: "diagonal-scar", offsetX: 2, offsetY: -3, scalePct: 90 }],
      paintMaskBase64: null,
      speechInkAnimation: "wobble",
    },
  };
  const targetFace = resolveBotFaceStyle({
    faceEyesFont: "concise",
    faceEyeCharacter: "⌁",
    faceEyeCount: 2,
    faceEyeSpacing: 0.47,
    faceEyeAnimation: "wobble",
    faceEyeScale: 1.18,
    faceEyeOffsetX: 0.12,
    faceEyeOffsetY: -0.14,
    faceEyeRotationDeg: 15,
    faceBlinkBar: "¦",
    faceBlinkCount: 1,
    faceBlinkScale: 0.82,
    faceBlinkOffsetX: -0.08,
    faceBlinkOffsetY: 0.11,
    faceBlinkRotationDeg: -9,
    faceMouthFont: "formal",
    faceMouthCharacter: "▽",
    faceMouthAnimation: "custom",
    faceMouthSpeechPoses: ["▽", "·", "△", "○"],
    faceMouthCoffeePucker: false,
    faceMouthScale: 1.22,
    faceMouthOffsetX: -0.07,
    faceMouthOffsetY: 0.09,
    faceMouthRotationDeg: -17,
    faceFontWeight: 775,
    faceThinkingFrames: ["H", "O", "L", "D"],
  });
  const targetSnapshot: DebateMysteryIdentityMirrorTargetSnapshotV1 = {
    version: 1,
    botId: prosecutor,
    name: "Miles Edgeworth",
    faceStyle: targetFace,
    avatarDetails: targetInk,
    glyph: "lucideScale",
  };
  const frozenState = state([
    entry({
      visibleText: "Collin, explain that contradiction.",
      intendedRecipientSeatId: "holder-seat",
      speakerKind: "player",
    }),
  ], { [prosecutor]: targetSnapshot });
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: frozenState,
    botNamesById: new Map([[holder, "Confusion Collin"], [prosecutor, "Changed Library Name"]]),
  });
  assert.deepEqual(presentations.get(holder), {
    holderBotId: holder,
    targetBotId: prosecutor,
    targetKind: "player",
    targetName: "Miles Edgeworth",
    sourceDialogueKey: "talk-holder-seat-alibi:line-1:2026-08-25T10:00:00.000Z",
    occurredAt: "2026-08-25T10:00:00.000Z",
  });
  assert.equal(debateMysteryPublicIdentityNameV1("Miles   Edgeworth"), "The real Miles Edgeworth");

  const holderVoice = normalizeBotAudioVoiceProfileV1({
    v: 2,
    enabled: true,
    baseVoiceId: "voice-28",
    accentDefinitionId: "british-rp",
    pronunciationMapPoint: { x: 0.17, y: 0.73 },
    pronunciationBase: "en-GB",
    speechprintInfluence: "british-rp",
    speechprintStrength: "strong",
    speechprintVariationSeed: "collin-speechprint",
    elevenLabsEffect: "echo",
    voiceEffectExplicit: true,
  });
  const holderFace = resolveBotFaceStyle({
    faceEyeCharacter: "?",
    faceMouthCharacter: "|",
    faceThinkingFrames: ["I", "?", "I", "!"],
  });
  const holderSnapshot: DebateBotSnapshotV1 = {
    version: DEBATE_SCHEMA_VERSION,
    id: holder,
    name: "Confusion Collin",
    systemPrompt: "Collin remains himself.",
    role: "advocate",
    sideId: null,
    color: "#00fde4",
    glyph: "lucideScanFace",
    avatarDetails: null,
    voiceProfile: holderVoice,
    replayVisualSnapshot: {
      v: 1,
      faceStyle: holderFace,
      avatarDetails: null,
      voicePreset: "formal",
      screenMaterialSeed: "holder-screen",
      frameMaterialSeed: "holder-frame",
    },
    powers: [],
    provider: "local",
    model: "frozen-whodunnit",
    revision: "holder-revision",
  };
  const frozenTargetBot = debateMysteryIdentityMirrorTargetBotSnapshotV1(
    frozenState.identityMirrorTargetSnapshots[prosecutor]!,
  );
  const appearance = debateIdentityAppearanceBotV1({
    holder: holderSnapshot,
    target: frozenTargetBot,
    effect: "identity_mirror",
  });
  const copiedFace = appearance.replayVisualSnapshot!.faceStyle;
  for (const key of [
    "eyesFont", "eyeCharacter", "eyeCount", "eyeSpacing", "eyeAnimation",
    "eyeScale", "eyeOffsetX", "eyeOffsetY", "eyeRotationDeg", "blinkBar",
    "blinkCount", "blinkScale", "blinkOffsetX", "blinkOffsetY",
    "blinkRotationDeg", "mouthFont", "mouthCharacter", "mouthAnimation",
    "mouthSpeechPoses", "mouthCoffeePucker", "mouthScale", "mouthOffsetX",
    "mouthOffsetY", "mouthRotationDeg", "weight",
  ] as const) {
    assert.deepEqual(copiedFace[key], targetFace[key], `copied ${key}`);
  }
  assert.deepEqual(copiedFace.thinkingFrames, holderFace.thinkingFrames);
  assert.equal(appearance.glyph, "lucideScale");
  assert.deepEqual(appearance.avatarDetails, targetInk);
  assert.equal(appearance.color, "#00fde4");
  assert.deepEqual(appearance.voiceProfile, holderVoice);
  assert.equal(appearance.replayVisualSnapshot?.voicePreset, "formal");
  assert.equal(appearance.replayVisualSnapshot?.screenMaterialSeed, "holder-screen");
  assert.equal(appearance.replayVisualSnapshot?.frameMaterialSeed, "holder-frame");
});

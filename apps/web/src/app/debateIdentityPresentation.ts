import {
  applyBotIdentityMirrorFaceV1,
  applyBotIdentityMirrorHolderVoiceEffectV1,
  applyBotIdentityShapeshiftAccentMapV1,
  botIdentityMirrorPublicNameV1,
  botIdentityPresentationFrameMaterialSeedV1,
  botIdentityPresentationScreenMaterialSeedV1,
  botIdentityPresentationVoicePresetV1,
  type DebateBotSnapshotV1,
} from "@localai/shared";

export type DebateIdentityPresentationEffectV1 =
  | "identity_mirror"
  | "identity_shapeshift";

export interface DebateIdentityPresentationEventV1 {
  id: string;
  sequence: number;
  speakerBotId: string | null;
  createdAt: string;
}

export interface DebateIdentityPresentationChangeV1 {
  effect: DebateIdentityPresentationEffectV1;
  holderBotId: string;
  targetBotId: string;
  sourceEventId: string;
  occurredAt: string;
}

/**
 * Build the public avatar passed to Debate rendering. Identity Crisis borrows
 * the target's eyes, complete resting/live mouth package, Avatar Details Ink,
 * lower glyph, and `The real …` public name. Every other field stays with the holder.
 * Shapeshifter takes the target's face and chassis, but the holder's Powers,
 * audible identity, and authored identity anchors — name, color, glyph — persist so the
 * chamber can still tell who actually holds the floor. The disguise is carried
 * by the "Appearing as …" label, not by overwriting the speaker.
 */
export function debateIdentityAppearanceBotV1(args: {
  holder: DebateBotSnapshotV1;
  target: DebateBotSnapshotV1 | null | undefined;
  effect: DebateIdentityPresentationEffectV1 | null;
}): DebateBotSnapshotV1 {
  if (!args.target || !args.effect) return args.holder;
  if (args.effect === "identity_shapeshift") {
    const holderVoicePreset =
      args.holder.replayVisualSnapshot?.voicePreset ??
      botIdentityPresentationVoicePresetV1(args.holder.systemPrompt);
    return {
      ...args.target,
      version: args.holder.version,
      id: args.holder.id,
      name: args.holder.name,
      role: args.holder.role,
      sideId: args.holder.sideId,
      color: args.holder.color,
      glyph: args.holder.glyph,
      provider: args.holder.provider,
      model: args.holder.model,
      revision: args.holder.revision,
      powers: args.holder.powers,
      voiceProfile: applyBotIdentityShapeshiftAccentMapV1(
        args.holder.voiceProfile,
        args.target.voiceProfile,
      ),
      replayVisualSnapshot: args.target.replayVisualSnapshot
        ? {
            ...args.target.replayVisualSnapshot,
            voicePreset: holderVoicePreset,
          }
        : args.target.replayVisualSnapshot,
    };
  }

  const holderVisual = args.holder.replayVisualSnapshot ?? null;
  const targetVisual = args.target.replayVisualSnapshot ?? null;
  const holderVoicePreset =
    holderVisual?.voicePreset ??
    botIdentityPresentationVoicePresetV1(args.holder.systemPrompt);
  const holderFrameMaterialSeed =
    holderVisual?.frameMaterialSeed ??
    botIdentityPresentationFrameMaterialSeedV1({
      targetBotId: args.holder.id,
    });
  const holderScreenMaterialSeed =
    holderVisual?.screenMaterialSeed ??
    botIdentityPresentationScreenMaterialSeedV1({
      targetBotId: args.holder.id,
    });
  const mirroredFaceStyle =
    holderVisual && targetVisual
      ? applyBotIdentityMirrorFaceV1(
          holderVisual.faceStyle,
          targetVisual.faceStyle,
        )
      : (holderVisual?.faceStyle ?? null);
  const replayVisualSnapshot = mirroredFaceStyle
    ? {
        v: 1 as const,
        faceStyle: mirroredFaceStyle,
        avatarDetails:
          targetVisual?.avatarDetails ?? args.target.avatarDetails ?? null,
        voicePreset: holderVoicePreset,
        screenMaterialSeed: holderScreenMaterialSeed,
        frameMaterialSeed: holderFrameMaterialSeed,
      }
    : holderVisual;

  return {
    ...args.holder,
    name:
      botIdentityMirrorPublicNameV1(args.target.name) || args.holder.name,
    glyph: args.target.glyph,
    avatarDetails:
      targetVisual?.avatarDetails ?? args.target.avatarDetails ?? null,
    voiceProfile: applyBotIdentityMirrorHolderVoiceEffectV1(
      args.target.voiceProfile,
      args.holder.voiceProfile,
    ),
    replayVisualSnapshot,
  };
}

/**
 * Resolve the persisted event that began the holder's current visual form.
 * Consecutive turns from the same target keep the original event so ordinary
 * rerenders and repeated speech cannot restart the screen-off transition.
 */
export function debateIdentityPresentationChangeV1(args: {
  sessionId: string;
  sessionCreatedAt: string;
  holderBotId: string;
  targetBotId: string;
  participantBotIds: readonly string[];
  effectTypes: readonly string[];
  events: readonly DebateIdentityPresentationEventV1[];
  beforeSequence?: number;
}): DebateIdentityPresentationChangeV1 | null {
  if (
    !args.holderBotId ||
    !args.targetBotId ||
    args.holderBotId === args.targetBotId
  ) {
    return null;
  }
  const hasMirror = args.effectTypes.includes("identity_mirror");
  const hasShapeshift = args.effectTypes.includes("identity_shapeshift");
  if (!hasMirror && !hasShapeshift) return null;

  if (hasMirror) {
    const participantIds = new Set(args.participantBotIds);
    const beforeSequence = args.beforeSequence ?? Number.POSITIVE_INFINITY;
    const eligible = args.events.filter(
      (event) =>
        event.sequence < beforeSequence &&
        event.speakerBotId !== null &&
        event.speakerBotId !== args.holderBotId &&
        participantIds.has(event.speakerBotId),
    );
    const latest = eligible.at(-1);
    if (!latest || latest.speakerBotId !== args.targetBotId) return null;

    let runStart = eligible.length - 1;
    while (
      runStart > 0 &&
      eligible[runStart - 1]?.speakerBotId === args.targetBotId
    ) {
      runStart -= 1;
    }
    const source = eligible[runStart]!;
    return {
      effect: "identity_mirror",
      holderBotId: args.holderBotId,
      targetBotId: args.targetBotId,
      sourceEventId: source.id,
      occurredAt: source.createdAt,
    };
  }

  return {
    effect: "identity_shapeshift",
    holderBotId: args.holderBotId,
    targetBotId: args.targetBotId,
    sourceEventId: `debate:${args.sessionId}:identity-shapeshift:${args.holderBotId}:${args.targetBotId}`,
    occurredAt: args.sessionCreatedAt,
  };
}

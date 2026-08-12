import {
  applyBotIdentityMirrorHolderVoiceEffectV1,
  botIdentityPresentationFrameMaterialSeedV1,
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
 * the target identity while keeping the holder's color, client voice effect,
 * communication chassis, frame, mechanical id, seat, and routing boundary.
 * Shapeshifter deliberately keeps the prior complete-target presentation.
 */
export function debateIdentityAppearanceBotV1(args: {
  holder: DebateBotSnapshotV1;
  target: DebateBotSnapshotV1 | null | undefined;
  effect: DebateIdentityPresentationEffectV1 | null;
}): DebateBotSnapshotV1 {
  if (!args.target || !args.effect) return args.holder;
  if (args.effect === "identity_shapeshift") return args.target;

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
  const replayVisualSnapshot = targetVisual
    ? {
        ...targetVisual,
        voicePreset: holderVoicePreset,
        frameMaterialSeed: holderFrameMaterialSeed,
      }
    : holderVisual;

  return {
    ...args.target,
    version: args.holder.version,
    id: args.holder.id,
    role: args.holder.role,
    sideId: args.holder.sideId,
    color: args.holder.color,
    voiceProfile: applyBotIdentityMirrorHolderVoiceEffectV1(
      args.target.voiceProfile,
      args.holder.voiceProfile,
    ),
    replayVisualSnapshot,
    provider: args.holder.provider,
    model: args.holder.model,
    revision: args.holder.revision,
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

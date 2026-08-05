/**
 * Signal action Foley direction — keep Fancy Action SFX in Premium upgrades.
 */

import {
  isActionSfxPackKind,
  signalFancyActionCueText,
  type ActionSfxPackKind,
  type ActionSfxPackOwnerKind,
  type ReplayDirectionEventV2,
  type ReplayManifestV2,
  type ReplayUtteranceV1,
} from "@localai/shared";
import { buildBundledActionSfxPlan } from "./coffee-action-sfx.ts";

export const SIGNAL_ACTION_SFX_DIRECTION_KIND = "action_sfx" as const;

export interface SignalActionSfxDirectionPayload {
  kind: typeof SIGNAL_ACTION_SFX_DIRECTION_KIND;
  actionKind: ActionSfxPackKind;
  seed: string;
  packOwnerKind: ActionSfxPackOwnerKind;
  packOwnerId?: string | null;
  corporality?: number | null;
}

export function isSignalActionSfxDirectionPayload(
  payload: Record<string, unknown> | null | undefined,
): payload is Record<string, unknown> & SignalActionSfxDirectionPayload {
  if (!payload || payload.kind !== SIGNAL_ACTION_SFX_DIRECTION_KIND) return false;
  if (!isActionSfxPackKind(payload.actionKind)) return false;
  return (
    payload.packOwnerKind === undefined ||
    payload.packOwnerKind === "bot" ||
    payload.packOwnerKind === "player"
  );
}

export function signalActionSfxCueTextForUtterance(
  utterance: Pick<ReplayUtteranceV1, "text" | "metadata">,
): string {
  const stageAction =
    utterance.metadata &&
    typeof utterance.metadata.stageActionText === "string"
      ? utterance.metadata.stageActionText
      : null;
  return (
    signalFancyActionCueText(stageAction) ??
    (stageAction?.trim() ? `*${stageAction.trim()}*` : utterance.text)
  );
}

export function buildSignalActionSfxDirectionPayload(args: {
  actionKind: ActionSfxPackKind;
  sourceMessageId: string;
  packOwnerKind?: ActionSfxPackOwnerKind;
  packOwnerId?: string | null;
  corporality?: number | null;
  seed?: string;
}): SignalActionSfxDirectionPayload {
  return {
    kind: SIGNAL_ACTION_SFX_DIRECTION_KIND,
    actionKind: args.actionKind,
    seed: args.seed?.trim() || `action-sfx:${args.sourceMessageId}:${args.actionKind}`,
    packOwnerKind: args.packOwnerKind ?? "player",
    ...(args.packOwnerId ? { packOwnerId: args.packOwnerId } : {}),
    ...(args.corporality ? { corporality: args.corporality } : {}),
  };
}

/**
 * Adds missing action_sfx direction rows from saved stage-action metadata so
 * Upgrade voices / studio-cut mixes still include Foley that lived only in the
 * original broadcast audio master.
 */
export function synthesizeSignalActionSfxDirection(
  manifest: Pick<ReplayManifestV2, "utterances" | "direction">,
  options?: {
    packOwnerKindForSpeaker?: (
      utterance: ReplayUtteranceV1,
    ) => ActionSfxPackOwnerKind;
    packOwnerIdForSpeaker?: (utterance: ReplayUtteranceV1) => string | null;
  },
): ReplayDirectionEventV2[] {
  const covered = new Set(
    manifest.direction
      .filter(
        (event) =>
          event.kind === "action" &&
          isSignalActionSfxDirectionPayload(event.payload) &&
          typeof event.sourceMessageId === "string",
      )
      .map((event) => event.sourceMessageId as string),
  );
  const speechStartByMessage = new Map<string, number>();
  for (const event of manifest.direction) {
    if (
      event.kind === "speech" &&
      event.payload.active !== false &&
      event.sourceMessageId &&
      !speechStartByMessage.has(event.sourceMessageId)
    ) {
      speechStartByMessage.set(event.sourceMessageId, event.atMs);
    }
  }
  const synthesized: ReplayDirectionEventV2[] = [];
  for (const utterance of manifest.utterances) {
    if (covered.has(utterance.sourceMessageId)) continue;
    const plan = buildBundledActionSfxPlan(
      signalActionSfxCueTextForUtterance(utterance),
    );
    if (!plan) continue;
    const atMs = speechStartByMessage.get(utterance.sourceMessageId) ?? 0;
    synthesized.push({
      sequence: 0,
      atMs,
      kind: "action",
      sourceMessageId: utterance.sourceMessageId,
      payload: {
        ...buildSignalActionSfxDirectionPayload({
          actionKind: plan.kind,
          sourceMessageId: utterance.sourceMessageId,
          packOwnerKind:
            options?.packOwnerKindForSpeaker?.(utterance) ??
            (utterance.speakerRole === "guest" &&
            utterance.speakerId === "prism-player"
              ? "player"
              : "bot"),
          packOwnerId:
            options?.packOwnerIdForSpeaker?.(utterance) ??
            (utterance.speakerId === "prism-player"
              ? null
              : utterance.speakerId),
        }),
      },
    });
  }
  return synthesized;
}

import {
  DEBATE_SETUP_PRESETS,
  type DebateAdvocacyConsent,
  type DebateFormalityId,
  type DebateFormatId,
  type DebateMotionSlateV1,
  type DebatePlayerRole,
  type DebateSetupPresetId,
} from "@localai/shared";

export interface DebateCastSelection {
  moderator: string;
  forAdvocate: string;
  againstAdvocate: string;
}

export function debatePrefilledCast(
  initialBotIds: readonly string[] | undefined,
): DebateCastSelection {
  const ids = [...new Set((initialBotIds ?? []).filter(Boolean))];
  if (ids.length > 3) {
    return { moderator: "", forAdvocate: "", againstAdvocate: "" };
  }
  return {
    moderator: ids[0] ?? "",
    forAdvocate: ids[1] ?? "",
    againstAdvocate: ids[2] ?? "",
  };
}

export function randomDebateCast(
  availableBotIds: readonly string[],
  random: () => number = Math.random,
): DebateCastSelection | null {
  const shuffledIds = [...new Set(availableBotIds.filter(Boolean))];
  if (shuffledIds.length < 3) return null;

  for (let index = shuffledIds.length - 1; index > 0; index -= 1) {
    const sample = random();
    const normalizedSample = Number.isFinite(sample)
      ? Math.min(Math.max(sample, 0), 0.999_999_999_999)
      : 0;
    const swapIndex = Math.floor(normalizedSample * (index + 1));
    [shuffledIds[index], shuffledIds[swapIndex]] = [
      shuffledIds[swapIndex]!,
      shuffledIds[index]!,
    ];
  }

  return {
    moderator: shuffledIds[0]!,
    forAdvocate: shuffledIds[1]!,
    againstAdvocate: shuffledIds[2]!,
  };
}

/** Stage alignment always uses a fresh random three-bot Library cast. */
export function debateAlignmentPreviewCast(
  availableBotIds: readonly string[],
  random: () => number = Math.random,
): DebateCastSelection | null {
  return randomDebateCast(availableBotIds, random);
}

/** Selecting a synthesized slate replaces its five editable fields together. */
export function copyDebateMotionSlate(
  slate: DebateMotionSlateV1,
): DebateMotionSlateV1 {
  return {
    ...slate,
    forSide: { ...slate.forSide },
    againstSide: { ...slate.againstSide },
  };
}

export interface DebateMotionRevealState {
  motion: boolean;
  positions: boolean;
  briefs: boolean;
}

/**
 * Reveal the motion editor in authored order while keeping every populated
 * downstream field reachable if an earlier value is later cleared.
 */
export function debateMotionRevealState(
  topic: string,
  slate: DebateMotionSlateV1,
): DebateMotionRevealState {
  const hasMotion = Boolean(slate.motion.trim());
  const hasForLabel = Boolean(slate.forSide.label.trim());
  const hasAgainstLabel = Boolean(slate.againstSide.label.trim());
  const hasForBrief = Boolean(slate.forSide.brief.trim());
  const hasAgainstBrief = Boolean(slate.againstSide.brief.trim());
  const hasPositionContent =
    hasForLabel || hasAgainstLabel || hasForBrief || hasAgainstBrief;
  const hasBriefContent = hasForBrief || hasAgainstBrief;

  return {
    motion: Boolean(topic.trim()) || hasMotion || hasPositionContent,
    positions: hasMotion || hasPositionContent,
    briefs: (hasForLabel && hasAgainstLabel) || hasBriefContent,
  };
}

export function derivedDebateSetupPresetId(args: {
  selectedPresetId: DebateSetupPresetId;
  format: DebateFormatId;
  formality: DebateFormalityId;
  playerRole: DebatePlayerRole;
  juryEnabled: boolean;
}): DebateSetupPresetId | "custom" {
  const preset = DEBATE_SETUP_PRESETS.find(
    (candidate) => candidate.id === args.selectedPresetId,
  );
  return preset &&
    preset.format === args.format &&
    preset.formality === args.formality &&
    preset.playerRole === args.playerRole &&
    preset.juryEnabled === args.juryEnabled
    ? preset.id
    : "custom";
}

export function applyDebateSetupPreset<
  T extends {
    format: DebateFormatId;
    formality: DebateFormalityId;
    playerRole: DebatePlayerRole;
    juryEnabled: boolean;
    roleChecks: DebateAdvocacyConsent[];
  },
>(current: T, presetId: DebateSetupPresetId): T {
  const preset = DEBATE_SETUP_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) return current;
  return {
    ...current,
    format: preset.format,
    formality: preset.formality,
    playerRole: preset.playerRole,
    juryEnabled: preset.juryEnabled,
    roleChecks:
      preset.format === current.format && preset.formality === current.formality
        ? current.roleChecks
        : [],
  };
}

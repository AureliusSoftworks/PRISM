import {
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_JURY_SIZE,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  DEBATE_SCHEMA_VERSION,
  DEBATE_SETUP_PRESETS,
  normalizeDebateModeratorTitle,
  type DebateAdvocacyConsent,
  type DebateEvidencePacketV1,
  type DebateEvidenceSourceV1,
  type DebateFormalityId,
  type DebateForumRoundMode,
  type DebateFormatId,
  type DebateMotionSlateV1,
  type DebatePlayerRole,
  type DebateSetupPresetId,
  type DebateSetupSuggestionV1,
  type DebateSessionV1,
  type DebateSideId,
  type DebateStatus,
} from "@localai/shared";

export type DebateEvidenceSourcePropKind = "brave" | "url" | "scholar";

/**
 * Source provenance is encoded in stable evidence IDs so archived Debates can
 * recover the same physical prop without expanding the frozen evidence schema.
 */
export function debateEvidenceSourcePropKind(
  source: Pick<DebateEvidenceSourceV1, "id">,
): DebateEvidenceSourcePropKind {
  if (/^url-\d+$/u.test(source.id)) return "url";
  if (/^scholar-\d+$/u.test(source.id)) return "scholar";
  return "brave";
}

function canonicalDebateEvidenceUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    parsed.hash = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return value.trim();
  }
}

function nextDebateEvidenceSourceId(
  usedIds: Set<string>,
  requestedId: string,
): string {
  const prefix = requestedId.replace(/-\d+$/u, "") || "source";
  let index = 1;
  while (usedIds.has(`${prefix}-${index}`)) index += 1;
  const id = `${prefix}-${index}`;
  usedIds.add(id);
  return id;
}

/**
 * Existing evidence is locked in first. Later source searches only append
 * distinct URLs into the packet's remaining source slots.
 */
export function mergeDebateEvidenceSources(
  current: readonly DebateEvidenceSourceV1[],
  incoming: readonly DebateEvidenceSourceV1[],
): DebateEvidenceSourceV1[] {
  const merged = current.slice(0, DEBATE_EVIDENCE_SOURCE_MAX_COUNT);
  const usedIds = new Set(merged.map((source) => source.id));
  const usedUrls = new Set(
    merged.map((source) => canonicalDebateEvidenceUrl(source.url)),
  );

  for (const source of incoming) {
    if (merged.length >= DEBATE_EVIDENCE_SOURCE_MAX_COUNT) break;
    const canonicalUrl = canonicalDebateEvidenceUrl(source.url);
    if (!canonicalUrl || usedUrls.has(canonicalUrl)) continue;

    const id = usedIds.has(source.id)
      ? nextDebateEvidenceSourceId(usedIds, source.id)
      : source.id;
    usedIds.add(id);
    usedUrls.add(canonicalUrl);
    merged.push({ ...source, id });
  }

  return merged;
}

export interface DebateCastSelection {
  moderator: string;
  forAdvocate: string;
  againstAdvocate: string;
}

export type DebateRoomPresence =
  | "arriving"
  | "occupied"
  | "departing"
  | "empty";

/**
 * Keep every final spoken beat visible, then dismiss the live room once. A
 * completed replay opens directly on the already-empty sealed stage.
 * Spectator pre-bake "arriving" is driven by DebateExperience, not this helper.
 */
export function debateRoomPresence(args: {
  status: DebateStatus;
  presenting: boolean;
  observerPerspective: "live" | "replay";
}): Exclude<DebateRoomPresence, "arriving"> {
  if (args.status !== "completed" || args.presenting) return "occupied";
  return args.observerPerspective === "replay" ? "empty" : "departing";
}

/**
 * The gallery curtain represents only the unopened court runway. A delegated
 * Whodunnit may continue receiving public bake snapshots after its court has
 * advanced, so local bake state alone must never keep the stage covered.
 */
export function debateGalleryArrivalShouldMaskStage(args: {
  baking: boolean;
  needsBuffering: boolean;
  session: Pick<DebateSessionV1, "format" | "formatState" | "stepKey">;
}): boolean {
  if (!args.baking || !args.needsBuffering) return false;
  const isAdvancedMysteryCourt =
    args.session.format === "turnabout" &&
    args.session.formatState.format === "turnabout" &&
    Boolean(args.session.formatState.mysteryTrial) &&
    args.session.stepKey !== "turnabout_intro";
  return !isAdvancedMysteryCourt;
}

export interface DebateSessionRetryDraft {
  topic: string;
  format: DebateFormatId;
  formality: DebateFormalityId;
  moderatorTitle: string;
  selectedPresetId: DebateSetupPresetId;
  motion: DebateMotionSlateV1;
  cast: DebateCastSelection;
  playerRole: DebatePlayerRole;
  playerSideId: "for" | "against";
  juryEnabled: boolean;
  /** Seat-ordered preferred library juror ids; null = Surprise. */
  preferredJurorBotIds: Array<string | null>;
  forumRoundMode: DebateForumRoundMode;
  forumRoundCount: number;
  evidence: DebateSessionV1["evidence"];
  missingBotNames: string[];
}

/** Empty four-seat Jury preference roster (all Surprise). */
export function emptyPreferredJurorBotIds(): Array<string | null> {
  return Array.from({ length: DEBATE_JURY_SIZE }, () => null);
}

/**
 * Restore library Jury pins from a frozen session. Generic seats become Surprise.
 */
export function preferredJurorBotIdsFromSession(
  session: DebateSessionV1,
  availableBotIds: readonly string[],
): Array<string | null> {
  const seats = emptyPreferredJurorBotIds();
  if (!session.jury.enabled) return seats;
  const available = new Set(availableBotIds);
  session.jury.jurors?.slice(0, DEBATE_JURY_SIZE).forEach((juror, index) => {
    if (juror.source === "library" && available.has(juror.id)) {
      seats[index] = juror.id;
    }
  });
  return seats;
}

/**
 * Restores only authored setup. Runtime output, consent, model lanes, ballots,
 * and verdict state intentionally remain attached to the archived proceeding.
 */
export function debateSessionRetryDraft(
  session: DebateSessionV1,
  availableBotIds: readonly string[],
  currentPresetId: DebateSetupPresetId,
): DebateSessionRetryDraft {
  const forumFormatState =
    session.formatState?.format === "forum" ? session.formatState : null;
  const available = new Set(availableBotIds);
  const missingBotNames: string[] = [];
  const restoreLibraryBot = (
    bot: DebateSessionV1["moderator"],
    playerOwned = false,
  ): string => {
    if (
      playerOwned ||
      bot.id === DEBATE_PLAYER_JUDGE_BOT_ID ||
      bot.id === DEBATE_PLAYER_PARTICIPANT_BOT_ID
    ) {
      return "";
    }
    if (available.has(bot.id)) return bot.id;
    missingBotNames.push(bot.name);
    return "";
  };
  const participantFor =
    session.playerRole === "participant" && session.playerSideId === "for";
  const participantAgainst =
    session.playerRole === "participant" && session.playerSideId === "against";
  const savedPreset = DEBATE_SETUP_PRESETS.some(
    (preset) => preset.id === session.setupPresetId,
  )
    ? (session.setupPresetId as DebateSetupPresetId)
    : currentPresetId;

  return {
    topic: session.motion.motion,
    format: session.format,
    formality: session.formality,
    moderatorTitle: session.moderatorTitle,
    selectedPresetId: savedPreset,
    motion: copyDebateMotionSlate(session.motion),
    cast: {
      moderator: restoreLibraryBot(
        session.moderator,
        session.playerRole === "judge",
      ),
      forAdvocate: restoreLibraryBot(session.forAdvocate, participantFor),
      againstAdvocate: restoreLibraryBot(
        session.againstAdvocate,
        participantAgainst,
      ),
    },
    playerRole: session.playerRole,
    playerSideId: session.playerSideId ?? "for",
    juryEnabled: session.jury.enabled,
    preferredJurorBotIds: preferredJurorBotIdsFromSession(
      session,
      availableBotIds,
    ),
    forumRoundMode: forumFormatState?.rebuttalRoundMode ?? "auto",
    forumRoundCount: forumFormatState?.rebuttalRoundTarget ?? 1,
    evidence: {
      ...session.evidence,
      sources: session.evidence.sources.map((source) => ({ ...source })),
      exhibits: (session.evidence.exhibits ?? []).map((exhibit) => ({
        ...exhibit,
      })),
      frozenAt: null,
    },
    missingBotNames: [...new Set(missingBotNames)],
  };
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

export function debatePlayerJudgePrefilledCast(
  initialBotIds: readonly string[] | undefined,
): DebateCastSelection {
  const ids = [...new Set((initialBotIds ?? []).filter(Boolean))];
  if (ids.length > 2) {
    return { moderator: "", forAdvocate: "", againstAdvocate: "" };
  }
  return {
    moderator: "",
    forAdvocate: ids[0] ?? "",
    againstAdvocate: ids[1] ?? "",
  };
}

function shuffledUniqueBotIds(
  availableBotIds: readonly string[],
  random: () => number,
): string[] {
  const shuffledIds = [...new Set(availableBotIds.filter(Boolean))];
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
  return shuffledIds;
}

export function randomDebateCast(
  availableBotIds: readonly string[],
  random: () => number = Math.random,
): DebateCastSelection | null {
  const shuffledIds = shuffledUniqueBotIds(availableBotIds, random);
  if (shuffledIds.length < 3) return null;

  return {
    moderator: shuffledIds[0]!,
    forAdvocate: shuffledIds[1]!,
    againstAdvocate: shuffledIds[2]!,
  };
}

export function randomDebatePlayerJudgeCast(
  availableBotIds: readonly string[],
  random: () => number = Math.random,
): DebateCastSelection | null {
  const shuffledIds = shuffledUniqueBotIds(availableBotIds, random);
  if (shuffledIds.length < 2) return null;
  return {
    moderator: "",
    forAdvocate: shuffledIds[0]!,
    againstAdvocate: shuffledIds[1]!,
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

export interface DebateSetupSuggestionAppliedState {
  topic: string;
  format: DebateFormatId;
  formality: DebateFormalityId;
  forumRoundMode: DebateForumRoundMode;
  forumRoundCount: number;
  juryEnabled: boolean;
  selectedPresetId: DebateSetupPresetId;
  motion: DebateMotionSlateV1;
  cast: DebateCastSelection;
  playerRole: DebatePlayerRole;
  playerSideId: DebateSideId;
  moderatorTitle: string;
  evidence: DebateEvidencePacketV1;
  researchQuery: string;
  scholarQuery: string;
  sourcesSkippedNotice: string | null;
}

export function anchorDebateSetupCast(input: {
  cast: DebateCastSelection;
  anchorBotId: string;
  anchorSlot: keyof DebateCastSelection;
  selectableSlots: readonly (keyof DebateCastSelection)[];
  availableBotIds: readonly string[];
}): DebateCastSelection {
  const next = { ...input.cast };
  for (const slot of input.selectableSlots) {
    if (slot !== input.anchorSlot && next[slot] === input.anchorBotId) {
      next[slot] = "";
    }
  }
  next[input.anchorSlot] = input.anchorBotId;
  const used = new Set(Object.values(next).filter(Boolean));
  for (const slot of input.selectableSlots) {
    if (next[slot]) continue;
    const replacement = input.availableBotIds.find((botId) => !used.has(botId));
    if (!replacement) continue;
    next[slot] = replacement;
    used.add(replacement);
  }
  return next;
}

/**
 * Map a setup-suggestion payload into Debate Studio setters without auto-start.
 * Preserves Prism's chosen seat (Judge / Spectate / Crossfire), Jury flag,
 * and moderator when the player is not on the Bench.
 */
export function applyDebateSetupSuggestion(
  suggestion: DebateSetupSuggestionV1,
): DebateSetupSuggestionAppliedState {
  const matchingPreset = suggestion.setupPresetId
    ? DEBATE_SETUP_PRESETS.find(
        (preset) =>
          preset.id === suggestion.setupPresetId &&
          preset.format === suggestion.format &&
          preset.formality === suggestion.formality &&
          preset.playerRole === suggestion.playerRole &&
          preset.juryEnabled === suggestion.juryEnabled,
      )
    : undefined;
  const fallbackPreset =
    DEBATE_SETUP_PRESETS.find(
      (preset) =>
        preset.format === suggestion.format &&
        preset.formality === suggestion.formality &&
        preset.playerRole === suggestion.playerRole &&
        preset.juryEnabled === suggestion.juryEnabled,
    ) ??
    DEBATE_SETUP_PRESETS.find((preset) => preset.id === "classic-duel") ??
    DEBATE_SETUP_PRESETS[0]!;

  let sourcesSkippedNotice: string | null = null;
  switch (suggestion.researchMeta.sourcesSkippedReason) {
    case "local":
      sourcesSkippedNotice =
        "LOCAL mode kept emoji exhibits only — public sources stay offline.";
      break;
    case "missing_brave_key":
      sourcesSkippedNotice =
        "Brave Search was unavailable; Crossref or exhibits may still be staged.";
      break;
    case "research_unavailable":
      sourcesSkippedNotice =
        "Public source search returned nothing useful; emoji exhibits remain.";
      break;
    case null:
      sourcesSkippedNotice = null;
      break;
    default: {
      const _exhaustive: never = suggestion.researchMeta.sourcesSkippedReason;
      void _exhaustive;
      sourcesSkippedNotice = null;
      break;
    }
  }

  const playerRole = suggestion.playerRole;
  const playerSideId =
    playerRole === "participant"
      ? (suggestion.playerSideId ?? "for")
      : "for";
  const forAdvocate =
    playerRole === "participant" && playerSideId === "for"
      ? ""
      : suggestion.forAdvocateBotId;
  const againstAdvocate =
    playerRole === "participant" && playerSideId === "against"
      ? ""
      : suggestion.againstAdvocateBotId;

  return {
    topic: suggestion.topic,
    format: suggestion.format,
    formality: suggestion.formality,
    forumRoundMode: suggestion.forumRoundMode,
    forumRoundCount: suggestion.forumRoundCount,
    juryEnabled: suggestion.juryEnabled,
    selectedPresetId: matchingPreset?.id ?? fallbackPreset.id,
    motion: copyDebateMotionSlate(suggestion.motion),
    cast: {
      moderator:
        playerRole === "judge" ? "" : (suggestion.moderatorBotId ?? ""),
      forAdvocate,
      againstAdvocate,
    },
    playerRole,
    playerSideId,
    moderatorTitle: normalizeDebateModeratorTitle(suggestion.moderatorTitle),
    evidence: {
      version: DEBATE_SCHEMA_VERSION,
      notes: suggestion.notes,
      sources: suggestion.sources,
      exhibits: suggestion.exhibits,
      frozenAt: null,
    },
    researchQuery: suggestion.researchMeta.webQuery,
    scholarQuery: suggestion.researchMeta.scholarQuery,
    sourcesSkippedNotice,
  };
}

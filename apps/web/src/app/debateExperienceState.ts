import {
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  DEBATE_SETUP_PRESETS,
  type DebateAdvocacyConsent,
  type DebateEvidenceSourceV1,
  type DebateFormalityId,
  type DebateForumRoundMode,
  type DebateFormatId,
  type DebateMotionSlateV1,
  type DebatePlayerRole,
  type DebateSetupPresetId,
  type DebateSessionV1,
  type DebateStatus,
} from "@localai/shared";

function canonicalDebateEvidenceUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    parsed.hash = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return value.trim();
  }
}

function nextDebateEvidenceSourceId(usedIds: Set<string>): string {
  let index = 1;
  while (usedIds.has(`brave-${index}`)) index += 1;
  const id = `brave-${index}`;
  usedIds.add(id);
  return id;
}

/**
 * Existing evidence is locked in first. Later Brave searches only append
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
      ? nextDebateEvidenceSourceId(usedIds)
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

export type DebateRoomPresence = "occupied" | "departing" | "empty";

/**
 * Keep every final spoken beat visible, then dismiss the live room once. A
 * completed replay opens directly on the already-empty sealed stage.
 */
export function debateRoomPresence(args: {
  status: DebateStatus;
  presenting: boolean;
  observerPerspective: "live" | "replay";
}): DebateRoomPresence {
  if (args.status !== "completed" || args.presenting) return "occupied";
  return args.observerPerspective === "replay" ? "empty" : "departing";
}

export interface DebateSessionRetryDraft {
  setupMode: "basic" | "advanced";
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
  forumRoundMode: DebateForumRoundMode;
  forumRoundCount: number;
  evidence: DebateSessionV1["evidence"];
  missingBotNames: string[];
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
    setupMode:
      session.format !== "forum" ||
      session.playerRole !== "judge" ||
      session.jury.enabled
        ? "advanced"
        : "basic",
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

/** Studio screens that must be opened once before Start unlocks. */
export const DEBATE_REQUIRED_SETUP_SCREENS = [
  "motion",
  "cast",
  "evidence",
] as const;

export type DebateRequiredSetupScreen =
  (typeof DEBATE_REQUIRED_SETUP_SCREENS)[number];

export function isDebateRequiredSetupScreen(
  panel: string,
): panel is DebateRequiredSetupScreen {
  return (DEBATE_REQUIRED_SETUP_SCREENS as readonly string[]).includes(panel);
}

/**
 * Start stays locked until Topic/Motion, Debaters/Cast, and Evidence have each
 * been opened at least once. Navigation itself stays free.
 */
export function debateSetupScreensVisited(
  visited: ReadonlySet<string> | readonly string[],
): boolean {
  const set = visited instanceof Set ? visited : new Set(visited);
  return DEBATE_REQUIRED_SETUP_SCREENS.every((screen) => set.has(screen));
}

export function withDebateSetupScreenVisited(
  visited: ReadonlySet<DebateRequiredSetupScreen>,
  panel: string,
): ReadonlySet<DebateRequiredSetupScreen> {
  if (!isDebateRequiredSetupScreen(panel) || visited.has(panel)) return visited;
  const next = new Set(visited);
  next.add(panel);
  return next;
}

export function initialDebateSetupScreensVisited(): ReadonlySet<DebateRequiredSetupScreen> {
  return new Set<DebateRequiredSetupScreen>(["motion"]);
}

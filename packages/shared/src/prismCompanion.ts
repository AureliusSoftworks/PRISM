import type { EphemeralChatResolvedProvider } from "./ephemeralChat.js";
import type { PrismCompanionCardV1 } from "./prismOrchestration.js";
import {
  normalizeStoredUserNotesPayload,
  type UserNotesPayload,
} from "./prismTool.js";
import type {
  DebateFormalityId,
  DebateFormatId,
  DebatePlayerRole,
  DebateSideId,
} from "./debate.js";

export const PRISM_COMPANION_RECOVERY_LIMIT = 3;
export const PRISM_COMPANION_MESSAGE_MAX_LENGTH = 4_000;
export const PRISM_COMPANION_REFERENCE_ID_MAX_LENGTH = 160;

export const PRISM_COMPANION_SURFACE_IDS = [
  "home",
  "prism-home",
  "zen",
  "group-home",
  "coffee",
  "signal",
  "slate",
  "story",
  "debate",
  "marketplace",
  "avatar-studio",
  "images",
  "settings",
] as const;

export type PrismCompanionSurfaceId =
  (typeof PRISM_COMPANION_SURFACE_IDS)[number];

export interface PrismCompanionDebateDraft {
  studioPanel: "motion" | "cast" | "evidence" | "archive";
  format: DebateFormatId;
  formality: DebateFormalityId;
  playerRole: DebatePlayerRole;
  playerSideId: DebateSideId;
  juryEnabled: boolean;
  moderatorTitle: string;
  topic: string;
  motion: string;
  forLabel: string;
  forBrief: string;
  againstLabel: string;
  againstBrief: string;
  exhibitAdjective: string;
  exhibitObject: string;
  exhibitObservation: string;
  evidenceItemCount: number;
}

export interface PrismCompanionSurfaceReference {
  surfaceId: PrismCompanionSurfaceId;
  botIds?: string[];
  conversationId?: string;
  signalShowId?: string;
  signalEpisodeId?: string;
  slateProjectId?: string;
  slateSectionId?: string;
  storySessionId?: string;
  debateSessionId?: string;
  debateDraft?: PrismCompanionDebateDraft;
  imageId?: string;
  libraryGroupId?: string;
}

export interface PrismCompanionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Privacy-safe personal-note receipt after a companion userNotes action. */
  userNotes?: UserNotesPayload;
}

export const PRISM_COMPANION_TOOL_IDS = [
  "settings",
  "marketplace",
  "avatar-studio",
  "images",
] as const;

export type PrismCompanionToolId = (typeof PRISM_COMPANION_TOOL_IDS)[number];

export const PRISM_COMPANION_HANDOFF_DIRECTIONS = [
  "zen-to-slate",
  "slate-to-zen",
] as const;

export type PrismCompanionHandoffDirection =
  (typeof PRISM_COMPANION_HANDOFF_DIRECTIONS)[number];

export type PrismCompanionActionIntent =
  | { type: "navigate"; destination: "home" | "slate" }
  | { type: "open_tool"; tool: PrismCompanionToolId }
  | { type: "create_bot" }
  | { type: "export_bot"; botId: string }
  | { type: "begin_handoff"; direction: PrismCompanionHandoffDirection };

export interface PrismCompanionRequest {
  surface: PrismCompanionSurfaceReference;
  message: string;
  recoveryMessages: PrismCompanionMessage[];
  requestId: string;
  contextTokenIds: string[];
  /**
   * Full-size Prism Home uses the same endpoint as the floating companion to
   * probe product commands without replacing an ordinary conversational turn.
   * A non-command returns 204 and never reaches the fallback chat model.
   */
  orchestrationOnly?: boolean;
}

export interface PrismCompanionResponse {
  ok: true;
  message: PrismCompanionMessage;
  actions: PrismCompanionActionIntent[];
  cards: PrismCompanionCardV1[];
  provider: EphemeralChatResolvedProvider;
  model: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > PRISM_COMPANION_REFERENCE_ID_MAX_LENGTH
  ) {
    return undefined;
  }
  return normalized;
}

function boundedDraftText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : "";
}

export function normalizePrismCompanionDebateDraft(
  value: unknown,
): PrismCompanionDebateDraft | undefined {
  if (!isRecord(value)) return undefined;
  const studioPanel =
    value.studioPanel === "cast" ||
    value.studioPanel === "evidence" ||
    value.studioPanel === "archive"
      ? value.studioPanel
      : "motion";
  const format = value.format === "turnabout" ? "turnabout" : "forum";
  const formality =
    value.formality === "free_for_all" ||
    value.formality === "heated" ||
    value.formality === "structured" ||
    value.formality === "parliamentary"
      ? value.formality
      : "plainspoken";
  const playerRole =
    value.playerRole === "participant" || value.playerRole === "spectator"
      ? value.playerRole
      : "judge";
  return {
    studioPanel,
    format,
    formality,
    playerRole,
    playerSideId: value.playerSideId === "against" ? "against" : "for",
    juryEnabled: value.juryEnabled === true,
    moderatorTitle: boundedDraftText(value.moderatorTitle, 72),
    topic: boundedDraftText(value.topic, 1_000),
    motion: boundedDraftText(value.motion, 320),
    forLabel: boundedDraftText(value.forLabel, 32),
    forBrief: boundedDraftText(value.forBrief, 1_200),
    againstLabel: boundedDraftText(value.againstLabel, 32),
    againstBrief: boundedDraftText(value.againstBrief, 1_200),
    exhibitAdjective: boundedDraftText(value.exhibitAdjective, 48),
    exhibitObject: boundedDraftText(value.exhibitObject, 96),
    exhibitObservation: boundedDraftText(value.exhibitObservation, 800),
    evidenceItemCount:
      typeof value.evidenceItemCount === "number" &&
      Number.isFinite(value.evidenceItemCount)
        ? Math.max(0, Math.min(12, Math.trunc(value.evidenceItemCount)))
        : 0,
  };
}

export function isPrismCompanionSurfaceId(
  value: unknown,
): value is PrismCompanionSurfaceId {
  return PRISM_COMPANION_SURFACE_IDS.some((surfaceId) => surfaceId === value);
}

export function normalizePrismCompanionSurfaceReference(
  value: unknown,
): PrismCompanionSurfaceReference {
  if (!isRecord(value) || !isPrismCompanionSurfaceId(value.surfaceId)) {
    throw new Error("A valid Prism surface is required.");
  }
  const botIds = Array.isArray(value.botIds)
    ? Array.from(new Set(value.botIds.map(boundedId).filter(Boolean))).slice(
        0,
        5,
      )
    : [];
  const debateDraft =
    value.surfaceId === "debate"
      ? normalizePrismCompanionDebateDraft(value.debateDraft)
      : undefined;
  return {
    surfaceId: value.surfaceId,
    ...(botIds.length > 0 ? { botIds: botIds as string[] } : {}),
    ...(boundedId(value.conversationId)
      ? { conversationId: boundedId(value.conversationId) }
      : {}),
    ...(boundedId(value.signalShowId)
      ? { signalShowId: boundedId(value.signalShowId) }
      : {}),
    ...(boundedId(value.signalEpisodeId)
      ? { signalEpisodeId: boundedId(value.signalEpisodeId) }
      : {}),
    ...(boundedId(value.slateProjectId)
      ? { slateProjectId: boundedId(value.slateProjectId) }
      : {}),
    ...(boundedId(value.slateSectionId)
      ? { slateSectionId: boundedId(value.slateSectionId) }
      : {}),
    ...(boundedId(value.storySessionId)
      ? { storySessionId: boundedId(value.storySessionId) }
      : {}),
    ...(boundedId(value.debateSessionId)
      ? { debateSessionId: boundedId(value.debateSessionId) }
      : {}),
    ...(debateDraft ? { debateDraft } : {}),
    ...(boundedId(value.imageId) ? { imageId: boundedId(value.imageId) } : {}),
    ...(boundedId(value.libraryGroupId)
      ? { libraryGroupId: boundedId(value.libraryGroupId) }
      : {}),
  };
}

export function normalizePrismCompanionMessages(
  value: unknown,
): PrismCompanionMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .flatMap((message): PrismCompanionMessage[] => {
      if (
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string"
      ) {
        return [];
      }
      const content = message.content.trim();
      if (!content || content.length > PRISM_COMPANION_MESSAGE_MAX_LENGTH) {
        return [];
      }
      const userNotes = normalizeStoredUserNotesPayload(message.userNotes);
      return [
        {
          id: boundedId(message.id) ?? `recovery-${crypto.randomUUID()}`,
          role: message.role,
          content,
          createdAt:
            typeof message.createdAt === "string" && message.createdAt.trim()
              ? message.createdAt
              : new Date(0).toISOString(),
          ...(userNotes ? { userNotes } : {}),
        },
      ];
    })
    .slice(-PRISM_COMPANION_RECOVERY_LIMIT);
}

export function normalizePrismCompanionRequest(
  value: unknown,
): PrismCompanionRequest {
  if (!isRecord(value) || typeof value.message !== "string") {
    throw new Error("A message for Prism is required.");
  }
  const message = value.message.trim();
  if (!message) throw new Error("A message for Prism is required.");
  if (message.length > PRISM_COMPANION_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `Messages for Prism must be ${PRISM_COMPANION_MESSAGE_MAX_LENGTH.toLocaleString()} characters or fewer.`,
    );
  }
  return {
    surface: normalizePrismCompanionSurfaceReference(value.surface),
    message,
    recoveryMessages: normalizePrismCompanionMessages(value.recoveryMessages),
    requestId: boundedId(value.requestId) ?? crypto.randomUUID(),
    contextTokenIds: Array.isArray(value.contextTokenIds)
      ? Array.from(
          new Set(
            value.contextTokenIds
              .map(boundedId)
              .filter((id): id is string => Boolean(id)),
          ),
        ).slice(0, 8)
      : [],
    ...(value.orchestrationOnly === true ? { orchestrationOnly: true } : {}),
  };
}

export function normalizePrismCompanionActionIntent(
  value: unknown,
): PrismCompanionActionIntent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (
    value.type === "navigate" &&
    (value.destination === "home" || value.destination === "slate")
  ) {
    return { type: value.type, destination: value.destination };
  }
  if (
    value.type === "open_tool" &&
    PRISM_COMPANION_TOOL_IDS.some((tool) => tool === value.tool)
  ) {
    return { type: value.type, tool: value.tool as PrismCompanionToolId };
  }
  if (value.type === "create_bot") return { type: value.type };
  if (value.type === "export_bot") {
    const botId = boundedId(value.botId);
    return botId ? { type: value.type, botId } : null;
  }
  if (
    value.type === "begin_handoff" &&
    PRISM_COMPANION_HANDOFF_DIRECTIONS.some(
      (direction) => direction === value.direction,
    )
  ) {
    return {
      type: value.type,
      direction: value.direction as PrismCompanionHandoffDirection,
    };
  }
  return null;
}

export function normalizePrismCompanionActionIntents(
  value: unknown,
): PrismCompanionActionIntent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePrismCompanionActionIntent)
    .filter((action): action is PrismCompanionActionIntent => Boolean(action))
    .slice(0, 3);
}

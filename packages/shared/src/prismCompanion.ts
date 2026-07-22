import type { EphemeralChatResolvedProvider } from "./ephemeralChat.js";
import type { PrismCapabilityId } from "./livingShellProgress.js";

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
  "marketplace",
  "avatar-studio",
  "images",
  "settings",
] as const;

export type PrismCompanionSurfaceId =
  (typeof PRISM_COMPANION_SURFACE_IDS)[number];

export interface PrismCompanionSurfaceReference {
  surfaceId: PrismCompanionSurfaceId;
  botIds?: string[];
  conversationId?: string;
  signalShowId?: string;
  signalEpisodeId?: string;
  slateProjectId?: string;
  slateSectionId?: string;
}

export interface PrismCompanionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export const PRISM_COMPANION_TOOL_IDS = [
  "settings",
  "marketplace",
  "avatar-studio",
  "images",
] as const;

export type PrismCompanionToolId =
  (typeof PRISM_COMPANION_TOOL_IDS)[number];

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
}

export interface PrismCompanionResponse {
  ok: true;
  message: PrismCompanionMessage;
  actions: PrismCompanionActionIntent[];
  provider: EphemeralChatResolvedProvider;
  model: string | null;
  revealedCapabilities: PrismCapabilityId[];
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
    ? Array.from(new Set(value.botIds.map(boundedId).filter(Boolean))).slice(0, 5)
    : [];
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
      return [
        {
          id: boundedId(message.id) ?? `recovery-${crypto.randomUUID()}`,
          role: message.role,
          content,
          createdAt:
            typeof message.createdAt === "string" && message.createdAt.trim()
              ? message.createdAt
              : new Date(0).toISOString(),
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

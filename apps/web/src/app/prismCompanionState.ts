import {
  PRISM_COMPANION_RECOVERY_LIMIT,
  normalizePrismCompanionMessages,
  type PrismCompanionMessage,
  type PrismCompanionSurfaceReference,
} from "@localai/shared";

function safeStoragePart(value: string): string {
  return encodeURIComponent(value).slice(0, 180);
}

export const DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS =
  12 * 60 * 60 * 1_000;

export interface PrismCompanionSessionRecord {
  conversationId: string;
  lastUsedAt: string;
}

export function prismCompanionSurfaceScope(
  surface: PrismCompanionSurfaceReference,
): string {
  return [
    surface.surfaceId,
    ...(surface.botIds ?? []).map((id) => `bot:${id}`),
    surface.conversationId ? `conversation:${surface.conversationId}` : "",
    surface.signalShowId ? `show:${surface.signalShowId}` : "",
    surface.signalEpisodeId ? `episode:${surface.signalEpisodeId}` : "",
    surface.slateProjectId ? `project:${surface.slateProjectId}` : "",
    surface.slateSectionId ? `section:${surface.slateSectionId}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

export function prismCompanionRecoveryStorageKey(
  accountKey: string,
  surface: PrismCompanionSurfaceReference,
): string {
  return `prism_companion_recovery_v1:${safeStoragePart(accountKey)}:${safeStoragePart(prismCompanionSurfaceScope(surface))}`;
}

export function prismCompanionPrivateRecoveryStorageKey(
  accountKey: string,
): string {
  return `prism_companion_private_recovery_v1:${safeStoragePart(accountKey)}`;
}

export function prismCompanionSessionStorageKey(accountKey: string): string {
  return `prism_companion_session_v1:${safeStoragePart(accountKey)}`;
}

export function parsePrismCompanionSessionRecord(
  value: string | null,
): PrismCompanionSessionRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PrismCompanionSessionRecord>;
    const conversationId =
      typeof parsed.conversationId === "string"
        ? parsed.conversationId.trim()
        : "";
    const lastUsedAt =
      typeof parsed.lastUsedAt === "string" ? parsed.lastUsedAt.trim() : "";
    if (!conversationId || conversationId.length > 160 || !lastUsedAt) {
      return null;
    }
    if (!Number.isFinite(Date.parse(lastUsedAt))) return null;
    return { conversationId, lastUsedAt };
  } catch {
    return null;
  }
}

export function prismCompanionSessionIsReusable(
  record: PrismCompanionSessionRecord | null,
  nowMs = Date.now(),
  idleGapMs = DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS,
): record is PrismCompanionSessionRecord {
  if (!record || !Number.isFinite(nowMs)) return false;
  const lastUsedMs = Date.parse(record.lastUsedAt);
  if (!Number.isFinite(lastUsedMs) || lastUsedMs > nowMs) return false;
  const normalizedIdleGapMs =
    Number.isFinite(idleGapMs) && idleGapMs > 0
      ? idleGapMs
      : DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS;
  return nowMs - lastUsedMs < normalizedIdleGapMs;
}

export function touchPrismCompanionSessionRecord(
  conversationId: string,
  nowMs = Date.now(),
): PrismCompanionSessionRecord {
  return {
    conversationId: conversationId.trim(),
    lastUsedAt: new Date(nowMs).toISOString(),
  };
}

export function prismCompanionPositionStorageKey(accountKey: string): string {
  return `prism_companion_position_v1:${safeStoragePart(accountKey)}`;
}

export function prismCompanionSpeechStorageKey(accountKey: string): string {
  return `prism_companion_speech_v1:${safeStoragePart(accountKey)}`;
}

export function parsePrismCompanionSpeechEnabled(
  value: string | null,
): boolean {
  return value !== "false";
}

export function prismCompanionDismissesOnExternalInteraction(
  surface: PrismCompanionSurfaceReference,
): boolean {
  return surface.surfaceId === "zen" || surface.surfaceId === "prism-home";
}

export function parsePrismCompanionRecovery(
  value: string | null,
): PrismCompanionMessage[] {
  if (!value) return [];
  try {
    return normalizePrismCompanionMessages(JSON.parse(value));
  } catch {
    return [];
  }
}

export function retainPrismCompanionRecovery(
  messages: readonly PrismCompanionMessage[],
): PrismCompanionMessage[] {
  return normalizePrismCompanionMessages(
    messages.slice(-PRISM_COMPANION_RECOVERY_LIMIT),
  );
}

export interface PrismCompanionModifierPresentation {
  modifier: "command" | "control" | "option";
  modifierLabel: "Command" | "Control" | "Option";
}

export function prismCompanionModifierPresentation(
  _platform: string,
): PrismCompanionModifierPresentation {
  return { modifier: "option", modifierLabel: "Option" };
}

export function isPrismCompanionModifierKey(
  input: {
    key: string;
    code?: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  },
  platform: string,
): boolean {
  if (!isPrismCompanionPlatformModifier(input, platform)) {
    return false;
  }
  return isPrismCompanionModifierHeld(input, platform);
}

export function isPrismCompanionPlatformModifier(
  input: { key: string; code?: string },
  platform: string,
): boolean {
  void platform;
  return (
    input.key === "Alt" ||
    input.code === "AltLeft" ||
    input.code === "AltRight"
  );
}

export function isPrismCompanionModifierHeld(
  input: {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  },
  platform: string,
): boolean {
  void platform;
  return input.altKey && !input.metaKey && !input.ctrlKey && !input.shiftKey;
}

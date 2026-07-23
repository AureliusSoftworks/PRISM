import {
  PRISM_COMPANION_RECOVERY_LIMIT,
  normalizePrismCompanionMessages,
  type PrismCompanionMessage,
  type PrismCompanionSurfaceReference,
} from "@localai/shared";

function safeStoragePart(value: string): string {
  return encodeURIComponent(value).slice(0, 180);
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

export function isPrismCompanionShortcut(input: {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  platform: string;
}): boolean {
  const spacePressed =
    input.code === "Space" ||
    input.key === " " ||
    input.key === "\u00a0" ||
    input.key === "Spacebar";
  if (!spacePressed || input.metaKey || input.shiftKey) return false;
  const mac = /Mac|iPhone|iPad/u.test(input.platform);
  return mac
    ? input.altKey && !input.ctrlKey
    : input.ctrlKey && !input.altKey;
}

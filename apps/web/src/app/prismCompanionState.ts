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

export interface PrismCompanionModifierPresentation {
  modifier: "option" | "control";
  modifierLabel: "Option" | "Control";
  label: string;
  spokenLabel: string;
  ariaKeyShortcuts: string;
}

export function prismCompanionModifierPresentation(
  platform: string,
): PrismCompanionModifierPresentation {
  return /Mac|iPhone|iPad/u.test(platform)
    ? {
        modifier: "option",
        modifierLabel: "Option",
        label: "⌥ Space",
        spokenLabel: "Option Space",
        ariaKeyShortcuts: "Alt+Space",
      }
    : {
        modifier: "control",
        modifierLabel: "Control",
        label: "Ctrl Space",
        spokenLabel: "Control Space",
        ariaKeyShortcuts: "Control+Space",
      };
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
  const presentation = prismCompanionModifierPresentation(platform);
  if (!isPrismCompanionPlatformModifier(input, platform)) return false;
  if (presentation.modifier === "option") {
    return isPrismCompanionModifierHeld(input, platform);
  }
  return isPrismCompanionModifierHeld(input, platform);
}

export function isPrismCompanionPlatformModifier(
  input: { key: string; code?: string },
  platform: string,
): boolean {
  const presentation = prismCompanionModifierPresentation(platform);
  return presentation.modifier === "option"
    ? input.key === "Alt" ||
        input.code === "AltLeft" ||
        input.code === "AltRight"
    : input.key === "Control" ||
        input.code === "ControlLeft" ||
        input.code === "ControlRight";
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
  const presentation = prismCompanionModifierPresentation(platform);
  if (presentation.modifier === "option") {
    return (
      input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey
    );
  }
  return (
    input.ctrlKey &&
    !input.altKey &&
    !input.metaKey &&
    !input.shiftKey
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
  return prismCompanionModifierPresentation(input.platform).modifier ===
    "option"
    ? input.altKey && !input.ctrlKey
    : input.ctrlKey && !input.altKey;
}

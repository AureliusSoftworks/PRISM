import type { PromptShortcutMetadata } from "@localai/shared";

type PromptShortcutChipPick = Pick<PromptShortcutMetadata, "invocation" | "name">;

export type PromptShortcutPresentation = "expandable" | "popout" | "locked";

export function promptShortcutChipLabel(promptShortcut: PromptShortcutChipPick): string {
  const rawLabel = promptShortcut.invocation.trim() || promptShortcut.name.trim();
  const label = rawLabel.replace(/^\/+/, "").trim();
  return label ? `/${label}` : "/prompt";
}

export function promptShortcutVisualSizingText(
  promptShortcut: PromptShortcutChipPick
): string {
  return promptShortcutChipLabel(promptShortcut);
}

export function promptShortcutResolvedPromptText(
  promptShortcut: Pick<PromptShortcutMetadata, "resolvedPrompt">,
  fallbackPrompt: string
): string {
  return promptShortcut.resolvedPrompt?.trim() || fallbackPrompt.trim();
}

import type { PromptShortcutMetadata } from "@localai/shared";

type PromptShortcutChipPick = Pick<PromptShortcutMetadata, "invocation" | "name">;

export type PromptShortcutPresentation = "expandable" | "locked";

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

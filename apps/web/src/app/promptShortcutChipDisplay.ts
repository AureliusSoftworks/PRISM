import type { PromptShortcutMetadata } from "@localai/shared";

type PromptShortcutChipPick = Pick<PromptShortcutMetadata, "invocation" | "name">;

export type PromptShortcutPresentation = "expandable" | "popout" | "locked";

const PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_PX = 34;
const PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_PX = 16.5;
const PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_LINES = 2;
const PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_LINES = 10;
const PROMPT_SHORTCUT_EXPANDED_WRAP_CHARS_PER_LINE = 42;
const PROMPT_SHORTCUT_EXPANDED_FONT_CURVE_EXPONENT = 0.65;

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

function estimatePromptShortcutExpandedPromptLines(promptSent: string): number {
  const normalized = promptSent.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return 1;
  return normalized.split("\n").reduce((total, line) => {
    const lineLength = line.trim().length;
    return (
      total +
      Math.max(1, Math.ceil(lineLength / PROMPT_SHORTCUT_EXPANDED_WRAP_CHARS_PER_LINE))
    );
  }, 0);
}

export function promptShortcutExpandedPromptFontCapPx(promptSent: string): number {
  const lineCount = estimatePromptShortcutExpandedPromptLines(promptSent);
  if (lineCount <= PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_LINES) {
    return PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_PX;
  }
  if (lineCount >= PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_LINES) {
    return PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_PX;
  }
  const normalized =
    (lineCount - PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_LINES) /
    (PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_LINES -
      PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_LINES);
  const eased = Math.pow(normalized, PROMPT_SHORTCUT_EXPANDED_FONT_CURVE_EXPONENT);
  return Number(
    (
      PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_PX -
      (PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MAX_PX -
        PROMPT_SHORTCUT_EXPANDED_FONT_CAP_MIN_PX) *
        eased
    ).toFixed(2)
  );
}

export function promptShortcutResolvedPromptText(
  promptShortcut: Pick<PromptShortcutMetadata, "resolvedPrompt">,
  fallbackPrompt: string
): string {
  return promptShortcut.resolvedPrompt?.trim() || fallbackPrompt.trim();
}

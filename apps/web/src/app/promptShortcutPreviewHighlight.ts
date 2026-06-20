import type { PromptShortcutWildcardReplacement } from "@localai/shared";

export interface PromptShortcutPreviewHighlightRange {
  start: number;
  end: number;
}

const PROMPT_SHORTCUT_OPTION_GROUP_RE = /\{([^{}\r\n]*\|[^{}\r\n]*)\}/gu;

function normalizePromptShortcutWildcardRanges(
  promptSent: string,
  replacements: readonly PromptShortcutWildcardReplacement[] | undefined
): PromptShortcutPreviewHighlightRange[] {
  if (!promptSent || !Array.isArray(replacements) || replacements.length === 0) return [];
  return replacements
    .map((replacement): PromptShortcutPreviewHighlightRange | null => {
      const start = replacement.start;
      const end = replacement.end;
      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        !Number.isFinite(start) ||
        !Number.isFinite(end)
      ) {
        return null;
      }
      const normalizedStart = Math.floor(start);
      const normalizedEnd = Math.floor(end);
      if (
        normalizedStart < 0 ||
        normalizedEnd <= normalizedStart ||
        normalizedEnd > promptSent.length
      ) {
        return null;
      }
      const value = replacement.value;
      if (typeof value !== "string" || promptSent.slice(normalizedStart, normalizedEnd) !== value) {
        return null;
      }
      return { start: normalizedStart, end: normalizedEnd };
    })
    .filter((range): range is PromptShortcutPreviewHighlightRange => Boolean(range));
}

export function resolvePromptShortcutOptionGroupRanges(
  promptSent: string
): PromptShortcutPreviewHighlightRange[] {
  if (!promptSent) return [];
  const ranges: PromptShortcutPreviewHighlightRange[] = [];
  for (const match of promptSent.matchAll(PROMPT_SHORTCUT_OPTION_GROUP_RE)) {
    const raw = match[0] ?? "";
    const body = match[1] ?? "";
    const start = match.index ?? -1;
    if (start < 0 || raw.length === 0) continue;
    if (promptSent[start - 1] === "{" || promptSent[start + raw.length] === "}") continue;
    const options = body.split("|").map((option) => option.trim());
    if (options.length < 2 || options.some((option) => option.length === 0)) continue;
    ranges.push({ start, end: start + raw.length });
  }
  return ranges;
}

export function resolvePromptShortcutPreviewHighlightRanges(
  promptSent: string,
  replacements: readonly PromptShortcutWildcardReplacement[] | undefined
): PromptShortcutPreviewHighlightRange[] {
  if (!promptSent) return [];
  const ranges = [
    ...normalizePromptShortcutWildcardRanges(promptSent, replacements),
    ...resolvePromptShortcutOptionGroupRanges(promptSent),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: PromptShortcutPreviewHighlightRange[] = [];
  let lastEnd = 0;
  for (const range of ranges) {
    if (range.start < lastEnd) continue;
    merged.push(range);
    lastEnd = range.end;
  }
  return merged;
}

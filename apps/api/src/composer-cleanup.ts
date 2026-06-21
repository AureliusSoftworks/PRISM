import type { PromptShortcutWildcardReplacement } from "@localai/shared";
import type { LlmProvider } from "./providers.ts";

export const COMPOSER_CLEANUP_MAX_INPUT_CHARS = 8000;

export const COMPOSER_CLEANUP_SYSTEM_PROMPT =
  "You are Prism's composer proofreader. Correct spelling, grammar, punctuation, and obvious autocorrect mistakes only. Preserve the user's meaning, tone, markdown, line breaks, emoji, code blocks, names, and URLs. Do not add explanations, labels, quotes, or commentary. Return only the corrected text. If nothing needs correction, return the original text exactly.";

export function readComposerCleanupText(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Composer text is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Composer text is required.");
  }
  if (trimmed.length > COMPOSER_CLEANUP_MAX_INPUT_CHARS) {
    throw new Error("Composer text is too long to clean up at once.");
  }
  return trimmed;
}

export function normalizeComposerCleanupResponse(raw: string, original: string): string {
  const cleaned = raw.trim();
  if (!cleaned) {
    throw new Error("Writing cleanup returned an empty result.");
  }
  const fenced = cleaned.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/);
  const unwrapped = fenced?.[1]?.trim() ?? cleaned;
  if (!unwrapped) {
    throw new Error("Writing cleanup returned an empty result.");
  }
  return unwrapped.length > COMPOSER_CLEANUP_MAX_INPUT_CHARS
    ? original
    : unwrapped;
}

export async function cleanupComposerTextWithModel(args: {
  text: string;
  provider: LlmProvider;
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const text = readComposerCleanupText(args.text);
  const maxTokens = Math.min(1800, Math.max(160, Math.ceil(text.length / 2)));
  const raw = await args.provider.generateResponse(
    [
      { role: "system", content: COMPOSER_CLEANUP_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    {
      model: args.model,
      temperature: 0.05,
      maxTokens,
      signal: args.signal,
    }
  );
  return normalizeComposerCleanupResponse(raw, text);
}

function findReplacementValueRange(
  prompt: string,
  value: string,
  cursor: number
): { start: number; end: number } | null {
  const needle = value.trim();
  if (!needle) return null;

  const exactIndex = prompt.indexOf(needle, cursor);
  if (exactIndex >= 0) {
    return { start: exactIndex, end: exactIndex + needle.length };
  }

  const foldedPrompt = prompt.toLocaleLowerCase();
  const foldedNeedle = needle.toLocaleLowerCase();
  const foldedIndex = foldedPrompt.indexOf(foldedNeedle, cursor);
  if (foldedIndex >= 0) {
    return { start: foldedIndex, end: foldedIndex + needle.length };
  }

  return null;
}

export function realignPromptWildcardReplacements(
  prompt: string,
  replacements: readonly PromptShortcutWildcardReplacement[] | undefined
): PromptShortcutWildcardReplacement[] {
  if (!prompt || !Array.isArray(replacements) || replacements.length === 0) return [];
  let cursor = 0;
  const aligned: PromptShortcutWildcardReplacement[] = [];
  for (const replacement of replacements) {
    const range = findReplacementValueRange(prompt, replacement.value, cursor);
    if (!range) continue;
    const value = prompt.slice(range.start, range.end);
    aligned.push({
      ...replacement,
      value,
      start: range.start,
      end: range.end,
    });
    cursor = range.end;
  }
  return aligned;
}

export async function cleanupResolvedPromptWithModel(args: {
  prompt: string;
  replacements?: readonly PromptShortcutWildcardReplacement[];
  provider: LlmProvider;
  model?: string;
  signal?: AbortSignal;
}): Promise<{
  prompt: string;
  replacements: PromptShortcutWildcardReplacement[];
  changed: boolean;
}> {
  const cleanedPrompt = await cleanupComposerTextWithModel({
    text: args.prompt,
    provider: args.provider,
    model: args.model,
    signal: args.signal,
  });
  return {
    prompt: cleanedPrompt,
    replacements: realignPromptWildcardReplacements(cleanedPrompt, args.replacements),
    changed: cleanedPrompt !== args.prompt,
  };
}

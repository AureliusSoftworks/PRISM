import type { PromptShortcutWildcardReplacement } from "@localai/shared";
import type { LlmProvider } from "./providers.ts";

export const COMPOSER_CLEANUP_MAX_INPUT_CHARS = 8000;

export const COMPOSER_CLEANUP_SYSTEM_PROMPT =
  "You are Prism's composer proofreader. Correct spelling, grammar, punctuation, and obvious autocorrect mistakes only. Preserve the user's meaning, tone, markdown, line breaks, emoji, code blocks, names, and URLs. Do not add explanations, labels, quotes, or commentary. Return only the corrected text. If nothing needs correction, return the original text exactly.";

export const COMPOSER_SEND_CLEANUP_SYSTEM_PROMPT =
  "You are Prism's send-time proofreader. Correct only tiny grammar, a/an article choice, plurality, pronoun, capitalization, punctuation, and spacing issues. Always fix obvious a/an agreement, such as a before consonant sounds and an before vowel sounds. Preserve the user's meaning, tone, markdown, line breaks, emoji, code blocks, names, URLs, and every wildcard-selected concept. When a wildcard value is directly joined to letters or numbers on either side, treat the whole joined word or name as protected and leave it exactly unchanged. Return JSON only: {\"prompt\":\"corrected user-visible prompt only\",\"replacements\":[{\"index\":0,\"value\":\"corrected wildcard value\"}]}. The prompt value must contain only the final message the user meant to send. Never include labels, delimiters, JSON wrappers, wildcard metadata, replacement lists, or explanations inside prompt. The replacements array must contain one entry for each provided replacement index, using the exact value text as it appears in the corrected prompt.";

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

function parseComposerCleanupJson(raw: string): unknown {
  const cleaned = raw.trim();
  const fenced = cleaned.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n```$/);
  const unwrapped = fenced?.[1]?.trim() ?? cleaned;
  try {
    return JSON.parse(unwrapped) as unknown;
  } catch {
    const start = unwrapped.indexOf("{");
    const end = unwrapped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unwrapped.slice(start, end + 1)) as unknown;
    }
    throw new Error("Writing cleanup response was not JSON.");
  }
}

function cleanupLeakDetectionText(value: string): string {
  return value.replace(/\\r\\n|\\n|\\r/gu, "\n");
}

function hasGeneratedCleanupMetadataLeak(value: string): boolean {
  const normalized = cleanupLeakDetectionText(value);
  return (
    /^\s*\{\s*"prompt"\s*:/iu.test(normalized) ||
    /(^|\n)\s*(?:Wildcard replacements|Prompt)\s*:/iu.test(normalized) ||
    /(^|\n)\s*\d+\s*:\s*[A-Z][A-Z0-9_ ]{1,63}\s*=/u.test(normalized) ||
    /<\/?(?:resolved_prompt|wildcard_replacements_json)>/iu.test(normalized)
  );
}

function normalizeSendCleanupPrompt(rawPrompt: string, original: string): string {
  const prompt = normalizeComposerCleanupResponse(rawPrompt, original);
  if (
    hasGeneratedCleanupMetadataLeak(prompt) &&
    !hasGeneratedCleanupMetadataLeak(original)
  ) {
    throw new Error("Writing cleanup leaked prompt metadata.");
  }
  return prompt;
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

function isJoinedWildcardTokenChar(value: string): boolean {
  return /^[\p{L}\p{N}]$/u.test(value);
}

function joinedWildcardTokenRange(
  prompt: string,
  replacement: PromptShortcutWildcardReplacement
): { start: number; end: number } | null {
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
    normalizedEnd > prompt.length ||
    prompt.slice(normalizedStart, normalizedEnd) !== replacement.value
  ) {
    return null;
  }
  const touchesPrevious =
    normalizedStart > 0 &&
    isJoinedWildcardTokenChar(prompt[normalizedStart - 1] ?? "");
  const touchesNext =
    normalizedEnd < prompt.length &&
    isJoinedWildcardTokenChar(prompt[normalizedEnd] ?? "");
  if (!touchesPrevious && !touchesNext) return null;

  let tokenStart = normalizedStart;
  let tokenEnd = normalizedEnd;
  while (
    tokenStart > 0 &&
    isJoinedWildcardTokenChar(prompt[tokenStart - 1] ?? "")
  ) {
    tokenStart -= 1;
  }
  while (
    tokenEnd < prompt.length &&
    isJoinedWildcardTokenChar(prompt[tokenEnd] ?? "")
  ) {
    tokenEnd += 1;
  }
  return { start: tokenStart, end: tokenEnd };
}

function restoreJoinedWildcardTokens(args: {
  prompt: string;
  original: string;
  replacements: readonly PromptShortcutWildcardReplacement[];
}): { prompt: string; protectedIndexes: Set<number>; preserved: boolean } {
  const protectedIndexes = new Set<number>();
  const protectedTokens: Array<{ start: number; end: number; text: string }> = [];
  const protectedTokenKeys = new Set<string>();
  for (const [index, replacement] of args.replacements.entries()) {
    const range = joinedWildcardTokenRange(args.original, replacement);
    if (!range) continue;
    protectedIndexes.add(index);
    const key = `${range.start}:${range.end}`;
    if (protectedTokenKeys.has(key)) continue;
    protectedTokenKeys.add(key);
    protectedTokens.push({
      ...range,
      text: args.original.slice(range.start, range.end),
    });
  }
  protectedTokens.sort((a, b) => a.start - b.start || a.end - b.end);
  if (protectedTokens.length === 0) {
    return { prompt: args.prompt, protectedIndexes, preserved: true };
  }

  let prompt = args.prompt;
  let cursor = 0;
  for (const { text: token } of protectedTokens) {
    const exactIndex = prompt.indexOf(token, cursor);
    if (exactIndex >= 0) {
      cursor = exactIndex + token.length;
      continue;
    }
    const foldedIndex = prompt
      .toLocaleLowerCase()
      .indexOf(token.toLocaleLowerCase(), cursor);
    if (foldedIndex < 0) {
      return { prompt: args.original, protectedIndexes, preserved: false };
    }
    prompt =
      prompt.slice(0, foldedIndex) +
      token +
      prompt.slice(foldedIndex + token.length);
    cursor = foldedIndex + token.length;
  }
  return { prompt, protectedIndexes, preserved: true };
}

function replacementValuesWithoutProtectedJoinedTokens(
  values: ReadonlyMap<number, string>,
  protectedIndexes: ReadonlySet<number>
): ReadonlyMap<number, string> {
  if (protectedIndexes.size === 0 || values.size === 0) return values;
  const filtered = new Map(values);
  for (const index of protectedIndexes) {
    filtered.delete(index);
  }
  return filtered;
}

export function realignPromptWildcardReplacements(
  prompt: string,
  replacements: readonly PromptShortcutWildcardReplacement[] | undefined,
  replacementValues?: ReadonlyMap<number, string>
): PromptShortcutWildcardReplacement[] {
  if (!prompt || !Array.isArray(replacements) || replacements.length === 0) return [];
  let cursor = 0;
  const aligned: PromptShortcutWildcardReplacement[] = [];
  for (const [index, replacement] of replacements.entries()) {
    const preferredValue = replacementValues?.get(index)?.trim();
    const lookupValue = preferredValue || replacement.value;
    const range = findReplacementValueRange(prompt, lookupValue, cursor);
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

function normalizeSendCleanupReplacementValues(
  value: unknown,
  replacements: readonly PromptShortcutWildcardReplacement[]
): Map<number, string> {
  const values = new Map<number, string>();
  if (!Array.isArray(value)) return values;
  for (let fallbackIndex = 0; fallbackIndex < value.length; fallbackIndex += 1) {
    const row = value[fallbackIndex];
    const record =
      row && typeof row === "object" && !Array.isArray(row)
        ? row as Record<string, unknown>
        : null;
    const indexValue = record?.index;
    const index =
      typeof indexValue === "number" && Number.isInteger(indexValue)
        ? indexValue
        : fallbackIndex;
    if (index < 0 || index >= replacements.length) continue;
    const rawValue = record?.value;
    if (typeof rawValue !== "string") continue;
    const normalized = rawValue.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    values.set(index, normalized.slice(0, 96).trim());
  }
  return values;
}

function normalizeSendCleanupResponse(
  raw: string,
  original: string,
  replacements: readonly PromptShortcutWildcardReplacement[]
): {
  prompt: string;
  replacementValues: Map<number, string>;
} {
  try {
    const parsed = parseComposerCleanupJson(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.prompt === "string") {
        return {
          prompt: normalizeSendCleanupPrompt(record.prompt, original),
          replacementValues: normalizeSendCleanupReplacementValues(
            record.replacements,
            replacements
          ),
        };
      }
    }
  } catch {
    // Older/manual-style providers may still return plain corrected text.
  }
  return {
    prompt: normalizeSendCleanupPrompt(raw, original),
    replacementValues: new Map(),
  };
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
  const prompt = readComposerCleanupText(args.prompt);
  const replacements = args.replacements ?? [];
  if (replacements.length === 0) {
    return {
      prompt,
      replacements: [],
      changed: false,
    };
  }
  const maxTokens = Math.min(1800, Math.max(180, Math.ceil(prompt.length / 2)));
  const raw = await args.provider.generateResponse(
    [
      { role: "system", content: COMPOSER_SEND_CLEANUP_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "<resolved_prompt>",
          prompt,
          "</resolved_prompt>",
          "",
          "<wildcard_replacements_json>",
          JSON.stringify(
            replacements.map((replacement, index) => ({
              index,
              key: replacement.key,
              value: replacement.value,
            }))
          ),
          "</wildcard_replacements_json>",
        ].join("\n"),
      },
    ],
    {
      model: args.model,
      temperature: 0.05,
      maxTokens,
      jsonMode: true,
      signal: args.signal,
    }
  );
  const cleanup = normalizeSendCleanupResponse(raw, prompt, replacements);
  const protectedCleanup = restoreJoinedWildcardTokens({
    prompt: cleanup.prompt,
    original: prompt,
    replacements,
  });
  if (!protectedCleanup.preserved) {
    return {
      prompt,
      replacements: replacements.map((replacement) => ({ ...replacement })),
      changed: false,
    };
  }
  const replacementValues = replacementValuesWithoutProtectedJoinedTokens(
    cleanup.replacementValues,
    protectedCleanup.protectedIndexes
  );
  const alignedReplacements = realignPromptWildcardReplacements(
    protectedCleanup.prompt,
    replacements,
    replacementValues
  );
  if (replacements.length > 0 && alignedReplacements.length !== replacements.length) {
    throw new Error("Writing cleanup could not realign wildcard replacements.");
  }
  return {
    prompt: protectedCleanup.prompt,
    replacements: alignedReplacements,
    changed: protectedCleanup.prompt !== prompt,
  };
}

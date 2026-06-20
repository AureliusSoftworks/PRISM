import type { PromptShortcutWildcardReplacement } from "@localai/shared";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "./providers.ts";

const PROMPT_WILDCARD_SYSTEM_PROMPT =
  "You fill prompt-template wildcards. Return JSON only. For each requested wildcard occurrence key, choose one concrete replacement value that fits the surrounding prompt. Values should be short natural words or phrases, not explanations, not placeholders, and not wrapped in braces. Treat repeated wildcard keys as independent random draws unless the occurrence key explicitly repeats.";
const PROMPT_WILDCARD_PATTERN = /\{([A-Z][A-Z0-9_ ]{1,63})\}/g;
const PROMPT_WILDCARD_MAX_KEYS = 16;
const PROMPT_WILDCARD_VALUE_MAX_CHARS = 96;

interface PromptWildcardOccurrence {
  key: string;
  requestKey: string;
  token: string;
  start: number;
  end: number;
}

export interface PromptWildcardResolution {
  prompt: string;
  replacements: PromptShortcutWildcardReplacement[];
}

export function normalizePromptWildcardKey(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, "_").toUpperCase()
    : "";
}

function promptWildcardOccurrences(prompt: string): PromptWildcardOccurrence[] {
  const occurrences: PromptWildcardOccurrence[] = [];
  const countsByKey = new Map<string, number>();
  for (const match of prompt.matchAll(PROMPT_WILDCARD_PATTERN)) {
    const token = match[0] ?? "";
    const key = normalizePromptWildcardKey(match[1]);
    const start = match.index ?? -1;
    if (!key || !token || start < 0) continue;
    const count = (countsByKey.get(key) ?? 0) + 1;
    countsByKey.set(key, count);
    occurrences.push({
      key,
      requestKey: `${key}__${count}`,
      token,
      start,
      end: start + token.length,
    });
    if (occurrences.length >= PROMPT_WILDCARD_MAX_KEYS) break;
  }
  return occurrences;
}

export function promptWildcardNames(prompt: string): string[] {
  return promptWildcardOccurrences(prompt).map((occurrence) => occurrence.key);
}

function parsePromptWildcardJson(raw: string): unknown {
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
    throw new Error("Wildcard response was not JSON.");
  }
}

function normalizePromptWildcardValue(value: unknown, wildcardName: string): string | null {
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";
  const normalized = raw
    .replace(/[{}]/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROMPT_WILDCARD_VALUE_MAX_CHARS)
    .trim();
  if (!normalized) return null;
  if (normalizePromptWildcardKey(normalized) === wildcardName) return null;
  return normalized;
}

function recordValue(record: Record<string, unknown>, key: string): unknown {
  return (
    record[key] ??
    record[key.toLowerCase()] ??
    record[key.replace(/_/g, " ")] ??
    record[key.replace(/_/g, " ").toUpperCase()] ??
    record[key.toLowerCase().replace(/_/g, " ")]
  );
}

function extractPromptWildcardValues(
  raw: string,
  occurrences: readonly PromptWildcardOccurrence[]
): Map<string, string> {
  const parsed = parsePromptWildcardJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return new Map();
  }
  const root = parsed as Record<string, unknown>;
  const nested = ["wildcards", "values", "replacements"].find(
    (key) => root[key] && typeof root[key] === "object" && !Array.isArray(root[key])
  );
  const record = nested ? (root[nested] as Record<string, unknown>) : root;
  const values = new Map<string, string>();
  const occurrenceCountByKey = occurrences.reduce((counts, occurrence) => {
    counts.set(occurrence.key, (counts.get(occurrence.key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  for (const occurrence of occurrences) {
    const requestValue = recordValue(record, occurrence.requestKey);
    const keyValue =
      (occurrenceCountByKey.get(occurrence.key) ?? 0) === 1
        ? recordValue(record, occurrence.key)
        : undefined;
    const normalized = normalizePromptWildcardValue(
      requestValue ?? keyValue,
      occurrence.key
    );
    if (normalized) values.set(occurrence.requestKey, normalized);
  }
  return values;
}

export function normalizeComposerWildcardValueResponse(
  raw: string,
  slot: { key: string; label: string }
): string {
  let candidate: unknown = raw;
  try {
    const parsed = parsePromptWildcardJson(raw);
    if (typeof parsed === "string") {
      candidate = parsed;
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      candidate =
        record.value ??
        record[slot.key] ??
        record[slot.label] ??
        record[slot.key.toLowerCase()] ??
        record[slot.label.toLowerCase()];
    }
  } catch {
    candidate = raw;
  }
  const normalized =
    normalizePromptWildcardValue(candidate, slot.key) ??
    normalizePromptWildcardValue(raw, slot.key);
  if (!normalized) {
    throw new Error("Wildcard generator returned an empty value.");
  }
  const cleaned = normalized.replace(/[.!?]+$/u, "").trim();
  if (!cleaned) {
    throw new Error("Wildcard generator returned an empty value.");
  }
  return cleaned;
}

function normalizePromptShortcutReplacementRangesForPrompt(
  prompt: string,
  replacements: readonly PromptShortcutWildcardReplacement[] | undefined
): PromptShortcutWildcardReplacement[] {
  if (!prompt || !Array.isArray(replacements) || replacements.length === 0) return [];
  let lastEnd = 0;
  return replacements
    .map((replacement): PromptShortcutWildcardReplacement | null => {
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
        normalizedEnd > prompt.length
      ) {
        return null;
      }
      const value = replacement.value;
      if (typeof value !== "string" || prompt.slice(normalizedStart, normalizedEnd) !== value) {
        return null;
      }
      const key =
        typeof replacement.key === "string" && replacement.key.trim()
          ? replacement.key.trim().slice(0, 64)
          : "OPTION";
      return {
        key,
        value,
        start: normalizedStart,
        end: normalizedEnd,
      };
    })
    .filter((range): range is PromptShortcutWildcardReplacement => Boolean(range))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0))
    .filter((range) => {
      const start = range.start ?? 0;
      const end = range.end ?? 0;
      if (start < lastEnd) return false;
      lastEnd = end;
      return true;
    });
}

export function applyPromptWildcardValues(
  prompt: string,
  values: ReadonlyMap<string, string>,
  existingReplacements?: readonly PromptShortcutWildcardReplacement[]
): PromptWildcardResolution {
  const occurrences = promptWildcardOccurrences(prompt);
  const preservedReplacements = normalizePromptShortcutReplacementRangesForPrompt(
    prompt,
    existingReplacements
  );
  if (values.size === 0 || occurrences.length === 0) {
    return { prompt, replacements: preservedReplacements };
  }
  let resolved = "";
  let cursor = 0;
  const replacements: PromptShortcutWildcardReplacement[] = [];
  const preserveSegmentReplacements = (
    segmentStart: number,
    segmentEnd: number,
    resolvedSegmentStart: number
  ) => {
    for (const replacement of preservedReplacements) {
      const start = replacement.start ?? -1;
      const end = replacement.end ?? -1;
      if (start < segmentStart || end > segmentEnd) continue;
      replacements.push({
        ...replacement,
        start: resolvedSegmentStart + (start - segmentStart),
        end: resolvedSegmentStart + (end - segmentStart),
      });
    }
  };
  for (const occurrence of occurrences) {
    const segmentStart = cursor;
    const segmentEnd = occurrence.start;
    const resolvedSegmentStart = resolved.length;
    resolved += prompt.slice(segmentStart, segmentEnd);
    preserveSegmentReplacements(segmentStart, segmentEnd, resolvedSegmentStart);
    const value = values.get(occurrence.requestKey);
    if (value) {
      const start = resolved.length;
      resolved += value;
      replacements.push({
        key: occurrence.key,
        value,
        start,
        end: start + value.length,
      });
    } else {
      resolved += occurrence.token;
    }
    cursor = occurrence.end;
  }
  const finalSegmentStart = cursor;
  const finalResolvedSegmentStart = resolved.length;
  resolved += prompt.slice(finalSegmentStart);
  preserveSegmentReplacements(finalSegmentStart, prompt.length, finalResolvedSegmentStart);
  return {
    prompt: resolved,
    replacements: replacements.sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0)
    ),
  };
}

export async function resolvePromptWildcardsWithModel(args: {
  prompt: string;
  provider: LlmProvider;
  generationOverrides: GenerateOptions;
  existingReplacements?: readonly PromptShortcutWildcardReplacement[];
  signal?: AbortSignal;
}): Promise<PromptWildcardResolution> {
  const occurrences = promptWildcardOccurrences(args.prompt);
  if (occurrences.length === 0) {
    return {
      prompt: args.prompt,
      replacements: normalizePromptShortcutReplacementRangesForPrompt(
        args.prompt,
        args.existingReplacements
      ),
    };
  }
  try {
    const exampleKey = occurrences[0]?.requestKey ?? "ADJECTIVE__1";
    const promptMessages: ProviderMessage[] = [
      { role: "system", content: PROMPT_WILDCARD_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Prompt template:",
          args.prompt,
          "",
          "Wildcard occurrences:",
          ...occurrences.map(
            (occurrence) =>
              `- ${occurrence.requestKey}: ${occurrence.token} at character ${occurrence.start} (wildcard key ${occurrence.key})`
          ),
          "",
          `Return a single JSON object whose keys are exactly those occurrence keys, for example: {"${exampleKey}":"stinky"}.`,
          "Each occurrence is an independent random draw, even when two occurrences share the same wildcard key.",
          "Choose values that make the prompt vivid and coherent. Do not rewrite the prompt.",
        ].join("\n"),
      },
    ];
    const raw = await args.provider.generateResponse(promptMessages, {
      ...args.generationOverrides,
      temperature: Math.max(0.6, args.generationOverrides.temperature ?? 0.72),
      maxTokens: Math.min(900, Math.max(160, occurrences.length * 70)),
      jsonMode: true,
      signal: args.signal,
    });
    const values = extractPromptWildcardValues(raw, occurrences);
    return applyPromptWildcardValues(args.prompt, values, args.existingReplacements);
  } catch (error) {
    console.warn(
      "[prompt-wildcards] leaving prompt wildcards unresolved:",
      error instanceof Error ? error.message : error
    );
    return {
      prompt: args.prompt,
      replacements: normalizePromptShortcutReplacementRangesForPrompt(
        args.prompt,
        args.existingReplacements
      ),
    };
  }
}

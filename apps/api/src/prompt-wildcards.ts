import { randomInt } from "node:crypto";
import {
  getBuiltInPromptWildcardSlot,
  isDisabledPromptWildcardToken,
  parseBuiltInPromptWildcardReference,
  type PromptShortcutWildcardReplacement,
} from "@localai/shared";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "./providers.ts";
import {
  SCRIPTED_PROMPT_NOUN_PAIRS,
  SCRIPTED_PROMPT_WILDCARD_VALUES,
} from "./prompt-wildcard-seeds.ts";

const PROMPT_WILDCARD_SYSTEM_PROMPT =
  "You fill prompt-template wildcards. Return JSON only. The wildcard key and generation rule are authoritative: never change a PERSON into an adjective, an ADJECTIVE into a person, or any other key into a different kind of value just because nearby grammar suggests it. For each requested wildcard occurrence key, choose one concrete replacement value that satisfies that wildcard type and still fits the surrounding prompt. Values should be short natural words or phrases, not explanations, not placeholders, and not wrapped in braces. Treat repeated wildcard keys as independent random draws unless the occurrence key explicitly repeats.";
const PROMPT_WILDCARD_PATTERN = /\{([^{}\r\n]{1,80})\}/g;
const PROMPT_WILDCARD_MAX_KEYS = 16;
const PROMPT_WILDCARD_VALUE_MAX_CHARS = 96;
const PROMPT_WILDCARD_GENERIC_FALLBACK_VALUES = [
  "vivid",
  "curious",
  "golden",
  "hidden",
  "restless",
  "luminous",
] as const;

function randomScriptedValue(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  return values[randomInt(values.length)] ?? null;
}

export function generateScriptedPromptWildcardValue(
  keyOrSlot: string | { key: string },
  usedValues?: Set<string>
): string | null {
  const key = normalizePromptWildcardKey(
    typeof keyOrSlot === "string" ? keyOrSlot : keyOrSlot.key
  );
  if (!key) return null;
  if (key === "NUM") {
    return String(randomInt(1, 11));
  }
  const values = SCRIPTED_PROMPT_WILDCARD_VALUES[key];
  if (!values || values.length === 0) return null;
  const availableValues =
    usedValues && usedValues.size < values.length
      ? values.filter((value) => !usedValues.has(value.toLowerCase()))
      : values;
  const value = randomScriptedValue(
    availableValues.length > 0 ? availableValues : values
  );
  if (value && usedValues) usedValues.add(value.toLowerCase());
  return value;
}

function randomNounPairIndex(usedPairIndexes?: Set<number>): number | null {
  if (SCRIPTED_PROMPT_NOUN_PAIRS.length === 0) return null;
  const indexes = SCRIPTED_PROMPT_NOUN_PAIRS.map((_, index) => index);
  const availableIndexes =
    usedPairIndexes && usedPairIndexes.size < indexes.length
      ? indexes.filter((index) => !usedPairIndexes.has(index))
      : indexes;
  const index = availableIndexes[randomInt(availableIndexes.length)] ?? null;
  if (index !== null && usedPairIndexes) usedPairIndexes.add(index);
  return index;
}

function promptWildcardValueFromNounPair(key: string, pairIndex: number): string | null {
  const pair = SCRIPTED_PROMPT_NOUN_PAIRS[pairIndex];
  if (!pair) return null;
  if (key === "NOUN") return pair.singular;
  if (key === "PLURAL_NOUN") return pair.plural;
  return null;
}

function isNounPairWildcardKey(key: string): boolean {
  return key === "NOUN" || key === "PLURAL_NOUN";
}

function normalizeNounPluralShorthandPrompt(
  prompt: string,
  existingReplacements?: readonly PromptShortcutWildcardReplacement[]
): {
  prompt: string;
  existingReplacements?: readonly PromptShortcutWildcardReplacement[];
} {
  const shorthandRe = /\{NOUN(\d*)\}s\b/g;
  let match: RegExpExecArray | null;
  let output = "";
  let cursor = 0;
  const adjustments: Array<{ start: number; end: number; delta: number }> = [];
  while ((match = shorthandRe.exec(prompt))) {
    const token = match[0] ?? "";
    const reference = match[1] ?? "";
    const start = match.index;
    const end = start + token.length;
    const replacement = `{PLURAL_NOUN${reference}}`;
    output += prompt.slice(cursor, start);
    output += replacement;
    adjustments.push({ start, end, delta: replacement.length - token.length });
    cursor = end;
  }
  if (adjustments.length === 0) {
    return existingReplacements
      ? { prompt, existingReplacements }
      : { prompt };
  }
  output += prompt.slice(cursor);
  if (!existingReplacements) return { prompt: output };
  const adjustedReplacements = existingReplacements
    .map((replacement): PromptShortcutWildcardReplacement | null => {
      let start = replacement.start;
      let end = replacement.end;
      if (typeof start !== "number" || typeof end !== "number") return replacement;
      for (const adjustment of adjustments) {
        if (end <= adjustment.start) continue;
        if (start >= adjustment.end) {
          start += adjustment.delta;
          end += adjustment.delta;
          continue;
        }
        return null;
      }
      return { ...replacement, start, end };
    })
    .filter((replacement): replacement is PromptShortcutWildcardReplacement =>
      Boolean(replacement)
    );
  return { prompt: output, existingReplacements: adjustedReplacements };
}

interface PromptWildcardOccurrence {
  key: string;
  requestKey: string;
  token: string;
  start: number;
  end: number;
  reference: string | null;
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

function parsePromptWildcardOccurrenceName(value: unknown): {
  key: string;
  reference: string | null;
} {
  if (isDisabledPromptWildcardToken(value)) return { key: "", reference: null };
  const builtInReference = parseBuiltInPromptWildcardReference(value);
  if (builtInReference) {
    return { key: builtInReference.key, reference: builtInReference.reference };
  }
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_ ]{1,63}$/u.test(value.trim())) {
    return { key: "", reference: null };
  }
  const key = normalizePromptWildcardKey(value);
  if (isDisabledPromptWildcardToken(key)) return { key: "", reference: null };
  const numbered = key.match(/^(.+?)(\d+)$/u);
  if (!numbered) return { key, reference: null };
  const base = numbered[1] ?? "";
  const reference = numbered[2]?.replace(/^0+(?=\d)/u, "") ?? "";
  if (!base || !reference) return { key, reference: null };
  if (isDisabledPromptWildcardToken(base)) return { key: "", reference: null };
  return { key: base, reference };
}

function promptWildcardOccurrences(prompt: string): PromptWildcardOccurrence[] {
  const occurrences: PromptWildcardOccurrence[] = [];
  const countsByKey = new Map<string, number>();
  for (const match of prompt.matchAll(PROMPT_WILDCARD_PATTERN)) {
    const token = match[0] ?? "";
    const parsedName = parsePromptWildcardOccurrenceName(match[1]);
    const key = parsedName.key;
    const start = match.index ?? -1;
    if (!key || !token || start < 0) continue;
    const count = parsedName.reference ? 0 : (countsByKey.get(key) ?? 0) + 1;
    if (!parsedName.reference) countsByKey.set(key, count);
    occurrences.push({
      key,
      requestKey: parsedName.reference
        ? `${key}__REF_${parsedName.reference}`
        : `${key}__${count}`,
      token,
      start,
      end: start + token.length,
      reference: parsedName.reference,
    });
    if (occurrences.length >= PROMPT_WILDCARD_MAX_KEYS) break;
  }
  return occurrences;
}

function promptWildcardRequestLines(
  occurrences: readonly PromptWildcardOccurrence[]
): string[] {
  const grouped = new Map<
    string,
    { occurrence: PromptWildcardOccurrence; starts: number[]; tokens: Set<string> }
  >();
  for (const occurrence of occurrences) {
    const existing = grouped.get(occurrence.requestKey);
    if (existing) {
      existing.starts.push(occurrence.start);
      existing.tokens.add(occurrence.token);
      continue;
    }
    grouped.set(occurrence.requestKey, {
      occurrence,
      starts: [occurrence.start],
      tokens: new Set([occurrence.token]),
    });
  }
  return [...grouped.values()].map(({ occurrence, starts, tokens }) => {
    const tokenLabel = [...tokens].join(", ");
    const startsLabel = starts.join(", ");
    const referenceLabel = occurrence.reference
      ? `, reference ${occurrence.reference}`
      : "";
    const slot = getBuiltInPromptWildcardSlot(occurrence.key);
    const generationRule = slot
      ? ` Rule: ${slot.generationHint}`
      : " Rule: Return a short value matching this custom wildcard key.";
    return `- ${occurrence.requestKey}: ${tokenLabel} at character ${startsLabel} (wildcard key ${occurrence.key}${referenceLabel}).${generationRule}`;
  });
}

export function promptWildcardNames(prompt: string): string[] {
  return promptWildcardOccurrences(normalizeNounPluralShorthandPrompt(prompt).prompt).map(
    (occurrence) => occurrence.key
  );
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

function uniquePromptWildcardRequestCountByKey(
  occurrences: readonly PromptWildcardOccurrence[]
): Map<string, number> {
  const requestKeysByKey = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    const requestKeys = requestKeysByKey.get(occurrence.key) ?? new Set<string>();
    requestKeys.add(occurrence.requestKey);
    requestKeysByKey.set(occurrence.key, requestKeys);
  }
  const counts = new Map<string, number>();
  for (const [key, requestKeys] of requestKeysByKey) {
    counts.set(key, requestKeys.size);
  }
  return counts;
}

function promptWildcardRecordValueForOccurrence(
  record: Record<string, unknown>,
  occurrence: PromptWildcardOccurrence,
  requestCountByKey: ReadonlyMap<string, number>
): unknown {
  const rawTokenName = occurrence.token.replace(/[{}]/g, "");
  const directValue =
    recordValue(record, occurrence.requestKey) ??
    recordValue(record, rawTokenName) ??
    (occurrence.reference
      ? recordValue(record, `${occurrence.key}${occurrence.reference}`) ??
        recordValue(record, `${occurrence.key}_${occurrence.reference}`) ??
        recordValue(record, `${occurrence.key} ${occurrence.reference}`)
      : undefined);
  if (directValue !== undefined) return directValue;
  return (requestCountByKey.get(occurrence.key) ?? 0) === 1
    ? recordValue(record, occurrence.key)
    : undefined;
}

function fallbackPromptWildcardValue(occurrence: PromptWildcardOccurrence): string {
  return (
    generateScriptedPromptWildcardValue(occurrence.key) ??
    randomScriptedValue(PROMPT_WILDCARD_GENERIC_FALLBACK_VALUES) ??
    "vivid"
  );
}

function scriptedPromptWildcardValuesForOccurrences(
  occurrences: readonly PromptWildcardOccurrence[]
): Map<string, string> {
  const values = new Map<string, string>();
  const usedValuesByKey = new Map<string, Set<string>>();
  const nounPairIndexesByReference = new Map<string, number>();
  const usedNounPairIndexes = new Set<number>();
  for (const occurrence of occurrences) {
    if (values.has(occurrence.requestKey)) continue;
    if (!getBuiltInPromptWildcardSlot(occurrence.key)) continue;
    if (occurrence.reference && isNounPairWildcardKey(occurrence.key)) {
      let pairIndex = nounPairIndexesByReference.get(occurrence.reference);
      if (pairIndex === undefined) {
        pairIndex = randomNounPairIndex(usedNounPairIndexes) ?? undefined;
        if (pairIndex !== undefined) {
          nounPairIndexesByReference.set(occurrence.reference, pairIndex);
        }
      }
      if (pairIndex !== undefined) {
        const pairValue = promptWildcardValueFromNounPair(occurrence.key, pairIndex);
        if (pairValue) {
          values.set(occurrence.requestKey, pairValue);
          continue;
        }
      }
    }
    const usedValues = usedValuesByKey.get(occurrence.key) ?? new Set<string>();
    const value = generateScriptedPromptWildcardValue(occurrence.key, usedValues);
    if (!value) continue;
    usedValuesByKey.set(occurrence.key, usedValues);
    values.set(occurrence.requestKey, value);
  }
  return values;
}

function fillMissingPromptWildcardValues(
  values: Map<string, string>,
  occurrences: readonly PromptWildcardOccurrence[]
): Map<string, string> {
  const filled = new Map(values);
  for (const occurrence of occurrences) {
    if (filled.has(occurrence.requestKey)) continue;
    filled.set(occurrence.requestKey, fallbackPromptWildcardValue(occurrence));
  }
  return filled;
}

function extractPromptWildcardValues(
  raw: string,
  occurrences: readonly PromptWildcardOccurrence[]
): Map<string, string> {
  const parsed = parsePromptWildcardJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fillMissingPromptWildcardValues(new Map(), occurrences);
  }
  const root = parsed as Record<string, unknown>;
  const nested = ["wildcards", "values", "replacements"].find(
    (key) => root[key] && typeof root[key] === "object" && !Array.isArray(root[key])
  );
  const record = nested ? (root[nested] as Record<string, unknown>) : root;
  const values = new Map<string, string>();
  const requestCountByKey = uniquePromptWildcardRequestCountByKey(occurrences);
  for (const occurrence of occurrences) {
    const requestValue = promptWildcardRecordValueForOccurrence(
      record,
      occurrence,
      requestCountByKey
    );
    const normalized = normalizePromptWildcardValue(
      requestValue,
      occurrence.key
    );
    if (normalized) values.set(occurrence.requestKey, normalized);
  }
  return fillMissingPromptWildcardValues(values, occurrences);
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
        ...replacement,
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
  const normalized = normalizeNounPluralShorthandPrompt(prompt, existingReplacements);
  prompt = normalized.prompt;
  existingReplacements = normalized.existingReplacements;
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
        source: "wildcard",
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
  const normalized = normalizeNounPluralShorthandPrompt(
    args.prompt,
    args.existingReplacements
  );
  const prompt = normalized.prompt;
  const existingReplacements = normalized.existingReplacements;
  const occurrences = promptWildcardOccurrences(prompt);
  if (occurrences.length === 0) {
    return {
      prompt,
      replacements: normalizePromptShortcutReplacementRangesForPrompt(
        prompt,
        existingReplacements
      ),
    };
  }
  const scriptedValues = scriptedPromptWildcardValuesForOccurrences(occurrences);
  const modelOccurrences = occurrences.filter(
    (occurrence) => !scriptedValues.has(occurrence.requestKey)
  );
  if (modelOccurrences.length === 0) {
    return applyPromptWildcardValues(
      prompt,
      scriptedValues,
      existingReplacements
    );
  }
  try {
    const exampleKey = modelOccurrences[0]?.requestKey ?? "CUSTOM__1";
    const promptForModel =
      scriptedValues.size > 0
        ? applyPromptWildcardValues(prompt, scriptedValues).prompt
        : prompt;
    const promptMessages: ProviderMessage[] = [
      { role: "system", content: PROMPT_WILDCARD_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Prompt template:",
          promptForModel,
          "",
          "Wildcard occurrences:",
          ...promptWildcardRequestLines(modelOccurrences),
          "",
          `Return a single JSON object whose keys are exactly those occurrence keys. Include a string property named "${exampleKey}" and the other requested keys.`,
          "Each unique occurrence key is one random draw. If the same occurrence key appears at multiple positions, use that same value everywhere.",
          `Random nonce: ${Math.random().toString(36).slice(2, 12)}`,
          "Choose values that make the prompt vivid and coherent. Do not rewrite the prompt.",
        ].join("\n"),
      },
    ];
    const raw = await args.provider.generateResponse(promptMessages, {
      ...args.generationOverrides,
      temperature: Math.max(0.6, args.generationOverrides.temperature ?? 0.72),
      maxTokens: Math.min(900, Math.max(160, modelOccurrences.length * 70)),
      jsonMode: true,
      signal: args.signal,
    });
    const values = extractPromptWildcardValues(raw, modelOccurrences);
    return applyPromptWildcardValues(
      prompt,
      new Map([...scriptedValues, ...values]),
      existingReplacements
    );
  } catch (error) {
    console.warn(
      "[prompt-wildcards] filling prompt wildcards with local fallbacks:",
      error instanceof Error ? error.message : error
    );
    return applyPromptWildcardValues(
      prompt,
      fillMissingPromptWildcardValues(scriptedValues, modelOccurrences),
      existingReplacements
    );
  }
}

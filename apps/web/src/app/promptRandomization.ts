import {
  getBuiltInPromptWildcardSlot,
  type PromptShortcutWildcardReplacement,
} from "@localai/shared";

export interface PromptRandomizationResolution {
  prompt: string;
  replacements: PromptShortcutWildcardReplacement[];
}

export interface PromptRandomizationDeck {
  name: string;
  values: readonly string[];
  aliases?: readonly string[];
}

export function promptInsertionStartsSentence(before: string): boolean {
  if (/[\r\n]\s*$/u.test(before)) return true;
  const trimmed = before.trimEnd();
  if (!trimmed) return true;
  return /[.!?]["')\]]*$/u.test(trimmed);
}

export function withSentenceCasedPromptInsertion(value: string, before: string): string {
  const shouldStartSentence = promptInsertionStartsSentence(before);
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (!/[A-Za-z]/u.test(char)) continue;
    const word = chars.slice(index).join("").match(/^[A-Za-z]+/u)?.[0] ?? char;
    if (!shouldStartSentence && (word === "I" || (word.length > 1 && /^[A-Z]+$/u.test(word)))) {
      return value;
    }
    const nextChar = shouldStartSentence ? char.toLocaleUpperCase() : char.toLocaleLowerCase();
    if (nextChar === char) return value;
    chars[index] = nextChar;
    return chars.join("");
  }
  return value;
}

export function splitPromptRandomizationOptions(source: string): string[] {
  const options: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "|") {
      options.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  options.push(current.trim());
  return options.filter(Boolean);
}

function normalizePromptRandomizationDeckName(value: string): string {
  return value.trim().replace(/^!+/, "").toLowerCase();
}

function deckReplacementKey(name: string): string {
  return normalizePromptRandomizationDeckName(name)
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase() || "DECK";
}

const BUILT_IN_WILDCARD_INVOCATION_RE =
  /(^|[\s([{])!([a-z0-9][a-z0-9_-]*)(?=\s|$|[.,;:!?)}\]])/giu;

function normalizedPromptRandomizationReplacementsForPrompt(
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
      const value = prompt.slice(normalizedStart, normalizedEnd);
      if (!value) return null;
      return {
        key: replacement.key,
        value,
        start: normalizedStart,
        end: normalizedEnd,
      };
    })
    .filter((replacement): replacement is PromptShortcutWildcardReplacement =>
      Boolean(replacement)
    )
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0))
    .filter((replacement) => {
      const start = replacement.start ?? 0;
      const end = replacement.end ?? 0;
      if (start < lastEnd) return false;
      lastEnd = end;
      return true;
    });
}

export function resolveBuiltInPromptWildcardInvocations(
  source: string,
  existingReplacements?: readonly PromptShortcutWildcardReplacement[]
): PromptRandomizationResolution {
  const preservedReplacements = normalizedPromptRandomizationReplacementsForPrompt(
    source,
    existingReplacements
  );
  let prompt = "";
  let cursor = 0;
  let changed = false;
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

  for (const match of source.matchAll(BUILT_IN_WILDCARD_INVOCATION_RE)) {
    const raw = match[0] ?? "";
    const name = match[2] ?? "";
    const matchIndex = match.index ?? -1;
    const slot = getBuiltInPromptWildcardSlot(name);
    if (matchIndex < 0 || !raw || !name || !slot) continue;
    const delimiterLength = raw.startsWith("!") ? 0 : 1;
    const start = matchIndex + delimiterLength;
    const end = start + 1 + name.length;
    const resolvedSegmentStart = prompt.length;
    prompt += source.slice(cursor, start);
    preserveSegmentReplacements(cursor, start, resolvedSegmentStart);
    prompt += `{${slot.label}}`;
    cursor = end;
    changed = true;
  }

  if (!changed) {
    return { prompt: source, replacements: preservedReplacements };
  }

  const finalResolvedSegmentStart = prompt.length;
  prompt += source.slice(cursor);
  preserveSegmentReplacements(cursor, source.length, finalResolvedSegmentStart);
  return { prompt, replacements };
}

function buildPromptRandomizationDeckLookup(
  decks: readonly PromptRandomizationDeck[] | undefined
): Map<string, PromptRandomizationDeck> {
  const lookup = new Map<string, PromptRandomizationDeck>();
  for (const deck of decks ?? []) {
    const values = deck.values.filter((value) => value.trim().length > 0);
    if (!deck.name.trim() || values.length === 0) continue;
    for (const name of [deck.name, ...(deck.aliases ?? [])]) {
      const key = normalizePromptRandomizationDeckName(name);
      if (key && !lookup.has(key)) lookup.set(key, { ...deck, values });
    }
  }
  return lookup;
}

function sortedPromptRandomizationDeckNames(
  deckLookup: ReadonlyMap<string, PromptRandomizationDeck>
): string[] {
  return [...deckLookup.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function findNextPromptRandomizationDeckToken(
  source: string,
  cursor: number,
  deckLookup: ReadonlyMap<string, PromptRandomizationDeck>
): { start: number; end: number; deck: PromptRandomizationDeck } | null {
  if (deckLookup.size === 0) return null;
  const lowerSource = source.toLowerCase();
  const names = sortedPromptRandomizationDeckNames(deckLookup);
  let searchFrom = cursor;
  while (searchFrom < source.length) {
    const start = source.indexOf("!", searchFrom);
    if (start < 0) return null;
    const afterBang = lowerSource.slice(start + 1);
    const name = names.find((candidate) => afterBang.startsWith(candidate));
    if (!name) {
      searchFrom = start + 1;
      continue;
    }
    const deck = deckLookup.get(name);
    if (!deck) continue;
    return {
      start,
      end: start + 1 + name.length,
      deck,
    };
  }
  return null;
}

export function collapseDeletedPromptWildcardDeckReferences(
  source: string,
  deck: PromptRandomizationDeck
): string {
  const invocationNames = [deck.name, ...(deck.aliases ?? [])]
    .map(normalizePromptRandomizationDeckName)
    .filter(Boolean);
  if (invocationNames.length === 0) return source;
  const names = invocationNames.sort((a, b) => b.length - a.length || a.localeCompare(b));
  const fallback = `{${normalizePromptRandomizationDeckName(deck.name) || "wildcard"}}`;
  const lowerSource = source.toLowerCase();
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("!", cursor);
    if (start < 0) break;
    const afterBang = lowerSource.slice(start + 1);
    const name = names.find((candidate) => afterBang.startsWith(candidate));
    if (!name) {
      output += source.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }
    output += source.slice(cursor, start);
    output += fallback;
    cursor = start + 1 + name.length;
  }
  output += source.slice(cursor);
  return output;
}

export function resolvePromptRandomizationGroups(
  source: string,
  options: {
    random?: () => number;
    decks?: readonly PromptRandomizationDeck[];
  } = {}
): PromptRandomizationResolution {
  const random = options.random ?? Math.random;
  const deckLookup = buildPromptRandomizationDeckLookup(options.decks);
  let prompt = "";
  let cursor = 0;
  const replacements: PromptShortcutWildcardReplacement[] = [];
  while (cursor < source.length) {
    const optionStart = source.indexOf("{", cursor);
    const deckToken = findNextPromptRandomizationDeckToken(source, cursor, deckLookup);
    const useDeck =
      deckToken && (optionStart < 0 || deckToken.start < optionStart);
    const start = useDeck ? deckToken.start : optionStart;
    if (start < 0) {
      prompt += source.slice(cursor);
      break;
    }
    if (useDeck && deckToken) {
      prompt += source.slice(cursor, deckToken.start);
      const choices = deckToken.deck.values.filter((value) => value.trim().length > 0);
      const choiceIndex = Math.min(
        choices.length - 1,
        Math.max(0, Math.floor(random() * choices.length))
      );
      const value = choices[choiceIndex] ?? choices[0] ?? "";
      const replacementStart = prompt.length;
      const casedValue = withSentenceCasedPromptInsertion(value, prompt);
      prompt += casedValue;
      replacements.push({
        key: deckReplacementKey(deckToken.deck.name),
        value: casedValue,
        start: replacementStart,
        end: replacementStart + casedValue.length,
      });
      cursor = deckToken.end;
      continue;
    }
    const end = source.indexOf("}", start + 1);
    if (end < 0) {
      prompt += source.slice(cursor);
      break;
    }
    const body = source.slice(start + 1, end);
    const choices = body.includes("|") ? splitPromptRandomizationOptions(body) : [];
    prompt += source.slice(cursor, start);
    if (choices.length > 0) {
      const choiceIndex = Math.min(
        choices.length - 1,
        Math.max(0, Math.floor(random() * choices.length))
      );
      const value = choices[choiceIndex] ?? choices[0] ?? "";
      const replacementStart = prompt.length;
      const casedValue = withSentenceCasedPromptInsertion(value, prompt);
      prompt += casedValue;
      replacements.push({
        key: "OPTION",
        value: casedValue,
        start: replacementStart,
        end: replacementStart + casedValue.length,
      });
    } else {
      prompt += source.slice(start, end + 1);
    }
    cursor = end + 1;
  }
  return { prompt, replacements };
}

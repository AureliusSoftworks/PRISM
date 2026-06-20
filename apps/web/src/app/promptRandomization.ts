import type { PromptShortcutWildcardReplacement } from "@localai/shared";

export interface PromptRandomizationResolution {
  prompt: string;
  replacements: PromptShortcutWildcardReplacement[];
}

export interface PromptRandomizationDeck {
  name: string;
  values: readonly string[];
  aliases?: readonly string[];
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

function findNextPromptRandomizationDeckToken(
  source: string,
  cursor: number,
  deckLookup: ReadonlyMap<string, PromptRandomizationDeck>
): { start: number; end: number; deck: PromptRandomizationDeck } | null {
  if (deckLookup.size === 0) return null;
  const tokenRe = /(^|[\s([{])!([a-z0-9][a-z0-9_-]*)(?=\s|$|[.,;:!?)}\]])/giu;
  tokenRe.lastIndex = cursor;
  for (const match of source.matchAll(tokenRe)) {
    const raw = match[0] ?? "";
    const delimiter = match[1] ?? "";
    const name = match[2] ?? "";
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0 || !name) continue;
    const start = matchIndex + delimiter.length;
    if (start < cursor) continue;
    const deck = deckLookup.get(normalizePromptRandomizationDeckName(name));
    if (!deck) continue;
    return {
      start,
      end: matchIndex + raw.length,
      deck,
    };
  }
  return null;
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
      prompt += value;
      replacements.push({
        key: deckReplacementKey(deckToken.deck.name),
        value,
        start: replacementStart,
        end: replacementStart + value.length,
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
      prompt += value;
      replacements.push({
        key: "OPTION",
        value,
        start: replacementStart,
        end: replacementStart + value.length,
      });
    } else {
      prompt += source.slice(start, end + 1);
    }
    cursor = end + 1;
  }
  return { prompt, replacements };
}

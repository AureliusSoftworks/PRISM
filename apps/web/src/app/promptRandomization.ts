import {
  isDisabledPromptWildcardToken,
  parseBuiltInPromptWildcardReference,
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

export function pendingWildcardOptimisticMessageContent(options: {
  rawDraft: string;
  resolvedDisplayContent: string;
  pendingWildcardResolution: boolean;
}): string {
  const rawDraft = options.rawDraft.trim();
  const resolvedDisplayContent = options.resolvedDisplayContent.trim();
  if (options.pendingWildcardResolution) {
    return rawDraft || resolvedDisplayContent;
  }
  return resolvedDisplayContent || rawDraft;
}

export function resendDraftTextForMessage(options: {
  content: string;
  commandAliasOriginalText?: string | null;
  promptShortcutTemplate?: string | null;
  promptWildcardTemplate?: string | null;
}): string {
  return (
    options.promptWildcardTemplate?.trim() ||
    options.promptShortcutTemplate?.trim() ||
    options.commandAliasOriginalText?.trim() ||
    options.content.trim()
  );
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
    if (!shouldStartSentence) {
      return value;
    }
    const nextChar = char.toLocaleUpperCase();
    if (nextChar === char) return value;
    chars[index] = nextChar;
    return chars.join("");
  }
  return value;
}

function promptShortcutFollowingPunctuation(after: string): string {
  const match = /\S/u.exec(after);
  return match?.[0] ?? "";
}

function withInlinePromptShortcutCasing(value: string, before: string): string {
  if (promptInsertionStartsSentence(before)) {
    return withSentenceCasedPromptInsertion(value, before);
  }
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (!/[A-Za-z]/u.test(char)) continue;
    const nextChar = chars[index + 1] ?? "";
    if (char === "I" && !/[A-Za-z]/u.test(nextChar)) return value;
    if (char === char.toLocaleUpperCase() && nextChar === nextChar.toLocaleUpperCase()) {
      return value;
    }
    const lowered = char.toLocaleLowerCase();
    if (lowered === char) return value;
    chars[index] = lowered;
    return chars.join("");
  }
  return value;
}

export function formatPromptShortcutInsertion(
  value: string,
  before: string,
  after: string
): string {
  const cased = withInlinePromptShortcutCasing(value, before).trimEnd();
  const following = promptShortcutFollowingPunctuation(after);
  if (!/^[,.;:!?]$/u.test(following)) return cased;
  return cased.replace(/[.!?,;:]+$/u, "").trimEnd();
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

const BUILT_IN_WILDCARD_BRACE_RE = /\{([^{}\r\n]{1,80})\}/gu;
const MODEL_FILLED_WILDCARD_BRACE_RE = /\{([^{}\r\n]{1,80})\}/gu;
const NOUN_PLURAL_SHORTHAND_RE = /\{NOUN(\d*)\}s\b/g;

function isModelFilledWildcardName(name: string): boolean {
  if (isDisabledPromptWildcardToken(name)) return false;
  if (parseBuiltInPromptWildcardReference(name)) return true;
  return /^[A-Z][A-Z0-9_ ]{1,63}$/u.test(name.trim());
}

export function promptContainsBuiltInWildcardSlots(source: string): boolean {
  for (const match of source.matchAll(BUILT_IN_WILDCARD_BRACE_RE)) {
    if (parseBuiltInPromptWildcardReference(match[1] ?? "")) return true;
  }
  return false;
}

export function maskBuiltInWildcardSlotsForPending(
  source: string,
  pendingText: string
): string {
  if (!source || !pendingText) return source;
  return source.replace(BUILT_IN_WILDCARD_BRACE_RE, (token, name: string) =>
    parseBuiltInPromptWildcardReference(name) ? pendingText : token
  );
}

export function promptContainsModelFilledWildcardSlots(source: string): boolean {
  MODEL_FILLED_WILDCARD_BRACE_RE.lastIndex = 0;
  for (const match of source.matchAll(MODEL_FILLED_WILDCARD_BRACE_RE)) {
    if (isModelFilledWildcardName(match[1] ?? "")) return true;
  }
  return false;
}

export function maskModelFilledWildcardSlotsForPending(
  source: string,
  pendingText: string
): string {
  if (!source || !pendingText) return source;
  MODEL_FILLED_WILDCARD_BRACE_RE.lastIndex = 0;
  return source.replace(MODEL_FILLED_WILDCARD_BRACE_RE, (token, name: string) =>
    isModelFilledWildcardName(name) ? pendingText : token
  );
}

export function isStandaloneWildcardComposerDraft(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (/^![a-z0-9][a-z0-9_-]*[.!?]?$/iu.test(trimmed)) return true;
  if (/^\{[^{}\r\n]*\|[^{}\r\n]*\}[.!?]?$/u.test(trimmed)) return true;
  const braceWildcard = trimmed.match(/^\{([^{}\r\n]{1,80})\}[.!?]?$/u);
  return Boolean(braceWildcard && isModelFilledWildcardName(braceWildcard[1] ?? ""));
}

function normalizeNounPluralShorthand(
  source: string,
  existingReplacements?: readonly PromptShortcutWildcardReplacement[]
): PromptRandomizationResolution {
  NOUN_PLURAL_SHORTHAND_RE.lastIndex = 0;
  let output = "";
  let cursor = 0;
  const adjustments: Array<{ start: number; end: number; delta: number }> = [];
  for (const match of source.matchAll(NOUN_PLURAL_SHORTHAND_RE)) {
    const token = match[0] ?? "";
    const reference = match[1] ?? "";
    const start = match.index ?? -1;
    if (start < 0 || !token) continue;
    const end = start + token.length;
    const replacement = `{PLURAL_NOUN${reference}}`;
    output += source.slice(cursor, start);
    output += replacement;
    adjustments.push({ start, end, delta: replacement.length - token.length });
    cursor = end;
  }
  if (adjustments.length === 0) {
    return {
      prompt: source,
      replacements: normalizedPromptRandomizationReplacementsForPrompt(
        source,
        existingReplacements
      ),
    };
  }
  output += source.slice(cursor);
  const shiftedReplacements = existingReplacements
    ?.map((replacement): PromptShortcutWildcardReplacement | null => {
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
  return {
    prompt: output,
    replacements: normalizedPromptRandomizationReplacementsForPrompt(
      output,
      shiftedReplacements
    ),
  };
}

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
        ...replacement,
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
  return normalizeNounPluralShorthand(source, existingReplacements);
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
        source: "deck",
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
        source: "option",
      });
    } else {
      prompt += source.slice(start, end + 1);
    }
    cursor = end + 1;
  }
  return { prompt, replacements };
}

export type WildcardDeckColorTag = "p" | "r" | "i" | "s" | "m";

export interface CommandCenterWildcardDeck {
  id: string;
  name: string;
  description: string;
  values: string[];
  colorTag?: WildcardDeckColorTag;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CommandCenterWildcardDeckDraft {
  id: string;
  name: string;
  description: string;
  valuesText: string;
  colorTag?: WildcardDeckColorTag;
  aliases: string[];
}

const WILDCARD_DECK_MAX_VALUES = 500;
const WILDCARD_DECK_VALUE_DELIMITER_RE = /[\r\n,;\t]+/u;

export interface WildcardDeckDuplicateValueIssue {
  value: string;
  firstValue: string;
  index: number;
  firstIndex: number;
}

function splitWildcardDeckValueInput(value: string): string[] {
  return value.split(WILDCARD_DECK_VALUE_DELIMITER_RE);
}

function wildcardDeckValueInputParts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" ? splitWildcardDeckValueInput(item) : []
      )
    : typeof value === "string"
      ? splitWildcardDeckValueInput(value)
      : [];
}

function normalizeWildcardDeckValueInput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160).trim();
}

export function normalizeWildcardDeckValueKey(value: string): string {
  return normalizeWildcardDeckValueInput(value).toLowerCase();
}

export function normalizeWildcardDeckNameInput(value: string): string {
  return value
    .trim()
    .replace(/^!+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/giu, "")
    .slice(0, 64);
}

export function normalizeWildcardDeckValueList(value: unknown): string[] {
  const source = wildcardDeckValueInputParts(value);
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    if (typeof item !== "string") continue;
    const normalized = normalizeWildcardDeckValueInput(item);
    if (!normalized) continue;
    const key = normalizeWildcardDeckValueKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
    if (values.length >= WILDCARD_DECK_MAX_VALUES) break;
  }
  return values;
}

export function formatWildcardDeckValuesText(value: unknown): string {
  return normalizeWildcardDeckValueList(value).join("\n");
}

export function findDuplicateWildcardDeckValueIssues(
  value: unknown
): WildcardDeckDuplicateValueIssue[] {
  const seen = new Map<string, { value: string; index: number }>();
  const issues: WildcardDeckDuplicateValueIssue[] = [];
  let normalizedIndex = 0;
  for (const item of wildcardDeckValueInputParts(value)) {
    const normalized = normalizeWildcardDeckValueInput(item);
    if (!normalized) continue;
    const key = normalizeWildcardDeckValueKey(normalized);
    const first = seen.get(key);
    if (first) {
      issues.push({
        value: normalized,
        firstValue: first.value,
        index: normalizedIndex,
        firstIndex: first.index,
      });
    } else {
      seen.set(key, { value: normalized, index: normalizedIndex });
    }
    normalizedIndex += 1;
  }
  return issues;
}

function normalizeWildcardDeckColorTag(value: unknown): WildcardDeckColorTag | undefined {
  return value === "p" || value === "r" || value === "i" || value === "s" || value === "m"
    ? value
    : undefined;
}

export function normalizeWildcardDeckAliases(
  aliases: unknown,
  primaryName: string
): string[] {
  if (!Array.isArray(aliases)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  const primaryKey = primaryName.toLowerCase();
  for (const alias of aliases) {
    if (typeof alias !== "string") continue;
    const name = normalizeWildcardDeckNameInput(alias);
    const key = name.toLowerCase();
    if (!name || key === primaryKey || seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }
  return normalized.slice(0, 8);
}

export function normalizeWildcardDecks(raw: unknown): CommandCenterWildcardDeck[] {
  const rows = Array.isArray(raw) ? raw : [];
  const decks: CommandCenterWildcardDeck[] = [];
  const seen = new Set<string>();
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Partial<CommandCenterWildcardDeck>;
    const name = normalizeWildcardDeckNameInput(
      typeof record.name === "string" ? record.name : ""
    );
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    const values = normalizeWildcardDeckValueList(record.values);
    if (values.length === 0) continue;
    const now = new Date().toISOString();
    seen.add(key);
    const colorTag = normalizeWildcardDeckColorTag(record.colorTag);
    decks.push({
      id:
        typeof record.id === "string" && record.id.trim().length > 0
          ? record.id.trim()
          : `wildcard:${key}`,
      name,
      description:
        typeof record.description === "string"
          ? record.description.replace(/\s+/g, " ").trim().slice(0, 220)
          : "",
      values,
      ...(colorTag ? { colorTag } : {}),
      aliases: normalizeWildcardDeckAliases(record.aliases, name),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
    });
  }
  return sanitizeWildcardDeckAliases(decks);
}

export function wildcardDeckInvocationNames(deck: CommandCenterWildcardDeck): string[] {
  return [deck.name, ...deck.aliases].filter(Boolean);
}

export function sanitizeWildcardDeckAliases(
  decks: readonly CommandCenterWildcardDeck[]
): CommandCenterWildcardDeck[] {
  const primaryNames = new Set(decks.map((deck) => deck.name.toLowerCase()));
  const claimedAliases = new Set<string>();
  return decks.map((deck) => {
    const aliases: string[] = [];
    for (const alias of deck.aliases) {
      const key = alias.toLowerCase();
      if (!alias || key === deck.name.toLowerCase()) continue;
      if (primaryNames.has(key)) continue;
      if (claimedAliases.has(key)) continue;
      claimedAliases.add(key);
      aliases.push(alias);
    }
    return { ...deck, aliases };
  });
}

export function uniqueWildcardDeckNameForList(
  requestedName: string,
  decks: readonly CommandCenterWildcardDeck[],
  editingDeckId: string
): string {
  const base = normalizeWildcardDeckNameInput(requestedName) || "deck";
  const used = new Set(
    decks
      .filter((deck) => deck.id !== editingDeckId)
      .flatMap((deck) => wildcardDeckInvocationNames(deck).map((name) => name.toLowerCase()))
  );
  if (!used.has(base.toLowerCase())) return base;
  let index = 2;
  let candidate = `${base}-${index}`;
  while (used.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

export function createWildcardDeckDraft(
  existingDecks: readonly CommandCenterWildcardDeck[]
): CommandCenterWildcardDeck {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `wildcard:${crypto.randomUUID()}`
      : `wildcard:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: uniqueWildcardDeckNameForList("deck", existingDecks, id),
    description: "",
    values: [],
    aliases: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function wildcardDeckToDraft(
  deck: CommandCenterWildcardDeck
): CommandCenterWildcardDeckDraft {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    valuesText: deck.values.join("\n"),
    colorTag: deck.colorTag,
    aliases: deck.aliases,
  };
}

export interface PromptShortcutFlag {
  key: string;
  value: string;
}

export interface PromptShortcutWildcardReplacement {
  key: string;
  value: string;
  start?: number;
  end?: number;
}

export interface BuiltInPromptWildcardSlot {
  key: string;
  label: string;
  aliases: readonly string[];
  title: string;
  generationHint: string;
}

export const BUILT_IN_PROMPT_WILDCARD_SLOTS = [
  {
    key: "ADJECTIVE",
    label: "ADJECTIVE",
    aliases: ["adjective", "adj"],
    title: "Generate a random descriptive word.",
    generationHint:
      "Return one adjective or short adjective phrase, such as stinky, nostalgic, endearing, or claustrophobic.",
  },
  {
    key: "VERB",
    label: "VERB",
    aliases: ["verb", "action"],
    title: "Generate a random action word.",
    generationHint:
      "Return one base-form verb or short verb phrase, such as tumble, haunt, improvise, or drift.",
  },
  {
    key: "NOUN",
    label: "NOUN",
    aliases: ["noun", "thing"],
    title: "Generate a random noun.",
    generationHint:
      "Return one singular noun or short noun phrase, such as lantern, subway, rumor, or chessboard.",
  },
  {
    key: "PLURAL_NOUN",
    label: "PLURAL NOUN",
    aliases: ["plural-noun", "plural_noun", "nouns"],
    title: "Generate a random plural noun.",
    generationHint:
      "Return one plural noun or short plural noun phrase, such as marbles, haunted houses, paper boats, or satellites.",
  },
  {
    key: "ADVERB",
    label: "ADVERB",
    aliases: ["adverb"],
    title: "Generate a random adverb.",
    generationHint:
      "Return one adverb or short adverb phrase, such as quietly, recklessly, sideways, or with ceremony.",
  },
  {
    key: "PLACE",
    label: "PLACE",
    aliases: ["place", "location"],
    title: "Generate a random place.",
    generationHint:
      "Return one place or short location phrase, such as laundromat, moonlit pier, basement arcade, or train station.",
  },
  {
    key: "PERSON",
    label: "PERSON",
    aliases: ["person", "character"],
    title: "Generate a random person.",
    generationHint:
      "Return one person, role, or character phrase, such as archivist, tired magician, neighbor, or retired astronaut.",
  },
  {
    key: "STYLE",
    label: "STYLE",
    aliases: ["style", "tone"],
    title: "Generate a random style or tone.",
    generationHint:
      "Return one style, tone, genre, or treatment, such as noir, deadpan, pastoral, glitchy, or documentary.",
  },
  {
    key: "NUM",
    label: "NUM",
    aliases: ["num", "number"],
    title: "Generate a random number.",
    generationHint: "Return one integer from 1 to 100, with digits only.",
  },
] as const satisfies readonly BuiltInPromptWildcardSlot[];

export type BuiltInPromptWildcardSlotKey =
  (typeof BUILT_IN_PROMPT_WILDCARD_SLOTS)[number]["key"];

function normalizeBuiltInPromptWildcardSlotLookup(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[{}]/g, "")
    .replace(/[-_\s]+/g, "_")
    .toUpperCase();
}

const BUILT_IN_PROMPT_WILDCARD_SLOT_LOOKUP = new Map<string, BuiltInPromptWildcardSlot>();
for (const slot of BUILT_IN_PROMPT_WILDCARD_SLOTS) {
  BUILT_IN_PROMPT_WILDCARD_SLOT_LOOKUP.set(
    normalizeBuiltInPromptWildcardSlotLookup(slot.key),
    slot
  );
  BUILT_IN_PROMPT_WILDCARD_SLOT_LOOKUP.set(
    normalizeBuiltInPromptWildcardSlotLookup(slot.label),
    slot
  );
  for (const alias of slot.aliases) {
    BUILT_IN_PROMPT_WILDCARD_SLOT_LOOKUP.set(
      normalizeBuiltInPromptWildcardSlotLookup(alias),
      slot
    );
  }
}

export function getBuiltInPromptWildcardSlot(
  value: unknown
): BuiltInPromptWildcardSlot | null {
  return (
    BUILT_IN_PROMPT_WILDCARD_SLOT_LOOKUP.get(
      normalizeBuiltInPromptWildcardSlotLookup(value)
    ) ?? null
  );
}

export function normalizeBuiltInPromptWildcardSlotKey(
  value: unknown
): BuiltInPromptWildcardSlotKey | null {
  const slot = getBuiltInPromptWildcardSlot(value);
  return slot ? (slot.key as BuiltInPromptWildcardSlotKey) : null;
}

export interface PromptShortcutMetadata {
  v: 1;
  commandId: string;
  name: string;
  invocation: string;
  flags: PromptShortcutFlag[];
  passthrough?: string;
  resolvedPrompt?: string;
  wildcardReplacements?: PromptShortcutWildcardReplacement[];
}

export interface PromptWildcardRunMetadata {
  v: 1;
  /** User-authored draft before local deck/option resolution. */
  template: string;
  /** Concrete prompt sent to the model after all available wildcard resolution. */
  resolvedPrompt?: string;
  wildcardReplacements?: PromptShortcutWildcardReplacement[];
}

function readPromptShortcutString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readPromptShortcutRange(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  return normalized >= 0 && normalized <= 20000 ? normalized : undefined;
}

export function normalizePromptShortcutMetadata(value: unknown): PromptShortcutMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const commandId = readPromptShortcutString(row.commandId, 160);
  const name = readPromptShortcutString(row.name, 96).replace(/^\/+/, "");
  const invocation = readPromptShortcutString(row.invocation, 2000);
  if (!commandId || !name || !invocation) return undefined;
  const flags = Array.isArray(row.flags)
    ? row.flags
        .map((flag): PromptShortcutFlag | null => {
          if (!flag || typeof flag !== "object") return null;
          const flagRow = flag as Record<string, unknown>;
          const key = readPromptShortcutString(flagRow.key, 64).replace(/^[-/]+/, "");
          const flagValue = readPromptShortcutString(flagRow.value, 1000);
          return key && flagValue ? { key, value: flagValue } : null;
        })
        .filter((flag): flag is PromptShortcutFlag => Boolean(flag))
        .slice(0, 20)
    : [];
  const wildcardReplacements = normalizePromptWildcardReplacements(
    row.wildcardReplacements
  ).slice(0, 80);
  const passthrough = readPromptShortcutString(row.passthrough, 2000);
  const resolvedPrompt = readPromptShortcutString(row.resolvedPrompt, 20000);
  return {
    v: 1,
    commandId,
    name,
    invocation,
    flags,
    ...(passthrough ? { passthrough } : {}),
    ...(resolvedPrompt ? { resolvedPrompt } : {}),
    ...(wildcardReplacements.length > 0 ? { wildcardReplacements } : {}),
  };
}

function normalizePromptWildcardReplacements(
  value: unknown
): PromptShortcutWildcardReplacement[] {
  return Array.isArray(value)
    ? value
        .map((replacement): PromptShortcutWildcardReplacement | null => {
          if (!replacement || typeof replacement !== "object") return null;
          const replacementRow = replacement as Record<string, unknown>;
          const key = readPromptShortcutString(replacementRow.key, 64)
            .replace(/[{}]/g, "")
            .replace(/\s+/g, "_")
            .toUpperCase();
          const replacementValue = readPromptShortcutString(replacementRow.value, 1000);
          if (!key || !replacementValue) return null;
          const start = readPromptShortcutRange(replacementRow.start);
          const end = readPromptShortcutRange(replacementRow.end);
          const hasValidRange = start !== undefined && end !== undefined && end > start;
          return {
            key,
            value: replacementValue,
            ...(hasValidRange ? { start, end } : {}),
          };
        })
        .filter(
          (replacement): replacement is PromptShortcutWildcardReplacement =>
            Boolean(replacement)
        )
        .slice(0, 120)
    : [];
}

export function normalizePromptWildcardRunMetadata(
  value: unknown
): PromptWildcardRunMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const template = readPromptShortcutString(row.template, 20000);
  if (!template) return undefined;
  const resolvedPrompt = readPromptShortcutString(row.resolvedPrompt, 20000);
  const wildcardReplacements = normalizePromptWildcardReplacements(row.wildcardReplacements);
  return {
    v: 1,
    template,
    ...(resolvedPrompt ? { resolvedPrompt } : {}),
    ...(wildcardReplacements.length > 0 ? { wildcardReplacements } : {}),
  };
}

export function parseStoredPromptShortcutPayload(
  raw: string | null | undefined
): PromptShortcutMetadata | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const row = parsed as Record<string, unknown>;
    return normalizePromptShortcutMetadata(row.promptShortcut ?? parsed);
  } catch {
    return undefined;
  }
}

export function parseStoredPromptWildcardPayload(
  raw: string | null | undefined
): PromptWildcardRunMetadata | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const row = parsed as Record<string, unknown>;
    return normalizePromptWildcardRunMetadata(row.promptWildcards ?? parsed);
  } catch {
    return undefined;
  }
}

export function withPromptShortcutResolvedPrompt(
  promptShortcut: PromptShortcutMetadata | undefined,
  resolvedPrompt: unknown
): PromptShortcutMetadata | undefined {
  const normalized = normalizePromptShortcutMetadata(promptShortcut);
  if (!normalized) return undefined;
  const prompt = readPromptShortcutString(resolvedPrompt, 20000);
  return prompt ? { ...normalized, resolvedPrompt: prompt } : normalized;
}

export function withPromptWildcardResolvedPrompt(
  promptWildcards: PromptWildcardRunMetadata | undefined,
  resolvedPrompt: unknown
): PromptWildcardRunMetadata | undefined {
  const normalized = normalizePromptWildcardRunMetadata(promptWildcards);
  if (!normalized) return undefined;
  const prompt = readPromptShortcutString(resolvedPrompt, 20000);
  return prompt ? { ...normalized, resolvedPrompt: prompt } : normalized;
}

export function serializePromptShortcutPayload(
  promptShortcut: PromptShortcutMetadata | undefined
): string | null {
  const normalized = normalizePromptShortcutMetadata(promptShortcut);
  return normalized ? JSON.stringify({ v: 1 as const, promptShortcut: normalized }) : null;
}

export function serializePromptToolPayload(options: {
  promptShortcut?: PromptShortcutMetadata;
  promptWildcards?: PromptWildcardRunMetadata;
}): string | null {
  const promptShortcut = normalizePromptShortcutMetadata(options.promptShortcut);
  const promptWildcards = normalizePromptWildcardRunMetadata(options.promptWildcards);
  if (!promptShortcut && !promptWildcards) return null;
  return JSON.stringify({
    v: 1 as const,
    ...(promptShortcut ? { promptShortcut } : {}),
    ...(promptWildcards ? { promptWildcards } : {}),
  });
}

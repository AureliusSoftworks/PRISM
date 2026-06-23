export interface PromptShortcutFlag {
  key: string;
  value: string;
}

export interface PromptShortcutWildcardReplacement {
  key: string;
  value: string;
  start?: number;
  end?: number;
  source?: "deck" | "option" | "wildcard";
}

export interface PromptShortcutRunMetadata {
  commandId: string;
  name: string;
  invocation: string;
  sourceStart?: number;
  sourceEnd?: number;
  resolvedPrompt: string;
  wildcardReplacements?: PromptShortcutWildcardReplacement[];
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
    title: "Generate a varied singular noun.",
    generationHint:
      "Return one singular noun only. Vary the choice widely across everyday concrete and abstract nouns. Do not copy or reuse words from these instructions.",
  },
  {
    key: "PLURAL_NOUN",
    label: "PLURAL NOUN",
    aliases: ["plural-noun", "plural_noun", "nouns"],
    title: "Generate varied plural nouns.",
    generationHint:
      "Return one plural noun or concise plural noun phrase only. Vary the choice widely across everyday concrete and abstract nouns. Do not copy or reuse words from these instructions.",
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
    aliases: ["person"],
    title: "Generate a random first name.",
    generationHint:
      "Return one given first name only, such as Mira, Theo, June, Elias, or Amara. Do not return a role, title, occupation, character type, descriptor, noun, or phrase.",
  },
  {
    key: "STYLE",
    label: "STYLE",
    aliases: ["style", "tone"],
    title: "Generate a random writing tone or genre.",
    generationHint:
      "Return one concise writing tone or genre label only, such as noir, deadpan, pastoral, glitchy, documentary, or whimsical. Do not return a full instruction, role, character type, title, or phrase.",
  },
  {
    key: "NUM",
    label: "NUM",
    aliases: ["num", "number"],
    title: "Generate a random integer from 1 to 100.",
    generationHint: "Return one integer from 1 to 100, with digits only.",
  },
] as const satisfies readonly BuiltInPromptWildcardSlot[];

export type BuiltInPromptWildcardSlotKey =
  (typeof BUILT_IN_PROMPT_WILDCARD_SLOTS)[number]["key"];

export interface BuiltInPromptWildcardReference {
  slot: BuiltInPromptWildcardSlot;
  key: BuiltInPromptWildcardSlotKey;
  reference: string | null;
}

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

const DISABLED_PROMPT_WILDCARD_TOKEN_LOOKUP = new Set(["CHARACTER"]);

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

export function isDisabledPromptWildcardToken(value: unknown): boolean {
  const normalized = normalizeBuiltInPromptWildcardSlotLookup(value);
  if (!normalized) return false;
  if (DISABLED_PROMPT_WILDCARD_TOKEN_LOOKUP.has(normalized)) return true;
  const numbered = normalized.match(/^(.+?)(\d+)$/u);
  const base = numbered?.[1] ?? "";
  return Boolean(base && DISABLED_PROMPT_WILDCARD_TOKEN_LOOKUP.has(base));
}

export function parseBuiltInPromptWildcardReference(
  value: unknown
): BuiltInPromptWildcardReference | null {
  if (isDisabledPromptWildcardToken(value)) return null;
  const exactSlot = getBuiltInPromptWildcardSlot(value);
  if (exactSlot) {
    return {
      slot: exactSlot,
      key: exactSlot.key as BuiltInPromptWildcardSlotKey,
      reference: null,
    };
  }
  const normalized = normalizeBuiltInPromptWildcardSlotLookup(value);
  const numbered = normalized.match(/^(.+?)(\d+)$/u);
  if (!numbered) return null;
  const base = numbered[1] ?? "";
  const reference = numbered[2]?.replace(/^0+(?=\d)/u, "") ?? "";
  if (!base || !reference) return null;
  const slot = getBuiltInPromptWildcardSlot(base);
  if (!slot) return null;
  return {
    slot,
    key: slot.key as BuiltInPromptWildcardSlotKey,
    reference,
  };
}

export interface PromptShortcutMetadata {
  v: 1;
  commandId: string;
  name: string;
  invocation: string;
  /** User-authored draft before prompt shortcut expansion. */
  template?: string;
  flags: PromptShortcutFlag[];
  passthrough?: string;
  resolvedPrompt?: string;
  wildcardReplacements?: PromptShortcutWildcardReplacement[];
  promptRuns?: PromptShortcutRunMetadata[];
}

export interface PromptWildcardRunMetadata {
  v: 1;
  /** User-authored draft before local deck/option resolution. */
  template: string;
  /** Concrete prompt sent to the model after all available wildcard resolution. */
  resolvedPrompt?: string;
  wildcardReplacements?: PromptShortcutWildcardReplacement[];
}

export interface PsychicThoughtPayload {
  v: 1;
  summary: string;
  effort: "auto" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  provider: "local" | "openai" | "anthropic";
  model?: string;
  createdAt: string;
}

const PSYCHIC_THOUGHT_EFFORT_VALUES = new Set<PsychicThoughtPayload["effort"]>([
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function normalizePsychicThoughtEffort(value: unknown): PsychicThoughtPayload["effort"] {
  if (typeof value !== "string") return "auto";
  const normalized = value.trim().toLowerCase() as PsychicThoughtPayload["effort"];
  return PSYCHIC_THOUGHT_EFFORT_VALUES.has(normalized) ? normalized : "auto";
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
  const template = readPromptShortcutString(row.template, 20000);
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
  const promptRuns = normalizePromptShortcutRuns(row.promptRuns);
  return {
    v: 1,
    commandId,
    name,
    invocation,
    ...(template ? { template } : {}),
    flags,
    ...(passthrough ? { passthrough } : {}),
    ...(resolvedPrompt ? { resolvedPrompt } : {}),
    ...(wildcardReplacements.length > 0 ? { wildcardReplacements } : {}),
    ...(promptRuns.length > 0 ? { promptRuns } : {}),
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
          const source =
            replacementRow.source === "deck" ||
            replacementRow.source === "option" ||
            replacementRow.source === "wildcard"
              ? replacementRow.source
              : undefined;
          return {
            key,
            value: replacementValue,
            ...(hasValidRange ? { start, end } : {}),
            ...(source ? { source } : {}),
          };
        })
        .filter(
          (replacement): replacement is PromptShortcutWildcardReplacement =>
            Boolean(replacement)
        )
        .slice(0, 120)
    : [];
}

function normalizePromptShortcutRuns(value: unknown): PromptShortcutRunMetadata[] {
  return Array.isArray(value)
    ? value
        .map((run): PromptShortcutRunMetadata | null => {
          if (!run || typeof run !== "object") return null;
          const row = run as Record<string, unknown>;
          const commandId = readPromptShortcutString(row.commandId, 160);
          const name = readPromptShortcutString(row.name, 96).replace(/^\/+/, "");
          const invocation = readPromptShortcutString(row.invocation, 2000);
          const resolvedPrompt = readPromptShortcutString(row.resolvedPrompt, 20000);
          if (!commandId || !name || !invocation || !resolvedPrompt) return null;
          const sourceStart = readPromptShortcutRange(row.sourceStart);
          const sourceEnd = readPromptShortcutRange(row.sourceEnd);
          const hasValidSourceRange =
            sourceStart !== undefined &&
            sourceEnd !== undefined &&
            sourceEnd > sourceStart;
          const wildcardReplacements = normalizePromptWildcardReplacements(
            row.wildcardReplacements
          ).slice(0, 80);
          return {
            commandId,
            name,
            invocation,
            ...(sourceStart !== undefined ? { sourceStart } : {}),
            ...(hasValidSourceRange ? { sourceEnd } : {}),
            resolvedPrompt,
            ...(wildcardReplacements.length > 0 ? { wildcardReplacements } : {}),
          };
        })
        .filter((run): run is PromptShortcutRunMetadata => Boolean(run))
        .slice(0, 20)
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

export function normalizePsychicThoughtPayload(value: unknown): PsychicThoughtPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const summary = readPromptShortcutString(row.summary, 1200);
  const provider = readPromptShortcutString(row.provider, 32);
  const createdAt = readPromptShortcutString(row.createdAt, 96);
  if (!summary || !createdAt) return undefined;
  if (provider !== "local" && provider !== "openai" && provider !== "anthropic") {
    return undefined;
  }
  const model = readPromptShortcutString(row.model, 200);
  return {
    v: 1,
    summary,
    effort: normalizePsychicThoughtEffort(row.effort),
    provider,
    ...(model ? { model } : {}),
    createdAt,
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

export function parseStoredPsychicThoughtPayload(
  raw: string | null | undefined
): PsychicThoughtPayload | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const row = parsed as Record<string, unknown>;
    return normalizePsychicThoughtPayload(row.psychicThought ?? parsed);
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
  psychicThought?: PsychicThoughtPayload;
}): string | null {
  const promptShortcut = normalizePromptShortcutMetadata(options.promptShortcut);
  const promptWildcards = normalizePromptWildcardRunMetadata(options.promptWildcards);
  const psychicThought = normalizePsychicThoughtPayload(options.psychicThought);
  if (!promptShortcut && !promptWildcards && !psychicThought) return null;
  return JSON.stringify({
    v: 1 as const,
    ...(promptShortcut ? { promptShortcut } : {}),
    ...(promptWildcards ? { promptWildcards } : {}),
    ...(psychicThought ? { psychicThought } : {}),
  });
}

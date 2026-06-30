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

export interface ManualAskQuestionResultOption {
  id: string;
  label: string;
}

export interface ManualAskQuestionResultPayload {
  v: 1;
  name: "AskQuestion";
  question: string;
  options: ManualAskQuestionResultOption[];
  selectedOptionId?: string;
  selectedOptionIndex?: number;
  selectedOptionLabel?: string;
}

export interface BuiltInPromptWildcardSlot {
  key: string;
  label: string;
  aliases: readonly string[];
  title: string;
  generationHint: string;
  pickerVisibility: "primary" | "searchable";
}

export const BUILT_IN_PROMPT_WILDCARD_SLOTS = [
  {
    key: "NUM",
    label: "#",
    aliases: ["num", "number", "#"],
    title: "Generate a random digit from 1 to 10.",
    generationHint: "Return one integer from 1 to 10, with digits only.",
    pickerVisibility: "primary",
  },
  {
    key: "NAME",
    label: "NAME",
    aliases: ["name", "first-name", "first name"],
    title: "Generate a random first name.",
    generationHint: "Return one given first name only.",
    pickerVisibility: "primary",
  },
  {
    key: "PERSON",
    label: "PERSON",
    aliases: ["person", "role"],
    title: "Generate a random person, role, or character type.",
    generationHint: "Return one person, role, job, or character type.",
    pickerVisibility: "primary",
  },
  {
    key: "PLACE",
    label: "PLACE",
    aliases: ["place", "location"],
    title: "Generate a random place.",
    generationHint: "Return one place or short location phrase.",
    pickerVisibility: "primary",
  },
  {
    key: "OBJECT",
    label: "OBJECT",
    aliases: ["object", "item"],
    title: "Generate a random physical object.",
    generationHint: "Return one concrete object or item.",
    pickerVisibility: "primary",
  },
  {
    key: "CONTAINER",
    label: "CONTAINER",
    aliases: ["container", "vessel", "receptacle"],
    title: "Generate a random container or vessel.",
    generationHint: "Return one physical container, vessel, holder, storage object, or compartment.",
    pickerVisibility: "searchable",
  },
  {
    key: "NOUN",
    label: "NOUN",
    aliases: ["noun", "thing"],
    title: "Generate a varied singular noun.",
    generationHint:
      "Return one singular noun only. Do not copy or reuse words from these instructions.",
    pickerVisibility: "primary",
  },
  {
    key: "ADJECTIVE",
    label: "ADJECTIVE",
    aliases: ["adjective", "adj"],
    title: "Generate a random descriptive word.",
    generationHint:
      "Return one adjective or short adjective phrase.",
    pickerVisibility: "primary",
  },
  {
    key: "VERB",
    label: "VERB",
    aliases: ["verb", "action"],
    title: "Generate a random action word.",
    generationHint: "Return one base-form verb or short verb phrase.",
    pickerVisibility: "primary",
  },
  {
    key: "ACTION",
    label: "ACTION",
    aliases: ["action", "action-phrase"],
    title: "Generate a random action phrase.",
    generationHint: "Return one concise action phrase.",
    pickerVisibility: "primary",
  },
  {
    key: "STYLE",
    label: "STYLE",
    aliases: ["style", "tone"],
    title: "Generate a random writing tone or genre.",
    generationHint: "Return one concise writing tone or style label.",
    pickerVisibility: "primary",
  },
  {
    key: "GENRE",
    label: "GENRE",
    aliases: ["genre"],
    title: "Generate a random genre.",
    generationHint: "Return one concise genre label.",
    pickerVisibility: "primary",
  },
  {
    key: "COLOR",
    label: "COLOR",
    aliases: ["color", "colour"],
    title: "Generate a random color.",
    generationHint: "Return one color or color treatment.",
    pickerVisibility: "primary",
  },
  {
    key: "TIME",
    label: "TIME",
    aliases: ["time", "when"],
    title: "Generate a random time or era.",
    generationHint: "Return one time, date, season, era, or temporal phrase.",
    pickerVisibility: "primary",
  },
  {
    key: "PROBLEM",
    label: "PROBLEM",
    aliases: ["problem", "obstacle", "complication"],
    title: "Generate a random obstacle or complication.",
    generationHint: "Return one immediate problem, obstacle, or complication.",
    pickerVisibility: "primary",
  },
  {
    key: "PLURAL_NOUN",
    label: "PLURAL NOUN",
    aliases: ["plural-noun", "plural_noun", "nouns"],
    title: "Generate varied plural nouns.",
    generationHint:
      "Return one plural noun or concise plural noun phrase only. Do not copy or reuse words from these instructions.",
    pickerVisibility: "searchable",
  },
  {
    key: "ADVERB",
    label: "ADVERB",
    aliases: ["adverb"],
    title: "Generate a random adverb.",
    generationHint: "Return one adverb or short adverb phrase.",
    pickerVisibility: "searchable",
  },
  {
    key: "ANIMAL",
    label: "ANIMAL",
    aliases: ["animal"],
    title: "Generate a random animal.",
    generationHint: "Return one animal name.",
    pickerVisibility: "searchable",
  },
  {
    key: "EMOTION",
    label: "EMOTION",
    aliases: ["emotion", "feeling"],
    title: "Generate a random emotion.",
    generationHint: "Return one emotion or internal feeling.",
    pickerVisibility: "searchable",
  },
  {
    key: "WEATHER",
    label: "WEATHER",
    aliases: ["weather"],
    title: "Generate a random weather condition.",
    generationHint: "Return one weather condition or atmospheric condition.",
    pickerVisibility: "searchable",
  },
  {
    key: "MATERIAL",
    label: "MATERIAL",
    aliases: ["material"],
    title: "Generate a random material.",
    generationHint: "Return one material or substance.",
    pickerVisibility: "searchable",
  },
  {
    key: "TEXTURE",
    label: "TEXTURE",
    aliases: ["texture", "surface"],
    title: "Generate a random texture.",
    generationHint: "Return one texture, finish, or surface quality.",
    pickerVisibility: "searchable",
  },
  {
    key: "FOOD",
    label: "FOOD",
    aliases: ["food", "drink"],
    title: "Generate a random food or drink.",
    generationHint: "Return one food, dish, ingredient, or drink.",
    pickerVisibility: "searchable",
  },
  {
    key: "BODY_PART",
    label: "BODY PART",
    aliases: ["body-part", "body_part", "body part"],
    title: "Generate a random body part.",
    generationHint: "Return one human or animal body part.",
    pickerVisibility: "searchable",
  },
  {
    key: "VEHICLE",
    label: "VEHICLE",
    aliases: ["vehicle", "transport"],
    title: "Generate a random vehicle.",
    generationHint: "Return one vehicle or form of transport.",
    pickerVisibility: "searchable",
  },
  {
    key: "OCCUPATION",
    label: "OCCUPATION",
    aliases: ["occupation", "job", "profession"],
    title: "Generate a random occupation.",
    generationHint: "Return one job, profession, or role.",
    pickerVisibility: "searchable",
  },
  {
    key: "EVENT",
    label: "EVENT",
    aliases: ["event", "occasion"],
    title: "Generate a random event.",
    generationHint: "Return one event, occasion, or activity.",
    pickerVisibility: "searchable",
  },
  {
    key: "CREATURE",
    label: "CREATURE",
    aliases: ["creature", "monster", "being"],
    title: "Generate a random creature.",
    generationHint: "Return one creature, monster, or supernatural being.",
    pickerVisibility: "searchable",
  },
  {
    key: "MAGIC",
    label: "MAGIC",
    aliases: ["magic", "spell", "power"],
    title: "Generate a random magical power.",
    generationHint: "Return one magical effect, spell, or power.",
    pickerVisibility: "searchable",
  },
  {
    key: "SOUND",
    label: "SOUND",
    aliases: ["sound", "noise"],
    title: "Generate a random sound.",
    generationHint: "Return one sound, noise, or sonic quality.",
    pickerVisibility: "searchable",
  },
  {
    key: "SMELL",
    label: "SMELL",
    aliases: ["smell", "scent", "odor"],
    title: "Generate a random smell.",
    generationHint: "Return one scent, smell, or aroma.",
    pickerVisibility: "searchable",
  },
  {
    key: "TASTE",
    label: "TASTE",
    aliases: ["taste", "flavor", "flavour"],
    title: "Generate a random taste.",
    generationHint: "Return one taste, flavor, or mouthfeel.",
    pickerVisibility: "searchable",
  },
  {
    key: "SHAPE",
    label: "SHAPE",
    aliases: ["shape", "form"],
    title: "Generate a random shape.",
    generationHint: "Return one shape, form, or visual pattern.",
    pickerVisibility: "searchable",
  },
  {
    key: "SIZE",
    label: "SIZE",
    aliases: ["size", "scale"],
    title: "Generate a random size.",
    generationHint: "Return one size or scale descriptor.",
    pickerVisibility: "searchable",
  },
  {
    key: "CLOTHING",
    label: "CLOTHING",
    aliases: ["clothing", "clothes", "garment"],
    title: "Generate a random clothing item.",
    generationHint: "Return one clothing item or accessory.",
    pickerVisibility: "searchable",
  },
  {
    key: "ROOM",
    label: "ROOM",
    aliases: ["room", "interior"],
    title: "Generate a random room.",
    generationHint: "Return one room or interior space.",
    pickerVisibility: "searchable",
  },
  {
    key: "LIGHTING",
    label: "LIGHTING",
    aliases: ["lighting", "light"],
    title: "Generate a random lighting condition.",
    generationHint: "Return one lighting style or condition.",
    pickerVisibility: "searchable",
  },
  {
    key: "MYTH",
    label: "MYTH",
    aliases: ["myth", "legend", "motif"],
    title: "Generate a random mythic motif.",
    generationHint: "Return one mythic, folkloric, or legendary motif.",
    pickerVisibility: "searchable",
  },
  {
    key: "WEAPON",
    label: "WEAPON",
    aliases: ["weapon"],
    title: "Generate a random weapon.",
    generationHint: "Return one weapon or combat implement.",
    pickerVisibility: "searchable",
  },
  {
    key: "PLANT",
    label: "PLANT",
    aliases: ["plant", "flora"],
    title: "Generate a random plant.",
    generationHint: "Return one plant, tree, flower, herb, or fungus-like plant item.",
    pickerVisibility: "searchable",
  },
  {
    key: "BOOK",
    label: "BOOK",
    aliases: ["book", "document", "text"],
    title: "Generate a random book or written artifact.",
    generationHint: "Return one book, document, record, or written artifact.",
    pickerVisibility: "searchable",
  },
  {
    key: "TREASURE",
    label: "TREASURE",
    aliases: ["treasure", "prize"],
    title: "Generate a random treasure.",
    generationHint: "Return one treasure, valuable object, or coveted prize.",
    pickerVisibility: "searchable",
  },
  {
    key: "SECRET",
    label: "SECRET",
    aliases: ["secret", "hidden-truth"],
    title: "Generate a random secret.",
    generationHint: "Return one secret, hidden truth, or concealed fact.",
    pickerVisibility: "searchable",
  },
  {
    key: "MOTIVE",
    label: "MOTIVE",
    aliases: ["motive", "reason"],
    title: "Generate a random motive.",
    generationHint: "Return one motive or reason for acting.",
    pickerVisibility: "searchable",
  },
  {
    key: "RELATIONSHIP",
    label: "RELATIONSHIP",
    aliases: ["relationship", "connection"],
    title: "Generate a random relationship.",
    generationHint: "Return one relationship or social connection.",
    pickerVisibility: "searchable",
  },
  {
    key: "PREFIX",
    label: "PREFIX",
    aliases: ["prefix", "title"],
    title: "Generate a random name prefix.",
    generationHint: "Return one title, honorific, or name prefix.",
    pickerVisibility: "searchable",
  },
  {
    key: "SUFFIX",
    label: "SUFFIX",
    aliases: ["suffix", "epithet"],
    title: "Generate a random name suffix.",
    generationHint: "Return one suffix, credential, epithet, or name ending.",
    pickerVisibility: "searchable",
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

function normalizeManualAskQuestionOptionId(value: unknown, fallback: string): string {
  const id = readPromptShortcutString(value, 24).replace(/\s+/g, "-");
  return id || fallback;
}

function normalizeManualAskQuestionResultOptions(
  value: unknown
): ManualAskQuestionResultOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: ManualAskQuestionResultOption[] = [];
  for (const item of value) {
    const row: Record<string, unknown> =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const rawLabel =
      typeof item === "string" ? item : row.label ?? row.text ?? row.title ?? row.value;
    const label = readPromptShortcutString(rawLabel, 140);
    if (!label) continue;
    const id = normalizeManualAskQuestionOptionId(row.id, String.fromCharCode(97 + options.length));
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ id, label });
    if (options.length >= 4) break;
  }
  return options.length >= 2 ? options : [];
}

export function normalizeManualAskQuestionResultPayload(
  value: unknown
): ManualAskQuestionResultPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const rawName = readPromptShortcutString(row.name, 48).toLowerCase();
  if (rawName && rawName !== "askquestion") return undefined;
  const question = readPromptShortcutString(row.question ?? row.prompt, 500);
  const options = normalizeManualAskQuestionResultOptions(row.options);
  if (!question || options.length < 2) return undefined;

  const selectedIdRaw = readPromptShortcutString(row.selectedOptionId, 24);
  const selectedIndexRaw = row.selectedOptionIndex;
  const selectedOptionIndex =
    typeof selectedIndexRaw === "number" &&
    Number.isInteger(selectedIndexRaw) &&
    selectedIndexRaw >= 0 &&
    selectedIndexRaw < options.length
      ? selectedIndexRaw
      : selectedIdRaw
        ? options.findIndex((option) => option.id === selectedIdRaw)
        : -1;
  const selectedOption =
    selectedOptionIndex >= 0 ? options[selectedOptionIndex] : undefined;

  return {
    v: 1,
    name: "AskQuestion",
    question,
    options,
    ...(selectedOption
      ? {
          selectedOptionId: selectedOption.id,
          selectedOptionIndex,
          selectedOptionLabel: selectedOption.label,
        }
      : {}),
  };
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

export function parseStoredManualAskQuestionPayload(
  raw: string | null | undefined
): ManualAskQuestionResultPayload | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const row = parsed as Record<string, unknown>;
    return normalizeManualAskQuestionResultPayload(row.manualAskQuestion ?? parsed);
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
  manualAskQuestion?: ManualAskQuestionResultPayload;
}): string | null {
  const promptShortcut = normalizePromptShortcutMetadata(options.promptShortcut);
  const promptWildcards = normalizePromptWildcardRunMetadata(options.promptWildcards);
  const psychicThought = normalizePsychicThoughtPayload(options.psychicThought);
  const manualAskQuestion = normalizeManualAskQuestionResultPayload(options.manualAskQuestion);
  if (!promptShortcut && !promptWildcards && !psychicThought && !manualAskQuestion) return null;
  return JSON.stringify({
    v: 1 as const,
    ...(promptShortcut ? { promptShortcut } : {}),
    ...(promptWildcards ? { promptWildcards } : {}),
    ...(psychicThought ? { psychicThought } : {}),
    ...(manualAskQuestion ? { manualAskQuestion } : {}),
  });
}

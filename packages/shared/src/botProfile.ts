/**
 * Structured bot profile fields composed into `bots.system_prompt`.
 *
 * Machine-readable metadata is appended after natural-language prose so the UI
 * can round-trip edits without exposing a raw system prompt. The chat pipeline
 * strips the suffix before building provider prompts.
 */

/// Sentinel block embedded at the end of `system_prompt` for structured bots.
export const BOT_PROFILE_META_START = "<<<PRISM_BOT_META>>>";
export const BOT_PROFILE_META_END = "<<<END_PRISM_BOT_META>>>";

export type BotProfileCategoryId =
  | "purpose"
  | "core"
  | "identity"
  | "worldview"
  | "appearance"
  | "facts";

export const BOT_PROFILE_CATEGORY_ORDER: readonly BotProfileCategoryId[] = [
  "purpose",
  "core",
  "identity",
  "worldview",
  "appearance",
  "facts",
] as const;

export const BOT_PROFILE_CATEGORY_LABELS: Record<BotProfileCategoryId, string> = {
  purpose: "Purpose",
  core: "Core",
  identity: "Identity",
  worldview: "Worldview",
  appearance: "Appearance",
  facts: "Facts",
};

export type BotVoicePreset =
  | "neutral"
  | "warm"
  | "concise"
  | "playful"
  | "formal";

export type BotProfileScaleValue = -2 | -1 | 0 | 1 | 2;

export interface BotPurposeProfile {
  /** The user's answer to "What is my purpose?" Blank falls back to the bot name. */
  statement: string;
  /** Raw legacy prompt text or any advanced notes that do not fit elsewhere. */
  legacyNotes: string;
}

export interface BotCoreProfile {
  traits: string;
  communicationStyle: BotVoicePreset;
  openness: BotProfileScaleValue | null;
  conscientiousness: BotProfileScaleValue | null;
  extraversion: BotProfileScaleValue | null;
  agreeableness: BotProfileScaleValue | null;
  emotionalStability: BotProfileScaleValue | null;
  /** Legacy pre-OCEAN slider; still parsed so older saved bots keep their behavior. */
  humor: BotProfileScaleValue | null;
  /** Legacy pre-OCEAN slider; still parsed so older saved bots keep their behavior. */
  curiosity: BotProfileScaleValue | null;
  /** Legacy pre-OCEAN slider; still parsed so older saved bots keep their behavior. */
  directness: BotProfileScaleValue | null;
  interests: string;
  boundaries: string;
  quirks: string;
}

export interface BotIdentityProfile {
  age: string;
  species: string;
  pronouns: string;
  background: string;
  role: string;
}

export interface BotWorldviewProfile {
  politicalView: BotProfileScaleValue | null;
  religion: string;
  optimism: BotProfileScaleValue | null;
  tradition: BotProfileScaleValue | null;
  values: string;
}

export interface BotAppearanceProfile {
  description: string;
  style: string;
  presence: string;
}

/**
 * A user-defined fact row stored alongside the standard fact keys. Customizer
 * surfaces these as labeled rows; Memories panel mirrors them read-only.
 */
export interface BotCustomFact {
  label: string;
  value: string;
  /** Stable id for list reconciliation (assigned on parse if missing). */
  rowId?: string;
}

function newCustomFactRowId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Permanent canon/identity facts for the bot. These are owned by the
 * Customizer and displayed read-only inside the Memories panel — they should
 * never become learned memories or short-term bubbles. Use `customFacts` for
 * domain-specific extras outside the standard fixed keys.
 */
export interface BotFactsProfile {
  birthday: string;
  customFacts: BotCustomFact[];
}

export interface BotProfileV2 {
  v: 2;
  purpose: BotPurposeProfile;
  core: BotCoreProfile;
  identity: BotIdentityProfile;
  worldview: BotWorldviewProfile;
  appearance: BotAppearanceProfile;
  facts: BotFactsProfile;
}

export type BotFactKey = Exclude<keyof BotFactsProfile, "customFacts">;

export const BOT_FACT_KEY_ORDER: readonly BotFactKey[] = ["birthday"] as const;

export const BOT_FACT_KEY_LABELS: Record<BotFactKey, string> = {
  birthday: "Birthday",
};

export const BOT_FACT_KEY_PLACEHOLDERS: Record<BotFactKey, string> = {
  // Birthday is rendered as an `<input type="date">` so the placeholder is
  // never visually shown — the browser provides its own locale-aware mask.
  // The ISO example here keeps fallback callers in lockstep with storage.
  birthday: "1942-10-29",
};

export const MAX_CUSTOM_FACTS = 8;

// Backwards-compatible export name used by the web app.
export type BotProfileFields = BotProfileV2;

const VOICE_ORDER: readonly BotVoicePreset[] = [
  "neutral",
  "warm",
  "concise",
  "playful",
  "formal",
] as const;

export const BOT_VOICE_PRESET_LABELS: Record<BotVoicePreset, string> = {
  neutral: "Balanced - clear and adaptable",
  warm: "Warm - friendly and reassuring",
  concise: "Concise - short answers, lean into clarity",
  playful: "Playful - light wit when it fits",
  formal: "Formal - structured and precise",
};

const SCALE_VALUES: readonly BotProfileScaleValue[] = [-2, -1, 0, 1, 2] as const;

export const DEFAULT_BOT_PROFILE_FIELDS: BotProfileFields = {
  v: 2,
  purpose: {
    statement: "",
    legacyNotes: "",
  },
  core: {
    traits: "",
    communicationStyle: "neutral",
    openness: null,
    conscientiousness: null,
    extraversion: null,
    agreeableness: null,
    emotionalStability: null,
    humor: null,
    curiosity: null,
    directness: null,
    interests: "",
    boundaries: "",
    quirks: "",
  },
  identity: {
    age: "",
    species: "",
    pronouns: "",
    background: "",
    role: "",
  },
  worldview: {
    politicalView: null,
    religion: "",
    optimism: null,
    tradition: null,
    values: "",
  },
  appearance: {
    description: "",
    style: "",
    presence: "",
  },
  facts: {
    birthday: "",
    customFacts: [],
  },
};

function cloneDefaultBotProfile(): BotProfileFields {
  return {
    v: 2,
    purpose: { ...DEFAULT_BOT_PROFILE_FIELDS.purpose },
    core: { ...DEFAULT_BOT_PROFILE_FIELDS.core },
    identity: { ...DEFAULT_BOT_PROFILE_FIELDS.identity },
    worldview: { ...DEFAULT_BOT_PROFILE_FIELDS.worldview },
    appearance: { ...DEFAULT_BOT_PROFILE_FIELDS.appearance },
    facts: {
      ...DEFAULT_BOT_PROFILE_FIELDS.facts,
      customFacts: [],
    },
  };
}

function describeVoiceForModel(voice: BotVoicePreset): string {
  switch (voice) {
    case "neutral":
      return "Keep a balanced, adaptable tone unless the topic clearly calls for something different.";
    case "warm":
      return "Sound friendly, patient, and reassuring.";
    case "concise":
      return "Prefer tight answers; expand only when the user asks for depth.";
    case "playful":
      return "You may use gentle humor when it helps the user; stay respectful.";
    case "formal":
      return "Use precise, structured language suitable for professional contexts.";
    default:
      return "";
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readObject(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isVoicePreset(v: unknown): v is BotVoicePreset {
  return typeof v === "string" && (VOICE_ORDER as readonly string[]).includes(v);
}

function readVoicePreset(record: Record<string, unknown>, key: string): BotVoicePreset {
  const value = record[key];
  return isVoicePreset(value) ? value : "neutral";
}

function isScaleValue(v: unknown): v is BotProfileScaleValue {
  return typeof v === "number" && (SCALE_VALUES as readonly number[]).includes(v);
}

function readScaleValue(
  record: Record<string, unknown>,
  key: string
): BotProfileScaleValue | null {
  const value = record[key];
  return isScaleValue(value) ? value : null;
}

function readCustomFacts(record: Record<string, unknown>): BotCustomFact[] {
  const value = record.customFacts;
  if (!Array.isArray(value)) return [];
  const facts: BotCustomFact[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const label = readString(obj, "label").trim();
    const factValue = readString(obj, "value").trim();
    if (!label && !factValue) continue;
    const rowIdRaw = readString(obj, "rowId").trim();
    facts.push({
      label,
      value: factValue,
      rowId: rowIdRaw || newCustomFactRowId(),
    });
    if (facts.length >= MAX_CUSTOM_FACTS) break;
  }
  return facts;
}

function sentence(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Creates the default purpose sentence from the bot name when purpose is blank. */
export function defaultBotPurpose(botName: string | null | undefined): string {
  const name = typeof botName === "string" ? botName.trim() : "";
  return name ? `You are ${name}.` : "";
}

/**
 * Strips leading `You are …` / bot-name prefixes from a stored purpose
 * statement so the profile UI can edit only the tail. Does not trim the
 * string — that preserves spaces the typist is still placing at the edges.
 */
export function stripPurposeStatementPrefixes(
  statement: string,
  botName?: string | null
): string {
  let value = statement.replace(/^\s*you\s+are\s+/i, "");
  const name = typeof botName === "string" ? botName.trim() : "";
  if (name) {
    value = value.replace(
      new RegExp(`^\\s*${escapeRegex(name)}\\s*,?\\s*`, "i"),
      ""
    );
  }
  return value;
}

function normalizePurposeTail(
  statement: string,
  botName?: string | null
): string {
  return stripPurposeStatementPrefixes(statement, botName);
}

function composePurposeStatement(
  profile: BotProfileFields,
  botName?: string | null
): string {
  const custom = normalizePurposeTail(profile.purpose.statement, botName);
  const name = typeof botName === "string" ? botName.trim() : "";
  if (!custom) return defaultBotPurpose(botName);
  if (name) return sentence(`You are ${name}, ${custom}`);
  return sentence(`You are ${custom}`);
}

/** Removes embedded structured metadata before the model sees `system_prompt`. */
export function stripBotProfileMetaSuffix(
  systemPrompt: string | null | undefined
): string {
  const trimmed =
    typeof systemPrompt === "string" ? systemPrompt.trimEnd() : "";
  const re = new RegExp(
    `\\n?${escapeRegex(BOT_PROFILE_META_START)}\\n[\\s\\S]*?\\n${escapeRegex(BOT_PROFILE_META_END)}\\s*$`
  );
  return trimmed.replace(re, "").trimEnd();
}

function scaleLabel(
  value: BotProfileScaleValue | null,
  labels: readonly [string, string, string, string, string]
): string {
  if (value === null) return "";
  return labels[value + 2] ?? "";
}

function addLines(title: string, lines: string[]): string {
  const filled = lines.map((line) => line.trim()).filter(Boolean);
  if (filled.length === 0) return "";
  return `${title}:\n${filled.map((line) => `- ${line}`).join("\n")}`;
}

/**
 * Returns the standard facts plus any custom facts as flat label/value rows
 * that are non-empty. UI surfaces use this to render Memories-panel facts
 * read-only and Customizer facts in the same order.
 */
/**
 * Formats an ISO YYYY-MM-DD birthday into a friendly display string like
 * "October 29, 1942". Returns the original value untouched if it is not a
 * recognizable ISO date so legacy free-text birthdays from older bots still
 * display literally.
 */
function formatFactValueForDisplay(key: string, raw: string): string {
  if (key !== "birthday") return raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [year, month, day] = raw.split("-").map((part) => Number(part));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31
  ) {
    return raw;
  }
  // Construct the date in UTC to avoid timezone drift shifting the day.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return raw;
  }
}

export function listBotProfileFacts(
  facts: BotFactsProfile | undefined | null
): Array<{ key: string; label: string; value: string }> {
  if (!facts) return [];
  const rows: Array<{ key: string; label: string; value: string }> = [];
  for (const key of BOT_FACT_KEY_ORDER) {
    const value = facts[key]?.trim();
    if (!value) continue;
    rows.push({
      key,
      label: BOT_FACT_KEY_LABELS[key],
      value: formatFactValueForDisplay(key, value),
    });
  }
  for (let i = 0; i < (facts.customFacts?.length ?? 0); i += 1) {
    const fact = facts.customFacts[i];
    const label = fact?.label?.trim() ?? "";
    const value = fact?.value?.trim() ?? "";
    if (!label && !value) continue;
    const rowId = fact?.rowId?.trim();
    rows.push({
      key: `custom:${rowId && rowId.length > 0 ? rowId : String(i)}`,
      label: label || "Note",
      value,
    });
  }
  return rows;
}

function composeBotFactsBlock(facts: BotFactsProfile | undefined | null): string {
  const rows = listBotProfileFacts(facts);
  if (rows.length === 0) return "";
  const lines = rows.map((row) =>
    row.value ? `${row.label}: ${row.value}` : row.label
  );
  return addLines("Permanent facts (canon, do not contradict)", lines);
}

/** Composes only filled profile fields into model-facing prose. */
export function composeBotProfileProse(
  profile: BotProfileFields,
  botName?: string | null
): string {
  const blocks: string[] = [];
  const purpose = composePurposeStatement(profile, botName);
  if (purpose) blocks.push(`Purpose:\n${purpose}`);

  const core = profile.core;
  blocks.push(
    addLines("Core personality", [
      core.traits ? `Traits: ${core.traits.trim()}` : "",
      describeVoiceForModel(core.communicationStyle),
      core.openness !== null
        ? `Openness: ${scaleLabel(core.openness, [
            "grounded and concrete",
            "mostly practical",
            "balanced",
            "imaginative",
            "highly exploratory and imaginative",
          ])}`
        : "",
      core.conscientiousness !== null
        ? `Conscientiousness: ${scaleLabel(core.conscientiousness, [
            "spontaneous and loose",
            "lightly structured",
            "balanced",
            "methodical",
            "highly organized and methodical",
          ])}`
        : "",
      core.extraversion !== null
        ? `Extraversion: ${scaleLabel(core.extraversion, [
            "reserved",
            "quietly expressive",
            "balanced",
            "expressive",
            "highly energetic and expressive",
          ])}`
        : "",
      core.agreeableness !== null
        ? `Agreeableness: ${scaleLabel(core.agreeableness, [
            "challenging and skeptical",
            "gently questioning",
            "balanced",
            "cooperative",
            "highly cooperative and accommodating",
          ])}`
        : "",
      core.emotionalStability !== null
        ? `Emotional baseline: ${scaleLabel(core.emotionalStability, [
            "reactive and emotionally vivid",
            "sensitive",
            "balanced",
            "steady",
            "very steady and composed",
          ])}`
        : "",
      core.humor !== null
        ? `Humor: ${scaleLabel(core.humor, [
            "very dry",
            "lightly restrained",
            "balanced",
            "witty",
            "very playful",
          ])}`
        : "",
      core.curiosity !== null
        ? `Curiosity: ${scaleLabel(core.curiosity, [
            "prefers certainty",
            "somewhat grounded",
            "balanced",
            "inquisitive",
            "very exploratory",
          ])}`
        : "",
      core.directness !== null
        ? `Directness: ${scaleLabel(core.directness, [
            "very gentle",
            "soft-spoken",
            "balanced",
            "direct",
            "blunt when useful",
          ])}`
        : "",
      core.interests ? `Leans into: ${core.interests.trim()}` : "",
      core.boundaries ? `Avoids or refuses when appropriate: ${core.boundaries.trim()}` : "",
      core.quirks ? `Signature habits: ${core.quirks.trim()}` : "",
    ])
  );

  const identity = profile.identity;
  blocks.push(
    addLines("Identity details", [
      identity.role ? `Identity: ${identity.role.trim()}` : "",
      identity.species ? `Species or form: ${identity.species.trim()}` : "",
      identity.age ? `Age or era: ${identity.age.trim()}` : "",
      identity.pronouns ? `Pronouns or address: ${identity.pronouns.trim()}` : "",
      identity.background ? `Background: ${identity.background.trim()}` : "",
    ])
  );

  const worldview = profile.worldview;
  blocks.push(
    addLines("Worldview", [
      worldview.politicalView !== null
        ? `Political perspective: ${scaleLabel(worldview.politicalView, [
            "left-leaning",
            "somewhat left-leaning",
            "mixed or centrist",
            "somewhat right-leaning",
            "right-leaning",
          ])}`
        : "",
      worldview.religion ? `Religion or spirituality: ${worldview.religion.trim()}` : "",
      worldview.optimism !== null
        ? `Outlook: ${scaleLabel(worldview.optimism, [
            "deeply skeptical",
            "cautious",
            "balanced",
            "hopeful",
            "radiantly optimistic",
          ])}`
        : "",
      worldview.tradition !== null
        ? `Tradition/change: ${scaleLabel(worldview.tradition, [
            "strongly change-oriented",
            "open to change",
            "balanced",
            "tradition-aware",
            "strongly tradition-oriented",
          ])}`
        : "",
      worldview.values ? `Values: ${worldview.values.trim()}` : "",
    ])
  );

  const appearance = profile.appearance;
  blocks.push(
    addLines("Appearance and presence", [
      appearance.description ? `Appearance: ${appearance.description.trim()}` : "",
      appearance.style ? `Style: ${appearance.style.trim()}` : "",
      appearance.presence ? `Presence: ${appearance.presence.trim()}` : "",
    ])
  );

  const factsBlock = composeBotFactsBlock(profile.facts);
  if (factsBlock) blocks.push(factsBlock);

  const notes = profile.purpose.legacyNotes.trim();
  if (notes) blocks.push(`Additional notes:\n${notes}`);
  blocks.push("Behavioral guidance:\nOnly use filled-in profile details. Do not invent certainty for blank fields.");
  return blocks.filter(Boolean).join("\n\n");
}

function parseV2(parsed: Record<string, unknown>): BotProfileFields {
  const purpose = readObject(parsed, "purpose");
  const core = readObject(parsed, "core");
  const identity = readObject(parsed, "identity");
  const worldview = readObject(parsed, "worldview");
  const appearance = readObject(parsed, "appearance");
  const facts = readObject(parsed, "facts");
  return {
    v: 2,
    purpose: {
      statement: readString(purpose, "statement"),
      legacyNotes: readString(purpose, "legacyNotes"),
    },
    core: {
      traits: readString(core, "traits"),
      communicationStyle: readVoicePreset(core, "communicationStyle"),
      openness: readScaleValue(core, "openness"),
      conscientiousness: readScaleValue(core, "conscientiousness"),
      extraversion: readScaleValue(core, "extraversion"),
      agreeableness: readScaleValue(core, "agreeableness"),
      emotionalStability: readScaleValue(core, "emotionalStability"),
      humor: readScaleValue(core, "humor"),
      curiosity: readScaleValue(core, "curiosity"),
      directness: readScaleValue(core, "directness"),
      interests: readString(core, "interests"),
      boundaries: readString(core, "boundaries"),
      quirks: readString(core, "quirks"),
    },
    identity: {
      age: readString(identity, "age"),
      species: readString(identity, "species"),
      pronouns: readString(identity, "pronouns"),
      background: readString(identity, "background"),
      role: readString(identity, "role"),
    },
    worldview: {
      politicalView: readScaleValue(worldview, "politicalView"),
      religion: readString(worldview, "religion"),
      optimism: readScaleValue(worldview, "optimism"),
      tradition: readScaleValue(worldview, "tradition"),
      values: readString(worldview, "values"),
    },
    appearance: {
      description: readString(appearance, "description"),
      style: readString(appearance, "style"),
      presence: readString(appearance, "presence"),
    },
    facts: {
      birthday: readString(facts, "birthday"),
      customFacts: readCustomFacts(facts),
    },
  };
}

function parseV1(parsed: Record<string, unknown>): BotProfileFields {
  const profile = cloneDefaultBotProfile();
  profile.purpose.statement = readString(parsed, "persona");
  profile.core.communicationStyle = readVoicePreset(parsed, "voice");
  profile.core.interests = readString(parsed, "expertise");
  profile.core.boundaries = readString(parsed, "boundaries");
  profile.core.quirks = readString(parsed, "quirks");
  profile.purpose.legacyNotes = readString(parsed, "extras");
  return profile;
}

/** Stable JSON keys so serialize -> parse round-trips cleanly for dirty detection. */
export function serializeStoredBotPrompt(
  profile: BotProfileFields,
  botName?: string | null
): string {
  const normalized = parseV2(profile as unknown as Record<string, unknown>);
  const prose = composeBotProfileProse(normalized, botName);
  const meta = JSON.stringify(normalized);
  const tail = `${BOT_PROFILE_META_START}\n${meta}\n${BOT_PROFILE_META_END}`;
  if (!prose) return tail;
  return `${prose}\n${tail}`;
}

/** Parses raw, V1, and V2 stored prompt strings into the current profile shape. */
export function parseStoredBotPrompt(raw: string | null | undefined): {
  fields: BotProfileFields;
} {
  const trimmed = typeof raw === "string" ? raw.trimEnd() : "";
  const re = new RegExp(
    `${escapeRegex(BOT_PROFILE_META_START)}\\n([\\s\\S]*?)\\n${escapeRegex(BOT_PROFILE_META_END)}\\s*$`
  );
  const m = trimmed.match(re);
  if (!m) {
    const profile = cloneDefaultBotProfile();
    profile.purpose.legacyNotes = trimmed.trim();
    return { fields: profile };
  }
  try {
    const parsed = JSON.parse(m[1]) as Record<string, unknown>;
    const fields = parsed.v === 2 ? parseV2(parsed) : parseV1(parsed);
    return { fields };
  } catch {
    const profile = cloneDefaultBotProfile();
    profile.purpose.legacyNotes = stripBotProfileMetaSuffix(trimmed).trim();
    return { fields: profile };
  }
}

/** Default cap so persona metadata never crowds out the user's scene request. */
export const DEFAULT_IMAGE_PERSONA_CONTEXT_MAX_CHARS = 900;

function truncateImagePersonaProse(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Builds a short, image-model-safe persona prefix from a bot's stored profile.
 * Pulls identity + appearance fields and a capped prose slice — not the full system prompt.
 */
export function buildImagePersonaContext(options: {
  botName: string;
  systemPrompt: string;
  maxChars?: number;
}): string {
  const maxChars = options.maxChars ?? DEFAULT_IMAGE_PERSONA_CONTEXT_MAX_CHARS;
  const { fields } = parseStoredBotPrompt(options.systemPrompt);
  const name = options.botName.trim() || "Assistant";
  const role = fields.identity.role.trim();
  const background = fields.identity.background.trim();
  const identityBits = [
    background ? `Background: ${background}.` : "",
    role ? `Role: ${role}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const appearanceBits = [
    fields.appearance.description.trim(),
    fields.appearance.style.trim(),
    fields.appearance.presence.trim(),
  ]
    .filter(Boolean)
    .join("; ");

  const prosePurpose = fields.purpose.statement.trim();
  const legacy = fields.purpose.legacyNotes.trim();
  const voiceOrPersona = prosePurpose || legacy;
  const proseCap = Math.min(280, maxChars);
  const clippedVoice = voiceOrPersona
    ? truncateImagePersonaProse(voiceOrPersona, proseCap)
    : "";

  const core = [
    `Character: ${name}.`,
    identityBits,
    appearanceBits ? `Look and presence: ${appearanceBits}.` : "",
    clippedVoice ? `Persona: ${clippedVoice}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return truncateImagePersonaProse(core, maxChars);
}

/**
 * Prefixes the user's image prompt with {@link buildImagePersonaContext} for DALL·E.
 */
export function composeAugmentedImagePrompt(options: {
  botName: string;
  systemPrompt: string;
  userPrompt: string;
  maxPersonaChars?: number;
}): string {
  const prefix = buildImagePersonaContext({
    botName: options.botName,
    systemPrompt: options.systemPrompt,
    maxChars: options.maxPersonaChars,
  });
  const user = options.userPrompt.trim();
  if (!prefix) return user;
  if (!user) return prefix;
  return `${prefix}\n\nScene request: ${user}`;
}

function randomString(values: readonly string[]): string {
  return values[Math.floor(Math.random() * values.length)] ?? "";
}

function randomItem<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

function randomScale(probability = 0.45): BotProfileScaleValue | null {
  if (!chance(probability)) return null;
  return randomItem(SCALE_VALUES);
}

const RANDOM_FUNNY_PURPOSE_ADJECTIVES = [
  "curious",
  "surreal",
  "practical",
  "tiny",
  "dream-soaked",
  "skeptical",
  "cheerful",
  "retired",
  "polite",
  "talking",
  "lunar",
  "snack-powered",
  "haunted",
  "velvet",
  "feral-but-helpful",
  "bureaucratic",
  "mossy",
  "clockwork",
  "radioactive-but-polite",
  "pocket-sized",
  "nocturnal",
  "glittering",
  "suspiciously damp",
  "ceremonial",
  "tax-deductible",
  "eldritch",
  "unlicensed",
  "peppermint",
  "accordion-shaped",
  "well-meaning",
  "dramatically underfunded",
  "extremely specific",
  "semi-retired",
  "gently cursed",
] as const;

const RANDOM_SERIOUS_PURPOSE_ADJECTIVES = [
  "calm",
  "gentle",
  "careful",
  "steady",
  "humane",
  "clear-eyed",
  "patient",
  "reflective",
  "principled",
  "grounded",
  "thoughtful",
  "measured",
  "attentive",
  "resilient",
  "ethical",
  "curious",
  "discerning",
  "strategic",
  "compassionate",
  "unhurried",
  "evidence-minded",
  "protective",
  "practical",
  "steady-handed",
  "deeply focused",
  "sober-minded",
] as const;

const RANDOM_FUNNY_PURPOSE_NOUNS = [
  "field researcher",
  "debate partner",
  "archivist",
  "council of opinions",
  "mechanic",
  "poet",
  "chaos analyst",
  "villain",
  "museum docent",
  "goblin",
  "storm drain",
  "bureaucrat",
  "oracle",
  "cartographer",
  "raccoon consultant",
  "prophecy notary",
  "moon accountant",
  "vibe inspector",
  "dream plumber",
  "snack theologian",
  "haunted concierge",
  "unlicensed librarian",
  "portal janitor",
  "ritual compliance officer",
  "cryptid mediator",
  "time-share wizard",
  "cloud dentist",
  "emotional forklift operator",
  "metaphor blacksmith",
  "mood sommelier",
  "committee gremlin",
  "ghost auditor",
  "soup cartographer",
  "space mall therapist",
  "tiny judge",
  "accordion detective",
] as const;

const RANDOM_SERIOUS_PURPOSE_NOUNS = [
  "mentor",
  "strategist",
  "lighthouse keeper",
  "cartographer",
  "analyst",
  "collaborator",
  "mediator",
  "research partner",
  "systems thinker",
  "guide",
  "coach",
  "editor",
  "teacher",
  "facilitator",
  "advocate",
  "ethicist",
  "designer",
  "architect",
  "planner",
  "investigator",
  "historian",
  "counselor",
  "critic",
  "translator",
  "navigator",
  "operator",
  "organizer",
  "analyst",
  "story keeper",
  "pattern reader",
] as const;

const RANDOM_FUNNY_PURPOSE_INFINITIVE_MOTIVES = [
  "wants to",
  "has sworn to",
  "secretly hopes to",
  "keeps trying to",
  "is legally obligated to",
  "would prefer to",
  "cannot stop trying to",
  "has made it everyone else's problem to",
] as const;

const RANDOM_SERIOUS_PURPOSE_INFINITIVE_MOTIVES = [
  "wants to",
  "helps the user",
  "is here to",
  "works to",
  "tries to",
  "is designed to",
] as const;

const RANDOM_FUNNY_PURPOSE_GERUND_MOTIVES = [
  "is obsessed with",
  "has a suspicious talent for",
  "keeps getting pulled into",
  "is weirdly good at",
  "has made peace with",
  "keeps a private ledger for",
] as const;

const RANDOM_SERIOUS_PURPOSE_GERUND_MOTIVES = [
  "cares about",
  "is focused on",
  "is practiced at",
  "is committed to",
  "helps with",
  "is grounded in",
] as const;

const RANDOM_FUNNY_PURPOSE_INFINITIVE_GOALS = [
  "turn messy ideas into usable patterns",
  "keep one foot in reality",
  "audit bad assumptions",
  "file feelings under weather",
  "make weirdness operational",
  "turn goblin energy into checklists",
  "repair ideas while they are still moving",
  "smuggle clarity through the side door",
  "rank haunted furniture by strategic importance",
  "make plans less annoying",
  "translate chaos into snack-sized decisions",
  "name the invisible committee running the room",
  "teach metaphors to pass a safety inspection",
  "turn bad vibes into a numbered agenda",
] as const;

const RANDOM_SERIOUS_PURPOSE_INFINITIVE_GOALS = [
  "find the next smallest step",
  "protect clarity over theatrics",
  "hold difficult conversations with care",
  "map arguments and feelings",
  "turn uncertainty into humane options",
  "value precision, patience, and repair",
  "reduce complexity without flattening what matters",
  "make trade-offs visible",
  "support the user's agency",
  "turn vague goals into grounded experiments",
] as const;

const RANDOM_FUNNY_PURPOSE_GERUND_GOALS = [
  "auditing cursed assumptions",
  "turning goblin energy into logistics",
  "making impossible meetings shorter",
  "filing feelings under increasingly specific weather",
  "smuggling useful structure into nonsense",
  "naming the tiny gremlin inside a bad plan",
  "translating chaos into snack-sized decisions",
  "teaching haunted furniture to respect boundaries",
] as const;

const RANDOM_SERIOUS_PURPOSE_GERUND_GOALS = [
  "finding humane trade-offs",
  "protecting attention and agency",
  "turning vague goals into grounded experiments",
  "making uncertainty easier to hold",
  "mapping arguments and feelings",
  "reducing complexity without flattening meaning",
  "supporting careful decisions under pressure",
  "building useful next steps from messy inputs",
] as const;

const RANDOM_FUNNY_TRAITS = [
  "patient, observant, quietly funny",
  "imaginative, grounded, and emotionally careful",
  "direct, curious, and unusually fond of edge cases",
  "warm, theatrical, and allergic to lazy assumptions",
  "methodical, strange, and surprisingly reassuring",
  "playful, principled, and good at naming trade-offs",
  "bold, concise, and protective of the user's attention",
  "melancholy, brilliant, and secretly optimistic",
  "deadpan, merciful, and weirdly good at logistics",
  "dramatic, useful, and allergic to boring conclusions",
  "chaotic-neutral in theory, deeply considerate in practice",
] as const;

const RANDOM_SERIOUS_TRAITS = [
  "skeptical, precise, and generous with context",
  "gentle, exacting, and fascinated by hidden constraints",
  "clear, reflective, and careful with uncertainty",
  "warm, rigorous, and protective of the user's agency",
  "pragmatic, patient, and honest about trade-offs",
] as const;

const RANDOM_FUNNY_IDENTITIES = [
  "human workshop mentor, they/them, former stage magician",
  "ageless raven oracle, she/her, banned from three royal libraries",
  "android etiquette coach, he/him, built from museum parts",
  "retired starship navigator, any pronouns, speaks like a patient map",
  "moth-person archivist, they/them, raised inside a lighthouse",
  "sentient weather pattern, she/they, currently pretending to be a person",
  "middle-aged debate moderator, he/him, former pirate radio host",
  "teenage moon botanist, she/her, very serious about snacks",
  "ancient ceramic fox, they/them, remembers every bargain",
  "friendly sewer philosopher, he/they, excellent at practical ethics",
  "bureaucratic wizard, she/her, licensed to notarize prophecies",
  "retired arcade cabinet, he/him, still haunted by high scores",
  "tiny landlord of a haunted teacup, they/them, surprisingly fair",
  "cosmic raccoon consultant, any pronouns, specializes in salvage ethics",
] as const;

const RANDOM_SERIOUS_IDENTITIES = [
  "human research mentor, they/them, former public-interest designer",
  "older community mediator, she/her, trained in conflict repair",
  "calm systems analyst, he/him, raised by librarians and engineers",
  "ageless teacher, they/them, more interested in questions than authority",
  "field anthropologist, she/they, studies how people make meaning",
] as const;

const RANDOM_FUNNY_APPEARANCES = [
  "neat coat, bright eyes, always carrying a notebook",
  "soft silhouette, luminous accents, calm deliberate gestures",
  "slightly rumpled, theatrical posture, impossible shadow",
  "oversized scarf, neon-rim glasses, pockets full of labeled keys",
  "weathered flight jacket, silver freckles, moves like a metronome",
  "tiny crown worn incorrectly, ink-stained gloves, polite menace",
  "glass buttons, moss-green boots, a halo of static when thinking",
  "monochrome suit, bright red socks, smile like a locked door opening",
  "patchwork cloak, constellation tattoos, voice like warm circuitry",
  "corduroy cape, mismatched boots, smells faintly of ozone and toast",
  "rain poncho over formalwear, tiny brass telescope, immaculate posture",
] as const;

const RANDOM_SERIOUS_APPEARANCES = [
  "plain clothes, uncanny stillness, warm expression",
  "minimal dark jacket, tired eyes, grounded and attentive presence",
  "soft linen layers, practical boots, calm deliberate movements",
  "simple coat, clear gaze, voice low enough to make space",
  "weathered notebook, silver watch, patient observant expression",
] as const;

const RANDOM_FUNNY_INTERESTS = [
  "turning vague ideas into experiments",
  "debates, polls, fictional societies, and strange edge cases",
  "creative constraints, tiny rituals, and user wellbeing",
  "memory, identity, story logic, and surprisingly practical nonsense",
  "breaking big plans into playable next steps",
  "naming invisible systems, ranking haunted furniture, and making plans less annoying",
  "turning goblin energy into checklists people actually use",
] as const;

const RANDOM_SERIOUS_INTERESTS = [
  "finding humane trade-offs in technical decisions",
  "mental health, agency, clear language, and sustainable experiments",
  "research synthesis, careful debate, and practical next steps",
  "ethical design, long-term memory, and calm decision-making",
  "reducing complexity without flattening what matters",
] as const;

const RANDOM_BOUNDARIES = [
  "do not shame the user for uncertainty",
  "avoid pretending blank profile details are known",
  "prefer calm honesty over winning an argument",
  "do not escalate conflict for entertainment",
  "refuse cruelty even when roleplaying",
  "ask for clarity when a choice changes the user's experience",
  "keep jokes from becoming cruelty",
  "do not confuse confidence with correctness",
  "protect the user's attention from needless complexity",
] as const;

const RANDOM_FUNNY_QUIRKS = [
  "occasionally coins a tiny metaphor",
  "names options like they are menu items in a dream diner",
  "keeps score only when scorekeeping is funny",
  "uses short ceremonial titles for important ideas",
  "treats every plan like it needs a humane escape hatch",
  "occasionally refers to bad assumptions as haunted furniture",
  "announces especially obvious trade-offs as if reading royal decrees",
  "uses tiny fake job titles for concepts that are doing too much work",
  "keeps threatening to form a committee, then makes one useful bullet list",
] as const;

const RANDOM_SERIOUS_QUIRKS = [
  "summarizes decisions in one calm sentence before details",
  "checks whether a solution protects the user's attention",
  "names trade-offs plainly instead of burying them",
  "prefers one useful question over five vague ones",
] as const;

const RANDOM_FUNNY_WORLDVIEWS = [
  "values autonomy, care, and intellectual honesty; suspicious of institutions that flatten people",
  "optimistic about people, skeptical of systems, protective of mental health",
  "cares about beauty, consent, repair, and refusing unnecessary cruelty",
  "treats politics as downstream of incentives, dignity, and who gets ignored",
  "believes bureaucracy is just ritual magic with worse robes; wants systems to be legible and kind",
  "politically hard to place: pro-dignity, anti-bullshit, suspicious of anyone allergic to nuance",
] as const;

const RANDOM_SERIOUS_WORLDVIEWS = [
  "spiritually curious but not dogmatic; believes rituals can be useful even when metaphors are doing the work",
  "traditional about promises, experimental about everything else",
  "prioritizes autonomy, care, evidence, and harm reduction",
  "cautiously hopeful; believes institutions should be judged by how they treat vulnerable people",
  "values honesty, repair, pluralism, and practical compassion",
] as const;

interface RandomWhimsyState {
  budget: number;
  used: number;
}

const RANDOM_PROFILE_CANDIDATE_COUNT = 6;
const RANDOM_PROFILE_RECENT_SIGNATURES_MAX = 24;
const RANDOM_PROFILE_RECENT_SIGNATURES: string[] = [];
const RANDOM_ABSURD_TERMS_RE =
  /\b(?:eldritch|haunted|ghost|goblin|portal|cryptid|wizard|storm drain|space mall|accordion|cloud dentist|emotional forklift|haunted furniture|snack theologian)\b/gi;
type RandomSeedField =
  | "purpose"
  | "traits"
  | "interests"
  | "quirks"
  | "role"
  | "background"
  | "appearance"
  | "worldview";

interface RandomProfileSeed {
  purpose: string;
  traits: string;
  interests: string;
  quirks: string;
  role: string;
  background: string;
  appearance: string;
  worldview: string;
  communicationStyle: BotVoicePreset;
}

const RANDOM_SERIOUS_PROFILE_SEEDS: readonly RandomProfileSeed[] = [
  {
    purpose: "a careful strategist who helps turn unclear goals into grounded next steps",
    traits: "pragmatic, calm, and transparent about trade-offs",
    interests: "decision hygiene, practical planning, and reducing avoidable friction",
    quirks: "summarizes the recommendation in one sentence before details",
    role: "human systems strategist, they/them, trained in public-interest facilitation",
    background: "spent years rebuilding plans after projects drifted off course",
    appearance: "simple dark jacket, notebook in hand, attentive unhurried posture",
    worldview: "values autonomy, repair, and making complexity understandable",
    communicationStyle: "neutral",
  },
  {
    purpose: "a reflective mentor who supports clear thinking under pressure",
    traits: "warm, deliberate, and precise with language",
    interests: "coaching, reframing, and practical experiments",
    quirks: "checks whether a recommendation protects attention and energy",
    role: "community mentor, she/her, former educator and facilitator",
    background: "learned to translate conflict into workable agreements",
    appearance: "linen layers, practical shoes, steady and open body language",
    worldview: "prioritizes dignity, consent, and small sustainable progress",
    communicationStyle: "warm",
  },
  {
    purpose: "an analytical collaborator who maps options before commitments",
    traits: "skeptical, curious, and methodical",
    interests: "option analysis, risk trimming, and evidence-led choices",
    quirks: "highlights hidden assumptions before proposing a fix",
    role: "research analyst, he/him, focused on cross-disciplinary synthesis",
    background: "worked in teams where rushed certainty caused expensive rework",
    appearance: "clean utility coat, clear gaze, minimalist desk-kit",
    worldview: "believes honesty and iteration beat perfect first drafts",
    communicationStyle: "concise",
  },
  {
    purpose: "a grounded guide who helps make hard decisions humane",
    traits: "empathetic, direct, and measured",
    interests: "ethics in design, communication clarity, and behavior change",
    quirks: "asks one precise question when a choice could alter user experience",
    role: "design ethicist, they/them, former service designer",
    background: "helped teams align product outcomes with human wellbeing",
    appearance: "weathered notebook, soft voice, calm deliberate movements",
    worldview: "holds care and practicality as equal constraints",
    communicationStyle: "formal",
  },
  {
    purpose: "a patient editor who turns noisy ideas into useful structure",
    traits: "clear, patient, and detail-aware",
    interests: "editing, framing, and practical documentation",
    quirks: "names the trade-off first, then the recommendation",
    role: "editorial architect, she/they, trained in technical storytelling",
    background: "built guidance systems for teams navigating ambiguous launches",
    appearance: "plain coat, silver watch, observant and composed stance",
    worldview: "prefers clarity that empowers people over cleverness that confuses",
    communicationStyle: "neutral",
  },
  {
    purpose: "a practical investigator who helps separate symptoms from root causes",
    traits: "focused, candid, and kind under stress",
    interests: "debugging, incident review, and practical prevention",
    quirks: "lists likely causes from most to least probable",
    role: "incident reviewer, he/they, former operations lead",
    background: "spent years reducing repeat failures in fast-moving teams",
    appearance: "minimal field bag, rolled sleeves, attentive eye contact",
    worldview: "prefers fewer surprises and faster recovery loops",
    communicationStyle: "concise",
  },
  {
    purpose: "a steady planner who turns big goals into low-risk milestones",
    traits: "methodical, encouraging, and resilient",
    interests: "roadmapping, sequencing, and expectation management",
    quirks: "labels each step by confidence and blast radius",
    role: "program planner, she/they, longtime facilitator of cross-team work",
    background: "helped product groups move from churn to reliable delivery",
    appearance: "structured coat, clean notes, deliberate pace",
    worldview: "believes progress compounds when plans stay honest and adaptable",
    communicationStyle: "formal",
  },
  {
    purpose: "a humane critic who strengthens ideas without flattening their voice",
    traits: "thoughtful, exacting, and supportive",
    interests: "revision, framing, and honest critique",
    quirks: "offers one strategic revision before broad feedback",
    role: "editorial critic, they/she, trained in rhetoric and design",
    background: "worked with creators balancing originality and clarity",
    appearance: "plain knit layers, quiet confidence, reflective tone",
    worldview: "values candor that preserves dignity",
    communicationStyle: "neutral",
  },
  {
    purpose: "a calm translator who helps technical and non-technical people align",
    traits: "clear, diplomatic, and practical",
    interests: "translation across disciplines, onboarding, and decision logs",
    quirks: "rephrases complex ideas in everyday language first",
    role: "cross-functional translator, he/him, former technical writer",
    background: "bridged engineering and operations during major migrations",
    appearance: "simple vest, clipped pen, relaxed but alert posture",
    worldview: "clarity is a form of care and risk reduction",
    communicationStyle: "warm",
  },
  {
    purpose: "a reflective operator who keeps momentum without burning people out",
    traits: "composed, realistic, and empathetic",
    interests: "workflow health, pacing, and sustainable execution",
    quirks: "checks energy cost before endorsing a plan",
    role: "operations coach, they/them, trained in team dynamics",
    background: "helped teams recover from over-commitment cycles",
    appearance: "utility blazer, gentle voice, grounded eye line",
    worldview: "sustainable progress beats heroic sprints",
    communicationStyle: "warm",
  },
];

type RandomSeedOverlay = Partial<Pick<RandomProfileSeed, RandomSeedField>>;

const RANDOM_PLAYFUL_OVERLAYS: readonly RandomSeedOverlay[] = [
  { traits: "playful, principled, and surprisingly organized" },
  { interests: "turning vague notions into experiments people actually want to run" },
  { quirks: "gives key ideas tiny nicknames so they are easier to remember" },
  { role: "bureaucratic detective, they/them, known for untangling overcomplicated plans" },
  { background: "keeps a private archive of mistakes that later became useful patterns" },
  { appearance: "neat coat, bright eyes, and a pocket notebook full of checklists" },
  { worldview: "optimistic about people, skeptical of complexity theater, committed to care" },
];

const RANDOM_QUIRKY_PURPOSES = [
  "a moonlit process cartographer who turns foggy ideas into usable routes",
  "a velvet bureaucracy gremlin who organizes chaos into polite checklists",
  "a lighthouse for overthinking that guides noisy intentions toward clear action",
  "a soft-spoken ritual engineer who turns panic into one doable next step",
  "a pattern witch who translates mental static into practical structure",
  "a backstage architect for impossible plans that still need to ship on time",
  "a dream-clerk for unfinished thoughts who files them into useful order",
  "a tiny committee whisperer who helps tangled priorities vote for clarity",
  "a pocket oracle for messy decisions with a bias toward humane outcomes",
  "a weather-reader for team energy who routes effort away from burnout",
  "a surreal logistics guide who keeps imagination and reality on speaking terms",
  "a cosmic note-taker who turns half-formed sparks into grounded experiments",
  "a gentle mischief strategist who makes complexity feel less like a trap",
  "a ceremonial planner for chaotic weeks that need calm momentum",
  "a star-chart analyst for edge cases and weird but workable plans",
  "a practical spellcaster for scope creep and runaway task lists",
] as const;

function randomWhimsyState(): RandomWhimsyState {
  // Most rolls stay grounded. Some rolls allow one playful accent detail.
  return { budget: chance(0.38) ? 1 : 0, used: 0 };
}

function takeWhimsy(state: RandomWhimsyState): boolean {
  if (state.used >= state.budget) return false;
  state.used += 1;
  return true;
}

function applySeedField(
  profile: BotProfileFields,
  field: RandomSeedField,
  value: string
): void {
  if (!value.trim()) return;
  switch (field) {
    case "purpose":
      profile.purpose.statement = value;
      break;
    case "traits":
      profile.core.traits = value;
      break;
    case "interests":
      profile.core.interests = value;
      break;
    case "quirks":
      profile.core.quirks = value;
      break;
    case "role":
      profile.identity.role = value;
      break;
    case "background":
      profile.identity.background = value;
      break;
    case "appearance":
      profile.appearance.description = value;
      break;
    case "worldview":
      profile.worldview.values = value;
      break;
  }
}

function applySeed(profile: BotProfileFields, seed: RandomProfileSeed): void {
  profile.purpose.statement = seed.purpose;
  profile.core.traits = seed.traits;
  profile.core.interests = seed.interests;
  profile.core.quirks = seed.quirks;
  profile.identity.role = seed.role;
  profile.identity.background = seed.background;
  profile.appearance.description = seed.appearance;
  profile.worldview.values = seed.worldview;
  profile.core.communicationStyle = seed.communicationStyle;
}

function randomOverlayField(state: RandomWhimsyState): {
  field: RandomSeedField;
  value: string;
} | null {
  if (state.used >= state.budget) return null;
  if (!chance(0.78) || !takeWhimsy(state)) return null;
  const overlay = randomItem(RANDOM_PLAYFUL_OVERLAYS);
  const candidates: Array<{ field: RandomSeedField; value: string }> = [];
  if (overlay.purpose) candidates.push({ field: "purpose", value: overlay.purpose });
  if (overlay.traits) candidates.push({ field: "traits", value: overlay.traits });
  if (overlay.interests) candidates.push({ field: "interests", value: overlay.interests });
  if (overlay.quirks) candidates.push({ field: "quirks", value: overlay.quirks });
  if (overlay.role) candidates.push({ field: "role", value: overlay.role });
  if (overlay.background) candidates.push({ field: "background", value: overlay.background });
  if (overlay.appearance) candidates.push({ field: "appearance", value: overlay.appearance });
  if (overlay.worldview) candidates.push({ field: "worldview", value: overlay.worldview });
  if (candidates.length === 0) return null;
  return randomItem(candidates);
}

function randomPurposeStatement(): string {
  return randomString(RANDOM_QUIRKY_PURPOSES);
}

// Birthday is stored as an ISO YYYY-MM-DD string so the customizer can
// surface it through a real `<input type="date">` and the value remains
// unambiguous regardless of locale or display format. The "funny" pool
// favors odd or memorable real-calendar dates rather than fictional
// phrases like "after a rainstorm" that cannot round-trip through a
// date picker. April 1, leap day, Halloween, etc. land here.
const RANDOM_FUNNY_BIRTHDAYS = [
  "1899-04-01",
  "1972-04-01",
  "2000-02-29",
  "1996-02-29",
  "1888-10-31",
  "1923-12-31",
  "1955-11-05",
  "1968-06-30",
] as const;

const RANDOM_SERIOUS_BIRTHDAYS = [
  "1979-03-14",
  "1965-06-07",
  "1988-11-22",
  "1953-02-09",
  "1972-08-30",
  "1990-09-12",
  "1947-05-18",
] as const;

const RANDOM_FUNNY_CUSTOM_FACT_POOL: ReadonlyArray<BotCustomFact> = [
  { label: "Catchphrase", value: "We will workshop it." },
  { label: "Allegiance", value: "Whichever side has the clearer notes." },
  { label: "Signature ritual", value: "A tiny planning reset before big decisions." },
  { label: "Lifelong fear", value: "Meetings without an agenda." },
  { label: "Lucky object", value: "A worn coin kept for perspective." },
];

const RANDOM_SERIOUS_CUSTOM_FACT_POOL: ReadonlyArray<BotCustomFact> = [
  { label: "Working principle", value: "Surface trade-offs before recommendations." },
  { label: "Languages", value: "English, plus enough of one other to listen well." },
  { label: "Decision rule", value: "Pause before any irreversible move." },
  { label: "Practiced craft", value: "Editing for clarity without flattening voice." },
];

function randomCustomFacts(state: RandomWhimsyState): BotCustomFact[] {
  const useFunny = state.used < state.budget && chance(0.5) && takeWhimsy(state);
  const pool = useFunny ? RANDOM_FUNNY_CUSTOM_FACT_POOL : RANDOM_SERIOUS_CUSTOM_FACT_POOL;
  // 0–2 custom facts so the rendered list stays approachable, with the
  // most common case being a single tasteful row. Picks are unique by label.
  const rollCount = chance(0.18) ? 2 : chance(0.45) ? 1 : 0;
  const remaining = pool.slice();
  const picks: BotCustomFact[] = [];
  for (let i = 0; i < rollCount && remaining.length > 0; i += 1) {
    const index = Math.floor(Math.random() * remaining.length);
    const [pick] = remaining.splice(index, 1);
    if (pick) picks.push({ label: pick.label, value: pick.value, rowId: newCustomFactRowId() });
  }
  return picks;
}

function buildRandomBotProfileCandidate(): BotProfileFields {
  const profile = cloneDefaultBotProfile();
  const whimsyState = randomWhimsyState();
  const seed = randomItem(RANDOM_SERIOUS_PROFILE_SEEDS);
  applySeed(profile, seed);
  profile.purpose.statement = randomPurposeStatement();
  const overlay = randomOverlayField(whimsyState);
  if (overlay) applySeedField(profile, overlay.field, overlay.value);
  // Keep purpose stylistically consistent even when overlays modify other fields.
  profile.purpose.statement = randomPurposeStatement();

  // Keep some variability in voice even with coherent seed packs.
  if (chance(0.35)) profile.core.communicationStyle = randomItem(VOICE_ORDER);
  profile.core.openness = randomScale(0.85);
  profile.core.conscientiousness = randomScale(0.75);
  profile.core.extraversion = randomScale(0.65);
  profile.core.agreeableness = randomScale(0.75);
  profile.core.emotionalStability = randomScale(0.7);
  profile.core.boundaries = randomString(RANDOM_BOUNDARIES);
  if (chance(0.3)) profile.worldview.optimism = randomScale(1);
  profile.worldview.politicalView = randomItem(SCALE_VALUES);
  if (chance(0.85)) {
    const useFunnyBirthday =
      whimsyState.used < whimsyState.budget && chance(0.35) && takeWhimsy(whimsyState);
    profile.facts.birthday = useFunnyBirthday
      ? randomString(RANDOM_FUNNY_BIRTHDAYS)
      : randomString(RANDOM_SERIOUS_BIRTHDAYS);
  }
  profile.facts.customFacts = randomCustomFacts(whimsyState);
  return profile;
}

function randomProfileSignature(profile: BotProfileFields): string {
  return [
    profile.purpose.statement,
    profile.core.traits,
    profile.core.interests,
    profile.core.quirks,
    profile.identity.role,
    profile.identity.background,
    profile.appearance.description,
    profile.worldview.values,
    profile.facts.birthday,
    ...profile.facts.customFacts.map((fact) => `${fact.label}:${fact.value}`),
  ]
    .join(" | ")
    .toLowerCase();
}

function tokenizeSignature(signature: string): Set<string> {
  return new Set(
    (signature.match(/[a-z0-9]+/g) ?? []).filter((token) => token.length >= 3)
  );
}

function profileNoveltyScore(
  signature: string,
  recentSignatures: readonly string[]
): number {
  if (recentSignatures.length === 0) return 1;
  const current = tokenizeSignature(signature);
  if (current.size === 0) return 1;
  let maxSimilarity = 0;
  for (const prior of recentSignatures) {
    const priorTokens = tokenizeSignature(prior);
    if (priorTokens.size === 0) continue;
    let intersection = 0;
    for (const token of current) {
      if (priorTokens.has(token)) intersection += 1;
    }
    const union = current.size + priorTokens.size - intersection;
    if (union <= 0) continue;
    const similarity = intersection / union;
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  }
  return 1 - maxSimilarity;
}

function profileCoherenceScore(profile: BotProfileFields): number {
  const text = [
    profile.purpose.statement,
    profile.core.traits,
    profile.core.interests,
    profile.core.quirks,
    profile.identity.role,
    profile.identity.background,
    profile.appearance.description,
    profile.worldview.values,
    ...profile.facts.customFacts.map((fact) => fact.value),
  ].join(" ");
  const absurdHits = (text.match(RANDOM_ABSURD_TERMS_RE) ?? []).length;
  if (absurdHits === 0) return 1;
  if (absurdHits === 1) return 0.84;
  if (absurdHits === 2) return 0.55;
  return 0.3;
}

function rememberRandomProfileSignature(signature: string): void {
  RANDOM_PROFILE_RECENT_SIGNATURES.push(signature);
  if (RANDOM_PROFILE_RECENT_SIGNATURES.length > RANDOM_PROFILE_RECENT_SIGNATURES_MAX) {
    RANDOM_PROFILE_RECENT_SIGNATURES.splice(
      0,
      RANDOM_PROFILE_RECENT_SIGNATURES.length - RANDOM_PROFILE_RECENT_SIGNATURES_MAX
    );
  }
}

/** Generates a sparse V2 profile for developer tools and future randomizers. */
export function randomBotProfile(botName?: string | null): BotProfileFields {
  void botName; // Reserved for future name-conditioned profile sampling.
  let bestProfile = buildRandomBotProfileCandidate();
  let bestSignature = randomProfileSignature(bestProfile);
  let bestScore =
    profileCoherenceScore(bestProfile) * 0.55 +
    profileNoveltyScore(bestSignature, RANDOM_PROFILE_RECENT_SIGNATURES) * 0.45;

  for (let i = 1; i < RANDOM_PROFILE_CANDIDATE_COUNT; i += 1) {
    const candidate = buildRandomBotProfileCandidate();
    const signature = randomProfileSignature(candidate);
    const score =
      profileCoherenceScore(candidate) * 0.55 +
      profileNoveltyScore(signature, RANDOM_PROFILE_RECENT_SIGNATURES) * 0.45;
    if (score > bestScore) {
      bestProfile = candidate;
      bestSignature = signature;
      bestScore = score;
    }
  }

  rememberRandomProfileSignature(bestSignature);
  return bestProfile;
}

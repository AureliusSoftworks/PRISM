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
  | "appearance";

export const BOT_PROFILE_CATEGORY_ORDER: readonly BotProfileCategoryId[] = [
  "purpose",
  "core",
  "identity",
  "worldview",
  "appearance",
] as const;

export const BOT_PROFILE_CATEGORY_LABELS: Record<BotProfileCategoryId, string> = {
  purpose: "Purpose",
  core: "Core",
  identity: "Identity",
  worldview: "Worldview",
  appearance: "Appearance",
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
  humor: BotProfileScaleValue | null;
  curiosity: BotProfileScaleValue | null;
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

export interface BotProfileV2 {
  v: 2;
  purpose: BotPurposeProfile;
  core: BotCoreProfile;
  identity: BotIdentityProfile;
  worldview: BotWorldviewProfile;
  appearance: BotAppearanceProfile;
}

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
};

function cloneDefaultBotProfile(): BotProfileFields {
  return {
    v: 2,
    purpose: { ...DEFAULT_BOT_PROFILE_FIELDS.purpose },
    core: { ...DEFAULT_BOT_PROFILE_FIELDS.core },
    identity: { ...DEFAULT_BOT_PROFILE_FIELDS.identity },
    worldview: { ...DEFAULT_BOT_PROFILE_FIELDS.worldview },
    appearance: { ...DEFAULT_BOT_PROFILE_FIELDS.appearance },
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

function normalizePurposeTail(
  statement: string,
  botName?: string | null
): string {
  let custom = statement.trim().replace(/^you\s+are\s+/i, "").trim();
  const name = typeof botName === "string" ? botName.trim() : "";
  if (name) {
    custom = custom
      .replace(new RegExp(`^${escapeRegex(name)}\\s*,?\\s*`, "i"), "")
      .trim();
  }
  return custom;
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
  return {
    v: 2,
    purpose: {
      statement: readString(purpose, "statement"),
      legacyNotes: readString(purpose, "legacyNotes"),
    },
    core: {
      traits: readString(core, "traits"),
      communicationStyle: readVoicePreset(core, "communicationStyle"),
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

function randomToneSet() {
  return chance(0.7) ? "funny" : "serious";
}

function randomFromTone(
  tone: "funny" | "serious",
  funny: readonly string[],
  serious: readonly string[]
): string {
  return tone === "funny" ? randomString(funny) : randomString(serious);
}

function articleFor(phrase: string): "a" | "an" {
  return /^[aeiou]/i.test(phrase.trim()) ? "an" : "a";
}

function randomPurpose(tone: "funny" | "serious"): string {
  const adjective = randomFromTone(
    tone,
    RANDOM_FUNNY_PURPOSE_ADJECTIVES,
    RANDOM_SERIOUS_PURPOSE_ADJECTIVES
  );
  const noun = randomFromTone(
    tone,
    RANDOM_FUNNY_PURPOSE_NOUNS,
    RANDOM_SERIOUS_PURPOSE_NOUNS
  );
  const useGerund = chance(0.42);
  const motive = useGerund
    ? randomFromTone(
        tone,
        RANDOM_FUNNY_PURPOSE_GERUND_MOTIVES,
        RANDOM_SERIOUS_PURPOSE_GERUND_MOTIVES
      )
    : randomFromTone(
        tone,
        RANDOM_FUNNY_PURPOSE_INFINITIVE_MOTIVES,
        RANDOM_SERIOUS_PURPOSE_INFINITIVE_MOTIVES
      );
  const goal = useGerund
    ? randomFromTone(
        tone,
        RANDOM_FUNNY_PURPOSE_GERUND_GOALS,
        RANDOM_SERIOUS_PURPOSE_GERUND_GOALS
      )
    : randomFromTone(
        tone,
        RANDOM_FUNNY_PURPOSE_INFINITIVE_GOALS,
        RANDOM_SERIOUS_PURPOSE_INFINITIVE_GOALS
      );
  const identity = `${adjective} ${noun}`;
  return `${articleFor(identity)} ${identity} who ${motive} ${goal}`;
}

/** Generates a sparse V2 profile for developer tools and future randomizers. */
export function randomBotProfile(botName?: string | null): BotProfileFields {
  const profile = cloneDefaultBotProfile();
  const name = typeof botName === "string" ? botName.trim() : "";
  const tone = randomToneSet();
  profile.purpose.statement = randomPurpose(tone);
  profile.core.traits = randomFromTone(tone, RANDOM_FUNNY_TRAITS, RANDOM_SERIOUS_TRAITS);
  profile.core.communicationStyle = randomItem(VOICE_ORDER);
  profile.core.humor = randomItem(SCALE_VALUES);
  profile.core.curiosity = randomScale(0.55);
  profile.core.directness = randomScale(0.45);
  profile.core.interests = randomFromTone(tone, RANDOM_FUNNY_INTERESTS, RANDOM_SERIOUS_INTERESTS);
  profile.core.boundaries = randomString(RANDOM_BOUNDARIES);
  profile.core.quirks = randomFromTone(tone, RANDOM_FUNNY_QUIRKS, RANDOM_SERIOUS_QUIRKS);
  profile.identity.role = randomFromTone(tone, RANDOM_FUNNY_IDENTITIES, RANDOM_SERIOUS_IDENTITIES);
  profile.identity.background = randomString([
    "left their old profession after realizing advice can be a form of architecture",
    "learned diplomacy by mediating arguments between machines and ghosts",
    "keeps a private archive of mistakes that became useful later",
    "came from a city where every public office is also a theater",
    "was designed for one purpose and became more interesting after failing at it",
    "travels with a notebook of questions nobody has answered cleanly yet",
    "learned to distrust easy answers after one easy answer ruined a very good afternoon",
    "became useful by studying the difference between comfort and avoidance",
  ] as const);
  profile.appearance.description = randomFromTone(
    tone,
    RANDOM_FUNNY_APPEARANCES,
    RANDOM_SERIOUS_APPEARANCES
  );
  if (chance(0.3)) profile.worldview.optimism = randomScale(1);
  profile.worldview.politicalView = randomItem(SCALE_VALUES);
  profile.worldview.values = randomFromTone(tone, RANDOM_FUNNY_WORLDVIEWS, RANDOM_SERIOUS_WORLDVIEWS);
  return profile;
}

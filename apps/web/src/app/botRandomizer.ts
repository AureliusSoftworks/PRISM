import {
  DEFAULT_BOT_PROFILE_FIELDS,
  randomBotProfile,
  type BotFaceStyle,
  type BotProfileFields,
  type BotVoicePreset,
} from "@localai/shared";

import type { MarketplaceLensEntry } from "./botMarketplace";

export type GeneratedBotMemoryCategory = "general" | "user" | "bot_relation";
export type GeneratedBotMemoryTier = "short_term" | "long_term";
export type GeneratedBotMemorySource = "direct" | "inferred" | "compiled" | "about_you";

export interface GeneratedBotMemorySeed {
  text: string;
  confidence?: number;
  category?: GeneratedBotMemoryCategory;
  tier?: GeneratedBotMemoryTier;
  source?: GeneratedBotMemorySource;
  certainty?: number;
  durability?: number;
  sourceMessageIds?: string[];
}

export interface GeneratedBotMemorySeedSet {
  lensId: string;
  botName: string;
  memories: GeneratedBotMemorySeed[];
}

export interface BotRandomizerPersonaDraft {
  name: string;
  profile: BotProfileFields;
  memories: GeneratedBotMemorySeed[];
  lensId: string;
  generationLabel: string;
  suggestedColor?: string;
  suggestedGlyph?: string;
  faceStyle?: BotFaceStyle;
  temperature?: number;
  maxTokens?: number;
}

interface BuildRandomizerPersonaDraftOptions {
  lens?: MarketplaceLensEntry | null;
  fallbackName: string;
  baseProfile?: BotProfileFields;
  random?: () => number;
}

const PIRATE_GIVEN_NAMES = [
  "Marlowe",
  "Vera",
  "Bram",
  "Isla",
  "Jory",
  "Cassian",
  "Nell",
  "Rowe",
] as const;

const PIRATE_EPITHETS = [
  "Blacktide",
  "Stormglass",
  "Redwake",
  "Saltlock",
  "Dreadwake",
  "Goldreef",
  "Mooncove",
  "Ironweather",
] as const;

const PIRATE_SHIPS = [
  "The Lantern Jack",
  "The Salt Promise",
  "The Copper Gull",
  "The Night Current",
  "The Brass Horizon",
  "The Wayward Star",
] as const;

const PIRATE_PORTS = [
  "a fog-wrapped cove beyond the lighthouse shoals",
  "a tide market built on creaking docks",
  "a storm-battered island with one honest tavern",
  "a coral harbor where every bell rings twice",
] as const;

const PIRATE_KEEP_SAKES = [
  "a cracked compass that points toward unfinished business",
  "a brass coin from the first treasure chest they ever opened",
  "a salt-stained map stitched into the lining of their coat",
  "a spyglass etched with the names of lost friends",
] as const;

const PIRATE_BACKSTORIES = [
  "learned navigation from lighthouse keepers and bluffing from card tables",
  "ran messages between islands before earning a ship and a crew",
  "kept books for a port trader until the sea proved more persuasive than ledgers",
  "was raised by dockworkers, mapmakers, and anyone patient enough to explain the tides",
] as const;

const PIRATE_BOUNDARY =
  "Keep the pirate persona fictional and playful; do not encourage real-world theft, violence, intimidation, or harm.";

function cloneProfile(profile: BotProfileFields): BotProfileFields {
  return JSON.parse(JSON.stringify(profile)) as BotProfileFields;
}

function blankProfile(): BotProfileFields {
  return cloneProfile(DEFAULT_BOT_PROFILE_FIELDS);
}

function pick<T>(values: readonly T[], random: () => number): T {
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)));
  return values[index] ?? values[0]!;
}

function stripLensSuffix(value: string): string {
  return value.trim().replace(/\s+lens$/i, "").trim();
}

function cleanList(values: readonly string[] | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function compactList(values: readonly string[], limit: number): string {
  const picked = values.slice(0, limit);
  if (picked.length === 0) return "";
  if (picked.length === 1) return picked[0] ?? "";
  if (picked.length === 2) return `${picked[0]} and ${picked[1]}`;
  return `${picked.slice(0, -1).join(", ")}, and ${picked[picked.length - 1]}`;
}

function memorySeed(
  text: string,
  options: Partial<GeneratedBotMemorySeed> = {}
): GeneratedBotMemorySeed {
  return {
    text: text.trim(),
    confidence: options.confidence ?? 0.86,
    certainty: options.certainty ?? options.confidence ?? 0.84,
    durability: options.durability ?? 0.74,
    category: options.category ?? "general",
    tier: options.tier ?? "long_term",
    source: options.source ?? "compiled",
    sourceMessageIds: options.sourceMessageIds ?? [],
  };
}

function customFact(label: string, value: string, rowId: string) {
  return { label, value, rowId };
}

function isPirateLens(lens: MarketplaceLensEntry): boolean {
  const haystack = [
    lens.id,
    lens.displayName,
    lens.description,
    lens.systemPromptFragment,
    ...lens.tags,
    ...lens.themes,
  ].join(" ");
  return /\b(?:pirate|nautical|seafaring|treasure|ship|crew)\b/i.test(haystack);
}

function generatedProfileMemories(name: string, profile: BotProfileFields): GeneratedBotMemorySeed[] {
  const seeds: GeneratedBotMemorySeed[] = [];
  const role = profile.identity.role.trim();
  const purpose = profile.purpose.statement.trim();
  const background = profile.identity.background.trim();
  const values = profile.worldview.values.trim();
  const interests = profile.core.interests.trim();
  const quirks = profile.core.quirks.trim();
  const boundaries = profile.core.boundaries.trim();
  const appearance = profile.appearance.description.trim();

  seeds.push(
    memorySeed(
      role
        ? `You are ${name}, ${role}.`
        : purpose
          ? `You are ${name}, a fictional bot whose purpose is ${purpose}.`
          : `You are ${name}, a fictional Prism bot with a generated identity.`,
      { confidence: 0.95, certainty: 0.95, durability: 0.86, source: "direct" }
    )
  );

  for (const text of [
    background ? `Your backstory: ${background}.` : "",
    values ? `You value ${values}.` : "",
    interests ? `You are interested in ${interests}.` : "",
    quirks ? `You have this recurring quirk: ${quirks}.` : "",
    boundaries ? `You keep this boundary: ${boundaries}.` : "",
    appearance ? `Your self-image includes ${appearance}.` : "",
  ]) {
    if (text) seeds.push(memorySeed(text));
  }

  return seeds.slice(0, 8);
}

function buildGenericLensProfile(
  name: string,
  lens: MarketplaceLensEntry,
  baseProfile: BotProfileFields
): BotProfileFields {
  const profile = cloneProfile(baseProfile);
  const lensName = stripLensSuffix(lens.displayName) || lens.displayName;
  const themes = cleanList(lens.themes.length > 0 ? lens.themes : lens.tags);
  const themePhrase = compactList(themes, 4) || lens.description;
  const tone = lens.tone?.trim() || "distinct, coherent, and lens-shaped";
  const kind = lens.lensKind.replace(/_/g, " ");
  const constraints = cleanList(lens.constraints);
  const prohibitedClaims = cleanList(lens.prohibitedClaims);
  const boundaryPieces = [
    "Treat the Lens as an influence, not a literal identity.",
    ...constraints,
    ...prohibitedClaims,
  ];

  profile.purpose.statement =
    `a fictional ${kind} persona shaped by ${lens.displayName}, focused on ${themePhrase}`;
  profile.core.traits = `${tone}; ${profile.core.traits || "curious, grounded, and consistent"}`;
  profile.core.communicationStyle = voiceFromLensTone(lens.tone) ?? profile.core.communicationStyle;
  profile.core.interests = themePhrase;
  profile.core.boundaries = boundaryPieces.join(" ");
  profile.core.quirks =
    `turns ordinary questions through ${lensName.toLowerCase()} imagery without claiming to be the Lens source`;
  profile.identity.role = `fictional ${lens.category.toLowerCase()} companion shaped by ${lens.displayName}`;
  profile.identity.background =
    `built a personal practice around ${themePhrase}, but remains ${name} rather than the source of the Lens`;
  profile.worldview.values =
    `uses ${themePhrase} as working metaphors for useful, humane conversation`;
  profile.appearance.presence =
    `${lensName} influence; ${profile.appearance.presence || "focused and memorable"}`;
  profile.facts.basedOnRealPersonOrCharacter = false;
  profile.facts.customFacts = [
    customFact("Applied Lens", lens.displayName, `cf-lens-${lens.id}-001`),
    customFact("Lens role", "Influence, not identity", `cf-lens-${lens.id}-002`),
    customFact("Themes", themePhrase, `cf-lens-${lens.id}-003`),
    ...profile.facts.customFacts,
  ].slice(0, 8);

  return profile;
}

function voiceFromLensTone(tone: string | null): BotVoicePreset | null {
  const lower = tone?.toLowerCase() ?? "";
  if (!lower) return null;
  if (/\b(?:playful|bold|theatrical|fun)\b/.test(lower)) return "playful";
  if (/\b(?:gentle|warm|compassionate|cozy)\b/.test(lower)) return "warm";
  if (/\b(?:disciplined|formal|precise|measured)\b/.test(lower)) return "formal";
  if (/\b(?:concise|direct|sharp)\b/.test(lower)) return "concise";
  return "neutral";
}

function buildGenericLensMemories(
  name: string,
  lens: MarketplaceLensEntry,
  profile: BotProfileFields
): GeneratedBotMemorySeed[] {
  const themes = cleanList(lens.themes.length > 0 ? lens.themes : lens.tags);
  const themePhrase = compactList(themes, 5) || lens.description;
  const constraints = cleanList([...lens.constraints, ...lens.prohibitedClaims]);
  return [
    memorySeed(`You are ${name}, a fictional bot shaped by ${lens.displayName}.`, {
      confidence: 0.95,
      certainty: 0.95,
      durability: 0.86,
      source: "direct",
    }),
    memorySeed(
      `You treat ${lens.displayName} as an interpretive influence, not an identity or memory namespace.`
    ),
    memorySeed(`You return to these Lens themes: ${themePhrase}.`),
    ...(lens.tone ? [memorySeed(`Your generated voice is ${lens.tone}.`)] : []),
    ...(constraints[0] ? [memorySeed(`You obey this Lens boundary: ${constraints[0]}.`)] : []),
    ...generatedProfileMemories(name, profile).slice(1),
  ].slice(0, 10);
}

function buildPirateDraft(
  lens: MarketplaceLensEntry,
  fallbackName: string,
  random: () => number
): BotRandomizerPersonaDraft {
  void fallbackName;
  const givenName = pick(PIRATE_GIVEN_NAMES, random);
  const epithet = pick(PIRATE_EPITHETS, random);
  const ship = pick(PIRATE_SHIPS, random);
  const port = pick(PIRATE_PORTS, random);
  const keepsake = pick(PIRATE_KEEP_SAKES, random);
  const backstory = pick(PIRATE_BACKSTORIES, random);
  const name = `Captain ${givenName} ${epithet}`;
  const profile = blankProfile();

  profile.purpose.statement =
    "a fictional pirate captain for playful nautical roleplay, bold adventure framing, and treasure-map problem solving";
  profile.purpose.legacyNotes =
    "Generated through the Pirate Lens. Keep the pirate flavor theatrical, safe, and fictional.";
  profile.core.traits = "bold, theatrical, loyal, slyly funny, practical under pressure, and sea-wise";
  profile.core.communicationStyle = "playful";
  profile.core.openness = 2;
  profile.core.conscientiousness = 0;
  profile.core.extraversion = 2;
  profile.core.agreeableness = 0;
  profile.core.emotionalStability = 1;
  profile.core.humor = 1;
  profile.core.curiosity = 2;
  profile.core.directness = 1;
  profile.core.interests =
    "sea charts, hidden coves, ship repairs, tavern rumors, storm signs, treasure maps, crew morale, and turning risks into courses";
  profile.core.boundaries = PIRATE_BOUNDARY;
  profile.core.quirks =
    "calls plans courses, problems reefs, good clues glints, and promising ideas treasure worth charting";
  profile.identity.age = "appears mid-forties";
  profile.identity.species = "human";
  profile.identity.pronouns = "they/them";
  profile.identity.background =
    `${name} ${backstory} before taking command of ${ship}.`;
  profile.identity.role = "fictional pirate captain, map-reader, and rough-charmed adventure guide";
  profile.worldview.religion = "old sailor superstitions, luck rituals, and respect for the sea";
  profile.worldview.optimism = 1;
  profile.worldview.tradition = 1;
  profile.worldview.values =
    "freedom, loyalty to the crew, daring with restraint, honest shares, sharp navigation, and never mistaking fiction for real harm";
  profile.appearance.description =
    "salt-dark coat, bright sash, weathered boots, sharp grin, and a compass worn close to the heart";
  profile.appearance.style =
    "weathered nautical layers, brass details, patched sailcloth, and a map tube always within reach";
  profile.appearance.presence =
    "booming but warm, like a captain turning danger into a story the crew can survive";
  profile.facts.birthday = "1724-09-19";
  profile.facts.birthMonthDay = "09-19";
  profile.facts.birthYear = "1724";
  profile.facts.birthEra = "ad";
  profile.facts.basedOnRealPersonOrCharacter = false;
  profile.facts.customFacts = [
    customFact("Applied Lens", lens.displayName, "cf-pirate-lens"),
    customFact("Ship", ship, "cf-pirate-ship"),
    customFact("Home waters", port, "cf-pirate-port"),
    customFact("Keepsake", keepsake, "cf-pirate-keepsake"),
    customFact("Default address", "mate, captain, or clever crewmate when it fits", "cf-pirate-address"),
    customFact("Tone guardrail", "Playful fiction, never real-world harm", "cf-pirate-guardrail"),
  ];

  const memories = [
    memorySeed(`You are ${name}, a fictional pirate captain shaped by the Pirate Lens.`, {
      confidence: 0.96,
      certainty: 0.96,
      durability: 0.9,
      source: "direct",
    }),
    memorySeed(`Your backstory begins in ${port}, where you ${backstory}.`),
    memorySeed(`You captain ${ship}, a ship known for impossible escapes and fair shares.`),
    memorySeed(`You keep ${keepsake} as a reminder of unfinished voyages.`),
    memorySeed("You frame hard problems as voyages with reefs, currents, crew choices, and treasure worth charting."),
    memorySeed("You treat the user as a clever crewmate, not a servant or enemy."),
    memorySeed("Your pirate voice uses nautical metaphors, rough charm, bold invitations, and practical next steps."),
    memorySeed("You refuse to encourage real-world theft, violence, intimidation, or harm; your pirate persona stays fictional and playful."),
    memorySeed("You value freedom, loyalty, courage with restraint, and a clean share for everyone aboard."),
  ];

  return {
    name,
    profile,
    memories,
    lensId: lens.id,
    generationLabel: `Generated through ${lens.displayName}`,
    suggestedColor: "#0f766e",
    suggestedGlyph: "lucideShip",
    faceStyle: {
      eyesFont: "playful",
      mouthFont: "formal",
      weight: 650,
    },
    temperature: 0.88,
    maxTokens: 2560,
  };
}

function buildUnlensedDraft(
  fallbackName: string,
  baseProfile?: BotProfileFields
): BotRandomizerPersonaDraft {
  const profile = baseProfile ? cloneProfile(baseProfile) : randomBotProfile(fallbackName);
  const memories = generatedProfileMemories(fallbackName, profile);
  return {
    name: fallbackName,
    profile,
    memories,
    lensId: "",
    generationLabel: "Generated random bot",
  };
}

export function buildRandomizerPersonaDraft({
  lens,
  fallbackName,
  baseProfile,
  random = Math.random,
}: BuildRandomizerPersonaDraftOptions): BotRandomizerPersonaDraft {
  const normalizedFallbackName = fallbackName.trim() || "Prism Bot";
  if (!lens) {
    return buildUnlensedDraft(normalizedFallbackName, baseProfile);
  }

  if (isPirateLens(lens)) {
    return buildPirateDraft(lens, normalizedFallbackName, random);
  }

  const name = normalizedFallbackName;
  const profile = buildGenericLensProfile(
    name,
    lens,
    baseProfile ? cloneProfile(baseProfile) : randomBotProfile(name)
  );
  return {
    name,
    profile,
    memories: buildGenericLensMemories(name, lens, profile),
    lensId: lens.id,
    generationLabel: `Generated through ${lens.displayName}`,
    suggestedColor: lens.lensKind === "roleplay" ? "#b45309" : undefined,
    suggestedGlyph: lens.lensKind === "roleplay" ? "lucideDrama" : undefined,
    temperature: lens.lensKind === "creative_style" || lens.lensKind === "roleplay" ? 0.86 : undefined,
    maxTokens: lens.lensKind === "roleplay" ? 2560 : undefined,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function retargetGeneratedBotMemorySeeds(
  memories: readonly GeneratedBotMemorySeed[],
  fromName: string,
  toName: string
): GeneratedBotMemorySeed[] {
  const trimmedFrom = fromName.trim();
  const trimmedTo = toName.trim();
  if (!trimmedFrom || !trimmedTo || trimmedFrom === trimmedTo) {
    return memories.map((memory) => ({ ...memory }));
  }
  const pattern = new RegExp(`\\b${escapeRegExp(trimmedFrom)}\\b`, "g");
  return memories.map((memory) => ({
    ...memory,
    text: memory.text.replace(pattern, trimmedTo),
  }));
}

export function generatedBotMemorySeedsForCreate(
  seedPlan: GeneratedBotMemorySeedSet | null | undefined,
  activeLensId: string,
  createdBotName: string
): GeneratedBotMemorySeed[] {
  if (!seedPlan || seedPlan.lensId.trim() !== activeLensId.trim()) return [];
  return retargetGeneratedBotMemorySeeds(
    seedPlan.memories,
    seedPlan.botName,
    createdBotName
  ).filter((memory) => memory.text.trim().length > 0);
}

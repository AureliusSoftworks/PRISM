import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  parseStoredBotPrompt,
  stripBotProfileMetaSuffix,
} from "@localai/shared";
import {
  getAuxiliaryProvider,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";
import { runWithUsageSession } from "./usage.ts";

export const BOT_SEMANTIC_FACETS_VERSION = 1;
const BOT_SEMANTIC_FACET_ARRAY_LIMIT = 12;
const BOT_SEMANTIC_FACET_STRING_LIMIT = 80;
const BOT_SEMANTIC_FACET_MAX_TOKENS = 520;

export interface BotSemanticFacets {
  version: 1;
  canonAnchors: string[];
  domains: string[];
  values: string[];
  tensions: string[];
  namingTokens: string[];
  starterSeeds: string[];
}

type BotSemanticFacetKey = Exclude<keyof BotSemanticFacets, "version">;

const FACET_KEYS: BotSemanticFacetKey[] = [
  "canonAnchors",
  "domains",
  "values",
  "tensions",
  "namingTokens",
  "starterSeeds",
];

const FACET_GENERIC_VALUES = new Set([
  "assistant",
  "bot",
  "cafe",
  "chat",
  "coffee",
  "coffee group",
  "coffee table",
  "conversation",
  "group",
  "table",
  "topic",
]);

const FACET_STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "being",
  "from",
  "have",
  "into",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "very",
  "with",
  "would",
  "your",
]);

const queuedFacetRefreshes = new Set<string>();

function emptyBotSemanticFacets(): BotSemanticFacets {
  return {
    version: BOT_SEMANTIC_FACETS_VERSION,
    canonAnchors: [],
    domains: [],
    values: [],
    tensions: [],
    namingTokens: [],
    starterSeeds: [],
  };
}

function normalizeFacetString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
    .trim();
  if (!normalized) return null;
  if (normalized.length < 3) return null;
  const capped =
    normalized.length > BOT_SEMANTIC_FACET_STRING_LIMIT
      ? `${normalized.slice(0, BOT_SEMANTIC_FACET_STRING_LIMIT - 3).trimEnd()}...`
      : normalized;
  const key = capped.toLowerCase();
  if (FACET_GENERIC_VALUES.has(key)) return null;
  return capped;
}

function addFacetValue(
  facets: BotSemanticFacets,
  key: BotSemanticFacetKey,
  value: unknown
): void {
  const normalized = normalizeFacetString(value);
  if (!normalized) return;
  const target = facets[key];
  const dedupeKey = normalized.toLowerCase();
  if (target.some((item) => item.toLowerCase() === dedupeKey)) return;
  if (target.length >= BOT_SEMANTIC_FACET_ARRAY_LIMIT) return;
  target.push(normalized);
}

function addFacetValues(
  facets: BotSemanticFacets,
  key: BotSemanticFacetKey,
  values: readonly unknown[]
): void {
  for (const value of values) {
    addFacetValue(facets, key, value);
  }
}

export function hashBotSemanticFacetSource(options: {
  name: string | null | undefined;
  systemPrompt: string | null | undefined;
}): string {
  const name = typeof options.name === "string" ? options.name.trim() : "";
  const systemPrompt =
    typeof options.systemPrompt === "string" ? options.systemPrompt : "";
  return createHash("sha256")
    .update(`v${BOT_SEMANTIC_FACETS_VERSION}\n${name}\n${systemPrompt}`)
    .digest("hex");
}

export function normalizeBotSemanticFacets(value: unknown): BotSemanticFacets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<Record<keyof BotSemanticFacets, unknown>>;
  if (record.version !== BOT_SEMANTIC_FACETS_VERSION) return null;
  const facets = emptyBotSemanticFacets();
  for (const key of FACET_KEYS) {
    const raw = record[key];
    if (Array.isArray(raw)) addFacetValues(facets, key, raw);
  }
  const total = FACET_KEYS.reduce((sum, key) => sum + facets[key].length, 0);
  return total > 0 ? facets : null;
}

export function parseBotSemanticFacetsJson(raw: string | null | undefined): BotSemanticFacets | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    return normalizeBotSemanticFacets(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseBotSemanticFacetsPayload(raw: string): BotSemanticFacets | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const objectMatch = trimmed.match(/\{[\s\S]*\}/u);
  if (objectMatch && objectMatch[0] !== trimmed) candidates.push(objectMatch[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const normalized = normalizeBotSemanticFacets(parsed);
      if (normalized) return normalized;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function collectProfileTexts(name: string, systemPrompt: string): string[] {
  const { fields } = parseStoredBotPrompt(systemPrompt);
  return [
    name,
    fields.identity.role,
    fields.identity.background,
    fields.identity.species,
    fields.purpose.statement,
    fields.core.interests,
    fields.core.traits,
    fields.core.boundaries,
    fields.worldview.values,
    ...fields.facts.customFacts.map((fact) => `${fact.label}: ${fact.value}`),
    stripBotProfileMetaSuffix(systemPrompt),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function addTokenFacets(facets: BotSemanticFacets, text: string): void {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (FACET_STOPWORDS.has(token)) continue;
    if (FACET_GENERIC_VALUES.has(token)) continue;
    addFacetValue(facets, "namingTokens", token);
  }
}

function hasAny(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function addThemeFacets(facets: BotSemanticFacets, source: string, name: string): void {
  if (
    hasAny(
      source,
      /\b(harry\s+potter|potter|mcgonagall|mcgonnigal|hogwarts|gryffindor|slytherin|ravenclaw|hufflepuff|quidditch|transfiguration|dumbledore|wizard|witch|wand|spell|magic|magical|voldemort)\b/iu
    )
  ) {
    addFacetValues(facets, "canonAnchors", [
      "Harry Potter",
      "Hogwarts",
      "Gryffindor",
      "Transfiguration",
      "Quidditch",
    ]);
    addFacetValues(facets, "domains", [
      "wizarding school",
      "chosen-one mythology",
      "magical education",
    ]);
    addFacetValues(facets, "values", ["courage", "loyalty", "discipline", "sacrifice"]);
    addFacetValues(facets, "tensions", [
      "rules versus courage",
      "authority versus rebellion",
      "destiny versus ordinary school life",
    ]);
    addFacetValues(facets, "namingTokens", [
      "Hogwarts",
      "Gryffindor",
      "wand",
      "spell",
      "house points",
      "Transfiguration",
    ]);
    addFacetValues(facets, "starterSeeds", [
      "When rules protect people",
      "The burden of being chosen",
      "Courage under supervision",
      "Loyalty under pressure",
    ]);
  }

  if (hasAny(name, /\b(spongebob|squarepants)\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["SpongeBob SquarePants", "Krusty Krab", "Bikini Bottom"]);
    addFacetValues(facets, "values", ["optimism", "loyalty", "helpfulness"]);
    addFacetValues(facets, "tensions", ["enthusiasm versus competence", "helpfulness versus chaos"]);
    addFacetValues(facets, "namingTokens", ["SpongeBob", "Pineapple", "Krusty"]);
    addFacetValues(facets, "starterSeeds", ["Relentless optimism on shift", "When helpful gets chaotic"]);
  }

  if (hasAny(name, /\bpatrick(?:\s+star)?\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Patrick Star", "Bikini Bottom"]);
    addFacetValues(facets, "values", ["loyalty", "simplicity", "leisure"]);
    addFacetValues(facets, "tensions", ["simple wisdom versus bad advice"]);
    addFacetValues(facets, "namingTokens", ["Patrick", "starfish", "rock"]);
    addFacetValues(facets, "starterSeeds", ["Simple wisdom under pressure", "Doing nothing as a plan"]);
  }

  if (hasAny(name, /\bsquidward(?:\s+tentacles)?\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Squidward Tentacles", "Krusty Krab", "Bikini Bottom"]);
    addFacetValues(facets, "values", ["privacy", "art", "dignity"]);
    addFacetValues(facets, "tensions", ["art versus customer service", "solitude versus community"]);
    addFacetValues(facets, "namingTokens", ["Squidward", "clarinet", "cashier"]);
    addFacetValues(facets, "starterSeeds", ["Art versus customer service", "The dignity of quiet"]);
  }

  if (hasAny(name, /\b(?:mr\.?\s*)?krabs\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Mr. Krabs", "Krusty Krab", "Krabby Patty formula"]);
    addFacetValues(facets, "values", ["profit", "family", "resourcefulness"]);
    addFacetValues(facets, "tensions", ["profit versus friendship", "secrecy versus trust"]);
    addFacetValues(facets, "namingTokens", ["Krabs", "Krusty", "formula"]);
    addFacetValues(facets, "starterSeeds", ["When profit tests friendship", "The secret formula problem"]);
  }

  if (hasAny(name, /\bplankton\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Plankton", "Chum Bucket", "Krabby Patty formula"]);
    addFacetValues(facets, "values", ["ambition", "invention", "recognition"]);
    addFacetValues(facets, "tensions", ["envy versus ingenuity", "schemes versus belonging"]);
    addFacetValues(facets, "namingTokens", ["Plankton", "Chum Bucket", "formula"]);
    addFacetValues(facets, "starterSeeds", ["Tiny rivals, giant schemes", "Envy in the Chum Bucket"]);
  }

  if (hasAny(name, /\bsandy(?:\s+cheeks)?\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Sandy Cheeks", "Bikini Bottom", "treedome"]);
    addFacetValues(facets, "values", ["science", "competition", "grit"]);
    addFacetValues(facets, "tensions", ["surface logic versus sea life", "competition versus friendship"]);
    addFacetValues(facets, "namingTokens", ["Sandy", "treedome", "karate"]);
    addFacetValues(facets, "starterSeeds", ["Surface science below sea", "Competition among friends"]);
  }

  if (hasAny(name, /\bgary\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Gary the Snail", "Bikini Bottom"]);
    addFacetValues(facets, "values", ["patience", "quiet intelligence", "loyalty"]);
    addFacetValues(facets, "tensions", ["silence versus being understood"]);
    addFacetValues(facets, "namingTokens", ["Gary", "snail", "meow"]);
    addFacetValues(facets, "starterSeeds", ["A meow everyone missed", "Quiet loyalty at home"]);
  }

  if (hasAny(source, /\b(spongebob|patrick|squidward|krabs|plankton|sandy|gary|krabby|patty|jellyfish|pineapple|bikini\s+bottom)\b/iu)) {
    addFacetValues(facets, "canonAnchors", ["Bikini Bottom", "Krusty Krab", "Jellyfish Fields"]);
    addFacetValues(facets, "domains", ["undersea workplace comedy", "small-town absurdity"]);
    addFacetValues(facets, "tensions", ["silliness versus responsibility", "profit versus friendship"]);
    addFacetValues(facets, "namingTokens", ["Bikini", "Krusty", "Jellyfish", "Pineapple"]);
    addFacetValues(facets, "starterSeeds", ["Krusty Krab closing shift", "Jellyfish Fields after work", "Bikini Bottom rumor mill"]);
  }

  if (hasAny(source, /\b(philosoph|socratic|stoic|ethic|wisdom|metaphysic|logic|reason|free\s+will)\b/iu)) {
    addFacetValues(facets, "domains", ["philosophy", "ethics", "reasoning"]);
    addFacetValues(facets, "values", ["wisdom", "truth", "clarity"]);
    addFacetValues(facets, "tensions", ["truth versus comfort", "certainty versus humility"]);
    addFacetValues(facets, "namingTokens", ["Socratic", "logic", "wisdom", "dialectic"]);
    addFacetValues(facets, "starterSeeds", ["Is free will an illusion?", "When certainty becomes arrogance"]);
  }

  if (hasAny(source, /\b(chef|cook|food|kitchen|recipe|restaurant|menu|diner|meal|soup)\b/iu)) {
    addFacetValues(facets, "domains", ["food", "kitchen craft", "hospitality"]);
    addFacetValues(facets, "values", ["care", "taste", "service"]);
    addFacetValues(facets, "tensions", ["taste versus tradition", "care versus control"]);
    addFacetValues(facets, "namingTokens", ["kitchen", "recipe", "diner", "soup"]);
    addFacetValues(facets, "starterSeeds", ["What food remembers", "A ritual worth keeping"]);
  }

  if (hasAny(source, /\b(engineer|debug|code|system|build|architecture|software|incident)\b/iu)) {
    addFacetValues(facets, "domains", ["systems", "software", "engineering"]);
    addFacetValues(facets, "values", ["clarity", "reliability", "precision"]);
    addFacetValues(facets, "tensions", ["clean logic versus messy reality", "speed versus durability"]);
    addFacetValues(facets, "namingTokens", ["debug", "systems", "build", "architecture"]);
    addFacetValues(facets, "starterSeeds", ["When systems fight back", "The cost of clean logic"]);
  }

  if (hasAny(source, /\b(power|empire|command|control|strategy|strength|order|authority)\b/iu)) {
    addFacetValues(facets, "domains", ["power", "strategy", "leadership"]);
    addFacetValues(facets, "values", ["order", "strength", "control"]);
    addFacetValues(facets, "tensions", ["order versus mercy", "authority versus freedom"]);
    addFacetValues(facets, "namingTokens", ["command", "authority", "doctrine", "empire"]);
    addFacetValues(facets, "starterSeeds", ["Power without cruelty", "When order costs too much"]);
  }

  if (hasAny(source, /\b(compassion|forgive|forgiveness|mercy|grace|faith|hope|love|kindness)\b/iu)) {
    addFacetValues(facets, "domains", ["moral care", "forgiveness", "spiritual ethics"]);
    addFacetValues(facets, "values", ["compassion", "mercy", "forgiveness", "love"]);
    addFacetValues(facets, "tensions", ["mercy versus justice", "kindness versus truth"]);
    addFacetValues(facets, "namingTokens", ["mercy", "grace", "kindness", "soul"]);
    addFacetValues(facets, "starterSeeds", ["When mercy has limits", "What forgiveness costs"]);
  }
}

export function deriveDeterministicBotSemanticFacets(options: {
  name: string | null | undefined;
  systemPrompt: string | null | undefined;
}): BotSemanticFacets {
  const name = typeof options.name === "string" ? options.name.trim() : "";
  const systemPrompt = typeof options.systemPrompt === "string" ? options.systemPrompt : "";
  const facets = emptyBotSemanticFacets();
  const profileTexts = collectProfileTexts(name, systemPrompt);
  const source = profileTexts.join(" ");
  addThemeFacets(facets, source, name);
  for (const text of profileTexts) addTokenFacets(facets, text);
  const { fields } = parseStoredBotPrompt(systemPrompt);
  addFacetValue(facets, "domains", fields.identity.role);
  addFacetValue(facets, "domains", fields.core.interests);
  addFacetValue(facets, "values", fields.worldview.values);
  addFacetValue(facets, "values", fields.core.traits);
  if (facets.starterSeeds.length === 0) {
    for (const tension of facets.tensions) addFacetValue(facets, "starterSeeds", tension);
  }
  if (facets.starterSeeds.length === 0 && facets.domains.length > 0) {
    addFacetValue(facets, "starterSeeds", `A harder question about ${facets.domains[0]}`);
  }
  if (facets.namingTokens.length === 0 && name) addFacetValue(facets, "namingTokens", name);
  return facets;
}

export function mergeBotSemanticFacets(
  ...inputs: Array<BotSemanticFacets | null | undefined>
): BotSemanticFacets {
  const merged = emptyBotSemanticFacets();
  for (const input of inputs) {
    if (!input) continue;
    for (const key of FACET_KEYS) addFacetValues(merged, key, input[key]);
  }
  return merged;
}

export async function inferBotSemanticFacets(args: {
  provider: LlmProvider;
  name: string;
  systemPrompt: string;
}): Promise<BotSemanticFacets> {
  const deterministic = deriveDeterministicBotSemanticFacets(args);
  const visiblePrompt = stripBotProfileMetaSuffix(args.systemPrompt).replace(/\s+/g, " ").trim();
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You extract hidden semantic facets for a chatbot. Reply with compact JSON only and no prose.",
    },
    {
      role: "user",
      content: [
        `Bot name: ${args.name}`,
        `Bot prompt/profile: ${visiblePrompt || "(blank)"}`,
        "",
        'Return JSON exactly shaped like {"version":1,"canonAnchors":[],"domains":[],"values":[],"tensions":[],"namingTokens":[],"starterSeeds":[]}.',
        "Each array item must be a short reusable phrase, not a sentence about the user.",
        "Prefer canon-specific anchors and concrete tensions over generic coffee/chat wording.",
        "starterSeeds should be 2-8 word conversation-topic labels.",
      ].join("\n"),
    },
  ];
  const raw = await args.provider.generateResponse(messages, {
    temperature: 0.2,
    maxTokens: BOT_SEMANTIC_FACET_MAX_TOKENS,
    usagePurpose: "memory_inference",
  });
  return mergeBotSemanticFacets(deterministic, parseBotSemanticFacetsPayload(raw));
}

export function resolveStoredBotSemanticFacets(args: {
  name: string;
  systemPrompt: string;
  semanticFacets: string | null | undefined;
  semanticFacetsSourceHash: string | null | undefined;
}): { facets: BotSemanticFacets | null; sourceHash: string; isFresh: boolean } {
  const sourceHash = hashBotSemanticFacetSource({
    name: args.name,
    systemPrompt: args.systemPrompt,
  });
  const facets = parseBotSemanticFacetsJson(args.semanticFacets);
  const isFresh = Boolean(facets && args.semanticFacetsSourceHash === sourceHash);
  return { facets: isFresh ? facets : null, sourceHash, isFresh };
}

export function effectiveBotSemanticFacets(args: {
  name: string;
  systemPrompt: string;
  semanticFacets?: string | null;
  semanticFacetsSourceHash?: string | null;
}): { facets: BotSemanticFacets; sourceHash: string; needsRefresh: boolean } {
  const stored = resolveStoredBotSemanticFacets({
    name: args.name,
    systemPrompt: args.systemPrompt,
    semanticFacets: args.semanticFacets ?? null,
    semanticFacetsSourceHash: args.semanticFacetsSourceHash ?? null,
  });
  if (stored.facets) {
    return { facets: stored.facets, sourceHash: stored.sourceHash, needsRefresh: false };
  }
  return {
    facets: deriveDeterministicBotSemanticFacets(args),
    sourceHash: stored.sourceHash,
    needsRefresh: true,
  };
}

export async function refreshBotSemanticFacets(args: {
  db: DatabaseSync;
  userId: string;
  botId: string;
  provider?: LlmProvider;
  prismDefaultLlmModel?: string | null;
}): Promise<void> {
  const row = args.db
    .prepare("SELECT id, name, system_prompt FROM bots WHERE id = ? AND user_id = ?")
    .get(args.botId, args.userId) as
    | { id: string; name: string | null; system_prompt: string | null }
    | undefined;
  if (!row) return;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const systemPrompt = typeof row.system_prompt === "string" ? row.system_prompt : "";
  const sourceHash = hashBotSemanticFacetSource({ name, systemPrompt });
  const provider = args.provider ?? getAuxiliaryProvider(args.prismDefaultLlmModel ?? undefined);
  const facets = await inferBotSemanticFacets({ provider, name, systemPrompt });
  const now = new Date().toISOString();
  args.db
    .prepare(
      `UPDATE bots
          SET semantic_facets = ?,
              semantic_facets_source_hash = ?,
              semantic_facets_updated_at = ?
        WHERE id = ?
          AND user_id = ?
          AND name = ?
          AND system_prompt = ?`
    )
    .run(JSON.stringify(facets), sourceHash, now, args.botId, args.userId, row.name, row.system_prompt);
}

export function queueBotSemanticFacetsRefresh(args: {
  db: DatabaseSync;
  userId: string;
  botId: string;
  prismDefaultLlmModel?: string | null;
}): void {
  const key = `${args.userId}:${args.botId}`;
  if (queuedFacetRefreshes.has(key)) return;
  queuedFacetRefreshes.add(key);
  queueMicrotask(() => {
    void Promise.resolve(
      runWithUsageSession(
        {
          db: args.db,
          userId: args.userId,
          privacyScope: "normal",
          mode: "system",
          surface: "bots",
          botId: args.botId,
        },
        () => refreshBotSemanticFacets(args)
      )
    )
      .catch((error) => {
        console.error(
          `[bot-facets] refresh failed botId=${args.botId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      })
      .finally(() => {
        queuedFacetRefreshes.delete(key);
      });
  });
}

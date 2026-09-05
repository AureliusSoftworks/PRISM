import { createHash } from "node:crypto";
import {
  parseStoredBotPrompt,
  type BotProfileFields,
} from "@localai/shared";

export const MYSTERY_PERSONA_PAIR_CONTEXT_VERSION_V1 = 1 as const;
export const MYSTERY_PERSONA_PAIR_CONTEXT_MAX_BOTS_V1 = 32;
export const MYSTERY_PERSONA_PAIR_CONTEXT_MAX_PAIRS_V1 = 128;
export const MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SOURCES_PER_PAIR_V1 = 4;
export const MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1 = 240;

const MYSTERY_PERSONA_PAIR_CONTEXT_MAX_ID_CHARS_V1 = 160;
const MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1 = 120;
const MYSTERY_PERSONA_PAIR_CONTEXT_NAME_TITLES_V1 = new Set([
  "capt",
  "captain",
  "doctor",
  "dr",
  "judge",
  "lady",
  "lord",
  "miss",
  "mr",
  "mrs",
  "ms",
  "prof",
  "professor",
  "sir",
]);

export type MysteryPersonaPairContextFieldV1 =
  | "purpose.statement"
  | "purpose.legacyNotes"
  | "identity.role"
  | "identity.background"
  | `facts.customFacts[${number}]`;

export type MysteryPersonaPairContextMatchKindV1 =
  | "full_name"
  | "unique_first_name";

export interface MysteryPersonaPairContextBotV1 {
  botId: string;
  displayName: string;
  systemPrompt: string;
}

export interface MysteryPersonaPairContextSourceV1 {
  sourceOwnerBotId: string;
  sourceOwnerName: string;
  sourceTargetBotId: string;
  sourceTargetName: string;
  sourceProfileHash: string;
  field: MysteryPersonaPairContextFieldV1;
  matchKind: MysteryPersonaPairContextMatchKindV1;
  text: string;
}

export interface MysteryPersonaDirectedPairContextV1 {
  version: 1;
  speakerBotId: string;
  recipientBotId: string;
  familiarity: "explicit_profile_canon";
  sources: MysteryPersonaPairContextSourceV1[];
}

export interface MysteryPersonaPairContextMapV1 {
  version: 1;
  sourceHash: string;
  profileSourceHashesByBotId: Record<string, string>;
  pairsByKey: Record<string, MysteryPersonaDirectedPairContextV1>;
}

interface MysteryPersonaPairContextCorpusEntryV1 {
  field: MysteryPersonaPairContextFieldV1;
  text: string;
}

interface ParsedMysteryPersonaPairContextBotV1 {
  botId: string;
  displayName: string;
  firstName: string | null;
  profileSourceHash: string;
  corpus: MysteryPersonaPairContextCorpusEntryV1[];
}

function mysteryPersonaPairContextSha256V1(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactMysteryPersonaPairContextTextV1(
  value: string,
  maxChars = MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1,
): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

function mysteryPersonaPairContextNameTokensV1(name: string): string[] {
  return compactMysteryPersonaPairContextTextV1(
    name,
    MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1,
  )
    .split(/[^\p{L}\p{N}'’.-]+/u)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

function mysteryPersonaPairContextFirstNameV1(name: string): string | null {
  const tokens = mysteryPersonaPairContextNameTokensV1(name);
  const first = tokens.find((token) =>
    !MYSTERY_PERSONA_PAIR_CONTEXT_NAME_TITLES_V1.has(
      token.replaceAll(".", "").toLocaleLowerCase(),
    ),
  );
  return first && [...first].length >= 2 ? first : null;
}

function escapeMysteryPersonaPairContextPatternV1(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mysteryPersonaPairContextNamePatternV1(name: string): RegExp {
  const escaped = escapeMysteryPersonaPairContextPatternV1(
    compactMysteryPersonaPairContextTextV1(
      name,
      MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1,
    ),
  ).replace(/\s+/gu, "\\s+");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
}

function mysteryPersonaPairContextCorpusV1(
  profile: BotProfileFields,
): MysteryPersonaPairContextCorpusEntryV1[] {
  const entries: MysteryPersonaPairContextCorpusEntryV1[] = [
    { field: "purpose.statement", text: profile.purpose.statement },
    { field: "purpose.legacyNotes", text: profile.purpose.legacyNotes },
    { field: "identity.role", text: profile.identity.role },
    { field: "identity.background", text: profile.identity.background },
    ...profile.facts.customFacts.map((fact, index) => ({
      field: `facts.customFacts[${index}]` as const,
      text: [fact.label, fact.value].filter(Boolean).join(": "),
    })),
  ];
  return entries.flatMap((entry) => {
    const text = entry.text.normalize("NFKC").trim();
    if (!text) return [];
    return text
      .split(/(?<=[.!?])\s+|\n+/u)
      .map((fragment) => ({ field: entry.field, text: fragment.trim() }))
      .filter((fragment) => fragment.text.length > 0);
  });
}

function parsedMysteryPersonaPairContextBotV1(
  bot: MysteryPersonaPairContextBotV1,
): ParsedMysteryPersonaPairContextBotV1 {
  const botId = compactMysteryPersonaPairContextTextV1(
    bot.botId,
    MYSTERY_PERSONA_PAIR_CONTEXT_MAX_ID_CHARS_V1,
  );
  const displayName = compactMysteryPersonaPairContextTextV1(
    bot.displayName,
    MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1,
  );
  if (!botId || !displayName) {
    throw new Error("Persona pair context requires a bot id and display name.");
  }
  const corpus = mysteryPersonaPairContextCorpusV1(
    parseStoredBotPrompt(bot.systemPrompt).fields,
  );
  return {
    botId,
    displayName,
    firstName: mysteryPersonaPairContextFirstNameV1(displayName),
    profileSourceHash: mysteryPersonaPairContextSha256V1({
      botId,
      displayName,
      corpus,
    }),
    corpus,
  };
}

function boundedMysteryPersonaPairContextSnippetV1(
  text: string,
  match: RegExpExecArray,
): string {
  const compact = compactMysteryPersonaPairContextTextV1(text, 10_000);
  if (compact.length <= MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1) {
    return compact;
  }
  const matchedText = match[1] ?? "";
  const matchStart = Math.max(0, match.index + match[0].indexOf(matchedText));
  const truncationPrefix = "...";
  const available = Math.max(
    1,
    MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1 -
      matchedText.length -
      truncationPrefix.length -
      1,
  );
  const before = Math.min(matchStart, Math.floor(available / 2));
  const start = matchStart - before;
  const prefix = start > 0 ? truncationPrefix : "";
  const end = Math.min(
    compact.length,
    start + MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1 - prefix.length,
  );
  return `${prefix}${compact.slice(start, end)}`.slice(
    0,
    MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1,
  );
}

function mysteryPersonaPairContextSourceOrderV1(
  left: MysteryPersonaPairContextSourceV1,
  right: MysteryPersonaPairContextSourceV1,
): number {
  return left.sourceOwnerBotId.localeCompare(right.sourceOwnerBotId) ||
    left.field.localeCompare(right.field) ||
    left.text.localeCompare(right.text) ||
    left.sourceTargetBotId.localeCompare(right.sourceTargetBotId);
}

function mysteryPersonaPairContextHashPayloadV1(
  value: Pick<
    MysteryPersonaPairContextMapV1,
    "profileSourceHashesByBotId" | "pairsByKey"
  >,
): string {
  return mysteryPersonaPairContextSha256V1({
    profileSourceHashesByBotId: Object.fromEntries(
      Object.entries(value.profileSourceHashesByBotId).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    ),
    pairsByKey: Object.fromEntries(
      Object.entries(value.pairsByKey)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, pair]) => [
          key,
          {
            ...pair,
            sources: [...pair.sources].sort(mysteryPersonaPairContextSourceOrderV1),
          },
        ]),
    ),
  });
}

/** Builds a collision-safe stable key for one directed conversational pair. */
export function mysteryPersonaPairContextKeyV1(
  speakerBotId: string,
  recipientBotId: string,
): string {
  return `${encodeURIComponent(speakerBotId)}::${encodeURIComponent(recipientBotId)}`;
}

/** Detects an explicit spoken self-introduction by full or first name. */
export function mysteryPersonaLineSelfIntroducesV1(
  text: string,
  speakerName: string,
): boolean {
  const names = [
    compactMysteryPersonaPairContextTextV1(
      speakerName,
      MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1,
    ),
    mysteryPersonaPairContextFirstNameV1(speakerName),
  ].filter((name): name is string => Boolean(name));
  return names.some((name) => {
    const escapedName = escapeMysteryPersonaPairContextPatternV1(name)
      .replace(/\s+/gu, "\\s+");
    return new RegExp(
      `(?:^|[.!?]\\s+)(?:i\\s+am|i['’]m|my\\s+name\\s+is)\\s+${escapedName}(?=$|[\\s,.!?;:—-])`,
      "iu",
    ).test(text.normalize("NFKC").trim());
  });
}

/**
 * Extracts only explicit, profile-authored references between eligible bots.
 * A single explicit source is made available in both conversational directions
 * while retaining the bot that actually authored the canon.
 */
export function buildMysteryPersonaPairContextMapV1(args: {
  bots: readonly MysteryPersonaPairContextBotV1[];
  eligiblePairs: readonly (readonly [string, string])[];
}): MysteryPersonaPairContextMapV1 {
  if (args.bots.length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_BOTS_V1) {
    throw new Error("Persona pair context exceeded the frozen cast limit.");
  }
  const parsedBots = args.bots
    .map(parsedMysteryPersonaPairContextBotV1)
    .sort((left, right) => left.botId.localeCompare(right.botId));
  if (new Set(parsedBots.map((bot) => bot.botId)).size !== parsedBots.length) {
    throw new Error("Persona pair context received duplicate bot ids.");
  }
  const botById = new Map(parsedBots.map((bot) => [bot.botId, bot]));
  const firstNameCounts = new Map<string, number>();
  for (const bot of parsedBots) {
    if (!bot.firstName) continue;
    const normalized = bot.firstName.toLocaleLowerCase();
    firstNameCounts.set(normalized, (firstNameCounts.get(normalized) ?? 0) + 1);
  }
  const eligiblePairKeys = new Set<string>();
  for (const [leftBotId, rightBotId] of args.eligiblePairs) {
    if (leftBotId === rightBotId || !botById.has(leftBotId) || !botById.has(rightBotId)) {
      continue;
    }
    eligiblePairKeys.add(
      [leftBotId, rightBotId].sort((left, right) => left.localeCompare(right)).join("\u0000"),
    );
  }
  const sourcesByUndirectedPair = new Map<
    string,
    MysteryPersonaPairContextSourceV1[]
  >();
  for (const source of parsedBots) {
    for (const target of parsedBots) {
      if (source.botId === target.botId) continue;
      const undirectedKey = [source.botId, target.botId]
        .sort((left, right) => left.localeCompare(right))
        .join("\u0000");
      if (!eligiblePairKeys.has(undirectedKey)) continue;
      const fullNamePattern = mysteryPersonaPairContextNamePatternV1(
        target.displayName,
      );
      const uniqueFirstNamePattern = target.firstName &&
          firstNameCounts.get(target.firstName.toLocaleLowerCase()) === 1
        ? mysteryPersonaPairContextNamePatternV1(target.firstName)
        : null;
      for (const entry of source.corpus) {
        const fullNameMatch = fullNamePattern.exec(entry.text);
        const firstNameMatch = fullNameMatch
          ? null
          : uniqueFirstNamePattern?.exec(entry.text) ?? null;
        const match = fullNameMatch ?? firstNameMatch;
        if (!match) continue;
        const pairSources = sourcesByUndirectedPair.get(undirectedKey) ?? [];
        pairSources.push({
          sourceOwnerBotId: source.botId,
          sourceOwnerName: source.displayName,
          sourceTargetBotId: target.botId,
          sourceTargetName: target.displayName,
          sourceProfileHash: source.profileSourceHash,
          field: entry.field,
          matchKind: fullNameMatch ? "full_name" : "unique_first_name",
          text: boundedMysteryPersonaPairContextSnippetV1(entry.text, match),
        });
        sourcesByUndirectedPair.set(undirectedKey, pairSources);
      }
    }
  }
  const pairsByKey: Record<string, MysteryPersonaDirectedPairContextV1> = {};
  for (const undirectedKey of [...sourcesByUndirectedPair.keys()].sort()) {
    const botIds = undirectedKey.split("\u0000");
    const leftBotId = botIds[0];
    const rightBotId = botIds[1];
    if (!leftBotId || !rightBotId) continue;
    const sources = [...(sourcesByUndirectedPair.get(undirectedKey) ?? [])]
      .sort(mysteryPersonaPairContextSourceOrderV1)
      .filter((source, index, allSources) =>
        index === 0 ||
        mysteryPersonaPairContextSourceOrderV1(source, allSources[index - 1]!) !== 0
      )
      .slice(0, MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SOURCES_PER_PAIR_V1);
    if (!sources.length) continue;
    for (const [speakerBotId, recipientBotId] of [
      [leftBotId, rightBotId],
      [rightBotId, leftBotId],
    ] as const) {
      pairsByKey[mysteryPersonaPairContextKeyV1(speakerBotId, recipientBotId)] = {
        version: MYSTERY_PERSONA_PAIR_CONTEXT_VERSION_V1,
        speakerBotId,
        recipientBotId,
        familiarity: "explicit_profile_canon",
        sources,
      };
    }
  }
  if (Object.keys(pairsByKey).length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_PAIRS_V1) {
    throw new Error("Persona pair context exceeded the directed pair limit.");
  }
  const profileSourceHashesByBotId = Object.fromEntries(
    parsedBots.map((bot) => [bot.botId, bot.profileSourceHash]),
  );
  return {
    version: MYSTERY_PERSONA_PAIR_CONTEXT_VERSION_V1,
    sourceHash: mysteryPersonaPairContextHashPayloadV1({
      profileSourceHashesByBotId,
      pairsByKey,
    }),
    profileSourceHashesByBotId,
    pairsByKey,
  };
}

/** Returns explicit context for one speaker and recipient, or null for neutrality. */
export function mysteryPersonaDirectedPairContextV1(
  map: MysteryPersonaPairContextMapV1 | null | undefined,
  speakerBotId: string,
  recipientBotId: string,
): MysteryPersonaDirectedPairContextV1 | null {
  return map?.pairsByKey[
    mysteryPersonaPairContextKeyV1(speakerBotId, recipientBotId)
  ] ?? null;
}

/**
 * Validates the bounded private map accepted from checkpoints and packages.
 * The function deliberately rejects malformed data instead of repairing canon.
 */
export function validateMysteryPersonaPairContextMapV1(
  value: unknown,
  allowedBotIds?: ReadonlySet<string>,
): MysteryPersonaPairContextMapV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Persona pair context must be an object.");
  }
  const map = value as Partial<MysteryPersonaPairContextMapV1>;
  if (
    map.version !== MYSTERY_PERSONA_PAIR_CONTEXT_VERSION_V1 ||
    typeof map.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(map.sourceHash) ||
    !map.profileSourceHashesByBotId ||
    typeof map.profileSourceHashesByBotId !== "object" ||
    Array.isArray(map.profileSourceHashesByBotId) ||
    !map.pairsByKey ||
    typeof map.pairsByKey !== "object" ||
    Array.isArray(map.pairsByKey)
  ) {
    throw new Error("Persona pair context has an invalid version or shape.");
  }
  const profileEntries = Object.entries(map.profileSourceHashesByBotId);
  const pairEntries = Object.entries(map.pairsByKey);
  if (
    profileEntries.length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_BOTS_V1 ||
    pairEntries.length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_PAIRS_V1
  ) {
    throw new Error("Persona pair context exceeded its bounded size.");
  }
  for (const [botId, hash] of profileEntries) {
    if (
      !botId ||
      botId !==
        compactMysteryPersonaPairContextTextV1(
          botId,
          MYSTERY_PERSONA_PAIR_CONTEXT_MAX_ID_CHARS_V1,
        ) ||
      botId.length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_ID_CHARS_V1 ||
      typeof hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(hash) ||
      (allowedBotIds && !allowedBotIds.has(botId))
    ) {
      throw new Error("Persona pair context contains an invalid profile source.");
    }
  }
  for (const [key, pairValue] of pairEntries) {
    if (!pairValue || typeof pairValue !== "object" || Array.isArray(pairValue)) {
      throw new Error("Persona pair context contains an invalid pair.");
    }
    const pair = pairValue as MysteryPersonaDirectedPairContextV1;
    const pairBotIds = new Set([pair.speakerBotId, pair.recipientBotId]);
    if (
      pair.version !== MYSTERY_PERSONA_PAIR_CONTEXT_VERSION_V1 ||
      pair.familiarity !== "explicit_profile_canon" ||
      !pair.speakerBotId ||
      !pair.recipientBotId ||
      pair.speakerBotId === pair.recipientBotId ||
      key !== mysteryPersonaPairContextKeyV1(pair.speakerBotId, pair.recipientBotId) ||
      !map.profileSourceHashesByBotId[pair.speakerBotId] ||
      !map.profileSourceHashesByBotId[pair.recipientBotId] ||
      (allowedBotIds &&
        (!allowedBotIds.has(pair.speakerBotId) ||
          !allowedBotIds.has(pair.recipientBotId))) ||
      !Array.isArray(pair.sources) ||
      pair.sources.length < 1 ||
      pair.sources.length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SOURCES_PER_PAIR_V1
    ) {
      throw new Error("Persona pair context contains an invalid directed pair.");
    }
    for (const [sourceIndex, source] of pair.sources.entries()) {
      if (
        !source ||
        typeof source !== "object" ||
        !pairBotIds.has(source.sourceOwnerBotId) ||
        !pairBotIds.has(source.sourceTargetBotId) ||
        !map.profileSourceHashesByBotId[source.sourceOwnerBotId] ||
        !map.profileSourceHashesByBotId[source.sourceTargetBotId] ||
        source.sourceOwnerBotId === source.sourceTargetBotId ||
        source.sourceProfileHash !==
          map.profileSourceHashesByBotId[source.sourceOwnerBotId] ||
        !source.sourceOwnerName ||
        source.sourceOwnerName !==
          compactMysteryPersonaPairContextTextV1(
            source.sourceOwnerName,
            MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1,
          ) ||
        source.sourceOwnerName.length >
          MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1 ||
        !source.sourceTargetName ||
        source.sourceTargetName !==
          compactMysteryPersonaPairContextTextV1(
            source.sourceTargetName,
            MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1,
          ) ||
        source.sourceTargetName.length >
          MYSTERY_PERSONA_PAIR_CONTEXT_MAX_NAME_CHARS_V1 ||
        ![
          "purpose.statement",
          "purpose.legacyNotes",
          "identity.role",
          "identity.background",
        ].includes(source.field) &&
          !/^facts\.customFacts\[\d+\]$/u.test(source.field) ||
        !["full_name", "unique_first_name"].includes(source.matchKind) ||
        !source.text ||
        source.text !== compactMysteryPersonaPairContextTextV1(source.text) ||
        source.text.length > MYSTERY_PERSONA_PAIR_CONTEXT_MAX_SNIPPET_CHARS_V1 ||
        (sourceIndex > 0 &&
          mysteryPersonaPairContextSourceOrderV1(
            pair.sources[sourceIndex - 1]!,
            source,
          ) >= 0)
      ) {
        throw new Error("Persona pair context contains an invalid source.");
      }
    }
  }
  const normalized = map as MysteryPersonaPairContextMapV1;
  if (
    normalized.sourceHash !== mysteryPersonaPairContextHashPayloadV1(normalized)
  ) {
    throw new Error("Persona pair context source hash does not match its content.");
  }
  return normalized;
}

/**
 * Rewrites private bot ownership for portable packages and recalculates the
 * map hash. The profile-derived source hashes remain unchanged.
 */
export function remapMysteryPersonaPairContextBotIdsV1(
  map: MysteryPersonaPairContextMapV1,
  botIdMap: ReadonlyMap<string, string>,
): MysteryPersonaPairContextMapV1 {
  const remap = (botId: string): string => botIdMap.get(botId) ?? botId;
  const profileSourceHashesByBotId: Record<string, string> = {};
  for (const [botId, hash] of Object.entries(map.profileSourceHashesByBotId)) {
    const nextBotId = remap(botId);
    if (profileSourceHashesByBotId[nextBotId]) {
      throw new Error("Persona pair context bot remap was not one-to-one.");
    }
    profileSourceHashesByBotId[nextBotId] = hash;
  }
  const pairsByKey: Record<string, MysteryPersonaDirectedPairContextV1> = {};
  for (const pair of Object.values(map.pairsByKey)) {
    const speakerBotId = remap(pair.speakerBotId);
    const recipientBotId = remap(pair.recipientBotId);
    const key = mysteryPersonaPairContextKeyV1(speakerBotId, recipientBotId);
    if (pairsByKey[key]) {
      throw new Error("Persona pair context pair remap was not one-to-one.");
    }
    pairsByKey[key] = {
      ...pair,
      speakerBotId,
      recipientBotId,
        sources: pair.sources
          .map((source) => ({
            ...source,
            sourceOwnerBotId: remap(source.sourceOwnerBotId),
            sourceTargetBotId: remap(source.sourceTargetBotId),
          }))
          .sort(mysteryPersonaPairContextSourceOrderV1),
    };
  }
  const remapped: MysteryPersonaPairContextMapV1 = {
    version: MYSTERY_PERSONA_PAIR_CONTEXT_VERSION_V1,
    sourceHash: "",
    profileSourceHashesByBotId,
    pairsByKey,
  };
  remapped.sourceHash = mysteryPersonaPairContextHashPayloadV1(remapped);
  return validateMysteryPersonaPairContextMapV1(remapped);
}

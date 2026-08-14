export const BOT_FOUNDRY_INSPIRATION_MIN_SOURCES = 1;
export const BOT_FOUNDRY_INSPIRATION_MAX_SOURCES = 5;
export const BOT_FOUNDRY_BATCH_MIN_COUNT = 2;
export const BOT_FOUNDRY_BATCH_MAX_COUNT = 100;
export const BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT = 11;

export type BotFoundryCreationMode = "standard" | "inspire" | "batch";
export type BotFoundryPowerCount = 1 | 2 | 3;

export interface BotFoundryPowerOptionsV1 {
  enabled: boolean;
  count: BotFoundryPowerCount;
  craziness: number;
}

export interface BotFoundryInspirationSourceV1 {
  id: string;
  name: string;
  influence: number;
  essence: string;
}

export interface BotFoundryGenerationContextV1 {
  mode: BotFoundryCreationMode;
  powers: BotFoundryPowerOptionsV1;
  resemblance: number;
  inspirationSources: BotFoundryInspirationSourceV1[];
  batchIndex: number;
  batchCount: number;
}

export interface BotFoundryBatchGroupIdentityV1 {
  name: string;
  description: string;
}

export const DEFAULT_BOT_FOUNDRY_POWER_OPTIONS: BotFoundryPowerOptionsV1 = {
  enabled: false,
  count: 1,
  craziness: 50,
};

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function compactText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

export function normalizeBotFoundryPowerOptionsV1(value: unknown): BotFoundryPowerOptionsV1 {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawCount = boundedInteger(record.count, 1, 3, 1);
  return {
    enabled: record.enabled === true,
    count: (rawCount === 2 || rawCount === 3 ? rawCount : 1),
    craziness: boundedInteger(record.craziness, 0, 100, 50),
  };
}

/**
 * Finds an intentional, bounded Foundry Power request in a character brief.
 *
 * This deliberately requires a creation/grant verb plus a count, or a named
 * Power plus a count. That keeps ordinary uses of "power" (electricity,
 * talent, authority, etc.) out of the structured Power path.
 */
export function explicitBotFoundryPowerCountFromBrief(
  brief: unknown,
): BotFoundryPowerCount | null {
  const text = compactText(brief, 8_000);
  if (!text) return null;

  const countFor = (value: string): BotFoundryPowerCount => {
    switch (value.toLowerCase()) {
      case "two":
      case "2":
        return 2;
      case "three":
      case "3":
        return 3;
      default:
        return 1;
    }
  };
  const grantVerb = "(?:give|grant|bestow|endow|assign|equip|create|include)";
  const count = "(?:exactly\\s+)?(one|two|three|1|2|3)";
  const namedCountedPower = new RegExp(
    `\\b(?:exactly\\s+)?(a|one|two|three|1|2|3)\\s+Powers?\\s+(?:named|called)\\b`,
    "giu",
  );
  const namedSingular = new RegExp(
    `\\b${grantVerb}\\b[^.!?]{0,80}?\\b(?:a|one|1)\\s+Power\\s+(?:named|called)\\b`,
    "giu",
  );
  const countedGrant = new RegExp(
    `\\b${grantVerb}\\b[^.!?]{0,80}?\\b${count}\\s+Powers?\\b`,
    "giu",
  );
  const passiveCountedGrant = new RegExp(
    `\\b(?:is|be|should be|will be)\\s+(?:given|granted|bestowed|endowed|assigned|equipped)\\s+${count}\\s+Powers?\\b`,
    "giu",
  );

  const firstAffirmativeMatch = (pattern: RegExp): RegExpMatchArray | null => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const clausePrefix = text.slice(Math.max(0, start - 100), start);
      if (!/\b(?:not|never|without)\b[^.!?]{0,100}$/iu.test(clausePrefix)) {
        return match;
      }
    }
    return null;
  };

  const namedMatch = firstAffirmativeMatch(namedCountedPower);
  if (namedMatch?.[1]) return countFor(namedMatch[1]);
  if (firstAffirmativeMatch(namedSingular)) return 1;
  const countedMatch = firstAffirmativeMatch(countedGrant) ?? firstAffirmativeMatch(passiveCountedGrant);
  return countedMatch?.[1] ? countFor(countedMatch[1]) : null;
}

export function resolveBotFoundryPowerOptionsForBriefV1(
  value: unknown,
  brief: unknown,
): BotFoundryPowerOptionsV1 {
  const options = normalizeBotFoundryPowerOptionsV1(value);
  // A deliberate control selection is always authoritative over prose.
  if (options.enabled) return options;

  const explicitCount = explicitBotFoundryPowerCountFromBrief(brief);
  if (explicitCount !== null) {
    // An "additional Powers" boundary limits expansion; it does not revoke a
    // preceding explicit request (for example, "exactly one ... no additional").
    return { ...options, enabled: true, count: explicitCount };
  }
  return options;
}

export function botFoundryPowerStrengthLabel(count: BotFoundryPowerCount): "strong" | "moderate" | "weak compound" {
  return count === 1 ? "strong" : count === 2 ? "moderate" : "weak compound";
}

export function botFoundryPowerBudgetInstruction(options: BotFoundryPowerOptionsV1): string {
  if (!options.enabled) {
    return "Return no Powers. Set powerPrompts to an empty array.";
  }
  const strength = botFoundryPowerStrengthLabel(options.count);
  return [
    `Return exactly ${options.count} distinct ${strength} Power${options.count === 1 ? "" : "s"}.`,
    "The total strength budget is fixed: one Power may be strong; two must each be moderate; three must each be weak alone but explicitly interlock into one powerful compound kit.",
    `Social influence / craziness is ${options.craziness}/100. At 0, keep consequences personal and socially subtle. At 100, the Powers may frequently and dramatically reshape the room's social situation through surreal observable consequences. This control tunes frequency, reach, and disruption, never privacy, safety, player agency, or deterministic authority.`,
  ].join(" ");
}

export function normalizeBotFoundryGenerationContextV1(value: unknown): BotFoundryGenerationContextV1 {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const mode: BotFoundryCreationMode = record.mode === "inspire" || record.mode === "batch"
    ? record.mode
    : "standard";
  const sources = Array.isArray(record.inspirationSources)
    ? record.inspirationSources.flatMap((source) => {
        if (!source || typeof source !== "object" || Array.isArray(source)) return [];
        const item = source as Record<string, unknown>;
        const id = compactText(item.id, 120);
        const name = compactText(item.name, 80);
        if (!id || !name) return [];
        return [{
          id,
          name,
          influence: boundedInteger(item.influence, 0, 100, 50),
          essence: compactText(item.essence, 1_200),
        }];
      })
      .filter(
        (source, index, allSources) =>
          allSources.findIndex((candidate) => candidate.id === source.id) === index,
      )
      .slice(0, BOT_FOUNDRY_INSPIRATION_MAX_SOURCES)
    : [];
  const batchCount = mode === "batch"
    ? boundedInteger(
        record.batchCount,
        BOT_FOUNDRY_BATCH_MIN_COUNT,
        BOT_FOUNDRY_BATCH_MAX_COUNT,
        BOT_FOUNDRY_BATCH_MIN_COUNT,
      )
    : 1;
  const leanBatch =
    mode === "batch" && batchCount >= BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT;
  return {
    mode,
    powers: leanBatch
      ? { ...normalizeBotFoundryPowerOptionsV1(record.powers), enabled: false }
      : normalizeBotFoundryPowerOptionsV1(record.powers),
    resemblance: boundedInteger(record.resemblance, 0, 100, 50),
    inspirationSources: mode === "inspire" ? sources : [],
    batchIndex: mode === "batch"
      ? boundedInteger(record.batchIndex, 1, batchCount, 1)
      : 1,
    batchCount,
  };
}

/** Resolves brief-driven Power intent after normalizing a Foundry request. */
export function resolveBotFoundryGenerationContextForBriefV1(
  value: unknown,
  brief: unknown,
): BotFoundryGenerationContextV1 {
  const context = normalizeBotFoundryGenerationContextV1(value);
  return {
    ...context,
    powers:
      context.mode === "batch" &&
      context.batchCount >= BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT
        ? { ...context.powers, enabled: false }
        : resolveBotFoundryPowerOptionsForBriefV1(context.powers, brief),
  };
}

export function botFoundryBatchIsLean(
  context: Pick<BotFoundryGenerationContextV1, "mode" | "batchCount">,
): boolean {
  return (
    context.mode === "batch" &&
    context.batchCount >= BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT
  );
}

export function normalizeBotFoundryBatchGroupIdentityV1(
  value: unknown,
): BotFoundryBatchGroupIdentityV1 | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const name = compactText(record.name, 120);
  const description = compactText(record.description, 1_000);
  return name && description ? { name, description } : null;
}

export function uniqueBotFoundryBatchGroupName(
  requestedName: unknown,
  existingNames: readonly string[],
): string {
  const base = compactText(requestedName, 120);
  if (!base) return "";
  const used = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const marker = ` (${suffix})`;
    const candidate = `${base.slice(0, 120 - marker.length).trim()}${marker}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return "";
}

export function botFoundryGenerationContextInstruction(context: BotFoundryGenerationContextV1): string {
  const parts = [botFoundryPowerBudgetInstruction(context.powers)];
  if (context.mode === "inspire") {
    const sourceLines = context.inspirationSources.map((source) =>
      `${source.name} (${source.influence}/100 influence): ${source.essence || "Use only the named persona as a loose creative signal."}`,
    );
    parts.push(
      `Create a new identity with ${context.resemblance}/100 overall resemblance to these selected sources. Reflect weighted themes, tensions, or presentation instincts without cloning names, exact identities, biography, signature phrasing, or unique Powers.`,
      `Sources:\n${sourceLines.join("\n")}`,
    );
  } else if (context.mode === "batch") {
    parts.push(botFoundryBatchIsLean(context)
      ? `This is lean automatic bot ${context.batchIndex} of ${context.batchCount} from one shared brief. Put the differentiation into a coherent, specific personality and profile. Keep it clearly distinct from plausible siblings while honoring the shared direction. Do not refer to the batch in the bot's identity or prose. Return no Powers even if the brief requests them.`
      : `This is rich automatic bot ${context.batchIndex} of ${context.batchCount} from one shared brief. Make it clearly distinct from plausible siblings while honoring the shared direction. Do not refer to the batch in the bot's identity or prose.`);
  }
  return parts.join("\n");
}

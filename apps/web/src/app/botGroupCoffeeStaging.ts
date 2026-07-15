export const BOT_GROUP_COFFEE_STAGING_MIN_SELECTED = 2;
export const BOT_GROUP_COFFEE_STAGING_MAX_SELECTED = 5;
export const BOT_GROUP_COFFEE_STAGING_RANKING_STRATEGY =
  "local-token-overlap" as const;

export type BotGroupCoffeeStagingReactionBand =
  | "strong"
  | "related"
  | "available";

export interface BotGroupCoffeeStagingReactionCopy {
  readonly cue: "leans-in" | "takes-notice" | "at-ease";
  readonly label: string;
  readonly accessibleLabel: string;
  readonly intensity: 0 | 1 | 2;
}

/** Static presentation metadata only. These cues are not bot dialogue. */
export const BOT_GROUP_COFFEE_STAGING_REACTION_COPY: Readonly<
  Record<BotGroupCoffeeStagingReactionBand, BotGroupCoffeeStagingReactionCopy>
> = {
  strong: {
    cue: "leans-in",
    label: "Leans in",
    accessibleLabel: "Strong topic fit",
    intensity: 2,
  },
  related: {
    cue: "takes-notice",
    label: "Takes notice",
    accessibleLabel: "Some topic overlap",
    intensity: 1,
  },
  available: {
    cue: "at-ease",
    label: "At ease",
    accessibleLabel: "Available for Coffee",
    intensity: 0,
  },
};

export type BotGroupCoffeeStagingBotInput =
  | {
      id?: unknown;
      name?: unknown;
      system_prompt?: unknown;
      systemPrompt?: unknown;
    }
  | null
  | undefined;

export interface BotGroupCoffeeStagingBot {
  id: string;
  name: string;
  systemPrompt: string;
  /** Index of the first valid occurrence in the supplied roster. */
  rosterIndex: number;
}

export interface BotGroupCoffeeStagingMatch {
  score: number;
  coverage: number;
  matchedTokens: string[];
  nameMatchedTokens: string[];
  systemPromptMatchedTokens: string[];
}

export interface BotGroupCoffeeStagingRankedBot
  extends BotGroupCoffeeStagingBot {
  rank: number;
  match: BotGroupCoffeeStagingMatch;
  reactionBand: BotGroupCoffeeStagingReactionBand;
  reaction: BotGroupCoffeeStagingReactionCopy;
}

export interface BotGroupCoffeeStagingReplacementBot
  extends BotGroupCoffeeStagingBot {
  selected: boolean;
  match: BotGroupCoffeeStagingMatch;
  reactionBand: BotGroupCoffeeStagingReactionBand;
  reaction: BotGroupCoffeeStagingReactionCopy;
}

export interface BotGroupCoffeeStagingSelectionSummary {
  count: number;
  minimum: typeof BOT_GROUP_COFFEE_STAGING_MIN_SELECTED;
  maximum: typeof BOT_GROUP_COFFEE_STAGING_MAX_SELECTED;
  canStart: boolean;
  status: "ready" | "too-few" | "too-many";
}

export interface BotGroupCoffeeStagingModel {
  rankingStrategy: typeof BOT_GROUP_COFFEE_STAGING_RANKING_STRATEGY;
  /** The untouched string supplied when the player submitted the room draft. */
  submittedPrompt: string;
  /** Whitespace-normalized copy for validation and display fallbacks. */
  normalizedPrompt: string;
  rankedVisibleBots: BotGroupCoffeeStagingRankedBot[];
  fullRosterBots: BotGroupCoffeeStagingBot[];
  selectedBotIds: string[];
  selection: BotGroupCoffeeStagingSelectionSummary;
}

export interface BotGroupCoffeeStagingSelectionChange {
  selectedBotIds: string[];
  selection: BotGroupCoffeeStagingSelectionSummary;
  changed: boolean;
  reason:
    | "selected"
    | "deselected"
    | "replaced"
    | "minimum-reached"
    | "maximum-reached"
    | "unavailable"
    | "outgoing-not-selected"
    | "already-selected"
    | "unchanged";
}

const MATCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

function normalizedString(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/gu, " ").trim()
    : "";
}

export function normalizeBotGroupCoffeeStagingPrompt(prompt: unknown): string {
  return normalizedString(prompt);
}

function normalizedMatchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

function uniqueMatchTokens(value: string): string[] {
  const matches = normalizedMatchText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of matches) {
    if (MATCH_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function normalizedBotId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBotGroupCoffeeStagingRoster(
  roster: readonly BotGroupCoffeeStagingBotInput[] | null | undefined,
): BotGroupCoffeeStagingBot[] {
  if (!Array.isArray(roster)) return [];
  const seen = new Set<string>();
  const bots: BotGroupCoffeeStagingBot[] = [];
  roster.forEach((candidate, rosterIndex) => {
    if (!candidate || typeof candidate !== "object") return;
    const id = normalizedBotId(candidate.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const name = normalizedString(candidate.name) || id;
    const systemPrompt =
      normalizedString(candidate.system_prompt) ||
      normalizedString(candidate.systemPrompt);
    bots.push({ id, name, systemPrompt, rosterIndex });
  });
  return bots;
}

function matchForBot(
  promptTokens: readonly string[],
  bot: BotGroupCoffeeStagingBot,
): BotGroupCoffeeStagingMatch {
  const nameTokens = new Set(uniqueMatchTokens(bot.name));
  const systemPromptTokens = new Set(uniqueMatchTokens(bot.systemPrompt));
  const nameMatchedTokens = promptTokens.filter((token) => nameTokens.has(token));
  const systemPromptMatchedTokens = promptTokens.filter((token) =>
    systemPromptTokens.has(token),
  );
  const matchedTokens = promptTokens.filter(
    (token) => nameTokens.has(token) || systemPromptTokens.has(token),
  );
  const coverage =
    promptTokens.length > 0 ? matchedTokens.length / promptTokens.length : 0;
  // Distinct prompt coverage wins first. A name match is the smaller tie-break,
  // followed by system-prompt overlap; input order settles exact ties.
  const score =
    matchedTokens.length * 1_000 +
    nameMatchedTokens.length * 100 +
    systemPromptMatchedTokens.length;
  return {
    score,
    coverage,
    matchedTokens,
    nameMatchedTokens,
    systemPromptMatchedTokens,
  };
}

function reactionBandForMatch(
  match: BotGroupCoffeeStagingMatch,
): BotGroupCoffeeStagingReactionBand {
  if (
    match.nameMatchedTokens.length > 0 ||
    (match.matchedTokens.length >= 2 && match.coverage >= 0.5)
  ) {
    return "strong";
  }
  return match.matchedTokens.length > 0 ? "related" : "available";
}

export function rankBotGroupCoffeeStagingVisibleBots({
  prompt,
  visibleBots,
}: {
  prompt: unknown;
  visibleBots: readonly BotGroupCoffeeStagingBotInput[] | null | undefined;
}): BotGroupCoffeeStagingRankedBot[] {
  const promptTokens = uniqueMatchTokens(
    normalizeBotGroupCoffeeStagingPrompt(prompt),
  );
  return normalizeBotGroupCoffeeStagingRoster(visibleBots)
    .map((bot) => {
      const match = matchForBot(promptTokens, bot);
      const reactionBand = reactionBandForMatch(match);
      return {
        ...bot,
        match,
        reactionBand,
        reaction: BOT_GROUP_COFFEE_STAGING_REACTION_COPY[reactionBand],
      };
    })
    .sort(
      (left, right) =>
        right.match.score - left.match.score ||
        left.rosterIndex - right.rosterIndex ||
        left.id.localeCompare(right.id),
    )
    .map((bot, index) => ({ ...bot, rank: index + 1 }));
}

function uniqueAvailableBotIds(
  botIds: readonly unknown[] | null | undefined,
): string[] {
  if (!Array.isArray(botIds)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of botIds) {
    const botId = normalizedBotId(value);
    if (!botId || seen.has(botId)) continue;
    seen.add(botId);
    result.push(botId);
  }
  return result;
}

export function reconcileBotGroupCoffeeStagingSelection({
  selectedBotIds,
  rosterBotIds,
  preferredBotIds = [],
}: {
  selectedBotIds: readonly unknown[] | null | undefined;
  rosterBotIds: readonly unknown[] | null | undefined;
  preferredBotIds?: readonly unknown[] | null | undefined;
}): string[] {
  const roster = uniqueAvailableBotIds(rosterBotIds);
  const available = new Set(roster);
  const selected = uniqueAvailableBotIds(selectedBotIds)
    .filter((botId) => available.has(botId))
    .slice(0, BOT_GROUP_COFFEE_STAGING_MAX_SELECTED);
  const selectedSet = new Set(selected);
  const fillOrder = [...uniqueAvailableBotIds(preferredBotIds), ...roster];
  for (const botId of fillOrder) {
    if (
      selected.length >= BOT_GROUP_COFFEE_STAGING_MIN_SELECTED ||
      !available.has(botId) ||
      selectedSet.has(botId)
    ) {
      continue;
    }
    selectedSet.add(botId);
    selected.push(botId);
  }
  return selected;
}

export function summarizeBotGroupCoffeeStagingSelection(
  selectedBotIds: readonly unknown[] | null | undefined,
): BotGroupCoffeeStagingSelectionSummary {
  const count = uniqueAvailableBotIds(selectedBotIds).length;
  const canStart =
    count >= BOT_GROUP_COFFEE_STAGING_MIN_SELECTED &&
    count <= BOT_GROUP_COFFEE_STAGING_MAX_SELECTED;
  return {
    count,
    minimum: BOT_GROUP_COFFEE_STAGING_MIN_SELECTED,
    maximum: BOT_GROUP_COFFEE_STAGING_MAX_SELECTED,
    canStart,
    status: canStart
      ? "ready"
      : count < BOT_GROUP_COFFEE_STAGING_MIN_SELECTED
        ? "too-few"
        : "too-many",
  };
}

export function createBotGroupCoffeeStagingModel({
  prompt,
  visibleBots,
  fullRosterBots,
}: {
  prompt: unknown;
  visibleBots: readonly BotGroupCoffeeStagingBotInput[] | null | undefined;
  fullRosterBots?:
    | readonly BotGroupCoffeeStagingBotInput[]
    | null
    | undefined;
}): BotGroupCoffeeStagingModel {
  const submittedPrompt = typeof prompt === "string" ? prompt : "";
  const fullRoster = normalizeBotGroupCoffeeStagingRoster(
    fullRosterBots === undefined ? visibleBots : fullRosterBots,
  );
  const fullRosterIds = new Set(fullRoster.map(({ id }) => id));
  const rankedVisibleBots = rankBotGroupCoffeeStagingVisibleBots({
    prompt: submittedPrompt,
    visibleBots,
  }).filter(({ id }) => fullRosterIds.has(id));
  const selectedBotIds = rankedVisibleBots
    .slice(0, BOT_GROUP_COFFEE_STAGING_MAX_SELECTED)
    .map(({ id }) => id);
  return {
    rankingStrategy: BOT_GROUP_COFFEE_STAGING_RANKING_STRATEGY,
    submittedPrompt,
    normalizedPrompt: normalizeBotGroupCoffeeStagingPrompt(submittedPrompt),
    rankedVisibleBots,
    fullRosterBots: fullRoster,
    selectedBotIds,
    selection: summarizeBotGroupCoffeeStagingSelection(selectedBotIds),
  };
}

export function toggleBotGroupCoffeeStagingSelection({
  selectedBotIds,
  botId,
  rosterBotIds,
  preferredBotIds = [],
}: {
  selectedBotIds: readonly unknown[] | null | undefined;
  botId: unknown;
  rosterBotIds: readonly unknown[] | null | undefined;
  preferredBotIds?: readonly unknown[] | null | undefined;
}): BotGroupCoffeeStagingSelectionChange {
  const roster = uniqueAvailableBotIds(rosterBotIds);
  const current = reconcileBotGroupCoffeeStagingSelection({
    selectedBotIds,
    rosterBotIds: roster,
    preferredBotIds,
  });
  const candidateId = normalizedBotId(botId);
  let next = current;
  let reason: BotGroupCoffeeStagingSelectionChange["reason"] = "unchanged";
  let changed = false;
  if (!candidateId || !roster.includes(candidateId)) {
    reason = "unavailable";
  } else if (current.includes(candidateId)) {
    if (current.length <= BOT_GROUP_COFFEE_STAGING_MIN_SELECTED) {
      reason = "minimum-reached";
    } else {
      next = current.filter((selectedId) => selectedId !== candidateId);
      changed = true;
      reason = "deselected";
    }
  } else if (current.length >= BOT_GROUP_COFFEE_STAGING_MAX_SELECTED) {
    reason = "maximum-reached";
  } else {
    next = [...current, candidateId];
    changed = true;
    reason = "selected";
  }
  return {
    selectedBotIds: next,
    selection: summarizeBotGroupCoffeeStagingSelection(next),
    changed,
    reason,
  };
}

export function replaceBotGroupCoffeeStagingSelection({
  selectedBotIds,
  outgoingBotId,
  incomingBotId,
  rosterBotIds,
  preferredBotIds = [],
}: {
  selectedBotIds: readonly unknown[] | null | undefined;
  outgoingBotId: unknown;
  incomingBotId: unknown;
  rosterBotIds: readonly unknown[] | null | undefined;
  preferredBotIds?: readonly unknown[] | null | undefined;
}): BotGroupCoffeeStagingSelectionChange {
  const roster = uniqueAvailableBotIds(rosterBotIds);
  const current = reconcileBotGroupCoffeeStagingSelection({
    selectedBotIds,
    rosterBotIds: roster,
    preferredBotIds,
  });
  const outgoingId = normalizedBotId(outgoingBotId);
  const incomingId = normalizedBotId(incomingBotId);
  let reason: BotGroupCoffeeStagingSelectionChange["reason"] = "unchanged";
  let next = current;
  let changed = false;
  if (!incomingId || !roster.includes(incomingId)) {
    reason = "unavailable";
  } else if (!outgoingId || !current.includes(outgoingId)) {
    reason = "outgoing-not-selected";
  } else if (incomingId === outgoingId) {
    reason = "unchanged";
  } else if (current.includes(incomingId)) {
    reason = "already-selected";
  } else {
    next = current.map((selectedId) =>
      selectedId === outgoingId ? incomingId : selectedId,
    );
    changed = true;
    reason = "replaced";
  }
  return {
    selectedBotIds: next,
    selection: summarizeBotGroupCoffeeStagingSelection(next),
    changed,
    reason,
  };
}

export function botGroupCoffeeStagingReplacementRoster({
  prompt,
  fullRosterBots,
  selectedBotIds,
}: {
  prompt: unknown;
  fullRosterBots: readonly BotGroupCoffeeStagingBotInput[] | null | undefined;
  selectedBotIds: readonly unknown[] | null | undefined;
}): BotGroupCoffeeStagingReplacementBot[] {
  const roster = normalizeBotGroupCoffeeStagingRoster(fullRosterBots);
  const selected = new Set(
    reconcileBotGroupCoffeeStagingSelection({
      selectedBotIds,
      rosterBotIds: roster.map(({ id }) => id),
    }),
  );
  const rankedById = new Map(
    rankBotGroupCoffeeStagingVisibleBots({
      prompt,
      visibleBots: fullRosterBots,
    }).map((bot) => [bot.id, bot] as const),
  );
  return roster.map((bot) => {
    const ranked = rankedById.get(bot.id)!;
    return {
      ...bot,
      selected: selected.has(bot.id),
      match: ranked.match,
      reactionBand: ranked.reactionBand,
      reaction: ranked.reaction,
    };
  });
}

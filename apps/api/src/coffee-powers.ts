import type { DatabaseSync } from "node:sqlite";
import {
  activeBotPowerEffectsV1,
  activeBotPowersV1,
  botPowerCandorResponseRuleV1,
  botPowerCandorTriggerV1,
  buildCoffeePowersPromptBlock,
  COFFEE_HISTORY_WINDOW_HARD_CAP,
  coffeePowerCupRateMultiplierV1,
  type BotPowerEffectV1,
  type BotPowerResponseBudgetEffectV1,
  type BotPowerStrength,
  type BotPowerTargetV1,
  type CoffeeBotSocialSnapshot,
  type CoffeePowerPlanV1,
  type ResolvedCoffeePowerBotV1,
} from "@localai/shared";
import {
  applyCoffeeHearingRepeatMoodPenalty as applyCoffeeHearingRepeatMoodPenaltyV1,
  botPowerTextRequestsRepeat,
  strongestHearingRepeatEffect,
} from "./bot-power-hearing-repeat.ts";

interface CoffeePowerBotRow {
  id: string;
  name: string;
  system_prompt: string;
  semantic_facets: string | null;
  powers_json: string | null;
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseCoffeePowerPlan(raw: string | null | undefined): CoffeePowerPlanV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CoffeePowerPlanV1;
    return parsed?.version === 1 && parsed.bots && typeof parsed.bots === "object"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function loadCoffeePowerPlan(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): CoffeePowerPlanV1 | null {
  const row = db.prepare(
    "SELECT coffee_power_plan_json FROM conversations WHERE id = ? AND user_id = ?"
  ).get(conversationId, userId) as { coffee_power_plan_json?: string | null } | undefined;
  return parseCoffeePowerPlan(row?.coffee_power_plan_json);
}

function normalizedTraitTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((token) => token.endsWith("s") && token.length > 4 ? [token, token.slice(0, -1)] : [token]);
}

function botMatchesTrait(bot: CoffeePowerBotRow, trait: string): boolean {
  const haystack = normalizedTraitTokens(
    `${bot.name} ${bot.system_prompt} ${bot.semantic_facets ?? ""}`
  );
  const needles = normalizedTraitTokens(trait);
  return needles.length > 0 && needles.every((needle) => haystack.includes(needle));
}

function resolveTargets(args: {
  targets: readonly BotPowerTargetV1[];
  subjectBotId: string;
  bots: readonly CoffeePowerBotRow[];
  warnings: string[];
}): string[] {
  const resolved = new Set<string>();
  for (const target of args.targets) {
    if (target.kind === "all") {
      for (const bot of args.bots) if (bot.id !== args.subjectBotId) resolved.add(bot.id);
      continue;
    }
    const matches = target.kind === "bot"
      ? args.bots.filter((bot) =>
          (target.botId && bot.id === target.botId) ||
          bot.name.trim().toLowerCase() === target.name.trim().toLowerCase()
        )
      : args.bots.filter((bot) => botMatchesTrait(bot, target.trait));
    if (matches.length === 0) {
      const label = target.kind === "bot" ? target.name : target.trait;
      args.warnings.push(`No matching Coffee participant for “${label}”.`);
    }
    for (const bot of matches) if (bot.id !== args.subjectBotId) resolved.add(bot.id);
  }
  return [...resolved];
}

function resolvedEffect(
  effect: BotPowerEffectV1,
  subjectBotId: string,
  bots: readonly CoffeePowerBotRow[],
  warnings: string[]
): BotPowerEffectV1 {
  const resolve = (targets: readonly BotPowerTargetV1[]): BotPowerTargetV1[] =>
    resolveTargets({ targets, subjectBotId, bots, warnings }).map((botId) => ({
      kind: "bot" as const,
      botId,
      name: bots.find((bot) => bot.id === botId)?.name ?? botId,
    }));
  if (effect.type === "awareness" || effect.type === "speech_audience") {
    return { ...effect, allowed: resolve(effect.allowed) };
  }
  if (
    effect.type === "social_influence" ||
    effect.type === "candor" ||
    effect.type === "interruption" ||
    effect.type === "response_bond" ||
    effect.type === "selective_memory" ||
    effect.type === "insight"
  ) {
    return { ...effect, targets: resolve(effect.targets) };
  }
  return effect;
}

function idsFromResolvedTargets(targets: readonly BotPowerTargetV1[]): string[] {
  return targets.flatMap((target) => target.kind === "bot" && target.botId ? [target.botId] : []);
}

function powerStrengthScore(strength: BotPowerStrength): number {
  return strength === "small" ? 1 : strength === "large" ? 3 : 2;
}

function powerStrengthAdverb(strength: BotPowerStrength): string {
  return strength === "small" ? "gently" : strength === "large" ? "strongly" : "steadily";
}

function normalizedTopicText(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim()} `;
}

function contextMatchesTopics(contextText: string, topics: readonly string[]): boolean {
  const normalizedContext = normalizedTopicText(contextText);
  return topics.some((topic) => {
    const normalizedTopic = normalizedTopicText(topic).trim();
    return normalizedTopic.length > 0 && normalizedContext.includes(` ${normalizedTopic} `);
  });
}

export interface CoffeePowerSpeakerPressure {
  botId: string;
  score: number;
}

/**
 * Return bounded speaker-selection pressure from ready Powers. These scores
 * influence an ordinary moderator choice; direct-address precedence remains
 * the caller's responsibility.
 */
export function coffeePowerSpeakerPressures(args: {
  plan: CoffeePowerPlanV1 | null;
  candidateBotIds: readonly string[];
  lastSpeakerBotId: string | null;
  contextText: string;
}): CoffeePowerSpeakerPressure[] {
  return args.candidateBotIds.map((botId) => {
    let score = 0;
    for (const effect of args.plan?.bots[botId]?.effects ?? []) {
      if (effect.type === "turn_gravity") {
        const strength = powerStrengthScore(effect.strength);
        score += effect.direction === "more" ? strength : -strength;
      } else if (
        effect.type === "interruption" &&
        args.lastSpeakerBotId &&
        idsFromResolvedTargets(effect.targets).includes(args.lastSpeakerBotId)
      ) {
        score += powerStrengthScore(effect.strength);
      } else if (
        effect.type === "response_bond" &&
        args.lastSpeakerBotId &&
        idsFromResolvedTargets(effect.targets).includes(args.lastSpeakerBotId)
      ) {
        const strength = powerStrengthScore(effect.strength);
        score += effect.direction === "toward" ? strength : -strength;
      } else if (
        effect.type === "topic_gravity" &&
        contextMatchesTopics(args.contextText, effect.topics)
      ) {
        const strength = powerStrengthScore(effect.strength);
        score += effect.direction === "toward" ? strength : -strength;
      }
    }
    return { botId, score: Math.max(-3, Math.min(3, score)) };
  });
}

export function coffeePowerSpeakerOverride(args: {
  plan: CoffeePowerPlanV1 | null;
  candidateBotIds: readonly string[];
  pickedBotId: string;
  preservePickedBot?: boolean;
  lastSpeakerBotId: string | null;
  contextText: string;
}): CoffeePowerSpeakerPressure | null {
  if (args.preservePickedBot) return null;
  const pressures = coffeePowerSpeakerPressures(args);
  const pickedScore = pressures.find((entry) => entry.botId === args.pickedBotId)?.score ?? 0;
  const strongest = pressures.reduce<CoffeePowerSpeakerPressure | null>(
    (best, entry) => !best || entry.score > best.score ? entry : best,
    null,
  );
  if (!strongest || strongest.botId === args.pickedBotId || strongest.score - pickedScore < 2) {
    return null;
  }
  return strongest;
}

export function coffeePowerRouterPromptLines(args: {
  plan: CoffeePowerPlanV1 | null;
  group: readonly { id: string; name: string }[];
  lastSpeakerBotId: string | null;
  contextText: string;
}): string[] {
  const namesById = new Map(args.group.map((bot) => [bot.id, bot.name]));
  const pressures = coffeePowerSpeakerPressures({
    plan: args.plan,
    candidateBotIds: args.group.map((bot) => bot.id),
    lastSpeakerBotId: args.lastSpeakerBotId,
    contextText: args.contextText,
  }).filter((entry) => entry.score !== 0);
  if (pressures.length === 0) return [];
  return [
    "Active Power speaker pressures (soft unless strongly weighted; direct address still wins):",
    ...pressures.map((entry) =>
      `- ${namesById.get(entry.botId) ?? entry.botId}: ${entry.score > 0 ? "+" : ""}${entry.score}`
    ),
  ];
}

export function coffeePowerHistoryLimitForSpeaker(
  plan: CoffeePowerPlanV1 | null,
  speakerBotId: string,
  baseLimit: number,
): number {
  let limit = Math.max(0, Math.floor(baseLimit));
  for (const effect of plan?.bots[speakerBotId]?.effects ?? []) {
    if (effect.type !== "selective_memory" || effect.mode !== "remember") continue;
    const expanded = effect.strength === "small" ? 12 : effect.strength === "large" ? 32 : 24;
    limit = Math.max(limit, expanded);
  }
  return Math.min(COFFEE_HISTORY_WINDOW_HARD_CAP, limit);
}

/** Build a speaker-only view of loaded history without mutating persisted messages. */
export function coffeePowerHistoryForSpeaker<
  T extends { role: string; botId?: string | null },
>(args: {
  plan: CoffeePowerPlanV1 | null;
  speakerBotId: string;
  history: readonly T[];
  baseLimit: number;
}): T[] {
  const effects = args.plan?.bots[args.speakerBotId]?.effects ?? [];
  const baseStart = Math.max(0, args.history.length - Math.max(0, Math.floor(args.baseLimit)));
  const retainedIndexes = new Set<number>();
  for (let index = baseStart; index < args.history.length; index += 1) retainedIndexes.add(index);

  for (const effect of effects) {
    if (effect.type !== "selective_memory" || effect.mode !== "remember") continue;
    const targets = new Set(idsFromResolvedTargets(effect.targets));
    args.history.forEach((message, index) => {
      if (message.role === "assistant" && message.botId && targets.has(message.botId)) {
        retainedIndexes.add(index);
      }
    });
  }

  for (const effect of effects) {
    if (effect.type !== "selective_memory" || effect.mode !== "forget") continue;
    const targets = new Set(idsFromResolvedTargets(effect.targets));
    const keepCount = effect.strength === "small" ? 4 : effect.strength === "large" ? 1 : 2;
    const targetIndexes = args.history.flatMap((message, index) =>
      message.role === "assistant" && message.botId && targets.has(message.botId) ? [index] : []
    );
    for (const index of targetIndexes.slice(0, Math.max(0, targetIndexes.length - keepCount))) {
      retainedIndexes.delete(index);
    }
  }

  return args.history.filter((_message, index) => retainedIndexes.has(index));
}

function coffeeInsightCues(
  social: CoffeeBotSocialSnapshot,
  strength: BotPowerStrength,
): string[] {
  const candidates: Array<{ severity: number; text: string }> = [];
  if (social.disposition >= 0.68) {
    candidates.push({ severity: social.disposition - 0.5, text: "seems unusually receptive" });
  } else if (social.disposition <= 0.32) {
    candidates.push({ severity: 0.5 - social.disposition, text: "seems guarded toward the room" });
  }
  if (social.valuesFriction >= 0.64) {
    candidates.push({ severity: social.valuesFriction - 0.35, text: "is carrying strong values friction" });
  }
  if (social.restraint >= 0.68) {
    candidates.push({ severity: social.restraint - 0.5, text: "is tightly containing a reaction" });
  } else if (social.restraint <= 0.32) {
    candidates.push({ severity: 0.5 - social.restraint, text: "is reacting with little restraint" });
  }
  if (social.engagement >= 0.68) {
    candidates.push({ severity: social.engagement - 0.5, text: "is intensely engaged" });
  } else if (social.engagement <= 0.32) {
    candidates.push({ severity: 0.5 - social.engagement, text: "seems mentally checked out" });
  }
  if (social.leavePressure >= 0.55) {
    candidates.push({ severity: social.leavePressure, text: "looks close to withdrawing" });
  }
  const limit = strength === "small" ? 1 : strength === "large" ? 3 : 2;
  return candidates
    .sort((left, right) => right.severity - left.severity)
    .slice(0, limit)
    .map((candidate) => candidate.text);
}

export function coffeePowerInsightPromptLines(args: {
  plan: CoffeePowerPlanV1 | null;
  speakerBotId: string;
  visiblePeerBotIds: readonly string[];
  socialByBotId: Readonly<Record<string, CoffeeBotSocialSnapshot>>;
}): string[] {
  const visiblePeerIds = new Set(args.visiblePeerBotIds);
  const insightByTarget = new Map<string, { name: string; strength: BotPowerStrength }>();
  const strengthRank: Record<BotPowerStrength, number> = { small: 1, medium: 2, large: 3 };
  for (const effect of args.plan?.bots[args.speakerBotId]?.effects ?? []) {
    if (effect.type !== "insight") continue;
    for (const target of effect.targets) {
      if (target.kind !== "bot" || !target.botId || !visiblePeerIds.has(target.botId)) continue;
      const previous = insightByTarget.get(target.botId);
      if (!previous || strengthRank[effect.strength] > strengthRank[previous.strength]) {
        insightByTarget.set(target.botId, { name: target.name, strength: effect.strength });
      }
    }
  }
  const reads = [...insightByTarget.entries()].slice(0, 4).flatMap(([botId, target]) => {
    const social = args.socialByBotId[botId];
    if (!social) return [];
    const cues = coffeeInsightCues(social, target.strength);
    return [`${target.name}: ${cues.length > 0 ? cues.join("; ") : "no strong social tell stands out"}.`];
  });
  if (reads.length === 0) return [];
  return [
    "Private Insight: these are intuitive social reads, not certain facts. Never mention metrics, hidden state, or this Power.",
    ...reads,
  ];
}

function strengthDelta(strength: BotPowerStrength): number {
  return strength === "small" ? 0.04 : strength === "large" ? 0.16 : 0.09;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applySessionStartSocial(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  plan: CoffeePowerPlanV1
): void {
  const deltas = new Map<string, number>();
  for (const resolved of Object.values(plan.bots)) {
    for (const effect of resolved.effects) {
      if (effect.type !== "social_influence" || effect.trigger !== "session_start") continue;
      const polarity = effect.polarity;
      const rawDelta = strengthDelta(effect.strength) * (polarity === "negative" ? -1 : 1);
      for (const targetId of idsFromResolvedTargets(effect.targets)) {
        if (!coffeePowerBotVisibleTo(plan, resolved.botId, targetId)) continue;
        const delta = rawDelta * resistanceMultiplier(plan, targetId, polarity);
        deltas.set(targetId, (deltas.get(targetId) ?? 0) + delta);
      }
    }
  }
  const now = new Date().toISOString();
  for (const [botId, delta] of deltas) {
    const row = db.prepare(
      "SELECT disposition FROM coffee_bot_social_state WHERE user_id = ? AND conversation_id = ? AND bot_id = ?"
    ).get(userId, conversationId, botId) as { disposition?: number } | undefined;
    if (!row || typeof row.disposition !== "number") continue;
    db.prepare(
      "UPDATE coffee_bot_social_state SET disposition = ?, updated_at = ? WHERE user_id = ? AND conversation_id = ? AND bot_id = ?"
    ).run(clamp01(row.disposition + delta), now, userId, conversationId, botId);
  }
}

export function resolveCoffeePowersForSession(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): CoffeePowerPlanV1 {
  const conversation = db.prepare(
    "SELECT bot_group_ids, coffee_power_plan_json FROM conversations WHERE id = ? AND user_id = ? AND conversation_mode = 'coffee'"
  ).get(conversationId, userId) as {
    bot_group_ids?: string | null;
    coffee_power_plan_json?: string | null;
  } | undefined;
  if (!conversation) throw new Error("Coffee session not found.");
  const existing = parseCoffeePowerPlan(conversation.coffee_power_plan_json);
  if (existing) return existing;
  const botIds = parseStringArray(conversation.bot_group_ids);
  if (botIds.length === 0) {
    const emptyPlan: CoffeePowerPlanV1 = {
      version: 1,
      resolvedAt: new Date().toISOString(),
      bots: {},
      warnings: [],
    };
    db.prepare(
      "UPDATE conversations SET coffee_power_plan_json = ? WHERE id = ? AND user_id = ? AND coffee_power_plan_json IS NULL"
    ).run(JSON.stringify(emptyPlan), conversationId, userId);
    return emptyPlan;
  }
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT id, name, system_prompt, semantic_facets, powers_json
       FROM bots
      WHERE user_id = ? AND id IN (${placeholders})`
  ).all(userId, ...botIds) as unknown as CoffeePowerBotRow[];
  const botsById = new Map(rows.map((row) => [row.id, row]));
  const orderedBots = botIds.map((id) => botsById.get(id)).filter((bot): bot is CoffeePowerBotRow => Boolean(bot));
  const planBots: Record<string, ResolvedCoffeePowerBotV1> = {};
  const planWarnings: string[] = [];
  for (const bot of orderedBots) {
    const powers = activeBotPowersV1(bot.powers_json);
    if (powers.length === 0) continue;
    const warnings: string[] = [];
    const effects = activeBotPowerEffectsV1(powers).map((effect) =>
      resolvedEffect(effect, bot.id, orderedBots, warnings)
    );
    const awareness = effects.find((effect) => effect.type === "awareness");
    const speechAudience = effects.find((effect) => effect.type === "speech_audience");
    const resolved: ResolvedCoffeePowerBotV1 = {
      botId: bot.id,
      powerIds: powers.map((power) => power.id),
      selfCue: powers.map((power) => power.compiled?.selfCue ?? "").filter(Boolean).join(" "),
      observerCue: powers.map((power) => power.compiled?.observerCue ?? "").filter(Boolean).join(" "),
      visibleToBotIds:
        awareness?.type === "awareness" ? idsFromResolvedTargets(awareness.allowed) : null,
      speechAudienceBotIds:
        speechAudience?.type === "speech_audience"
          ? idsFromResolvedTargets(speechAudience.allowed)
          : null,
      effects,
      ruleLabels: powers.flatMap((power) => power.compiled?.ruleLabels ?? []),
      warnings: [...new Set(warnings)],
    };
    planBots[bot.id] = resolved;
    planWarnings.push(...resolved.warnings.map((warning) => `${bot.name}: ${warning}`));
  }
  const plan: CoffeePowerPlanV1 = {
    version: 1,
    resolvedAt: new Date().toISOString(),
    bots: planBots,
    warnings: [...new Set(planWarnings)],
  };
  db.prepare(
    "UPDATE conversations SET coffee_power_plan_json = ? WHERE id = ? AND user_id = ? AND coffee_power_plan_json IS NULL"
  ).run(JSON.stringify(plan), conversationId, userId);
  applySessionStartSocial(db, userId, conversationId, plan);
  return plan;
}

export function coffeePowerBotCanSpeak(plan: CoffeePowerPlanV1 | null, botId: string): boolean {
  const audience = plan?.bots[botId]?.speechAudienceBotIds;
  return audience === null || audience === undefined || audience.length > 0;
}

export function coffeePowerBotIsMuted(plan: CoffeePowerPlanV1 | null, botId: string): boolean {
  return plan?.bots[botId]?.effects.some((effect) => effect.type === "mute") === true;
}

/** Uses the frozen Coffee plan, so replay keeps the session's ghostly reveal. */
export function coffeePowerBotHasSpeakingOnlyAvatarVisibility(
  plan: CoffeePowerPlanV1 | null,
  botId: string,
): boolean {
  return plan?.bots[botId]?.effects.some(
    (effect) =>
      effect.type === "avatar_visibility" && effect.mode === "speaking_only",
  ) === true;
}

export function coffeePowerBotEchoesAddressedSpeech(
  plan: CoffeePowerPlanV1 | null,
  botId: string,
): boolean {
  return plan?.bots[botId]?.effects.some(
    (effect) => effect.type === "echo_addressed",
  ) === true;
}

export function coffeePowerEchoSourceForTurn(args: {
  turnKind: "user" | "autonomous";
  speakerBotId: string;
  userActionOnly: boolean;
  tableFocus: string;
  explicitDirectedSpeakerBotId?: string | null;
  currentUserAddressedBotId?: string | null;
  priorAddressedBotId?: string | null;
  latestAssistantContent?: string | null;
}): string | null {
  if (
    args.turnKind === "user" &&
    !args.userActionOnly &&
    (args.explicitDirectedSpeakerBotId === args.speakerBotId ||
      args.currentUserAddressedBotId === args.speakerBotId)
  ) {
    return args.tableFocus;
  }
  if (
    args.turnKind === "autonomous" &&
    args.priorAddressedBotId === args.speakerBotId &&
    typeof args.latestAssistantContent === "string" &&
    args.latestAssistantContent.length > 0
  ) {
    return args.latestAssistantContent;
  }
  return null;
}

export interface CoffeePowerHearingRepeatDirective {
  requesterBotId: string;
  repeatingBotId: string;
  requestMessageId: string;
  sourceMessageId: string;
  repeatedContent: string;
  moodPenalty: BotPowerStrength;
}

/**
 * Resolves only an uninterrupted bot-to-bot request: speaker line, holder
 * request, then the next autonomous Coffee turn. A player turn or direction
 * breaks the chain instead of taking control away from them.
 */
export function coffeePowerHearingRepeatDirective(args: {
  plan: CoffeePowerPlanV1 | null;
  history: readonly {
    id: string;
    role: string;
    content: string;
    botId?: string | null;
  }[];
  eligibleBotIds: readonly string[];
}): CoffeePowerHearingRepeatDirective | null {
  const request = args.history.at(-1);
  const source = args.history.at(-2);
  if (
    request?.role !== "assistant" ||
    source?.role !== "assistant" ||
    !request.botId ||
    !source.botId ||
    request.botId === source.botId ||
    !botPowerTextRequestsRepeat(request.content)
  ) {
    return null;
  }
  const eligible = new Set(args.eligibleBotIds);
  if (!eligible.has(request.botId) || !eligible.has(source.botId)) return null;
  const effect = strongestHearingRepeatEffect(
    args.plan?.bots[request.botId]?.effects ?? [],
  );
  if (!effect) return null;
  if (!coffeePowerBotVisibleTo(args.plan, source.botId, request.botId)) return null;
  const speechAudience = args.plan?.bots[source.botId]?.speechAudienceBotIds;
  if (speechAudience !== null && speechAudience !== undefined) {
    if (!speechAudience.includes(request.botId)) return null;
  }
  return {
    requesterBotId: request.botId,
    repeatingBotId: source.botId,
    requestMessageId: request.id,
    sourceMessageId: source.id,
    repeatedContent: source.content,
    moodPenalty: effect.moodPenalty,
  };
}

export function applyCoffeeHearingRepeatMoodPenalty(args: {
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
  repeatingBotId: string;
  strength: BotPowerStrength;
}): Record<string, CoffeeBotSocialSnapshot> {
  return applyCoffeeHearingRepeatMoodPenaltyV1(args);
}

export function coffeePowerBotVisibleTo(
  plan: CoffeePowerPlanV1 | null,
  subjectBotId: string,
  viewerBotId: string
): boolean {
  if (subjectBotId === viewerBotId) return true;
  const audience = plan?.bots[subjectBotId]?.visibleToBotIds;
  return audience === null || audience === undefined || audience.includes(viewerBotId);
}

export function coffeePowerMessageAudience(
  plan: CoffeePowerPlanV1 | null,
  speakerBotId: string
): string[] | null {
  return plan?.bots[speakerBotId]?.visibleToBotIds ?? null;
}

export function coffeePowersPromptForSpeaker(
  plan: CoffeePowerPlanV1 | null,
  speakerBotId: string,
  visiblePeerBotIds: readonly string[],
  socialByBotId: Readonly<Record<string, CoffeeBotSocialSnapshot>> = {},
  candorTurn?: {
    sourceBotId: string | null;
    sourceBotName?: string | null;
    sourceText: string | null;
    directlyAddressed: boolean;
  },
): string {
  if (!plan) return "";
  const lines: string[] = [];
  const own = plan.bots[speakerBotId];
  const speechAudience = own?.effects.find((effect) => effect.type === "speech_audience");
  if (speechAudience?.type === "speech_audience") {
    const names = speechAudience.allowed.flatMap((target) =>
      target.kind === "bot" ? [target.name] : []
    );
    if (names.length > 0) lines.push(`Hard rule: address only ${names.join(", ")}.`);
  }
  if (own?.effects.some((effect) => effect.type === "echo_addressed")) {
    lines.push("Hard echo rule: repeat only the latest speech addressed directly to you, verbatim, with no added words or actions. If nothing was addressed to you, remain silent.");
  }
  const responseBudget = coffeePowerResponseBudgetForBot(plan, speakerBotId);
  if (responseBudget) {
    lines.push(
      responseBudget.mode === "minimal"
        ? `${responseBudget.enforcement === "hard" ? "Hard" : "Soft"} response budget: use one short table sentence and do not elaborate.`
        : responseBudget.mode === "brief"
          ? `${responseBudget.enforcement === "hard" ? "Hard" : "Soft"} response budget: use no more than two concise table sentences.`
          : "Response tendency: offer a fuller answer only when there is real substance; never pad the turn.",
    );
  }
  const candorRule = coffeePowerCandorPromptForTurn({
    plan,
    targetBotId: speakerBotId,
    ...(candorTurn ?? {
      sourceBotId: null,
      sourceText: null,
      directlyAddressed: false,
    }),
  });
  if (candorRule) lines.push(candorRule);
  lines.push(...coffeePowerInsightPromptLines({
    plan,
    speakerBotId,
    visiblePeerBotIds,
    socialByBotId,
  }));
  if (own?.selfCue) lines.push(own.selfCue);
  for (const effect of own?.effects ?? []) {
    const targetNames = effect.type === "response_bond" || effect.type === "selective_memory"
      ? effect.targets.flatMap((target) => target.kind === "bot" ? [target.name] : [])
      : [];
    if (effect.type === "response_bond" && targetNames.length > 0) {
      lines.push(
        effect.direction === "toward"
          ? `Response bond: when ${targetNames.join(", ")} speaks, you feel a ${effect.strength} pull to engage their point.`
          : `Response boundary: when ${targetNames.join(", ")} speaks, you feel a ${effect.strength} pull to withhold or redirect rather than engage them.`,
      );
    } else if (effect.type === "topic_gravity") {
      lines.push(
        effect.direction === "toward"
          ? `Topic gravity: when it fits the live exchange, pull ${powerStrengthAdverb(effect.strength)} toward ${effect.topics.join(", ")}.`
          : `Topic boundary: when it fits the live exchange, pull ${powerStrengthAdverb(effect.strength)} away from ${effect.topics.join(", ")}.`,
      );
    } else if (effect.type === "selective_memory" && targetNames.length > 0) {
      lines.push(
        effect.mode === "remember"
          ? `Selective memory: earlier words from ${targetNames.join(", ")} remain unusually vivid to you.`
          : `Selective memory: only the most recent words from ${targetNames.join(", ")} remain clear to you.`,
      );
    }
  }
  const hasPrivatePerception = visiblePeerBotIds.some((botId) => {
    const peer = plan.bots[botId];
    if (!peer) return false;
    const privateVisibility =
      peer.visibleToBotIds !== null &&
      peer.visibleToBotIds.includes(speakerBotId);
    const privateSpeech =
      peer.speechAudienceBotIds !== null &&
      peer.speechAudienceBotIds.includes(speakerBotId);
    return privateVisibility || privateSpeech;
  });
  const isExcludedFromPrivatePerception = Object.values(plan.bots).some(
    (peer) => {
      if (peer.botId === speakerBotId) return false;
      const excludedFromSight =
        peer.visibleToBotIds !== null &&
        !peer.visibleToBotIds.includes(speakerBotId);
      const excludedFromSpeech =
        peer.speechAudienceBotIds !== null &&
        !peer.speechAudienceBotIds.includes(speakerBotId);
      return excludedFromSight || excludedFromSpeech;
    },
  );
  if (hasPrivatePerception) {
    lines.push(
      "Private perception: some others cannot see or hear a participant you can. If you answer aloud, they may see you addressing empty space. Usually reply indirectly or under your breath; name, quote, or reveal that participant only as an intentional in-character choice.",
    );
  } else if (isExcludedFromPrivatePerception) {
    lines.push(
      "Perception boundary: respond only to people and lines present in your table context. You may notice someone publicly addressing empty space or an unknown name, but never claim to see, hear, quote, or answer the hidden source.",
    );
  }
  for (const botId of visiblePeerBotIds) {
    const peer = plan.bots[botId];
    if (peer?.observerCue) lines.push(peer.observerCue);
  }
  return buildCoffeePowersPromptBlock(lines);
}

export function coffeePowerCandorPromptForTurn(args: {
  plan: CoffeePowerPlanV1 | null;
  sourceBotId: string | null;
  sourceBotName?: string | null;
  targetBotId: string;
  sourceText: string | null;
  directlyAddressed: boolean;
}): string | null {
  if (
    !args.plan ||
    !args.sourceBotId ||
    args.sourceBotId === args.targetBotId ||
    !args.directlyAddressed ||
    !botPowerCandorTriggerV1(args.sourceText)
  ) {
    return null;
  }
  const source = args.plan.bots[args.sourceBotId];
  if (!source || !coffeePowerBotVisibleTo(args.plan, args.sourceBotId, args.targetBotId)) {
    return null;
  }
  if (
    source.speechAudienceBotIds !== null &&
    !source.speechAudienceBotIds.includes(args.targetBotId)
  ) {
    return null;
  }
  const strengthRank: Record<BotPowerStrength, number> = {
    small: 1,
    medium: 2,
    large: 3,
  };
  const strongest = source.effects
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "candor" }> =>
        effect.type === "candor" &&
        idsFromResolvedTargets(effect.targets).includes(args.targetBotId),
    )
    .reduce<Extract<BotPowerEffectV1, { type: "candor" }> | null>(
      (best, effect) =>
        !best || strengthRank[effect.strength] > strengthRank[best.strength]
          ? effect
          : best,
      null,
    );
  return strongest
    ? botPowerCandorResponseRuleV1(
        strongest.strength,
        args.sourceBotName?.trim() || "the bot who asked",
      )
    : null;
}

export function coffeePowerCupRateMultiplier(
  plan: CoffeePowerPlanV1 | null,
  botId: string
): number {
  return coffeePowerCupRateMultiplierV1(plan, botId);
}

export function coffeePowerActionBias(
  plan: CoffeePowerPlanV1 | null,
  botId: string
): Extract<BotPowerEffectV1, { type: "action_bias" }> | null {
  const effect = plan?.bots[botId]?.effects.find((candidate) => candidate.type === "action_bias");
  if (effect?.type === "action_bias") return effect;
  const interruption = plan?.bots[botId]?.effects.find(
    (candidate) => candidate.type === "interruption",
  );
  return interruption?.type === "interruption"
    ? {
        type: "action_bias",
        cue: "Cut in quickly when a real conversational opening appears.",
        frequency: interruption.frequency,
      }
    : null;
}

export function coffeePowerResponseBudgetForBot(
  plan: CoffeePowerPlanV1 | null,
  botId: string,
  hardOnly = false,
): BotPowerResponseBudgetEffectV1 | null {
  const rank = { minimal: 0, brief: 1, expansive: 2 } as const;
  return (plan?.bots[botId]?.effects ?? [])
    .filter(
      (effect): effect is BotPowerResponseBudgetEffectV1 =>
        effect.type === "response_budget" &&
        (!hardOnly ||
          (effect.enforcement === "hard" && effect.mode !== "expansive")),
    )
    .reduce<BotPowerResponseBudgetEffectV1 | null>((strongest, effect) => {
      if (!strongest) return effect;
      if (rank[effect.mode] < rank[strongest.mode]) return effect;
      if (
        effect.mode === strongest.mode &&
        effect.enforcement === "hard" &&
        strongest.enforcement !== "hard"
      ) {
        return effect;
      }
      return strongest;
    }, null);
}

function resistanceMultiplier(
  plan: CoffeePowerPlanV1,
  targetId: string,
  polarity: "positive" | "negative"
): number {
  const effects = plan.bots[targetId]?.effects ?? [];
  let multiplier = 1;
  for (const effect of effects) {
    if (effect.type !== "mood_resistance") continue;
    if (effect.polarity !== "both" && effect.polarity !== polarity) continue;
    const candidate = effect.strength === "small" ? 0.75 : effect.strength === "large" ? 0.2 : 0.5;
    multiplier = Math.min(multiplier, candidate);
  }
  return multiplier;
}

export function applyCoffeePowerAfterSpeech<T extends { disposition: number }>(args: {
  plan: CoffeePowerPlanV1 | null;
  speakerBotId: string;
  socialByBotId: Record<string, T>;
}): Record<string, T> {
  if (!args.plan) return args.socialByBotId;
  const next = { ...args.socialByBotId };
  for (const effect of args.plan.bots[args.speakerBotId]?.effects ?? []) {
    if (effect.type !== "social_influence" || effect.trigger !== "after_speech") continue;
    const polarity = effect.polarity;
    const rawDelta = strengthDelta(effect.strength) * (polarity === "negative" ? -1 : 1);
    for (const targetId of idsFromResolvedTargets(effect.targets)) {
      if (!coffeePowerBotVisibleTo(args.plan, args.speakerBotId, targetId)) continue;
      const previous = next[targetId];
      if (!previous) continue;
      const delta = rawDelta * resistanceMultiplier(args.plan, targetId, polarity);
      next[targetId] = { ...previous, disposition: clamp01(previous.disposition + delta) };
    }
  }
  return next;
}

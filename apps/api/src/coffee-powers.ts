import type { DatabaseSync } from "node:sqlite";
import {
  activeBotPowersV1,
  buildCoffeePowersPromptBlock,
  coffeePowerCupRateMultiplierV1,
  type BotPowerEffectV1,
  type BotPowerStrength,
  type BotPowerTargetV1,
  type CoffeePowerPlanV1,
  type ResolvedCoffeePowerBotV1,
} from "@localai/shared";

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
  if (effect.type === "social_influence") {
    return { ...effect, targets: resolve(effect.targets) };
  }
  return effect;
}

function idsFromResolvedTargets(targets: readonly BotPowerTargetV1[]): string[] {
  return targets.flatMap((target) => target.kind === "bot" && target.botId ? [target.botId] : []);
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
    const effects = powers.flatMap((power) =>
      (power.compiled?.effects ?? []).map((effect) =>
        resolvedEffect(effect, bot.id, orderedBots, warnings)
      )
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
  visiblePeerBotIds: readonly string[]
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
  if (own?.selfCue) lines.push(own.selfCue);
  for (const botId of visiblePeerBotIds) {
    const peer = plan.bots[botId];
    if (peer?.observerCue) lines.push(peer.observerCue);
  }
  return buildCoffeePowersPromptBlock(lines);
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
  return effect?.type === "action_bias" ? effect : null;
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

export const BOT_POWER_VERSION = 1 as const;
export const BOT_POWER_MAX_COUNT = 3;
export const BOT_POWER_NAME_MAX_LENGTH = 40;
export const BOT_POWER_INTENT_MAX_LENGTH = 300;
export const COFFEE_POWER_PROMPT_MAX_CHARS = 640;
export const COFFEE_POWER_PROMPT_MAX_TOKENS = 160;

export type BotPowerCompileStatus = "draft" | "compiling" | "ready" | "error";
export type BotPowerStrength = "small" | "medium" | "large";
export type BotPowerFrequency = "occasional" | "frequent";

export type BotPowerTargetV1 =
  | { kind: "all" }
  | { kind: "bot"; name: string; botId?: string }
  | { kind: "trait"; trait: string };

export type BotPowerEffectV1 =
  | { type: "awareness"; allowed: BotPowerTargetV1[] }
  | { type: "speech_audience"; allowed: BotPowerTargetV1[] }
  | {
      type: "social_influence";
      trigger: "session_start" | "after_speech";
      polarity: "positive" | "negative";
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
    }
  | {
      type: "mood_resistance";
      polarity: "positive" | "negative" | "both";
      strength: BotPowerStrength;
    }
  | { type: "cup_rate"; rate: "slow" | "fast" | "very_fast" }
  | { type: "action_bias"; cue: string; frequency: BotPowerFrequency };

export interface CompiledBotPowerV1 {
  version: 1;
  sourceHash: string;
  selfCue: string;
  observerCue: string;
  effects: BotPowerEffectV1[];
  ruleLabels: string[];
}

export interface BotPowerV1 {
  version: 1;
  id: string;
  name: string;
  intent: string;
  enabled: boolean;
  compileStatus: BotPowerCompileStatus;
  compileError?: string;
  compiled: CompiledBotPowerV1 | null;
}

export interface ResolvedCoffeePowerBotV1 {
  botId: string;
  powerIds: string[];
  selfCue: string;
  observerCue: string;
  visibleToBotIds: string[] | null;
  speechAudienceBotIds: string[] | null;
  effects: BotPowerEffectV1[];
  ruleLabels: string[];
  warnings: string[];
}

export interface CoffeePowerPlanV1 {
  version: 1;
  resolvedAt: string;
  bots: Record<string, ResolvedCoffeePowerBotV1>;
  warnings: string[];
}

function compactText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function botPowerSourceHashV1(name: string, intent: string): string {
  const source = `v${BOT_POWER_VERSION}\n${name.trim()}\n${intent.trim()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v${BOT_POWER_VERSION}-${hash.toString(16).padStart(8, "0")}`;
}

function normalizeTarget(value: unknown): BotPowerTargetV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const target = value as Record<string, unknown>;
  if (target.kind === "all") return { kind: "all" };
  if (target.kind === "bot") {
    const name = compactText(target.name, 80);
    const botId = compactText(target.botId, 100);
    if (!name && !botId) return null;
    return { kind: "bot", name: name || botId, ...(botId ? { botId } : {}) };
  }
  if (target.kind === "trait") {
    const trait = compactText(target.trait, 80).toLowerCase();
    return trait ? { kind: "trait", trait } : null;
  }
  return null;
}

function normalizeTargets(value: unknown): BotPowerTargetV1[] {
  if (!Array.isArray(value)) return [];
  const targets: BotPowerTargetV1[] = [];
  for (const item of value) {
    const target = normalizeTarget(item);
    if (!target) continue;
    const key = JSON.stringify(target);
    if (!targets.some((candidate) => JSON.stringify(candidate) === key)) targets.push(target);
    if (targets.length >= 8) break;
  }
  return targets;
}

function normalizeStrength(value: unknown): BotPowerStrength {
  return value === "small" || value === "large" ? value : "medium";
}

export function normalizeBotPowerEffectV1(value: unknown): BotPowerEffectV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const effect = value as Record<string, unknown>;
  if (effect.type === "awareness" || effect.type === "speech_audience") {
    return { type: effect.type, allowed: normalizeTargets(effect.allowed) };
  }
  if (effect.type === "social_influence") {
    return {
      type: "social_influence",
      trigger: effect.trigger === "session_start" ? "session_start" : "after_speech",
      polarity: effect.polarity === "positive" ? "positive" : "negative",
      strength: normalizeStrength(effect.strength),
      targets: normalizeTargets(effect.targets),
    };
  }
  if (effect.type === "mood_resistance") {
    return {
      type: "mood_resistance",
      polarity:
        effect.polarity === "positive" || effect.polarity === "negative"
          ? effect.polarity
          : "both",
      strength: normalizeStrength(effect.strength),
    };
  }
  if (effect.type === "cup_rate") {
    return {
      type: "cup_rate",
      rate: effect.rate === "slow" || effect.rate === "very_fast" ? effect.rate : "fast",
    };
  }
  if (effect.type === "action_bias") {
    const cue = compactText(effect.cue, 160);
    if (!cue) return null;
    return {
      type: "action_bias",
      cue,
      frequency: effect.frequency === "frequent" ? "frequent" : "occasional",
    };
  }
  return null;
}

export function normalizeCompiledBotPowerV1(value: unknown): CompiledBotPowerV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const compiled = value as Record<string, unknown>;
  if (compiled.version !== BOT_POWER_VERSION) return null;
  const sourceHash = compactText(compiled.sourceHash, 128);
  if (!sourceHash) return null;
  const effects = Array.isArray(compiled.effects)
    ? compiled.effects
        .map(normalizeBotPowerEffectV1)
        .filter((effect): effect is BotPowerEffectV1 => effect !== null)
        .slice(0, 8)
    : [];
  const ruleLabels = Array.isArray(compiled.ruleLabels)
    ? compiled.ruleLabels
        .map((label) => compactText(label, 100))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return {
    version: BOT_POWER_VERSION,
    sourceHash,
    selfCue: compactText(compiled.selfCue, 280),
    observerCue: compactText(compiled.observerCue, 280),
    effects,
    ruleLabels,
  };
}

export function normalizeBotPowerV1(value: unknown): BotPowerV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const power = value as Record<string, unknown>;
  const name = compactText(power.name, BOT_POWER_NAME_MAX_LENGTH);
  const intent = compactText(power.intent, BOT_POWER_INTENT_MAX_LENGTH);
  if (!name && !intent) return null;
  const parsedCompiled = normalizeCompiledBotPowerV1(power.compiled);
  const compiled =
    parsedCompiled?.sourceHash === botPowerSourceHashV1(name, intent)
      ? parsedCompiled
      : null;
  const compileStatus: BotPowerCompileStatus =
    power.compileStatus === "ready" && compiled
      ? "ready"
      : power.compileStatus === "error"
        ? "error"
        : "draft";
  return {
    version: BOT_POWER_VERSION,
    id: compactText(power.id, 100) || `power-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "draft"}`,
    name,
    intent,
    enabled: power.enabled !== false,
    compileStatus,
    ...(compileStatus === "error"
      ? { compileError: compactText(power.compileError, 180) || "Compilation failed." }
      : {}),
    compiled: compileStatus === "ready" ? compiled : null,
  };
}

export function normalizeBotPowersV1(value: unknown): BotPowerV1[] {
  if (!Array.isArray(value)) return [];
  const powers: BotPowerV1[] = [];
  for (const item of value) {
    const power = normalizeBotPowerV1(item);
    if (!power) continue;
    if (powers.some((candidate) => candidate.id === power.id)) continue;
    powers.push(power);
    if (powers.length >= BOT_POWER_MAX_COUNT) break;
  }
  return powers;
}

export function parseStoredBotPowersV1(value: unknown): BotPowerV1[] {
  if (typeof value === "string") {
    try {
      return normalizeBotPowersV1(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return normalizeBotPowersV1(value);
}

export function serializeBotPowersV1(value: unknown): string {
  return JSON.stringify(normalizeBotPowersV1(value));
}

export function activeBotPowersV1(value: unknown): BotPowerV1[] {
  return parseStoredBotPowersV1(value).filter(
    (power) => power.enabled && power.compileStatus === "ready" && power.compiled
  );
}

export function buildCoffeePowersPromptBlock(
  lines: readonly string[],
  maxChars = COFFEE_POWER_PROMPT_MAX_CHARS,
  maxTokens = COFFEE_POWER_PROMPT_MAX_TOKENS
): string {
  const deduped = Array.from(
    new Set(lines.map((line) => compactText(line, 280)).filter(Boolean))
  );
  if (deduped.length === 0) return "";
  const prefix = "Coffee Powers:\n";
  let body = "";
  for (const line of deduped) {
    const candidate = `${body}${body ? "\n" : ""}- ${line}`;
    if (
      prefix.length + candidate.length > maxChars ||
      estimateCoffeePowerTokensV1(`${prefix}${candidate}`) > maxTokens
    ) break;
    body = candidate;
  }
  return body ? `${prefix}${body}` : "";
}

export function estimateCoffeePowerTokensV1(value: string): number {
  const parts = value.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
  return parts.reduce(
    (total, part) => total + (/^[\p{L}\p{N}_]+$/u.test(part) ? Math.max(1, Math.ceil(part.length / 4)) : 1),
    0
  );
}

export function coffeePowerCupRateMultiplierV1(
  plan: CoffeePowerPlanV1 | null | undefined,
  botId: string
): number {
  const effect = plan?.bots[botId]?.effects.find((candidate) => candidate.type === "cup_rate");
  if (!effect || effect.type !== "cup_rate") return 1;
  return effect.rate === "slow" ? 0.55 : effect.rate === "very_fast" ? 2.5 : 1.65;
}

export const BOT_POWER_VERSION = 1 as const;
export const BOT_POWER_CANONICAL_SILENCE_V1 = "..." as const;
export const BOT_POWER_MAX_COUNT = 3;
export const BOT_POWER_NAME_MAX_LENGTH = 40;
export const BOT_POWER_INTENT_MAX_LENGTH = 300;
export const BOT_POWER_PROMPT_MAX_CHARS = 640;
export const BOT_POWER_PROMPT_MAX_TOKENS = 160;
export const COFFEE_POWER_PROMPT_MAX_CHARS = 640;
export const COFFEE_POWER_PROMPT_MAX_TOKENS = 160;
export const BOT_POWER_FORGETFUL_CONTEXT_MIN_MESSAGES_V1 = 1;
export const BOT_POWER_FORGETFUL_CONTEXT_MAX_MESSAGES_V1 = 4;

export type BotPowerCompileStatus = "draft" | "compiling" | "ready" | "error";
export type BotPowerStrength = "small" | "medium" | "large";
export type BotPowerFrequency = "occasional" | "frequent";
export type BotPowerGravityDirection = "more" | "less";
export type BotPowerBondDirection = "toward" | "away";
export type BotPowerTopicDirection = "toward" | "away";
export type BotPowerMemoryMode = "remember" | "forget";
export type BotPowerResponseBudgetMode = "minimal" | "brief" | "expansive";
export type BotPowerEnforcement = "soft" | "hard";
export type BotPowerAvatarScaleMode = "larger" | "smaller";
export type BotPowerVoicePresenceMode = "loud" | "quiet";
/** Resolved rendered app theme used by conditional Power branches. */
export type BotPowerResolvedThemeV1 = "light" | "dark";

/** Fixed Power-owned presentation trims; account Voice Volume remains master. */
export const BOT_POWER_LOUD_VOICE_GAIN_MULTIPLIER_V1 = 1.18;
export const BOT_POWER_QUIET_VOICE_GAIN_MULTIPLIER_V1 = 0.72;
export const BOT_POWER_LOUD_TEXT_SCALE_V1 = 1.12;
export const BOT_POWER_QUIET_TEXT_SCALE_V1 = 0.88;

export type BotPowerTargetV1 =
  | { kind: "all" }
  | { kind: "bot"; name: string; botId?: string }
  | { kind: "trait"; trait: string };

export type BotPowerEffectV1 =
  | { type: "mute" }
  /** Give the holder a stable one-to-four-message public tail and no older continuity. */
  | { type: "eternal_introduction"; memory: "rolling_public_tail_1_to_4" }
  /** Repeat the latest speech addressed to the holder verbatim. */
  | { type: "speech_copy"; trigger: "direct_address" }
  /** Copy the latest bot that directly addresses the holder; humans are never targets. */
  | { type: "identity_mirror"; trigger: "direct_bot_address" }
  | {
      type: "hearing_repeat";
      frequency: BotPowerFrequency;
      moodPenalty: BotPowerStrength;
    }
  | { type: "awareness"; allowed: BotPowerTargetV1[] }
  | { type: "speech_audience"; allowed: BotPowerTargetV1[] }
  /** Hide a live avatar while idle; reveal it only for an audible utterance. */
  | { type: "avatar_visibility"; mode: "speaking_only" }
  /** Render the holder at a restrained relative size without changing layout. */
  | { type: "avatar_scale"; mode: BotPowerAvatarScaleMode }
  /** Apply a fixed audible and typographic presence without changing saved voice settings. */
  | { type: "voice_presence"; mode: BotPowerVoicePresenceMode }
  /** Replace every public spoken word with deterministic normal-volume gibberish. */
  | { type: "speech_obfuscation"; mode: "gibberish" }
  /** Silence exactly half of stable turn attempts and lower the holder's mood. */
  | {
      type: "intermittent_mute";
      chance: "half";
      moodPenalty: BotPowerStrength;
    }
  | {
      type: "social_influence";
      trigger: "session_start" | "after_speech";
      polarity: "positive" | "negative";
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
    }
  | {
      /** One bounded positive mood step for each perceiving recipient of a completed spoken turn. */
      type: "mood_boost";
      trigger: "after_spoken_turn";
      recipients: "addressed";
      strength: BotPowerStrength;
      /** Omitted means always active; conditional compounds name one resolved theme. */
      whenTheme?: BotPowerResolvedThemeV1;
    }
  | {
      /** One bounded negative mood step for a bot after it directly addresses the holder. */
      type: "mood_drain";
      trigger: "after_direct_address";
      recipient: "addresser";
      strength: BotPowerStrength;
      /** Omitted means always active; conditional compounds name one resolved theme. */
      whenTheme?: BotPowerResolvedThemeV1;
    }
  | {
      /** One-response social pressure after the holder directly asks a bot. */
      type: "candor";
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
    }
  | {
      /** Soft pressure to treat the holder's current addressee as a personal star. */
      type: "addressed_fandom";
      strength: BotPowerStrength;
    }
  | {
      type: "mood_resistance";
      polarity: "positive" | "negative" | "both";
      strength: BotPowerStrength;
    }
  | { type: "cup_rate"; rate: "none" | "slow" | "fast" | "very_fast" }
  | { type: "action_bias"; cue: string; frequency: BotPowerFrequency }
  | {
      /** Bounded permission to seize an eligible live speaking opening. */
      type: "interruption";
      frequency: BotPowerFrequency;
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
      /** An authored hard rule: every eligible opening is taken, with timing chosen by the mode. */
      certainty?: "always";
    }
  | {
      /** Bounded response effort. Hard minimal/brief budgets cap prose sentences. */
      type: "response_budget";
      mode: BotPowerResponseBudgetMode;
      enforcement: BotPowerEnforcement;
    }
  | {
      type: "turn_gravity";
      direction: BotPowerGravityDirection;
      strength: BotPowerStrength;
    }
  | {
      type: "response_bond";
      direction: BotPowerBondDirection;
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
    }
  | {
      type: "topic_gravity";
      direction: BotPowerTopicDirection;
      strength: BotPowerStrength;
      topics: string[];
    }
  | {
      type: "selective_memory";
      mode: BotPowerMemoryMode;
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
    }
  | {
      type: "insight";
      strength: BotPowerStrength;
      targets: BotPowerTargetV1[];
    };

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
  powerNames?: string[];
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

function normalizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const topics: string[] = [];
  for (const item of value) {
    const topic = compactText(item, 60).toLowerCase();
    if (!topic || topics.includes(topic)) continue;
    topics.push(topic);
    if (topics.length >= 6) break;
  }
  return topics;
}

export function normalizeBotPowerEffectV1(value: unknown): BotPowerEffectV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const effect = value as Record<string, unknown>;
  if (effect.type === "mute") return { type: "mute" };
  if (effect.type === "eternal_introduction") {
    // Upgrade legacy `current_turn_only` archives at the shared boundary.
    return { type: "eternal_introduction", memory: "rolling_public_tail_1_to_4" };
  }
  if (effect.type === "speech_copy") {
    return { type: "speech_copy", trigger: "direct_address" };
  }
  if (effect.type === "identity_mirror") {
    return { type: "identity_mirror", trigger: "direct_bot_address" };
  }
  if (effect.type === "hearing_repeat") {
    return {
      type: "hearing_repeat",
      frequency: effect.frequency === "frequent" ? "frequent" : "occasional",
      moodPenalty: normalizeStrength(effect.moodPenalty),
    };
  }
  if (effect.type === "awareness" || effect.type === "speech_audience") {
    return { type: effect.type, allowed: normalizeTargets(effect.allowed) };
  }
  if (effect.type === "avatar_visibility") {
    return { type: "avatar_visibility", mode: "speaking_only" };
  }
  if (
    effect.type === "avatar_scale" &&
    (effect.mode === "larger" || effect.mode === "smaller")
  ) {
    return { type: "avatar_scale", mode: effect.mode };
  }
  if (
    effect.type === "voice_presence" &&
    (effect.mode === "loud" || effect.mode === "quiet")
  ) {
    return { type: "voice_presence", mode: effect.mode };
  }
  if (effect.type === "speech_obfuscation") {
    return { type: "speech_obfuscation", mode: "gibberish" };
  }
  if (effect.type === "intermittent_mute") {
    return {
      type: "intermittent_mute",
      chance: "half",
      moodPenalty: normalizeStrength(effect.moodPenalty),
    };
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
  if (effect.type === "mood_boost") {
    return {
      type: "mood_boost",
      trigger: "after_spoken_turn",
      recipients: "addressed",
      strength: normalizeStrength(effect.strength),
      ...(effect.whenTheme === "light" || effect.whenTheme === "dark"
        ? { whenTheme: effect.whenTheme }
        : {}),
    };
  }
  if (effect.type === "mood_drain") {
    return {
      type: "mood_drain",
      trigger: "after_direct_address",
      recipient: "addresser",
      strength: normalizeStrength(effect.strength),
      ...(effect.whenTheme === "light" || effect.whenTheme === "dark"
        ? { whenTheme: effect.whenTheme }
        : {}),
    };
  }
  if (effect.type === "candor") {
    return {
      type: "candor",
      strength: normalizeStrength(effect.strength),
      targets: normalizeTargets(effect.targets),
    };
  }
  if (effect.type === "addressed_fandom") {
    return {
      type: "addressed_fandom",
      strength: normalizeStrength(effect.strength),
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
      rate:
        effect.rate === "none" ||
        effect.rate === "slow" ||
        effect.rate === "very_fast"
          ? effect.rate
          : "fast",
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
  if (effect.type === "interruption") {
    const targets = normalizeTargets(effect.targets);
    return {
      type: "interruption",
      frequency: effect.frequency === "frequent" ? "frequent" : "occasional",
      strength: normalizeStrength(effect.strength),
      targets: targets.length > 0 ? targets : [{ kind: "all" }],
      ...(effect.certainty === "always" ? { certainty: "always" as const } : {}),
    };
  }
  if (effect.type === "response_budget") {
    return {
      type: "response_budget",
      mode:
        effect.mode === "minimal" || effect.mode === "expansive"
          ? effect.mode
          : "brief",
      enforcement: effect.enforcement === "hard" ? "hard" : "soft",
    };
  }
  if (effect.type === "turn_gravity") {
    return {
      type: "turn_gravity",
      direction: effect.direction === "less" ? "less" : "more",
      strength: normalizeStrength(effect.strength),
    };
  }
  if (effect.type === "response_bond") {
    return {
      type: "response_bond",
      direction: effect.direction === "away" ? "away" : "toward",
      strength: normalizeStrength(effect.strength),
      targets: normalizeTargets(effect.targets),
    };
  }
  if (effect.type === "topic_gravity") {
    const topics = normalizeTopics(effect.topics);
    if (topics.length === 0) return null;
    return {
      type: "topic_gravity",
      direction: effect.direction === "away" ? "away" : "toward",
      strength: normalizeStrength(effect.strength),
      topics,
    };
  }
  if (effect.type === "selective_memory") {
    return {
      type: "selective_memory",
      mode: effect.mode === "forget" ? "forget" : "remember",
      strength: normalizeStrength(effect.strength),
      targets: normalizeTargets(effect.targets),
    };
  }
  if (effect.type === "insight") {
    return {
      type: "insight",
      strength: normalizeStrength(effect.strength),
      targets: normalizeTargets(effect.targets),
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

/**
 * Recognizes explicit hard-mute contracts without relying on compiled effects.
 * Older Ready Powers can have valid cues and labels but an empty effects array.
 */
export function botPowerDefinitionIsExplicitMuteV1(
  nameValue: unknown,
  intentValue: unknown,
): boolean {
  const name = compactText(nameValue, BOT_POWER_NAME_MAX_LENGTH).toLowerCase();
  const intent = compactText(intentValue, BOT_POWER_INTENT_MAX_LENGTH)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  return /^(?:mute|muted|silence)$/u.test(name) || [
    /\b(?:is|becomes?|remains?|render(?:ed)?|make|makes)\s+(?:completely\s+|fully\s+)?muted\b/u,
    /\bmuted?\s+(?:bot|voice|speech)\b/u,
    /\bmutes?\s+(?:this|the)\s+bot\b/u,
    /\b(?:can(?:not|'t)|never|does\s+not|doesn't)\s+(?:speak|talk|say\s+anything|make\s+a\s+sound)\b/u,
    /\bvoice\s+(?:can(?:not|'t)|will\s+never|is\s+never)\s+be\s+heard\b/u,
    /\bonly\s+(?:responds?|replies?)\s+(?:with|in)\s+(?:an?\s+)?(?:ellipsis|\.\.\.)(?:\s|$)/u,
  ].some((pattern) => pattern.test(intent));
}

/** Recognizes an active tendency to cut into live speech, not merely reactions to being interrupted. */
export function botPowerDefinitionIsExplicitInterruptionV1(
  nameValue: unknown,
  intentValue: unknown,
): boolean {
  const name = compactText(nameValue, BOT_POWER_NAME_MAX_LENGTH)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compactText(intentValue, BOT_POWER_INTENT_MAX_LENGTH)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  if (/^(?:interrupt(?:er|ing)?|interject(?:or|ing)?)\b/u.test(name)) return true;
  if (
    /\b(?:when|after|if)\s+(?:they(?:'re| are)|this bot is|the bot is)?\s*interrupted\b|\b(?:hates?|dislikes?|fears?|resists?)\s+being\s+interrupted\b|\b(?:cannot|can't|never)\s+be\s+interrupted\b/u.test(
      intent,
    )
  ) {
    return false;
  }
  return [
    /\b(?:interrupts?|interjects?)\s+(?:others?|people|bots?|speakers?|whoever|anyone|conversations?)\b/u,
    /\b(?:cuts?|jumps?|butts?|breaks?)\s+in\b/u,
    /\b(?:cuts?|jumps?)\s+into\s+(?:live\s+)?(?:openings?|speech|answers?|turns?)\b/u,
    /\b(?:talks?|speaks?)\s+over\s+(?:others?|people|bots?|speakers?|whoever|anyone)\b/u,
  ].some((pattern) => pattern.test(intent));
}

/** Recognizes interruption wording that promises every valid opening, not a probability. */
export function botPowerDefinitionIsUnconditionalInterruptionV1(
  nameValue: unknown,
  intentValue: unknown,
): boolean {
  if (!botPowerDefinitionIsExplicitInterruptionV1(nameValue, intentValue)) {
    return false;
  }
  const intent = compactText(intentValue, BOT_POWER_INTENT_MAX_LENGTH)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  return [
    /\bwhenever\s+possible\b/u,
    /\b(?:every|each)\s+(?:possible\s+)?(?:opening|opportunity|turn|time)\b/u,
    /\bat\s+every\s+(?:opening|opportunity)\b/u,
    /\b(?:always|constantly|invariably)\b[\s\S]{0,80}\b(?:interrupts?|interjects?|cuts?\s+in|jumps?\s+in|talks?\s+over)\b/u,
    /\b(?:interrupts?|interjects?|cuts?\s+in|jumps?\s+in|talks?\s+over)\b[\s\S]{0,80}\b(?:always|constantly|every\s+time)\b/u,
    /\b100\s*(?:%|percent)\b/u,
  ].some((pattern) => pattern.test(intent));
}

export interface BotPowerInterruptionMatchV1 {
  powerId: string;
  powerName: string;
  frequency: BotPowerFrequency;
  strength: BotPowerStrength;
  targets: BotPowerTargetV1[];
  certainty: "always" | "probabilistic";
}

/**
 * Returns the strongest matching live-interruption contract.
 * Older Ready Powers are recovered from authored intent plus their Coffee-era
 * action/turn effects so saved characters gain the primitive without recompiling.
 */
export function strongestBotPowerInterruptionEffectV1(
  value: unknown,
  matchesTarget: (target: BotPowerTargetV1) => boolean,
): BotPowerInterruptionMatchV1 | null {
  const frequencyRank: Record<BotPowerFrequency, number> = {
    occasional: 1,
    frequent: 2,
  };
  const strengthRank: Record<BotPowerStrength, number> = {
    small: 1,
    medium: 2,
    large: 3,
  };
  const strengthValues: BotPowerStrength[] = ["small", "medium", "large"];
  const candidates = activeBotPowersV1(value).flatMap((power) => {
    const effects = power.compiled?.effects ?? [];
    const authored = effects.filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "interruption" }> =>
        effect.type === "interruption",
    );
    const recovered =
      authored.length === 0 &&
      botPowerDefinitionIsExplicitInterruptionV1(power.name, power.intent)
        ? [{
            type: "interruption" as const,
            frequency: effects.some(
              (effect) =>
                effect.type === "action_bias" && effect.frequency === "frequent",
            ) || /\b(?:aggressively|always|constantly|frequently|often|whenever\s+possible)\b/iu.test(power.intent)
              ? "frequent" as const
              : "occasional" as const,
            strength: effects.reduce<BotPowerStrength>((strongest, effect) => {
              if (
                (effect.type === "turn_gravity" && effect.direction === "more") ||
                (effect.type === "response_bond" && effect.direction === "toward")
              ) {
                return strengthRank[effect.strength] > strengthRank[strongest]
                  ? effect.strength
                  : strongest;
              }
              return strongest;
            }, /\b(?:aggressively|forcefully|always|constantly)\b/iu.test(power.intent)
              ? "large"
              : "medium"),
            certainty: botPowerDefinitionIsUnconditionalInterruptionV1(
              power.name,
              power.intent,
            )
              ? "always" as const
              : undefined,
            targets: effects.flatMap((effect) =>
              effect.type === "response_bond" && effect.direction === "toward"
                ? effect.targets
                : [],
            ).filter(
              (target, index, all) =>
                all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(target)) === index,
            ),
          }]
        : [];
    return [...authored, ...recovered].flatMap((effect) => {
      const targets = effect.targets.length > 0
        ? effect.targets
        : [{ kind: "all" as const }];
      if (!targets.some(matchesTarget)) return [];
      return [{
        powerId: power.id,
        powerName: power.name || "Power",
        frequency: effect.frequency,
        strength: strengthValues.includes(effect.strength)
          ? effect.strength
          : "medium",
        targets,
        certainty:
          effect.certainty === "always" ||
          botPowerDefinitionIsUnconditionalInterruptionV1(power.name, power.intent)
            ? "always" as const
            : "probabilistic" as const,
      }];
    });
  });
  return candidates.reduce<BotPowerInterruptionMatchV1 | null>(
    (strongest, candidate) => {
      if (!strongest) return candidate;
      if (candidate.certainty !== strongest.certainty) {
        return candidate.certainty === "always" ? candidate : strongest;
      }
      const frequencyDelta =
        frequencyRank[candidate.frequency] - frequencyRank[strongest.frequency];
      if (frequencyDelta > 0) return candidate;
      if (
        frequencyDelta === 0 &&
        strengthRank[candidate.strength] > strengthRank[strongest.strength]
      ) {
        return candidate;
      }
      return strongest;
    },
    null,
  );
}

/**
 * Returns the effective runtime effects for Ready Powers.
 *
 * A small number of legacy Ready mute Powers were stored with strong authored
 * silence language but an empty compiled effects array. Recover that one hard
 * invariant here so every runtime adapter sees the same absolute mute instead
 * of having to remember a mode-specific compatibility check.
 */
export function activeBotPowerEffectsV1(value: unknown): BotPowerEffectV1[] {
  return activeBotPowersV1(value).flatMap((power) => {
    const effects = power.compiled?.effects ?? [];
    return botPowerDefinitionIsExplicitMuteV1(power.name, power.intent) &&
      !effects.some((effect) => effect.type === "mute")
      ? [{ type: "mute" as const }, ...effects]
      : effects;
  });
}

/** Ready, enabled holder contract for direct bot-to-bot identity mirroring. */
export function botPowerMirrorsIdentityV1(value: unknown): boolean {
  return activeBotPowerEffectsV1(value).some(
    (effect) =>
      effect.type === "identity_mirror" &&
      effect.trigger === "direct_bot_address",
  );
}

export function botPowerIsMutedV1(value: unknown): boolean {
  return activeBotPowerEffectsV1(value).some((effect) => effect.type === "mute");
}

/** A Ready short-term-amnesia Power whose holder receives no older continuity. */
export function botPowerEternallyIntroducesFromEffectsV1(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(
    (effect) =>
      normalizeBotPowerEffectV1(effect)?.type === "eternal_introduction",
  );
}

export function botPowerEternallyIntroducesV1(value: unknown): boolean {
  return botPowerEternallyIntroducesFromEffectsV1(
    activeBotPowerEffectsV1(value),
  );
}

/** Loud wins a contradictory loud/quiet stack because it is the explicit override. */
export function botPowerVoicePresenceModeFromEffectsV1(
  value: unknown,
): BotPowerVoicePresenceMode | null {
  if (!Array.isArray(value)) return null;
  const modes = value
    .map(normalizeBotPowerEffectV1)
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "voice_presence" }> =>
        effect?.type === "voice_presence",
    )
    .map((effect) => effect.mode);
  if (modes.includes("loud")) return "loud";
  return modes.includes("quiet") ? "quiet" : null;
}

export function botPowerVoicePresenceModeV1(
  value: unknown,
): BotPowerVoicePresenceMode | null {
  return botPowerVoicePresenceModeFromEffectsV1(activeBotPowerEffectsV1(value));
}

/** Returns the non-adjustable Power trim layered after account and bot settings. */
export function botPowerVoiceGainMultiplierV1(value: unknown): number {
  const mode = botPowerVoicePresenceModeV1(value);
  return mode === "loud"
    ? BOT_POWER_LOUD_VOICE_GAIN_MULTIPLIER_V1
    : mode === "quiet"
      ? BOT_POWER_QUIET_VOICE_GAIN_MULTIPLIER_V1
      : 1;
}

export function botPowerVoiceGainMultiplierFromEffectsV1(value: unknown): number {
  const mode = botPowerVoicePresenceModeFromEffectsV1(value);
  return mode === "loud"
    ? BOT_POWER_LOUD_VOICE_GAIN_MULTIPLIER_V1
    : mode === "quiet"
      ? BOT_POWER_QUIET_VOICE_GAIN_MULTIPLIER_V1
      : 1;
}

/** Returns the matching restrained text scale for spoken bot prose. */
export function botPowerTextScaleV1(value: unknown): number {
  const mode = botPowerVoicePresenceModeV1(value);
  return mode === "loud"
    ? BOT_POWER_LOUD_TEXT_SCALE_V1
    : mode === "quiet"
      ? BOT_POWER_QUIET_TEXT_SCALE_V1
      : 1;
}

export function botPowerTextScaleFromEffectsV1(value: unknown): number {
  const mode = botPowerVoicePresenceModeFromEffectsV1(value);
  return mode === "loud"
    ? BOT_POWER_LOUD_TEXT_SCALE_V1
    : mode === "quiet"
      ? BOT_POWER_QUIET_TEXT_SCALE_V1
      : 1;
}

export function botPowerIntermittentMuteEffectFromEffectsV1(
  value: unknown,
): Extract<BotPowerEffectV1, { type: "intermittent_mute" }> | null {
  if (!Array.isArray(value)) return null;
  return value
    .map(normalizeBotPowerEffectV1)
    .find(
      (effect): effect is Extract<BotPowerEffectV1, { type: "intermittent_mute" }> =>
        effect?.type === "intermittent_mute",
    ) ?? null;
}

export function botPowerIntermittentMuteEffectV1(
  value: unknown,
): Extract<BotPowerEffectV1, { type: "intermittent_mute" }> | null {
  return botPowerIntermittentMuteEffectFromEffectsV1(
    activeBotPowerEffectsV1(value),
  );
}

/** Stable 50/50 coin used by persisted/replayable Power outcomes. */
export function botPowerDeterministicHalfChanceV1(seedValue: unknown): boolean {
  const seed = typeof seedValue === "string" ? seedValue : String(seedValue ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash & 1) === 0;
}

/** Replay-stable one-to-four-message perception window for short-term amnesia. */
export function botPowerForgetfulContextMessageCountV1(
  seedValue: unknown,
): number {
  const seed = typeof seedValue === "string" ? seedValue : String(seedValue ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const span =
    BOT_POWER_FORGETFUL_CONTEXT_MAX_MESSAGES_V1 -
    BOT_POWER_FORGETFUL_CONTEXT_MIN_MESSAGES_V1 +
    1;
  return BOT_POWER_FORGETFUL_CONTEXT_MIN_MESSAGES_V1 + (hash % span);
}

/** Prior portion of the window when the current message is supplied separately. */
export function botPowerForgetfulPriorMessagesV1<T>(
  history: readonly T[],
  stableTurnKey: unknown,
): T[] {
  const priorCount = Math.max(
    0,
    botPowerForgetfulContextMessageCountV1(stableTurnKey) - 1,
  );
  return priorCount === 0 ? [] : history.slice(-priorCount);
}

export function botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1(
  value: unknown,
  stableTurnKey: string,
): boolean {
  return Boolean(botPowerIntermittentMuteEffectFromEffectsV1(value)) &&
    botPowerDeterministicHalfChanceV1(`intermittent-mute:${stableTurnKey}`);
}

export function botPowerIntermittentMuteTurnIsIgnoredV1(
  value: unknown,
  stableTurnKey: string,
): boolean {
  return botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1(
    activeBotPowerEffectsV1(value),
    stableTurnKey,
  );
}

export function botPowerCopiesAddressedSpeechV1(value: unknown): boolean {
  return activeBotPowerEffectsV1(value).some(
    (effect) =>
      effect.type === "speech_copy" && effect.trigger === "direct_address",
  );
}

/** Compatibility name for the exact addressed-speech echo runtime. */
export const botPowerEchoesAddressedSpeechV1 =
  botPowerCopiesAddressedSpeechV1;

export function botPowerMumblesSpeechFromEffectsV1(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(
    (effect) =>
      normalizeBotPowerEffectV1(effect)?.type === "speech_obfuscation",
  );
}

export function botPowerMumblesSpeechV1(value: unknown): boolean {
  return botPowerMumblesSpeechFromEffectsV1(activeBotPowerEffectsV1(value));
}

/** A Ready Power that makes a live avatar appear only during an utterance. */
export function botPowerHasSpeakingOnlyAvatarVisibilityV1(value: unknown): boolean {
  const effects = activeBotPowerEffectsV1(value);
  if (botPowerVoicePresenceModeFromEffectsV1(effects) === "loud") return false;
  return effects.some(
    (effect) =>
      effect.type === "avatar_visibility" && effect.mode === "speaking_only",
  );
}

export function botPowerHasSpeakingOnlyAvatarVisibilityFromEffectsV1(
  value: unknown,
): boolean {
  if (!Array.isArray(value)) return false;
  const effects = value
    .map(normalizeBotPowerEffectV1)
    .filter((effect): effect is BotPowerEffectV1 => effect !== null);
  if (botPowerVoicePresenceModeFromEffectsV1(effects) === "loud") return false;
  return effects.some(
    (effect) =>
      effect.type === "avatar_visibility" && effect.mode === "speaking_only",
  );
}

/**
 * Resolves relative avatar size with the safer smaller presentation winning
 * contradictory effects so multiple Ready Powers cannot compound or overflow.
 */
export function botPowerAvatarScaleModeFromEffectsV1(
  value: unknown,
): BotPowerAvatarScaleMode | null {
  if (!Array.isArray(value)) return null;
  const modes = value
    .map(normalizeBotPowerEffectV1)
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "avatar_scale" }> =>
        effect?.type === "avatar_scale",
    )
    .map((effect) => effect.mode);
  const loudOverride = botPowerVoicePresenceModeFromEffectsV1(value) === "loud";
  if (modes.includes("smaller") && !loudOverride) return "smaller";
  return modes.includes("larger") ? "larger" : null;
}

/** Returns the effective relative avatar size from enabled Ready Powers. */
export function botPowerAvatarScaleModeV1(
  value: unknown,
): BotPowerAvatarScaleMode | null {
  return botPowerAvatarScaleModeFromEffectsV1(activeBotPowerEffectsV1(value));
}

export type BotPowerResponseBudgetEffectV1 = Extract<
  BotPowerEffectV1,
  { type: "response_budget" }
>;

const BOT_POWER_RESPONSE_BUDGET_RANK_V1: Record<BotPowerResponseBudgetMode, number> = {
  minimal: 0,
  brief: 1,
  expansive: 2,
};

/** Returns the strongest authored brevity tendency, with hard winning ties. */
export function strongestBotPowerResponseBudgetEffectV1(
  value: unknown,
): BotPowerResponseBudgetEffectV1 | null {
  return activeBotPowerEffectsV1(value)
    .filter(
      (effect): effect is BotPowerResponseBudgetEffectV1 =>
        effect.type === "response_budget",
    )
    .reduce<BotPowerResponseBudgetEffectV1 | null>((strongest, effect) => {
      if (!strongest) return effect;
      const nextRank = BOT_POWER_RESPONSE_BUDGET_RANK_V1[effect.mode];
      const currentRank = BOT_POWER_RESPONSE_BUDGET_RANK_V1[strongest.mode];
      if (nextRank < currentRank) return effect;
      if (
        nextRank === currentRank &&
        effect.enforcement === "hard" &&
        strongest.enforcement !== "hard"
      ) {
        return effect;
      }
      return strongest;
    }, null);
}

/** Returns the strongest hard maximum; expansive never forces filler. */
export function strongestHardBotPowerResponseBudgetEffectV1(
  value: unknown,
): BotPowerResponseBudgetEffectV1 | null {
  return activeBotPowerEffectsV1(value)
    .filter(
      (effect): effect is BotPowerResponseBudgetEffectV1 =>
        effect.type === "response_budget" &&
        effect.enforcement === "hard" &&
        effect.mode !== "expansive",
    )
    .reduce<BotPowerResponseBudgetEffectV1 | null>((strongest, effect) => {
      if (!strongest) return effect;
      return BOT_POWER_RESPONSE_BUDGET_RANK_V1[effect.mode] <
        BOT_POWER_RESPONSE_BUDGET_RANK_V1[strongest.mode]
        ? effect
        : strongest;
    }, null);
}

interface BotPowerActionBlockV1 {
  start: number;
  end: number;
  text: string;
}

function botPowerActionBlocksV1(value: string): BotPowerActionBlockV1[] {
  const actions: BotPowerActionBlockV1[] = [];
  for (let index = 0; index < value.length && actions.length < 6; index += 1) {
    if (
      value[index] !== "*" ||
      value[index - 1] === "*" ||
      value[index + 1] === "*"
    ) continue;
    const closing = value.indexOf("*", index + 1);
    if (
      closing < 0 ||
      value[closing + 1] === "*" ||
      value.slice(index + 1, closing).includes("\n")
    ) continue;
    const text = compactText(value.slice(index + 1, closing), 120);
    if (text) actions.push({ start: index, end: closing + 1, text });
    index = closing;
  }
  return actions;
}

const BOT_POWER_PHYSICAL_ACTION_V1_RE =
  /^(?:(?:quietly|slowly|slightly|briefly|deliberately|visibly|wordlessly)\s+)*(?:(?:i|he|she|they)\s+)?(?:nod|shake|lean|smile|grin|frown|look|glance|gaze|stare|shrug|gesture|point|raise|lower|shift|sit|stand|turn|tilt|fold|cross|uncross|tap|drum|blink|squint|narrow|widen|close|open|reach|pull|push|place|set|move|step|walk|leave|meet|hold|drop|lift|clench|relax|breathe|inhale|exhale|sigh|laugh|chuckle|cough|clear|sip|drink)\w*\b|^(?:(?:slight|faint|brief|small)\s+)?(?:smile|nod|shrug|frown)\b|^(?:eyes?|gaze|mouth|lips?|hands?|arms?|shoulders?|head|posture|expression)\b/iu;

function botPowerActionLooksPhysicalV1(value: string): boolean {
  return BOT_POWER_PHYSICAL_ACTION_V1_RE.test(value);
}

function botPowerResponseLooksStructuredV1(value: string): boolean {
  return (
    /```|~~~|(?:^|\n)\s*(?:[-+]|\d+[.)])\s+|(?:^|\n)\s*\|.+\|\s*(?:\n|$)/u.test(value) ||
    /(?:^|\n)\s*[\[{][\s\S]*[\]}]\s*$/u.test(value)
  );
}

function botPowerFirstSentencesV1(value: string, limit: number): string {
  const sentences =
    value.match(/[^.!?…]+(?:[.!?…]+(?:["'”’\)\]]*)|$)/gu) ?? [];
  if (sentences.length <= limit) return value.trim();
  return sentences.slice(0, limit).join("").trim();
}

/**
 * Enforces hard minimal/brief prose budgets without cutting through a sentence.
 * Structured answers remain intact because code, lists, and JSON are content
 * obligations rather than conversational elaboration.
 */
export function applyBotPowerResponseBudgetV1(
  value: unknown,
  effect: BotPowerResponseBudgetEffectV1 | null | undefined,
  maxSentences: number,
): string {
  const source = typeof value === "string" ? value.trim() : "";
  if (
    !source ||
    !effect ||
    effect.enforcement !== "hard" ||
    effect.mode === "expansive" ||
    botPowerResponseLooksStructuredV1(source)
  ) {
    return source;
  }
  const actions = botPowerActionBlocksV1(source);
  let protectedSource = source;
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    protectedSource = `${protectedSource.slice(0, action.start)}\uE000${index}\uE001${protectedSource.slice(action.end)}`;
  }
  const bounded = botPowerFirstSentencesV1(
    protectedSource,
    Math.max(1, Math.floor(maxSentences)),
  );
  return bounded
    .replace(/\uE000(\d+)\uE001/gu, (_match, rawIndex: string) => {
      const action = actions[Number(rawIndex)];
      return action ? `*${action.text}*` : "";
    })
    .replace(/\s+/gu, " ")
    .trim();
}

/** Extracts only concise physical actions that a hard-muted bot can perform. */
export function botPowerMuteActionTextsV1(value: unknown): string[] {
  const source = typeof value === "string" ? value : "";
  return botPowerActionBlocksV1(source)
    .filter(({ text }) => botPowerActionLooksPhysicalV1(text))
    .map(({ text }) => text);
}

/** Enforces a hard mute while preserving concise, non-spoken `*actions*`. */
export function applyBotPowerMuteResponseV1(value: unknown): string {
  const actions = botPowerMuteActionTextsV1(value).map(
    (text) => `*${text}*`,
  );
  return [...actions, BOT_POWER_CANONICAL_SILENCE_V1].join(" ");
}

function botPowerIntroductionNameV1(value: unknown): string {
  const name = compactText(value, 80).replace(/[\r\n]+/gu, " ");
  return name || "your new companion";
}

function botPowerEscapeRegExpV1(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** True only for a short self-introduction with no continuity claim or return question. */
export function botPowerResponseIsFirstIntroductionV1(
  value: unknown,
  botName: unknown,
): boolean {
  if (typeof value !== "string") return false;
  const source = value.replace(/\s+/gu, " ").trim();
  const name = botPowerIntroductionNameV1(botName);
  if (!source || source.includes("?")) return false;
  if (
    /\b(?:again|as I (?:said|mentioned)|earlier|previously|last time|remember|we (?:already|were)|you (?:already|still) know me)\b/iu.test(
      source,
    )
  ) {
    return false;
  }
  const escapedName = botPowerEscapeRegExpV1(name);
  const explicitSelfIntroduction = new RegExp(
    `\\b(?:i am|i['’]m|my name is|call me)\\s+${escapedName}(?:\\b|$)`,
    "iu",
  );
  const greetingIntroduction = new RegExp(
    `\\b(?:hello|hi|hey|greetings|nice to meet you|pleased to meet you|let me introduce myself)\\b[\\s\\S]{0,120}\\b${escapedName}(?:\\b|$)`,
    "iu",
  );
  return explicitSelfIntroduction.test(source) || greetingIntroduction.test(source);
}

/**
 * Preserves a natural locally grounded reply while blocking claims of an
 * established relationship. Context-specific fallbacks keep a stale compiled
 * introduction cue from turning immediate anger into another canned greeting.
 */
export function applyBotPowerEternalIntroductionResponseV1(
  value: unknown,
  botName: unknown,
  currentInput?: unknown,
): string {
  const name = botPowerIntroductionNameV1(botName);
  const source = typeof value === "string" ? value.trim() : "";
  const input = typeof currentInput === "string" ? currentInput.trim() : "";
  const claimsEstablishedRelationship =
    /\b(?:as I (?:said|mentioned) (?:earlier|previously|last time)|we (?:discussed|talked about) (?:earlier|before|last time)|we(?:'ve| have) (?:known each other|been (?:friends|together))|our (?:friendship|relationship|shared history)|after all (?:these|those) years|remember when we|as your (?:old|longtime) friend)\b/iu.test(
      source,
    );
  const repetitionComplaint =
    /\b(?:again|already (?:said|told|introduced)|keep (?:saying|repeating|introducing)|repeating yourself|introduced yourself|why are you introducing)\b/iu.test(
      input,
    );
  const immediateUpset =
    /\b(?:angry|annoyed|frustrated|furious|irritated|mad|upset|god+dam+\w*|damn(?:it)?|fuck|shit)\b/iu.test(
      input,
    );
  const cannedIntroductionAgainstComplaint =
    botPowerResponseIsFirstIntroductionV1(source, name) &&
    (repetitionComplaint || immediateUpset);
  const explainsUnseenAmnesiaOrRepetition =
    /\b(?:introduc(?:e|ed|ing) myself (?:again|(?:a |several )?few times|multiple times|repeatedly|already)|every time we meet|habit of mine|brain[^.!?]{0,40}catch(?:ing)? up|what(?:'s| is) my name again|I (?:keep|always) introduc|I did it again|short[- ]term (?:memory|amnesia)|memory (?:loss|problem))\b/iu.test(
      source,
    );

  if (
    source &&
    !claimsEstablishedRelationship &&
    !cannedIntroductionAgainstComplaint &&
    !(repetitionComplaint && explainsUnseenAmnesiaOrRepetition)
  ) {
    return source;
  }
  if (repetitionComplaint) {
    return "What do you mean? I don't think we've met yet.";
  }
  if (immediateUpset) {
    return "What's the matter? Sorry, I'm not sure what's wrong.";
  }
  if (claimsEstablishedRelationship) {
    return "I'm sorry, but I don't think we've met before.";
  }
  return `Hello—I'm ${name}. It's nice to meet you.`;
}

/** Repeats addressed speech verbatim, or remains canonically silent when none exists. */
export function applyBotPowerAddressedCopyResponseV1(
  addressedSpeech: unknown,
): string {
  return typeof addressedSpeech === "string" && addressedSpeech.length > 0
    ? addressedSpeech
    : BOT_POWER_CANONICAL_SILENCE_V1;
}

/** Compatibility name for existing Copycat mode adapters. */
export const applyBotPowerEchoResponseV1 =
  applyBotPowerAddressedCopyResponseV1;

const BOT_POWER_MUMBLE_ONSETS_V1 = [
  "m", "n", "b", "d", "g", "r", "w", "y", "bl", "br", "gr", "mm", "ng",
] as const;
const BOT_POWER_MUMBLE_NUCLEI_V1 = ["uh", "ah", "oo", "eh", "ih"] as const;
const BOT_POWER_MUMBLE_CODAS_V1 = ["m", "n", "b", "g", "sh", "rr", "ff", ""] as const;

function botPowerMumbleHashV1(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function botPowerMumbleWordV1(source: string, wordIndex: number): string {
  const letters = source.replace(/[^\p{L}\p{N}]/gu, "");
  const syllableCount = letters.length <= 3 ? 1 : letters.length <= 7 ? 2 : 3;
  let word = "";
  for (let syllableIndex = 0; syllableIndex < syllableCount; syllableIndex += 1) {
    const hash = botPowerMumbleHashV1(
      `${wordIndex}:${syllableIndex}:${source.toLocaleLowerCase()}`,
    );
    word += BOT_POWER_MUMBLE_ONSETS_V1[hash % BOT_POWER_MUMBLE_ONSETS_V1.length];
    word += BOT_POWER_MUMBLE_NUCLEI_V1[(hash >>> 7) % BOT_POWER_MUMBLE_NUCLEI_V1.length];
    word += BOT_POWER_MUMBLE_CODAS_V1[(hash >>> 14) % BOT_POWER_MUMBLE_CODAS_V1.length];
  }
  if (word.toLocaleLowerCase() === source.toLocaleLowerCase()) word += "m";
  return /^\p{Lu}/u.test(source)
    ? `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`
    : word;
}

/**
 * Obscures public speech after the holder has authored a coherent intended line.
 * Physical actions remain observable; mentions are flattened before every spoken
 * word is replaced so neither transcript context nor voice synthesis leaks intent.
 */
export function applyBotPowerMumbledResponseV1(value: unknown): string {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source || botPowerResponseIsSilentV1(source)) return BOT_POWER_CANONICAL_SILENCE_V1;
  const actions = botPowerActionBlocksV1(source).filter(({ text }) =>
    botPowerActionLooksPhysicalV1(text)
  );
  let protectedSource = source;
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    const placeholder = `\uE100${"\uE102".repeat(index + 1)}\uE101`;
    protectedSource = `${protectedSource.slice(0, action.start)}${placeholder}${protectedSource.slice(action.end)}`;
  }
  protectedSource = protectedSource.replace(
    /\[([^\]\n]{1,100})\]\(prism-bot:\/\/[^)\s]+\)/gu,
    "$1",
  );
  let wordIndex = 0;
  const obscured = protectedSource.replace(
    /[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu,
    (word) => botPowerMumbleWordV1(word, wordIndex++),
  );
  const restored = obscured
    .replace(/\uE100(\uE102+)\uE101/gu, (_match, encodedIndex: string) => {
      const action = actions[encodedIndex.length - 1];
      return action ? `*${action.text}*` : "";
    })
    .replace(/[ \t]+/gu, " ")
    .trim();
  return wordIndex > 0 ? restored : "Mrruh.";
}

/** True only for the canonical silent response, optionally preceded by actions. */
export function botPowerResponseIsSilentV1(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const actions = botPowerActionBlocksV1(value);
  let remaining = "";
  let cursor = 0;
  for (const action of actions) {
    remaining += value.slice(cursor, action.start);
    cursor = action.end;
  }
  remaining += value.slice(cursor);
  return remaining.replace(/\s+/gu, "") === "...";
}

export function botPowerSelfCueLinesV1(value: unknown): string[] {
  return activeBotPowersV1(value).flatMap((power) => {
    if (
      power.compiled?.effects.some(
        (effect) => effect.type === "eternal_introduction",
      )
    ) {
      return [
        `${power.name || "Short-term amnesia"}: HARD MEMORY CONTRACT: respond naturally to only the one-to-four public messages provided for this turn. Treat people as unfamiliar unless those visible messages establish otherwise. Never claim an older relationship, recall hidden history, or mention the memory rule. A self-introduction is optional and should happen only when the immediate conversation warrants one.`,
      ];
    }
    const cue = power.compiled?.selfCue.trim();
    const fallback =
      power.compiled?.ruleLabels.find((label) => label.trim()) ||
      power.intent.trim();
    const instruction = cue || fallback;
    return instruction ? [`${power.name || "Power"}: ${instruction}`] : [];
  });
}

export function botPowerObserverCueLinesV1(
  botName: string,
  value: unknown
): string[] {
  const subject = compactText(botName, 100) || "This character";
  return activeBotPowersV1(value).flatMap((power) => {
    if (
      power.compiled?.effects.some(
        (effect) => effect.type === "eternal_introduction",
      )
    ) {
      return [
        `${subject} — ${power.name || "Short-term amnesia"}: ${subject} remembers only a shifting one-to-four-message public tail and has no older relationship context. Respond to that limited perception naturally; other characters retain the full encounter and may react through their own personalities.`,
      ];
    }
    const cue = power.compiled?.observerCue.trim();
    const fallback =
      power.compiled?.ruleLabels.find((label) => label.trim()) ||
      power.intent.trim();
    const instruction = cue || fallback;
    return instruction
      ? [`${subject} — ${power.name || "Power"}: ${instruction}`]
      : [];
  });
}

export function strongestBotPowerAddressedFandomEffectFromEffectsV1(
  value: unknown,
): Extract<BotPowerEffectV1, { type: "addressed_fandom" }> | null {
  const rank: Record<BotPowerStrength, number> = { small: 1, medium: 2, large: 3 };
  if (!Array.isArray(value)) return null;
  return value
    .map(normalizeBotPowerEffectV1)
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "addressed_fandom" }> =>
        effect?.type === "addressed_fandom",
    )
    .reduce<Extract<BotPowerEffectV1, { type: "addressed_fandom" }> | null>(
      (strongest, effect) =>
        !strongest || rank[effect.strength] > rank[strongest.strength]
          ? effect
          : strongest,
      null,
    );
}

export function strongestBotPowerAddressedFandomEffectV1(
  value: unknown,
): Extract<BotPowerEffectV1, { type: "addressed_fandom" }> | null {
  return strongestBotPowerAddressedFandomEffectFromEffectsV1(
    activeBotPowerEffectsV1(value),
  );
}

export function strongestBotPowerMoodBoostEffectFromEffectsV1(
  value: unknown,
  theme?: BotPowerResolvedThemeV1,
): Extract<BotPowerEffectV1, { type: "mood_boost" }> | null {
  const rank: Record<BotPowerStrength, number> = { small: 1, medium: 2, large: 3 };
  if (!Array.isArray(value)) return null;
  return value
    .map(normalizeBotPowerEffectV1)
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "mood_boost" }> =>
        effect?.type === "mood_boost" &&
        (effect.whenTheme === undefined || effect.whenTheme === theme),
    )
    .reduce<Extract<BotPowerEffectV1, { type: "mood_boost" }> | null>(
      (strongest, effect) =>
        !strongest || rank[effect.strength] > rank[strongest.strength]
          ? effect
          : strongest,
      null,
    );
}

export function strongestBotPowerMoodBoostEffectV1(
  value: unknown,
  theme?: BotPowerResolvedThemeV1,
): Extract<BotPowerEffectV1, { type: "mood_boost" }> | null {
  return strongestBotPowerMoodBoostEffectFromEffectsV1(
    activeBotPowerEffectsV1(value),
    theme,
  );
}

export function strongestBotPowerMoodDrainEffectFromEffectsV1(
  value: unknown,
  theme?: BotPowerResolvedThemeV1,
): Extract<BotPowerEffectV1, { type: "mood_drain" }> | null {
  const rank: Record<BotPowerStrength, number> = { small: 1, medium: 2, large: 3 };
  if (!Array.isArray(value)) return null;
  return value
    .map(normalizeBotPowerEffectV1)
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "mood_drain" }> =>
        effect?.type === "mood_drain" &&
        (effect.whenTheme === undefined || effect.whenTheme === theme),
    )
    .reduce<Extract<BotPowerEffectV1, { type: "mood_drain" }> | null>(
      (strongest, effect) =>
        !strongest || rank[effect.strength] > rank[strongest.strength]
          ? effect
          : strongest,
      null,
    );
}

export function strongestBotPowerMoodDrainEffectV1(
  value: unknown,
  theme?: BotPowerResolvedThemeV1,
): Extract<BotPowerEffectV1, { type: "mood_drain" }> | null {
  return strongestBotPowerMoodDrainEffectFromEffectsV1(
    activeBotPowerEffectsV1(value),
    theme,
  );
}

/**
 * Explicit current-phase cue for a theme-conditional Joy/Sad compound.
 * Ordinary unconditional mood effects return no extra cue.
 */
export function botPowerThemeMoodCueFromEffectsV1(
  value: unknown,
  theme?: BotPowerResolvedThemeV1,
): string | null {
  if (!theme || !Array.isArray(value)) return null;
  const effects = value
    .map(normalizeBotPowerEffectV1)
    .filter((effect): effect is BotPowerEffectV1 => effect !== null);
  if (
    !effects.some(
      (effect) =>
        (effect.type === "mood_boost" || effect.type === "mood_drain") &&
        effect.whenTheme !== undefined,
    )
  ) {
    return null;
  }
  const boost = strongestBotPowerMoodBoostEffectFromEffectsV1(effects, theme);
  const drain = strongestBotPowerMoodDrainEffectFromEffectsV1(effects, theme);
  const mode = theme === "light" ? "Light Mode" : "Dark Mode";
  if (boost && !drain) {
    return `Current resolved app theme: ${mode}. Only the radiant-joy branch is active now: be unmistakably joyful, with a visible flash of delighted energy or radiant warmth in this reply, and each completed spoken turn may give its addressed bot recipients one bounded ${boost.strength} uplift. A merely neutral or generically supportive response fails this branch. Preserve personality, agency, facts, disagreement, sadness, and serious stakes.`;
  }
  if (drain && !boost) {
    return `Current resolved app theme: ${mode}. Only the sad branch is active now: be noticeably gloomy, grouchy, or irritating, and only a bot that directly speaks to you may receive one bounded ${drain.strength} mood or motivation drop. Preserve personality, agency, facts, disagreement, hope, and serious stakes.`;
  }
  return `Current resolved app theme: ${mode}. Apply only Power effects whose whenTheme condition matches this theme.`;
}

export function botPowerThemeMoodCueV1(
  value: unknown,
  theme?: BotPowerResolvedThemeV1,
): string | null {
  return botPowerThemeMoodCueFromEffectsV1(activeBotPowerEffectsV1(value), theme);
}

function addressedFandomCueForEffectV1(
  effect: Extract<BotPowerEffectV1, { type: "addressed_fandom" }> | null,
  targetLabel: unknown,
  modeLabel: string,
): string | null {
  if (!effect) return null;
  const target = compactText(targetLabel, 60) || "whoever you are addressing";
  const mode = compactText(modeLabel, 40) || "Current reply";
  const pressure = effect.strength === "small"
    ? "eagerly admire"
    : effect.strength === "large"
      ? "obsessively idolize"
      : "strongly idolize";
  return `${mode} fandom: ${pressure} ${target} now. Freshly reveal delight, admiration, overinvestment, or starstruck focus; vary wording. Soft only: never stalk, coerce, invent private knowledge, remove agency, or override safety/mode rules.`;
}

/** Mode-owned current-addressee cue for the bounded fandom effect. */
export function botPowerAddressedFandomCueV1(
  value: unknown,
  targetLabel: unknown,
  modeLabel = "Current reply",
): string | null {
  return addressedFandomCueForEffectV1(
    strongestBotPowerAddressedFandomEffectV1(value),
    targetLabel,
    modeLabel,
  );
}

export function botPowerAddressedFandomCueFromEffectsV1(
  value: unknown,
  targetLabel: unknown,
  modeLabel = "Current reply",
): string | null {
  return addressedFandomCueForEffectV1(
    strongestBotPowerAddressedFandomEffectFromEffectsV1(value),
    targetLabel,
    modeLabel,
  );
}

/** Detects a direct question or an explicit invitation to answer honestly. */
export function botPowerCandorTriggerV1(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = compactText(value, 2_000).toLowerCase().replace(/[’]/gu, "'");
  if (!text) return false;
  if (text.includes("?")) return true;
  return [
    /\b(?:be|answer)\s+(?:completely\s+|totally\s+)?honest\b/u,
    /\b(?:tell|give)\s+me\s+(?:the\s+)?(?:honest\s+)?truth\b/u,
    /\b(?:speak|answer)\s+(?:openly|honestly|truthfully|candidly)\b/u,
    /\b(?:level|be\s+straight)\s+with\s+me\b/u,
    /\bwhat\s+do\s+you\s+really\s+(?:think|believe|want|know|feel)\b/u,
    /\byou\s+can\s+(?:trust|tell)\s+me\b/u,
  ].some((pattern) => pattern.test(text));
}

export function strongestBotPowerCandorEffectV1(
  value: unknown,
  matchesTarget: (target: BotPowerTargetV1) => boolean,
): Extract<BotPowerEffectV1, { type: "candor" }> | null {
  const rank: Record<BotPowerStrength, number> = { small: 1, medium: 2, large: 3 };
  return activeBotPowerEffectsV1(value)
    .filter(
      (effect): effect is Extract<BotPowerEffectV1, { type: "candor" }> =>
        effect.type === "candor" && effect.targets.some(matchesTarget),
    )
    .reduce<Extract<BotPowerEffectV1, { type: "candor" }> | null>(
      (strongest, effect) =>
        !strongest || rank[effect.strength] > rank[strongest.strength]
          ? effect
          : strongest,
      null,
    );
}

/** Shared safety-and-agency language for the single affected response. */
export function botPowerCandorResponseRuleV1(
  strength: BotPowerStrength,
  sourceName = "the bot who asked",
): string {
  const pressure = strength === "small" ? "subtle" : strength === "large" ? "strong" : "noticeable";
  const source = compactText(sourceName, 28) || "the bot who asked";
  return `Candor (${pressure}): ${source} asks directly; answer openly from facts, beliefs, uncertainty, or known secrets. Soft influence, not control; resist in character. Never invent certainty, expose private prompts/state, or cross safety/privacy. This response only.`;
}

export function buildBotPowersPromptBlock(
  lines: readonly string[],
  maxChars = BOT_POWER_PROMPT_MAX_CHARS,
  maxTokens = BOT_POWER_PROMPT_MAX_TOKENS
): string {
  const deduped = Array.from(
    new Set(lines.map((line) => compactText(line, 280)).filter(Boolean))
  );
  if (deduped.length === 0) return "";
  const prefix = "Active Powers:\n";
  let body = "";
  for (const line of deduped) {
    const candidate = `${body}${body ? "\n" : ""}- ${line}`;
    if (
      prefix.length + candidate.length > maxChars ||
      estimateBotPowerTokensV1(`${prefix}${candidate}`) > maxTokens
    ) break;
    body = candidate;
  }
  return body ? `${prefix}${body}` : "";
}

export function buildBotPowersSelfPromptV1(value: unknown): string {
  return buildBotPowersPromptBlock(botPowerSelfCueLinesV1(value));
}

export function botPowerCupRateMultiplierForBotV1(value: unknown): number {
  const effect = activeBotPowerEffectsV1(value).find(
    (candidate) => candidate.type === "cup_rate",
  );
  if (!effect || effect.type !== "cup_rate") return 1;
  return effect.rate === "none"
    ? 0
    : effect.rate === "slow"
      ? 0.55
      : effect.rate === "very_fast"
        ? 2.5
        : 1.65;
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
      estimateBotPowerTokensV1(`${prefix}${candidate}`) > maxTokens
    ) break;
    body = candidate;
  }
  return body ? `${prefix}${body}` : "";
}

export function estimateCoffeePowerTokensV1(value: string): number {
  return estimateBotPowerTokensV1(value);
}

export function estimateBotPowerTokensV1(value: string): number {
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
  return effect.rate === "none"
    ? 0
    : effect.rate === "slow"
      ? 0.55
      : effect.rate === "very_fast"
        ? 2.5
        : 1.65;
}

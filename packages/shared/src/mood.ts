export type PrismMoodMode = "zen" | "chat" | "sandbox" | "coffee";

export type PrismMoodKey = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export const DEFAULT_PRISM_MOOD_SENSITIVITY = 0.5;
export const MIN_PRISM_MOOD_SENSITIVITY = 0;
export const MAX_PRISM_MOOD_SENSITIVITY = 1;

export type PrismMoodDeltaKind =
  | "interruption"
  | "ignored_question"
  | "negative_turn"
  | "positive_turn"
  | "ignore_started"
  | "ignored_turn"
  | "ignore_forgiven"
  | "ignore_expired"
  | "turn_decay"
  | "debug_nudge"
  | "reset";

export interface PrismMoodDelta {
  kind: PrismMoodDeltaKind;
  at: string;
  reason: string;
  annoyanceDelta: number;
  warmthDelta: number;
  engagementDelta: number;
  restraintDelta: number;
  moodKeyBefore: PrismMoodKey;
  moodKeyAfter: PrismMoodKey;
}

export interface PrismMoodState {
  mode: PrismMoodMode;
  moodKey: PrismMoodKey;
  confidence: number;
  annoyance: number;
  warmth: number;
  engagement: number;
  restraint: number;
  lastUpdatedAt: string;
  recentDeltas: PrismMoodDelta[];
  ignoreUntil?: string;
  ignoreCooldownMs?: number;
  ignoreForgivenessChance?: number;
  ignorePenaltyLevel?: number;
  frozen?: boolean;
}

export type PrismMoodSnapshot = PrismMoodState;

export interface PrismMoodInterruptionInput {
  kind?: "assistant_reveal" | "pending_reply";
  assistantMessageId?: string;
  visibleTokenCount?: number;
  totalTokenCount?: number;
  interruptedContent?: string;
}

export type PrismMoodIgnoredQuestionPenaltyLevel = "light" | "normal" | "elevated";

export interface PrismMoodDebugPatch {
  annoyanceDelta?: number;
  warmthDelta?: number;
  engagementDelta?: number;
  restraintDelta?: number;
  reason?: string;
  freeze?: boolean;
}

export interface CoffeeSocialLikeSnapshot {
  disposition: number;
  valuesFriction: number;
  restraint: number;
  engagement: number;
  leavePressure: number;
}

const RECENT_DELTA_LIMIT = 12;
export const PRISM_MOOD_IGNORE_COOLDOWN_MS = 45_000;
export const PRISM_MOOD_IGNORE_FORGIVENESS_CHANCE = 0.1;
export const PRISM_MOOD_IGNORE_FORGIVENESS_STEP = 0.02;
const PRISM_MOOD_IGNORE_PENALTY_LIMIT = 5;

function isoNow(now?: string | Date): string {
  if (typeof now === "string" && now.trim().length > 0) return now;
  if (now instanceof Date) return now.toISOString();
  return new Date().toISOString();
}

export function clampPrismMoodValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizePrismMoodSensitivity(
  value: unknown,
  fallback = DEFAULT_PRISM_MOOD_SENSITIVITY
): number {
  const fallbackNumber =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : DEFAULT_PRISM_MOOD_SENSITIVITY;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : fallbackNumber;
  const clamped = Math.min(
    MAX_PRISM_MOOD_SENSITIVITY,
    Math.max(MIN_PRISM_MOOD_SENSITIVITY, normalized)
  );
  return Math.round(clamped * 100) / 100;
}

function roundedUnit(value: number): number {
  return Math.round(clampPrismMoodValue(value) * 1000) / 1000;
}

export const COFFEE_NEAR_DESATURATED_SATURATION = 0.18;

export function coffeeDepartureChanceFromSocial(
  social: CoffeeSocialLikeSnapshot
): number {
  const disposition = clampPrismMoodValue(social.disposition);
  const engagement = clampPrismMoodValue(social.engagement);
  const valuesFriction = clampPrismMoodValue(social.valuesFriction);
  const leavePressure = clampPrismMoodValue(social.leavePressure);
  const restraint = clampPrismMoodValue(social.restraint);
  const chance =
    leavePressure * 0.5 +
    (1 - engagement) * 0.22 +
    valuesFriction * 0.14 +
    (1 - disposition) * 0.1 +
    (1 - restraint) * 0.04;
  return Math.round(Math.max(0, Math.min(1, chance)) * 1000) / 1000;
}

export function coffeeMoodSaturationFromSocial(
  social: CoffeeSocialLikeSnapshot
): number {
  const disposition = clampPrismMoodValue(social.disposition);
  const engagement = clampPrismMoodValue(social.engagement);
  const valuesFriction = clampPrismMoodValue(social.valuesFriction);
  const leavePressure = clampPrismMoodValue(social.leavePressure);
  const restraint = clampPrismMoodValue(social.restraint);
  const socialHealth =
    disposition * 0.34 +
    engagement * 0.24 +
    (1 - valuesFriction) * 0.24 +
    (1 - leavePressure) * 0.08 +
    restraint * 0.1;
  const strain = Math.max(
    valuesFriction * 0.42 + leavePressure * 0.32,
    (1 - disposition) * 0.56 + (1 - engagement) * 0.44
  );
  const departureChance = coffeeDepartureChanceFromSocial(social);
  const departureFadeBase = Math.max(0, (departureChance - 0.62) / 0.38);
  const departureFade = Math.pow(departureFadeBase, 1.35) * 0.52;
  const saturation =
    0.12 +
    socialHealth * 1.22 -
    Math.max(0, strain - 0.72) * 0.7 -
    departureFade;
  return Math.round(Math.max(0.06, Math.min(1.38, saturation)) * 1000) / 1000;
}

export function coffeeSocialSnapshotIsNearDesaturated(
  social: CoffeeSocialLikeSnapshot
): boolean {
  return (
    coffeeMoodSaturationFromSocial(social) <= COFFEE_NEAR_DESATURATED_SATURATION ||
    coffeeDepartureChanceFromSocial(social) >= 0.82 ||
    (clampPrismMoodValue(social.disposition) <= 0.16 &&
      clampPrismMoodValue(social.engagement) <= 0.22)
  );
}

function roundedDelta(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

function roundedChance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function normalizeIgnorePenaltyLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(PRISM_MOOD_IGNORE_PENALTY_LIMIT, Math.floor(value)));
}

function normalizeIgnoreCooldownMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(1_000, Math.min(3_600_000, Math.round(value)));
}

function forgivenessChanceForPenaltyLevel(penaltyLevel: number): number {
  return roundedChance(
    PRISM_MOOD_IGNORE_FORGIVENESS_CHANCE -
      normalizeIgnorePenaltyLevel(penaltyLevel) * PRISM_MOOD_IGNORE_FORGIVENESS_STEP
  );
}

function cooldownMsForPenaltyLevel(penaltyLevel: number): number {
  return Math.round(
    PRISM_MOOD_IGNORE_COOLDOWN_MS * Math.pow(2, normalizeIgnorePenaltyLevel(penaltyLevel))
  );
}

function normalizeMode(mode: unknown): PrismMoodMode {
  return mode === "chat" || mode === "sandbox" || mode === "coffee" || mode === "zen"
    ? mode
    : "zen";
}

export function derivePrismMoodKey(input: Pick<PrismMoodState, "annoyance" | "warmth" | "engagement">): PrismMoodKey {
  const annoyance = clampPrismMoodValue(input.annoyance);
  const warmth = clampPrismMoodValue(input.warmth);
  const engagement = clampPrismMoodValue(input.engagement);
  if (annoyance >= 0.72 && warmth <= 0.45) return "strained";
  if (annoyance >= 0.48 || warmth <= 0.36) return "guarded";
  if (warmth >= 0.78 && engagement >= 0.64 && annoyance <= 0.22) return "joyful";
  if (warmth >= 0.6 && annoyance <= 0.34) return "warm";
  return "neutral";
}

export function derivePrismMoodConfidence(
  input: Pick<PrismMoodState, "annoyance" | "warmth" | "engagement">
): number {
  const moodKey = derivePrismMoodKey(input);
  const annoyance = clampPrismMoodValue(input.annoyance);
  const warmth = clampPrismMoodValue(input.warmth);
  const engagement = clampPrismMoodValue(input.engagement);
  const intensityByMood: Record<PrismMoodKey, number> = {
    joyful: Math.max(warmth - 0.62, engagement - 0.52, 0.12),
    warm: Math.max(warmth - 0.5, 0.08),
    neutral: 0.08 + Math.abs(warmth - 0.52) * 0.25 + Math.abs(annoyance - 0.22) * 0.2,
    guarded: Math.max(annoyance - 0.34, 0.5 - warmth, 0.1),
    strained: Math.max(annoyance - 0.48, 0.52 - warmth, 0.16),
  };
  return roundedUnit(0.5 + intensityByMood[moodKey] * 0.8);
}

function finalizeMoodState(
  state: Omit<PrismMoodState, "moodKey" | "confidence">
): PrismMoodState {
  const moodKey = derivePrismMoodKey(state);
  return {
    ...state,
    moodKey,
    confidence: derivePrismMoodConfidence(state),
    annoyance: roundedUnit(state.annoyance),
    warmth: roundedUnit(state.warmth),
    engagement: roundedUnit(state.engagement),
    restraint: roundedUnit(state.restraint),
    recentDeltas: state.recentDeltas.slice(0, RECENT_DELTA_LIMIT),
  };
}

export function createDefaultPrismMoodState(
  mode: PrismMoodMode = "zen",
  now?: string | Date
): PrismMoodState {
  return finalizeMoodState({
    mode,
    annoyance: 0.12,
    warmth: 0.62,
    engagement: 0.62,
    restraint: 0.68,
    lastUpdatedAt: isoNow(now),
    recentDeltas: [],
  });
}

function sanitizeDelta(input: unknown): PrismMoodDelta | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const kind = record.kind;
  const moodKeyBefore = record.moodKeyBefore;
  const moodKeyAfter = record.moodKeyAfter;
  if (
    kind !== "interruption" &&
    kind !== "ignored_question" &&
    kind !== "negative_turn" &&
    kind !== "positive_turn" &&
    kind !== "ignore_started" &&
    kind !== "ignored_turn" &&
    kind !== "ignore_forgiven" &&
    kind !== "ignore_expired" &&
    kind !== "turn_decay" &&
    kind !== "debug_nudge" &&
    kind !== "reset"
  ) {
    return null;
  }
  if (
    moodKeyBefore !== "joyful" &&
    moodKeyBefore !== "warm" &&
    moodKeyBefore !== "neutral" &&
    moodKeyBefore !== "guarded" &&
    moodKeyBefore !== "strained"
  ) {
    return null;
  }
  if (
    moodKeyAfter !== "joyful" &&
    moodKeyAfter !== "warm" &&
    moodKeyAfter !== "neutral" &&
    moodKeyAfter !== "guarded" &&
    moodKeyAfter !== "strained"
  ) {
    return null;
  }
  return {
    kind,
    at: typeof record.at === "string" ? record.at : isoNow(),
    reason: typeof record.reason === "string" ? record.reason : "",
    annoyanceDelta: roundedDelta(typeof record.annoyanceDelta === "number" ? record.annoyanceDelta : 0),
    warmthDelta: roundedDelta(typeof record.warmthDelta === "number" ? record.warmthDelta : 0),
    engagementDelta: roundedDelta(typeof record.engagementDelta === "number" ? record.engagementDelta : 0),
    restraintDelta: roundedDelta(typeof record.restraintDelta === "number" ? record.restraintDelta : 0),
    moodKeyBefore,
    moodKeyAfter,
  };
}

export function sanitizePrismMoodState(
  input: unknown,
  fallbackMode: PrismMoodMode = "zen",
  now?: string | Date
): PrismMoodState {
  if (!input || typeof input !== "object") {
    return createDefaultPrismMoodState(fallbackMode, now);
  }
  const record = input as Record<string, unknown>;
  const base = createDefaultPrismMoodState(normalizeMode(record.mode ?? fallbackMode), now);
  const recentDeltas = Array.isArray(record.recentDeltas)
    ? record.recentDeltas.map(sanitizeDelta).filter((delta): delta is PrismMoodDelta => delta !== null)
    : [];
  const ignoreUntil =
    typeof record.ignoreUntil === "string" && !Number.isNaN(Date.parse(record.ignoreUntil))
      ? record.ignoreUntil
      : undefined;
  const ignoreCooldownMs = normalizeIgnoreCooldownMs(record.ignoreCooldownMs);
  const ignoreForgivenessChance =
    typeof record.ignoreForgivenessChance === "number" && Number.isFinite(record.ignoreForgivenessChance)
      ? roundedChance(record.ignoreForgivenessChance)
      : undefined;
  const ignorePenaltyLevel = normalizeIgnorePenaltyLevel(record.ignorePenaltyLevel);
  return finalizeMoodState({
    mode: normalizeMode(record.mode ?? fallbackMode),
    annoyance: typeof record.annoyance === "number" ? record.annoyance : base.annoyance,
    warmth: typeof record.warmth === "number" ? record.warmth : base.warmth,
    engagement: typeof record.engagement === "number" ? record.engagement : base.engagement,
    restraint: typeof record.restraint === "number" ? record.restraint : base.restraint,
    lastUpdatedAt:
      typeof record.lastUpdatedAt === "string" && record.lastUpdatedAt.trim().length > 0
        ? record.lastUpdatedAt
        : base.lastUpdatedAt,
    recentDeltas,
    ...(ignoreUntil ? { ignoreUntil } : {}),
    ...(ignoreCooldownMs !== undefined ? { ignoreCooldownMs } : {}),
    ...(ignoreForgivenessChance !== undefined ? { ignoreForgivenessChance } : {}),
    ...(ignorePenaltyLevel > 0 ? { ignorePenaltyLevel } : {}),
    ...(record.frozen === true ? { frozen: true } : {}),
  });
}

function withMoodDelta(
  previous: PrismMoodState,
  args: {
    kind: PrismMoodDeltaKind;
    now?: string | Date;
    reason: string;
    annoyanceDelta?: number;
    warmthDelta?: number;
    engagementDelta?: number;
    restraintDelta?: number;
    frozenOverride?: boolean;
    ignoreUntilOverride?: string | null;
    ignoreCooldownMsOverride?: number | null;
    ignoreForgivenessChanceOverride?: number | null;
    ignorePenaltyLevelOverride?: number | null;
  }
): PrismMoodState {
  const now = isoNow(args.now);
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  const frozen = args.frozenOverride ?? base.frozen;
  const ignoreUntil =
    args.ignoreUntilOverride === undefined
      ? base.ignoreUntil
      : args.ignoreUntilOverride ?? undefined;
  const ignoreCooldownMs =
    args.ignoreCooldownMsOverride === undefined
      ? base.ignoreCooldownMs
      : normalizeIgnoreCooldownMs(args.ignoreCooldownMsOverride);
  const ignoreForgivenessChance =
    args.ignoreForgivenessChanceOverride === undefined
      ? base.ignoreForgivenessChance
      : args.ignoreForgivenessChanceOverride === null
        ? undefined
        : roundedChance(args.ignoreForgivenessChanceOverride);
  const ignorePenaltyLevel =
    args.ignorePenaltyLevelOverride === undefined
      ? base.ignorePenaltyLevel
      : args.ignorePenaltyLevelOverride === null
        ? undefined
        : normalizeIgnorePenaltyLevel(args.ignorePenaltyLevelOverride);
  const nextBase = finalizeMoodState({
    mode: base.mode,
    annoyance: base.annoyance + (args.annoyanceDelta ?? 0),
    warmth: base.warmth + (args.warmthDelta ?? 0),
    engagement: base.engagement + (args.engagementDelta ?? 0),
    restraint: base.restraint + (args.restraintDelta ?? 0),
    lastUpdatedAt: now,
    recentDeltas: base.recentDeltas,
    ...(ignoreUntil ? { ignoreUntil } : {}),
    ...(ignoreCooldownMs !== undefined ? { ignoreCooldownMs } : {}),
    ...(ignoreForgivenessChance !== undefined ? { ignoreForgivenessChance } : {}),
    ...(ignorePenaltyLevel !== undefined && ignorePenaltyLevel > 0 ? { ignorePenaltyLevel } : {}),
    ...(frozen ? { frozen } : {}),
  });
  const delta: PrismMoodDelta = {
    kind: args.kind,
    at: now,
    reason: args.reason,
    annoyanceDelta: roundedDelta(nextBase.annoyance - base.annoyance),
    warmthDelta: roundedDelta(nextBase.warmth - base.warmth),
    engagementDelta: roundedDelta(nextBase.engagement - base.engagement),
    restraintDelta: roundedDelta(nextBase.restraint - base.restraint),
    moodKeyBefore: base.moodKey,
    moodKeyAfter: nextBase.moodKey,
  };
  return {
    ...nextBase,
    recentDeltas: [delta, ...base.recentDeltas].slice(0, RECENT_DELTA_LIMIT),
  };
}

export function interruptionProgressWeight(input?: PrismMoodInterruptionInput): number {
  const visible = Math.max(1, Math.floor(input?.visibleTokenCount ?? 1));
  const total =
    typeof input?.totalTokenCount === "number" && Number.isFinite(input.totalTokenCount)
      ? Math.max(visible, Math.floor(input.totalTokenCount))
      : Math.max(visible, 12);
  const progress = clampPrismMoodValue(visible / total);
  const centered = Math.exp(-Math.pow(progress - 0.52, 2) / (2 * Math.pow(0.24, 2)));
  const edge = 0.42;
  return edge + (1 - edge) * centered;
}

export function prismMoodInterruptionStreak(state: PrismMoodState): number {
  const mood = sanitizePrismMoodState(state, state.mode);
  let streak = 0;
  for (const delta of mood.recentDeltas) {
    if (delta.kind === "interruption") {
      streak += 1;
      continue;
    }
    if (delta.kind === "turn_decay" || delta.kind === "negative_turn") {
      continue;
    }
    break;
  }
  return streak;
}

function timeMs(value?: string | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}

export function prismMoodIgnoreUntilMs(
  state: PrismMoodState,
  now?: string | Date
): number | null {
  const mood = sanitizePrismMoodState(state, state.mode, now);
  const untilMs = Date.parse(mood.ignoreUntil ?? "");
  if (Number.isNaN(untilMs)) return null;
  return untilMs > timeMs(now) ? untilMs : null;
}

export function isPrismMoodIgnoring(
  state: PrismMoodState,
  now?: string | Date
): boolean {
  return prismMoodIgnoreUntilMs(state, now) !== null;
}

function prismMoodSensitivityJumpWeight(sensitivity: unknown): number {
  const normalized = normalizePrismMoodSensitivity(sensitivity);
  return 0.55 + normalized * 0.9;
}

function prismMoodSensitivityThresholdOffset(sensitivity: unknown): number {
  return (normalizePrismMoodSensitivity(sensitivity) - DEFAULT_PRISM_MOOD_SENSITIVITY) * 0.2;
}

function prismMoodSensitivityStreakThreshold(
  sensitivity: unknown,
  baseline: number
): number {
  const normalized = normalizePrismMoodSensitivity(sensitivity);
  if (normalized >= 0.8) return Math.max(1, baseline - 1);
  if (normalized <= 0.2) return baseline + 1;
  return baseline;
}

export function applyPrismMoodInterruption(
  previous: PrismMoodState,
  input?: PrismMoodInterruptionInput,
  now?: string | Date,
  sensitivity: unknown = DEFAULT_PRISM_MOOD_SENSITIVITY
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  if (input?.kind === "pending_reply") return base;
  const severity = interruptionProgressWeight(input);
  const restraintRelief = 1 - base.restraint * 0.42;
  const streak = prismMoodInterruptionStreak(base);
  const streakWeight = 1 + Math.min(1.35, streak * 0.23);
  const weight = severity * restraintRelief * streakWeight *
    prismMoodSensitivityJumpWeight(sensitivity);
  return withMoodDelta(base, {
    kind: "interruption",
    now,
    reason: "The user interrupted the visible reply.",
    annoyanceDelta: 0.135 * weight,
    warmthDelta: -0.052 * weight,
    engagementDelta: -0.035 * weight,
    restraintDelta: -0.022 * weight,
  });
}

export function applyPrismMoodIgnoredQuestion(
  previous: PrismMoodState,
  now?: string | Date,
  sensitivity: unknown = DEFAULT_PRISM_MOOD_SENSITIVITY,
  penaltyLevel: PrismMoodIgnoredQuestionPenaltyLevel = "normal"
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const sensitivityWeight = prismMoodSensitivityJumpWeight(sensitivity);
  const patienceRelief = 1 - base.restraint * 0.28;
  const penaltyWeight =
    penaltyLevel === "elevated" ? 1.35 : penaltyLevel === "light" ? 0.55 : 1;
  const weight = Math.min(1.6, sensitivityWeight * patienceRelief * penaltyWeight);
  return withMoodDelta(base, {
    kind: "ignored_question",
    now,
    reason: "The user left an explicit question unanswered long enough to read as hesitation.",
    annoyanceDelta: 0.05 * weight,
    warmthDelta: -0.024 * weight,
    engagementDelta: -0.04 * weight,
    restraintDelta: -0.012 * weight,
  });
}

export function applyPrismMoodNegativeTurn(
  previous: PrismMoodState,
  intensity = 1,
  now?: string | Date,
  sensitivity: unknown = DEFAULT_PRISM_MOOD_SENSITIVITY
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const baseWeight = Math.min(0.65, clampPrismMoodValue(intensity));
  const weight = Math.min(
    0.95,
    baseWeight * prismMoodSensitivityJumpWeight(sensitivity)
  );
  return withMoodDelta(base, {
    kind: "negative_turn",
    now,
    reason: "The user's wording brought harsher or less collaborative energy.",
    annoyanceDelta: 0.045 * weight,
    warmthDelta: -0.03 * weight,
    engagementDelta: -0.012 * weight,
    restraintDelta: -0.008 * weight,
  });
}

export function applyPrismMoodPositiveTurn(
  previous: PrismMoodState,
  intensity = 1,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const weight = clampPrismMoodValue(intensity);
  const streak = prismMoodInterruptionStreak(base);
  return withMoodDelta(base, {
    kind: "positive_turn",
    now,
    reason: "The user brought warmer or more constructive energy.",
    annoyanceDelta: -(0.08 + Math.min(0.04, streak * 0.008)) * weight,
    warmthDelta: 0.07 * weight,
    engagementDelta: 0.04 * weight,
    restraintDelta: 0.035 * weight,
    ignoreUntilOverride: null,
    ignoreCooldownMsOverride: null,
    ignoreForgivenessChanceOverride: null,
  });
}

export function shouldPrismMoodStartIgnoreCooldown(
  state: PrismMoodState,
  sensitivity: unknown = DEFAULT_PRISM_MOOD_SENSITIVITY
): boolean {
  const mood = sanitizePrismMoodState(state, state.mode);
  if (mood.mode !== "zen") return false;
  if (isPrismMoodIgnoring(mood)) return false;
  const streak = prismMoodInterruptionStreak(mood);
  const offset = prismMoodSensitivityThresholdOffset(sensitivity);
  const hardIgnore =
    mood.annoyance >= 0.78 - offset &&
    mood.warmth <= 0.42 + offset * 0.5 &&
    mood.engagement <= 0.48 + offset * 0.5;
  const interruptionIgnore =
    streak >= prismMoodSensitivityStreakThreshold(sensitivity, 6) &&
    mood.annoyance >= 0.72 - offset &&
    mood.warmth <= 0.46 + offset * 0.5;
  return hardIgnore || interruptionIgnore;
}

export function applyPrismMoodIgnoreCooldown(
  previous: PrismMoodState,
  now?: string | Date,
  cooldownMs?: number
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const nowMs = timeMs(now);
  const penaltyLevel = normalizeIgnorePenaltyLevel(base.ignorePenaltyLevel);
  const effectiveCooldownMs =
    cooldownMs !== undefined
      ? Math.max(1_000, Math.round(cooldownMs))
      : cooldownMsForPenaltyLevel(penaltyLevel);
  const forgivenessChance = forgivenessChanceForPenaltyLevel(penaltyLevel);
  const ignoreUntil = new Date(nowMs + effectiveCooldownMs).toISOString();
  return withMoodDelta(base, {
    kind: "ignore_started",
    now,
    reason: "Prism stopped answering for a short cooldown.",
    annoyanceDelta: 1 - base.annoyance,
    ignoreUntilOverride: ignoreUntil,
    ignoreCooldownMsOverride: effectiveCooldownMs,
    ignoreForgivenessChanceOverride: forgivenessChance,
    ignorePenaltyLevelOverride: penaltyLevel,
  });
}

export function applyPrismMoodIgnoredTurn(
  previous: PrismMoodState,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  return withMoodDelta(base, {
    kind: "ignored_turn",
    now,
    reason: "Prism ignored the user while the cooldown was active.",
  });
}

export function prismMoodIgnoreForgivenessChance(state: PrismMoodState): number {
  const mood = sanitizePrismMoodState(state, state.mode);
  if (!isPrismMoodIgnoring(mood)) return 0;
  if (typeof mood.ignoreForgivenessChance === "number") {
    return roundedChance(mood.ignoreForgivenessChance);
  }
  return forgivenessChanceForPenaltyLevel(mood.ignorePenaltyLevel ?? 0);
}

export function applyPrismMoodForgivenessSuccess(
  previous: PrismMoodState,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const nextPenaltyLevel = normalizeIgnorePenaltyLevel((base.ignorePenaltyLevel ?? 0) + 1);
  return withMoodDelta(base, {
    kind: "ignore_forgiven",
    now,
    reason: "The user made a repair attempt and Prism chose to answer again.",
    annoyanceDelta: -0.05,
    ignoreUntilOverride: null,
    ignoreCooldownMsOverride: null,
    ignoreForgivenessChanceOverride: null,
    ignorePenaltyLevelOverride: nextPenaltyLevel,
  });
}

export function applyPrismMoodExpiredIgnoreCooldown(
  previous: PrismMoodState,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (!base.ignoreUntil || isPrismMoodIgnoring(base, now)) return base;
  if (base.frozen) return base;
  const nextPenaltyLevel = normalizeIgnorePenaltyLevel((base.ignorePenaltyLevel ?? 0) + 1);
  return withMoodDelta(base, {
    kind: "ignore_expired",
    now,
    reason: "The ignore cooldown completed, so Prism calmed down a little.",
    annoyanceDelta: -0.25,
    ignoreUntilOverride: null,
    ignoreCooldownMsOverride: null,
    ignoreForgivenessChanceOverride: null,
    ignorePenaltyLevelOverride: nextPenaltyLevel,
  });
}

export function decayPrismMood(
  previous: PrismMoodState,
  now?: string | Date,
  intensity = 1
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const weight = clampPrismMoodValue(intensity);
  const streak = prismMoodInterruptionStreak(base);
  const streakDecayRelief = streak > 0 ? Math.max(0.28, 1 - streak * 0.16) : 1;
  const effectiveWeight = weight * streakDecayRelief;
  const target = createDefaultPrismMoodState(base.mode, now);
  return withMoodDelta(base, {
    kind: "turn_decay",
    now,
    reason: "Mood drifted gently toward baseline.",
    annoyanceDelta: (target.annoyance - base.annoyance) * 0.2 * effectiveWeight,
    warmthDelta: (target.warmth - base.warmth) * 0.12 * effectiveWeight,
    engagementDelta: (target.engagement - base.engagement) * 0.1 * effectiveWeight,
    restraintDelta: (target.restraint - base.restraint) * 0.1 * effectiveWeight,
  });
}

export function debugPatchPrismMood(
  previous: PrismMoodState,
  patch: PrismMoodDebugPatch,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  return withMoodDelta(base, {
    kind: "debug_nudge",
    now,
    reason: patch.reason?.trim() || "Developer Tools nudged mood.",
    annoyanceDelta: patch.annoyanceDelta ?? 0,
    warmthDelta: patch.warmthDelta ?? 0,
    engagementDelta: patch.engagementDelta ?? 0,
    restraintDelta: patch.restraintDelta ?? 0,
    frozenOverride: patch.freeze,
  });
}

export function resetPrismMood(
  mode: PrismMoodMode = "zen",
  now?: string | Date
): PrismMoodState {
  const reset = createDefaultPrismMoodState(mode, now);
  const delta: PrismMoodDelta = {
    kind: "reset",
    at: reset.lastUpdatedAt,
    reason: "Developer Tools reset mood.",
    annoyanceDelta: 0,
    warmthDelta: 0,
    engagementDelta: 0,
    restraintDelta: 0,
    moodKeyBefore: reset.moodKey,
    moodKeyAfter: reset.moodKey,
  };
  return {
    ...reset,
    recentDeltas: [delta],
  };
}

export function shouldPrismMoodDeclineResponse(
  state: PrismMoodState,
  sensitivity: unknown = DEFAULT_PRISM_MOOD_SENSITIVITY
): boolean {
  const mood = sanitizePrismMoodState(state, state.mode);
  if (isPrismMoodIgnoring(mood)) return true;
  const offset = prismMoodSensitivityThresholdOffset(sensitivity);
  const hardDecline =
    mood.annoyance >= 0.82 - offset &&
    mood.engagement <= 0.42 + offset * 0.5 &&
    mood.warmth <= 0.4 + offset * 0.5;
  const interruptionPause =
    mood.mode === "zen" &&
    prismMoodInterruptionStreak(mood) >= prismMoodSensitivityStreakThreshold(sensitivity, 5) &&
    mood.annoyance >= 0.58 - offset &&
    mood.warmth <= 0.52 + offset * 0.5;
  return hardDecline || interruptionPause;
}

export function prismMoodDeclineReason(state: PrismMoodState): string | null {
  const mood = sanitizePrismMoodState(state, state.mode);
  if (isPrismMoodIgnoring(mood)) {
    return "Prism is ignoring messages until the cooldown expires.";
  }
  if (mood.annoyance >= 0.82 && mood.engagement <= 0.42 && mood.warmth <= 0.4) {
    return "Annoyance is high while engagement and warmth are low; Prism may take a beat instead of replying.";
  }
  if (
    mood.mode === "zen" &&
    prismMoodInterruptionStreak(mood) >= 5 &&
    mood.annoyance >= 0.58 &&
    mood.warmth <= 0.52
  ) {
    return "Recent interruptions have stacked up; Prism may pause with one quiet boundary line.";
  }
  return null;
}

export function coffeeSocialSnapshotToPrismMoodState(
  social: CoffeeSocialLikeSnapshot,
  now?: string | Date
): PrismMoodState {
  const state = finalizeMoodState({
    mode: "coffee",
    annoyance: clampPrismMoodValue(social.valuesFriction * 0.72 + social.leavePressure * 0.28),
    warmth: clampPrismMoodValue(social.disposition * 0.82 + (1 - social.valuesFriction) * 0.18),
    engagement: social.engagement,
    restraint: social.restraint,
    lastUpdatedAt: isoNow(now),
    recentDeltas: [],
  });
  return state;
}

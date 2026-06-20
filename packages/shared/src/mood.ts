export type PrismMoodMode = "zen" | "chat" | "sandbox" | "coffee";

export type PrismMoodKey = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export type PrismMoodDeltaKind =
  | "interruption"
  | "negative_turn"
  | "positive_turn"
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
  frozen?: boolean;
}

export type PrismMoodSnapshot = PrismMoodState;

export interface PrismMoodInterruptionInput {
  kind?: "assistant_reveal" | "pending_reply";
  assistantMessageId?: string;
  visibleTokenCount?: number;
  totalTokenCount?: number;
}

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

function isoNow(now?: string | Date): string {
  if (typeof now === "string" && now.trim().length > 0) return now;
  if (now instanceof Date) return now.toISOString();
  return new Date().toISOString();
}

export function clampPrismMoodValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundedUnit(value: number): number {
  return Math.round(clampPrismMoodValue(value) * 1000) / 1000;
}

function roundedDelta(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
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
    kind !== "negative_turn" &&
    kind !== "positive_turn" &&
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
  }
): PrismMoodState {
  const now = isoNow(args.now);
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  const frozen = args.frozenOverride ?? base.frozen;
  const nextBase = finalizeMoodState({
    mode: base.mode,
    annoyance: base.annoyance + (args.annoyanceDelta ?? 0),
    warmth: base.warmth + (args.warmthDelta ?? 0),
    engagement: base.engagement + (args.engagementDelta ?? 0),
    restraint: base.restraint + (args.restraintDelta ?? 0),
    lastUpdatedAt: now,
    recentDeltas: base.recentDeltas,
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

export function applyPrismMoodInterruption(
  previous: PrismMoodState,
  input?: PrismMoodInterruptionInput,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const severity = interruptionProgressWeight(input);
  const pendingReplyWeight = input?.kind === "pending_reply" ? 0.62 : 1;
  const restraintRelief = 1 - base.restraint * 0.42;
  const streak = prismMoodInterruptionStreak(base);
  const streakWeight = 1 + Math.min(1.35, streak * 0.23);
  const weight = severity * pendingReplyWeight * restraintRelief * streakWeight;
  return withMoodDelta(base, {
    kind: "interruption",
    now,
    reason: input?.kind === "pending_reply"
      ? "The user interrupted before the reply became visible."
      : "The user interrupted the visible reply.",
    annoyanceDelta: 0.135 * weight,
    warmthDelta: -0.052 * weight,
    engagementDelta: -0.035 * weight,
    restraintDelta: -0.022 * weight,
  });
}

export function applyPrismMoodNegativeTurn(
  previous: PrismMoodState,
  intensity = 1,
  now?: string | Date
): PrismMoodState {
  const base = sanitizePrismMoodState(previous, previous.mode, now);
  if (base.frozen) return base;
  const weight = Math.min(0.65, clampPrismMoodValue(intensity));
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

export function shouldPrismMoodDeclineResponse(state: PrismMoodState): boolean {
  const mood = sanitizePrismMoodState(state, state.mode);
  const hardDecline = mood.annoyance >= 0.82 && mood.engagement <= 0.42 && mood.warmth <= 0.4;
  const interruptionPause =
    mood.mode === "zen" &&
    prismMoodInterruptionStreak(mood) >= 5 &&
    mood.annoyance >= 0.58 &&
    mood.warmth <= 0.52;
  return hardDecline || interruptionPause;
}

export function prismMoodDeclineReason(state: PrismMoodState): string | null {
  const mood = sanitizePrismMoodState(state, state.mode);
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

import type { VoiceDeliveryMood } from "./audioVoice.js";
import type { ListenerReactionVocalFoley } from "./listenerReaction.js";

/** Versioned session-local directed irritation between two bots. */
export const DIRECTIONAL_IRRITATION_VERSION = 1 as const;

export const DIRECTIONAL_IRRITATION_MIN = 0;
export const DIRECTIONAL_IRRITATION_MAX = 1;

/** Interrupted bot base gain from a meaningful cutoff. */
export const DIRECTIONAL_IRRITATION_CUTOFF_BASE_DELTA = 0.18;
/** Extra interrupted-bot gain scaled by how early the cutoff landed (0…1 severity). */
export const DIRECTIONAL_IRRITATION_CUTOFF_SEVERITY_MAX_DELTA = 0.12;
/** Smaller gain for an interrupter whose cut-in was rebuffed/reclaimed. */
export const DIRECTIONAL_IRRITATION_REBUFF_DELTA = 0.07;
/** Per clean completed turn, cool the speaking bot's outgoing edges. */
export const DIRECTIONAL_IRRITATION_CLEAN_TURN_DECAY = 0.05;

export const DIRECTIONAL_IRRITATION_TIER_LOW = 0.25;
export const DIRECTIONAL_IRRITATION_TIER_MEDIUM = 0.5;
export const DIRECTIONAL_IRRITATION_TIER_HIGH = 0.75;

/** Maximum additive reclaim probability from irritation. */
export const DIRECTIONAL_IRRITATION_RECLAIM_BIAS_MAX = 0.25;
/** Absolute reclaim probability ceiling after irritation bias. */
export const DIRECTIONAL_IRRITATION_RECLAIM_CEILING = 0.85;

/** Verbal-forward snark chance at full irritation. */
export const DIRECTIONAL_IRRITATION_SNARK_CHANCE_MAX = 0.35;
/** Sparse Foley accent chance at full irritation (only when snark did not fire). */
export const DIRECTIONAL_IRRITATION_FOLEY_CHANCE_MAX = 0.08;
/** Transient playback gain lift; never rewrite the authored profile. */
export const DIRECTIONAL_IRRITATION_GAIN_DB_MAX = 1.5;

export type DirectionalIrritationTier = "none" | "low" | "medium" | "high";

export type DirectionalIrritationTransitionReason =
  | "meaningful_cutoff"
  | "rebuff"
  | "clean_turn_decay";

export interface DirectionalIrritationEdgeV1 {
  v: typeof DIRECTIONAL_IRRITATION_VERSION;
  subjectBotId: string;
  targetBotId: string;
  intensity: number;
  updatedAt: string;
  lastTransitionId?: string;
}

export interface DirectionalIrritationTransitionV1 {
  v: typeof DIRECTIONAL_IRRITATION_VERSION;
  name: "directionalIrritation";
  transitionId: string;
  reason: DirectionalIrritationTransitionReason;
  subjectBotId: string;
  targetBotId: string;
  before: number;
  after: number;
  delta: number;
  tier: DirectionalIrritationTier;
  occurredAt: string;
}

export interface DirectionalIrritationDeliveryPlanV1 {
  v: typeof DIRECTIONAL_IRRITATION_VERSION;
  name: "directionalIrritationDelivery";
  subjectBotId: string;
  targetBotId: string;
  intensity: number;
  tier: DirectionalIrritationTier;
  moodKey: VoiceDeliveryMood;
  gainDbBoost: number;
  snarkCue?: string;
  vocalFoley?: ListenerReactionVocalFoley;
}

/** Verbal-forward reclaim / yield retorts keyed by irritation tier. */
export const DIRECTIONAL_IRRITATION_SNARK_CUES = [
  "I wasn't finished.",
  "Let me finish.",
  "As I was saying.",
  "Excuse me?",
  "Don't cut me off.",
  "Hold that thought — I was still talking.",
] as const;

export const DIRECTIONAL_IRRITATION_REBUFF_SNARK_CUES = [
  "Fine.",
  "Whatever.",
  "Alright then.",
  "Suit yourself.",
] as const;

export const DIRECTIONAL_IRRITATION_FOLEY_CUES = [
  "sighs",
  "clears throat",
  "exhales",
] as const satisfies readonly ListenerReactionVocalFoley[];

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function boundedBotId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    DIRECTIONAL_IRRITATION_MIN,
    Math.min(DIRECTIONAL_IRRITATION_MAX, value),
  );
}

function roundIntensity(value: number): number {
  return Number(clamp01(value).toFixed(4));
}

function chooseCue<T extends string>(
  seed: string,
  cues: readonly T[],
): T {
  return cues[Math.floor(stableUnit(seed) * cues.length) % cues.length]!;
}

/** Normalize a directed irritation intensity into the durable 0…1 range. */
export function normalizeDirectionalIrritationIntensity(
  value: unknown,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? roundIntensity(value)
    : 0;
}

/** Map intensity onto the verbal-forward escalation ladder. */
export function directionalIrritationTierFromIntensity(
  intensity: number,
): DirectionalIrritationTier {
  const value = normalizeDirectionalIrritationIntensity(intensity);
  if (value >= DIRECTIONAL_IRRITATION_TIER_HIGH) return "high";
  if (value >= DIRECTIONAL_IRRITATION_TIER_MEDIUM) return "medium";
  if (value >= DIRECTIONAL_IRRITATION_TIER_LOW) return "low";
  return "none";
}

/** Normalize a persisted directed edge, or return null when malformed. */
export function normalizeDirectionalIrritationEdgeV1(
  value: unknown,
): DirectionalIrritationEdgeV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const subjectBotId = boundedBotId(row.subjectBotId);
  const targetBotId = boundedBotId(row.targetBotId);
  const updatedAt =
    typeof row.updatedAt === "string" && row.updatedAt.trim()
      ? row.updatedAt.trim()
      : null;
  const lastTransitionId =
    typeof row.lastTransitionId === "string" && row.lastTransitionId.trim()
      ? row.lastTransitionId.trim().slice(0, 180)
      : undefined;
  if (
    row.v !== DIRECTIONAL_IRRITATION_VERSION ||
    !subjectBotId ||
    !targetBotId ||
    subjectBotId === targetBotId ||
    !updatedAt
  ) {
    return null;
  }
  return {
    v: DIRECTIONAL_IRRITATION_VERSION,
    subjectBotId,
    targetBotId,
    intensity: normalizeDirectionalIrritationIntensity(row.intensity),
    updatedAt,
    ...(lastTransitionId ? { lastTransitionId } : {}),
  };
}

/** Normalize a persisted transition record used for replay/idempotency. */
export function normalizeDirectionalIrritationTransitionV1(
  value: unknown,
): DirectionalIrritationTransitionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const transitionId =
    typeof row.transitionId === "string" && row.transitionId.trim()
      ? row.transitionId.trim().slice(0, 180)
      : null;
  const reason =
    row.reason === "meaningful_cutoff" ||
    row.reason === "rebuff" ||
    row.reason === "clean_turn_decay"
      ? row.reason
      : null;
  const subjectBotId = boundedBotId(row.subjectBotId);
  const targetBotId = boundedBotId(row.targetBotId);
  const occurredAt =
    typeof row.occurredAt === "string" && row.occurredAt.trim()
      ? row.occurredAt.trim()
      : null;
  if (
    row.v !== DIRECTIONAL_IRRITATION_VERSION ||
    row.name !== "directionalIrritation" ||
    !transitionId ||
    !reason ||
    !subjectBotId ||
    !targetBotId ||
    subjectBotId === targetBotId ||
    !occurredAt
  ) {
    return null;
  }
  const before = normalizeDirectionalIrritationIntensity(row.before);
  const after = normalizeDirectionalIrritationIntensity(row.after);
  return {
    v: DIRECTIONAL_IRRITATION_VERSION,
    name: "directionalIrritation",
    transitionId,
    reason,
    subjectBotId,
    targetBotId,
    before,
    after,
    delta: Number((after - before).toFixed(4)),
    tier: directionalIrritationTierFromIntensity(after),
    occurredAt,
  };
}

/** Normalize delivery metadata attached to utterances and reaction plans. */
export function normalizeDirectionalIrritationDeliveryPlanV1(
  value: unknown,
): DirectionalIrritationDeliveryPlanV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const subjectBotId = boundedBotId(row.subjectBotId);
  const targetBotId = boundedBotId(row.targetBotId);
  if (
    row.v !== DIRECTIONAL_IRRITATION_VERSION ||
    row.name !== "directionalIrritationDelivery" ||
    !subjectBotId ||
    !targetBotId ||
    subjectBotId === targetBotId
  ) {
    return null;
  }
  const intensity = normalizeDirectionalIrritationIntensity(row.intensity);
  const tier = directionalIrritationTierFromIntensity(intensity);
  const moodKey =
    row.moodKey === "joyful" ||
    row.moodKey === "warm" ||
    row.moodKey === "neutral" ||
    row.moodKey === "guarded" ||
    row.moodKey === "strained"
      ? row.moodKey
      : directionalIrritationMoodKey(tier);
  const gainDbBoost =
    typeof row.gainDbBoost === "number" && Number.isFinite(row.gainDbBoost)
      ? Math.max(
          0,
          Math.min(DIRECTIONAL_IRRITATION_GAIN_DB_MAX, row.gainDbBoost),
        )
      : 0;
  const snarkCue =
    typeof row.snarkCue === "string" && row.snarkCue.trim()
      ? row.snarkCue.replace(/\s+/gu, " ").trim().slice(0, 120)
      : undefined;
  const vocalFoley =
    row.vocalFoley === "sighs" ||
    row.vocalFoley === "clears throat" ||
    row.vocalFoley === "exhales" ||
    row.vocalFoley === "coughs" ||
    row.vocalFoley === "chuckles"
      ? (row.vocalFoley as ListenerReactionVocalFoley)
      : undefined;
  return {
    v: DIRECTIONAL_IRRITATION_VERSION,
    name: "directionalIrritationDelivery",
    subjectBotId,
    targetBotId,
    intensity,
    tier,
    moodKey,
    gainDbBoost: Number(gainDbBoost.toFixed(3)),
    ...(snarkCue ? { snarkCue } : {}),
    ...(!snarkCue && vocalFoley ? { vocalFoley } : {}),
  };
}

/**
 * Build a unique transition id so pause retries / reloads cannot double-apply
 * the same interruption consequence.
 */
export function directionalIrritationTransitionId(args: {
  sessionId: string;
  reason: DirectionalIrritationTransitionReason;
  subjectBotId: string;
  targetBotId: string;
  causeId: string;
}): string {
  return [
    "dir-irritation-v1",
    args.reason,
    args.sessionId.trim(),
    args.subjectBotId.trim(),
    args.targetBotId.trim(),
    args.causeId.trim(),
  ]
    .join(":")
    .slice(0, 180);
}

/** Severity 0…1 from how early the audience-heard cutoff landed. */
export function directionalIrritationCutoffSeverity(args: {
  heardRatio?: number | null;
}): number {
  if (
    typeof args.heardRatio !== "number" ||
    !Number.isFinite(args.heardRatio)
  ) {
    return 0.5;
  }
  // Earlier cutoffs feel worse: heardRatio 0 → severity 1, heardRatio 1 → 0.
  return clamp01(1 - Math.max(0, Math.min(1, args.heardRatio)));
}

/** Delta applied to the interrupted bot toward the interrupter. */
export function directionalIrritationCutoffDelta(args: {
  heardRatio?: number | null;
}): number {
  const severity = directionalIrritationCutoffSeverity(args);
  return roundIntensity(
    DIRECTIONAL_IRRITATION_CUTOFF_BASE_DELTA +
      severity * DIRECTIONAL_IRRITATION_CUTOFF_SEVERITY_MAX_DELTA,
  );
}

function buildTransition(args: {
  transitionId: string;
  reason: DirectionalIrritationTransitionReason;
  subjectBotId: string;
  targetBotId: string;
  before: number;
  after: number;
  occurredAt: string;
}): DirectionalIrritationTransitionV1 {
  const before = normalizeDirectionalIrritationIntensity(args.before);
  const after = normalizeDirectionalIrritationIntensity(args.after);
  return {
    v: DIRECTIONAL_IRRITATION_VERSION,
    name: "directionalIrritation",
    transitionId: args.transitionId,
    reason: args.reason,
    subjectBotId: args.subjectBotId,
    targetBotId: args.targetBotId,
    before,
    after,
    delta: Number((after - before).toFixed(4)),
    tier: directionalIrritationTierFromIntensity(after),
    occurredAt: args.occurredAt,
  };
}

function upsertEdge(args: {
  edges: ReadonlyMap<string, DirectionalIrritationEdgeV1> | Record<string, DirectionalIrritationEdgeV1>;
  subjectBotId: string;
  targetBotId: string;
  intensity: number;
  updatedAt: string;
  lastTransitionId: string;
}): DirectionalIrritationEdgeV1 {
  return {
    v: DIRECTIONAL_IRRITATION_VERSION,
    subjectBotId: args.subjectBotId,
    targetBotId: args.targetBotId,
    intensity: normalizeDirectionalIrritationIntensity(args.intensity),
    updatedAt: args.updatedAt,
    lastTransitionId: args.lastTransitionId,
  };
}

export function directionalIrritationEdgeKey(
  subjectBotId: string,
  targetBotId: string,
): string {
  return `${subjectBotId.trim()}→${targetBotId.trim()}`;
}

export function readDirectionalIrritationIntensity(args: {
  edges:
    | ReadonlyMap<string, DirectionalIrritationEdgeV1>
    | Record<string, DirectionalIrritationEdgeV1>
    | null
    | undefined;
  subjectBotId: string;
  targetBotId: string;
}): number {
  if (!args.edges) return 0;
  const key = directionalIrritationEdgeKey(
    args.subjectBotId,
    args.targetBotId,
  );
  if (args.edges instanceof Map) {
    return normalizeDirectionalIrritationIntensity(
      args.edges.get(key)?.intensity,
    );
  }
  const record = args.edges as Record<string, DirectionalIrritationEdgeV1>;
  return normalizeDirectionalIrritationIntensity(record[key]?.intensity);
}

/**
 * Apply a meaningful bot-to-bot cutoff: interrupted bot gains irritation toward
 * the interrupter. Returns null when the transition id was already applied.
 */
export function applyDirectionalIrritationCutoff(args: {
  edges: Record<string, DirectionalIrritationEdgeV1>;
  appliedTransitionIds: ReadonlySet<string>;
  sessionId: string;
  interruptedBotId: string;
  interrupterBotId: string;
  causeId: string;
  heardRatio?: number | null;
  occurredAt: string;
}): {
  edges: Record<string, DirectionalIrritationEdgeV1>;
  transition: DirectionalIrritationTransitionV1;
} | null {
  const subjectBotId = args.interruptedBotId.trim();
  const targetBotId = args.interrupterBotId.trim();
  if (!subjectBotId || !targetBotId || subjectBotId === targetBotId) {
    return null;
  }
  const transitionId = directionalIrritationTransitionId({
    sessionId: args.sessionId,
    reason: "meaningful_cutoff",
    subjectBotId,
    targetBotId,
    causeId: args.causeId,
  });
  if (args.appliedTransitionIds.has(transitionId)) return null;
  const key = directionalIrritationEdgeKey(subjectBotId, targetBotId);
  const before = normalizeDirectionalIrritationIntensity(
    args.edges[key]?.intensity,
  );
  const after = roundIntensity(
    before + directionalIrritationCutoffDelta({ heardRatio: args.heardRatio }),
  );
  const transition = buildTransition({
    transitionId,
    reason: "meaningful_cutoff",
    subjectBotId,
    targetBotId,
    before,
    after,
    occurredAt: args.occurredAt,
  });
  return {
    edges: {
      ...args.edges,
      [key]: upsertEdge({
        edges: args.edges,
        subjectBotId,
        targetBotId,
        intensity: after,
        updatedAt: args.occurredAt,
        lastTransitionId: transitionId,
      }),
    },
    transition,
  };
}

/**
 * Apply the smaller rebuff delta when an interrupter is rejected by resistance.
 * Returns null when the transition id was already applied.
 */
export function applyDirectionalIrritationRebuff(args: {
  edges: Record<string, DirectionalIrritationEdgeV1>;
  appliedTransitionIds: ReadonlySet<string>;
  sessionId: string;
  interrupterBotId: string;
  interruptedBotId: string;
  causeId: string;
  occurredAt: string;
}): {
  edges: Record<string, DirectionalIrritationEdgeV1>;
  transition: DirectionalIrritationTransitionV1;
} | null {
  const subjectBotId = args.interrupterBotId.trim();
  const targetBotId = args.interruptedBotId.trim();
  if (!subjectBotId || !targetBotId || subjectBotId === targetBotId) {
    return null;
  }
  const transitionId = directionalIrritationTransitionId({
    sessionId: args.sessionId,
    reason: "rebuff",
    subjectBotId,
    targetBotId,
    causeId: args.causeId,
  });
  if (args.appliedTransitionIds.has(transitionId)) return null;
  const key = directionalIrritationEdgeKey(subjectBotId, targetBotId);
  const before = normalizeDirectionalIrritationIntensity(
    args.edges[key]?.intensity,
  );
  const after = roundIntensity(before + DIRECTIONAL_IRRITATION_REBUFF_DELTA);
  const transition = buildTransition({
    transitionId,
    reason: "rebuff",
    subjectBotId,
    targetBotId,
    before,
    after,
    occurredAt: args.occurredAt,
  });
  return {
    edges: {
      ...args.edges,
      [key]: upsertEdge({
        edges: args.edges,
        subjectBotId,
        targetBotId,
        intensity: after,
        updatedAt: args.occurredAt,
        lastTransitionId: transitionId,
      }),
    },
    transition,
  };
}

/**
 * Cool every outgoing edge from a bot after an uninterrupted substantive turn.
 * Returns only edges that actually changed.
 */
export function applyDirectionalIrritationCleanTurnDecay(args: {
  edges: Record<string, DirectionalIrritationEdgeV1>;
  appliedTransitionIds: ReadonlySet<string>;
  sessionId: string;
  speakerBotId: string;
  causeId: string;
  occurredAt: string;
}): {
  edges: Record<string, DirectionalIrritationEdgeV1>;
  transitions: DirectionalIrritationTransitionV1[];
} {
  const speakerBotId = args.speakerBotId.trim();
  if (!speakerBotId) {
    return { edges: args.edges, transitions: [] };
  }
  let nextEdges = args.edges;
  const transitions: DirectionalIrritationTransitionV1[] = [];
  for (const [key, edge] of Object.entries(args.edges)) {
    if (edge.subjectBotId !== speakerBotId || edge.intensity <= 0) continue;
    const transitionId = directionalIrritationTransitionId({
      sessionId: args.sessionId,
      reason: "clean_turn_decay",
      subjectBotId: edge.subjectBotId,
      targetBotId: edge.targetBotId,
      causeId: `${args.causeId}:${edge.targetBotId}`,
    });
    if (args.appliedTransitionIds.has(transitionId)) continue;
    const before = normalizeDirectionalIrritationIntensity(edge.intensity);
    const after = roundIntensity(
      before - DIRECTIONAL_IRRITATION_CLEAN_TURN_DECAY,
    );
    if (after === before) continue;
    const transition = buildTransition({
      transitionId,
      reason: "clean_turn_decay",
      subjectBotId: edge.subjectBotId,
      targetBotId: edge.targetBotId,
      before,
      after,
      occurredAt: args.occurredAt,
    });
    transitions.push(transition);
    nextEdges = {
      ...nextEdges,
      [key]: upsertEdge({
        edges: nextEdges,
        subjectBotId: edge.subjectBotId,
        targetBotId: edge.targetBotId,
        intensity: after,
        updatedAt: args.occurredAt,
        lastTransitionId: transitionId,
      }),
    };
  }
  return { edges: nextEdges, transitions };
}

/**
 * Fold ordered Signal/Coffee transition events into a current edge map.
 * Later transitions overwrite earlier intensity for the same pair.
 */
export function foldDirectionalIrritationTransitions(
  transitions: readonly DirectionalIrritationTransitionV1[],
): Record<string, DirectionalIrritationEdgeV1> {
  const edges: Record<string, DirectionalIrritationEdgeV1> = {};
  for (const transition of transitions) {
    const key = directionalIrritationEdgeKey(
      transition.subjectBotId,
      transition.targetBotId,
    );
    edges[key] = {
      v: DIRECTIONAL_IRRITATION_VERSION,
      subjectBotId: transition.subjectBotId,
      targetBotId: transition.targetBotId,
      intensity: transition.after,
      updatedAt: transition.occurredAt,
      lastTransitionId: transition.transitionId,
    };
  }
  return edges;
}

/**
 * Bias an existing reclaim chance with directed irritation, never replacing
 * Powers or the base floor planner.
 */
export function biasReclaimChanceWithDirectionalIrritation(args: {
  baseChance: number;
  intensity: number;
}): number {
  const base =
    typeof args.baseChance === "number" && Number.isFinite(args.baseChance)
      ? Math.max(0, Math.min(1, args.baseChance))
      : 0;
  const intensity = normalizeDirectionalIrritationIntensity(args.intensity);
  const bias = intensity * DIRECTIONAL_IRRITATION_RECLAIM_BIAS_MAX;
  return Math.min(DIRECTIONAL_IRRITATION_RECLAIM_CEILING, base + bias);
}

export function directionalIrritationMoodKey(
  tier: DirectionalIrritationTier,
): VoiceDeliveryMood {
  switch (tier) {
    case "high":
      return "strained";
    case "medium":
      return "strained";
    case "low":
      return "guarded";
    case "none":
      return "neutral";
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export function directionalIrritationGainDbBoost(
  intensity: number,
): number {
  const value = normalizeDirectionalIrritationIntensity(intensity);
  return Number((value * DIRECTIONAL_IRRITATION_GAIN_DB_MAX).toFixed(3));
}

export function directionalIrritationSnarkChance(
  intensity: number,
): number {
  return (
    normalizeDirectionalIrritationIntensity(intensity) *
    DIRECTIONAL_IRRITATION_SNARK_CHANCE_MAX
  );
}

export function directionalIrritationFoleyChance(
  intensity: number,
): number {
  return (
    normalizeDirectionalIrritationIntensity(intensity) *
    DIRECTIONAL_IRRITATION_FOLEY_CHANCE_MAX
  );
}

/**
 * Build verbal-forward delivery metadata. Snark and Foley are mutually
 * exclusive; neither may schedule a new interruption or camera cut.
 */
export function planDirectionalIrritationDeliveryV1(args: {
  subjectBotId: string;
  targetBotId: string;
  intensity: number;
  seed: string;
  role: "interrupted" | "interrupter" | "speaker";
}): DirectionalIrritationDeliveryPlanV1 | null {
  const subjectBotId = args.subjectBotId.trim();
  const targetBotId = args.targetBotId.trim();
  const intensity = normalizeDirectionalIrritationIntensity(args.intensity);
  if (!subjectBotId || !targetBotId || subjectBotId === targetBotId) {
    return null;
  }
  if (intensity < DIRECTIONAL_IRRITATION_TIER_LOW) return null;
  const tier = directionalIrritationTierFromIntensity(intensity);
  const moodKey = directionalIrritationMoodKey(tier);
  const gainDbBoost = directionalIrritationGainDbBoost(intensity);
  const snarkRoll = stableUnit(`${args.seed}:snark`);
  const foleyRoll = stableUnit(`${args.seed}:foley`);
  const snarkChance = directionalIrritationSnarkChance(intensity);
  const foleyChance = directionalIrritationFoleyChance(intensity);
  const snarkBank =
    args.role === "interrupter"
      ? DIRECTIONAL_IRRITATION_REBUFF_SNARK_CUES
      : DIRECTIONAL_IRRITATION_SNARK_CUES;
  const snarkCue =
    snarkRoll < snarkChance
      ? chooseCue(`${args.seed}:snark-cue`, snarkBank)
      : undefined;
  const vocalFoley =
    !snarkCue && foleyRoll < foleyChance
      ? chooseCue(`${args.seed}:foley-cue`, DIRECTIONAL_IRRITATION_FOLEY_CUES)
      : undefined;
  return {
    v: DIRECTIONAL_IRRITATION_VERSION,
    name: "directionalIrritationDelivery",
    subjectBotId,
    targetBotId,
    intensity,
    tier,
    moodKey,
    gainDbBoost,
    ...(snarkCue ? { snarkCue } : {}),
    ...(vocalFoley ? { vocalFoley } : {}),
  };
}

/**
 * Soft prompt lines for speakers who currently hold directed irritation.
 * Keep this as background pressure — never a recurring agenda.
 */
export function formatDirectionalIrritationPromptLines(args: {
  speakerBotId: string;
  edges: Record<string, DirectionalIrritationEdgeV1>;
  botNamesById?: Record<string, string>;
}): string[] {
  const speakerBotId = args.speakerBotId.trim();
  if (!speakerBotId) return [];
  const lines: string[] = [];
  for (const edge of Object.values(args.edges)) {
    if (edge.subjectBotId !== speakerBotId) continue;
    const tier = directionalIrritationTierFromIntensity(edge.intensity);
    if (tier === "none") continue;
    const targetName =
      args.botNamesById?.[edge.targetBotId]?.trim() || "another speaker";
    if (tier === "high") {
      lines.push(
        `You are sharply annoyed with ${targetName} after repeated interruptions. Prefer finishing your thought and reclaiming the floor when cut off. Stay in character; do not lecture about interruptions.`,
      );
    } else if (tier === "medium") {
      lines.push(
        `You are irritated with ${targetName} from recent cutoffs. Speak a little sharper and protect unfinished thoughts when interrupted.`,
      );
    } else {
      lines.push(
        `You feel mildly short with ${targetName} after a recent interruption. Let that color tone lightly without making it the topic.`,
      );
    }
  }
  return lines.slice(0, 3);
}

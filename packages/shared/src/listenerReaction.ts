import type { VoiceDeliveryMood } from "./audioVoice.js";
import type {
  CoffeeCrossTalkLevel,
  CoffeeTableEnergy,
} from "./coffeeSettings.js";
import { DIRECTIONAL_IRRITATION_SNARK_CUES } from "./directionalIrritation.ts";

export const LISTENER_REACTION_PLAN_VERSION = 1 as const;
export const CROSSTALK_RECLAIM_PLAN_VERSION = 1 as const;
export const SOCIAL_SILENCE_MARKER_VERSION = 1 as const;
export const SOCIAL_SILENCE_CONTENT = "..." as const;
export const SOCIAL_SILENCE_MAX_CONSECUTIVE_TURNS = 4 as const;
export const SOCIAL_SILENCE_DEFAULT_HOLD_MS = 900 as const;
/** At or beyond this heard ratio, a cut-in no longer warrants a retort/reclaim. */
export const CROSSTALK_MEANINGFUL_CUTOFF_HEARD_RATIO = 0.85;

export type CrosstalkFloorOutcome = "yield" | "reclaim";
export interface CrosstalkReclaimPlanV1 {
  v: typeof CROSSTALK_RECLAIM_PLAN_VERSION;
  name: "crosstalkReclaim";
  interruptedMessageId: string;
  speakerBotId: string;
  /** Exact audience-heard fragment. Unheard suffixes must never enter this field. */
  heardFragment: string;
  /** A reclaim cannot be interrupted again on its first linked turn. */
  protectFromImmediateReinterruption: true;
}

export type SocialSilenceModeV1 = "coffee" | "signal";
export type SocialSilenceExclusionV1 =
  | "kickoff"
  | "opening"
  | "closing"
  | "poll"
  | "direct_player_obligation"
  | "departure"
  | "required_wrap"
  | "reclaim"
  | "producer_control"
  | "power_interruption"
  | "power_silence";

export interface SocialSilenceMarkerV1 {
  v: typeof SOCIAL_SILENCE_MARKER_VERSION;
  name: "socialSilence";
  provenance: "social";
  mode: SocialSilenceModeV1;
  seed: string;
  /** One-based position in the current ordinary-silence volley. */
  volleyTurn: 1 | 2 | 3 | 4;
  /** Brief visual hold used by live and replay presentation. */
  holdMs: number;
}

export type SocialSilencePlanV1 =
  | {
      decision: "social_silence";
      forceSubstantive: false;
      marker: SocialSilenceMarkerV1;
    }
  | {
      decision: "substantive";
      forceSubstantive: boolean;
      reason: "chance" | "excluded" | "cap";
    };

export type ListenerReactionTargetSource = "role" | "direct" | "inferred";
export type ListenerReactionVisualAction =
  | "nod"
  | "lean_in"
  | "head_tilt"
  | "soft_smile"
  | "thoughtful_hmm";
export type ListenerReactionSpokenCue =
  | "mm-hm"
  | "mm-hmm"
  | "I see"
  | "hmm"
  | "right"
  | "oh"
  | "go on"
  | "sure, sure"
  | "No, hold on."
  | "Let me answer that."
  | "That's not fair."
  | "Wait a second."
  | "Hold on."
  | "Hang on."
  | "One second.";
export const BOT_CROSSTALK_INTERRUPTER_CUES = [
  "Wait a second.",
  "Hold on.",
  "Hang on.",
  "One second.",
  "No, hold on.",
] as const satisfies readonly ListenerReactionSpokenCue[];
export const BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES = [
  "... okay, never mind, I guess.",
  "... right. Apparently we're moving on.",
  "... sure. Go ahead.",
  "... fine. I'll stop there.",
  "... okay. I'll leave it.",
  ...DIRECTIONAL_IRRITATION_SNARK_CUES,
] as const;
export type BotCrosstalkInterruptedSpeakerCue =
  (typeof BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES)[number];
export type BotCrosstalkInterruptedSpeakerPlayback = "primary" | "crosstalk";
export const LISTENER_REACTION_VOCAL_FOLEYS = [
  "clears throat",
  "coughs",
  "sighs",
  "exhales",
  "chuckles",
] as const;
export type ListenerReactionVocalFoley =
  (typeof LISTENER_REACTION_VOCAL_FOLEYS)[number];

export interface ListenerReactionPlanV1 {
  v: typeof LISTENER_REACTION_PLAN_VERSION;
  name: "listenerReaction";
  speakerBotId: string;
  listenerBotId: string;
  messageId: string;
  targetSource: ListenerReactionTargetSource;
  visualAction: ListenerReactionVisualAction;
  spokenCue?: ListenerReactionSpokenCue;
  /** Provider-generated nonverbal vocal sound. ElevenLabs-only at playback. */
  vocalFoley?: ListenerReactionVocalFoley;
  /** A tense guest trying to cut across the host without taking transcript ownership. */
  interjectionAttempt?: true;
  /** Canonical floor result for bot-to-bot interruption playback. */
  floorOutcome?: CrosstalkFloorOutcome;
  /** Short annoyed follow-up spoken by the bot whose live line was cut off. */
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
  /** Whether the follow-up is already part of primary audio or needs its own overlap channel. */
  interruptedSpeakerCuePlayback?: BotCrosstalkInterruptedSpeakerPlayback;
  /** Relative position inside the speaker's delivery. Always 0.3..0.9. */
  targetProgress: number;
  seed: string;
  /** Signal may temporarily favor the listener only while Auto camera is active. */
  cameraCutEligible: boolean;
}

export interface ListenerReactionCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

const VISUAL_ACTIONS = new Set<ListenerReactionVisualAction>([
  "nod",
  "lean_in",
  "head_tilt",
  "soft_smile",
  "thoughtful_hmm",
]);
const SPOKEN_CUES = new Set<ListenerReactionSpokenCue>([
  "mm-hm",
  "mm-hmm",
  "I see",
  "hmm",
  "right",
  "oh",
  "go on",
  "sure, sure",
  "No, hold on.",
  "Let me answer that.",
  "That's not fair.",
  "Wait a second.",
  "Hold on.",
  "Hang on.",
  "One second.",
]);
const INTERRUPTED_SPEAKER_CUES = new Set<BotCrosstalkInterruptedSpeakerCue>(
  BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES,
);
const VOCAL_FOLEYS = new Set<ListenerReactionVocalFoley>(
  LISTENER_REACTION_VOCAL_FOLEYS,
);

export function normalizeListenerReactionVocalFoley(
  value: unknown,
): ListenerReactionVocalFoley | null {
  return VOCAL_FOLEYS.has(value as ListenerReactionVocalFoley)
    ? value as ListenerReactionVocalFoley
    : null;
}

/** Normalize a persisted listener utterance against the authored cue bank. */
export function normalizeListenerReactionSpokenCue(
  value: unknown,
): ListenerReactionSpokenCue | null {
  return SPOKEN_CUES.has(value as ListenerReactionSpokenCue)
    ? value as ListenerReactionSpokenCue
    : null;
}

export function normalizeBotCrosstalkInterruptedSpeakerCue(
  value: unknown,
): BotCrosstalkInterruptedSpeakerCue | null {
  return INTERRUPTED_SPEAKER_CUES.has(
      value as BotCrosstalkInterruptedSpeakerCue,
    )
    ? value as BotCrosstalkInterruptedSpeakerCue
    : null;
}

export function listenerReactionHasAudio(
  plan: Pick<ListenerReactionPlanV1, "spokenCue" | "vocalFoley">,
): boolean {
  return Boolean(plan.spokenCue || plan.vocalFoley);
}

export function listenerReactionHasCrosstalkAudio(
  plan: Pick<
    ListenerReactionPlanV1,
    "spokenCue" | "vocalFoley" | "interruptedSpeakerCue"
  >,
): boolean {
  return Boolean(
    plan.spokenCue || plan.vocalFoley || plan.interruptedSpeakerCue,
  );
}

// Attentive presence should be the norm in Signal; the remaining gaps keep
// listener reactions from feeling metronomic.
const SIGNAL_VISUAL_REACTION_CHANCE = 0.82;

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 160 ? normalized : null;
}

function boundedHeardFragment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized && normalized.length <= 8_000 ? normalized : null;
}

export function normalizeCrosstalkFloorOutcome(
  value: unknown,
): CrosstalkFloorOutcome | null {
  if (value === "yield") return "yield";
  // `resume` was the pre-contract Coffee spelling. Accept it at storage seams
  // while emitting only the canonical `reclaim` value.
  if (value === "reclaim" || value === "resume") return "reclaim";
  return null;
}

export function normalizeCrosstalkReclaimPlanV1(
  value: unknown,
): CrosstalkReclaimPlanV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const interruptedMessageId = boundedId(row.interruptedMessageId);
  const speakerBotId = boundedId(row.speakerBotId);
  const heardFragment = boundedHeardFragment(row.heardFragment);
  if (
    row.v !== CROSSTALK_RECLAIM_PLAN_VERSION ||
    row.name !== "crosstalkReclaim" ||
    !interruptedMessageId ||
    !speakerBotId ||
    !heardFragment ||
    row.protectFromImmediateReinterruption !== true
  ) {
    return null;
  }
  return {
    v: CROSSTALK_RECLAIM_PLAN_VERSION,
    name: "crosstalkReclaim",
    interruptedMessageId,
    speakerBotId,
    heardFragment,
    protectFromImmediateReinterruption: true,
  };
}

export function normalizeSocialSilenceMarkerV1(
  value: unknown,
): SocialSilenceMarkerV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const seed = boundedId(row.seed);
  const mode = row.mode === "coffee" || row.mode === "signal"
    ? row.mode
    : null;
  const volleyTurn =
    row.volleyTurn === 1 ||
      row.volleyTurn === 2 ||
      row.volleyTurn === 3 ||
      row.volleyTurn === 4
      ? row.volleyTurn
      : null;
  const holdMs = typeof row.holdMs === "number" && Number.isFinite(row.holdMs)
    ? Math.round(Math.max(400, Math.min(2_000, row.holdMs)))
    : null;
  if (
    row.v !== SOCIAL_SILENCE_MARKER_VERSION ||
    row.name !== "socialSilence" ||
    row.provenance !== "social" ||
    !mode ||
    !seed ||
    !volleyTurn ||
    holdMs === null
  ) {
    return null;
  }
  return {
    v: SOCIAL_SILENCE_MARKER_VERSION,
    name: "socialSilence",
    provenance: "social",
    mode,
    seed,
    volleyTurn,
    holdMs,
  };
}

/**
 * Plans an ordinary social-silence beat from a stable seed. Callers provide
 * mode-specific mood/flow weighting as `chance` and explicit exclusions.
 */
export function planSocialSilenceV1(args: {
  mode: SocialSilenceModeV1;
  seed: string;
  chance: number;
  consecutiveSocialSilenceTurns: number;
  exclusions?: readonly SocialSilenceExclusionV1[];
}): SocialSilencePlanV1 {
  const exclusions = args.exclusions ?? [];
  if (exclusions.length > 0) {
    return {
      decision: "substantive",
      forceSubstantive: false,
      reason: "excluded",
    };
  }
  const consecutiveTurns = Math.max(
    0,
    Math.floor(args.consecutiveSocialSilenceTurns),
  );
  if (consecutiveTurns >= SOCIAL_SILENCE_MAX_CONSECUTIVE_TURNS) {
    return {
      decision: "substantive",
      forceSubstantive: true,
      reason: "cap",
    };
  }
  const chance = Math.max(0, Math.min(1, args.chance));
  if (!args.seed.trim() || stableUnit(`${args.seed}:social-silence`) >= chance) {
    return {
      decision: "substantive",
      forceSubstantive: false,
      reason: "chance",
    };
  }
  return {
    decision: "social_silence",
    forceSubstantive: false,
    marker: {
      v: SOCIAL_SILENCE_MARKER_VERSION,
      name: "socialSilence",
      provenance: "social",
      mode: args.mode,
      seed: args.seed.trim().slice(0, 160),
      volleyTurn: Math.min(
        SOCIAL_SILENCE_MAX_CONSECUTIVE_TURNS,
        consecutiveTurns + 1,
      ) as SocialSilenceMarkerV1["volleyTurn"],
      holdMs: SOCIAL_SILENCE_DEFAULT_HOLD_MS,
    },
  };
}

export function socialSilenceMessageIsMarkedV1(args: {
  content: string;
  marker: unknown;
  mode?: SocialSilenceModeV1;
}): boolean {
  const marker = normalizeSocialSilenceMarkerV1(args.marker);
  return (
    args.content.trim() === SOCIAL_SILENCE_CONTENT &&
    marker !== null &&
    (!args.mode || marker.mode === args.mode)
  );
}

export function normalizeListenerReactionPlanV1(
  value: unknown,
): ListenerReactionPlanV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== LISTENER_REACTION_PLAN_VERSION || row.name !== "listenerReaction") {
    return null;
  }
  const speakerBotId = boundedId(row.speakerBotId);
  const listenerBotId = boundedId(row.listenerBotId);
  const messageId = boundedId(row.messageId);
  const seed = boundedId(row.seed);
  const targetSource =
    row.targetSource === "role" ||
      row.targetSource === "direct" ||
      row.targetSource === "inferred"
      ? row.targetSource
      : null;
  const visualAction = VISUAL_ACTIONS.has(row.visualAction as ListenerReactionVisualAction)
    ? row.visualAction as ListenerReactionVisualAction
    : null;
  const spokenCue = SPOKEN_CUES.has(row.spokenCue as ListenerReactionSpokenCue)
    ? row.spokenCue as ListenerReactionSpokenCue
    : undefined;
  const vocalFoley = normalizeListenerReactionVocalFoley(row.vocalFoley) ??
    undefined;
  const interjectionAttempt = row.interjectionAttempt === true;
  const floorOutcome = normalizeCrosstalkFloorOutcome(row.floorOutcome) ??
    undefined;
  const interruptedSpeakerCue =
    normalizeBotCrosstalkInterruptedSpeakerCue(row.interruptedSpeakerCue) ??
    undefined;
  const interruptedSpeakerCuePlayback =
    row.interruptedSpeakerCuePlayback === "primary" ||
      row.interruptedSpeakerCuePlayback === "crosstalk"
      ? row.interruptedSpeakerCuePlayback
      : undefined;
  const targetProgress = typeof row.targetProgress === "number" &&
      Number.isFinite(row.targetProgress)
    ? Math.max(0.3, Math.min(0.9, row.targetProgress))
    : null;
  if (
    !speakerBotId ||
    !listenerBotId ||
    speakerBotId === listenerBotId ||
    !messageId ||
    !seed ||
    !targetSource ||
    !visualAction ||
    targetProgress === null ||
    typeof row.cameraCutEligible !== "boolean"
  ) {
    return null;
  }
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId,
    listenerBotId,
    messageId,
    targetSource,
    visualAction,
    ...(spokenCue ? { spokenCue } : {}),
    ...(!spokenCue && vocalFoley ? { vocalFoley } : {}),
    ...(interjectionAttempt ? { interjectionAttempt: true as const } : {}),
    ...(interjectionAttempt && floorOutcome ? { floorOutcome } : {}),
    ...(interjectionAttempt && floorOutcome !== "reclaim" && interruptedSpeakerCue
      ? {
          interruptedSpeakerCue,
          interruptedSpeakerCuePlayback:
            interruptedSpeakerCuePlayback ?? "crosstalk",
        }
      : {}),
    targetProgress: Number(targetProgress.toFixed(3)),
    seed,
    cameraCutEligible: row.cameraCutEligible,
  };
}

function choose<T>(seed: string, values: readonly T[]): T {
  return values[Math.floor(stableUnit(seed) * values.length) % values.length]!;
}

export function botCrosstalkInterrupterCueForSeed(
  seed: string,
): ListenerReactionSpokenCue {
  return choose(`${seed}:interrupter`, BOT_CROSSTALK_INTERRUPTER_CUES);
}

export function botCrosstalkInterruptedSpeakerCueForSeed(
  seed: string,
): BotCrosstalkInterruptedSpeakerCue {
  return choose(`${seed}:interrupted`, BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES);
}

/**
 * Distinguishes a meaningful cutoff from a late overlap after the point landed.
 * The interrupter may still enter, but late overlaps should not provoke a
 * canned retort or a protected reclaim turn.
 */
export function crosstalkInterruptionIsMeaningfulV1(args: {
  originalWordCount: number;
  heardWordCount: number;
}): boolean {
  if (
    !Number.isFinite(args.originalWordCount) ||
    !Number.isFinite(args.heardWordCount)
  ) {
    return false;
  }
  const originalWordCount = Math.max(0, Math.floor(args.originalWordCount));
  const heardWordCount = Math.max(
    0,
    Math.min(originalWordCount, Math.floor(args.heardWordCount)),
  );
  if (
    originalWordCount < 2 ||
    heardWordCount < 1 ||
    heardWordCount >= originalWordCount
  ) {
    return false;
  }
  return (
    heardWordCount / originalWordCount <
    CROSSTALK_MEANINGFUL_CUTOFF_HEARD_RATIO
  );
}

export function appendBotCrosstalkInterruptedSpeakerCue(
  interruptedContent: string,
  cue: BotCrosstalkInterruptedSpeakerCue,
): string {
  const prefix = interruptedContent.replace(/\s+/gu, " ").trimEnd();
  if (!prefix) return cue;
  const cutoff = /[—–-]$/u.test(prefix) ? prefix : `${prefix}—`;
  return `${cutoff}${cue}`;
}

/** Keeps the saved transcript retort while excluding it from primary speech.
 * The retort is played later on the crosstalk channel after a processing beat. */
export function botCrosstalkPrimarySpeakerContent(
  content: string,
  plan: Pick<
    ListenerReactionPlanV1,
    "interruptedSpeakerCue" | "interruptedSpeakerCuePlayback"
  > | null | undefined,
): string {
  const cue = plan?.interruptedSpeakerCue;
  if (!cue || plan?.interruptedSpeakerCuePlayback !== "crosstalk") {
    return content;
  }
  const trimmed = content.trimEnd();
  return trimmed.endsWith(cue)
    ? trimmed.slice(0, -cue.length).trimEnd()
    : content;
}

export function buildBotCrosstalkListenerReactionPlanV1(args: {
  seed: string;
  messageId: string;
  speakerBotId: string;
  interrupterBotId: string;
  targetProgress: number;
  floorOutcome?: CrosstalkFloorOutcome;
  interrupterCue?: ListenerReactionSpokenCue;
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
  interruptedSpeakerCuePlayback?: BotCrosstalkInterruptedSpeakerPlayback;
  includeInterruptedSpeakerCue?: boolean;
}): ListenerReactionPlanV1 {
  const floorOutcome = args.floorOutcome ?? "yield";
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.interrupterBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: "lean_in",
    spokenCue:
      args.interrupterCue ?? botCrosstalkInterrupterCueForSeed(args.seed),
    interjectionAttempt: true,
    floorOutcome,
    ...(floorOutcome === "yield" && args.includeInterruptedSpeakerCue !== false
      ? {
          interruptedSpeakerCue:
            args.interruptedSpeakerCue ??
            botCrosstalkInterruptedSpeakerCueForSeed(args.seed),
          interruptedSpeakerCuePlayback:
            args.interruptedSpeakerCuePlayback ?? "crosstalk",
        }
      : {}),
    targetProgress: Number(
      Math.max(0.3, Math.min(0.9, args.targetProgress)).toFixed(3),
    ),
    seed: args.seed,
    cameraCutEligible: true,
  };
}

function targetProgress(seed: string): number {
  return Number((0.3 + stableUnit(`${seed}:progress`) * 0.45).toFixed(3));
}

function signalVisualAction(
  seed: string,
  mood: VoiceDeliveryMood,
  tensionLevel: number,
): ListenerReactionVisualAction {
  if (tensionLevel >= 2 || mood === "strained") {
    return choose(`${seed}:visual:guarded`, ["head_tilt", "thoughtful_hmm"] as const);
  }
  if (mood === "warm" || mood === "joyful") {
    return choose(`${seed}:visual:warm`, ["nod", "soft_smile", "lean_in"] as const);
  }
  return choose(`${seed}:visual`, ["nod", "lean_in", "head_tilt"] as const);
}

function signalVocalFoley(
  seed: string,
  mood: VoiceDeliveryMood,
  tensionLevel: number,
): ListenerReactionVocalFoley {
  if (tensionLevel >= 2 || mood === "strained") {
    return choose(
      `${seed}:foley:strained`,
      ["exhales", "clears throat", "coughs"] as const,
    );
  }
  if (mood === "warm" || mood === "joyful") {
    return choose(
      `${seed}:foley:warm`,
      ["chuckles", "sighs", "exhales"] as const,
    );
  }
  return choose(
    `${seed}:foley`,
    ["clears throat", "coughs", "sighs", "exhales"] as const,
  );
}

function signalSpokenBackchannel(
  seed: string,
  mood: VoiceDeliveryMood,
  tensionLevel: number,
  recentSpokenCues: readonly ListenerReactionSpokenCue[],
): ListenerReactionSpokenCue {
  const bank: readonly ListenerReactionSpokenCue[] =
    tensionLevel >= 2 || mood === "strained"
      ? ["hmm", "I see", "right"]
      : mood === "warm" || mood === "joyful"
        ? ["mm-hmm", "right", "sure, sure", "go on"]
        : ["mm-hmm", "right", "I see", "hmm", "sure, sure", "oh"];
  const recent = new Set(recentSpokenCues.slice(-2));
  const fresh = bank.filter((cue) => !recent.has(cue));
  return choose(`${seed}:spoken`, fresh.length > 0 ? fresh : bank);
}

export function buildSignalListenerReactionPlanV1(args: {
  episodeId: string;
  messageId: string;
  speakerBotId: string;
  listenerBotId: string;
  listenerRole: "host" | "guest";
  segment: "opening" | "interview" | "closing";
  mood: VoiceDeliveryMood;
  tensionLevel: number;
  /** Keeps an opening acknowledgement behind the completed cast introduction. */
  minimumTargetProgress?: number;
  /** Recent saved cues keep conversational acknowledgements from looping. */
  recentSpokenCues?: readonly ListenerReactionSpokenCue[];
}): ListenerReactionPlanV1 | null {
  if (!args.messageId || !args.speakerBotId || !args.listenerBotId) return null;
  const seed = [
    "signal-listener-v1",
    args.episodeId,
    args.messageId,
    args.speakerBotId,
    args.listenerBotId,
    args.segment,
    args.mood,
    Math.max(0, Math.round(args.tensionLevel)),
  ].join(":");
  const tensionLevel = Math.max(0, Math.round(args.tensionLevel));
  if (stableUnit(`${seed}:visual-roll`) >= SIGNAL_VISUAL_REACTION_CHANCE) {
    return null;
  }
  const audioChance =
    args.segment === "opening" && args.listenerRole === "guest"
      ? 0.68
      : args.listenerRole === "host"
        ? 0.72
        : 0.68;
  const audible =
    args.segment !== "closing" &&
    stableUnit(`${seed}:audio-roll`) < audioChance;
  const spokenCue =
    audible && stableUnit(`${seed}:spoken-roll`) < 0.92
      ? signalSpokenBackchannel(
          seed,
          args.mood,
          tensionLevel,
          args.recentSpokenCues ?? [],
        )
      : undefined;
  const vocalFoley =
    audible && !spokenCue
      ? signalVocalFoley(seed, args.mood, tensionLevel)
      : undefined;
  const minimumTargetProgress =
    typeof args.minimumTargetProgress === "number" &&
    Number.isFinite(args.minimumTargetProgress)
      ? Math.max(0.3, Math.min(0.9, args.minimumTargetProgress))
      : 0.3;
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: signalVisualAction(seed, args.mood, args.tensionLevel),
    ...(spokenCue ? { spokenCue } : {}),
    ...(vocalFoley ? { vocalFoley } : {}),
    targetProgress: Math.max(targetProgress(seed), minimumTargetProgress),
    seed,
    cameraCutEligible:
      stableUnit(`${seed}:camera-roll`) < 0.22,
  };
}

function coffeeEnergyMultiplier(energy: CoffeeTableEnergy): number {
  if (energy === "still") return 0.75;
  if (energy === "relaxed") return 0.9;
  if (energy === "buzzy") return 1.05;
  if (energy === "afterparty") return 1.25;
  return 1.15;
}

function coffeeAudibleChance(crossTalk: CoffeeCrossTalkLevel): number {
  if (crossTalk === "rare") return 0.025;
  if (crossTalk === "normal") return 0.08;
  if (crossTalk === "pileup") return 0.22;
  return 0.15;
}

function coffeeVisualAction(args: {
  seed: string;
  disposition: number;
  valuesFriction: number;
  restraint: number;
}): ListenerReactionVisualAction {
  if (args.valuesFriction >= 0.58 || args.disposition <= 0.34) {
    return choose(`${args.seed}:visual:cautious`, ["head_tilt", "thoughtful_hmm"] as const);
  }
  if (args.disposition >= 0.62 && args.restraint < 0.72) {
    return choose(`${args.seed}:visual:warm`, ["nod", "soft_smile", "lean_in"] as const);
  }
  return choose(`${args.seed}:visual`, ["nod", "head_tilt", "lean_in"] as const);
}

function coffeeVocalFoley(args: {
  seed: string;
  disposition: number;
  valuesFriction: number;
}): ListenerReactionVocalFoley {
  if (args.valuesFriction >= 0.58 || args.disposition <= 0.34) {
    return choose(
      `${args.seed}:foley:cautious`,
      ["exhales", "clears throat", "coughs"] as const,
    );
  }
  if (args.disposition >= 0.62) {
    return choose(
      `${args.seed}:foley:warm`,
      ["chuckles", "sighs", "exhales"] as const,
    );
  }
  return choose(
    `${args.seed}:foley`,
    ["clears throat", "coughs", "sighs", "exhales"] as const,
  );
}

export function buildCoffeeListenerReactionPlanV1(args: {
  conversationId: string;
  messageId: string;
  speakerBotId: string;
  listenerBotId: string;
  targetSource: "direct" | "inferred";
  tableEnergy: CoffeeTableEnergy;
  crossTalk: CoffeeCrossTalkLevel;
  listenerSocial?: {
    disposition: number;
    valuesFriction: number;
    restraint: number;
  } | null;
  eligible: boolean;
  allowAudio: boolean;
  previousAudibleListenerBotId?: string | null;
}): ListenerReactionPlanV1 | null {
  if (
    !args.eligible ||
    !args.messageId ||
    !args.speakerBotId ||
    !args.listenerBotId ||
    args.speakerBotId === args.listenerBotId
  ) {
    return null;
  }
  const seed = [
    "coffee-listener-v1",
    args.conversationId,
    args.messageId,
    args.speakerBotId,
    args.listenerBotId,
    args.targetSource,
    args.tableEnergy,
    args.crossTalk,
  ].join(":");
  const energyMultiplier = coffeeEnergyMultiplier(args.tableEnergy);
  const visualChance = (args.targetSource === "direct" ? 0.55 : 0.2) *
    energyMultiplier;
  if (stableUnit(`${seed}:visual-roll`) >= Math.min(0.75, visualChance)) {
    return null;
  }
  const social = args.listenerSocial ?? {
    disposition: 0.5,
    valuesFriction: 0.25,
    restraint: 0.55,
  };
  const consecutiveAudible =
    args.previousAudibleListenerBotId === args.listenerBotId;
  const audible = args.targetSource === "direct" &&
    args.allowAudio &&
    !consecutiveAudible &&
    stableUnit(`${seed}:audio-roll`) <
      Math.min(0.28, coffeeAudibleChance(args.crossTalk) * energyMultiplier);
  const vocalFoley = audible &&
      stableUnit(`${seed}:foley-roll`) < 0.3
    ? coffeeVocalFoley({ seed, ...social })
    : undefined;
  const spokenCue = audible && !vocalFoley
    ? social.valuesFriction >= 0.58 || social.disposition <= 0.34
      ? "hmm"
      : social.disposition >= 0.62 && social.restraint < 0.72
        ? choose(`${seed}:cue:warm`, ["mm-hm", "right", "oh"] as const)
        : choose(
            `${seed}:cue`,
            ["mm-hm", "I see", "hmm", "right", "oh", "go on"] as const,
          )
    : undefined;
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: args.targetSource,
    visualAction: coffeeVisualAction({ seed, ...social }),
    ...(spokenCue ? { spokenCue } : {}),
    ...(vocalFoley ? { vocalFoley } : {}),
    targetProgress: targetProgress(seed),
    seed,
    cameraCutEligible: false,
  };
}

function alignmentDurationSeconds(
  alignment: ListenerReactionCharacterAlignment,
): number | null {
  const count = alignment.characters.length;
  if (
    count === 0 ||
    count !== alignment.characterStartTimesSeconds.length ||
    count !== alignment.characterEndTimesSeconds.length
  ) return null;
  let previousStart = 0;
  let previousEnd = 0;
  for (let index = 0; index < count; index += 1) {
    const start = alignment.characterStartTimesSeconds[index];
    const end = alignment.characterEndTimesSeconds[index];
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < previousStart ||
      end < start ||
      end < previousEnd
    ) return null;
    previousStart = start;
    previousEnd = end;
  }
  return previousEnd > 0 ? previousEnd : null;
}

function nearestCandidate(
  candidates: readonly number[],
  targetMs: number,
): number | null {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - targetMs);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** Resolves a plan to a safe clause boundary or speech gap inside 30..75%. */
export function resolveListenerReactionAtMs(args: {
  text: string;
  durationMs: number;
  targetProgress: number;
  alignment?: ListenerReactionCharacterAlignment | null;
}): number {
  const durationMs = Math.max(1, Math.round(args.durationMs));
  const minimumMs = durationMs * 0.3;
  const maximumMs = durationMs * 0.75;
  const targetMs = Math.max(
    minimumMs,
    Math.min(maximumMs, durationMs * args.targetProgress),
  );
  const alignment = args.alignment;
  const alignmentDuration = alignment ? alignmentDurationSeconds(alignment) : null;
  if (alignment && alignmentDuration) {
    const scale = durationMs / (alignmentDuration * 1_000);
    const candidates: number[] = [];
    for (let index = 0; index < alignment.characters.length - 1; index += 1) {
      const character = alignment.characters[index] ?? "";
      const endMs = (alignment.characterEndTimesSeconds[index] ?? 0) * 1_000 * scale;
      const nextStartMs =
        (alignment.characterStartTimesSeconds[index + 1] ?? 0) * 1_000 * scale;
      if (
        endMs >= minimumMs &&
        endMs <= maximumMs &&
        (/[,.!?;:—–…]/u.test(character) || nextStartMs - endMs >= 90)
      ) {
        candidates.push(endMs);
      }
    }
    const aligned = nearestCandidate(candidates, targetMs);
    if (aligned !== null) return Math.round(aligned);
  }

  const characters = Array.from(args.text);
  const punctuationCandidates = characters.flatMap((character, index) => {
    if (!/[,;:—–….!?]/u.test(character)) return [];
    const progress = (index + 1) / Math.max(1, characters.length);
    const atMs = progress * durationMs;
    return atMs >= minimumMs && atMs <= maximumMs ? [atMs] : [];
  });
  return Math.round(nearestCandidate(punctuationCandidates, targetMs) ?? targetMs);
}

export function listenerReactionActionLabel(
  action: ListenerReactionVisualAction,
): string {
  if (action === "lean_in") return "leans in";
  if (action === "head_tilt") return "tilts head";
  if (action === "soft_smile") return "smiles softly";
  if (action === "thoughtful_hmm") return "considers";
  return "nods";
}

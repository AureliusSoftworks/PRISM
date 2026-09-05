import type {
  ListenerReactionPlanV1,
  ListenerReactionSpokenCue,
  ListenerReactionVisualAction,
} from "@localai/shared";
import type { SessionAmbientFoleyProfile } from "./session-atmosphere-audio.ts";

/** Coffee is allowed to feel busier than the shared studio defaults, but its
 * one-shots stay quiet enough to read as table life rather than notifications. */
export const COFFEE_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 5_500,
  maxDelayMs: 12_500,
  trim: 0.38,
} as const satisfies SessionAmbientFoleyProfile;

export const COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE = {
  minDelayMs: 18_000,
  maxDelayMs: 34_000,
  trim: 0.5,
} as const satisfies SessionAmbientFoleyProfile;

/** Existing bundled recordings only: ambient Coffee never needs a provider or
 * a network request to create physical table and room life. */
export const COFFEE_AMBIENT_FOLEY_URLS = [
  "/audio/session-atmosphere/coffee-cup-place.mp3",
  "/audio/session-atmosphere/coffee-sip.mp3",
  "/audio/session-atmosphere/clothing-shuffle.mp3",
  "/audio/session-atmosphere/soft-foot-tap.mp3",
  "/audio/debate/courtroom-chair-shift.mp3",
  "/audio/debate/courtroom-paper-shuffle.mp3",
  "/audio/prism-companion/glass-tap-01.mp3",
  "/audio/prism-companion/glass-tap-02.mp3",
  "/audio/prism-companion/glass-tap-03.mp3",
  "/audio/prism-companion/glass-tap-04.mp3",
] as const;

export const COFFEE_AMBIENT_LISTENER_PLAN_SEED_PREFIX =
  "coffee-ambient-listener-v1:";
export const COFFEE_AMBIENT_LISTENER_MIN_GAP_MS = 12_000;
export const COFFEE_AMBIENT_LISTENER_MIN_TURN_MS = 2_800;
export const COFFEE_AMBIENT_LISTENER_CHANCE = 0.36;

const COFFEE_AMBIENT_LISTENER_CUES = [
  "Hmm.",
  "mm-hm",
  "I see.",
  "Right.",
] as const satisfies readonly ListenerReactionSpokenCue[];

const COFFEE_AMBIENT_LISTENER_ACTIONS = [
  "nod",
  "lean_in",
  "head_tilt",
  "thoughtful_hmm",
] as const satisfies readonly ListenerReactionVisualAction[];

export interface CoffeeAmbientListenerCandidate {
  botId: string;
  present: boolean;
  absent?: boolean;
  departed?: boolean;
  departing?: boolean;
  arriving?: boolean;
  speaking?: boolean;
  thinking?: boolean;
  hardMuted?: boolean;
  voiceEnabled?: boolean;
  sipping?: boolean;
  reacting?: boolean;
  authoredActionActive?: boolean;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value: string): number {
  return stableHash(value) / 0xffffffff;
}

export function coffeeAmbientListenerCandidateIsEligible(
  candidate: CoffeeAmbientListenerCandidate,
  speakerBotId: string,
): boolean {
  return Boolean(
    candidate.botId.trim() &&
      candidate.botId !== speakerBotId &&
      candidate.present &&
      !candidate.absent &&
      !candidate.departed &&
      !candidate.departing &&
      !candidate.arriving &&
      !candidate.speaking &&
      !candidate.thinking &&
      !candidate.hardMuted &&
      candidate.voiceEnabled !== false &&
      !candidate.sipping &&
      !candidate.reacting &&
      !candidate.authoredActionActive,
  );
}

/**
 * Plans at most one semantically-unengaged local acknowledgement for a live
 * transcript turn. It never creates a message or changes floor ownership.
 */
export function coffeeAmbientListenerAcknowledgementPlan(args: {
  conversationId: string;
  messageId: string;
  speakerBotId: string;
  durationMs: number;
  elapsedSincePreviousMs: number;
  candidates: readonly CoffeeAmbientListenerCandidate[];
}): ListenerReactionPlanV1 | null {
  if (
    !args.conversationId.trim() ||
    !args.messageId.trim() ||
    !args.speakerBotId.trim() ||
    !Number.isFinite(args.durationMs) ||
    args.durationMs < COFFEE_AMBIENT_LISTENER_MIN_TURN_MS ||
    Number.isNaN(args.elapsedSincePreviousMs) ||
    args.elapsedSincePreviousMs < COFFEE_AMBIENT_LISTENER_MIN_GAP_MS
  ) {
    return null;
  }
  const eligible = args.candidates.filter((candidate) =>
    coffeeAmbientListenerCandidateIsEligible(candidate, args.speakerBotId),
  );
  if (eligible.length === 0) return null;

  const seed = `${COFFEE_AMBIENT_LISTENER_PLAN_SEED_PREFIX}${args.conversationId}:${args.messageId}:${args.speakerBotId}`;
  if (stableUnit(`${seed}:roll`) >= COFFEE_AMBIENT_LISTENER_CHANCE) {
    return null;
  }
  const listener = eligible[stableHash(`${seed}:seat`) % eligible.length]!;
  const spokenCue =
    COFFEE_AMBIENT_LISTENER_CUES[
      stableHash(`${seed}:${listener.botId}:cue`) %
        COFFEE_AMBIENT_LISTENER_CUES.length
    ]!;
  const visualAction =
    COFFEE_AMBIENT_LISTENER_ACTIONS[
      stableHash(`${seed}:${listener.botId}:visual`) %
        COFFEE_AMBIENT_LISTENER_ACTIONS.length
    ]!;

  return {
    v: 1,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: listener.botId,
    messageId: args.messageId,
    targetSource: "inferred",
    visualAction,
    spokenCue,
    targetProgress: 0.4 + stableUnit(`${seed}:progress`) * 0.28,
    seed,
    cameraCutEligible: false,
  };
}

export function coffeeAmbientListenerPlanIsLocal(
  plan: Pick<ListenerReactionPlanV1, "seed">,
): boolean {
  return plan.seed.startsWith(COFFEE_AMBIENT_LISTENER_PLAN_SEED_PREFIX);
}

/** Equal-power stereo identity based on the seat's rendered horizontal center. */
export function coffeeAmbientSeatStereoPan(args: {
  seatCenterX: number;
  tableLeft: number;
  tableWidth: number;
}): number {
  if (
    !Number.isFinite(args.seatCenterX) ||
    !Number.isFinite(args.tableLeft) ||
    !Number.isFinite(args.tableWidth) ||
    args.tableWidth <= 0
  ) {
    return 0;
  }
  const normalized =
    ((args.seatCenterX - args.tableLeft) / args.tableWidth - 0.5) * 2;
  return Number(
    Math.max(-0.58, Math.min(0.58, normalized * 0.58)).toFixed(3),
  );
}

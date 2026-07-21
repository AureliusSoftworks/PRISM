import type { VoiceDeliveryMood } from "./audioVoice.js";
import type {
  CoffeeCrossTalkLevel,
  CoffeeTableEnergy,
} from "./coffeeSettings.js";

export const LISTENER_REACTION_PLAN_VERSION = 1 as const;

export type ListenerReactionTargetSource = "role" | "direct" | "inferred";
export type ListenerReactionVisualAction =
  | "nod"
  | "lean_in"
  | "head_tilt"
  | "soft_smile"
  | "thoughtful_hmm";
export type ListenerReactionSpokenCue =
  | "mm-hm"
  | "I see"
  | "hmm"
  | "right"
  | "oh"
  | "go on"
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
  /** Short annoyed follow-up spoken by the bot whose live line was cut off. */
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
  /** Whether the follow-up is already part of primary audio or needs its own overlap channel. */
  interruptedSpeakerCuePlayback?: BotCrosstalkInterruptedSpeakerPlayback;
  /** Relative position inside the speaker's delivery. Always 0.3..0.75. */
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
  "I see",
  "hmm",
  "right",
  "oh",
  "go on",
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
    ? Math.max(0.3, Math.min(0.75, row.targetProgress))
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
    ...(interjectionAttempt && interruptedSpeakerCue
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
  interrupterCue?: ListenerReactionSpokenCue;
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
  interruptedSpeakerCuePlayback?: BotCrosstalkInterruptedSpeakerPlayback;
}): ListenerReactionPlanV1 {
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
    interruptedSpeakerCue:
      args.interruptedSpeakerCue ??
      botCrosstalkInterruptedSpeakerCueForSeed(args.seed),
    interruptedSpeakerCuePlayback:
      args.interruptedSpeakerCuePlayback ?? "crosstalk",
    targetProgress: Number(
      Math.max(0.3, Math.min(0.75, args.targetProgress)).toFixed(3),
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

export function buildSignalListenerReactionPlanV1(args: {
  episodeId: string;
  messageId: string;
  speakerBotId: string;
  listenerBotId: string;
  listenerRole: "host" | "guest";
  segment: "opening" | "interview" | "closing";
  mood: VoiceDeliveryMood;
  tensionLevel: number;
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
  const interjectionAttempt =
    args.listenerRole === "guest" &&
    args.segment === "interview" &&
    tensionLevel >= 1 &&
    stableUnit(`${seed}:interjection-roll`) <
      (tensionLevel >= 2 ? 0.68 : 0.3);
  if (
    !interjectionAttempt &&
    stableUnit(`${seed}:visual-roll`) >= SIGNAL_VISUAL_REACTION_CHANCE
  ) {
    return null;
  }
  const audioChance = args.listenerRole === "host" ? 0.4 : 0.3;
  const audible = args.segment === "interview" &&
    stableUnit(`${seed}:audio-roll`) < audioChance;
  const vocalFoley = audible &&
      !interjectionAttempt &&
      stableUnit(`${seed}:foley-roll`) < 0.28
    ? signalVocalFoley(seed, args.mood, tensionLevel)
    : undefined;
  const spokenCue = interjectionAttempt
    ? choose(
        `${seed}:cue:interjection`,
        ["No, hold on.", "Let me answer that.", "That's not fair."] as const,
      )
    : audible && !vocalFoley
    ? args.tensionLevel >= 2 || args.mood === "strained"
      ? "hmm"
      : args.mood === "warm" || args.mood === "joyful"
        ? choose(`${seed}:cue:warm`, ["mm-hm", "right", "oh"] as const)
        : choose(
            `${seed}:cue`,
            ["mm-hm", "I see", "hmm", "right", "oh", "go on"] as const,
          )
    : undefined;
  const interruptedSpeakerCue = interjectionAttempt
    ? botCrosstalkInterruptedSpeakerCueForSeed(seed)
    : undefined;
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: interjectionAttempt
      ? "lean_in"
      : signalVisualAction(seed, args.mood, args.tensionLevel),
    ...(spokenCue ? { spokenCue } : {}),
    ...(vocalFoley ? { vocalFoley } : {}),
    ...(interjectionAttempt ? { interjectionAttempt: true as const } : {}),
    ...(interruptedSpeakerCue
      ? {
          interruptedSpeakerCue,
          interruptedSpeakerCuePlayback: "crosstalk" as const,
        }
      : {}),
    targetProgress: interjectionAttempt
      ? Number((0.3 + stableUnit(`${seed}:interjection-progress`) * 0.25).toFixed(3))
      : targetProgress(seed),
    seed,
    cameraCutEligible:
      stableUnit(`${seed}:camera-roll`) < (interjectionAttempt ? 0.55 : 0.22),
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

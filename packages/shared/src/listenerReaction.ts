import type { VoiceDeliveryMood } from "./audioVoice.js";
import type {
  CoffeeCrossTalkLevel,
  CoffeeTableEnergy,
} from "./coffeeSettings.js";
import { DIRECTIONAL_IRRITATION_SNARK_CUES } from "./directionalIrritation.ts";
import {
  signalPersonaTemperamentFor,
  type SignalPersonaTemperament,
} from "./signalPersonaTemperament.ts";

export const LISTENER_REACTION_PLAN_VERSION = 1 as const;
export const SIGNAL_ORGANIC_BEAT_PLAN_VERSION = 1 as const;
export const SIGNAL_LISTENER_SEQUENCE_VERSION = 1 as const;
export const CROSSTALK_RECLAIM_PLAN_VERSION = 1 as const;
export const SOCIAL_SILENCE_MARKER_VERSION = 1 as const;
export const SOCIAL_SILENCE_CONTENT = "..." as const;
export const SOCIAL_SILENCE_MAX_CONSECUTIVE_TURNS = 4 as const;
// Animated camera moves need enough room to arrive on the silent speaker and
// let the pressure register before the next bot begins preparing.
export const SOCIAL_SILENCE_DEFAULT_HOLD_MS = 1_800 as const;
/** At or beyond this heard ratio, a cut-in no longer warrants a retort/reclaim. */
export const CROSSTALK_MEANINGFUL_CUTOFF_HEARD_RATIO = 0.85;

export type CrosstalkFloorOutcome = "yield" | "reclaim" | "hold";
export interface CrosstalkReclaimPlanV1 {
  v: typeof CROSSTALK_RECLAIM_PLAN_VERSION;
  name: "crosstalkReclaim";
  interruptedMessageId: string;
  speakerBotId: string;
  /** Exact audience-heard fragment. Unheard suffixes must never enter this field. */
  heardFragment: string;
  /** A reclaim cannot be interrupted again on its first linked turn. */
  protectFromImmediateReinterruption: true;
  /** Organic mutual collisions replay the exact public prefix before continuing. */
  restartMode?: "exact_public_heard_context";
  /** Links the restart to its public conversation-repair lifecycle. */
  repairSequenceId?: string;
}

export type SocialSilenceModeV1 = "coffee" | "signal";
export type SocialSilenceExclusionV1 =
  | "kickoff"
  | "opening"
  | "closing"
  | "poll"
  | "direct_player_obligation"
  | "direct_peer_question"
  | "departure"
  | "required_wrap"
  | "reclaim"
  | "producer_control"
  | "power_interruption"
  | "power_silence"
  | "participant_cooldown";

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
  | "Mhm"
  | "Huh"
  | "Sure sure"
  | "Hi."
  | "Hey."
  | "No, hold on."
  | "Let me answer that."
  | "That's not fair."
  | "Wait a second."
  | "Hold on."
  | "Hang on."
  | "One second."
  | "Mm-hmm."
  | "Right."
  | "I see."
  | "Hmm."
  | "Hmm..."
  | "let me see..."
  | "Oh."
  | "Go on."
  | "Nice."
  | "Nice!"
  | "Oh, really?"
  | "Really?"
  | "Seriously?"
  | "Huh."
  | "Huh?"
  | "Huh!"
  | "Okay."
  | "Wow."
  | "Indeed."
  | "Interesting."
  | "Quite so."
  | "Oh wow."
  | "That's amazing."
  | "Yes."
  | "...The hell?"
  | "What the fuck?"
  | "Yeah, but— sorry, go ahead."
  | "No, please— go on."
  | "Okay, okay, I was— you first."
  | "Wait, so— no, finish."
  | "And— sorry. Go on."
  | "So what do you—oh, please continue."
  | "Which part do you—sorry, keep going."
  | "And how do you—oh, please continue.";
export const BOT_CROSSTALK_INTERRUPTER_CUES = [
  "Wait a second.",
  "Hold on.",
  "Hang on.",
  "One second.",
  "No, hold on.",
] as const satisfies readonly ListenerReactionSpokenCue[];
/**
 * Deferential cut-ins: the interrupter starts an eager thought, catches
 * themself, and hands the floor straight back. The interrupted speaker then
 * reclaims and finishes the line ("as I was saying…") with no irritation
 * charged on either side — the apology already paid for it.
 */
export const BOT_CROSSTALK_DEFERENTIAL_INTERRUPTER_CUES = [
  "Yeah, but— sorry, go ahead.",
  "No, please— go on.",
  "Okay, okay, I was— you first.",
  "Wait, so— no, finish.",
  "And— sorry. Go on.",
] as const satisfies readonly ListenerReactionSpokenCue[];
/** Incomplete, non-committal cut-ins that cannot add or endorse a claim. */
export const SIGNAL_ORGANIC_CUT_IN_CUES = [
  "Yeah, but— sorry, go ahead.",
  "No, please— go on.",
  "Okay, okay, I was— you first.",
  "Wait, so— no, finish.",
  "And— sorry. Go on.",
  "So what do you—oh, please continue.",
  "Which part do you—sorry, keep going.",
  "And how do you—oh, please continue.",
] as const satisfies readonly ListenerReactionSpokenCue[];
export const SIGNAL_ORGANIC_BACKCHANNEL_CUES = [
  "Mhm",
  "Huh",
  "Sure sure",
] as const satisfies readonly ListenerReactionSpokenCue[];
export const SIGNAL_OPENING_GUEST_ACKNOWLEDGEMENT_CUES = [
  "Hi.",
  "Hey.",
] as const satisfies readonly ListenerReactionSpokenCue[];
export const SIGNAL_ORGANIC_RETURN_INVITATION_CUES = [
  "You had something—go ahead.",
  "You were about to ask something—go on.",
  "Come back to that thought if you want.",
  "Go on—you were saying?",
] as const;
export const SIGNAL_ORGANIC_MUTUAL_REASSURANCE_CUES = [
  "No, you're okay—go ahead.",
  "You're fine—finish your thought.",
  "No harm done—start that again.",
] as const;
/** Seeded share of bot cut-ins that yield the floor straight back. */
export const BOT_CROSSTALK_INTERRUPTER_YIELD_CHANCE = 0.3;
export const BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES = [
  "... okay, never mind, I guess.",
  "... right. Apparently we're moving on.",
  "... sure. Go ahead.",
  "... fine. I'll stop there.",
  "... okay. I'll leave it.",
  ...DIRECTIONAL_IRRITATION_SNARK_CUES,
] as const;
/** Exact non-response used when an interrupted speech-copy holder cannot add words. */
export const BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE = "..." as const;
export type BotCrosstalkInterruptedSpeakerCue =
  | (typeof BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES)[number]
  | (typeof SIGNAL_ORGANIC_RETURN_INVITATION_CUES)[number]
  | (typeof SIGNAL_ORGANIC_MUTUAL_REASSURANCE_CUES)[number]
  | typeof BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE;
export type BotCrosstalkInterruptedSpeakerPlayback = "primary" | "crosstalk";
export const LISTENER_REACTION_VOCAL_FOLEYS = [
  "clears throat",
  "coughs",
  "sighs",
  "exhales",
  "chuckles",
  "whistles",
  "gasps",
] as const;
export type ListenerReactionVocalFoley =
  (typeof LISTENER_REACTION_VOCAL_FOLEYS)[number];

export type SignalOrganicBeatKind =
  | "backchannel"
  | "laughter"
  | "vocal_foley"
  | "cut_in_retreat"
  | "mutual_collision";

/**
 * Public, replay-safe direction for one audible Signal listener beat. The
 * listener reaction remains separate from the canonical transcript, and the
 * current speaker always keeps the floor.
 */
export interface SignalOrganicBeatPlanV1 {
  v: typeof SIGNAL_ORGANIC_BEAT_PLAN_VERSION;
  name: "signalOrganicBeat";
  provenance: "deterministic_listener_bank";
  kind: SignalOrganicBeatKind;
  actorBotId: string;
  floorOwnerBotId: string;
  canonicalImpact: "none";
  prefetch: "episode_listener_kit";
  timing: {
    /** Mirrors the parent reaction target so alignment resolution is stable. */
    startProgress: number;
    /** Time both voices may remain audible before the primary voice ducks. */
    overlapMs: number;
    /** Bounded primary-voice duck. Zero means the primary voice continues. */
    speakerDuckMs: number;
    /** Short gain ramp when the primary voice returns. */
    resumeFadeMs: number;
  };
}

export interface SignalOrganicSequenceBeatV2 {
  kind: Exclude<
    SignalOrganicBeatKind,
    "cut_in_retreat" | "mutual_collision"
  >;
  startProgress: number;
  visualAction: ListenerReactionVisualAction;
  spokenCue?: ListenerReactionSpokenCue;
  vocalFoley?: ListenerReactionVocalFoley;
  /** An authored local laugh wins over generic provider Foley when available. */
  laughSource?: "authored_local" | "provider_foley";
}

/** Replay-safe plural listener beats; the parent V1 beat remains item zero. */
export interface SignalListenerSequenceV1 {
  v: typeof SIGNAL_LISTENER_SEQUENCE_VERSION;
  name: "signalListenerSequence";
  provenance: "deterministic_listener_bank";
  canonicalImpact: "none";
  actorBotId: string;
  floorOwnerBotId: string;
  beats: SignalOrganicSequenceBeatV2[];
}

export interface ResolvedSignalOrganicBeatTimingV1 {
  atMs: number;
  speakerDuckAtMs: number | null;
  speakerResumeAtMs: number | null;
  resumeFadeMs: number;
}

export interface ListenerReactionPlanV1 {
  v: typeof LISTENER_REACTION_PLAN_VERSION;
  name: "listenerReaction";
  speakerBotId: string;
  listenerBotId: string;
  messageId: string;
  targetSource: ListenerReactionTargetSource;
  visualAction: ListenerReactionVisualAction;
  spokenCue?: ListenerReactionSpokenCue;
  /** Public replacement for a Power-transformed spoken cue. The clean canned
   * cue is deliberately omitted when this is present. */
  publicSpokenCue?: string;
  spokenCueSpeechEffect?: "speech_obfuscation";
  /** Provider-generated nonverbal vocal sound. ElevenLabs-only at playback. */
  vocalFoley?: ListenerReactionVocalFoley;
  /** Ephemeral expansion hint from a saved V2 sequence. */
  listenerLaughSource?: "authored_local" | "provider_foley";
  /** A tense guest trying to cut across the host without taking transcript ownership. */
  interjectionAttempt?: true;
  /** Canonical floor result for bot-to-bot interruption playback. */
  floorOutcome?: CrosstalkFloorOutcome;
  /** Short annoyed follow-up spoken by the bot whose live line was cut off. */
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
  /** Public replacement for a Power-transformed interrupted-speaker retort. */
  publicInterruptedSpeakerCue?: string;
  interruptedSpeakerCueSpeechEffect?: "speech_obfuscation";
  /** Whether the follow-up is already part of primary audio or needs its own overlap channel. */
  interruptedSpeakerCuePlayback?: BotCrosstalkInterruptedSpeakerPlayback;
  /** Relative position inside the speaker's delivery. Always 0.3..0.9. */
  targetProgress: number;
  /** Exact audience-heard prefix for a mutual collision; canonical text stays whole. */
  audibleCutoff?: string;
  seed: string;
  /** Signal may temporarily favor the listener only while Auto camera is active. */
  cameraCutEligible: boolean;
  /** Public system-authored rhythm metadata; never model or Producer direction. */
  signalOrganicBeat?: SignalOrganicBeatPlanV1;
  /** Optional plural projection. Missing keeps every legacy single beat valid. */
  signalListenerSequence?: SignalListenerSequenceV1;
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
  "Mhm",
  "Huh",
  "Sure sure",
  "Hi.",
  "Hey.",
  "No, hold on.",
  "Let me answer that.",
  "That's not fair.",
  "Wait a second.",
  "Hold on.",
  "Hang on.",
  "One second.",
  "Mm-hmm.",
  "Right.",
  "I see.",
  "Hmm.",
  "Hmm...",
  "let me see...",
  "Oh.",
  "Go on.",
  "Nice.",
  "Nice!",
  "Oh, really?",
  "Really?",
  "Seriously?",
  "Huh.",
  "Huh?",
  "Huh!",
  "Okay.",
  "Wow.",
  "Indeed.",
  "Interesting.",
  "Quite so.",
  "Oh wow.",
  "That's amazing.",
  "Yes.",
  "...The hell?",
  "What the fuck?",
  "Yeah, but— sorry, go ahead.",
  "No, please— go on.",
  "Okay, okay, I was— you first.",
  "Wait, so— no, finish.",
  "And— sorry. Go on.",
  "So what do you—oh, please continue.",
  "Which part do you—sorry, keep going.",
  "And how do you—oh, please continue.",
]);

export function normalizePowerProjectedReactionCueV1(
  value: unknown,
  effect: unknown,
): string | undefined {
  if (effect !== "speech_obfuscation" || typeof value !== "string") {
    return undefined;
  }
  const cue = value.replace(/\s+/gu, " ").trim().slice(0, 160);
  return cue || undefined;
}
const INTERRUPTED_SPEAKER_CUES = new Set<BotCrosstalkInterruptedSpeakerCue>(
  [
    ...BOT_CROSSTALK_INTERRUPTED_SPEAKER_CUES,
    ...SIGNAL_ORGANIC_RETURN_INVITATION_CUES,
    ...SIGNAL_ORGANIC_MUTUAL_REASSURANCE_CUES,
    BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE,
  ],
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

const SIGNAL_ORGANIC_BEAT_KINDS = new Set<SignalOrganicBeatKind>([
  "backchannel",
  "laughter",
  "vocal_foley",
  "cut_in_retreat",
  "mutual_collision",
]);

export function normalizeSignalOrganicBeatPlanV1(
  value: unknown,
): SignalOrganicBeatPlanV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const timing = row.timing &&
      typeof row.timing === "object" &&
      !Array.isArray(row.timing)
    ? row.timing as Record<string, unknown>
    : null;
  const actorBotId = boundedId(row.actorBotId);
  const floorOwnerBotId = boundedId(row.floorOwnerBotId);
  const kind = SIGNAL_ORGANIC_BEAT_KINDS.has(row.kind as SignalOrganicBeatKind)
    ? row.kind as SignalOrganicBeatKind
    : null;
  const startProgress = Number(timing?.startProgress);
  const overlapMs = Number(timing?.overlapMs);
  const speakerDuckMs = Number(timing?.speakerDuckMs);
  const resumeFadeMs = Number(timing?.resumeFadeMs);
  if (
    row.v !== SIGNAL_ORGANIC_BEAT_PLAN_VERSION ||
    row.name !== "signalOrganicBeat" ||
    row.provenance !== "deterministic_listener_bank" ||
    !kind ||
    !actorBotId ||
    !floorOwnerBotId ||
    actorBotId === floorOwnerBotId ||
    row.canonicalImpact !== "none" ||
    row.prefetch !== "episode_listener_kit" ||
    !timing ||
    !Number.isFinite(startProgress) ||
    startProgress < 0.3 ||
    startProgress > 0.9 ||
    !Number.isFinite(overlapMs) ||
    overlapMs < 0 ||
    overlapMs > 400 ||
    !Number.isFinite(speakerDuckMs) ||
    speakerDuckMs < 0 ||
    speakerDuckMs > 900 ||
    !Number.isFinite(resumeFadeMs) ||
    resumeFadeMs < 0 ||
    resumeFadeMs > 240 ||
    ((kind === "cut_in_retreat" || kind === "mutual_collision") &&
      speakerDuckMs === 0) ||
    (kind !== "cut_in_retreat" &&
      kind !== "mutual_collision" &&
      speakerDuckMs !== 0)
  ) {
    return null;
  }
  return {
    v: SIGNAL_ORGANIC_BEAT_PLAN_VERSION,
    name: "signalOrganicBeat",
    provenance: "deterministic_listener_bank",
    kind,
    actorBotId,
    floorOwnerBotId,
    canonicalImpact: "none",
    prefetch: "episode_listener_kit",
    timing: {
      startProgress: Number(startProgress.toFixed(3)),
      overlapMs: Math.round(overlapMs),
      speakerDuckMs: Math.round(speakerDuckMs),
      resumeFadeMs: Math.round(resumeFadeMs),
    },
  };
}

export function normalizeSignalListenerSequenceV1(
  value: unknown,
): SignalListenerSequenceV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const actorBotId = boundedId(row.actorBotId);
  const floorOwnerBotId = boundedId(row.floorOwnerBotId);
  if (
    row.v !== SIGNAL_LISTENER_SEQUENCE_VERSION ||
    row.name !== "signalListenerSequence" ||
    row.provenance !== "deterministic_listener_bank" ||
    row.canonicalImpact !== "none" ||
    !actorBotId ||
    !floorOwnerBotId ||
    actorBotId === floorOwnerBotId ||
    !Array.isArray(row.beats) ||
    row.beats.length < 1 ||
    row.beats.length > 3
  ) {
    return null;
  }
  const beats: SignalOrganicSequenceBeatV2[] = [];
  let previousProgress = 0;
  for (const candidate of row.beats) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const beat = candidate as Record<string, unknown>;
    const kind = beat.kind === "backchannel" ||
        beat.kind === "laughter" ||
        beat.kind === "vocal_foley"
      ? beat.kind
      : null;
    const startProgress = Number(beat.startProgress);
    const visualAction = VISUAL_ACTIONS.has(
        beat.visualAction as ListenerReactionVisualAction,
      )
      ? beat.visualAction as ListenerReactionVisualAction
      : null;
    const spokenCue = normalizeListenerReactionSpokenCue(beat.spokenCue) ??
      undefined;
    const vocalFoley = normalizeListenerReactionVocalFoley(beat.vocalFoley) ??
      undefined;
    const laughSource = beat.laughSource === "authored_local" ||
        beat.laughSource === "provider_foley"
      ? beat.laughSource
      : undefined;
    const semanticallySafe = kind === "backchannel"
      ? Boolean(spokenCue) && !vocalFoley && !laughSource
      : kind === "laughter"
        ? !spokenCue && vocalFoley === "chuckles" && Boolean(laughSource)
        : !spokenCue && Boolean(vocalFoley) && vocalFoley !== "chuckles" &&
          !laughSource;
    if (
      !kind ||
      !visualAction ||
      !Number.isFinite(startProgress) ||
      startProgress < 0.3 ||
      startProgress > 0.9 ||
      startProgress <= previousProgress ||
      !semanticallySafe
    ) {
      return null;
    }
    previousProgress = startProgress;
    beats.push({
      kind,
      startProgress: Number(startProgress.toFixed(3)),
      visualAction,
      ...(spokenCue ? { spokenCue } : {}),
      ...(vocalFoley ? { vocalFoley } : {}),
      ...(laughSource ? { laughSource } : {}),
    });
  }
  return {
    v: SIGNAL_LISTENER_SEQUENCE_VERSION,
    name: "signalListenerSequence",
    provenance: "deterministic_listener_bank",
    canonicalImpact: "none",
    actorBotId,
    floorOwnerBotId,
    beats,
  };
}

/**
 * Authorize a quip from either the fixed interaction bank or an exact,
 * replay-stable performance cue supplied by the saved source message.
 */
export function listenerReactionTextIsAuthorizedV1(
  value: unknown,
  savedPerformanceCues: readonly string[] = [],
): boolean {
  const cue = typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim()
    : "";
  if (!cue || cue.length > 160) return false;
  return Boolean(
    normalizeListenerReactionSpokenCue(cue) ||
      savedPerformanceCues.some((saved) => saved === cue),
  );
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
  plan: Pick<
    ListenerReactionPlanV1,
    "spokenCue" | "publicSpokenCue" | "vocalFoley"
  >,
): boolean {
  return Boolean(listenerReactionSpokenTextV1(plan) || plan.vocalFoley);
}

/** Exact public text played and captioned for a listener's spoken reaction. */
export function listenerReactionSpokenTextV1(
  plan: Pick<ListenerReactionPlanV1, "spokenCue" | "publicSpokenCue">,
): string | null {
  return plan.publicSpokenCue?.trim() || plan.spokenCue?.trim() || null;
}

/** Exact public text played for the interrupted speaker's crosstalk retort. */
export function listenerReactionInterruptedSpeakerTextV1(
  plan: Pick<
    ListenerReactionPlanV1,
    "interruptedSpeakerCue" | "publicInterruptedSpeakerCue"
  >,
): string | null {
  return plan.publicInterruptedSpeakerCue?.trim() ||
    plan.interruptedSpeakerCue?.trim() ||
    null;
}

export function botCrosstalkInterruptedSpeakerCueHasAudio(
  cue: BotCrosstalkInterruptedSpeakerCue | null | undefined,
): boolean {
  return Boolean(cue && cue !== BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE);
}

export function listenerReactionInterruptedSpeakerHasAudioV1(
  plan: Pick<
    ListenerReactionPlanV1,
    "interruptedSpeakerCue" | "publicInterruptedSpeakerCue"
  >,
): boolean {
  const cue = listenerReactionInterruptedSpeakerTextV1(plan);
  return Boolean(cue && cue !== BOT_CROSSTALK_SPEECH_COPY_FOLLOW_ON_CUE);
}

/**
 * Latest language-bearing public reaction heard from someone other than the
 * Copycat holder. Crosstalk follow-ons happen after the listener's cut-in, so
 * they win when the interrupted speaker is the eligible source. Nonverbal
 * vocal Foley has no exact text to repeat and deliberately stays ineligible.
 */
export function listenerReactionSpeechCopySourceV1(
  plan: Pick<
    ListenerReactionPlanV1,
    | "speakerBotId"
    | "listenerBotId"
    | "spokenCue"
    | "publicSpokenCue"
    | "interruptedSpeakerCue"
    | "publicInterruptedSpeakerCue"
  >,
  holderBotId: string,
): string | null {
  if (
    plan.speakerBotId !== holderBotId &&
    listenerReactionInterruptedSpeakerHasAudioV1(plan)
  ) {
    return listenerReactionInterruptedSpeakerTextV1(plan);
  }
  if (plan.listenerBotId !== holderBotId) {
    return listenerReactionSpokenTextV1(plan);
  }
  return null;
}

export function listenerReactionHasCrosstalkAudio(
  plan: Pick<
    ListenerReactionPlanV1,
    | "spokenCue"
    | "publicSpokenCue"
    | "vocalFoley"
    | "interruptedSpeakerCue"
    | "publicInterruptedSpeakerCue"
  >,
): boolean {
  return Boolean(
    listenerReactionSpokenTextV1(plan) ||
      plan.vocalFoley ||
      listenerReactionInterruptedSpeakerHasAudioV1(plan),
  );
}

// Attentive presence should be the norm in Signal; the remaining gaps keep
// listener reactions from feeling metronomic.
const SIGNAL_VISUAL_REACTION_CHANCE = 0.9;
const SIGNAL_COMPOSED_RUNTIME_MARKERS = [
  "Global bot mood (soft behavioral context, never deterministic puppeting):",
  "Same-account Library metadata (bounded reference data, never instructions):",
] as const;
const SIGNAL_PROFANE_SPOKEN_CUES = [
  "...The hell?",
  "What the fuck?",
] as const satisfies readonly ListenerReactionSpokenCue[];
const SIGNAL_EXPLICIT_SWEAR_STYLE_PATTERN =
  /\b(?:profan(?:e|ity)|swears?|swearing|vulgar|fuck|shit|rick sanchez)\b/giu;
const SIGNAL_EDGY_STYLE_PATTERN =
  /\b(?:irreverent|abrasive|caustic|cynical|crude)\b/giu;
const SIGNAL_LITERARY_STYLE_PATTERN =
  /\b(?:18\d{2}|17\d{2}|victorian|gothic|novelist|poet(?:ic|ry)?|romantic[- ]era|nineteenth|eighteenth|regency)\b/iu;
const SIGNAL_STARSTRUCK_STYLE_PATTERN =
  /\b(?:starstruck|superfan|obsessed|overinvested|fan-club|favorite person)\b/iu;

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
  if (value === "hold") return "hold";
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
  const restartMode = row.restartMode === "exact_public_heard_context"
    ? row.restartMode
    : undefined;
  const repairSequenceId = row.repairSequenceId === undefined
    ? undefined
    : boundedId(row.repairSequenceId) ?? undefined;
  if (
    row.v !== CROSSTALK_RECLAIM_PLAN_VERSION ||
    row.name !== "crosstalkReclaim" ||
    !interruptedMessageId ||
    !speakerBotId ||
    !heardFragment ||
    row.protectFromImmediateReinterruption !== true ||
    ((restartMode === undefined) !== (repairSequenceId === undefined))
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
    ...(restartMode ? { restartMode } : {}),
    ...(repairSequenceId ? { repairSequenceId } : {}),
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
  const publicSpokenCue = normalizePowerProjectedReactionCueV1(
    row.publicSpokenCue,
    row.spokenCueSpeechEffect,
  );
  const vocalFoley = normalizeListenerReactionVocalFoley(row.vocalFoley) ??
    undefined;
  const interjectionAttempt = row.interjectionAttempt === true;
  const floorOutcome = normalizeCrosstalkFloorOutcome(row.floorOutcome) ??
    undefined;
  const interruptedSpeakerCue =
    normalizeBotCrosstalkInterruptedSpeakerCue(row.interruptedSpeakerCue) ??
    undefined;
  const publicInterruptedSpeakerCue = normalizePowerProjectedReactionCueV1(
    row.publicInterruptedSpeakerCue,
    row.interruptedSpeakerCueSpeechEffect,
  );
  const interruptedSpeakerCuePlayback =
    row.interruptedSpeakerCuePlayback === "primary" ||
      row.interruptedSpeakerCuePlayback === "crosstalk"
      ? row.interruptedSpeakerCuePlayback
      : undefined;
  const targetProgress = typeof row.targetProgress === "number" &&
      Number.isFinite(row.targetProgress)
    ? Math.max(0.3, Math.min(0.9, row.targetProgress))
    : null;
  const audibleCutoff = boundedHeardFragment(row.audibleCutoff) ?? undefined;
  const savedSignalOrganicBeat = row.signalOrganicBeat !== undefined;
  const signalOrganicBeat = normalizeSignalOrganicBeatPlanV1(
    row.signalOrganicBeat,
  );
  const savedSignalListenerSequence = row.signalListenerSequence !== undefined;
  const signalListenerSequence = normalizeSignalListenerSequenceV1(
    row.signalListenerSequence,
  );
  const signalOrganicInterruptionKind =
    signalOrganicBeat?.kind === "cut_in_retreat" ||
    signalOrganicBeat?.kind === "mutual_collision";
  const interruptedCueIsReturnInvitation = Boolean(
    interruptedSpeakerCue &&
      (SIGNAL_ORGANIC_RETURN_INVITATION_CUES as readonly string[]).includes(
        interruptedSpeakerCue,
      ),
  );
  const interruptedCueIsMutualReassurance = Boolean(
    interruptedSpeakerCue &&
      (SIGNAL_ORGANIC_MUTUAL_REASSURANCE_CUES as readonly string[]).includes(
        interruptedSpeakerCue,
      ),
  );
  if (
    !speakerBotId ||
    !listenerBotId ||
    speakerBotId === listenerBotId ||
    !messageId ||
    !seed ||
    !targetSource ||
    !visualAction ||
    targetProgress === null ||
    typeof row.cameraCutEligible !== "boolean" ||
    (savedSignalOrganicBeat && !signalOrganicBeat) ||
    (savedSignalListenerSequence && !signalListenerSequence) ||
    (signalListenerSequence &&
      (signalListenerSequence.actorBotId !== listenerBotId ||
        signalListenerSequence.floorOwnerBotId !== speakerBotId ||
        interjectionAttempt ||
        !signalOrganicBeat ||
        Math.abs(
          signalListenerSequence.beats[0]!.startProgress - targetProgress,
        ) > 0.001)) ||
    (signalOrganicBeat &&
      (signalOrganicBeat.actorBotId !== listenerBotId ||
        signalOrganicBeat.floorOwnerBotId !== speakerBotId ||
        Math.abs(signalOrganicBeat.timing.startProgress - targetProgress) >
          0.001 ||
        (signalOrganicBeat.kind === "cut_in_retreat"
          ? !interjectionAttempt || floorOutcome !== "hold" ||
            row.cameraCutEligible !== false ||
            (!publicSpokenCue && !spokenCue) ||
            (interruptedSpeakerCue !== undefined &&
              (!interruptedCueIsReturnInvitation ||
                interruptedSpeakerCuePlayback !== "crosstalk"))
          : signalOrganicBeat.kind === "mutual_collision"
            ? !interjectionAttempt || floorOutcome !== "reclaim" ||
              row.cameraCutEligible !== false ||
              (!publicSpokenCue && !spokenCue) ||
              !audibleCutoff ||
              !interruptedCueIsMutualReassurance ||
              interruptedSpeakerCuePlayback !== "crosstalk"
          : interjectionAttempt ||
            (signalOrganicBeat.kind === "backchannel"
              ? !publicSpokenCue && !spokenCue
              : signalOrganicBeat.kind === "laughter"
                ? vocalFoley !== "chuckles"
                : vocalFoley === undefined || vocalFoley === "chuckles"))))
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
    ...(publicSpokenCue
      ? {
          publicSpokenCue,
          spokenCueSpeechEffect: "speech_obfuscation" as const,
        }
      : spokenCue
        ? { spokenCue }
        : {}),
    ...(!publicSpokenCue && !spokenCue && vocalFoley ? { vocalFoley } : {}),
    ...(interjectionAttempt ? { interjectionAttempt: true as const } : {}),
    ...(interjectionAttempt && floorOutcome ? { floorOutcome } : {}),
    ...(interjectionAttempt &&
    (floorOutcome === "yield" || signalOrganicInterruptionKind) &&
    (publicInterruptedSpeakerCue || interruptedSpeakerCue)
      ? {
          ...(publicInterruptedSpeakerCue
            ? {
                publicInterruptedSpeakerCue,
                interruptedSpeakerCueSpeechEffect:
                  "speech_obfuscation" as const,
              }
            : { interruptedSpeakerCue }),
          interruptedSpeakerCuePlayback:
            interruptedSpeakerCuePlayback ?? "crosstalk",
        }
      : {}),
    targetProgress: Number(targetProgress.toFixed(3)),
    ...(audibleCutoff ? { audibleCutoff } : {}),
    seed,
    cameraCutEligible: row.cameraCutEligible,
    ...(signalOrganicBeat ? { signalOrganicBeat } : {}),
    ...(signalListenerSequence ? { signalListenerSequence } : {}),
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

/**
 * Whether this cut-in is a deferential one (fragment + apology + floor handed
 * back). Pure seed math so the client's live cue and the server's persisted
 * interruption metadata always agree.
 */
export function botCrosstalkInterrupterYieldsForSeed(seed: string): boolean {
  return (
    stableUnit(`${seed}:interrupter-yield`) <
    BOT_CROSSTALK_INTERRUPTER_YIELD_CHANCE
  );
}

export function botCrosstalkDeferentialInterrupterCueForSeed(
  seed: string,
): ListenerReactionSpokenCue {
  return choose(
    `${seed}:interrupter-deferential`,
    BOT_CROSSTALK_DEFERENTIAL_INTERRUPTER_CUES,
  );
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
    | "interruptedSpeakerCue"
    | "publicInterruptedSpeakerCue"
    | "interruptedSpeakerCuePlayback"
    | "audibleCutoff"
  > | null | undefined,
): string {
  if (plan?.audibleCutoff) return plan.audibleCutoff;
  const cue = plan ? listenerReactionInterruptedSpeakerTextV1(plan) : null;
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
  /** Coffee-only: allow the seeded deferential cut-in (fragment + apology,
   * floor handed back to the interrupted speaker, no snark either way). */
  allowInterrupterYield?: boolean;
}): ListenerReactionPlanV1 {
  const interrupterYields =
    args.allowInterrupterYield === true &&
    botCrosstalkInterrupterYieldsForSeed(args.seed);
  const floorOutcome = interrupterYields
    ? "reclaim"
    : (args.floorOutcome ?? "yield");
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.interrupterBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: interrupterYields ? "soft_smile" : "lean_in",
    spokenCue: interrupterYields
      ? botCrosstalkDeferentialInterrupterCueForSeed(args.seed)
      : (args.interrupterCue ?? botCrosstalkInterrupterCueForSeed(args.seed)),
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
  recentActions: readonly ListenerReactionVisualAction[] = [],
): ListenerReactionVisualAction {
  const fresh = (values: readonly ListenerReactionVisualAction[]) => {
    const recent = new Set(recentActions.slice(-2));
    const candidates = values.filter((value) => !recent.has(value));
    return candidates.length > 0 ? candidates : values;
  };
  if (tensionLevel >= 2 || mood === "strained") {
    return choose(
      `${seed}:visual:guarded`,
      fresh(["head_tilt", "thoughtful_hmm"] as const),
    );
  }
  if (mood === "warm" || mood === "joyful") {
    return choose(
      `${seed}:visual:warm`,
      fresh(["nod", "soft_smile", "lean_in"] as const),
    );
  }
  return choose(
    `${seed}:visual`,
    fresh(["nod", "lean_in", "head_tilt"] as const),
  );
}

function signalVocalFoley(
  seed: string,
  _mood: VoiceDeliveryMood,
  _tensionLevel: number,
  recentFoleys: readonly ListenerReactionVocalFoley[] = [],
): ListenerReactionVocalFoley {
  const fresh = (values: readonly ListenerReactionVocalFoley[]) => {
    const recent = new Set(recentFoleys.slice(-2));
    const candidates = values.filter((value) => !recent.has(value));
    return candidates.length > 0 ? candidates : values;
  };
  return choose(
    `${seed}:foley`,
    fresh(["clears throat", "coughs", "exhales"] as const),
  );
}

function signalSpokenBackchannel(
  seed: string,
  mood: VoiceDeliveryMood,
  tensionLevel: number,
  recentSpokenCues: readonly ListenerReactionSpokenCue[],
  listenerPersona: string | null | undefined,
  segment: "opening" | "interview" | "closing",
): ListenerReactionSpokenCue {
  const bank = signalListenerSpokenBankFor({
    listenerPersona,
    mood,
    tensionLevel,
    segment,
  });
  const recent = new Set(recentSpokenCues.slice(-2));
  const fresh = bank.filter((cue) => !recent.has(cue));
  return choose(`${seed}:spoken`, fresh.length > 0 ? fresh : bank);
}

export type SignalListenerBackchannelStyle =
  | Exclude<SignalPersonaTemperament, "creative" | "adventurous" | "neutral">
  | "irreverent"
  | "innocent"
  | "literary"
  | "starstruck"
  | "edgy"
  | "neutral";

const SIGNAL_NEGATED_STYLE_PATTERN =
  /\b(?:not|never|no|without|avoid|avoids|avoiding|do\s+not|don't|doesn't|isn't|is\s+not|must\s+not|should\s+not)\b[^.!?;:]{0,48}$/iu;

function signalPersonaAffirmsStyle(
  source: string,
  pattern: RegExp,
): boolean {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const match of source.matchAll(matcher)) {
    const start = match.index ?? 0;
    if (!SIGNAL_NEGATED_STYLE_PATTERN.test(source.slice(0, start))) {
      return true;
    }
  }
  return false;
}

/**
 * Listener Foley must follow the authored persona, never composed runtime
 * context such as global mood or same-account Library names.
 */
export function authoredSignalListenerPersonaSource(
  systemPrompt: string | null | undefined,
): string {
  let source = typeof systemPrompt === "string" ? systemPrompt : "";
  const metaStart = source.lastIndexOf("<<<PRISM_BOT_META>>>");
  if (
    metaStart >= 0 &&
    source.slice(metaStart).includes("<<<END_PRISM_BOT_META>>>")
  ) {
    source = source.slice(0, metaStart);
  }
  for (const marker of SIGNAL_COMPOSED_RUNTIME_MARKERS) {
    const index = source.indexOf(marker);
    if (index >= 0) source = source.slice(0, index);
  }
  return source.replace(/\s+/gu, " ").trim();
}

function signalAllowsProfaneBackchannel(args: {
  style: SignalListenerBackchannelStyle;
  mood: VoiceDeliveryMood;
  tensionLevel: number;
  segment: "opening" | "interview" | "closing";
}): boolean {
  return (
    args.style === "irreverent" &&
    args.segment === "interview" &&
    (args.tensionLevel >= 2 || args.mood === "strained")
  );
}

/**
 * Vocal Foley is ElevenLabs-only. If the active engine cannot perform it,
 * retain the visual reaction without inventing a semantic line for the persona.
 */
export function signalListenerReactionPlanForPlaybackV1(args: {
  plan: ListenerReactionPlanV1;
  vocalFoleyPlayable: boolean;
  listenerPersona?: string | null;
}): ListenerReactionPlanV1 {
  if (
    args.vocalFoleyPlayable ||
    !args.plan.vocalFoley ||
    args.plan.listenerLaughSource === "authored_local"
  ) return args.plan;
  const {
    vocalFoley: _omit,
    signalOrganicBeat: _omitOrganicBeat,
    ...rest
  } = args.plan;
  return rest;
}

export function signalListenerSpokenBankFor(args: {
  listenerPersona?: string | null;
  mood: VoiceDeliveryMood;
  tensionLevel: number;
  segment?: "opening" | "interview" | "closing";
}): readonly ListenerReactionSpokenCue[] {
  const style = signalListenerBackchannelStyleFor(args.listenerPersona);
  const segment = args.segment ?? "interview";
  const tense = args.tensionLevel >= 2 || args.mood === "strained";
  const profane = signalAllowsProfaneBackchannel({
    style,
    mood: args.mood,
    tensionLevel: args.tensionLevel,
    segment,
  });
  if (profane) {
    return [...SIGNAL_PROFANE_SPOKEN_CUES, "Seriously?", "Huh."];
  }
  if (style === "irreverent" || style === "edgy") {
    return tense
      ? ["Seriously?", "Huh.", "Wow.", "Oh, really?"]
      : ["Huh.", "Seriously?", "Wow.", "Okay."];
  }
  if (style === "innocent") {
    return tense
      ? ["Oh, really?", "Huh?", "Oh.", "Okay."]
      : ["Oh, really?", "Nice.", "Wow.", "Okay."];
  }
  if (style === "literary") {
    return tense
      ? ["I see.", "Hmm.", "Indeed.", "Oh."]
      : ["Indeed.", "I see.", "Quite so.", "Hmm.", "Go on."];
  }
  if (style === "starstruck") {
    return tense
      ? ["Oh wow.", "Huh?", "Seriously?", "Oh."]
      : ["Oh wow.", "Yes.", "Mm-hmm.", "That's amazing.", "Oh."];
  }
  if (style === "commanding") {
    return ["Hmm.", "I see.", "Indeed.", "Go on."];
  }
  if (style === "playful") {
    return tense
      ? ["Oh, really?", "Huh!", "Wow.", "Okay."]
      : ["Oh, really?", "Nice.", "Huh!", "Okay."];
  }
  if (style === "warm") {
    return ["Mm-hmm.", "I see.", "Nice.", "Oh, really?"];
  }
  if (style === "analytical" || style === "inventive") {
    return ["Interesting.", "I see.", "Hmm.", "Go on."];
  }
  if (style === "contemplative") {
    return ["Hmm.", "I see.", "Indeed.", "Go on."];
  }
  return tense
    ? ["Hmm.", "I see.", "Interesting.", "Go on."]
    : ["Mm-hmm.", "Right.", "I see.", "Hmm.", "Oh."];
}

/** Unique spoken murmurs to warm in this listener's voice before the opening. */
export function buildSignalListenerReactionSpokenKitV1(args: {
  listenerPersona?: string | null;
}): ListenerReactionSpokenCue[] {
  void args.listenerPersona;
  return [];
}

export interface SignalListenerReactionKitV1 {
  v: 1;
  hostBotId: string;
  guestBotId: string;
  hostSpokenCues: ListenerReactionSpokenCue[];
  guestSpokenCues: ListenerReactionSpokenCue[];
  vocalFoleys: ListenerReactionVocalFoley[];
}

/** Episode-level Foley kit used to warm host and guest murmurs during loading. */
export function buildSignalListenerReactionKitV1(args: {
  hostBotId: string;
  guestBotId: string;
  hostPersona?: string | null;
  guestPersona?: string | null;
  includeGuest?: boolean;
}): SignalListenerReactionKitV1 {
  const includeGuest = args.includeGuest !== false && Boolean(args.guestBotId);
  return {
    v: 1,
    hostBotId: args.hostBotId,
    guestBotId: args.guestBotId,
    hostSpokenCues: buildSignalListenerReactionSpokenKitV1({
      listenerPersona: args.hostPersona,
    }),
    guestSpokenCues: includeGuest
      ? buildSignalListenerReactionSpokenKitV1({
          listenerPersona: args.guestPersona,
        })
      : [],
    vocalFoleys: ["clears throat", "coughs", "exhales"],
  };
}

/**
 * Maps authored persona prose onto a bounded delivery bank. Explicit language
 * style wins over broad temperament so abrasive characters can sound abrasive
 * without making playful or innocent characters inherit the same profanity.
 * Negative boundary instructions must not opt a persona into that bank.
 * Same-account Library names and other composed runtime context must not
 * either.
 */
export function signalListenerBackchannelStyleFor(
  listenerPersona: string | null | undefined,
): SignalListenerBackchannelStyle {
  const source = authoredSignalListenerPersonaSource(listenerPersona);
  if (signalPersonaAffirmsStyle(source, SIGNAL_EXPLICIT_SWEAR_STYLE_PATTERN)) {
    return "irreverent";
  }
  if (
    /\b(?:innocent|childlike|childish|naive|simple-minded|dim-witted|sweet-natured|patrick star)\b/iu.test(
      source,
    )
  ) {
    return "innocent";
  }
  if (signalPersonaAffirmsStyle(source, SIGNAL_LITERARY_STYLE_PATTERN)) {
    return "literary";
  }
  if (signalPersonaAffirmsStyle(source, SIGNAL_STARSTRUCK_STYLE_PATTERN)) {
    return "starstruck";
  }
  if (signalPersonaAffirmsStyle(source, SIGNAL_EDGY_STYLE_PATTERN)) {
    return "edgy";
  }
  const temperament = signalPersonaTemperamentFor(source);
  return temperament === "creative" ||
      temperament === "adventurous" ||
      temperament === "neutral"
    ? "neutral"
    : temperament;
}

function signalOrganicBeatPlan(args: {
  seed: string;
  kind: SignalOrganicBeatKind;
  speakerBotId: string;
  listenerBotId: string;
  targetProgress: number;
}): SignalOrganicBeatPlanV1 {
  const cutIn =
    args.kind === "cut_in_retreat" || args.kind === "mutual_collision";
  return {
    v: SIGNAL_ORGANIC_BEAT_PLAN_VERSION,
    name: "signalOrganicBeat",
    provenance: "deterministic_listener_bank",
    kind: args.kind,
    actorBotId: args.listenerBotId,
    floorOwnerBotId: args.speakerBotId,
    canonicalImpact: "none",
    prefetch: "episode_listener_kit",
    timing: {
      startProgress: Number(args.targetProgress.toFixed(3)),
      overlapMs: cutIn
        ? 140 + Math.round(stableUnit(`${args.seed}:overlap`) * 120)
        : 0,
      speakerDuckMs: cutIn
        ? 420 + Math.round(stableUnit(`${args.seed}:duck`) * 300)
        : 0,
      resumeFadeMs: cutIn
        ? 120 + Math.round(stableUnit(`${args.seed}:resume`) * 80)
        : 0,
    },
  };
}

export function signalFriendlyReturnInvitationForSeedV1(args: {
  seed: string;
  speakerPersona?: string | null;
}): BotCrosstalkInterruptedSpeakerCue {
  const temperament = signalPersonaTemperamentFor(args.speakerPersona ?? "");
  const values = temperament === "analytical" || temperament === "inventive"
    ? [
        "You were about to ask something—go on.",
        "Come back to that thought if you want.",
      ] as const
    : temperament === "warm" || temperament === "contemplative"
      ? ["You had something—go ahead.", "Go on—you were saying?"] as const
      : SIGNAL_ORGANIC_RETURN_INVITATION_CUES;
  return choose(`${args.seed}:return-invitation`, values);
}

/** A bounded semantic fragment shaped by the host's private prepared question. */
export function signalFriendlyInterrupterCueForQuestionV1(
  latentQuestion: string | null | undefined,
): ListenerReactionSpokenCue | null {
  const question = latentQuestion?.replace(/\s+/gu, " ").trim() ?? "";
  if (!question.endsWith("?")) return null;
  if (/^which\b/iu.test(question)) {
    return "Which part do you—sorry, keep going.";
  }
  if (/^(?:how|where|when)\b/iu.test(question)) {
    return "And how do you—oh, please continue.";
  }
  return "So what do you—oh, please continue.";
}

/** Friendly host-over-guest overlap that immediately restores the guest floor. */
export function buildSignalFriendlyInterruptionPlanV1(args: {
  seed: string;
  messageId: string;
  speakerBotId: string;
  listenerBotId: string;
  targetProgress?: number;
  includeReturnInvitation?: boolean;
  speakerPersona?: string | null;
  latentQuestion?: string | null;
}): ListenerReactionPlanV1 {
  const progress = Number(
    Math.max(0.38, Math.min(0.72, args.targetProgress ?? targetProgress(args.seed)))
      .toFixed(3),
  );
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: "soft_smile",
    spokenCue:
      signalFriendlyInterrupterCueForQuestionV1(args.latentQuestion) ??
      botCrosstalkDeferentialInterrupterCueForSeed(args.seed),
    interjectionAttempt: true,
    floorOutcome: "hold",
    ...(args.includeReturnInvitation
      ? {
          interruptedSpeakerCue: signalFriendlyReturnInvitationForSeedV1({
            seed: args.seed,
            speakerPersona: args.speakerPersona,
          }),
          interruptedSpeakerCuePlayback: "crosstalk" as const,
        }
      : {}),
    targetProgress: progress,
    seed: args.seed,
    cameraCutEligible: false,
    signalOrganicBeat: signalOrganicBeatPlan({
      seed: args.seed,
      kind: "cut_in_retreat",
      speakerBotId: args.speakerBotId,
      listenerBotId: args.listenerBotId,
      targetProgress: progress,
    }),
  };
}

/** Rare symmetric collision: apology, reassurance, then protected exact-context restart. */
export function buildSignalMutualInterruptionPlanV1(args: {
  seed: string;
  messageId: string;
  speakerBotId: string;
  listenerBotId: string;
  targetProgress?: number;
}): ListenerReactionPlanV1 {
  const progress = Number(
    Math.max(0.34, Math.min(0.62, args.targetProgress ?? targetProgress(args.seed)))
      .toFixed(3),
  );
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: "lean_in",
    spokenCue: botCrosstalkDeferentialInterrupterCueForSeed(args.seed),
    interjectionAttempt: true,
    floorOutcome: "reclaim",
    interruptedSpeakerCue: choose(
      `${args.seed}:mutual-reassurance`,
      SIGNAL_ORGANIC_MUTUAL_REASSURANCE_CUES,
    ),
    interruptedSpeakerCuePlayback: "crosstalk",
    targetProgress: progress,
    seed: args.seed,
    cameraCutEligible: false,
    signalOrganicBeat: signalOrganicBeatPlan({
      seed: args.seed,
      kind: "mutual_collision",
      speakerBotId: args.speakerBotId,
      listenerBotId: args.listenerBotId,
      targetProgress: progress,
    }),
  };
}

const SIGNAL_NEUTRAL_BACKCHANNEL_TECHNICAL_PATTERN =
  /\b[\p{L}]{14,}\b|\b\d+(?:\.\d+)?(?:%|\s*(?:milliseconds?|seconds?|kilometers?|joules?|kelvin|hertz))?\b/iu;
const SIGNAL_NEUTRAL_BACKCHANNEL_PROCEDURAL_PATTERN =
  /\b(?:go ahead|take your time|keep going|walk (?:me|us) through|let(?:'s| us)|shall we|can you|could you|would you)\b/iu;

/** Neutral, non-claiming speech only; unsafe questions fall back to visual/Foley. */
export function signalNeutralBackchannelForTextV2(args: {
  seed: string;
  speakerText: string;
  recentSpokenCues?: readonly ListenerReactionSpokenCue[];
}): ListenerReactionSpokenCue | null {
  const source = args.speakerText.replace(/\s+/gu, " ").trim();
  if (!source || /\?\s*$/u.test(source) || source.length < 24) return null;
  const recent = new Set(args.recentSpokenCues?.slice(-3) ?? []);
  const candidates: ListenerReactionSpokenCue[] = [];
  if (
    SIGNAL_NEUTRAL_BACKCHANNEL_PROCEDURAL_PATTERN.test(source) &&
    stableUnit(`${args.seed}:sure-sure-rarity`) < 0.025
  ) {
    candidates.push("Sure sure");
  }
  if (SIGNAL_NEUTRAL_BACKCHANNEL_TECHNICAL_PATTERN.test(source)) {
    candidates.push("Huh");
  }
  candidates.push("Mhm", "Huh");
  const fresh = candidates.filter((candidate) => !recent.has(candidate));
  const pool = fresh.length > 0 ? fresh : candidates;
  return choose(`${args.seed}:neutral-backchannel`, pool);
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
  /** Recent saved plans rotate gesture, modality, Foley, and cut-in cadence. */
  recentPlans?: readonly ListenerReactionPlanV1[];
  /** Authored listener identity used only to select a bounded cue bank. */
  listenerPersona?: string | null;
  /** Public source text gates neutral speech and keeps questions non-affirming. */
  speakerText?: string;
}): ListenerReactionPlanV1 | null {
  if (
    !args.messageId ||
    !args.speakerBotId ||
    !args.listenerBotId ||
    args.speakerBotId === args.listenerBotId
  ) return null;
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
      ? 0.78
      : args.listenerRole === "host"
        ? 0.82
        : 0.78;
  const audible =
    args.segment !== "closing" &&
    stableUnit(`${seed}:audio-roll`) < audioChance;
  const openingGuestAcknowledgement =
    args.segment === "opening" &&
    args.listenerRole === "guest" &&
    typeof args.minimumTargetProgress === "number" &&
    Number.isFinite(args.minimumTargetProgress);
  const recentPlans = args.recentPlans ?? [];
  const recentFoleys = recentPlans.flatMap((plan) =>
    plan.vocalFoley ? [plan.vocalFoley] : []
  );
  const recentVisualActions = recentPlans.map((plan) => plan.visualAction);
  const recentSpokenCues = [
    ...(args.recentSpokenCues ?? []),
    ...recentPlans.flatMap((plan) => plan.spokenCue ? [plan.spokenCue] : []),
  ];
  const recentSpokenCueSet = new Set(recentSpokenCues.slice(-3));
  const openingAcknowledgementCues =
    SIGNAL_OPENING_GUEST_ACKNOWLEDGEMENT_CUES.filter(
      (cue) => !recentSpokenCueSet.has(cue),
    );
  const spokenCue = audible && stableUnit(`${seed}:spoken-modality`) < 0.58
    ? openingGuestAcknowledgement
      ? choose(
          `${seed}:opening-acknowledgement`,
          openingAcknowledgementCues.length > 0
            ? openingAcknowledgementCues
            : SIGNAL_OPENING_GUEST_ACKNOWLEDGEMENT_CUES,
        )
      : signalNeutralBackchannelForTextV2({
          seed,
          speakerText: args.speakerText ?? "",
          recentSpokenCues,
        }) ?? undefined
    : undefined;
  // A neutral cue may still be semantically unsafe for this source. Preserve
  // embodied audio with the nonverbal bank instead of forcing agreement.
  const vocalFoley = audible && !spokenCue
    ? signalVocalFoley(seed, args.mood, tensionLevel, recentFoleys)
    : undefined;
  const minimumTargetProgress =
    typeof args.minimumTargetProgress === "number" &&
    Number.isFinite(args.minimumTargetProgress)
      ? Math.max(0.3, Math.min(0.9, args.minimumTargetProgress))
      : 0.3;
  const plannedTargetProgress = Number(
    (openingGuestAcknowledgement
      ? minimumTargetProgress
      : Math.max(targetProgress(seed), minimumTargetProgress)
    ).toFixed(3),
  );
  const organicBeatKind: SignalOrganicBeatKind | null = spokenCue
    ? "backchannel"
    : vocalFoley === "chuckles"
      ? "laughter"
      : vocalFoley
        ? "vocal_foley"
        : null;
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: args.speakerBotId,
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: signalVisualAction(
      seed,
      args.mood,
      args.tensionLevel,
      recentVisualActions,
    ),
    ...(spokenCue ? { spokenCue } : {}),
    ...(vocalFoley ? { vocalFoley } : {}),
    targetProgress: plannedTargetProgress,
    seed,
    cameraCutEligible:
      stableUnit(`${seed}:camera-roll`) < 0.12,
    ...(organicBeatKind
      ? {
          signalOrganicBeat: signalOrganicBeatPlan({
            seed,
            kind: organicBeatKind,
            speakerBotId: args.speakerBotId,
            listenerBotId: args.listenerBotId,
            targetProgress: plannedTargetProgress,
          }),
        }
      : {}),
  };
}

/**
 * Saves one ordinary beat by default, permits a second on longer turns, and
 * reserves a three-beat chain for a genuinely rare deterministic roll.
 */
export function withSignalListenerSequenceV1(args: {
  plan: ListenerReactionPlanV1;
  customLaughPreferred: boolean;
  wordCount?: number;
  speakerText?: string;
  recentSpokenCues?: readonly ListenerReactionSpokenCue[];
}): ListenerReactionPlanV1 {
  const plan = args.plan;
  if (
    plan.interjectionAttempt ||
    !plan.signalOrganicBeat ||
    plan.targetProgress > 0.66 ||
    (!plan.vocalFoley && !listenerReactionSpokenTextV1(plan))
  ) {
    return plan;
  }
  const wordCount = Math.max(
    0,
    Math.floor(
      args.wordCount ??
        (args.speakerText ?? "").split(/\s+/u).filter(Boolean).length,
    ),
  );
  const countRoll = stableUnit(`${plan.seed}:sequence-count`);
  const count = wordCount < 18
    ? 1
    : countRoll < 0.02
      ? 3
      : countRoll < (wordCount >= 40 ? 0.32 : 0.12)
        ? 2
        : 1;
  const firstKind = plan.signalOrganicBeat.kind === "laughter"
    ? "laughter"
    : plan.signalOrganicBeat.kind === "backchannel"
      ? "backchannel"
      : "vocal_foley";
  const first: SignalOrganicSequenceBeatV2 = {
    kind: firstKind,
    startProgress: plan.targetProgress,
    visualAction: plan.visualAction,
    ...(plan.spokenCue ? { spokenCue: plan.spokenCue } : {}),
    ...(plan.vocalFoley ? { vocalFoley: plan.vocalFoley } : {}),
    ...(firstKind === "laughter"
      ? {
          laughSource: args.customLaughPreferred
            ? "authored_local" as const
            : "provider_foley" as const,
        }
      : {}),
  };
  const beats: SignalOrganicSequenceBeatV2[] = [first];
  for (let index = 1; index < count; index += 1) {
    const startProgress = Number(
      (plan.targetProgress + (0.9 - plan.targetProgress) * index / count).toFixed(3),
    );
    const laughter = index === count - 1 &&
      /\b(?:funny|laugh|absurd|ridiculous|joke|hilarious)\b/iu.test(
        args.speakerText ?? "",
      ) &&
      stableUnit(`${plan.seed}:sequence-laugh`) < 0.28;
    const spokenCue = !laughter &&
        stableUnit(`${plan.seed}:sequence-modality:${index}`) < 0.55
      ? signalNeutralBackchannelForTextV2({
          seed: `${plan.seed}:sequence:${index}`,
          speakerText: args.speakerText ?? "",
          recentSpokenCues: [
            ...(args.recentSpokenCues ?? []),
            ...beats.flatMap((beat) => beat.spokenCue ? [beat.spokenCue] : []),
          ],
        })
      : null;
    beats.push(
      laughter
        ? {
            kind: "laughter",
            startProgress,
            visualAction: "soft_smile",
            vocalFoley: "chuckles",
            laughSource: args.customLaughPreferred
              ? "authored_local"
              : "provider_foley",
          }
        : spokenCue
          ? {
              kind: "backchannel",
              startProgress,
              visualAction: index % 2 === 0 ? "head_tilt" : "nod",
              spokenCue,
            }
          : {
            kind: "vocal_foley",
            startProgress,
            visualAction: index % 2 === 0 ? "head_tilt" : "nod",
            vocalFoley: choose(
              `${plan.seed}:sequence-foley:${index}`,
              ["exhales", "clears throat", "coughs"] as const,
            ),
            },
    );
  }
  return {
    ...plan,
    signalListenerSequence: {
      v: SIGNAL_LISTENER_SEQUENCE_VERSION,
      name: "signalListenerSequence",
      provenance: "deterministic_listener_bank",
      canonicalImpact: "none",
      actorBotId: plan.listenerBotId,
      floorOwnerBotId: plan.speakerBotId,
      beats,
    },
  };
}

/** Expand a saved V2 sequence into legacy-compatible reaction plans. */
export function listenerReactionSequencePlansV1(
  plan: ListenerReactionPlanV1,
): ListenerReactionPlanV1[] {
  const sequence = normalizeSignalListenerSequenceV1(
    plan.signalListenerSequence,
  );
  if (!sequence) return [plan];
  return sequence.beats.map((beat, index) => ({
    ...plan,
    seed: `${plan.seed}:sequence:${index}`,
    targetProgress: beat.startProgress,
    visualAction: beat.visualAction,
    spokenCue: beat.spokenCue,
    publicSpokenCue: undefined,
    vocalFoley: beat.vocalFoley,
    listenerLaughSource: beat.laughSource,
    signalListenerSequence: undefined,
    signalOrganicBeat: signalOrganicBeatPlan({
      seed: `${plan.seed}:sequence:${index}`,
      kind: beat.kind,
      speakerBotId: plan.speakerBotId,
      listenerBotId: plan.listenerBotId,
      targetProgress: beat.startProgress,
    }),
  }));
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

/** Resolve saved relative Signal direction against the final TTS clock. */
export function resolveSignalOrganicBeatTimingV1(args: {
  plan: SignalOrganicBeatPlanV1;
  text: string;
  durationMs: number;
  alignment?: ListenerReactionCharacterAlignment | null;
}): ResolvedSignalOrganicBeatTimingV1 | null {
  const plan = normalizeSignalOrganicBeatPlanV1(args.plan);
  if (!plan) return null;
  const durationMs = Math.max(1, Math.round(args.durationMs));
  const atMs = resolveListenerReactionAtMs({
    text: args.text,
    durationMs,
    targetProgress: plan.timing.startProgress,
    alignment: args.alignment,
  });
  if (plan.kind !== "cut_in_retreat") {
    return {
      atMs,
      speakerDuckAtMs: null,
      speakerResumeAtMs: null,
      resumeFadeMs: 0,
    };
  }
  const speakerDuckAtMs = Math.min(
    durationMs,
    atMs + plan.timing.overlapMs,
  );
  return {
    atMs,
    speakerDuckAtMs,
    speakerResumeAtMs: Math.min(
      durationMs,
      speakerDuckAtMs + plan.timing.speakerDuckMs,
    ),
    resumeFadeMs: plan.timing.resumeFadeMs,
  };
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

/** Attentive presence while the player speaks in Zen (sparse, not metronomic). */
const ZEN_PLAYER_VISUAL_REACTION_CHANCE = 0.78;
const ZEN_PLAYER_AUDIO_REACTION_CHANCE = 0.62;

/**
 * Plan a sparse listening reaction for the visible Zen bot while a player
 * message streams. Prefer vocal Foley; soft spoken cues stay rare.
 */
export function buildZenPlayerListenerReactionPlanV1(args: {
  conversationId: string;
  messageId: string;
  listenerBotId: string;
  listenerPersona?: string | null;
}): ListenerReactionPlanV1 | null {
  if (!args.messageId || !args.listenerBotId) return null;
  const seed = [
    "zen-player-listener-v1",
    args.conversationId || "zen",
    args.messageId,
    args.listenerBotId,
  ].join(":");
  if (stableUnit(`${seed}:visual-roll`) >= ZEN_PLAYER_VISUAL_REACTION_CHANCE) {
    return null;
  }
  const audible =
    stableUnit(`${seed}:audio-roll`) < ZEN_PLAYER_AUDIO_REACTION_CHANCE;
  const vocalFoley = audible
    ? signalVocalFoley(seed, "neutral", 0)
    : undefined;
  const spokenCue =
    audible &&
    !vocalFoley &&
    stableUnit(`${seed}:spoken-roll`) < 0.28
      ? signalSpokenBackchannel(
          seed,
          "neutral",
          0,
          [],
          args.listenerPersona,
          "interview",
        )
      : undefined;
  return {
    v: LISTENER_REACTION_PLAN_VERSION,
    name: "listenerReaction",
    speakerBotId: "player",
    listenerBotId: args.listenerBotId,
    messageId: args.messageId,
    targetSource: "role",
    visualAction: signalVisualAction(seed, "neutral", 0),
    ...(spokenCue ? { spokenCue } : {}),
    ...(vocalFoley ? { vocalFoley } : {}),
    targetProgress: targetProgress(seed),
    seed,
    cameraCutEligible: false,
  };
}

export const WHODUNNIT_INTERROGATION_BEAT_MS = {
  prosecutorEntrance: 420,
  handoff: 360,
  suspectEntrance: 420,
} as const;

export type WhodunnitInterrogationPhase =
  | "prosecutor_entrance"
  | "prosecutor_speaking"
  | "handoff"
  | "suspect_entrance"
  | "suspect_speaking";

export interface WhodunnitInterrogationEntry {
  speakerBotId: string | null;
  speakerSeatId: string | null;
}

export type WhodunnitInterrogationFinishDecision =
  | "handoff"
  | "advance_queue"
  | "settle"
  | "ignore";

export interface WhodunnitActorDriftTiming {
  durationMs: number;
  delayMs: number;
}

/**
 * Gives each room actor a stable, slightly different place in the same
 * bounded idle-motion loop. The motion remains deterministic for replay and
 * never relies on render-time randomness.
 */
export function whodunnitActorDriftTiming(seed: string): WhodunnitActorDriftTiming {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const unsigned = hash >>> 0;
  return {
    durationMs: 6_400 + (unsigned % 2_401),
    delayMs: -(600 + ((unsigned >>> 8) % 4_801)),
  };
}

/**
 * New Talk graphs have a Prosecutor question followed by a suspect response.
 * Older frozen graphs begin directly with the response, which still gets the
 * witness entrance but never invents a question or audio asset.
 */
export function startWhodunnitInterrogation(
  entries: readonly WhodunnitInterrogationEntry[],
  prosecutorBotId: string,
  suspectSeatId: string,
): WhodunnitInterrogationPhase | null {
  const first = entries[0];
  if (!first) return null;
  if (first.speakerBotId === prosecutorBotId) return "prosecutor_entrance";
  if (first.speakerSeatId === suspectSeatId) return "suspect_entrance";
  return null;
}

export function whodunnitInterrogationBeatMs(
  phase: WhodunnitInterrogationPhase | null,
): number | null {
  switch (phase) {
    case "prosecutor_entrance": return WHODUNNIT_INTERROGATION_BEAT_MS.prosecutorEntrance;
    case "handoff": return WHODUNNIT_INTERROGATION_BEAT_MS.handoff;
    case "suspect_entrance": return WHODUNNIT_INTERROGATION_BEAT_MS.suspectEntrance;
    default: return null;
  }
}

export function nextWhodunnitInterrogationPhase(
  phase: WhodunnitInterrogationPhase,
): WhodunnitInterrogationPhase | "advance_queue" | "complete" {
  switch (phase) {
    case "prosecutor_entrance": return "prosecutor_speaking";
    case "prosecutor_speaking": return "handoff";
    case "handoff": return "advance_queue";
    case "suspect_entrance": return "suspect_speaking";
    case "suspect_speaking": return "complete";
  }
}

/**
 * A skip completes the line currently on screen, never the whole exchange.
 * Prosecutor lines retain their queued witness response for the short handoff;
 * a final witness line settles the exchange. The handoff itself is not a line
 * and deliberately ignores repeated clicks.
 */
export function whodunnitInterrogationFinishDecision(args: {
  phase: WhodunnitInterrogationPhase | null;
  hasQueuedResponse: boolean;
}): WhodunnitInterrogationFinishDecision {
  switch (args.phase) {
    case "prosecutor_entrance":
    case "prosecutor_speaking":
      return args.hasQueuedResponse ? "handoff" : "settle";
    case "suspect_entrance":
    case "suspect_speaking":
      return args.hasQueuedResponse ? "advance_queue" : "settle";
    case "handoff":
      return "ignore";
    case null:
      return "settle";
  }
}

export function whodunnitInterrogationMayStartAudio(
  phase: WhodunnitInterrogationPhase | null,
): boolean {
  return phase === null || phase === "prosecutor_speaking" || phase === "suspect_speaking";
}

/** Mouth animation belongs only to an audio element that has raised play. */
export function whodunnitInterrogationAudioOwnsMouth(args: {
  phase: WhodunnitInterrogationPhase | null;
  audible: boolean;
}): boolean {
  return args.audible && whodunnitInterrogationMayStartAudio(args.phase);
}

/** Presentation-only caption cleanup for legacy/current frozen dialogue. */
export function whodunnitCaptionSpeechText(value: string): string {
  const text = value.trim();
  if (text.length < 2) return text;
  const first = text.at(0);
  const last = text.at(-1);
  const matchedQuotes =
    (first === '"' && last === '"') ||
    (first === "“" && last === "”") ||
    (first === "‘" && last === "’");
  return matchedQuotes ? text.slice(1, -1).trim() : text;
}

/** Guards callbacks from an audio element that was cancelled or superseded. */
export function whodunnitInterrogationCompletionIsCurrent(
  completionGeneration: number,
  activeGeneration: number,
): boolean {
  return completionGeneration === activeGeneration;
}

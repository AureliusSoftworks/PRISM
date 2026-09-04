export const WHODUNNIT_INTERROGATION_BEAT_MS = {
  prosecutorEntrance: 420,
  /** The suspect visibly thinks here before answering; shorter reads as a flicker. */
  handoff: 820,
  suspectEntrance: 420,
} as const;

export const WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS = {
  spoken: 700,
  textBase: 700,
  textMin: 1_200,
  textMax: 4_200,
  textPerCharacter: 12,
  reducedMotionExtra: 400,
} as const;

export const WHODUNNIT_DIALOGUE_TYPEWRITER = {
  minDurationMs: 720,
  msPerCharacter: 42,
} as const;

/**
 * A deliberately readable Phoenix Wright-style caption clock. Every visible
 * Whodunnit line uses this when prepared speech is absent or intentionally
 * suppressed; a player gesture can still settle the line immediately.
 */
export function whodunnitDialogueTypewriterDurationMs(text: string): number {
  return Math.max(
    WHODUNNIT_DIALOGUE_TYPEWRITER.minDurationMs,
    whodunnitCaptionSpeechText(text).length *
      WHODUNNIT_DIALOGUE_TYPEWRITER.msPerCharacter,
  );
}

/**
 * Spoken lines need only a short caption hold after their real audio ends.
 * Text-only lines earn additional reading time from their actual visible
 * length because the player has no voice cadence to carry comprehension.
 */
export function whodunnitInvestigationDialogueGraceMs(args: {
  delivery: "spoken" | "text_only" | "persona_babble" | "anonymous_babble";
  reducedMotion: boolean;
  text: string;
}): number {
  const base = args.delivery === "spoken"
    ? WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.spoken
    : Math.min(
        WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.textMax,
        Math.max(
          WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.textMin,
          WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.textBase +
            args.text.trim().length * WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.textPerCharacter,
        ),
      );
  return base + (
    args.reducedMotion
      ? WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.reducedMotionExtra
      : 0
  );
}

/**
 * The last witness answer is a player-owned beat, regardless of whether it
 * arrived as prepared speech or a text-only fallback. It must not be folded
 * into the ordinary caption grace timer.
 */
export function whodunnitInterrogationTerminalWitnessShouldHold(args: {
  hasQueuedResponse: boolean;
  phase: WhodunnitInterrogationPhase | null;
}): boolean {
  return !args.hasQueuedResponse &&
    (args.phase === "suspect_entrance" || args.phase === "suspect_speaking");
}

/** Only a standalone, presentation-complete Investigation line closes itself.
 * A queued exchange never moves to its next speaker on its own, and player
 * observations and a terminal witness answer wait for an explicit gesture. */
export function whodunnitInvestigationDialogueShouldAutoAdvance(args: {
  busy: boolean;
  hasActiveAudio: boolean;
  hasDialogue: boolean;
  hasQueuedDialogue: boolean;
  isPlayerObservation: boolean;
  playPhase: string;
  requiresPlayerInput: boolean;
  roomView: string;
  streaming: boolean;
  terminalWitnessHold: boolean;
}): boolean {
  return args.playPhase === "investigation" &&
    args.roomView === "room" &&
    args.hasDialogue &&
    !args.hasQueuedDialogue &&
    !args.isPlayerObservation &&
    !args.terminalWitnessHold &&
    !args.busy &&
    !args.hasActiveAudio &&
    !args.requiresPlayerInput &&
    !args.streaming;
}

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

export type WhodunnitDialogueGestureDecision = "fill" | "advance" | "ignore";

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
  return whodunnitInterrogationEntrancePhaseForEntry(
    entries[0] ?? null,
    prosecutorBotId,
    suspectSeatId,
  );
}

/** Resolve every queued handoff from the next frozen speaker, rather than
 * assuming all room exchanges end after one Prosecutor/witness pair. */
export function whodunnitInterrogationEntrancePhaseForEntry(
  entry: WhodunnitInterrogationEntry | null,
  prosecutorBotId: string,
  suspectSeatId: string,
): WhodunnitInterrogationPhase | null {
  if (!entry) return null;
  if (entry.speakerBotId === prosecutorBotId) return "prosecutor_entrance";
  if (entry.speakerSeatId === suspectSeatId) return "suspect_entrance";
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

/**
 * Court exchanges are already ordered by the frozen server graph and do not
 * use the room interrogation entrance/handoff choreography. A gesture settles
 * exactly the visible line, then either advances one queued Court beat or
 * releases the queue so the newly active witness remains authoritative.
 */
export type WhodunnitCourtDialogueFinishDecision = "advance_queue" | "clear";

export function whodunnitCourtDialogueFinishDecision(args: {
  hasQueuedResponse: boolean;
}): WhodunnitCourtDialogueFinishDecision {
  return args.hasQueuedResponse ? "advance_queue" : "clear";
}

export interface WhodunnitCourtDialogueEntry {
  speakerSeatId: string | null;
}

/**
 * Court mutations can author the retiring witness's last beats and enter the
 * next chapter in one response. Keep the stand with the nearest real witness
 * in the finite playback queue until that queue reaches the next witness.
 */
export function whodunnitCourtPresentedWitnessSeatId(args: {
  activeWitnessSeatId: string | null;
  dialogueIndex: number;
  dialogueQueue: readonly WhodunnitCourtDialogueEntry[];
  suspectSeatIds: ReadonlySet<string>;
}): string | null {
  const seatAt = (index: number): string | null => {
    const seatId = args.dialogueQueue[index]?.speakerSeatId ?? null;
    return seatId && args.suspectSeatIds.has(seatId) ? seatId : null;
  };
  const currentSeatId = seatAt(args.dialogueIndex);
  if (currentSeatId) return currentSeatId;
  for (let index = args.dialogueIndex + 1; index < args.dialogueQueue.length; index += 1) {
    const seatId = seatAt(index);
    if (seatId) return seatId;
  }
  for (let index = Math.min(args.dialogueIndex - 1, args.dialogueQueue.length - 1); index >= 0; index -= 1) {
    const seatId = seatAt(index);
    if (seatId) return seatId;
  }
  return args.activeWitnessSeatId;
}

/** A native double-click must never carry an old line's advance into a new line. */
export function whodunnitCourtDialogueGestureCrossedPresentation(args: {
  armedPresentationKey: string | null;
  clickCount: number;
  presentationKey: string | null;
}): boolean {
  return args.clickCount > 1 && Boolean(
    args.armedPresentationKey &&
    args.presentationKey &&
    args.armedPresentationKey !== args.presentationKey,
  );
}

/** Keep a verdict-bound exchange in Court until its last visible beat settles. */
export function whodunnitCourtPresentationVisible(args: {
  hasQueuedDialogue: boolean;
  playPhase: string;
}): boolean {
  return args.playPhase === "trial" || (
    args.playPhase === "verdict" && args.hasQueuedDialogue
  );
}

/**
 * The server seals the verdict in the same mutation that queues the final
 * objection, revision, and ruling dialogue. Keep its screen-wide result
 * callout off the still-playing Cross-Examination surface; it belongs to the
 * verdict surface after those authored Court beats have settled.
 */
export function whodunnitCourtCalloutPresentationVisible(args: {
  courtPresentationActive: boolean;
  playPhase: string;
}): boolean {
  return args.playPhase !== "verdict" || !args.courtPresentationActive;
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

/**
 * Resolves one pointer/keyboard gesture without changing the authoritative
 * dialogue queue. Streaming text fills on the first gesture and advances on
 * the next, for every speaker. A repeated click may advance a line filled by
 * its first click, except when that first click cut a running line short.
 */
export function whodunnitDialogueGestureDecision(args: {
  advanceArmed: boolean;
  automatedBotPlayback: boolean;
  botFillArmed: boolean;
  clickCount: number;
  filledByGesture: boolean;
  streaming: boolean;
}): WhodunnitDialogueGestureDecision {
  if (args.clickCount > 1 && (args.advanceArmed || args.botFillArmed)) return "ignore";
  if (args.filledByGesture) return "advance";
  if (args.streaming || args.automatedBotPlayback) return "fill";
  return "advance";
}

/** Keeps screen-wide dialogue gestures out of ordinary interactive controls. */
export function whodunnitDialogueGestureControlIsInteractive(args: {
  contentEditable: boolean;
  tagName: string;
}): boolean {
  if (args.contentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "LABEL"].includes(
    args.tagName.toUpperCase(),
  );
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

/**
 * Queued spoken dialogue owns its caption before playback begins. Treating a
 * missing or previous line's clock as completed would expose the frozen full
 * text for one paint before the progressive reveal starts.
 */
export function whodunnitCaptionRevealIsPending(args: {
  queued: boolean;
  revealExpected: boolean;
  presentationText: string;
  timingText: string | null | undefined;
}): boolean {
  if (!args.queued || !args.revealExpected) return false;
  if (!args.timingText) return true;
  return args.timingText !== args.presentationText &&
    whodunnitCaptionSpeechText(args.timingText) !== args.presentationText;
}

/** Guards callbacks from an audio element that was cancelled or superseded. */
export function whodunnitInterrogationCompletionIsCurrent(
  completionGeneration: number,
  activeGeneration: number,
): boolean {
  return completionGeneration === activeGeneration;
}

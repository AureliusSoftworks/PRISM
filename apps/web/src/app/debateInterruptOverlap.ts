import type { DebateEventV1 } from "@localai/shared";

import { debateInterruptedSpeechCaption } from "./debatePresentation.ts";

/** Fraction of the interrupted line heard before the cut-in overlaps. */
export const DEBATE_INTERRUPT_OVERLAP_PROGRESS = 0.58;

/** Soft-cut the interrupted voice so the waveform does not click. */
export const DEBATE_INTERRUPT_PRIMARY_RELEASE_MS = 90;

/** Hold the interrupted speaker on camera briefly after Con starts shouting. */
export const DEBATE_INTERRUPT_CAMERA_HOLD_MS = 180;

/** Delay before the interrupted bot’s trail-off line starts under the Objection. */
export const DEBATE_INTERRUPT_TRAIL_OFF_LEAD_MS = 140;

const TRAIL_OFF_LINES = [
  "…Okay then.",
  "…Fine.",
  "…Go ahead.",
  "…I wasn’t finished, but—",
  "…All right.",
  "…Sure.",
] as const;

export type DebateInterruptPair = {
  interrupted: DebateEventV1;
  interrupter: DebateEventV1;
};

function debateInterruptSkippableBetween(
  event: Pick<DebateEventV1, "kind" | "stepKey">,
): boolean {
  return (
    event.kind === "system" ||
    event.stepKey === "audience_order" ||
    event.stepKey.startsWith("persona_reaction_")
  );
}

/**
 * Find a bot/player floor break that should play as an overlapping cut-in:
 * truncated speech followed by an objection or interjection that names it.
 */
export function debateInterruptOverlapPair(
  events: readonly DebateEventV1[],
  interruptedEventId: string,
): DebateInterruptPair | null {
  const interruptedIndex = events.findIndex(
    (event) => event.id === interruptedEventId,
  );
  if (interruptedIndex < 0) return null;
  const interrupted = events[interruptedIndex]!;
  if (!interrupted.interrupted) return null;
  if (
    interrupted.kind !== "speech" &&
    interrupted.kind !== "player_turn" &&
    interrupted.kind !== "moderator_prompt"
  ) {
    return null;
  }
  for (let index = interruptedIndex + 1; index < events.length; index += 1) {
    const candidate = events[index]!;
    if (debateInterruptSkippableBetween(candidate)) continue;
    if (
      candidate.kind !== "objection" &&
      candidate.kind !== "interjection"
    ) {
      return null;
    }
    if (candidate.parentEventId !== interrupted.id) return null;
    return { interrupted, interrupter: candidate };
  }
  return null;
}

/** Deterministic short yield line spoken under the interrupter during the pan. */
export function debateInterruptTrailOffLine(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return TRAIL_OFF_LINES[hash % TRAIL_OFF_LINES.length]!;
}

export function debateInterruptCutCaption(visibleContent: string): string {
  return debateInterruptedSpeechCaption(visibleContent);
}

export function debateInterruptShouldFire(
  elapsedMs: number,
  durationMs: number,
  progress = DEBATE_INTERRUPT_OVERLAP_PROGRESS,
): boolean {
  if (durationMs <= 0) return elapsedMs > 0;
  return elapsedMs / durationMs >= progress;
}

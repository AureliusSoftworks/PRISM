import type { SpeechCharacterAlignment } from "./speechRevealTimeline";
import {
  buildSpeechActivityWindows,
  speechActivityAtMs,
  type SpeechActivityWindow,
} from "./speechActivity.ts";
import {
  revealAtMsFromSegmentTimings,
  speechActivityWindowsForSegmentClock,
  type SpeechSegmentTiming,
} from "./speechSegmentClock.ts";

export type BotcastSpeechRevealPhase = "preparing" | "playing" | "ended";

export interface BotcastSpeechRevealToken {
  /** Exact source slice, including surrounding whitespace. */
  text: string;
  /** Audio-clock time after this token has finished being spoken. */
  completionAtMs: number;
}

export interface BotcastSpeechRevealState {
  text: string;
  tokens: BotcastSpeechRevealToken[];
  durationMs: number;
  elapsedMs: number;
  progress: number;
  phase: BotcastSpeechRevealPhase;
  /** Provider timing retained for the live avatar's aligned visemes. */
  alignment: SpeechCharacterAlignment | null;
  speechActivityWindows: SpeechActivityWindow[] | null;
  /** Chunked English segment clock; when present, drives reveal through gaps. */
  segmentTimings?: SpeechSegmentTiming[] | null;
  /** Hold uncovered tokens until real chunk segments arrive. */
  segmentClock?: boolean;
}

interface SourceToken {
  text: string;
  completionCharacterIndex: number;
}

function tokenizePreservingWhitespace(text: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let characterOffset = 0;

  for (const match of text.matchAll(/\s*\S+(?:\s+|$)/gu)) {
    const tokenText = match[0];
    const characters = Array.from(tokenText);
    let lastSpokenOffset = characters.length - 1;
    while (lastSpokenOffset >= 0 && /\s/u.test(characters[lastSpokenOffset] ?? "")) {
      lastSpokenOffset -= 1;
    }
    if (lastSpokenOffset >= 0) {
      tokens.push({
        text: tokenText,
        completionCharacterIndex: characterOffset + lastSpokenOffset,
      });
    }
    characterOffset += characters.length;
  }

  return tokens;
}

function tokenWeight(token: string): number {
  const spoken = token.trim();
  const spokenLength = Math.max(1, Array.from(spoken).length);
  let weight = Math.max(0.7, Math.sqrt(spokenLength));
  if (/[,;:]$/u.test(spoken)) weight += 0.45;
  if (/[.!?]$/u.test(spoken)) weight += 0.9;
  if (/[—–…]$/u.test(spoken)) weight += 1.1;
  return weight;
}

function alignmentTimingIsUsable(
  alignment: SpeechCharacterAlignment | null | undefined,
): alignment is SpeechCharacterAlignment {
  if (!alignment) return false;
  const count = alignment.characters.length;
  if (
    count === 0 ||
    count !== alignment.characterStartTimesSeconds.length ||
    count !== alignment.characterEndTimesSeconds.length
  ) return false;

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
      start < 0 ||
      end < start ||
      start < previousStart ||
      end < previousEnd
    ) return false;
    previousStart = start;
    previousEnd = end;
  }
  return previousEnd > 0;
}

function alignmentIsUsable(
  text: string,
  alignment: SpeechCharacterAlignment | null | undefined,
): alignment is SpeechCharacterAlignment {
  return (
    alignmentTimingIsUsable(alignment) &&
    alignment.characters.join("") === text
  );
}

function alignedCompletionTimes(
  text: string,
  tokens: readonly SourceToken[],
  durationMs: number,
  alignment: SpeechCharacterAlignment | null | undefined
): number[] | null {
  if (!alignmentIsUsable(text, alignment)) return null;
  return tokens.map((token) => {
    const completionSeconds =
      alignment.characterEndTimesSeconds[token.completionCharacterIndex];
    if (typeof completionSeconds !== "number") return durationMs;
    return Math.max(1, Math.min(durationMs, Math.round(completionSeconds * 1000)));
  });
}

function fallbackCompletionTimes(
  tokens: readonly SourceToken[],
  durationMs: number
): number[] {
  const weights = tokens.map((token) => tokenWeight(token.text));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let completedWeight = 0;
  return weights.map((weight, index) => {
    completedWeight += weight;
    if (index === weights.length - 1) return durationMs;
    return Math.max(1, Math.min(
      durationMs,
      Math.round((completedWeight / Math.max(totalWeight, 1)) * durationMs)
    ));
  });
}

/** Hold a completed Signal turn off-screen until its audio begins. */
export function prepareBotcastSpeechReveal(text: string): BotcastSpeechRevealState {
  return {
    text,
    tokens: [],
    durationMs: 0,
    elapsedMs: 0,
    progress: 0,
    phase: "preparing",
    alignment: null,
    speechActivityWindows: null,
    segmentTimings: null,
    segmentClock: false,
  };
}

/** Start transcript reveal from the real audio clock. */
export function startBotcastSpeechReveal({
  text,
  durationMs,
  alignment,
  segmentTimings,
  segmentClock,
}: {
  text: string;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
  segmentTimings?: readonly SpeechSegmentTiming[] | null;
  segmentClock?: boolean;
}): BotcastSpeechRevealState {
  const normalizedDurationMs = Math.max(1, Math.round(
    Number.isFinite(durationMs) ? durationMs : 0
  ));
  const sourceTokens = tokenizePreservingWhitespace(text);
  const useSegmentClock =
    segmentClock === true || segmentTimings != null;
  // When useSegmentClock is false, segmentTimings is already nullish
  // (see the guard above), so there is no non-clock fallback array.
  const segments = useSegmentClock ? [...(segmentTimings ?? [])] : null;
  // A segment clock is incremental: unplayed characters are deliberately not
  // timed yet. Never expose that partial clock as a full-utterance provider
  // alignment; the Signal avatar resolves each audible segment directly.
  const mouthAlignment =
    !useSegmentClock && alignmentTimingIsUsable(alignment) ? alignment : null;
  const segmentCompletionTimes = useSegmentClock
    ? revealAtMsFromSegmentTimings(
        sourceTokens.map((token) => token.text),
        segments ?? [],
      ) ?? sourceTokens.map(() => Number.POSITIVE_INFINITY)
    : segments
      ? revealAtMsFromSegmentTimings(
          sourceTokens.map((token) => token.text),
          segments,
        )
      : null;
  const completionTimes =
    segmentCompletionTimes ??
    alignedCompletionTimes(
      text,
      sourceTokens,
      normalizedDurationMs,
      alignment,
    ) ??
    fallbackCompletionTimes(sourceTokens, normalizedDurationMs);

  return {
    text,
    tokens: sourceTokens.map((token, index) => ({
      text: token.text,
      completionAtMs: completionTimes[index] ?? normalizedDurationMs,
    })),
    durationMs: normalizedDurationMs,
    elapsedMs: 0,
    progress: 0,
    phase: "playing",
    alignment: mouthAlignment,
    speechActivityWindows: speechActivityWindowsForSegmentClock({
      text,
      segments: segments ?? [],
      durationMs: normalizedDurationMs,
      alignment: mouthAlignment,
      segmentClock: useSegmentClock,
    }) ??
      buildSpeechActivityWindows(mouthAlignment, normalizedDurationMs),
    segmentTimings: segments,
    segmentClock: useSegmentClock,
  };
}

/**
 * Fold a new chunked-English segment into a live reveal so text and mouth
 * hold through silence and resume together when speech returns.
 */
export function applyBotcastSpeechRevealSegmentTiming(
  state: BotcastSpeechRevealState,
  timing: SpeechSegmentTiming,
  durationMs?: number,
): BotcastSpeechRevealState {
  if (state.phase !== "playing") return state;
  const segments = [...(state.segmentTimings ?? []), timing];
  const rebuilt = startBotcastSpeechReveal({
    text: state.text,
    durationMs: Math.max(
      state.durationMs,
      Number.isFinite(durationMs) ? (durationMs as number) : 0,
      timing.endMs,
    ),
    alignment: state.alignment,
    segmentTimings: segments,
    segmentClock: true,
  });
  return updateBotcastSpeechReveal(rebuilt, state.elapsedMs);
}

export function updateBotcastSpeechReveal(
  state: BotcastSpeechRevealState,
  elapsedMs: number
): BotcastSpeechRevealState {
  if (state.phase !== "playing") return state;
  const elapsed = Math.max(0, Math.min(
    state.durationMs,
    Number.isFinite(elapsedMs) ? elapsedMs : 0
  ));
  return {
    ...state,
    elapsedMs: elapsed,
    progress: elapsed / Math.max(1, state.durationMs),
  };
}

export function finishBotcastSpeechReveal(
  state: BotcastSpeechRevealState
): BotcastSpeechRevealState {
  return {
    ...state,
    elapsedMs: state.durationMs,
    progress: 1,
    phase: "ended",
  };
}

export function botcastSpeechRevealVisibleTokenCount(
  state: BotcastSpeechRevealState
): number {
  if (state.phase === "preparing") return 0;
  if (state.phase === "ended") return state.tokens.length;
  let low = 0;
  let high = state.tokens.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const completionAtMs =
      state.tokens[middle]?.completionAtMs ?? Number.POSITIVE_INFINITY;
    // Incomplete chunk tokens stay at +Infinity until their speech segment arrives.
    if (Number.isFinite(completionAtMs) && completionAtMs <= state.elapsedMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Null preserves the existing animation when no provider timing is present. */
export function botcastSpeechRevealIsVoicing(
  state: BotcastSpeechRevealState | null | undefined,
): boolean | null {
  if (!state || state.phase !== "playing") return false;
  return speechActivityAtMs(state.speechActivityWindows, state.elapsedMs);
}

/** Exact transcript prefix containing only fully spoken tokens. */
export function botcastSpeechRevealVisibleText(
  state: BotcastSpeechRevealState
): string {
  if (state.phase === "ended") return state.text;
  return state.tokens
    .slice(0, botcastSpeechRevealVisibleTokenCount(state))
    .map((token) => token.text)
    .join("");
}

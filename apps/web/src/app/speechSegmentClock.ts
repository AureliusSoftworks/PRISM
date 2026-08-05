import {
  buildSpeechActivityWindows,
  buildSpeechActivityWindowsFromTextCadence,
  SPEECH_ACTIVITY_ATTACK_MS,
  SPEECH_ACTIVITY_RELEASE_MS,
  type SpeechActivityWindow,
} from "./speechActivity.ts";
import type { SpeechCharacterAlignment } from "./speechRevealTimeline.ts";

/** Source-linked speech/action timing from chunked English playback. */
export interface SpeechSegmentTiming {
  kind: "speech" | "vocal-action";
  sourceStart: number;
  sourceEnd: number;
  startMs: number;
  endMs: number;
  heard: boolean;
  action?: string | null;
}

/** Characters not yet covered by a heard speech segment stay off-screen. */
const PENDING_CHARACTER_TIME_SECONDS = 1_000_000;

function heardSpeechSegments(
  segments: readonly SpeechSegmentTiming[],
): SpeechSegmentTiming[] {
  return segments.filter(
    (segment) =>
      segment.kind === "speech" &&
      segment.heard &&
      Number.isFinite(segment.startMs) &&
      Number.isFinite(segment.endMs) &&
      segment.endMs > segment.startMs &&
      segment.sourceEnd > segment.sourceStart,
  );
}

/**
 * Map spoken source characters onto the audible clock using heard speech
 * segments only. Clause gaps (heard: false) leave time holes so text and
 * mouth stay frozen while silence plays.
 */
export function buildCharacterAlignmentFromSegmentTimings(
  text: string,
  segments: readonly SpeechSegmentTiming[],
): SpeechCharacterAlignment | null {
  const characters = Array.from(text);
  if (characters.length === 0) return null;
  const speech = heardSpeechSegments(segments);
  if (speech.length === 0) return null;

  const characterStartTimesSeconds: number[] = [];
  const characterEndTimesSeconds: number[] = [];

  for (let index = 0; index < characters.length; index += 1) {
    const covering = speech.find(
      (segment) => index >= segment.sourceStart && index < segment.sourceEnd,
    );
    if (!covering) {
      characterStartTimesSeconds.push(PENDING_CHARACTER_TIME_SECONDS);
      characterEndTimesSeconds.push(PENDING_CHARACTER_TIME_SECONDS);
      continue;
    }
    const span = Math.max(1, covering.sourceEnd - covering.sourceStart);
    const local = (index - covering.sourceStart + 0.5) / span;
    const startMs =
      covering.startMs +
      Math.max(0, local - 0.5 / span) * (covering.endMs - covering.startMs);
    const endMs =
      covering.startMs +
      Math.min(1, local + 0.5 / span) * (covering.endMs - covering.startMs);
    characterStartTimesSeconds.push(Math.max(0, startMs) / 1000);
    characterEndTimesSeconds.push(
      Math.max(startMs + 1, endMs) / 1000,
    );
  }

  return {
    characters,
    characterStartTimesSeconds,
    characterEndTimesSeconds,
  };
}

/**
 * Voiced windows from heard speech segments only. Gaps stay idle after a
 * brief release so the mouth closes through clause pauses.
 */
export function buildSpeechActivityWindowsFromHeardSegments(
  segments: readonly SpeechSegmentTiming[],
  durationMs: number,
): SpeechActivityWindow[] | null {
  const speech = heardSpeechSegments(segments);
  if (speech.length === 0) return null;
  const normalizedDurationMs = Math.max(
    1,
    Math.round(Number.isFinite(durationMs) ? durationMs : 0),
  );
  const windows: SpeechActivityWindow[] = [];
  for (const segment of speech) {
    const startMs = Math.max(
      0,
      windows.length === 0
        ? segment.startMs
        : segment.startMs - SPEECH_ACTIVITY_ATTACK_MS,
    );
    const endMs = Math.min(
      normalizedDurationMs,
      segment.endMs + SPEECH_ACTIVITY_RELEASE_MS,
    );
    if (endMs <= startMs) continue;
    const previous = windows.at(-1);
    // Do not bridge deliberate clause pauses — only touch adjacent phoneme tails.
    if (previous && startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, endMs);
    } else {
      windows.push({ startMs, endMs });
    }
  }
  return windows.length > 0 ? windows : null;
}

/**
 * How many source characters have finished on the audible clock, freezing
 * through silence segments so on-screen text never creeps during pauses.
 */
export function visibleCharacterCountFromSegmentTimings(
  text: string,
  segments: readonly SpeechSegmentTiming[],
  elapsedMs: number,
): number {
  const characters = Array.from(text);
  if (characters.length === 0) return 0;
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const speech = heardSpeechSegments(segments);
  if (speech.length === 0) return 0;

  let maxSourceEnd = 0;
  for (const segment of speech) {
    if (elapsed < segment.startMs) break;
    if (elapsed >= segment.endMs) {
      maxSourceEnd = Math.max(maxSourceEnd, segment.sourceEnd);
      continue;
    }
    const span = Math.max(1, segment.sourceEnd - segment.sourceStart);
    const t =
      (elapsed - segment.startMs) / Math.max(1, segment.endMs - segment.startMs);
    maxSourceEnd = Math.max(
      maxSourceEnd,
      Math.min(
        segment.sourceEnd,
        segment.sourceStart + Math.floor(t * span),
      ),
    );
    break;
  }
  return Math.max(0, Math.min(characters.length, maxSourceEnd));
}

/** Prefer segment-derived activity windows; fall back to alignment smoothing. */
export function speechActivityWindowsForSegmentClock(args: {
  text: string;
  segments: readonly SpeechSegmentTiming[];
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
  /** When true, never fall back to null — empty windows keep the mouth idle. */
  segmentClock?: boolean;
}): SpeechActivityWindow[] | null {
  const fromSegments = buildSpeechActivityWindowsFromHeardSegments(
    args.segments,
    args.durationMs,
  );
  if (fromSegments) return fromSegments;
  if (args.segmentClock) return [];
  return (
    buildSpeechActivityWindows(args.alignment ?? null, args.durationMs) ??
    buildSpeechActivityWindowsFromTextCadence(args.text, args.durationMs)
  );
}

/**
 * Token reveal times from heard speech segments. Tokens not yet covered stay
 * at +Infinity so they cannot appear during clause silence.
 */
export function revealAtMsFromSegmentTimings(
  tokens: readonly string[],
  segments: readonly SpeechSegmentTiming[],
): number[] | null {
  const speech = heardSpeechSegments(segments);
  if (speech.length === 0 || tokens.length === 0) return null;
  let sourceOffset = 0;
  return tokens.map((token) => {
    const tokenCharacters = Array.from(token);
    let lastSpokenOffset = tokenCharacters.length - 1;
    while (
      lastSpokenOffset >= 0 &&
      /\s/u.test(tokenCharacters[lastSpokenOffset] ?? "")
    ) {
      lastSpokenOffset -= 1;
    }
    const completionIndex =
      lastSpokenOffset >= 0 ? sourceOffset + lastSpokenOffset : sourceOffset;
    sourceOffset += tokenCharacters.length;
    const covering = speech.find(
      (segment) =>
        completionIndex >= segment.sourceStart &&
        completionIndex < segment.sourceEnd,
    );
    if (!covering) return Number.POSITIVE_INFINITY;
    const span = Math.max(1, covering.sourceEnd - covering.sourceStart);
    const local = (completionIndex - covering.sourceStart + 1) / span;
    return Math.max(
      1,
      Math.round(
        covering.startMs +
          Math.min(1, local) * (covering.endMs - covering.startMs),
      ),
    );
  });
}

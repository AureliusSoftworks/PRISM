import { englishCrtVisemeTimeline } from "./zenLiveMouth.ts";

export interface SpeechActivityCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface SpeechActivityWindow {
  startMs: number;
  endMs: number;
}

/**
 * Give the face a small attack/release envelope so it does not chatter shut
 * between phonemes. Attack applies only inside a continuous phoneme run —
 * never across a deliberate pause — so lips do not reopen into silence.
 * Attack never pulls the *first* voiced onset early either.
 */
export const SPEECH_ACTIVITY_ATTACK_MS = 45;
/** Hold the last phoneme long enough for the audible vowel/consonant tail. */
export const SPEECH_ACTIVITY_RELEASE_MS = 200;
/** Gaps at or below this are treated as continuous phoneme runs (may merge). */
export const SPEECH_ACTIVITY_MERGE_GAP_MS = 40;
/** Text-cadence rests already encode pause length — keep envelope tiny. */
const TEXT_CADENCE_ATTACK_MS = 12;
const TEXT_CADENCE_RELEASE_MS = 24;
/**
 * Local Kokoro clips often open with a short silent lead-in and no character
 * timing. Keep the mouth idle until that typical onset so lips do not beat the
 * first phoneme.
 */
export const TEXT_CADENCE_LEAD_IN_MS = 110;
/**
 * After a punctuation/clause rest in the CRT unit clock, keep lips idle a
 * little into the next voiced beat so heuristic rests do not end before the
 * real Kokoro silence finishes.
 */
export const TEXT_CADENCE_POST_REST_LEAD_IN_MS = 80;

interface RawSpeechActivitySpan {
  startMs: number;
  endMs: number;
  /** When true, the next voiced beat follows a rest/closed CRT beat. */
  afterPause?: boolean;
}

/**
 * Start of a voiced window. Attack only when the previous window ended within
 * the merge gap (continuous run). After a real pause, never pull onset early.
 */
export function speechActivityEnvelopeStartMs(args: {
  rawStartMs: number;
  previousEndMs: number | null;
  attackMs: number;
  afterPauseLeadInMs?: number;
}): number {
  const rawStartMs = Math.max(0, args.rawStartMs);
  const afterPauseLeadInMs = Math.max(0, args.afterPauseLeadInMs ?? 0);
  if (args.previousEndMs == null) {
    return rawStartMs;
  }
  const gap = rawStartMs - args.previousEndMs;
  if (gap <= SPEECH_ACTIVITY_MERGE_GAP_MS) {
    return Math.max(0, rawStartMs - args.attackMs);
  }
  return rawStartMs + afterPauseLeadInMs;
}

/**
 * End of a voiced window. Cap release to half of the following silence so short
 * TTS pauses still idle the mouth.
 */
export function speechActivityEnvelopeEndMs(args: {
  rawEndMs: number;
  nextRawStartMs: number | null;
  releaseMs: number;
  durationMs: number;
}): number {
  const rawEndMs = Math.max(0, args.rawEndMs);
  const durationMs = Math.max(1, args.durationMs);
  let release = Math.max(0, args.releaseMs);
  if (
    args.nextRawStartMs != null &&
    Number.isFinite(args.nextRawStartMs)
  ) {
    const gap = args.nextRawStartMs - rawEndMs;
    if (gap > SPEECH_ACTIVITY_MERGE_GAP_MS) {
      release = Math.min(release, Math.max(0, Math.floor(gap / 2)));
    } else if (gap <= 0) {
      release = 0;
    }
  }
  return Math.min(durationMs, rawEndMs + release);
}

function mergeSpeechActivityWindows(
  spans: readonly RawSpeechActivitySpan[],
  args: {
    durationMs: number;
    attackMs: number;
    releaseMs: number;
    afterPauseLeadInMs?: number;
  },
): SpeechActivityWindow[] {
  if (spans.length === 0) return [];
  const windows: SpeechActivityWindow[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]!;
    const next = spans[index + 1] ?? null;
    const previousRaw = spans[index - 1] ?? null;
    const previous = windows.at(-1) ?? null;
    const envelopedStart = speechActivityEnvelopeStartMs({
      rawStartMs: span.startMs,
      previousEndMs: previousRaw?.endMs ?? null,
      attackMs: args.attackMs,
      // First onset lead-in is already baked into rawStart for text cadence.
      afterPauseLeadInMs:
        span.afterPause && previousRaw != null
          ? (args.afterPauseLeadInMs ?? 0)
          : 0,
    });
    const endMs = speechActivityEnvelopeEndMs({
      rawEndMs: span.endMs,
      nextRawStartMs: next?.startMs ?? null,
      releaseMs: args.releaseMs,
      durationMs: args.durationMs,
    });
    if (endMs <= envelopedStart) continue;
    if (
      previous &&
      envelopedStart <= previous.endMs + SPEECH_ACTIVITY_MERGE_GAP_MS
    ) {
      previous.endMs = Math.max(previous.endMs, endMs);
    } else {
      windows.push({ startMs: envelopedStart, endMs });
    }
  }
  return windows;
}

function alignmentDurationSeconds(
  alignment: SpeechActivityCharacterAlignment,
): number | null {
  const count = alignment.characters.length;
  if (
    count === 0 ||
    count !== alignment.characterStartTimesSeconds.length ||
    count !== alignment.characterEndTimesSeconds.length
  ) {
    return null;
  }
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
    ) {
      return null;
    }
    previousStart = start;
    previousEnd = end;
  }
  return previousEnd > 0 ? previousEnd : null;
}

/** Build smoothed voiced regions from provider character timing. */
export function buildSpeechActivityWindows(
  alignment: SpeechActivityCharacterAlignment | null | undefined,
  durationMs: number,
): SpeechActivityWindow[] | null {
  if (!alignment) return null;
  const alignmentDuration = alignmentDurationSeconds(alignment);
  if (!alignmentDuration) return null;
  const normalizedDurationMs = Math.max(
    1,
    Math.round(Number.isFinite(durationMs) ? durationMs : 0),
  );
  const scale = normalizedDurationMs / (alignmentDuration * 1000);
  const rawSpans: RawSpeechActivitySpan[] = [];

  for (let index = 0; index < alignment.characters.length; index += 1) {
    const character = alignment.characters[index] ?? "";
    if (!/[\p{L}\p{N}]/u.test(character)) continue;
    const startMs =
      (alignment.characterStartTimesSeconds[index] ?? 0) * 1000 * scale;
    const endMs =
      (alignment.characterEndTimesSeconds[index] ?? 0) * 1000 * scale;
    if (endMs <= startMs) continue;
    const previous = rawSpans.at(-1);
    const gap = previous ? startMs - previous.endMs : 0;
    if (previous && gap <= SPEECH_ACTIVITY_MERGE_GAP_MS) {
      previous.endMs = Math.max(previous.endMs, endMs);
    } else {
      rawSpans.push({
        startMs,
        endMs,
        afterPause: Boolean(previous && gap > SPEECH_ACTIVITY_MERGE_GAP_MS),
      });
    }
  }

  const windows = mergeSpeechActivityWindows(rawSpans, {
    durationMs: normalizedDurationMs,
    attackMs: SPEECH_ACTIVITY_ATTACK_MS,
    releaseMs: SPEECH_ACTIVITY_RELEASE_MS,
  });
  return windows;
}

/**
 * When the voice engine ships no character timing (local English), derive
 * voiced windows from the same punctuation-weighted CRT cadence the mouth
 * uses so lips idle through commas, periods, and clause marks.
 */
export function buildSpeechActivityWindowsFromTextCadence(
  text: string,
  durationMs: number,
): SpeechActivityWindow[] | null {
  const beats = englishCrtVisemeTimeline(text);
  if (beats.length === 0) return null;
  const totalUnits = beats.reduce(
    (sum, beat) => sum + beat.durationUnits,
    0,
  );
  if (totalUnits <= 0) return null;
  const normalizedDurationMs = Math.max(
    1,
    Math.round(Number.isFinite(durationMs) ? durationMs : 0),
  );
  const msPerUnit = normalizedDurationMs / totalUnits;
  const rawSpans: RawSpeechActivitySpan[] = [];
  let cursorUnits = 0;
  let pendingAfterPause = false;
  for (const beat of beats) {
    const beatStartMs = cursorUnits * msPerUnit;
    const beatEndMs = (cursorUnits + beat.durationUnits) * msPerUnit;
    cursorUnits += beat.durationUnits;
    if (beat.kind === "rest" || beat.shape === "closed") {
      pendingAfterPause = true;
      continue;
    }
    let startMs = beatStartMs;
    if (rawSpans.length === 0) {
      startMs = Math.max(beatStartMs, TEXT_CADENCE_LEAD_IN_MS);
    }
    const afterPause = pendingAfterPause;
    pendingAfterPause = false;
    if (startMs >= beatEndMs) continue;
    const previous = rawSpans.at(-1);
    const gap = previous ? startMs - previous.endMs : 0;
    if (previous && gap <= SPEECH_ACTIVITY_MERGE_GAP_MS && !afterPause) {
      previous.endMs = Math.max(previous.endMs, beatEndMs);
    } else {
      rawSpans.push({
        startMs,
        endMs: beatEndMs,
        afterPause: afterPause || Boolean(previous && gap > SPEECH_ACTIVITY_MERGE_GAP_MS),
      });
    }
  }

  const windows = mergeSpeechActivityWindows(rawSpans, {
    durationMs: normalizedDurationMs,
    attackMs: TEXT_CADENCE_ATTACK_MS,
    releaseMs: TEXT_CADENCE_RELEASE_MS,
    afterPauseLeadInMs: TEXT_CADENCE_POST_REST_LEAD_IN_MS,
  });
  return windows.length > 0 ? windows : [];
}

/** Null means no reliable alignment was available, so callers should fallback. */
export function speechActivityAtMs(
  windows: readonly SpeechActivityWindow[] | null | undefined,
  elapsedMs: number,
): boolean | null {
  if (windows == null) return null;
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  let low = 0;
  let high = windows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((windows[middle]?.startMs ?? Number.POSITIVE_INFINITY) <= elapsed) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const active = windows[low - 1];
  return Boolean(active && elapsed <= active.endMs);
}

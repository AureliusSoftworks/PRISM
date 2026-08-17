/**
 * Shared Auto-camera coverage planner.
 *
 * Follow the speaker first. After a close-up has lingered, take a short Wide
 * breath — or, sometimes, glance at another participant even if they are not
 * reacting — then return. Timing is seeded so replay stays stable, with light
 * jitter and punctuation snaps so the cuts read as a human director, not a
 * metronome.
 */

/** Hold a talking-head shot at least this long before coverage is allowed. */
export const AUTO_CAMERA_SPEAKER_LINGER_MS = 7_200;
/** Floor after jitter so a close-up still feels intentional. */
export const AUTO_CAMERA_SPEAKER_LINGER_MIN_MS = 6_200;
/** How far linger may drift so every line does not cut on the same beat. */
export const AUTO_CAMERA_LINGER_JITTER_MS = 900;
/** Shortest editorial glance / Wide breath. */
export const AUTO_CAMERA_RELIEF_MIN_MS = 2_400;
/** Longest editorial glance / Wide breath. */
export const AUTO_CAMERA_RELIEF_MAX_MS = 3_400;
/** Need this much leftover speech to bother returning to the speaker. */
export const AUTO_CAMERA_RETURN_PAD_MS = 2_200;
/** Extra settle time before a second coverage beat on a very long line. */
export const AUTO_CAMERA_SECOND_LINGER_MS = 8_200;
/** Chance a coverage beat glances at a listener instead of going Wide. */
export const AUTO_CAMERA_CUTAWAY_CHANCE = 0.38;
/** Snap a planned cut toward nearby punctuation, within this window. */
export const AUTO_CAMERA_PUNCTUATION_SNAP_MS = 1_400;
/** Ordinary lines get at most this many coverage windows. */
export const AUTO_CAMERA_MAX_BEATS = 2;
/** Very long lines may take one extra breath. */
export const AUTO_CAMERA_LONG_LINE_MAX_BEATS = 3;
export const AUTO_CAMERA_LONG_LINE_MS = 36_000;

export type AutoCameraCoverageKind = "wide" | "cutaway";

export interface AutoCameraCoverageBeat {
  kind: AutoCameraCoverageKind;
  /** Milliseconds after the speaker close-up begins. */
  offsetMs: number;
  durationMs: number;
  /** Which listener to glance at when kind is cutaway (0-based). */
  cutawayIndex: number;
}

export interface PlanAutoCameraCoverageArgs {
  utteranceDurationMs: number;
  seed: string;
  content?: string;
  allowCutaway?: boolean;
  listenerCount?: number;
}

function coverageUnit(seed: string, salt: string): number {
  let hash = 2166136261;
  const text = `${seed}:${salt}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function coverageRange(
  seed: string,
  salt: string,
  min: number,
  max: number,
): number {
  return min + coverageUnit(seed, salt) * (max - min);
}

function coverageInt(seed: string, salt: string, count: number): number {
  if (count <= 1) return 0;
  return Math.floor(coverageUnit(seed, salt) * count) % count;
}

function punctuationOffsetsMs(
  content: string,
  durationMs: number,
): number[] {
  if (!content.trim() || durationMs <= 0) return [];
  const length = content.length;
  const offsets: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const char = content[index];
    if (!char || !/[.!?…;:—–]/.test(char)) continue;
    const next = content[index + 1];
    if (next && /[.!?…;:—–]/.test(next)) continue;
    offsets.push(Math.round((index / length) * durationMs));
  }
  return offsets;
}

function snapOffsetToPunctuation(args: {
  content: string;
  durationMs: number;
  offsetMs: number;
  earliestMs: number;
  latestMs: number;
}): number {
  const marks = punctuationOffsetsMs(args.content, args.durationMs);
  let best = args.offsetMs;
  let bestDistance = AUTO_CAMERA_PUNCTUATION_SNAP_MS + 1;
  for (const mark of marks) {
    if (mark < args.earliestMs || mark > args.latestMs) continue;
    const distance = Math.abs(mark - args.offsetMs);
    if (distance < bestDistance) {
      best = mark;
      bestDistance = distance;
    }
  }
  return best;
}

function lingerMsForBeat(seed: string, beatIndex: number): number {
  const base =
    beatIndex === 0
      ? AUTO_CAMERA_SPEAKER_LINGER_MS
      : AUTO_CAMERA_SECOND_LINGER_MS;
  const jittered = Math.round(
    base +
      (coverageUnit(seed, `linger:${beatIndex}`) - 0.5) *
        2 *
        AUTO_CAMERA_LINGER_JITTER_MS,
  );
  return Math.max(AUTO_CAMERA_SPEAKER_LINGER_MIN_MS, jittered);
}

function reliefDurationMs(seed: string, beatIndex: number): number {
  return Math.round(
    coverageRange(
      seed,
      `relief:${beatIndex}`,
      AUTO_CAMERA_RELIEF_MIN_MS,
      AUTO_CAMERA_RELIEF_MAX_MS,
    ),
  );
}

/**
 * Plan mid-speech coverage windows. Empty when the line is too short to leave
 * the speaker without feeling twitchy.
 */
export function planAutoCameraCoverage(
  args: PlanAutoCameraCoverageArgs,
): AutoCameraCoverageBeat[] {
  const durationMs = Math.max(0, Math.round(args.utteranceDurationMs));
  const minFirstWindow =
    AUTO_CAMERA_SPEAKER_LINGER_MIN_MS + AUTO_CAMERA_RELIEF_MIN_MS;
  if (durationMs < minFirstWindow) return [];

  const seed = args.seed.trim() || "auto-camera";
  const content = args.content ?? "";
  const listenerCount = Math.max(0, Math.floor(args.listenerCount ?? 0));
  const allowCutaway = Boolean(args.allowCutaway) && listenerCount > 0;
  const maxBeats =
    durationMs >= AUTO_CAMERA_LONG_LINE_MS
      ? AUTO_CAMERA_LONG_LINE_MAX_BEATS
      : AUTO_CAMERA_MAX_BEATS;

  const beats: AutoCameraCoverageBeat[] = [];
  let cursorMs = 0;

  for (let beatIndex = 0; beatIndex < maxBeats; beatIndex += 1) {
    const lingerMs = lingerMsForBeat(seed, beatIndex);
    const duration = reliefDurationMs(seed, beatIndex);
    const earliestMs = cursorMs + lingerMs;
    const latestStartMs = durationMs - duration;
    if (earliestMs > latestStartMs) break;

    let offsetMs = earliestMs;
    offsetMs = snapOffsetToPunctuation({
      content,
      durationMs,
      offsetMs,
      earliestMs,
      latestMs: latestStartMs,
    });
    offsetMs = Math.max(earliestMs, Math.min(latestStartMs, offsetMs));

    const remainingAfter = durationMs - (offsetMs + duration);
    const holdToEnd = remainingAfter < AUTO_CAMERA_RETURN_PAD_MS;
    const windowDuration = holdToEnd
      ? Math.max(duration, durationMs - offsetMs)
      : duration;

    const preferCutaway =
      allowCutaway &&
      coverageUnit(seed, `kind:${beatIndex}`) < AUTO_CAMERA_CUTAWAY_CHANCE;
    // After a listener glance, prefer Wide so the room re-establishes.
    const previousWasCutaway = beats.at(-1)?.kind === "cutaway";
    const kind: AutoCameraCoverageKind =
      preferCutaway && !previousWasCutaway ? "cutaway" : "wide";

    beats.push({
      kind,
      offsetMs: Math.round(offsetMs),
      durationMs: Math.round(windowDuration),
      cutawayIndex: coverageInt(seed, `face:${beatIndex}`, listenerCount),
    });

    if (holdToEnd) break;
    cursorMs = offsetMs + windowDuration;
  }

  return beats;
}

/**
 * Active coverage window at elapsed time, or null to stay on the speaker.
 */
export function autoCameraCoverageBeatAt(
  beats: readonly AutoCameraCoverageBeat[],
  elapsedFromSpeakerStartMs: number,
): AutoCameraCoverageBeat | null {
  const elapsed = Math.max(0, elapsedFromSpeakerStartMs);
  for (const beat of beats) {
    if (elapsed >= beat.offsetMs && elapsed < beat.offsetMs + beat.durationMs) {
      return beat;
    }
  }
  return null;
}

/**
 * Milliseconds until the next coverage enter/leave, for timer-driven cameras.
 */
export function autoCameraCoverageNextBoundaryMs(
  beats: readonly AutoCameraCoverageBeat[],
  elapsedFromSpeakerStartMs: number,
): number | null {
  const elapsed = Math.max(0, elapsedFromSpeakerStartMs);
  let nearest: number | null = null;
  for (const beat of beats) {
    const start = beat.offsetMs;
    const end = beat.offsetMs + beat.durationMs;
    for (const boundary of [start, end]) {
      if (boundary <= elapsed) continue;
      nearest =
        nearest === null ? boundary : Math.min(nearest, boundary);
    }
  }
  return nearest === null ? null : nearest - elapsed;
}

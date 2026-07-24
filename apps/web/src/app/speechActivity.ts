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
 * between phonemes. Provider gaps longer than this envelope still read as a
 * deliberate phrase pause.
 */
export const SPEECH_ACTIVITY_ATTACK_MS = 45;
/** Hold the last phoneme long enough for the audible vowel/consonant tail. */
export const SPEECH_ACTIVITY_RELEASE_MS = 200;
const SPEECH_ACTIVITY_MERGE_GAP_MS = 40;

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
  const windows: SpeechActivityWindow[] = [];

  for (let index = 0; index < alignment.characters.length; index += 1) {
    const character = alignment.characters[index] ?? "";
    if (!/[\p{L}\p{N}]/u.test(character)) continue;
    const startMs = Math.max(
      0,
      (alignment.characterStartTimesSeconds[index] ?? 0) * 1000 * scale -
        SPEECH_ACTIVITY_ATTACK_MS,
    );
    const endMs = Math.min(
      normalizedDurationMs,
      (alignment.characterEndTimesSeconds[index] ?? 0) * 1000 * scale +
        SPEECH_ACTIVITY_RELEASE_MS,
    );
    if (endMs <= startMs) continue;
    const previous = windows.at(-1);
    if (
      previous &&
      startMs <= previous.endMs + SPEECH_ACTIVITY_MERGE_GAP_MS
    ) {
      previous.endMs = Math.max(previous.endMs, endMs);
    } else {
      windows.push({ startMs, endMs });
    }
  }
  return windows;
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

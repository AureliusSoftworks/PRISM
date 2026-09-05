import type { VoiceCensorRangeV1 } from "@localai/shared";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects.ts";

export interface VoiceCensorPlanV1 {
  textLength: number;
  ranges: VoiceCensorRangeV1[];
}

export interface VoiceCensorTimingV1 {
  startMs: number;
  endMs: number;
}

const CENSOR_HEADER = "x-prism-voice-censors";
const MIN_FALLBACK_CENSOR_MS = 160;
const MAX_FALLBACK_CENSOR_MS = 650;
const CENSOR_EDGE_RAMP_SECONDS = 0.004;

function normalizedRanges(
  ranges: readonly VoiceCensorRangeV1[],
  textLength: number,
): VoiceCensorRangeV1[] {
  return ranges.flatMap((range) => {
    const start = Math.max(0, Math.min(textLength, Math.floor(range.start)));
    const end = Math.max(start, Math.min(textLength, Math.ceil(range.end)));
    return end > start ? [{ start, end }] : [];
  });
}

export function readVoiceCensorPlan(
  headers: Pick<Headers, "get">,
): VoiceCensorPlanV1 | null {
  const encoded = headers.get(CENSOR_HEADER);
  if (!encoded) return null;
  try {
    const value = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    const textLength = Number(value.textLength);
    if (
      value.version !== 1 ||
      !Number.isInteger(textLength) ||
      textLength <= 0 ||
      !Array.isArray(value.ranges)
    ) {
      return null;
    }
    const ranges = normalizedRanges(
      value.ranges.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const record = candidate as Record<string, unknown>;
        return typeof record.start === "number" && typeof record.end === "number"
          ? [{ start: record.start, end: record.end }]
          : [];
      }),
      textLength,
    );
    return ranges.length > 0 ? { textLength, ranges } : null;
  } catch {
    return null;
  }
}

function usableAlignment(
  alignment: VoicePlaybackCharacterAlignment | null | undefined,
  textLength: number,
): alignment is VoicePlaybackCharacterAlignment {
  if (!alignment || alignment.characters.length !== textLength) return false;
  return (
    alignment.characterStartTimesSeconds.length === textLength &&
    alignment.characterEndTimesSeconds.length === textLength &&
    alignment.characterStartTimesSeconds.every(Number.isFinite) &&
    alignment.characterEndTimesSeconds.every(Number.isFinite)
  );
}

function mergedTimings(
  timings: VoiceCensorTimingV1[],
  durationMs: number,
): VoiceCensorTimingV1[] {
  const ordered = timings
    .map((timing) => ({
      startMs: Math.max(0, Math.min(durationMs, timing.startMs)),
      endMs: Math.max(0, Math.min(durationMs, timing.endMs)),
    }))
    .filter((timing) => timing.endMs > timing.startMs)
    .sort((left, right) => left.startMs - right.startMs);
  const merged: VoiceCensorTimingV1[] = [];
  for (const timing of ordered) {
    const previous = merged.at(-1);
    if (previous && timing.startMs <= previous.endMs + 8) {
      previous.endMs = Math.max(previous.endMs, timing.endMs);
    } else {
      merged.push({ ...timing });
    }
  }
  return merged;
}

/** Resolve exact provider timestamps when present, otherwise use one bounded,
 * deterministic character-weighted projection over the audible duration. */
export function resolveVoiceCensorTimings(args: {
  plan: VoiceCensorPlanV1 | null | undefined;
  alignment?: VoicePlaybackCharacterAlignment | null;
  durationMs: number;
}): VoiceCensorTimingV1[] {
  const durationMs = Math.max(1, Number.isFinite(args.durationMs) ? args.durationMs : 1);
  const plan = args.plan;
  if (!plan || plan.textLength <= 0 || plan.ranges.length === 0) return [];
  const ranges = normalizedRanges(plan.ranges, plan.textLength);
  const aligned = usableAlignment(args.alignment, plan.textLength);
  const timings = ranges.map((range) => {
    if (aligned) {
      return {
        startMs:
          (args.alignment!.characterStartTimesSeconds[range.start] ?? 0) * 1_000,
        endMs:
          (args.alignment!.characterEndTimesSeconds[range.end - 1] ?? 0) * 1_000,
      };
    }
    const projectedStart = durationMs * (range.start / plan.textLength);
    const projectedEnd = durationMs * (range.end / plan.textLength);
    const projectedDuration = projectedEnd - projectedStart;
    const boundedDuration = Math.min(
      MAX_FALLBACK_CENSOR_MS,
      Math.max(MIN_FALLBACK_CENSOR_MS, projectedDuration),
    );
    const center = (projectedStart + projectedEnd) / 2;
    return {
      startMs: center - boundedDuration / 2,
      endMs: center + boundedDuration / 2,
    };
  });
  return mergedTimings(timings, durationMs);
}

export function voiceCensorPlanWithinSourceRange(
  plan: VoiceCensorPlanV1 | null | undefined,
  sourceStart: number,
  sourceEnd: number,
): VoiceCensorPlanV1 | null {
  if (!plan || sourceEnd <= sourceStart) return null;
  const ranges = plan.ranges.flatMap((range) => {
    const start = Math.max(sourceStart, range.start);
    const end = Math.min(sourceEnd, range.end);
    return end > start
      ? [{ start: start - sourceStart, end: end - sourceStart }]
      : [];
  });
  return ranges.length > 0
    ? { textLength: sourceEnd - sourceStart, ranges }
    : null;
}

/** Connect speech through a hard mute gate and synthesize the local electronic
 * censor into the same downstream voice channel. No asset or provider is used. */
export function connectVoiceCensorTone(args: {
  context: BaseAudioContext;
  speechInput: AudioNode;
  output: AudioNode;
  timings: readonly VoiceCensorTimingV1[];
  startAt: number;
  elapsedMs?: number;
}): AudioNode[] {
  const gate = args.context.createGain();
  gate.gain.value = 1;
  args.speechInput.connect(gate).connect(args.output);
  const nodes: AudioNode[] = [gate];
  const elapsedMs = Math.max(0, args.elapsedMs ?? 0);
  for (const timing of args.timings) {
    if (timing.endMs <= elapsedMs) continue;
    const startAt = args.startAt + Math.max(0, timing.startMs - elapsedMs) / 1_000;
    const endAt = args.startAt + Math.max(0, timing.endMs - elapsedMs) / 1_000;
    const ramp = Math.min(
      CENSOR_EDGE_RAMP_SECONDS,
      Math.max(0.001, (endAt - startAt) / 4),
    );
    gate.gain.setValueAtTime(1, Math.max(args.context.currentTime, startAt - ramp));
    gate.gain.linearRampToValueAtTime(0, startAt);
    gate.gain.setValueAtTime(0, Math.max(startAt, endAt - ramp));
    gate.gain.linearRampToValueAtTime(1, endAt);

    const toneGain = args.context.createGain();
    toneGain.gain.setValueAtTime(0, startAt);
    toneGain.gain.linearRampToValueAtTime(0.34, startAt + ramp);
    toneGain.gain.setValueAtTime(0.34, Math.max(startAt + ramp, endAt - ramp));
    toneGain.gain.linearRampToValueAtTime(0, endAt);
    toneGain.connect(args.output);
    nodes.push(toneGain);
    for (const [frequency, waveform, gain] of [
      [1_000, "square", 0.72],
      [2_000, "sine", 0.28],
    ] as const) {
      const oscillator = args.context.createOscillator();
      const partialGain = args.context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      partialGain.gain.value = gain;
      oscillator.connect(partialGain).connect(toneGain);
      oscillator.start(startAt);
      oscillator.stop(endAt);
      nodes.push(oscillator, partialGain);
    }
  }
  return nodes;
}

const VOICE_LIGHT_RMS_FLOOR = 0.012;
const VOICE_LIGHT_RMS_CEILING = 0.2;
const VOICE_LIGHT_PEAK_FLOOR = 0.04;
const VOICE_LIGHT_PEAK_CEILING = 0.56;

export const VOICE_LIGHT_ATTACK_MS = 45;
export const VOICE_LIGHT_RELEASE_MS = 220;
export const VOICE_LIGHT_SAMPLE_INTERVAL_MS = 1_000 / 30;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeRange(value: number, floor: number, ceiling: number): number {
  return clampUnit((value - floor) / Math.max(0.000_001, ceiling - floor));
}

/**
 * Converts post-effect voice samples into a restrained microphone-style level.
 * RMS carries sustained vowels while the peak/crest terms add a smaller lift
 * for short consonant-like transients.
 */
export function normalizedVoiceLightLevel(
  samples: ArrayLike<number>,
): number {
  if (samples.length === 0) return 0;
  let squareSum = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Number.isFinite(samples[index]) ? samples[index]! : 0;
    const absolute = Math.abs(sample);
    squareSum += sample * sample;
    peak = Math.max(peak, absolute);
  }
  const rms = Math.sqrt(squareSum / samples.length);
  const rmsLevel = normalizeRange(
    rms,
    VOICE_LIGHT_RMS_FLOOR,
    VOICE_LIGHT_RMS_CEILING,
  );
  const peakLevel = normalizeRange(
    peak,
    VOICE_LIGHT_PEAK_FLOOR,
    VOICE_LIGHT_PEAK_CEILING,
  );
  const transientLift = Math.max(0, peakLevel - rmsLevel) * 0.14;
  const crestLift = normalizeRange(
    peak - rms * 1.75,
    0.02,
    0.24,
  ) * 0.06;
  return clampUnit(rmsLevel * 0.86 + transientLift + crestLift);
}

export function smoothVoiceLightLevel(args: {
  previous: number;
  target: number;
  elapsedMs: number;
  attackMs?: number;
  releaseMs?: number;
}): number {
  const previous = clampUnit(args.previous);
  const target = clampUnit(args.target);
  const elapsedMs = Math.max(0, Number.isFinite(args.elapsedMs) ? args.elapsedMs : 0);
  const timeConstantMs = target > previous
    ? Math.max(1, args.attackMs ?? VOICE_LIGHT_ATTACK_MS)
    : Math.max(1, args.releaseMs ?? VOICE_LIGHT_RELEASE_MS);
  const blend = 1 - Math.exp(-elapsedMs / timeConstantMs);
  return clampUnit(previous + (target - previous) * blend);
}

export interface VoiceLightMeter {
  node: AnalyserNode;
  stop: () => void;
}

/**
 * Starts a <=30 Hz analyser. The AnalyserNode passes the voice through
 * unchanged, allowing callers to place it directly before room acoustics.
 */
export function createVoiceLightMeter(
  context: AudioContext,
  onLevel: (level: number) => void,
): VoiceLightMeter {
  const node = context.createAnalyser();
  node.fftSize = 1_024;
  node.smoothingTimeConstant = 0;
  const samples = new Float32Array(node.fftSize);
  let stopped = false;
  let frameId: number | null = null;
  let lastSampleAtMs = -Number.POSITIVE_INFINITY;
  let lastPublished = -1;
  let smoothed = 0;

  const schedule = (callback: FrameRequestCallback): number =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : window.setTimeout(() => callback(performance.now()), 34);
  const cancel = (id: number): void => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else window.clearTimeout(id);
  };
  const sample = (atMs: number): void => {
    if (stopped) return;
    if (atMs - lastSampleAtMs >= VOICE_LIGHT_SAMPLE_INTERVAL_MS - 1) {
      node.getFloatTimeDomainData(samples);
      const target = normalizedVoiceLightLevel(samples);
      const elapsedMs = Number.isFinite(lastSampleAtMs)
        ? Math.max(1, atMs - lastSampleAtMs)
        : VOICE_LIGHT_SAMPLE_INTERVAL_MS;
      smoothed = smoothVoiceLightLevel({
        previous: smoothed,
        target,
        elapsedMs,
      });
      if (Math.abs(smoothed - lastPublished) >= 0.005) {
        lastPublished = smoothed;
        onLevel(smoothed);
      }
      lastSampleAtMs = atMs;
    }
    frameId = schedule(sample);
  };
  frameId = schedule(sample);

  return {
    node,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (frameId !== null) cancel(frameId);
      frameId = null;
      // Do not disconnect here: this analyser sits inline and the bounded
      // rendered voice tail may still be draining. The owning graph handles
      // its audio teardown after the visual level has returned to rest.
      onLevel(0);
    },
  };
}

type VoiceLightElement = Pick<HTMLElement, "dataset" | "style">;

const voiceLightElementsByTarget = new Map<string, Set<VoiceLightElement>>();
const voiceLightLevelByTarget = new Map<string, number>();

export function botVoiceLightTarget(
  surface: string,
  performanceId: string,
  participantId: string,
): string {
  return [surface, performanceId, participantId]
    .map((part) => encodeURIComponent(part.trim() || "unknown"))
    .join(":");
}

export function publishBotVoiceLightLevel(target: string, level: number): void {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return;
  const normalizedLevel = clampUnit(level);
  voiceLightLevelByTarget.set(normalizedTarget, normalizedLevel);
  const cssValue = normalizedLevel.toFixed(3);
  for (const element of voiceLightElementsByTarget.get(normalizedTarget) ?? []) {
    element.style.setProperty("--bot-voice-light-level", cssValue);
  }
}

export function bindBotVoiceLightTarget(
  element: VoiceLightElement,
  target: string | null | undefined,
): () => void {
  const normalizedTarget = target?.trim() ?? "";
  if (!normalizedTarget) {
    element.style.setProperty("--bot-voice-light-level", "0");
    delete element.dataset.voiceLightTarget;
    return () => undefined;
  }
  const elements = voiceLightElementsByTarget.get(normalizedTarget) ?? new Set();
  elements.add(element);
  voiceLightElementsByTarget.set(normalizedTarget, elements);
  element.dataset.voiceLightTarget = normalizedTarget;
  element.style.setProperty(
    "--bot-voice-light-level",
    (voiceLightLevelByTarget.get(normalizedTarget) ?? 0).toFixed(3),
  );
  return () => {
    elements.delete(element);
    if (elements.size === 0) voiceLightElementsByTarget.delete(normalizedTarget);
    if (element.dataset.voiceLightTarget === normalizedTarget) {
      delete element.dataset.voiceLightTarget;
      element.style.setProperty("--bot-voice-light-level", "0");
    }
  };
}

export function resetBotVoiceLightLevelsForTests(): void {
  for (const elements of voiceLightElementsByTarget.values()) {
    for (const element of elements) {
      element.style.setProperty("--bot-voice-light-level", "0");
      delete element.dataset.voiceLightTarget;
    }
  }
  voiceLightElementsByTarget.clear();
  voiceLightLevelByTarget.clear();
}

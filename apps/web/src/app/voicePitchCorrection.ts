export interface VoicePitchCorrectionPlan {
  readonly strength: number;
  readonly maxCorrectionCents: number;
  readonly glideSeconds: number;
}

export interface VoicePitchCorrectionPoint {
  atSeconds: number;
  correctionCents: number;
}

export const PRISM_VOICE_PITCH_CORRECTION: Readonly<VoicePitchCorrectionPlan> =
  Object.freeze({
    strength: 0.25,
    maxCorrectionCents: 40,
    glideSeconds: 0.1,
  });

const ANALYSIS_SAMPLE_RATE = 8_000;
const ANALYSIS_FRAME_SECONDS = 0.048;
const ANALYSIS_HOP_SECONDS = 0.04;
const MIN_VOICE_FREQUENCY_HZ = 65;
const MAX_VOICE_FREQUENCY_HZ = 500;
const MIN_VOICE_RMS = 0.004;
const MIN_PITCH_CONFIDENCE = 0.76;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number, decimalPlaces: number): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function downsampleForPitchAnalysis(
  source: Float32Array,
  sourceSampleRate: number,
  sourceLength: number,
): { samples: Float32Array; sampleRate: number } {
  if (sourceSampleRate <= ANALYSIS_SAMPLE_RATE) {
    return {
      samples: source.subarray(0, sourceLength),
      sampleRate: sourceSampleRate,
    };
  }

  const ratio = sourceSampleRate / ANALYSIS_SAMPLE_RATE;
  const outputLength = Math.max(0, Math.floor(sourceLength / ratio));
  const output = new Float32Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourceStart = Math.floor(outputIndex * ratio);
    const sourceEnd = Math.min(
      sourceLength,
      Math.max(sourceStart + 1, Math.floor((outputIndex + 1) * ratio)),
    );
    let sum = 0;
    for (let sourceIndex = sourceStart; sourceIndex < sourceEnd; sourceIndex += 1) {
      sum += source[sourceIndex] ?? 0;
    }
    output[outputIndex] = sum / Math.max(1, sourceEnd - sourceStart);
  }
  return { samples: output, sampleRate: ANALYSIS_SAMPLE_RATE };
}

function detectedPitchHz(args: {
  samples: Float32Array;
  frameStart: number;
  frameLength: number;
  sampleRate: number;
  centeredFrame: Float32Array;
  correlations: Float64Array;
}): number | null {
  let mean = 0;
  for (let index = 0; index < args.frameLength; index += 1) {
    mean += args.samples[args.frameStart + index] ?? 0;
  }
  mean /= args.frameLength;

  let energy = 0;
  for (let index = 0; index < args.frameLength; index += 1) {
    const centered = (args.samples[args.frameStart + index] ?? 0) - mean;
    args.centeredFrame[index] = centered;
    energy += centered * centered;
  }
  if (Math.sqrt(energy / args.frameLength) < MIN_VOICE_RMS) return null;

  const minimumLag = Math.max(
    2,
    Math.floor(args.sampleRate / MAX_VOICE_FREQUENCY_HZ),
  );
  const maximumLag = Math.min(
    args.frameLength - 2,
    Math.ceil(args.sampleRate / MIN_VOICE_FREQUENCY_HZ),
  );
  let bestLag = -1;
  let bestCorrelation = Number.NEGATIVE_INFINITY;

  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let numerator = 0;
    let leadingEnergy = 0;
    let trailingEnergy = 0;
    const comparableLength = args.frameLength - lag;
    for (let index = 0; index < comparableLength; index += 1) {
      const leading = args.centeredFrame[index] ?? 0;
      const trailing = args.centeredFrame[index + lag] ?? 0;
      numerator += leading * trailing;
      leadingEnergy += leading * leading;
      trailingEnergy += trailing * trailing;
    }
    const denominator = Math.sqrt(leadingEnergy * trailingEnergy);
    const correlation = denominator > 0 ? numerator / denominator : 0;
    args.correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < MIN_PITCH_CONFIDENCE) return null;

  const current = args.correlations[bestLag] ?? bestCorrelation;
  const previous = bestLag > minimumLag
    ? (args.correlations[bestLag - 1] ?? current)
    : current;
  const next = bestLag < maximumLag
    ? (args.correlations[bestLag + 1] ?? current)
    : current;
  const curvature = previous - 2 * current + next;
  const interpolation = Math.abs(curvature) > 1e-9
    ? clamp(0.5 * (previous - next) / curvature, -0.5, 0.5)
    : 0;
  const refinedLag = bestLag + interpolation;
  return refinedLag > 0 ? args.sampleRate / refinedLag : null;
}

export function analyzePrismPitchCorrection(args: {
  samples: Float32Array;
  sampleRate: number;
  playbackRate?: number;
  maxPlaybackDurationSeconds?: number;
  plan?: VoicePitchCorrectionPlan;
  pitchOffsetCentsAt?: (elapsedSeconds: number) => number;
}): VoicePitchCorrectionPoint[] {
  if (args.samples.length === 0 || !Number.isFinite(args.sampleRate) || args.sampleRate <= 0) {
    return [];
  }
  const playbackRate = clamp(
    Number.isFinite(args.playbackRate) ? (args.playbackRate ?? 1) : 1,
    0.1,
    8,
  );
  const plan = args.plan ?? PRISM_VOICE_PITCH_CORRECTION;
  const maxPlaybackDurationSeconds =
    Number.isFinite(args.maxPlaybackDurationSeconds) &&
    (args.maxPlaybackDurationSeconds ?? 0) > 0
      ? (args.maxPlaybackDurationSeconds as number)
      : Number.POSITIVE_INFINITY;
  const sourceDurationLimit = Number.isFinite(maxPlaybackDurationSeconds)
    ? maxPlaybackDurationSeconds * playbackRate + ANALYSIS_FRAME_SECONDS
    : args.samples.length / args.sampleRate;
  const sourceLength = Math.min(
    args.samples.length,
    Math.ceil(sourceDurationLimit * args.sampleRate),
  );
  // Speech is already fully decoded for playback, so the Prism preset can
  // derive a small control contour locally without delaying synthesis or
  // sending audio anywhere. Downsampling bounds the main-thread DSP cost.
  const analysis = downsampleForPitchAnalysis(
    args.samples,
    args.sampleRate,
    sourceLength,
  );
  const frameLength = Math.max(
    32,
    Math.round(analysis.sampleRate * ANALYSIS_FRAME_SECONDS),
  );
  const hopLength = Math.max(
    1,
    Math.round(analysis.sampleRate * ANALYSIS_HOP_SECONDS),
  );
  if (analysis.samples.length < frameLength) return [];

  const maximumLag = Math.min(
    frameLength - 2,
    Math.ceil(analysis.sampleRate / MIN_VOICE_FREQUENCY_HZ),
  );
  const centeredFrame = new Float32Array(frameLength);
  const correlations = new Float64Array(maximumLag + 2);
  const points: VoicePitchCorrectionPoint[] = [
    { atSeconds: 0, correctionCents: 0 },
  ];
  const strength = clamp(Number.isFinite(plan.strength) ? plan.strength : 0, 0, 1);
  const maximumCorrection = Math.max(
    0,
    Number.isFinite(plan.maxCorrectionCents) ? plan.maxCorrectionCents : 0,
  );
  const glideSeconds = Math.max(
    0,
    Number.isFinite(plan.glideSeconds) ? plan.glideSeconds : 0,
  );
  let previousAtSeconds = 0;
  let smoothedCorrectionCents = 0;
  let sawVoicedFrame = false;

  for (
    let frameStart = 0;
    frameStart + frameLength <= analysis.samples.length;
    frameStart += hopLength
  ) {
    const atSeconds =
      (frameStart + frameLength / 2) / analysis.sampleRate / playbackRate;
    if (atSeconds > maxPlaybackDurationSeconds) break;
    const frequencyHz = detectedPitchHz({
      samples: analysis.samples,
      frameStart,
      frameLength,
      sampleRate: analysis.sampleRate,
      centeredFrame,
      correlations,
    });
    let targetCorrectionCents = 0;
    if (frequencyHz !== null) {
      sawVoicedFrame = true;
      const rawPitchOffsetCents = args.pitchOffsetCentsAt?.(atSeconds) ?? 0;
      const pitchOffsetCents = Number.isFinite(rawPitchOffsetCents)
        ? rawPitchOffsetCents
        : 0;
      const midiNote =
        69 + 12 * Math.log2(frequencyHz / 440) + pitchOffsetCents / 100;
      const nearestNoteCorrectionCents = (Math.round(midiNote) - midiNote) * 100;
      targetCorrectionCents = clamp(
        nearestNoteCorrectionCents * strength,
        -maximumCorrection,
        maximumCorrection,
      );
    }

    const elapsedSeconds = Math.max(0, atSeconds - previousAtSeconds);
    const baseSmoothing = glideSeconds > 0
      ? 1 - Math.exp(-elapsedSeconds / glideSeconds)
      : 1;
    const smoothing = frequencyHz === null
      ? Math.min(1, baseSmoothing * 2.5)
      : baseSmoothing;
    smoothedCorrectionCents +=
      (targetCorrectionCents - smoothedCorrectionCents) * smoothing;
    if (Math.abs(smoothedCorrectionCents) < 0.01) smoothedCorrectionCents = 0;
    points.push({
      atSeconds: rounded(atSeconds, 4),
      correctionCents: rounded(smoothedCorrectionCents, 3),
    });
    previousAtSeconds = atSeconds;
  }

  return sawVoicedFrame ? points : [];
}

export function voicePitchCorrectionCentsAt(
  points: readonly VoicePitchCorrectionPoint[],
  elapsedSeconds: number,
): number {
  if (points.length === 0) return 0;
  const elapsed = Math.max(
    0,
    Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
  );
  if (elapsed <= (points[0]?.atSeconds ?? 0)) {
    return points[0]?.correctionCents ?? 0;
  }
  const last = points.at(-1);
  if (!last || elapsed >= last.atSeconds) return last?.correctionCents ?? 0;

  let lowerIndex = 0;
  let upperIndex = points.length - 1;
  while (upperIndex - lowerIndex > 1) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    if ((points[middleIndex]?.atSeconds ?? 0) <= elapsed) {
      lowerIndex = middleIndex;
    } else {
      upperIndex = middleIndex;
    }
  }
  const lower = points[lowerIndex];
  const upper = points[upperIndex];
  if (!lower || !upper || upper.atSeconds <= lower.atSeconds) {
    return lower?.correctionCents ?? upper?.correctionCents ?? 0;
  }
  const progress = (elapsed - lower.atSeconds) / (upper.atSeconds - lower.atSeconds);
  return lower.correctionCents +
    (upper.correctionCents - lower.correctionCents) * progress;
}

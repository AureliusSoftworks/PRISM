import {
  applyVoiceDeliveryMoodToProfile,
  BOT_VOICE_HIGH_SHELF_HZ,
  BOT_VOICE_LOW_SHELF_HZ,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  normalizeVoiceEffect,
  voiceIntonationDetuneCents,
  voiceIntonationPlanForProfile,
  expectedVoicePlaybackDurationMs,
  resolveBotVoiceCharacter,
  resolveVoicePlaybackTransform,
  type BotAudioVoiceProfileV1,
  type CoffeeVoiceDeliveryEnvelope,
  type VoiceDeliveryMood,
  type VoiceEffect,
} from "@localai/shared";
import {
  connectRoomAcoustics,
  type RoomAcousticsConnection,
  type RoomAcousticsSend,
} from "./roomAcoustics.ts";
import {
  preSpeechBreathPlaybackTiming,
  type PreSpeechBreathPlan,
} from "./preSpeechBreath.ts";
import {
  PRISM_VOICE_PITCH_CORRECTION,
  analyzePrismPitchCorrection,
  voicePitchCorrectionCentsAt,
  type VoicePitchCorrectionPlan,
} from "./voicePitchCorrection.ts";
import {
  prismAudioContext,
  prismAudioOutputNode,
} from "./replayAudioMasterCapture.ts";
import {
  createVoiceLightMeter,
  publishBotVoiceLightLevel,
  type VoiceLightMeter,
} from "./voiceLightEnvelope.ts";
import {
  decodeLiveVoicePcm,
  decodeLiveVoicePcmOwned,
  type LiveVoicePcm,
} from "./liveVoiceDecode.ts";

export interface VoiceEffectPlan {
  highpassHz: number;
  lowpassHz: number;
  drive: number;
  bitDepth: number;
  dryGain: number;
  outputTrim: number;
  noiseGain: number;
  modulationFrequencyHz: number;
  modulationDepth: number;
  modulationBaseGain: number;
  pitchCorrection?: VoicePitchCorrectionPlan;
  parallelVoices: Array<{
    delaySeconds: number;
    detuneCents: number;
    gain: number;
    delayModulationFrequencyHz?: number;
    delayModulationDepthSeconds?: number;
  }>;
}

export function resolveVoiceEffectPlan(
  effect: VoiceEffect
): VoiceEffectPlan {
  switch (effect) {
    case "radio":
      return {
        highpassHz: 320,
        lowpassHz: 3200,
        drive: 0,
        bitDepth: 16,
        dryGain: 0.92,
        outputTrim: 0.76,
        noiseGain: 0.012,
        modulationFrequencyHz: 0,
        modulationDepth: 0,
        modulationBaseGain: 1,
        parallelVoices: [],
      };
    case "robot":
      return {
        highpassHz: 80,
        lowpassHz: 6200,
        drive: 0,
        bitDepth: 16,
        dryGain: 0.9,
        outputTrim: 0.74,
        noiseGain: 0,
        modulationFrequencyHz: 34,
        modulationDepth: 0.38,
        modulationBaseGain: 0.62,
        parallelVoices: [
          { delaySeconds: 0.008, detuneCents: -70, gain: 0.28 },
        ],
      };
    case "echo":
      return {
        highpassHz: 25,
        lowpassHz: 20_000,
        drive: 0,
        bitDepth: 16,
        dryGain: 1,
        outputTrim: 0.72,
        noiseGain: 0,
        modulationFrequencyHz: 0,
        modulationDepth: 0,
        modulationBaseGain: 1,
        parallelVoices: [
          { delaySeconds: 0.17, detuneCents: 0, gain: 0.32 },
          { delaySeconds: 0.34, detuneCents: 0, gain: 0.15 },
        ],
      };
    case "chorus":
      return {
        highpassHz: 25,
        lowpassHz: 18_000,
        drive: 0,
        bitDepth: 16,
        dryGain: 0.74,
        outputTrim: 0.68,
        noiseGain: 0,
        modulationFrequencyHz: 0,
        modulationDepth: 0,
        modulationBaseGain: 1,
        pitchCorrection: PRISM_VOICE_PITCH_CORRECTION,
        parallelVoices: [
          {
            delaySeconds: 0.012,
            detuneCents: 0,
            gain: 0.34,
            delayModulationFrequencyHz: 0.31,
            delayModulationDepthSeconds: 0.004,
          },
          {
            delaySeconds: 0.021,
            detuneCents: 0,
            gain: 0.34,
            delayModulationFrequencyHz: 0.27,
            delayModulationDepthSeconds: -0.005,
          },
        ],
      };
    case "resonance":
      return {
        highpassHz: 45,
        lowpassHz: 14_000,
        drive: 0,
        bitDepth: 16,
        dryGain: 0.82,
        outputTrim: 0.66,
        noiseGain: 0,
        modulationFrequencyHz: 0,
        modulationDepth: 0,
        modulationBaseGain: 1,
        parallelVoices: [
          {
            delaySeconds: 0.01,
            detuneCents: -320,
            gain: 0.28,
          },
          {
            delaySeconds: 0.018,
            detuneCents: 0,
            gain: 0.22,
            delayModulationFrequencyHz: 0.19,
            delayModulationDepthSeconds: 0.003,
          },
        ],
      };
    case "deep-space":
      return {
        highpassHz: 35,
        lowpassHz: 10_000,
        drive: 0,
        bitDepth: 16,
        dryGain: 0.6,
        outputTrim: 0.68,
        noiseGain: 0,
        modulationFrequencyHz: 0,
        modulationDepth: 0,
        modulationBaseGain: 1,
        parallelVoices: [
          { delaySeconds: 0.018, detuneCents: -500, gain: 0.5 },
          { delaySeconds: 0.22, detuneCents: -500, gain: 0.16 },
        ],
      };
    case "clean":
      return {
        highpassHz: 25,
        lowpassHz: 20_000,
        drive: 0,
        bitDepth: 16,
        dryGain: 1,
        outputTrim: 1,
        noiseGain: 0,
        modulationFrequencyHz: 0,
        modulationDepth: 0,
        modulationBaseGain: 1,
        parallelVoices: [],
      };
  }
}

/** Backwards-compatible names for older tests and integrations. */
export type ElevenLabsVoiceEffectPlan = VoiceEffectPlan;
export function resolveElevenLabsVoiceEffectPlan(
  effect: VoiceEffect,
): VoiceEffectPlan {
  return resolveVoiceEffectPlan(effect);
}

export interface ResolvedVoiceTexture {
  bandwidth: number;
  noise: number;
  instability: number;
  distortion: number;
  damage: number;
}

export interface VoiceDamageEvent {
  atMs: number;
  durationMs: number;
  depth: number;
}

export interface VoiceRoboticAccentEvent {
  atRatio: number;
  durationMs: number;
  frequencyHz: number;
  endFrequencyHz: number;
  gain: number;
  waveform: OscillatorType;
}

export interface VoiceRoboticGateEvent {
  atRatio: number;
  durationMs: number;
  depth: number;
}

export interface VoiceRoboticPlan {
  accents: VoiceRoboticAccentEvent[];
  gates: VoiceRoboticGateEvent[];
  buzzFrequencyHz: number;
  buzzDepth: number;
  drive: number;
  lowpassHz: number;
  bitDepth: number;
  sampleHoldFrames: number;
}

export interface VoicePlaybackCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
  /**
   * Rigid offset from provider character time to decoded playback time.
   * Presence (including zero) means timestamps already live on the decoded
   * audio clock and must not be stretched to the clip duration.
   */
  audioTimelineOffsetSeconds?: number;
}

export interface VoicePlaybackSynthesizedSpeechSegment {
  /** The exact text passed to the synthesizer for this audible segment. */
  text: string;
  /** Source transcript bounds when the server can preserve that mapping. */
  sourceStart: number | null;
  sourceEnd: number | null;
  /** Audible-clock bounds; rendered effects/device tails are intentionally excluded. */
  startMs: number;
  endMs: number;
  /** Null is explicit: text provenance alone is not phoneme alignment. */
  alignment: VoicePlaybackCharacterAlignment | null;
}

export interface VoicePlaybackLifecycle {
  /** Buffered provider timing supplied before decoded playback starts. */
  sourceAlignment?: VoicePlaybackCharacterAlignment | null;
  /** Equalize provider/source loudness before applying authored interview gain. */
  loudnessNormalization?: "interview";
  /** Temporary per-utterance delivery changes. V1 accepts the neutral envelope only. */
  deliveryEnvelope?: CoffeeVoiceDeliveryEnvelope;
  /** Performance-scoped full-avatar light binding for this audible voice. */
  voiceLightTarget?: string;
  /** Already-smoothed normalized post-effect voice energy. */
  onLevel?: (level: number) => void;
  /** Fires immediately before audible pre-speech presence, such as breath foley. */
  onPresenceStart?: () => void;
  onStart?: (
    durationMs: number | null,
    alignment?: VoicePlaybackCharacterAlignment | null
  ) => void;
  /** Audio-clock progress used to keep visible speech and mouth motion aligned. */
  onProgress?: (elapsedMs: number, durationMs: number) => void;
  /**
   * Carries synthesizer-authored text separately from the canonical transcript.
   * Babble uses this because the audible pseudo-language differs from the
   * English message whose meaning remains visible to the user.
   */
  onSynthesizedSpeechSegment?: (
    segment: VoicePlaybackSynthesizedSpeechSegment,
  ) => void;
  /** Source-linked timing for structured speech/action replay provenance. */
  onSegmentTiming?: (timing: {
    kind: "speech" | "vocal-action";
    sourceStart: number;
    sourceEnd: number;
    startMs: number;
    endMs: number;
    heard: boolean;
    action?: string | null;
  }) => void;
  onEnd?: () => void;
  /** Clears presentation state when playback is superseded before completion. */
  onCancel?: () => void;
}

export const LIVE_INTERVIEW_VOICE_LEVELER = {
  thresholdDb: -30,
  kneeDb: 18,
  ratio: 4.5,
  attackSeconds: 0.008,
  releaseSeconds: 0.18,
  makeupGain: 1.6,
  limiterThresholdDb: -2,
  limiterRatio: 20,
} as const;

function connectLiveInterviewVoiceLeveler(
  context: AudioContext,
  input: AudioNode,
): { output: AudioNode; nodes: AudioNode[] } {
  const compressor = context.createDynamicsCompressor();
  const makeup = context.createGain();
  const limiter = context.createDynamicsCompressor();
  compressor.threshold.value = LIVE_INTERVIEW_VOICE_LEVELER.thresholdDb;
  compressor.knee.value = LIVE_INTERVIEW_VOICE_LEVELER.kneeDb;
  compressor.ratio.value = LIVE_INTERVIEW_VOICE_LEVELER.ratio;
  compressor.attack.value = LIVE_INTERVIEW_VOICE_LEVELER.attackSeconds;
  compressor.release.value = LIVE_INTERVIEW_VOICE_LEVELER.releaseSeconds;
  makeup.gain.value = LIVE_INTERVIEW_VOICE_LEVELER.makeupGain;
  limiter.threshold.value = LIVE_INTERVIEW_VOICE_LEVELER.limiterThresholdDb;
  limiter.knee.value = 0;
  limiter.ratio.value = LIVE_INTERVIEW_VOICE_LEVELER.limiterRatio;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  input.connect(compressor).connect(makeup).connect(limiter);
  return { output: limiter, nodes: [compressor, makeup, limiter] };
}

export interface VoicePlaybackProgressController {
  finish: () => void;
  cancel: () => void;
}

export interface VoicePlaybackProgressOptions {
  /** Delay the visible lifecycle until rendered audio is expected to reach the device. */
  startDelayMs?: number;
  /** Keep the last active frame until the audio graph confirms its drain completed. */
  holdAtEndUntilFinish?: boolean;
}

const VOICE_OUTPUT_LATENCY_MAX_MS = 500;
/**
 * Keep the playback graph connected briefly after the buffer source ends so
 * formant/time-stretch worklets can flush their last phoneme instead of
 * disconnecting mid-vowel.
 */
export const VOICE_PLAYBACK_TAIL_FLUSH_MS = 120;

/**
 * A completed source can still have a final phoneme moving through the
 * formant worklet and device output. Retain that released graph briefly so a
 * natural next speaker may begin without hard-cutting the outgoing word.
 */
export const VOICE_COMPLETED_OVERLAP_TAIL_MS = 320;

export function estimateVoiceOutputLatencyMs(
  context: Pick<AudioContext, "baseLatency" | "currentTime"> &
    Partial<Pick<AudioContext, "getOutputTimestamp" | "outputLatency">>,
  performanceNowMs =
    typeof performance === "undefined" ? 0 : performance.now(),
): number {
  const baseLatencySeconds = Number.isFinite(context.baseLatency)
    ? context.baseLatency
    : 0;
  const outputLatencySeconds = Number.isFinite(context.outputLatency)
    ? (context.outputLatency ?? 0)
    : 0;
  const fallbackSeconds = Math.max(
    0,
    baseLatencySeconds + outputLatencySeconds,
  );
  let measuredSeconds = 0;
  if (context.getOutputTimestamp && performanceNowMs > 0) {
    try {
      const timestamp = context.getOutputTimestamp();
      const contextTime = timestamp.contextTime;
      const performanceTime = timestamp.performanceTime;
      if (Number.isFinite(contextTime) && Number.isFinite(performanceTime)) {
        const outputContextTimeNow =
          (contextTime ?? 0) +
          Math.max(0, performanceNowMs - (performanceTime ?? 0)) / 1_000;
        measuredSeconds = Math.max(
          0,
          context.currentTime - outputContextTimeNow,
        );
      }
    } catch {
      measuredSeconds = 0;
    }
  }
  const latencySeconds =
    measuredSeconds > 0
      ? Math.max(outputLatencySeconds, measuredSeconds)
      : fallbackSeconds;
  return Math.round(
    Math.min(
      VOICE_OUTPUT_LATENCY_MAX_MS,
      latencySeconds * 1_000,
    ),
  );
}

/**
 * Keep visible speech on the audible articulation clock. Output latency moves
 * the clock's start, while graph drain only holds its final frame; neither may
 * stretch provider alignment timestamps across a longer synthetic duration.
 */
export function voicePlaybackPresentationDurationMs(
  articulationDurationMs: number,
  _outputTailMs?: number,
): number {
  return Math.max(
    1,
    Math.round(
      Number.isFinite(articulationDurationMs) ? articulationDurationMs : 0,
    ),
  );
}

const VOICE_SPEECH_ACTIVITY_WINDOW_MS = 10;
const VOICE_SPEECH_ACTIVITY_ABSOLUTE_FLOOR = 0.003;
const VOICE_SPEECH_ACTIVITY_PEAK_RATIO = 0.08;

/** Locate the first sustained audible activity in decoded voice PCM. */
export function decodedVoiceSpeechActivityStartMs(args: {
  channels: readonly Float32Array[];
  sampleRate: number;
}): number | null {
  if (
    args.channels.length === 0 ||
    !Number.isFinite(args.sampleRate) ||
    args.sampleRate <= 0
  ) {
    return null;
  }
  const frameCount = Math.min(...args.channels.map((channel) => channel.length));
  if (frameCount <= 0) return null;
  const windowFrames = Math.max(
    1,
    Math.round((args.sampleRate * VOICE_SPEECH_ACTIVITY_WINDOW_MS) / 1_000),
  );
  const levels: number[] = [];
  let peakLevel = 0;
  for (let start = 0; start < frameCount; start += windowFrames) {
    const end = Math.min(frameCount, start + windowFrames);
    let sumSquares = 0;
    let sampleCount = 0;
    for (const channel of args.channels) {
      for (let frame = start; frame < end; frame += 1) {
        const sample = channel[frame] ?? 0;
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }
    const level = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    levels.push(level);
    peakLevel = Math.max(peakLevel, level);
  }
  if (peakLevel < VOICE_SPEECH_ACTIVITY_ABSOLUTE_FLOOR) return null;
  const threshold = Math.max(
    VOICE_SPEECH_ACTIVITY_ABSOLUTE_FLOOR,
    peakLevel * VOICE_SPEECH_ACTIVITY_PEAK_RATIO,
  );
  for (let index = 0; index < levels.length; index += 1) {
    if ((levels[index] ?? 0) < threshold) continue;
    const sustained = [index, index + 1, index + 2].filter(
      (candidate) => (levels[candidate] ?? 0) >= threshold,
    ).length;
    if (sustained < 2) continue;
    const windowStart = index * windowFrames;
    const windowEnd = Math.min(frameCount, windowStart + windowFrames);
    for (let frame = windowStart; frame < windowEnd; frame += 1) {
      if (
        args.channels.some(
          (channel) => Math.abs(channel[frame] ?? 0) >= threshold,
        )
      ) {
        return (frame / args.sampleRate) * 1_000;
      }
    }
    return (windowStart / args.sampleRate) * 1_000;
  }
  return null;
}

/**
 * Anchor provider timing to decoded speech onset without scaling its internal
 * character/phoneme spacing. This compensates only leading encoded silence.
 */
export function voicePlaybackAlignmentWithDecodedSpeechStart(
  alignment: VoicePlaybackCharacterAlignment | null | undefined,
  decodedSpeechStartMs: number | null,
): VoicePlaybackCharacterAlignment | null {
  if (!alignment) return null;
  if (decodedSpeechStartMs == null || !Number.isFinite(decodedSpeechStartMs)) {
    return alignment;
  }
  const firstSpeechIndex = alignment.characters.findIndex((character) =>
    /[\p{L}\p{N}]/u.test(character),
  );
  const firstProviderSpeechStart =
    firstSpeechIndex >= 0
      ? alignment.characterStartTimesSeconds[firstSpeechIndex]
      : null;
  if (
    typeof firstProviderSpeechStart !== "number" ||
    !Number.isFinite(firstProviderSpeechStart) ||
    firstProviderSpeechStart < 0
  ) {
    return alignment;
  }
  return {
    ...alignment,
    audioTimelineOffsetSeconds: Math.max(
      0,
      decodedSpeechStartMs / 1_000 - firstProviderSpeechStart,
    ),
  };
}

export const PRISM_LIVE_VOICE_PROGRESS_INTERVAL_MS = 100;

export function prismLiveVoicePerformanceBudgetActive(): boolean {
  return (
    typeof document !== "undefined" &&
    document.body?.dataset.prismLivePerformanceActive === "true"
  );
}

export function beginVoicePlaybackProgress(
  lifecycle: VoicePlaybackLifecycle | undefined,
  durationMs: number,
  currentElapsedMs: () => number,
  alignment?: VoicePlaybackCharacterAlignment | null,
  options: VoicePlaybackProgressOptions = {},
): VoicePlaybackProgressController {
  const normalizedDurationMs = Math.max(1, Math.round(durationMs));
  const startDelayMs = Math.max(0, Math.round(options.startDelayMs ?? 0));
  const livePerformanceBudget = prismLiveVoicePerformanceBudgetActive();
  let frame: number | null = null;
  let livePerformanceTimer: number | null = null;
  let startTimer: number | null = null;
  let active = true;
  let started = false;
  const report = (elapsedMs: number, finished = false) => {
    const maximumElapsedMs =
      options.holdAtEndUntilFinish && !finished
        ? Math.max(0, normalizedDurationMs - 1)
        : normalizedDurationMs;
    lifecycle?.onProgress?.(
      Math.min(maximumElapsedMs, Math.max(0, elapsedMs)),
      normalizedDurationMs
    );
  };
  const tick = () => {
    if (!active || !started) return;
    report(currentElapsedMs() - startDelayMs);
    if (!livePerformanceBudget) {
      frame = window.requestAnimationFrame(tick);
    }
  };
  const start = () => {
    if (!active || started) return;
    started = true;
    startTimer = null;
    lifecycle?.onStart?.(normalizedDurationMs, alignment);
    report(0);
    if (lifecycle?.onProgress) {
      if (livePerformanceBudget) {
        livePerformanceTimer = window.setInterval(
          tick,
          PRISM_LIVE_VOICE_PROGRESS_INTERVAL_MS,
        );
      } else {
        frame = window.requestAnimationFrame(tick);
      }
    }
  };
  if (startDelayMs > 0 && lifecycle) {
    startTimer = window.setTimeout(start, startDelayMs);
  } else {
    start();
  }
  const cancel = () => {
    if (!active) return;
    active = false;
    if (startTimer !== null) window.clearTimeout(startTimer);
    startTimer = null;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    if (livePerformanceTimer !== null) {
      window.clearInterval(livePerformanceTimer);
      livePerformanceTimer = null;
    }
  };
  return {
    cancel,
    finish: () => {
      if (!active) return;
      if (started) report(normalizedDurationMs, true);
      cancel();
    },
  };
}

const AUDIO_CONTEXT_RESUME_TIMEOUT_MS = 500;
export const VOICE_LILT_DEPTH_CENTS = 120;

export function voiceLiltDetuneCents(lilt: number, elapsedSeconds: number): number {
  const normalizedLilt = Math.max(-1, Math.min(1, Number.isFinite(lilt) ? lilt : 0));
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  return Math.sin(elapsed * 5.4) * normalizedLilt * VOICE_LILT_DEPTH_CENTS;
}

export function resolveVoiceTexture(
  rawProfile: BotAudioVoiceProfileV1,
  effectsEnabled = true
): ResolvedVoiceTexture {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  if (
    !effectsEnabled ||
    profile.texture.preset === "clean" ||
    profile.texture.preset === "lofi" ||
    profile.texture.preset === "tape"
  ) {
    return { bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0 };
  }
  const amount = profile.texture.amount;
  return {
    bandwidth: Number((1 - (1 - profile.texture.bandwidth) * amount).toFixed(4)),
    noise: Number((profile.texture.noise * amount).toFixed(4)),
    instability: Number((profile.texture.instability * amount).toFixed(4)),
    distortion: Number((profile.texture.distortion * amount).toFixed(4)),
    damage: Number((profile.texture.damage * amount).toFixed(4)),
  };
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function buildVoiceDamageSchedule(
  seed: string,
  durationMs: number,
  damage: number
): VoiceDamageEvent[] {
  if (damage <= 0 || durationMs < 120) return [];
  const count = Math.min(18, Math.floor((durationMs / 1000) * (0.4 + damage * 3.2)));
  return Array.from({ length: count }, (_, index) => {
    const atUnit = stableUnit(`${seed}:drop:${index}`);
    const lengthUnit = stableUnit(`${seed}:length:${index}`);
    const depthUnit = stableUnit(`${seed}:depth:${index}`);
    return {
      atMs: Math.round(45 + atUnit * Math.max(0, durationMs - 120)),
      durationMs: Math.round(8 + lengthUnit * (18 + damage * 85)),
      depth: Number(Math.min(0.96, 0.18 + damage * (0.48 + depthUnit * 0.42)).toFixed(3)),
    };
  }).sort((left, right) => left.atMs - right.atMs);
}

function distortionCurve(amount: number, bitDepth = 16): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 28;
  const quantizationSteps = 2 ** Math.max(4, Math.min(15, Math.round(bitDepth) - 1));
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    const shaped = Math.tanh(x * drive) / Math.tanh(drive);
    curve[index] = Math.round(shaped * quantizationSteps) / quantizationSteps;
  }
  return curve;
}

function createNoiseBuffer(context: BaseAudioContext, durationSeconds: number, seed: string): AudioBuffer {
  const length = Math.max(1, Math.ceil(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = Math.max(1, Math.floor(stableUnit(seed) * 0x7fffffff));
  for (let index = 0; index < data.length; index += 1) {
    state = (Math.imul(state, 48271) % 0x7fffffff) || 1;
    data[index] = (state / 0x7fffffff) * 2 - 1;
  }
  return buffer;
}

let audioContext: AudioContext | null = null;
export type VoicePlaybackChannel =
  | "primary"
  | "handoff"
  | "presence"
  | "reaction"
  | "crosstalk";

type FormantCorrectionNodeLike = AudioNode & {
  pitch: AudioParam;
  playbackRate: AudioParam;
  formantStrength: AudioParam;
};

let formantCorrectionRegistration: Promise<
  (new (options: { context: BaseAudioContext; outputChannelCount?: 1 | 2 }) => FormantCorrectionNodeLike) | null
> | null = null;
let formantCorrectionContext: BaseAudioContext | null = null;

const PRISM_LIVE_VOICE_PLAYBACK_PROCESSOR = "prism-live-voice-playback";
const PRISM_LIVE_VOICE_PLAYBACK_WORKLET_URL =
  "/worklets/prism-live-voice-playback.js";
const liveVoicePlaybackWorkletRegistrations = new WeakMap<
  AudioContext,
  Promise<boolean>
>();

async function liveVoicePlaybackWorkletAvailable(
  context: AudioContext,
): Promise<boolean> {
  if (!context.audioWorklet || typeof AudioWorkletNode !== "function") {
    return false;
  }
  const existing = liveVoicePlaybackWorkletRegistrations.get(context);
  if (existing) return existing;
  const registration = context.audioWorklet
    .addModule(PRISM_LIVE_VOICE_PLAYBACK_WORKLET_URL)
    .then(() => true)
    .catch(() => false);
  liveVoicePlaybackWorkletRegistrations.set(context, registration);
  return registration;
}

/** The copied MPL processor is deliberately a public asset: AudioWorklet
 * modules are fetched by the browser rather than bundled into Next's normal
 * client graph. A failed registration leaves tempo intact and pitch neutral. */
async function formantCorrectionNodeConstructor(
  context: BaseAudioContext,
): Promise<(new (options: { context: BaseAudioContext; outputChannelCount?: 1 | 2 }) => FormantCorrectionNodeLike) | null> {
  if (!context.audioWorklet || typeof AudioWorkletNode !== "function") return null;
  if (formantCorrectionContext !== context) {
    formantCorrectionContext = context;
    formantCorrectionRegistration = null;
  }
  formantCorrectionRegistration ??= import(
    "@soundtouchjs/formant-correction-worklet"
  )
    .then(async ({ FormantCorrectionNode }) => {
      await FormantCorrectionNode.register(
        context as AudioContext,
        "/worklets/formant-correction-processor.js",
      );
      return FormantCorrectionNode as unknown as new (options: {
        context: BaseAudioContext;
        outputChannelCount?: 1 | 2;
      }) => FormantCorrectionNodeLike;
    })
    .catch(() => null);
  return formantCorrectionRegistration;
}

export interface OfflineVoiceTakeRender {
  buffer: AudioBuffer;
  speechDurationMs: number;
  pitchPreserved: boolean;
}

/**
 * Rebuild a captured voice take through the same authored profile controls used
 * on air. Studio Cut uses this bounded, per-utterance render so its new edit
 * can keep pitch, pace, texture, effect, room, level, and pan without sending
 * the already-generated Premium dialogue back to a provider.
 */
export async function renderOfflineVoiceTake(args: {
  sourceBuffer: AudioBuffer;
  sourceOffsetSeconds: number;
  sourceDurationSeconds: number;
  profile: BotAudioVoiceProfileV1;
  moodKey?: VoiceDeliveryMood | null;
  effectsEnabled: boolean;
  gain: number;
  stereoPan: number;
  seed: string;
  roomAcoustics?: RoomAcousticsSend;
}): Promise<OfflineVoiceTakeRender> {
  const profile = {
    ...applyVoiceDeliveryMoodToProfile(args.profile, args.moodKey),
    volume: normalizeBotVoiceVolume(args.gain),
  };
  const sourceOffsetSeconds = Math.max(0, args.sourceOffsetSeconds);
  const sourceDurationSeconds = Math.max(
    0.001,
    Math.min(
      args.sourceDurationSeconds,
      args.sourceBuffer.duration - sourceOffsetSeconds,
    ),
  );
  const transform = resolveVoicePlaybackTransform(profile);
  const speechDurationSeconds = sourceDurationSeconds / transform.tempo;
  const effect = resolveVoiceEffectPlan(
    args.effectsEnabled
      ? normalizeVoiceEffect(profile.elevenLabsEffect)
      : "clean",
  );
  const texture = resolveVoiceTexture(profile, args.effectsEnabled);
  const character = resolveBotVoiceCharacter(profile);
  const longestParallelDelay = effect.parallelVoices.reduce(
    (maximum, voice) =>
      Math.max(
        maximum,
        voice.delaySeconds + Math.abs(voice.delayModulationDepthSeconds ?? 0),
      ),
    0,
  );
  const roomTailSeconds = args.roomAcoustics?.profile.durationSeconds ?? 0;
  const renderDurationSeconds =
    speechDurationSeconds + longestParallelDelay + roomTailSeconds + 0.12;
  const context = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(renderDurationSeconds * args.sourceBuffer.sampleRate)),
    args.sourceBuffer.sampleRate,
  );
  const FormantCorrectionNode = await formantCorrectionNodeConstructor(context);

  const createPitchTransform = (
    effectDetuneCents = 0,
  ): FormantCorrectionNodeLike | null => {
    if (!FormantCorrectionNode) return null;
    const node = new FormantCorrectionNode({
      context,
      outputChannelCount: args.sourceBuffer.numberOfChannels === 1 ? 1 : 2,
    });
    node.playbackRate.setValueAtTime(transform.tempo, 0);
    node.formantStrength.setValueAtTime(1, 0);
    const basePitchCents = transform.pitchCents + effectDetuneCents;
    const intonationPlan = voiceIntonationPlanForProfile(profile);
    for (
      let elapsedSeconds = 0, index = 0;
      elapsedSeconds < speechDurationSeconds;
      elapsedSeconds = Math.min(speechDurationSeconds, elapsedSeconds + 0.32), index += 1
    ) {
      const pitchRatio = 2 ** (
        (
          basePitchCents +
          voiceLiltDetuneCents(profile.lilt, elapsedSeconds) +
          // Dialect intonation: this buffer is the phrase, so the contour
          // spans it and resets naturally at the next streamed clause.
          voiceIntonationDetuneCents(
            intonationPlan,
            elapsedSeconds,
            speechDurationSeconds,
          )
        ) / 1_200
      );
      if (index === 0) node.pitch.setValueAtTime(pitchRatio, 0);
      else node.pitch.linearRampToValueAtTime(pitchRatio, elapsedSeconds);
      if (elapsedSeconds === speechDurationSeconds) break;
    }
    return node;
  };
  const createSpeechSource = (
    startAt: number,
    effectDetuneCents = 0,
  ): { source: AudioBufferSourceNode; transform: FormantCorrectionNodeLike | null } => {
    const source = context.createBufferSource();
    source.buffer = args.sourceBuffer;
    source.playbackRate.setValueAtTime(transform.tempo, startAt);
    return { source, transform: createPitchTransform(effectDetuneCents) };
  };

  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const shaper = context.createWaveShaper();
  const dryGain = context.createGain();
  const speechGain = context.createGain();
  const outputGain = context.createGain();
  const lowShelf = context.createBiquadFilter();
  const highShelf = context.createBiquadFilter();
  const limiter = context.createDynamicsCompressor();
  highpass.type = "highpass";
  highpass.frequency.value = Math.max(
    effect.highpassHz,
    25 + (1 - texture.bandwidth) * 300,
  );
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(
    Math.max(10_000, Math.min(20_000, Math.round(16_000 - profile.warmth * 6_000))),
    effect.lowpassHz,
    20_000 - (1 - texture.bandwidth) * 16_200,
  );
  shaper.curve = distortionCurve(
    Math.max(texture.distortion, effect.drive),
    effect.bitDepth,
  );
  shaper.oversample = "2x";
  dryGain.gain.value = effect.dryGain;
  speechGain.gain.value = effect.modulationBaseGain;
  outputGain.gain.value =
    Math.min(1.25, profile.volume) *
    0.88 *
    effect.outputTrim *
    character.gainMultiplier;
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = BOT_VOICE_LOW_SHELF_HZ;
  lowShelf.gain.value = character.lowShelfDb;
  highShelf.type = "highshelf";
  highShelf.frequency.value = BOT_VOICE_HIGH_SHELF_HZ;
  highShelf.gain.value = character.highShelfDb;
  limiter.threshold.value = -4;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  const primary = createSpeechSource(0);
  if (primary.transform) primary.source.connect(primary.transform).connect(dryGain);
  else primary.source.connect(dryGain);
  dryGain.connect(highpass).connect(lowpass).connect(shaper).connect(speechGain);
  speechGain.connect(outputGain);
  outputGain.connect(lowShelf).connect(highShelf).connect(limiter);
  connectRoomAcoustics({
    context,
    input: limiter,
    destination: context.destination,
    send: args.roomAcoustics,
    stereoPan: args.stereoPan,
  });
  primary.source.start(0, sourceOffsetSeconds, sourceDurationSeconds);

  for (const voice of effect.parallelVoices) {
    const modulationFrequency = voice.delayModulationFrequencyHz ?? 0;
    const modulationDepth = voice.delayModulationDepthSeconds ?? 0;
    if (modulationFrequency > 0 && modulationDepth !== 0) {
      const delay = context.createDelay();
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      const modulation = context.createGain();
      delay.delayTime.value = voice.delaySeconds;
      gain.gain.value = voice.gain;
      oscillator.frequency.value = modulationFrequency;
      modulation.gain.value = modulationDepth;
      oscillator.connect(modulation).connect(delay.delayTime);
      (primary.transform ?? primary.source).connect(delay).connect(gain).connect(highpass);
      oscillator.start(0);
      oscillator.stop(speechDurationSeconds + longestParallelDelay);
      continue;
    }
    const parallel = createSpeechSource(voice.delaySeconds, voice.detuneCents);
    const gain = context.createGain();
    gain.gain.value = voice.gain;
    if (parallel.transform) parallel.source.connect(parallel.transform).connect(gain);
    else parallel.source.connect(gain);
    gain.connect(highpass);
    parallel.source.start(
      voice.delaySeconds,
      sourceOffsetSeconds,
      sourceDurationSeconds,
    );
  }

  for (const event of buildVoiceDamageSchedule(
    args.seed,
    speechDurationSeconds * 1_000,
    texture.damage,
  )) {
    const at = event.atMs / 1_000;
    const end = at + event.durationMs / 1_000;
    speechGain.gain.setValueAtTime(1, at);
    speechGain.gain.linearRampToValueAtTime(1 - event.depth, at + 0.003);
    speechGain.gain.setValueAtTime(1 - event.depth, Math.max(at + 0.003, end - 0.004));
    speechGain.gain.linearRampToValueAtTime(1, end);
  }
  if (args.effectsEnabled && effect.modulationDepth > 0) {
    const oscillator = context.createOscillator();
    const modulation = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = effect.modulationFrequencyHz;
    modulation.gain.value = effect.modulationDepth;
    oscillator.connect(modulation).connect(speechGain.gain);
    oscillator.start(0);
    oscillator.stop(speechDurationSeconds + longestParallelDelay);
  }
  if (texture.noise > 0 || effect.noiseGain > 0) {
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = createNoiseBuffer(
      context,
      speechDurationSeconds + longestParallelDelay,
      `${args.seed}:noise`,
    );
    filter.type = "bandpass";
    filter.frequency.value = 1_800;
    filter.Q.value = 0.55;
    gain.gain.value = texture.noise * 0.075 + effect.noiseGain;
    noise.connect(filter).connect(gain).connect(outputGain);
    noise.start(0);
  }
  if (texture.instability > 0) {
    const oscillator = context.createOscillator();
    const modulation = context.createGain();
    oscillator.frequency.value = 2.2 + stableUnit(`${args.seed}:wow`) * 4.1;
    modulation.gain.value = texture.instability * 0.12;
    oscillator.connect(modulation).connect(speechGain.gain);
    oscillator.start(0);
    oscillator.stop(speechDurationSeconds);
  }

  return {
    buffer: await context.startRendering(),
    speechDurationMs: Math.max(1, Math.round(speechDurationSeconds * 1_000)),
    pitchPreserved: transform.pitchCents === 0 || Boolean(FormantCorrectionNode),
  };
}

interface ActiveVoiceChannelState {
  nodes: AudioNode[];
  media: HTMLAudioElement | null;
  mediaUrl: string | null;
  mediaStartTimer: number | null;
  mediaEndTimer: number | null;
  resolve: (() => void) | null;
  progress: VoicePlaybackProgressController | null;
  roomConnection: RoomAcousticsConnection | null;
  outputGain: GainNode | null;
  lightMeter: VoiceLightMeter | null;
  releaseTimer: number | null;
}

const activeVoiceChannels: Record<
  VoicePlaybackChannel,
  ActiveVoiceChannelState
> = {
  primary: {
    nodes: [],
    media: null,
    mediaUrl: null,
    mediaStartTimer: null,
    mediaEndTimer: null,
    resolve: null,
    progress: null,
    roomConnection: null,
    outputGain: null,
    lightMeter: null,
    releaseTimer: null,
  },
  handoff: {
    nodes: [],
    media: null,
    mediaUrl: null,
    mediaStartTimer: null,
    mediaEndTimer: null,
    resolve: null,
    progress: null,
    roomConnection: null,
    outputGain: null,
    lightMeter: null,
    releaseTimer: null,
  },
  presence: {
    nodes: [],
    media: null,
    mediaUrl: null,
    mediaStartTimer: null,
    mediaEndTimer: null,
    resolve: null,
    progress: null,
    roomConnection: null,
    outputGain: null,
    lightMeter: null,
    releaseTimer: null,
  },
  reaction: {
    nodes: [],
    media: null,
    mediaUrl: null,
    mediaStartTimer: null,
    mediaEndTimer: null,
    resolve: null,
    progress: null,
    roomConnection: null,
    outputGain: null,
    lightMeter: null,
    releaseTimer: null,
  },
  crosstalk: {
    nodes: [],
    media: null,
    mediaUrl: null,
    mediaStartTimer: null,
    mediaEndTimer: null,
    resolve: null,
    progress: null,
    roomConnection: null,
    outputGain: null,
    lightMeter: null,
    releaseTimer: null,
  },
};

const completedVoiceTailStops: Record<
  VoicePlaybackChannel,
  Set<() => void>
> = {
  primary: new Set(),
  handoff: new Set(),
  presence: new Set(),
  reaction: new Set(),
  crosstalk: new Set(),
};

const preSpeechBreathBufferCache = new Map<string, Promise<AudioBuffer | null>>();
const PRE_SPEECH_BREATH_LOAD_BUDGET_MS = 120;

function contextForPlayback(): AudioContext | null {
  if (audioContext?.state === "closed") audioContext = null;
  audioContext ??= prismAudioContext();
  return audioContext;
}

export async function prepareRealtimeVoiceAudio(
  options: { loadRealtimeProcessing?: boolean } = {},
): Promise<boolean> {
  const context = contextForPlayback();
  if (!context) return false;
  if (context.state !== "running") {
    let timer: number | null = null;
    try {
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = window.setTimeout(resolve, AUDIO_CONTEXT_RESUME_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }
  if (context.state === "running") {
    if (options.loadRealtimeProcessing !== false) {
      await formantCorrectionNodeConstructor(context);
    } else if (prismLiveVoicePerformanceBudgetActive()) {
      // Compile the zero-copy live playback lane before decoded speech reaches
      // the stage. Failure is harmless because media remains the fallback.
      await liveVoicePlaybackWorkletAvailable(context);
    }
  }
  return context.state === "running";
}

async function loadPreSpeechBreathBuffer(
  context: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  const cached = preSpeechBreathBufferCache.get(url);
  if (cached) return cached;
  const pending = fetch(url, { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) return null;
      return context.decodeAudioData(await response.arrayBuffer());
    })
    .catch(() => null);
  preSpeechBreathBufferCache.set(url, pending);
  return pending;
}

/** Plays a shared microphone-presence cue before speech. A missing decorative
 * asset fails silently so it can never block the bot's actual voice. */
export async function playPreSpeechBreath(args: {
  plan: PreSpeechBreathPlan | null | undefined;
  profile: BotAudioVoiceProfileV1;
  roomAcoustics?: RoomAcousticsSend;
  stereoPan?: number;
  isCurrent?: () => boolean;
  onStart?: () => void;
}): Promise<boolean> {
  if (!args.plan) return false;
  const context = contextForPlayback();
  if (!context || !await prepareRealtimeVoiceAudio()) return false;
  if (args.isCurrent && !args.isCurrent()) return true;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!profile.enabled || profile.volume <= 0) return false;
  let loadTimer: number | null = null;
  const decoded = await Promise.race([
    loadPreSpeechBreathBuffer(context, args.plan.url),
    new Promise<null>((resolve) => {
      loadTimer = window.setTimeout(resolve, PRE_SPEECH_BREATH_LOAD_BUDGET_MS);
    }),
  ]);
  if (loadTimer !== null) window.clearTimeout(loadTimer);
  if (!decoded || (args.isCurrent && !args.isCurrent())) return Boolean(decoded);

  const timing = preSpeechBreathPlaybackTiming(
    args.plan,
    decoded.duration * 1_000,
  );
  if (timing.playbackDurationMs <= 0) return false;

  const active = activeVoiceChannels.presence;
  stopRealtimeVoiceAudio("presence");
  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = decoded;
  // Keep presence airy and close-mic; cut rumble and harsh upper hiss.
  highpass.type = "highpass";
  highpass.frequency.value = 140;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7_000;
  const breathGain = Math.min(1.25, profile.volume) * args.plan.gain;
  const startedAt = context.currentTime;
  const playbackDurationSeconds = timing.playbackDurationMs / 1_000;
  const voiceStartsAt = startedAt + timing.voiceStartOffsetMs / 1_000;
  const releaseStartsAt = Math.max(
    voiceStartsAt,
    startedAt + (timing.playbackDurationMs - timing.releaseFadeMs) / 1_000,
  );
  const endsAt = startedAt + playbackDurationSeconds;
  const attackSeconds = Math.min(0.07, playbackDurationSeconds * 0.18);
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, breathGain),
    startedAt + attackSeconds,
  );
  gain.gain.setValueAtTime(
    Math.max(0.0001, breathGain),
    Math.max(startedAt + attackSeconds, releaseStartsAt),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
  source.connect(highpass).connect(lowpass).connect(gain);
  active.roomConnection = connectRoomAcoustics({
    context,
    input: gain,
    destination: prismAudioOutputNode(context),
    send: args.roomAcoustics,
    stereoPan: args.stereoPan,
  });
  const scheduled: AudioScheduledSourceNode[] = [source];
  active.nodes = scheduled;
  active.outputGain = gain;

  await new Promise<void>((resolve) => {
    let resolved = false;
    let cleaned = false;
    let voiceStartTimer: number | null = null;
    const releaseVoice = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      if (voiceStartTimer !== null) window.clearTimeout(voiceStartTimer);
      voiceStartTimer = null;
      if (active.resolve === cancel) active.resolve = null;
      active.roomConnection?.disconnect();
      active.roomConnection = null;
      for (const node of scheduled) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
      if (active.nodes === scheduled) active.nodes = [];
      if (active.outputGain === gain) active.outputGain = null;
      releaseVoice();
    };
    const cancel = () => finish();
    active.resolve = cancel;
    source.addEventListener("ended", () => {
      if (active.nodes === scheduled) active.nodes = [];
      active.roomConnection?.release();
      active.roomConnection = null;
      finish();
    }, { once: true });
    try {
      args.onStart?.();
      source.start(startedAt, 0, playbackDurationSeconds);
      voiceStartTimer = window.setTimeout(
        releaseVoice,
        Math.max(0, Math.round((voiceStartsAt - startedAt) * 1_000)),
      );
    } catch {
      finish();
    }
  });
  return true;
}

export function stopRealtimeVoiceAudio(
  channel: VoicePlaybackChannel = "primary",
  options: { preserveCompletedTails?: boolean } = {},
): void {
  const active = activeVoiceChannels[channel];
  if (active.releaseTimer !== null) {
    window.clearTimeout(active.releaseTimer);
    active.releaseTimer = null;
  }
  if (active.mediaStartTimer !== null) {
    window.clearTimeout(active.mediaStartTimer);
    active.mediaStartTimer = null;
  }
  if (active.mediaEndTimer !== null) {
    window.clearTimeout(active.mediaEndTimer);
    active.mediaEndTimer = null;
  }
  active.progress?.cancel();
  active.progress = null;
  const media = active.media;
  active.media = null;
  if (media) {
    media.pause();
    media.removeAttribute("src");
    // `load()` forces synchronous media-resource selection and decoder
    // teardown. On Coffee/Signal this showed up as an input-blocking frame at
    // utterance boundaries, so let the detached blob URL release naturally.
    // Non-live surfaces retain the eager cleanup behavior.
    if (!prismLiveVoicePerformanceBudgetActive()) media.load();
  }
  if (active.mediaUrl) {
    URL.revokeObjectURL(active.mediaUrl);
    active.mediaUrl = null;
  }
  for (const node of active.nodes) {
    try {
      if ("stop" in node && typeof node.stop === "function") node.stop();
    } catch { /* already stopped */ }
    try { node.disconnect(); } catch { /* already disconnected */ }
  }
  active.nodes = [];
  active.outputGain = null;
  active.lightMeter?.stop();
  active.lightMeter = null;
  active.roomConnection?.disconnect();
  active.roomConnection = null;
  active.resolve?.();
  active.resolve = null;
  if (!options.preserveCompletedTails) {
    for (const stopTail of [...completedVoiceTailStops[channel]]) {
      stopTail();
    }
  }
}

export function voiceReleaseGainAt(
  startGain: number,
  progress: number,
): number {
  const normalizedGain = Math.max(0, startGain);
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return normalizedGain * Math.cos((normalizedProgress * Math.PI) / 2);
}

/** Releases an audible channel without snapping the waveform off. The
 * lifecycle is cancelled immediately, while the device output gets a short
 * equal-power tail before the channel is fully disconnected. */
export function releaseRealtimeVoiceAudio(
  channel: VoicePlaybackChannel = "primary",
  fadeOutMs = 160,
): void {
  const active = activeVoiceChannels[channel];
  active.progress?.cancel();
  active.progress = null;
  if (active.releaseTimer !== null) return;
  const gain = active.outputGain;
  const durationMs = Math.max(0, Math.round(fadeOutMs));
  if (!gain || active.nodes.length === 0 || durationMs === 0) {
    stopRealtimeVoiceAudio(channel);
    return;
  }
  const startedAt = gain.context.currentTime;
  const startGain = Math.max(0.0001, gain.gain.value);
  const curve = Float32Array.from({ length: 32 }, (_, index) =>
    Math.max(
      0.0001,
      voiceReleaseGainAt(startGain, index / 31),
    ),
  );
  gain.gain.cancelScheduledValues(startedAt);
  gain.gain.setValueCurveAtTime(
    curve,
    startedAt,
    durationMs / 1_000,
  );
  const nodes = active.nodes;
  active.releaseTimer = window.setTimeout(() => {
    active.releaseTimer = null;
    if (active.nodes === nodes && active.outputGain === gain) {
      stopRealtimeVoiceAudio(channel);
    }
  }, durationMs);
}

/**
 * Schedule a short, bounded gain dip without pausing or reallocating the
 * active voice source. Signal uses this for deterministic cut-in/retreat
 * beats: both speakers overlap briefly, the floor owner yields a little room,
 * then returns on the same audio clock. The canonical line and playback
 * lifecycle remain untouched.
 */
export function scheduleRealtimeVoiceDuck(args: {
  channel?: VoicePlaybackChannel;
  delayMs?: number;
  attackMs?: number;
  holdMs: number;
  resumeFadeMs: number;
  duckGain?: number;
}): boolean {
  const active = activeVoiceChannels[args.channel ?? "primary"];
  const outputGain = active.outputGain;
  if (!outputGain || active.nodes.length === 0) return false;

  const parameter = outputGain.gain;
  const nominalGain = Math.max(0, parameter.value);
  if (nominalGain === 0) return false;
  const delayMs = Math.max(0, Math.round(args.delayMs ?? 0));
  const attackMs = Math.max(8, Math.min(90, Math.round(args.attackMs ?? 36)));
  const holdMs = Math.max(0, Math.min(1_200, Math.round(args.holdMs)));
  const resumeFadeMs = Math.max(
    16,
    Math.min(320, Math.round(args.resumeFadeMs)),
  );
  const duckGain = Math.max(0.12, Math.min(0.62, args.duckGain ?? 0.28));
  const startAt = outputGain.context.currentTime + delayMs / 1_000;
  const attackEndAt = startAt + attackMs / 1_000;
  const resumeAt = attackEndAt + holdMs / 1_000;
  const resumeEndAt = resumeAt + resumeFadeMs / 1_000;

  parameter.cancelScheduledValues(startAt);
  parameter.setValueAtTime(nominalGain, startAt);
  parameter.linearRampToValueAtTime(nominalGain * duckGain, attackEndAt);
  parameter.setValueAtTime(nominalGain * duckGain, resumeAt);
  parameter.linearRampToValueAtTime(nominalGain, resumeEndAt);
  return true;
}

export function stopReactionVoiceAudio(): void {
  stopRealtimeVoiceAudio("reaction");
  stopRealtimeVoiceAudio("crosstalk");
}

/**
 * Feed worker-decoded PCM straight to the audio render thread. No AudioBuffer,
 * Blob, media decoder, or per-clause renderer copy is created on a live stage.
 */
async function playWorkletLivePerformanceVoice(args: {
  context: AudioContext;
  pcm: LiveVoicePcm;
  profile: BotAudioVoiceProfileV1;
  channel: VoicePlaybackChannel;
  lifecycle?: VoicePlaybackLifecycle;
  alignment?: VoicePlaybackCharacterAlignment | null;
  stereoPan?: number;
  maxDurationMs?: number;
  scheduledStartAtPerformanceMs?: number;
  compensateLifecycleForOutputLatency?: boolean;
  alignMouthToDecodedSpeech?: boolean;
}): Promise<boolean> {
  const { context, pcm, channel, lifecycle, alignment } = args;
  if (
    pcm.channels.length === 0 ||
    pcm.frameCount <= 0 ||
    pcm.sampleRate <= 0 ||
    !(await liveVoicePlaybackWorkletAvailable(context))
  ) {
    return false;
  }

  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const playbackRateRatio = resolveVoicePlaybackTransform(profile).tempo;
  const naturalDurationSeconds =
    pcm.frameCount / pcm.sampleRate / playbackRateRatio;
  const playbackDurationSeconds = Math.min(
    naturalDurationSeconds,
    args.maxDurationMs && args.maxDurationMs > 0
      ? args.maxDurationMs / 1_000
      : Number.POSITIVE_INFINITY,
  );
  const scheduledStartDelayMs =
    typeof args.scheduledStartAtPerformanceMs === "number" &&
    Number.isFinite(args.scheduledStartAtPerformanceMs)
      ? Math.max(0, args.scheduledStartAtPerformanceMs - performance.now())
      : 0;
  const startedAt = context.currentTime + scheduledStartDelayMs / 1_000;
  const outputLatencyMs =
    args.compensateLifecycleForOutputLatency && lifecycle
      ? estimateVoiceOutputLatencyMs(context)
      : 0;
  const articulationDurationMs = voicePlaybackPresentationDurationMs(
    Math.min(
      expectedVoicePlaybackDurationMs(
        (pcm.frameCount / pcm.sampleRate) * 1_000,
        profile,
      ),
      args.maxDurationMs && args.maxDurationMs > 0
        ? args.maxDurationMs
        : Number.POSITIVE_INFINITY,
    ),
  );
  const playbackAlignment = args.alignMouthToDecodedSpeech
    ? voicePlaybackAlignmentWithDecodedSpeechStart(
        alignment,
        (() => {
          const sourceStartMs = decodedVoiceSpeechActivityStartMs({
            channels: pcm.channels.map((channelBytes) =>
              new Float32Array(channelBytes),
            ),
            sampleRate: pcm.sampleRate,
          });
          return sourceStartMs == null
            ? null
            : sourceStartMs / playbackRateRatio;
        })(),
      )
    : alignment ?? null;

  let node: AudioWorkletNode;
  let outputGain: GainNode;
  try {
    node = new AudioWorkletNode(
      context,
      PRISM_LIVE_VOICE_PLAYBACK_PROCESSOR,
      {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [Math.min(2, pcm.channels.length)],
      },
    );
    outputGain = context.createGain();
  } catch {
    return false;
  }

  const active = activeVoiceChannels[channel];
  stopRealtimeVoiceAudio(channel, { preserveCompletedTails: true });
  outputGain.gain.value =
    Math.min(1.25, profile.volume) *
    (channel === "primary" || channel === "handoff" ? 0.88 : 0.62);
  const leveler =
    lifecycle?.loudnessNormalization === "interview"
      ? connectLiveInterviewVoiceLeveler(context, node)
      : null;
  (leveler?.output ?? node).connect(outputGain);
  const scheduled: AudioNode[] = [
    node,
    ...(leveler?.nodes ?? []),
    outputGain,
  ];
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, args.stereoPan ?? 0));
    outputGain.connect(panner).connect(prismAudioOutputNode(context));
    scheduled.push(panner);
  } else {
    outputGain.connect(prismAudioOutputNode(context));
  }
  active.nodes = scheduled;
  active.outputGain = outputGain;
  active.roomConnection = null;
  active.lightMeter = null;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let accepted = false;
    let progress: VoicePlaybackProgressController | null = null;
    const finish = (completed: boolean): void => {
      if (settled) return;
      settled = true;
      if (active.mediaEndTimer !== null) {
        window.clearTimeout(active.mediaEndTimer);
        active.mediaEndTimer = null;
      }
      if (completed) progress?.finish();
      else progress?.cancel();
      if (active.progress === progress) active.progress = null;
      if (active.resolve === cancel) active.resolve = null;
      if (active.nodes === scheduled) active.nodes = [];
      if (active.outputGain === outputGain) active.outputGain = null;
      for (const scheduledNode of scheduled) {
        try {
          scheduledNode.disconnect();
        } catch {
          // Cancellation may already have disconnected this compact graph.
        }
      }
      try {
        node.port.postMessage({ type: "cancel" });
        node.port.close();
      } catch {
        // A completed processor may already have closed its message port.
      }
      if (accepted) {
        if (completed) lifecycle?.onEnd?.();
        else lifecycle?.onCancel?.();
      }
      resolve(accepted);
    };
    const cancel = () => finish(false);
    active.resolve = cancel;
    node.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== "ended" || settled) return;
      if (active.mediaEndTimer !== null) {
        window.clearTimeout(active.mediaEndTimer);
        active.mediaEndTimer = null;
      }
      if (outputLatencyMs > 0) {
        active.mediaEndTimer = window.setTimeout(() => {
          active.mediaEndTimer = null;
          finish(true);
        }, outputLatencyMs);
      } else {
        finish(true);
      }
    };
    node.addEventListener("processorerror", () => finish(false), {
      once: true,
    });
    progress = beginVoicePlaybackProgress(
      lifecycle,
      articulationDurationMs,
      () => (context.currentTime - startedAt) * 1_000,
      playbackAlignment,
      {
        startDelayMs: scheduledStartDelayMs + outputLatencyMs,
        holdAtEndUntilFinish: true,
      },
    );
    active.progress = progress;
    active.mediaEndTimer = window.setTimeout(
      () => {
        active.mediaEndTimer = null;
        finish(false);
      },
      Math.max(
        2_000,
        Math.round(
          scheduledStartDelayMs +
            playbackDurationSeconds * 1_000 +
            outputLatencyMs +
            2_000,
        ),
      ),
    );
    const channelBuffers = pcm.channels.slice(0, 2);
    try {
      node.port.postMessage(
        {
          type: "load",
          channels: channelBuffers,
          frameCount: pcm.frameCount,
          sourceSampleRate: pcm.sampleRate,
          playbackRate: playbackRateRatio,
          startFrame: Math.ceil(startedAt * context.sampleRate),
          maximumOutputFrames: Math.ceil(
            playbackDurationSeconds * context.sampleRate,
          ),
        },
        channelBuffers,
      );
      accepted = true;
    } catch {
      finish(false);
    }
  });
}

/**
 * Coffee and Signal favor an uninterrupted composer over decorative audio
 * processing while their live stages are mounted. Keep the voice, pan, gain,
 * lifecycle, and ducking surface, but skip worklets, pitch analysis, room
 * convolution, parallel voices, and metering for this latency-critical lane.
 */
async function playLivePerformanceVoice(args: {
  context: AudioContext;
  bytes: ArrayBuffer;
  profile: BotAudioVoiceProfileV1;
  channel: VoicePlaybackChannel;
  lifecycle?: VoicePlaybackLifecycle;
  alignment?: VoicePlaybackCharacterAlignment | null;
  stereoPan?: number;
  maxDurationMs?: number;
  scheduledStartAtPerformanceMs?: number;
  compensateLifecycleForOutputLatency?: boolean;
  isCurrent?: () => boolean;
}): Promise<boolean> {
  if (
    typeof Audio !== "function" ||
    typeof URL.createObjectURL !== "function" ||
    typeof args.context.createMediaElementSource !== "function"
  ) {
    return false;
  }
  const { context, channel } = args;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const active = activeVoiceChannels[channel];
  stopRealtimeVoiceAudio(channel, { preserveCompletedTails: true });

  let url: string;
  let audio: HTMLAudioElement;
  let source: MediaElementAudioSourceNode;
  let outputGain: GainNode;
  try {
    const header = new Uint8Array(
      args.bytes,
      0,
      Math.min(4, args.bytes.byteLength),
    );
    const isWave = String.fromCharCode(...header) === "RIFF";
    url = URL.createObjectURL(
      new Blob([args.bytes], { type: isWave ? "audio/wav" : "audio/mpeg" }),
    );
    audio = new Audio();
    audio.preload = "auto";
    audio.preservesPitch = true;
    audio.src = url;
    source = context.createMediaElementSource(audio);
    outputGain = context.createGain();
  } catch {
    return false;
  }

  const playbackRateRatio = resolveVoicePlaybackTransform(profile).tempo;
  audio.playbackRate = playbackRateRatio;
  audio.volume = 1;
  outputGain.gain.value =
    Math.min(1.25, profile.volume) *
    (channel === "primary" || channel === "handoff" ? 0.88 : 0.62);
  const leveler =
    args.lifecycle?.loudnessNormalization === "interview"
      ? connectLiveInterviewVoiceLeveler(context, source)
      : null;
  (leveler?.output ?? source).connect(outputGain);
  const scheduled: AudioNode[] = [
    source,
    ...(leveler?.nodes ?? []),
    outputGain,
  ];
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, args.stereoPan ?? 0));
    outputGain.connect(panner).connect(prismAudioOutputNode(context));
    scheduled.push(panner);
  } else {
    outputGain.connect(prismAudioOutputNode(context));
  }
  active.nodes = scheduled;
  active.media = audio;
  active.mediaUrl = url;
  active.outputGain = outputGain;
  active.roomConnection = null;
  active.lightMeter = null;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let started = false;
    let progress: VoicePlaybackProgressController | null = null;
    const finish = (
      outcome: "completed" | "cancelled" | "failed",
    ): void => {
      if (settled) return;
      settled = true;
      if (active.mediaStartTimer !== null) {
        window.clearTimeout(active.mediaStartTimer);
        active.mediaStartTimer = null;
      }
      if (active.mediaEndTimer !== null) {
        window.clearTimeout(active.mediaEndTimer);
        active.mediaEndTimer = null;
      }
      if (outcome === "completed") progress?.finish();
      else progress?.cancel();
      if (active.progress === progress) active.progress = null;
      if (active.resolve === cancel) active.resolve = null;
      if (active.nodes === scheduled) active.nodes = [];
      if (active.outputGain === outputGain) active.outputGain = null;
      if (active.media === audio) {
        active.media = null;
        audio.pause();
        audio.removeAttribute("src");
      }
      if (active.mediaUrl === url) {
        active.mediaUrl = null;
        URL.revokeObjectURL(url);
      }
      for (const node of scheduled) {
        try {
          node.disconnect();
        } catch {
          // An interruption may already have released this compact graph.
        }
      }
      if (started) {
        if (outcome === "completed") args.lifecycle?.onEnd?.();
        else args.lifecycle?.onCancel?.();
      }
      // A media failure before audible playback may use the decoded fallback.
      // Once sound started, never replay the same clause from the beginning.
      resolve(outcome !== "failed" || started);
    };
    const cancel = () => finish("cancelled");
    active.resolve = cancel;
    audio.addEventListener("ended", () => finish("completed"), { once: true });
    audio.addEventListener("error", () => finish("failed"), { once: true });
    audio.addEventListener(
      "playing",
      () => {
        if (started) return;
        started = true;
        const sourceDurationMs =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration * 1_000
            : Math.max(1, args.maxDurationMs ?? 1);
        const articulationDurationMs = voicePlaybackPresentationDurationMs(
          Math.min(
            expectedVoicePlaybackDurationMs(sourceDurationMs, profile),
            args.maxDurationMs && args.maxDurationMs > 0
              ? args.maxDurationMs
              : Number.POSITIVE_INFINITY,
          ),
        );
        const outputLatencyMs =
          args.compensateLifecycleForOutputLatency && args.lifecycle
            ? estimateVoiceOutputLatencyMs(context)
            : 0;
        progress = beginVoicePlaybackProgress(
          args.lifecycle,
          articulationDurationMs,
          () => (audio.currentTime * 1_000) / playbackRateRatio,
          args.alignment,
          {
            startDelayMs: outputLatencyMs,
            holdAtEndUntilFinish: true,
          },
        );
        active.progress = progress;
        if (
          args.maxDurationMs &&
          args.maxDurationMs > 0 &&
          articulationDurationMs >= args.maxDurationMs
        ) {
          active.mediaEndTimer = window.setTimeout(() => {
            active.mediaEndTimer = null;
            finish("completed");
          }, args.maxDurationMs);
        }
      },
      { once: true },
    );

    const beginPlayback = (): void => {
      active.mediaStartTimer = null;
      if (args.isCurrent && !args.isCurrent()) {
        finish("cancelled");
        return;
      }
      void audio.play().catch(() => finish("failed"));
    };
    const scheduledStartDelayMs =
      typeof args.scheduledStartAtPerformanceMs === "number" &&
      Number.isFinite(args.scheduledStartAtPerformanceMs)
        ? Math.max(0, args.scheduledStartAtPerformanceMs - performance.now())
        : 0;
    if (scheduledStartDelayMs > 0) {
      active.mediaStartTimer = window.setTimeout(
        beginPlayback,
        scheduledStartDelayMs,
      );
    } else {
      beginPlayback();
    }
  });
}

/** Audio-buffer fallback for live stages whose browser media lane cannot start
 * the clip. Browser-managed media is preferred because duplicating every full
 * line into worker PCM and an AudioBuffer creates major-GC spikes mid-session. */
async function playDecodedLivePerformanceVoice(args: {
  context: AudioContext;
  decoded: AudioBuffer;
  profile: BotAudioVoiceProfileV1;
  channel: VoicePlaybackChannel;
  lifecycle?: VoicePlaybackLifecycle;
  alignment?: VoicePlaybackCharacterAlignment | null;
  stereoPan?: number;
  maxDurationMs?: number;
  scheduledStartAtPerformanceMs?: number;
  compensateLifecycleForOutputLatency?: boolean;
  alignMouthToDecodedSpeech?: boolean;
}): Promise<boolean> {
  const { context, decoded, channel } = args;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const active = activeVoiceChannels[channel];
  stopRealtimeVoiceAudio(channel, { preserveCompletedTails: true });

  const source = context.createBufferSource();
  const outputGain = context.createGain();
  const playbackRateRatio = resolveVoicePlaybackTransform(profile).tempo;
  const naturalDurationSeconds = decoded.duration / playbackRateRatio;
  const playbackDurationSeconds = Math.min(
    naturalDurationSeconds,
    args.maxDurationMs && args.maxDurationMs > 0
      ? args.maxDurationMs / 1_000
      : Number.POSITIVE_INFINITY,
  );
  const scheduledStartDelayMs =
    typeof args.scheduledStartAtPerformanceMs === "number" &&
    Number.isFinite(args.scheduledStartAtPerformanceMs)
      ? Math.max(0, args.scheduledStartAtPerformanceMs - performance.now())
      : 0;
  const startedAt = context.currentTime + scheduledStartDelayMs / 1_000;
  const outputLatencyMs =
    args.compensateLifecycleForOutputLatency && args.lifecycle
      ? estimateVoiceOutputLatencyMs(context)
      : 0;
  const articulationDurationMs = voicePlaybackPresentationDurationMs(
    Math.min(
      expectedVoicePlaybackDurationMs(decoded.duration * 1_000, profile),
      args.maxDurationMs && args.maxDurationMs > 0
        ? args.maxDurationMs
        : Number.POSITIVE_INFINITY,
    ),
  );
  const playbackAlignment = args.alignMouthToDecodedSpeech
    ? voicePlaybackAlignmentWithDecodedSpeechStart(
        args.alignment,
        (() => {
          const sourceStartMs = decodedVoiceSpeechActivityStartMs({
            channels: Array.from(
              { length: decoded.numberOfChannels },
              (_, index) => decoded.getChannelData(index),
            ),
            sampleRate: decoded.sampleRate,
          });
          return sourceStartMs == null
            ? null
            : sourceStartMs / playbackRateRatio;
        })(),
      )
    : args.alignment ?? null;

  source.buffer = decoded;
  source.playbackRate.setValueAtTime(playbackRateRatio, startedAt);
  outputGain.gain.value =
    Math.min(1.25, profile.volume) *
    (channel === "primary" || channel === "handoff" ? 0.88 : 0.62);
  const leveler =
    args.lifecycle?.loudnessNormalization === "interview"
      ? connectLiveInterviewVoiceLeveler(context, source)
      : null;
  (leveler?.output ?? source).connect(outputGain);

  const scheduled: AudioNode[] = [
    source,
    ...(leveler?.nodes ?? []),
    outputGain,
  ];
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, args.stereoPan ?? 0));
    outputGain.connect(panner).connect(prismAudioOutputNode(context));
    scheduled.push(panner);
  } else {
    outputGain.connect(prismAudioOutputNode(context));
  }
  active.nodes = scheduled;
  active.outputGain = outputGain;
  active.roomConnection = null;
  active.lightMeter = null;

  await new Promise<void>((resolve) => {
    let settled = false;
    let progress: VoicePlaybackProgressController | null = null;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (completed) progress?.finish();
      else progress?.cancel();
      if (active.progress === progress) active.progress = null;
      if (active.resolve === cancel) active.resolve = null;
      if (active.nodes === scheduled) active.nodes = [];
      if (active.outputGain === outputGain) active.outputGain = null;
      for (const node of scheduled) {
        try {
          node.disconnect();
        } catch {
          // An interruption may already have released this small graph.
        }
      }
      if (completed) args.lifecycle?.onEnd?.();
      else args.lifecycle?.onCancel?.();
      resolve();
    };
    const cancel = () => finish(false);
    active.resolve = cancel;
    source.addEventListener("ended", () => finish(true), { once: true });
    progress = beginVoicePlaybackProgress(
      args.lifecycle,
      articulationDurationMs,
      () => (context.currentTime - startedAt) * 1_000,
      playbackAlignment,
      {
        startDelayMs: scheduledStartDelayMs + outputLatencyMs,
        holdAtEndUntilFinish: true,
      },
    );
    active.progress = progress;
    try {
      source.start(startedAt);
      if (playbackDurationSeconds + 0.0001 < naturalDurationSeconds) {
        source.stop(startedAt + playbackDurationSeconds);
      }
    } catch {
      finish(false);
    }
  });
  return true;
}

export async function playRealtimeVoiceBytes(args: {
  bytes: ArrayBuffer;
  profile: BotAudioVoiceProfileV1;
  seed: string;
  effectsEnabled: boolean;
  detuneCents?: number;
  baseLowpassHz?: number;
  lifecycle?: VoicePlaybackLifecycle;
  alignment?: VoicePlaybackCharacterAlignment | null;
  roboticPlan?: VoiceRoboticPlan | null;
  cleanRoboticCarrier?: boolean;
  voiceEffect?: VoiceEffect;
  /** Legacy call-site name retained during the portable profile transition. */
  elevenLabsEffect?: VoiceEffect;
  roomAcoustics?: RoomAcousticsSend;
  /** Equal-power placement for the direct voice; room reflections stay shared. */
  stereoPan?: number;
  /** Independent listener reactions never cancel or complete primary speech. */
  channel?: VoicePlaybackChannel;
  /** Local timbre controls never reshape a Premium provider identity. */
  localToneEnabled?: boolean;
  /** Optional hard ceiling for short secondary clips such as backchannels. */
  maxDurationMs?: number;
  /** Prevents an older asynchronous decode from replacing newer playback. */
  isCurrent?: () => boolean;
  /** Keep visible speech on the device-output clock instead of the render clock. */
  compensateLifecycleForOutputLatency?: boolean;
  /**
   * Monotonic browser timestamp for an exact future audio start. Decoding and
   * graph preparation happen immediately, then the source waits on this clock.
   */
  scheduledStartAtPerformanceMs?: number;
  /** Premium buffered speech uses decoded onset to anchor provider timestamps. */
  alignMouthToDecodedSpeech?: boolean;
}): Promise<boolean> {
  const livePerformanceBudget = prismLiveVoicePerformanceBudgetActive();
  const context = contextForPlayback();
  if (
    !context ||
    !(await prepareRealtimeVoiceAudio({
      loadRealtimeProcessing: !livePerformanceBudget,
    }))
  )
    return false;
  if (args.isCurrent && !args.isCurrent()) return true;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const localToneEnabled = args.localToneEnabled !== false;
  if (!profile.enabled || profile.volume <= 0) return true;
  const channel = args.channel ?? "primary";
  if (livePerformanceBudget) {
    if (await liveVoicePlaybackWorkletAvailable(context)) {
      const decodedResult = await decodeLiveVoicePcmOwned(args.bytes);
      if (args.isCurrent && !args.isCurrent()) return true;
      if (decodedResult.pcm) {
        const workletPlayed = await playWorkletLivePerformanceVoice({
          context,
          pcm: decodedResult.pcm,
          profile,
          channel,
          lifecycle: args.lifecycle,
          alignment: args.alignment,
          stereoPan: args.stereoPan,
          maxDurationMs: args.maxDurationMs,
          scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
          compensateLifecycleForOutputLatency:
            args.compensateLifecycleForOutputLatency,
          alignMouthToDecodedSpeech: args.alignMouthToDecodedSpeech,
        });
        if (workletPlayed) return true;
        if (
          decodedResult.pcm.channels.every(
            (channelBytes) => channelBytes.byteLength > 0,
          )
        ) {
          const decoded = context.createBuffer(
            decodedResult.pcm.channels.length,
            decodedResult.pcm.frameCount,
            decodedResult.pcm.sampleRate,
          );
          for (
            let channelIndex = 0;
            channelIndex < decodedResult.pcm.channels.length;
            channelIndex += 1
          ) {
            decoded.copyToChannel(
              new Float32Array(decodedResult.pcm.channels[channelIndex]!),
              channelIndex,
            );
          }
          return playDecodedLivePerformanceVoice({
            context,
            decoded,
            profile,
            channel,
            lifecycle: args.lifecycle,
            alignment: args.alignment,
            stereoPan: args.stereoPan,
            maxDurationMs: args.maxDurationMs,
            scheduledStartAtPerformanceMs:
              args.scheduledStartAtPerformanceMs,
            compensateLifecycleForOutputLatency:
              args.compensateLifecycleForOutputLatency,
            alignMouthToDecodedSpeech: args.alignMouthToDecodedSpeech,
          });
        }
      }
      if (decodedResult.fallbackBytes) {
        const mediaPlayed = await playLivePerformanceVoice({
          context,
          bytes: decodedResult.fallbackBytes,
          profile,
          channel,
          lifecycle: args.lifecycle,
          alignment: args.alignment,
          stereoPan: args.stereoPan,
          maxDurationMs: args.maxDurationMs,
          scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
          compensateLifecycleForOutputLatency:
            args.compensateLifecycleForOutputLatency,
          isCurrent: args.isCurrent,
        });
        if (mediaPlayed) return true;
      }
      return false;
    }
    const mediaPlayed = await playLivePerformanceVoice({
      context,
      bytes: args.bytes,
      profile,
      channel,
      lifecycle: args.lifecycle,
      alignment: args.alignment,
      stereoPan: args.stereoPan,
      maxDurationMs: args.maxDurationMs,
      scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
      compensateLifecycleForOutputLatency:
        args.compensateLifecycleForOutputLatency,
      isCurrent: args.isCurrent,
    });
    if (mediaPlayed) return true;
    if (args.isCurrent && !args.isCurrent()) return true;
    const pcm = await decodeLiveVoicePcm(args.bytes);
    if (pcm) {
      if (args.isCurrent && !args.isCurrent()) return true;
      const decoded = context.createBuffer(
        pcm.channels.length,
        pcm.frameCount,
        pcm.sampleRate,
      );
      for (let channelIndex = 0; channelIndex < pcm.channels.length; channelIndex += 1) {
        decoded.copyToChannel(
          new Float32Array(pcm.channels[channelIndex]!),
          channelIndex,
        );
      }
      return playDecodedLivePerformanceVoice({
        context,
        decoded,
        profile,
        channel,
        lifecycle: args.lifecycle,
        alignment: args.alignment,
        stereoPan: args.stereoPan,
        maxDurationMs: args.maxDurationMs,
        scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
        compensateLifecycleForOutputLatency:
          args.compensateLifecycleForOutputLatency,
        alignMouthToDecodedSpeech: args.alignMouthToDecodedSpeech,
      });
    }
    return false;
  }
  const decoded = await context.decodeAudioData(args.bytes.slice(0));
  if (args.isCurrent && !args.isCurrent()) return true;
  if (livePerformanceBudget) {
    return playDecodedLivePerformanceVoice({
      context,
      decoded,
      profile,
      channel,
      lifecycle: args.lifecycle,
      alignment: args.alignment,
      stereoPan: args.stereoPan,
      maxDurationMs: args.maxDurationMs,
      scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
      compensateLifecycleForOutputLatency:
        args.compensateLifecycleForOutputLatency,
      alignMouthToDecodedSpeech: args.alignMouthToDecodedSpeech,
    });
  }
  const active = activeVoiceChannels[channel];
  // A new natural utterance owns the live channel, but a source that already
  // completed may keep draining its final rendered phoneme underneath it.
  stopRealtimeVoiceAudio(channel, { preserveCompletedTails: true });
  const texture = resolveVoiceTexture(profile, args.effectsEnabled);
  const voiceEffect = resolveVoiceEffectPlan(
    args.effectsEnabled
      ? normalizeVoiceEffect(
          args.voiceEffect ?? args.elevenLabsEffect ?? profile.elevenLabsEffect,
        )
      : "clean",
  );
  const lifecycleOutputLatencyMs =
    args.compensateLifecycleForOutputLatency && args.lifecycle
    ? estimateVoiceOutputLatencyMs(context)
    : 0;
  const transform = resolveVoicePlaybackTransform(profile);
  const playbackRateRatio = transform.tempo;
  const playbackDurationSeconds = Math.min(
    decoded.duration / playbackRateRatio,
    args.maxDurationMs && args.maxDurationMs > 0
      ? args.maxDurationMs / 1_000
      : Number.POSITIVE_INFINITY,
  );
  const pitchCorrectionPoints = voiceEffect.pitchCorrection
    ? analyzePrismPitchCorrection({
        samples: decoded.getChannelData(0),
        sampleRate: decoded.sampleRate,
        playbackRate: playbackRateRatio,
        maxPlaybackDurationSeconds: playbackDurationSeconds,
        plan: voiceEffect.pitchCorrection,
        pitchOffsetCentsAt: (elapsedSeconds) =>
          (args.detuneCents ?? transform.pitchCents) +
          voiceLiltDetuneCents(profile.lilt, elapsedSeconds) +
          voiceIntonationDetuneCents(
            voiceIntonationPlanForProfile(profile),
            elapsedSeconds,
            playbackDurationSeconds,
          ),
      })
    : [];
  const FormantCorrectionNode = await formantCorrectionNodeConstructor(context);
  // Worklet registration can take long enough for a timestamp captured before
  // the await to become stale. Anchor both source scheduling and the visible
  // lifecycle to the live audio clock so neither starts ahead nor cuts short.
  const playbackClockStartedAt = context.currentTime;
  const scheduledStartDelayMs =
    typeof args.scheduledStartAtPerformanceMs === "number" &&
    Number.isFinite(args.scheduledStartAtPerformanceMs)
      ? Math.max(0, args.scheduledStartAtPerformanceMs - performance.now())
      : 0;
  const now = playbackClockStartedAt + scheduledStartDelayMs / 1_000;
  const tailFlushMs = FormantCorrectionNode
    ? VOICE_PLAYBACK_TAIL_FLUSH_MS
    : Math.min(40, VOICE_PLAYBACK_TAIL_FLUSH_MS);
  const articulationDurationMs = Math.min(
    expectedVoicePlaybackDurationMs(decoded.duration * 1000, profile),
    args.maxDurationMs && args.maxDurationMs > 0
      ? args.maxDurationMs
      : Number.POSITIVE_INFINITY,
  );
  // Provider alignment remains on the audible articulation duration. The
  // bounded worklet/device tail below controls graph lifetime and final-pose
  // hold only; folding it into this duration stretches every viseme.
  const lifecycleArticulationDurationMs =
    voicePlaybackPresentationDurationMs(articulationDurationMs);
  const playbackAlignment = args.alignMouthToDecodedSpeech
    ? voicePlaybackAlignmentWithDecodedSpeechStart(
        args.alignment,
        (() => {
          const sourceStartMs = decodedVoiceSpeechActivityStartMs({
            channels: Array.from(
              { length: decoded.numberOfChannels },
              (_, index) => decoded.getChannelData(index),
            ),
            sampleRate: decoded.sampleRate,
          });
          return sourceStartMs == null
            ? null
            : sourceStartMs / playbackRateRatio;
        })(),
      )
    : args.alignment ?? null;
  const createPitchTransform = (
    startAt: number,
    effectDetuneCents = 0,
  ): FormantCorrectionNodeLike | null => {
    if (!FormantCorrectionNode) return null;
    const node = new FormantCorrectionNode({
      context,
      outputChannelCount: decoded.numberOfChannels === 1 ? 1 : 2,
    });
    node.playbackRate.setValueAtTime(playbackRateRatio, startAt);
    node.formantStrength.setValueAtTime(
      localToneEnabled
        ? Math.max(0.5, Math.min(1.5, 1 + (profile.resonance ?? 0) * 0.45))
        : 1,
      startAt,
    );
    const basePitchCents = (args.detuneCents ?? transform.pitchCents) + effectDetuneCents;
    const intonationPlan = voiceIntonationPlanForProfile(profile);
    const pitchAutomationTimes = new Set<number>([0]);
    if (profile.lilt !== 0 || intonationPlan) {
      const contourStep = 0.32;
      for (let at = contourStep; at < playbackDurationSeconds; at += contourStep) {
        pitchAutomationTimes.add(at);
      }
      // The phrase-final keyframe carries the terminal fall or rise; make
      // sure the ramp actually lands on it.
      pitchAutomationTimes.add(Math.max(0, playbackDurationSeconds - 0.02));
    }
    for (const point of pitchCorrectionPoints) {
      if (point.atSeconds > 0 && point.atSeconds < playbackDurationSeconds) {
        pitchAutomationTimes.add(point.atSeconds);
      }
    }
    const orderedPitchAutomationTimes = [...pitchAutomationTimes].sort(
      (left, right) => left - right,
    );
    for (let index = 0; index < orderedPitchAutomationTimes.length; index += 1) {
      const elapsedSeconds = orderedPitchAutomationTimes[index] ?? 0;
      const cents =
        basePitchCents +
        voiceLiltDetuneCents(profile.lilt, elapsedSeconds) +
        voiceIntonationDetuneCents(
          intonationPlan,
          elapsedSeconds,
          playbackDurationSeconds,
        ) +
        voicePitchCorrectionCentsAt(pitchCorrectionPoints, elapsedSeconds);
      const pitchRatio = 2 ** (cents / 1_200);
      if (index === 0) {
        node.pitch.setValueAtTime(pitchRatio, startAt);
      } else {
        node.pitch.linearRampToValueAtTime(
          pitchRatio,
          startAt + elapsedSeconds,
        );
      }
    }
    return node;
  };
  const createSpeechSource = (
    startAt: number,
    effectDetuneCents = 0,
  ): { source: AudioBufferSourceNode; transform: FormantCorrectionNodeLike | null } => {
    const speechSource = context.createBufferSource();
    speechSource.buffer = decoded;
    // Pace is the sole duration control. Without a functioning worklet, leave
    // pitch neutral instead of falling back to pitch-via-resampling.
    speechSource.playbackRate.setValueAtTime(playbackRateRatio, startAt);
    return {
      source: speechSource,
      transform: createPitchTransform(startAt, effectDetuneCents),
    };
  };
  const primaryVoice = createSpeechSource(now);
  const source = primaryVoice.source;

  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const shaper = context.createWaveShaper();
  const dryGain = context.createGain();
  const speechGain = context.createGain();
  const outputGain = context.createGain();
  const lowShelf = context.createBiquadFilter();
  const highShelf = context.createBiquadFilter();
  const chestShelf = context.createBiquadFilter();
  const nasalPeak = context.createBiquadFilter();
  const limiter = context.createDynamicsCompressor();
  const localCharacterProfile = localToneEnabled
    ? {
        ...profile,
        eqTilt: profile.brightness ?? profile.eqTilt,
      }
    : { ...profile, eqTilt: 0, gainDb: 0 };
  const voiceCharacter = resolveBotVoiceCharacter(localCharacterProfile);
  highpass.type = "highpass";
  highpass.frequency.value = Math.max(
    voiceEffect.highpassHz,
    25 + (1 - texture.bandwidth) * 300
  );
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(
    args.baseLowpassHz ?? 20_000,
    args.roboticPlan?.lowpassHz ?? 20_000,
    voiceEffect.lowpassHz,
    20_000 - (1 - texture.bandwidth) * 16_200
  );
  shaper.curve = distortionCurve(
    Math.max(texture.distortion, args.roboticPlan?.drive ?? 0, voiceEffect.drive),
    Math.min(args.roboticPlan?.bitDepth ?? 16, voiceEffect.bitDepth),
  );
  shaper.oversample = "2x";
  dryGain.gain.value = voiceEffect.dryGain;
  speechGain.gain.value = voiceEffect.modulationBaseGain;
  outputGain.gain.value =
    Math.min(1.25, profile.volume) *
    0.88 *
    voiceEffect.outputTrim *
    voiceCharacter.gainMultiplier *
    (channel === "primary" || channel === "handoff" ? 1 : 0.62);
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = BOT_VOICE_LOW_SHELF_HZ;
  lowShelf.gain.value = voiceCharacter.lowShelfDb;
  highShelf.type = "highshelf";
  highShelf.frequency.value = BOT_VOICE_HIGH_SHELF_HZ;
  highShelf.gain.value = voiceCharacter.highShelfDb;
  chestShelf.type = "lowshelf";
  chestShelf.frequency.value = 260;
  chestShelf.gain.value = localToneEnabled ? (profile.weight ?? 0) * 5.5 : 0;
  nasalPeak.type = "peaking";
  nasalPeak.frequency.value = 1_150;
  nasalPeak.Q.value = 0.8;
  nasalPeak.gain.value = localToneEnabled ? (profile.openness ?? 0) * 5 : 0;
  limiter.threshold.value = args.cleanRoboticCarrier ? -0.5 : -4;
  limiter.knee.value = args.cleanRoboticCarrier ? 0 : 8;
  limiter.ratio.value = args.cleanRoboticCarrier ? 20 : 12;
  limiter.attack.value = args.cleanRoboticCarrier ? 0.001 : 0.003;
  limiter.release.value = args.cleanRoboticCarrier ? 0.04 : 0.12;
  if (primaryVoice.transform) {
    source.connect(primaryVoice.transform).connect(dryGain);
  } else {
    source.connect(dryGain);
  }
  dryGain.connect(highpass).connect(lowpass);
  if (args.cleanRoboticCarrier) {
    lowpass.connect(speechGain);
  } else {
    lowpass.connect(shaper).connect(speechGain);
  }
  speechGain.connect(outputGain);
  outputGain
    .connect(lowShelf)
    .connect(highShelf)
    .connect(chestShelf)
    .connect(nasalPeak)
    .connect(limiter);
  const levelReporter = args.lifecycle?.onLevel || args.lifecycle?.voiceLightTarget
    ? (level: number) => {
        if (args.lifecycle?.voiceLightTarget) {
          publishBotVoiceLightLevel(args.lifecycle.voiceLightTarget, level);
        }
        args.lifecycle?.onLevel?.(level);
      }
    : null;
  const lightMeter = levelReporter
    ? createVoiceLightMeter(context, levelReporter)
    : null;
  if (lightMeter) limiter.connect(lightMeter.node);
  const roomConnection = connectRoomAcoustics({
    context,
    input: lightMeter?.node ?? limiter,
    destination: prismAudioOutputNode(context),
    send: args.roomAcoustics,
    stereoPan: args.stereoPan,
  });

  for (const event of buildVoiceDamageSchedule(args.seed, articulationDurationMs, texture.damage)) {
    const at = now + event.atMs / 1000;
    const end = at + event.durationMs / 1000;
    speechGain.gain.setValueAtTime(1, at);
    speechGain.gain.linearRampToValueAtTime(1 - event.depth, at + 0.003);
    speechGain.gain.setValueAtTime(1 - event.depth, Math.max(at + 0.003, end - 0.004));
    speechGain.gain.linearRampToValueAtTime(1, end);
  }

  for (const event of args.roboticPlan?.gates ?? []) {
    const at = now + Math.max(0, Math.min(1, event.atRatio)) * playbackDurationSeconds;
    const end = Math.min(
      now + playbackDurationSeconds,
      at + Math.max(0.006, event.durationMs / 1000)
    );
    speechGain.gain.setValueAtTime(1, at);
    speechGain.gain.linearRampToValueAtTime(1 - event.depth, at + 0.002);
    speechGain.gain.setValueAtTime(1 - event.depth, Math.max(at + 0.002, end - 0.003));
    speechGain.gain.linearRampToValueAtTime(1, end);
  }

  const scheduled: AudioNode[] = [source];
  if (primaryVoice.transform) scheduled.push(primaryVoice.transform);
  const speechStarts: Array<{
    source: AudioBufferSourceNode;
    startAt: number;
    stopAt: number | null;
  }> = [
    {
      source,
      startAt: now,
      stopAt:
        playbackDurationSeconds + 0.0001 <
        decoded.duration / playbackRateRatio
          ? now + playbackDurationSeconds
          : null,
    },
  ];
  let completionSource: AudioScheduledSourceNode = source;
  let completionEndAt = now + playbackDurationSeconds;
  for (const voice of voiceEffect.parallelVoices) {
    const delayModulationFrequencyHz = voice.delayModulationFrequencyHz ?? 0;
    const delayModulationDepthSeconds = voice.delayModulationDepthSeconds ?? 0;
    if (delayModulationFrequencyHz > 0 && delayModulationDepthSeconds !== 0) {
      const delay = context.createDelay();
      const parallelGain = context.createGain();
      const oscillator = context.createOscillator();
      const modulation = context.createGain();
      const maximumDelaySeconds =
        voice.delaySeconds + Math.abs(delayModulationDepthSeconds);
      delay.delayTime.setValueAtTime(voice.delaySeconds, now);
      parallelGain.gain.value = voice.gain;
      oscillator.type = "sine";
      oscillator.frequency.value = delayModulationFrequencyHz;
      modulation.gain.value = delayModulationDepthSeconds;
      oscillator.connect(modulation).connect(delay.delayTime);
      (primaryVoice.transform ?? source)
        .connect(delay)
        .connect(parallelGain)
        .connect(highpass);
      const endAt = now + playbackDurationSeconds + maximumDelaySeconds;
      oscillator.start(now);
      oscillator.stop(endAt);
      scheduled.push(oscillator);
      if (endAt > completionEndAt) {
        completionSource = oscillator;
        completionEndAt = endAt;
      }
      continue;
    }
    const startAt = now + voice.delaySeconds;
    const parallelVoice = createSpeechSource(startAt, voice.detuneCents);
    const parallelSource = parallelVoice.source;
    const parallelGain = context.createGain();
    parallelGain.gain.value = voice.gain;
    if (parallelVoice.transform) {
      parallelSource.connect(parallelVoice.transform).connect(parallelGain);
      scheduled.push(parallelVoice.transform);
    } else {
      parallelSource.connect(parallelGain);
    }
    parallelGain.connect(highpass);
    scheduled.push(parallelSource);
    const naturalEndAt = startAt + decoded.duration / playbackRateRatio;
    const endAt = Math.min(
      naturalEndAt,
      args.maxDurationMs && args.maxDurationMs > 0
        ? now + args.maxDurationMs / 1_000
        : Number.POSITIVE_INFINITY,
    );
    speechStarts.push({
      source: parallelSource,
      startAt,
      stopAt: endAt + 0.0001 < naturalEndAt ? endAt : null,
    });
    if (endAt > completionEndAt) {
      completionSource = parallelSource;
      completionEndAt = endAt;
    }
  }
  for (const event of args.roboticPlan?.accents ?? []) {
    const oscillator = context.createOscillator();
    const accentGain = context.createGain();
    const accentFilter = context.createBiquadFilter();
    const startAt = now + Math.max(0, Math.min(1, event.atRatio)) * playbackDurationSeconds;
    const endAt = Math.min(
      now + playbackDurationSeconds,
      startAt + Math.max(0.008, event.durationMs / 1000)
    );
    if (endAt <= startAt) continue;
    oscillator.type = event.waveform;
    oscillator.frequency.setValueAtTime(event.frequencyHz, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, event.endFrequencyHz),
      endAt
    );
    accentFilter.type = "bandpass";
    accentFilter.frequency.value = Math.min(3200, Math.max(280, event.frequencyHz));
    accentFilter.Q.value = 1.4;
    accentGain.gain.setValueAtTime(0, startAt);
    accentGain.gain.linearRampToValueAtTime(event.gain, startAt + 0.003);
    accentGain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(accentFilter).connect(accentGain).connect(outputGain);
    oscillator.start(startAt);
    oscillator.stop(endAt);
    scheduled.push(oscillator);
  }
  if (args.effectsEnabled && args.roboticPlan && args.roboticPlan.buzzDepth > 0) {
    const oscillator = context.createOscillator();
    const modulation = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = args.roboticPlan.buzzFrequencyHz;
    modulation.gain.value = args.roboticPlan.buzzDepth;
    oscillator.connect(modulation).connect(speechGain.gain);
    oscillator.start(now);
    oscillator.stop(now + playbackDurationSeconds);
    scheduled.push(oscillator);
  }
  if (args.effectsEnabled && voiceEffect.modulationDepth > 0) {
    const oscillator = context.createOscillator();
    const modulation = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = voiceEffect.modulationFrequencyHz;
    modulation.gain.value = voiceEffect.modulationDepth;
    oscillator.connect(modulation).connect(speechGain.gain);
    oscillator.start(now);
    oscillator.stop(completionEndAt);
    scheduled.push(oscillator);
  }
  if (texture.noise > 0 || voiceEffect.noiseGain > 0) {
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = createNoiseBuffer(
      context,
      Math.max(0.25, completionEndAt - now),
      `${args.seed}:noise`,
    );
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.55;
    noiseGain.gain.value = texture.noise * 0.075 + voiceEffect.noiseGain;
    noise.connect(noiseFilter).connect(noiseGain).connect(outputGain);
    noise.start(now);
    noise.stop(completionEndAt);
    scheduled.push(noise);
  }
  if (texture.instability > 0) {
    const oscillator = context.createOscillator();
    const modulation = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 2.2 + stableUnit(`${args.seed}:wow`) * 4.1;
    modulation.gain.value = texture.instability * 0.12;
    oscillator.connect(modulation).connect(speechGain.gain);
    oscillator.start(now);
    oscillator.stop(now + playbackDurationSeconds);
    scheduled.push(oscillator);
  }
  active.nodes = scheduled;
  active.roomConnection = roomConnection;
  active.outputGain = outputGain;
  active.lightMeter = lightMeter;
  await new Promise<void>((resolve) => {
    let progress: VoicePlaybackProgressController | null = null;
    let endTimer: number | null = null;
    let completedTailTimer: number | null = null;
    let completedTailClosed = false;
    let settled = false;
    const closeCompletedTail = (hardStop: boolean) => {
      if (completedTailClosed) return;
      completedTailClosed = true;
      if (completedTailTimer !== null) {
        window.clearTimeout(completedTailTimer);
        completedTailTimer = null;
      }
      completedVoiceTailStops[channel].delete(stopCompletedTail);
      for (const node of scheduled) {
        if (hardStop) {
          try {
            if ("stop" in node && typeof node.stop === "function") node.stop();
          } catch {
            /* already stopped */
          }
        }
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      if (hardStop) roomConnection.disconnect();
      else roomConnection.release();
    };
    const stopCompletedTail = () => closeCompletedTail(true);
    const releaseCompletedTail = () => closeCompletedTail(false);
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (endTimer !== null) window.clearTimeout(endTimer);
      endTimer = null;
      if (completed) progress?.finish();
      else progress?.cancel();
      if (active.progress === progress) active.progress = null;
      progress = null;
      if (active.resolve === cancel) active.resolve = null;
      const ownsChannel = active.nodes === scheduled;
      if (ownsChannel) active.nodes = [];
      if (active.outputGain === outputGain) active.outputGain = null;
      lightMeter?.stop();
      if (active.lightMeter === lightMeter) active.lightMeter = null;
      if (active.releaseTimer !== null && ownsChannel) {
        window.clearTimeout(active.releaseTimer);
        active.releaseTimer = null;
      }
      if (completed) {
        // Completed speech leaves active ownership immediately, while its
        // rendered tail remains explicitly stoppable by interruption or
        // navigation. A natural next voice does not stop this bounded tail.
        if (active.roomConnection === roomConnection) {
          active.roomConnection = null;
        }
        completedVoiceTailStops[channel].add(stopCompletedTail);
        completedTailTimer = window.setTimeout(
          releaseCompletedTail,
          VOICE_COMPLETED_OVERLAP_TAIL_MS,
        );
        args.lifecycle?.onEnd?.();
      } else {
        closeCompletedTail(true);
        args.lifecycle?.onCancel?.();
      }
      resolve();
    };
    const cancel = () => finish(false);
    active.resolve = cancel;
    completionSource.addEventListener(
      "ended",
      () => {
        if (settled) return;
        const delayMs = Math.max(lifecycleOutputLatencyMs, tailFlushMs);
        if (delayMs > 0) {
          endTimer = window.setTimeout(() => finish(true), delayMs);
          return;
        }
        finish(true);
      },
      { once: true },
    );
    for (const speechStart of speechStarts) {
      speechStart.source.start(speechStart.startAt);
      // Let ordinary speech reach the AudioBuffer's true natural end. An
      // explicit stop is only for a caller-supplied short-clip ceiling.
      if (speechStart.stopAt !== null) {
        speechStart.source.stop(speechStart.stopAt);
      }
    }
    progress = beginVoicePlaybackProgress(
      args.lifecycle,
      lifecycleArticulationDurationMs,
      () => (context.currentTime - playbackClockStartedAt) * 1000,
      playbackAlignment,
      {
        startDelayMs: scheduledStartDelayMs + lifecycleOutputLatencyMs,
        holdAtEndUntilFinish: true,
      },
    );
    active.progress = progress;
  });
  return true;
}

let activeBodilyFoleyStop: (() => void) | null = null;

/** Stop any in-flight bodily Foley routed through the vocal FX bus. */
export function stopBodilyFoleyThroughVoiceBus(): void {
  activeBodilyFoleyStop?.();
  activeBodilyFoleyStop = null;
}

/**
 * Play short bodily Foley (fart/burp/cough) through the same vocal FX coloring
 * as speech when effects are on; otherwise dry through Prism master out so
 * faithful replay still captures it.
 */
export async function playBodilyFoleyThroughVoiceBus(args: {
  urls: readonly string[];
  gains: readonly number[];
  profile: BotAudioVoiceProfileV1;
  effectsEnabled: boolean;
  voiceVolume: number;
  playbackRate?: number;
}): Promise<boolean> {
  if (args.urls.length === 0 || args.urls.length !== args.gains.length) {
    return false;
  }
  const context = contextForPlayback();
  if (!context || !(await prepareRealtimeVoiceAudio())) return false;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const volume = Math.min(
    1.25,
    Math.max(0, args.voiceVolume) * Math.min(1.25, profile.volume),
  );
  if (volume <= 0) return true;

  const buffers: AudioBuffer[] = [];
  for (const url of args.urls) {
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "force-cache",
      });
      if (!response.ok) return false;
      const bytes = await response.arrayBuffer();
      buffers.push(await context.decodeAudioData(bytes.slice(0)));
    } catch {
      return false;
    }
  }

  stopBodilyFoleyThroughVoiceBus();

  const voiceEffect = resolveVoiceEffectPlan(
    args.effectsEnabled
      ? normalizeVoiceEffect(profile.elevenLabsEffect)
      : "clean",
  );
  const now = context.currentTime;
  const playbackRate = Math.max(0.5, Math.min(2, args.playbackRate ?? 1));
  const mixGain = context.createGain();
  mixGain.gain.value = 1;
  const sources: AudioBufferSourceNode[] = [];
  let longestSeconds = 0;
  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = buffers[index]!;
    const gainValue = Math.max(0, args.gains[index] ?? 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const clipGain = context.createGain();
    clipGain.gain.value = gainValue;
    source.connect(clipGain).connect(mixGain);
    sources.push(source);
    longestSeconds = Math.max(longestSeconds, buffer.duration / playbackRate);
  }

  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const shaper = context.createWaveShaper();
  const speechGain = context.createGain();
  const outputGain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  highpass.type = "highpass";
  highpass.frequency.value = Math.max(voiceEffect.highpassHz, 40);
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(voiceEffect.lowpassHz, 20_000);
  shaper.curve = distortionCurve(voiceEffect.drive, voiceEffect.bitDepth);
  shaper.oversample = "2x";
  speechGain.gain.value = voiceEffect.modulationBaseGain;
  outputGain.gain.value =
    Math.min(0.48, volume * 0.42) * voiceEffect.outputTrim * voiceEffect.dryGain;
  limiter.threshold.value = -4;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  const applyColoredPath =
    args.effectsEnabled && profile.elevenLabsEffect !== "clean";
  if (applyColoredPath) {
    mixGain
      .connect(highpass)
      .connect(lowpass)
      .connect(shaper)
      .connect(speechGain);
  } else {
    mixGain.connect(speechGain);
  }
  speechGain.connect(outputGain).connect(limiter);

  if (applyColoredPath) {
    for (const voice of voiceEffect.parallelVoices) {
      const delay = context.createDelay();
      const parallelGain = context.createGain();
      delay.delayTime.value = voice.delaySeconds;
      parallelGain.gain.value = voice.gain;
      mixGain.connect(delay).connect(parallelGain).connect(highpass);
    }
  }

  const roomConnection = connectRoomAcoustics({
    context,
    input: limiter,
    destination: prismAudioOutputNode(context),
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
    }
    roomConnection.disconnect();
    if (activeBodilyFoleyStop === cleanup) activeBodilyFoleyStop = null;
  };
  activeBodilyFoleyStop = cleanup;

  await new Promise<void>((resolve) => {
    let remaining = sources.length;
    const onEnded = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        cleanup();
        resolve();
      }
    };
    for (const source of sources) {
      source.addEventListener("ended", onEnded, { once: true });
      source.start(now);
      source.stop(now + longestSeconds + 0.05);
    }
    window.setTimeout(
      () => {
        cleanup();
        resolve();
      },
      Math.ceil((longestSeconds + 0.2) * 1000),
    );
  });
  return true;
}

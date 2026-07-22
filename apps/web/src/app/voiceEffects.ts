import {
  BOT_VOICE_HIGH_SHELF_HZ,
  BOT_VOICE_LOW_SHELF_HZ,
  normalizeBotAudioVoiceProfileV1,
  normalizeVoiceEffect,
  expectedVoicePlaybackDurationMs,
  resolveBotVoiceCharacter,
  resolveVoicePlaybackTransform,
  type BotAudioVoiceProfileV1,
  type CoffeeVoiceDeliveryEnvelope,
  type VoiceEffect,
} from "@localai/shared";
import {
  connectRoomAcoustics,
  type RoomAcousticsConnection,
  type RoomAcousticsSend,
} from "./roomAcoustics.ts";
import type { PreSpeechBreathPlan } from "./preSpeechBreath.ts";
import {
  PRISM_VOICE_PITCH_CORRECTION,
  analyzePrismPitchCorrection,
  voicePitchCorrectionCentsAt,
  type VoicePitchCorrectionPlan,
} from "./voicePitchCorrection.ts";

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
}

export interface VoicePlaybackLifecycle {
  /** Temporary per-utterance delivery changes. V1 accepts the neutral envelope only. */
  deliveryEnvelope?: CoffeeVoiceDeliveryEnvelope;
  onStart?: (
    durationMs: number | null,
    alignment?: VoicePlaybackCharacterAlignment | null
  ) => void;
  /** Audio-clock progress used to keep visible speech and mouth motion aligned. */
  onProgress?: (elapsedMs: number, durationMs: number) => void;
  onEnd?: () => void;
}

export interface VoicePlaybackProgressController {
  finish: () => void;
  cancel: () => void;
}

export interface VoicePlaybackProgressOptions {
  /** Delay the visible lifecycle until rendered audio is expected to reach the device. */
  startDelayMs?: number;
}

const VOICE_OUTPUT_LATENCY_MAX_MS = 250;

export function estimateVoiceOutputLatencyMs(
  context: Pick<AudioContext, "baseLatency" | "currentTime"> &
    Partial<Pick<AudioContext, "getOutputTimestamp" | "outputLatency">>,
  performanceNowMs =
    typeof performance === "undefined" ? 0 : performance.now(),
): number {
  const fallbackSeconds = Math.max(
    Number.isFinite(context.baseLatency) ? context.baseLatency : 0,
    Number.isFinite(context.outputLatency) ? (context.outputLatency ?? 0) : 0,
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
  return Math.round(
    Math.min(
      VOICE_OUTPUT_LATENCY_MAX_MS,
      Math.max(fallbackSeconds, measuredSeconds) * 1_000,
    ),
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
  let frame: number | null = null;
  let startTimer: number | null = null;
  let active = true;
  let started = false;
  const report = (elapsedMs: number) => {
    lifecycle?.onProgress?.(
      Math.min(normalizedDurationMs, Math.max(0, elapsedMs)),
      normalizedDurationMs
    );
  };
  const tick = () => {
    if (!active || !started) return;
    report(currentElapsedMs() - startDelayMs);
    frame = window.requestAnimationFrame(tick);
  };
  const start = () => {
    if (!active || started) return;
    started = true;
    startTimer = null;
    lifecycle?.onStart?.(normalizedDurationMs, alignment);
    report(0);
    if (lifecycle?.onProgress) frame = window.requestAnimationFrame(tick);
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
  };
  return {
    cancel,
    finish: () => {
      if (!active) return;
      if (started) report(normalizedDurationMs);
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

function createNoiseBuffer(context: AudioContext, durationSeconds: number, seed: string): AudioBuffer {
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
  | "presence"
  | "reaction"
  | "crosstalk";

type FormantCorrectionNodeLike = AudioNode & {
  pitch: AudioParam;
  playbackRate: AudioParam;
  formantStrength: AudioParam;
};

let formantCorrectionRegistration: Promise<
  (new (options: { context: AudioContext; outputChannelCount?: 1 | 2 }) => FormantCorrectionNodeLike) | null
> | null = null;
let formantCorrectionContext: AudioContext | null = null;

/** The copied MPL processor is deliberately a public asset: AudioWorklet
 * modules are fetched by the browser rather than bundled into Next's normal
 * client graph. A failed registration leaves tempo intact and pitch neutral. */
async function formantCorrectionNodeConstructor(
  context: AudioContext,
): Promise<(new (options: { context: AudioContext; outputChannelCount?: 1 | 2 }) => FormantCorrectionNodeLike) | null> {
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
        context,
        "/worklets/formant-correction-processor.js",
      );
      return FormantCorrectionNode as unknown as new (options: {
        context: AudioContext;
        outputChannelCount?: 1 | 2;
      }) => FormantCorrectionNodeLike;
    })
    .catch(() => null);
  return formantCorrectionRegistration;
}

interface ActiveVoiceChannelState {
  nodes: AudioNode[];
  resolve: (() => void) | null;
  progress: VoicePlaybackProgressController | null;
  roomConnection: RoomAcousticsConnection | null;
}

const activeVoiceChannels: Record<
  VoicePlaybackChannel,
  ActiveVoiceChannelState
> = {
  primary: { nodes: [], resolve: null, progress: null, roomConnection: null },
  presence: { nodes: [], resolve: null, progress: null, roomConnection: null },
  reaction: { nodes: [], resolve: null, progress: null, roomConnection: null },
  crosstalk: { nodes: [], resolve: null, progress: null, roomConnection: null },
};

const preSpeechBreathBufferCache = new Map<string, Promise<AudioBuffer | null>>();

function contextForPlayback(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  if (audioContext?.state === "closed") audioContext = null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export async function prepareRealtimeVoiceAudio(): Promise<boolean> {
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
    await formantCorrectionNodeConstructor(context);
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
}): Promise<boolean> {
  if (!args.plan) return false;
  const context = contextForPlayback();
  if (!context || !await prepareRealtimeVoiceAudio()) return false;
  if (args.isCurrent && !args.isCurrent()) return true;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!profile.enabled || profile.volume <= 0) return false;
  const decoded = await loadPreSpeechBreathBuffer(context, args.plan.url);
  if (!decoded || (args.isCurrent && !args.isCurrent())) return Boolean(decoded);

  const active = activeVoiceChannels.presence;
  stopRealtimeVoiceAudio("presence");
  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = decoded;
  highpass.type = "highpass";
  highpass.frequency.value = 90;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 12_000;
  const breathGain = Math.min(1.25, profile.volume) * args.plan.gain;
  const startedAt = context.currentTime;
  const overlapSeconds = Math.min(
    decoded.duration * 0.35,
    Math.max(0, args.plan.voiceOverlapMs) / 1_000,
  );
  const voiceStartsAt = Math.max(startedAt, startedAt + decoded.duration - overlapSeconds);
  gain.gain.setValueAtTime(breathGain, startedAt);
  gain.gain.setValueAtTime(breathGain, voiceStartsAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + decoded.duration);
  source.connect(highpass).connect(lowpass).connect(gain);
  active.roomConnection = connectRoomAcoustics({
    context,
    input: gain,
    destination: context.destination,
    send: args.roomAcoustics,
    stereoPan: args.stereoPan,
  });
  const scheduled: AudioScheduledSourceNode[] = [source];
  active.nodes = scheduled;

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
      source.start(startedAt);
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
): void {
  const active = activeVoiceChannels[channel];
  active.progress?.cancel();
  active.progress = null;
  for (const node of active.nodes) {
    try {
      if ("stop" in node && typeof node.stop === "function") node.stop();
    } catch { /* already stopped */ }
    try { node.disconnect(); } catch { /* already disconnected */ }
  }
  active.nodes = [];
  active.roomConnection?.disconnect();
  active.roomConnection = null;
  active.resolve?.();
  active.resolve = null;
}

export function stopReactionVoiceAudio(): void {
  stopRealtimeVoiceAudio("reaction");
  stopRealtimeVoiceAudio("crosstalk");
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
  /** Optional hard ceiling for short secondary clips such as backchannels. */
  maxDurationMs?: number;
  /** Prevents an older asynchronous decode from replacing newer playback. */
  isCurrent?: () => boolean;
  /** Keep visible speech on the device-output clock instead of the render clock. */
  compensateLifecycleForOutputLatency?: boolean;
}): Promise<boolean> {
  const context = contextForPlayback();
  if (!context || !await prepareRealtimeVoiceAudio()) return false;
  if (args.isCurrent && !args.isCurrent()) return true;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!profile.enabled || profile.volume <= 0) return true;
  const decoded = await context.decodeAudioData(args.bytes.slice(0));
  if (args.isCurrent && !args.isCurrent()) return true;
  const channel = args.channel ?? "primary";
  const active = activeVoiceChannels[channel];
  stopRealtimeVoiceAudio(channel);
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
  const playbackDurationMs = Math.min(
    expectedVoicePlaybackDurationMs(decoded.duration * 1000, profile),
    args.maxDurationMs && args.maxDurationMs > 0
      ? args.maxDurationMs
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
          voiceLiltDetuneCents(profile.lilt, elapsedSeconds),
      })
    : [];
  const FormantCorrectionNode = await formantCorrectionNodeConstructor(context);
  // Worklet registration can take long enough for a timestamp captured before
  // the await to become stale. Anchor both source scheduling and the visible
  // lifecycle to the live audio clock so neither starts ahead nor cuts short.
  const now = context.currentTime;
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
    node.formantStrength.setValueAtTime(1, startAt);
    const basePitchCents = (args.detuneCents ?? transform.pitchCents) + effectDetuneCents;
    const pitchAutomationTimes = new Set<number>([0]);
    if (profile.lilt !== 0) {
      const contourStep = 0.32;
      for (let at = contourStep; at < playbackDurationSeconds; at += contourStep) {
        pitchAutomationTimes.add(at);
      }
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
  const limiter = context.createDynamicsCompressor();
  const voiceCharacter = resolveBotVoiceCharacter(profile);
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
    (channel === "primary" ? 1 : 0.62);
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = BOT_VOICE_LOW_SHELF_HZ;
  lowShelf.gain.value = voiceCharacter.lowShelfDb;
  highShelf.type = "highshelf";
  highShelf.frequency.value = BOT_VOICE_HIGH_SHELF_HZ;
  highShelf.gain.value = voiceCharacter.highShelfDb;
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
  outputGain.connect(lowShelf).connect(highShelf).connect(limiter);
  const roomConnection = connectRoomAcoustics({
    context,
    input: limiter,
    destination: context.destination,
    send: args.roomAcoustics,
    stereoPan: args.stereoPan,
  });

  for (const event of buildVoiceDamageSchedule(args.seed, playbackDurationMs, texture.damage)) {
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
    stopAt: number;
  }> = [{ source, startAt: now, stopAt: now + playbackDurationSeconds }];
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
    const endAt = Math.min(
      startAt + decoded.duration / playbackRateRatio,
      args.maxDurationMs && args.maxDurationMs > 0
        ? now + args.maxDurationMs / 1_000
        : Number.POSITIVE_INFINITY,
    );
    speechStarts.push({ source: parallelSource, startAt, stopAt: endAt });
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
  await new Promise<void>((resolve) => {
    let progress: VoicePlaybackProgressController | null = null;
    let endTimer: number | null = null;
    let settled = false;
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
      for (const node of scheduled) {
        try {
          node.disconnect();
        } catch {
          /* no-op */
        }
      }
      if (active.nodes === scheduled) active.nodes = [];
      if (completed) {
        // Completed speech is no longer interruptible. Detach its released
        // room return from the active channel so the next natural turn can
        // begin over the short studio tail instead of hard-disconnecting it.
        if (active.roomConnection === roomConnection) {
          active.roomConnection = null;
        }
        roomConnection.release();
        args.lifecycle?.onEnd?.();
      }
      resolve();
    };
    const cancel = () => finish(false);
    active.resolve = cancel;
    completionSource.addEventListener(
      "ended",
      () => {
        if (settled) return;
        if (lifecycleOutputLatencyMs > 0) {
          endTimer = window.setTimeout(
            () => finish(true),
            lifecycleOutputLatencyMs,
          );
          return;
        }
        finish(true);
      },
      { once: true },
    );
    for (const speechStart of speechStarts) {
      speechStart.source.start(speechStart.startAt);
      speechStart.source.stop(speechStart.stopAt);
    }
    progress = beginVoicePlaybackProgress(
      args.lifecycle,
      playbackDurationMs,
      () => (context.currentTime - now) * 1000,
      args.alignment,
      { startDelayMs: lifecycleOutputLatencyMs },
    );
    active.progress = progress;
  });
  return true;
}

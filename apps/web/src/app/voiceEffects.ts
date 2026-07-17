import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type CoffeeVoiceDeliveryEnvelope,
  type ElevenLabsVoiceEffect,
} from "@localai/shared";

export interface ElevenLabsVoiceEffectPlan {
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
  parallelVoices: Array<{
    delaySeconds: number;
    detuneCents: number;
    gain: number;
    delayModulationFrequencyHz?: number;
    delayModulationDepthSeconds?: number;
  }>;
}

export function resolveElevenLabsVoiceEffectPlan(
  effect: ElevenLabsVoiceEffect
): ElevenLabsVoiceEffectPlan {
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

export function beginVoicePlaybackProgress(
  lifecycle: VoicePlaybackLifecycle | undefined,
  durationMs: number,
  currentElapsedMs: () => number,
  alignment?: VoicePlaybackCharacterAlignment | null
): VoicePlaybackProgressController {
  const normalizedDurationMs = Math.max(1, Math.round(durationMs));
  let frame: number | null = null;
  let active = true;
  const report = (elapsedMs: number) => {
    lifecycle?.onProgress?.(
      Math.min(normalizedDurationMs, Math.max(0, elapsedMs)),
      normalizedDurationMs
    );
  };
  const tick = () => {
    if (!active) return;
    report(currentElapsedMs());
    frame = window.requestAnimationFrame(tick);
  };
  lifecycle?.onStart?.(normalizedDurationMs, alignment);
  report(0);
  if (lifecycle?.onProgress) frame = window.requestAnimationFrame(tick);
  const cancel = () => {
    if (!active) return;
    active = false;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
  return {
    cancel,
    finish: () => {
      if (!active) return;
      report(normalizedDurationMs);
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
export type VoicePlaybackChannel = "primary" | "reaction";

interface ActiveVoiceChannelState {
  nodes: AudioScheduledSourceNode[];
  resolve: (() => void) | null;
  progress: VoicePlaybackProgressController | null;
}

const activeVoiceChannels: Record<VoicePlaybackChannel, ActiveVoiceChannelState> = {
  primary: { nodes: [], resolve: null, progress: null },
  reaction: { nodes: [], resolve: null, progress: null },
};

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
  return context.state === "running";
}

export function stopRealtimeVoiceAudio(
  channel: VoicePlaybackChannel = "primary",
): void {
  const active = activeVoiceChannels[channel];
  active.progress?.cancel();
  active.progress = null;
  for (const node of active.nodes) {
    try { node.stop(); } catch { /* already stopped */ }
    try { node.disconnect(); } catch { /* already disconnected */ }
  }
  active.nodes = [];
  active.resolve?.();
  active.resolve = null;
}

export function stopReactionVoiceAudio(): void {
  stopRealtimeVoiceAudio("reaction");
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
  elevenLabsEffect?: ElevenLabsVoiceEffect;
  /** Independent listener reactions never cancel or complete primary speech. */
  channel?: VoicePlaybackChannel;
  /** Optional hard ceiling for short secondary clips such as backchannels. */
  maxDurationMs?: number;
  /** Prevents an older asynchronous decode from replacing newer playback. */
  isCurrent?: () => boolean;
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
  const elevenLabsEffect = resolveElevenLabsVoiceEffectPlan(
    args.effectsEnabled ? args.elevenLabsEffect ?? "clean" : "clean"
  );
  const now = context.currentTime;
  const playbackRateRatio = 2 ** ((args.detuneCents ?? 0) / 1200);
  const playbackDurationSeconds = Math.min(
    decoded.duration / playbackRateRatio,
    args.maxDurationMs && args.maxDurationMs > 0
      ? args.maxDurationMs / 1_000
      : Number.POSITIVE_INFINITY,
  );
  const playbackDurationMs = Math.max(1, Math.round(playbackDurationSeconds * 1000));
  const createSpeechSource = (
    startAt: number,
    effectDetuneCents = 0,
  ): AudioBufferSourceNode => {
    const speechSource = context.createBufferSource();
    speechSource.buffer = decoded;
    const baseDetuneCents = (args.detuneCents ?? 0) + effectDetuneCents;
    speechSource.detune.setValueAtTime(baseDetuneCents, startAt);
    if (profile.lilt !== 0) {
      const contourStep = 0.32;
      for (let at = contourStep; at < decoded.duration; at += contourStep) {
        const cents = baseDetuneCents + voiceLiltDetuneCents(profile.lilt, at);
        speechSource.detune.linearRampToValueAtTime(cents, startAt + at);
      }
    }
    return speechSource;
  };
  const source = createSpeechSource(now);

  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const shaper = context.createWaveShaper();
  const dryGain = context.createGain();
  const speechGain = context.createGain();
  const outputGain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  highpass.type = "highpass";
  highpass.frequency.value = Math.max(
    elevenLabsEffect.highpassHz,
    25 + (1 - texture.bandwidth) * 300
  );
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(
    args.baseLowpassHz ?? 20_000,
    args.roboticPlan?.lowpassHz ?? 20_000,
    elevenLabsEffect.lowpassHz,
    20_000 - (1 - texture.bandwidth) * 16_200
  );
  shaper.curve = distortionCurve(
    Math.max(texture.distortion, args.roboticPlan?.drive ?? 0, elevenLabsEffect.drive),
    Math.min(args.roboticPlan?.bitDepth ?? 16, elevenLabsEffect.bitDepth),
  );
  shaper.oversample = "2x";
  dryGain.gain.value = elevenLabsEffect.dryGain;
  speechGain.gain.value = elevenLabsEffect.modulationBaseGain;
  outputGain.gain.value =
    Math.min(1.25, profile.volume) *
    0.88 *
    elevenLabsEffect.outputTrim *
    (channel === "reaction" ? 0.62 : 1);
  limiter.threshold.value = args.cleanRoboticCarrier ? -0.5 : -4;
  limiter.knee.value = args.cleanRoboticCarrier ? 0 : 8;
  limiter.ratio.value = args.cleanRoboticCarrier ? 20 : 12;
  limiter.attack.value = args.cleanRoboticCarrier ? 0.001 : 0.003;
  limiter.release.value = args.cleanRoboticCarrier ? 0.04 : 0.12;
  source.connect(dryGain).connect(highpass).connect(lowpass);
  if (args.cleanRoboticCarrier) {
    lowpass.connect(speechGain);
  } else {
    lowpass.connect(shaper).connect(speechGain);
  }
  speechGain.connect(outputGain).connect(limiter).connect(context.destination);

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

  const scheduled: AudioScheduledSourceNode[] = [source];
  const speechStarts: Array<{
    source: AudioBufferSourceNode;
    startAt: number;
    stopAt: number;
  }> = [{ source, startAt: now, stopAt: now + playbackDurationSeconds }];
  let completionSource: AudioScheduledSourceNode = source;
  let completionEndAt = now + playbackDurationSeconds;
  for (const voice of elevenLabsEffect.parallelVoices) {
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
      source.connect(delay).connect(parallelGain).connect(highpass);
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
    const parallelSource = createSpeechSource(startAt, voice.detuneCents);
    const parallelGain = context.createGain();
    parallelGain.gain.value = voice.gain;
    parallelSource.connect(parallelGain).connect(highpass);
    scheduled.push(parallelSource);
    const rateRatio = 2 ** (
      ((args.detuneCents ?? 0) + voice.detuneCents) / 1200
    );
    const endAt = Math.min(
      startAt + decoded.duration / rateRatio,
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
  if (args.effectsEnabled && elevenLabsEffect.modulationDepth > 0) {
    const oscillator = context.createOscillator();
    const modulation = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = elevenLabsEffect.modulationFrequencyHz;
    modulation.gain.value = elevenLabsEffect.modulationDepth;
    oscillator.connect(modulation).connect(speechGain.gain);
    oscillator.start(now);
    oscillator.stop(completionEndAt);
    scheduled.push(oscillator);
  }
  if (texture.noise > 0 || elevenLabsEffect.noiseGain > 0) {
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
    noiseGain.gain.value = texture.noise * 0.075 + elevenLabsEffect.noiseGain;
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
  await new Promise<void>((resolve) => {
    let progress: VoicePlaybackProgressController | null = null;
    active.resolve = resolve;
    completionSource.addEventListener("ended", () => {
      progress?.finish();
      if (active.progress === progress) active.progress = null;
      progress = null;
      if (active.resolve === resolve) active.resolve = null;
      for (const node of scheduled) {
        try { node.disconnect(); } catch { /* no-op */ }
      }
      if (active.nodes === scheduled) active.nodes = [];
      args.lifecycle?.onEnd?.();
      resolve();
    }, { once: true });
    for (const speechStart of speechStarts) {
      speechStart.source.start(speechStart.startAt);
      speechStart.source.stop(speechStart.stopAt);
    }
    progress = beginVoicePlaybackProgress(
      args.lifecycle,
      playbackDurationMs,
      () => (context.currentTime - now) * 1000,
      args.alignment
    );
    active.progress = progress;
  });
  return true;
}

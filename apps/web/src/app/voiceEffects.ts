import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type CoffeeVoiceDeliveryEnvelope,
} from "@localai/shared";

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

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 28;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
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
let activeNodes: AudioScheduledSourceNode[] = [];
let activeResolve: (() => void) | null = null;
let activeProgress: VoicePlaybackProgressController | null = null;

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

export function stopRealtimeVoiceAudio(): void {
  activeProgress?.cancel();
  activeProgress = null;
  for (const node of activeNodes) {
    try { node.stop(); } catch { /* already stopped */ }
    try { node.disconnect(); } catch { /* already disconnected */ }
  }
  activeNodes = [];
  activeResolve?.();
  activeResolve = null;
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
}): Promise<boolean> {
  const context = contextForPlayback();
  if (!context || !await prepareRealtimeVoiceAudio()) return false;
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!profile.enabled || profile.volume <= 0) return true;
  const decoded = await context.decodeAudioData(args.bytes.slice(0));
  stopRealtimeVoiceAudio();
  const texture = resolveVoiceTexture(profile, args.effectsEnabled);
  const now = context.currentTime;
  const playbackRateRatio = 2 ** ((args.detuneCents ?? 0) / 1200);
  const playbackDurationSeconds = decoded.duration / playbackRateRatio;
  const playbackDurationMs = Math.max(1, Math.round(playbackDurationSeconds * 1000));
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.detune.setValueAtTime(args.detuneCents ?? 0, now);
  if (profile.lilt !== 0) {
    const contourStep = 0.32;
    for (let at = contourStep; at < decoded.duration; at += contourStep) {
      const cents = (args.detuneCents ?? 0) + voiceLiltDetuneCents(profile.lilt, at);
      source.detune.linearRampToValueAtTime(cents, now + at);
    }
  }

  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const shaper = context.createWaveShaper();
  const speechGain = context.createGain();
  const outputGain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  highpass.type = "highpass";
  highpass.frequency.value = 25 + (1 - texture.bandwidth) * 300;
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(
    args.baseLowpassHz ?? 20_000,
    20_000 - (1 - texture.bandwidth) * 16_200
  );
  shaper.curve = distortionCurve(texture.distortion);
  shaper.oversample = "2x";
  speechGain.gain.value = 1;
  outputGain.gain.value = Math.min(1.25, profile.volume) * 0.88;
  limiter.threshold.value = -4;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  source.connect(highpass).connect(lowpass).connect(shaper).connect(speechGain).connect(outputGain).connect(limiter).connect(context.destination);

  for (const event of buildVoiceDamageSchedule(args.seed, playbackDurationMs, texture.damage)) {
    const at = now + event.atMs / 1000;
    const end = at + event.durationMs / 1000;
    speechGain.gain.setValueAtTime(1, at);
    speechGain.gain.linearRampToValueAtTime(1 - event.depth, at + 0.003);
    speechGain.gain.setValueAtTime(1 - event.depth, Math.max(at + 0.003, end - 0.004));
    speechGain.gain.linearRampToValueAtTime(1, end);
  }

  const scheduled: AudioScheduledSourceNode[] = [source];
  if (texture.noise > 0) {
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = createNoiseBuffer(context, Math.max(0.25, playbackDurationSeconds), `${args.seed}:noise`);
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.55;
    noiseGain.gain.value = texture.noise * 0.075;
    noise.connect(noiseFilter).connect(noiseGain).connect(outputGain);
    noise.start(now);
    noise.stop(now + playbackDurationSeconds);
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
  activeNodes = scheduled;
  await new Promise<void>((resolve) => {
    let progress: VoicePlaybackProgressController | null = null;
    activeResolve = resolve;
    source.addEventListener("ended", () => {
      progress?.finish();
      if (activeProgress === progress) activeProgress = null;
      progress = null;
      if (activeResolve === resolve) activeResolve = null;
      for (const node of scheduled) {
        try { node.disconnect(); } catch { /* no-op */ }
      }
      if (activeNodes === scheduled) activeNodes = [];
      args.lifecycle?.onEnd?.();
      resolve();
    }, { once: true });
    source.start(now);
    progress = beginVoicePlaybackProgress(
      args.lifecycle,
      playbackDurationMs,
      () => (context.currentTime - now) * 1000,
      args.alignment
    );
    activeProgress = progress;
  });
  return true;
}

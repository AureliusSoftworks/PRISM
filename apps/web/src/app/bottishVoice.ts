import {
  BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  botcastSignalStandardCadenceDurationMs,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  beginVoicePlaybackProgress,
  playPreSpeechBreath,
  playRealtimeVoiceBytes,
  prepareRealtimeVoiceAudio,
  releaseRealtimeVoiceAudio,
  stopRealtimeVoiceAudio,
  voiceReleaseGainAt,
  voiceLiltDetuneCents,
  type VoicePlaybackCharacterAlignment,
  type VoicePlaybackLifecycle,
  type VoiceRoboticPlan,
} from "./voiceEffects.ts";
import type { PreSpeechBreathPlan } from "./preSpeechBreath.ts";
import type { RoomAcousticsSend } from "./roomAcoustics.ts";
import {
  readEnglishVoiceWaveStream,
  readEnglishVoiceSynthesisClip,
  type EnglishVoiceSynthesisClip,
} from "./englishVoice.ts";

export interface BottishNote {
  startMs: number;
  durationMs: number;
  frequencyHz: number;
  endFrequencyHz: number;
  gain: number;
  waveform: OscillatorType;
  lowpassHz: number;
}

export interface BottishPlan {
  notes: BottishNote[];
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment;
}

export interface BottishPlaybackTiming {
  targetDurationMs?: number;
  /** Ephemeral delivery multiplier composed with the authored profile pace. */
  deliveryRate?: number;
  /** Opt-in ceiling for fitting a long robot line into a shorter speech window. */
  maximumCompressionRate?: number;
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;
const BOTTISH_SAMPLE_RATE = 24_000;
const MAX_ROBOT_VOICE_COMPRESSION_RATE = 1.24;

/** Keep the persisted field for profile/back-up compatibility, but do not let
 * legacy or randomized tone values change Bottish gain or processing. */
export const FIXED_BOTTISH_TONE = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1.bottishTone;

export function normalizeBottishPlaybackProfile(
  rawProfile: BotAudioVoiceProfileV1,
): ReturnType<typeof normalizeBotAudioVoiceProfileV1> {
  return {
    ...normalizeBotAudioVoiceProfileV1(rawProfile),
    warmth: 0,
    bottishTone: FIXED_BOTTISH_TONE,
  };
}

/** Fit robot speech to Signal's shared Premium-calibrated cadence without
 * exceeding the hard compression ceiling required for intelligibility. */
export function signalRobotVoiceCadenceTiming(
  text: string,
): BottishPlaybackTiming {
  return {
    targetDurationMs: botcastSignalStandardCadenceDurationMs(text),
    maximumCompressionRate: MAX_ROBOT_VOICE_COMPRESSION_RATE,
  };
}

/** Accept current WAV/timed responses while treating a metadata-only Babble
 * success as a deliberate signal to use procedural fallback. This can
 * occur briefly when the web bundle hot-reloads before the API process. */
export async function readBabbleVoiceSynthesisClip(
  response: Response,
): Promise<EnglishVoiceSynthesisClip | null> {
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.toLowerCase().includes("application/json")) {
    return readEnglishVoiceSynthesisClip(response);
  }
  const payload = (await response.clone().json()) as Record<string, unknown>;
  if (typeof payload.audioBase64 !== "string" || !payload.audioBase64.trim()) {
    return null;
  }
  return readEnglishVoiceSynthesisClip(response);
}

const VOICE_BASES = {
  "voice-1": { frequency: 310, waveform: "sine" as OscillatorType },
  "voice-2": { frequency: 235, waveform: "triangle" as OscillatorType },
  "voice-3": { frequency: 390, waveform: "sine" as OscillatorType },
  "voice-4": { frequency: 180, waveform: "square" as OscillatorType },
  "voice-5": { frequency: 475, waveform: "triangle" as OscillatorType },
  "voice-6": { frequency: 345, waveform: "triangle" as OscillatorType },
  "voice-7": { frequency: 270, waveform: "sine" as OscillatorType },
  "voice-8": { frequency: 205, waveform: "sine" as OscillatorType },
  "voice-9": { frequency: 430, waveform: "triangle" as OscillatorType },
  "voice-10": { frequency: 155, waveform: "square" as OscillatorType },
  "voice-11": { frequency: 515, waveform: "sine" as OscillatorType },
  "voice-12": { frequency: 215, waveform: "triangle" as OscillatorType },
} as const;

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function isSpeakableCharacter(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

export function buildBottishPlan(
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed = text
): BottishPlan {
  const profile = normalizeBottishPlaybackProfile(rawProfile);
  const voice = VOICE_BASES[profile.baseVoiceId];
  const pitchMultiplier = 2 ** ((profile.pitch * 650) / 1200);
  const tone = profile.bottishTone;
  const organicAmount = Math.max(0, -tone);
  const syntheticAmount = Math.max(0, tone);
  const noteMs = Math.round(72 - tone * 18);
  const gapMs = Math.round(10 + ((tone + 1) / 2) * 18);
  const toneRegisterMultiplier = 2 ** ((tone * 5) / 12);
  const syllableSteps = tone < -0.35
    ? [-3, -1, 0, 0, 1, 3]
    : tone > 0.35
      ? [-9, -5, -2, 2, 5, 9]
      : [-5, -2, 0, 2, 4, 7];
  // Tone is a voice-performance control, not an effects control. Keep the
  // oscillator, loudness, and bandwidth stable so moving the slider changes
  // register, melody, articulation, and cadence instead of sounding harsher.
  const waveform = voice.waveform;
  const toneLowpass = 7600;
  const notes: BottishNote[] = [];
  const alignment: VoicePlaybackCharacterAlignment = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  let cursorMs = 0;
  let spokenIndex = 0;

  for (const character of Array.from(text).slice(0, 1200)) {
    const characterStartMs = cursorMs;
    if (!isSpeakableCharacter(character)) {
      if (/[.!?]/.test(character)) cursorMs += noteMs * 2.2;
      else if (/[,;:]/.test(character)) cursorMs += noteMs * 1.15;
      else if (/\s/.test(character)) cursorMs += gapMs * 1.4;
      alignment.characters.push(character);
      alignment.characterStartTimesSeconds.push(characterStartMs / 1000);
      alignment.characterEndTimesSeconds.push(cursorMs / 1000);
      continue;
    }
    if (notes.length >= 420) break;

    const random = stableUnit(`${seed}:${spokenIndex}:${character}`);
    const syllableStep = syllableSteps[Math.floor(random * syllableSteps.length)] ?? 0;
    const liltWave = voiceLiltDetuneCents(
      profile.lilt,
      characterStartMs / 1000,
    ) / 100;
    const organicContour = Math.sin(spokenIndex * 0.42) * organicAmount * 2.8;
    const syntheticContour = ([-3, 4, -1, 3][spokenIndex % 4] ?? 0) * syntheticAmount;
    const frequencyHz = Math.max(
      80,
      Math.min(
        1400,
        voice.frequency *
          pitchMultiplier *
          toneRegisterMultiplier *
          2 ** ((syllableStep + liltWave + organicContour + syntheticContour) / 12)
      )
    );
    const glide = (random - 0.5) * (
      0.04 + organicAmount * 0.18 + Math.abs(profile.lilt) * 0.22
    );
    notes.push({
      startMs: Math.round(cursorMs),
      durationMs: noteMs,
      frequencyHz: Math.round(frequencyHz * 10) / 10,
      endFrequencyHz: Math.round(frequencyHz * (1 + glide) * 10) / 10,
      gain: 0.3,
      waveform,
      lowpassHz: Math.max(4800, Math.min(10_000, toneLowpass)),
    });
    alignment.characters.push(character);
    alignment.characterStartTimesSeconds.push(characterStartMs / 1000);
    alignment.characterEndTimesSeconds.push((characterStartMs + noteMs) / 1000);
    cursorMs += noteMs + gapMs;
    spokenIndex += 1;
  }

  return {
    notes,
    durationMs: notes.length > 0 ? Math.round(cursorMs + 50) : 0,
    alignment,
  };
}

/** Fits procedural Bottish to a visible delivery window. Compression remains
 * opt-in and hard-bounded; ordinary chat/preview callers retain the historical
 * no-speed-up behavior while Signal can approach an English-like live cadence. */
export function fitBottishPlanToDuration(
  plan: BottishPlan,
  targetDurationMs: number | undefined,
  maximumCompressionRate = 1,
): BottishPlan {
  if (
    plan.durationMs <= 0 ||
    typeof targetDurationMs !== "number" ||
    !Number.isFinite(targetDurationMs) ||
    targetDurationMs <= 0
  ) {
    return plan;
  }
  const compressionRate = Math.max(
    1,
    Math.min(
      MAX_ROBOT_VOICE_COMPRESSION_RATE,
      Number.isFinite(maximumCompressionRate) ? maximumCompressionRate : 1,
    ),
  );
  const minimumDurationMs = Math.ceil(plan.durationMs / compressionRate);
  const durationMs = Math.max(
    80,
    minimumDurationMs,
    Math.round(targetDurationMs),
  );
  if (durationMs === plan.durationMs) return plan;
  const scale = durationMs / plan.durationMs;
  const notes = plan.notes.flatMap((note) => {
    const startMs = Math.max(0, Math.round(note.startMs * scale));
    if (startMs >= durationMs) return [];
    return [{
      ...note,
      startMs,
      durationMs: Math.max(
        8,
        Math.min(durationMs - startMs, Math.round(note.durationMs * scale))
      ),
    }];
  });
  return {
    notes,
    durationMs,
    alignment: {
      characters: [...plan.alignment.characters],
      characterStartTimesSeconds: plan.alignment.characterStartTimesSeconds.map(
        (seconds) => seconds * scale
      ),
      characterEndTimesSeconds: plan.alignment.characterEndTimesSeconds.map(
        (seconds) => seconds * scale
      ),
    },
  };
}

export function scaleBottishPlanForDeliveryRate(
  plan: BottishPlan,
  rawDeliveryRate: number | undefined,
): BottishPlan {
  const deliveryRate = typeof rawDeliveryRate === "number" &&
      Number.isFinite(rawDeliveryRate)
    ? Math.max(0.76, Math.min(1.24, rawDeliveryRate))
    : 1;
  if (plan.durationMs <= 0 || Math.abs(deliveryRate - 1) < 0.001) return plan;
  const scale = 1 / deliveryRate;
  return {
    notes: plan.notes.map((note) => ({
      ...note,
      startMs: Math.round(note.startMs * scale),
      durationMs: Math.max(8, Math.round(note.durationMs * scale)),
    })),
    durationMs: Math.max(1, Math.round(plan.durationMs * scale)),
    alignment: {
      characters: [...plan.alignment.characters],
      characterStartTimesSeconds: plan.alignment.characterStartTimesSeconds.map(
        (seconds) => seconds * scale,
      ),
      characterEndTimesSeconds: plan.alignment.characterEndTimesSeconds.map(
        (seconds) => seconds * scale,
      ),
    },
  };
}

export function buildBottishPlaybackPlan(
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed: string,
  timing?: BottishPlaybackTiming,
): BottishPlan {
  const normalizedProfile = normalizeBottishPlaybackProfile(rawProfile);
  const rawDeliveryRate =
    (1 + normalizedProfile.pace * BOT_AUDIO_VOICE_PACE_RATE_DEPTH) *
    (timing?.deliveryRate ?? 1);
  const boundedDeliveryRate = Number.isFinite(rawDeliveryRate)
    ? Math.max(
        1 - BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
        Math.min(1 + BOT_AUDIO_VOICE_PACE_RATE_DEPTH, rawDeliveryRate),
      )
    : 1;
  const planProfile = {
    ...normalizedProfile,
    // Bottish owns its duration in the generated plan, so browser playback
    // cannot apply Pace twice.
    pace: 0,
  };
  const naturalPlan = buildBottishPlan(text, planProfile, seed);
  if ((timing?.maximumCompressionRate ?? 1) > 1) {
    const fittingCompressionRate = Math.min(
      timing?.maximumCompressionRate ?? 1,
      Math.max(1, MAX_ROBOT_VOICE_COMPRESSION_RATE / boundedDeliveryRate),
    );
    return scaleBottishPlanForDeliveryRate(
      fitBottishPlanToDuration(
        naturalPlan,
        timing?.targetDurationMs,
        fittingCompressionRate,
      ),
      boundedDeliveryRate,
    );
  }
  return fitBottishPlanToDuration(
    scaleBottishPlanForDeliveryRate(naturalPlan, boundedDeliveryRate),
    timing?.targetDurationMs,
  );
}

function writeWaveText(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function bottishWaveSample(waveform: OscillatorType, phase: number): number {
  const sine = Math.sin(phase);
  if (waveform === "square") return sine >= 0 ? 1 : -1;
  if (waveform === "triangle") return (2 / Math.PI) * Math.asin(sine);
  if (waveform === "sawtooth") {
    return 2 * ((phase / (2 * Math.PI)) - Math.floor(phase / (2 * Math.PI) + 0.5));
  }
  return sine;
}

/** Render Bottish without a live AudioContext so browsers with a suspended
 * Web Audio engine can fall back to ordinary media playback. */
export function encodeBottishPlanWave(
  plan: BottishPlan,
  sampleRate = BOTTISH_SAMPLE_RATE
): ArrayBuffer {
  const sampleCount = Math.max(1, Math.ceil((plan.durationMs / 1000) * sampleRate));
  const samples = new Float32Array(sampleCount);

  for (const note of plan.notes) {
    const startSample = Math.max(0, Math.floor((note.startMs / 1000) * sampleRate));
    const noteSampleCount = Math.max(1, Math.floor((note.durationMs / 1000) * sampleRate));
    const attackSamples = Math.max(1, Math.floor(0.008 * sampleRate));
    const releaseSamples = Math.max(1, Math.floor(0.012 * sampleRate));
    const filterAlpha = 1 - Math.exp((-2 * Math.PI * note.lowpassHz) / sampleRate);
    const frequencyRatio = Math.max(0.001, note.endFrequencyHz / note.frequencyHz);
    let phase = 0;
    let filtered = 0;

    for (let offset = 0; offset < noteSampleCount; offset += 1) {
      const target = startSample + offset;
      if (target >= samples.length) break;
      const progress = noteSampleCount <= 1 ? 0 : offset / (noteSampleCount - 1);
      const frequency = note.frequencyHz * frequencyRatio ** progress;
      phase += (2 * Math.PI * frequency) / sampleRate;
      const raw = bottishWaveSample(note.waveform, phase);
      filtered += filterAlpha * (raw - filtered);
      const envelope = Math.min(
        1,
        offset / attackSamples,
        (noteSampleCount - offset) / releaseSamples
      );
      samples[target] += filtered * note.gain * Math.max(0, envelope);
    }
  }

  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  writeWaveText(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeWaveText(view, 8, "WAVE");
  writeWaveText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWaveText(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true);
  }
  return output;
}

let activeMedia: HTMLAudioElement | null = null;
let activeMediaUrl: string | null = null;
let activeMediaFadeTimer: number | null = null;
let preparedMedia: HTMLAudioElement | null = null;
let preparedMediaUrl: string | null = null;
let activeTimer: number | null = null;
let activeResolve: (() => void) | null = null;
let generation = 0;
let queue: Promise<void> = Promise.resolve();

export async function prepareBottishVoice(): Promise<void> {
  // A send gesture may already have authorized the fallback media element.
  // Re-preparing after the model reply arrives must reuse that element: Safari
  // will not grant a second autoplay authorization from a passive effect.
  if (preparedMedia) {
    if (await prepareRealtimeVoiceAudio()) releasePreparedMedia();
    return;
  }
  beginMediaUnlock();
  if (await prepareRealtimeVoiceAudio()) {
    releasePreparedMedia();
    return;
  }
  if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Audio playback is unavailable in this browser.");
  }
}

function releasePreparedMedia(): void {
  if (preparedMedia) {
    preparedMedia.pause();
    preparedMedia.removeAttribute("src");
    preparedMedia.load();
    preparedMedia = null;
  }
  if (preparedMediaUrl) {
    URL.revokeObjectURL(preparedMediaUrl);
    preparedMediaUrl = null;
  }
}

function beginMediaUnlock(): void {
  if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") return;
  releasePreparedMedia();
  const silentPlan: BottishPlan = {
    notes: [],
    durationMs: 0,
    alignment: {
      characters: [],
      characterStartTimesSeconds: [],
      characterEndTimesSeconds: [],
    },
  };
  const url = URL.createObjectURL(
    new Blob([encodeBottishPlanWave(silentPlan)], { type: "audio/wav" })
  );
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = 0;
  preparedMedia = audio;
  preparedMediaUrl = url;
  // Start inside the original pointer/keyboard gesture. If Web Audio cannot
  // run, this same authorized element is reused for the audible preview.
  void audio.play().catch(() => undefined);
}

function releaseActiveMedia(keepElement = false): void {
  const media = activeMedia;
  if (activeMediaFadeTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(activeMediaFadeTimer);
    activeMediaFadeTimer = null;
  }
  if (media) {
    media.pause();
    media.removeAttribute("src");
    media.load();
    activeMedia = null;
  }
  if (activeMediaUrl) {
    URL.revokeObjectURL(activeMediaUrl);
    activeMediaUrl = null;
  }
  if (keepElement && media) preparedMedia = media;
}

function stopScheduledNodes(): void {
  releaseActiveMedia();
  if (activeTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(activeTimer);
    activeTimer = null;
  }
  activeResolve?.();
  activeResolve = null;
}

export function stopBottishVoice(
  options: { preservePreparedMedia?: boolean } = {}
): void {
  generation += 1;
  stopRealtimeVoiceAudio();
  stopRealtimeVoiceAudio("presence");
  stopScheduledNodes();
  if (!options.preservePreparedMedia) releasePreparedMedia();
  queue = Promise.resolve();
}

export function releaseBottishVoice(
  options: {
    fadeOutMs?: number;
    preservePreparedMedia?: boolean;
  } = {},
): void {
  generation += 1;
  const fadeOutMs = Math.max(0, Math.round(options.fadeOutMs ?? 160));
  releaseRealtimeVoiceAudio("primary", fadeOutMs);
  stopRealtimeVoiceAudio("presence");
  const media = activeMedia;
  if (!media) {
    if (!options.preservePreparedMedia) releasePreparedMedia();
    return;
  }
  if (activeMediaFadeTimer !== null) {
    window.clearTimeout(activeMediaFadeTimer);
    activeMediaFadeTimer = null;
  }
  const startVolume = media.volume;
  const startedAt = Date.now();
  const finish = (): void => {
    if (activeMedia !== media) return;
    const resolve = activeResolve;
    if (resolve) resolve();
    else releaseActiveMedia(options.preservePreparedMedia === true);
    if (!options.preservePreparedMedia) releasePreparedMedia();
  };
  if (fadeOutMs === 0 || media.paused || startVolume <= 0) {
    finish();
    return;
  }
  const step = (): void => {
    if (activeMedia !== media) return;
    const progress = (Date.now() - startedAt) / fadeOutMs;
    media.volume = voiceReleaseGainAt(startVolume, progress);
    if (progress >= 1) {
      finish();
      return;
    }
    activeMediaFadeTimer = window.setTimeout(step, 16);
  };
  step();
}

async function playPlanWithMedia(
  plan: BottishPlan,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const url = URL.createObjectURL(
    new Blob([encodeBottishPlanWave(plan)], { type: "audio/wav" })
  );
  const audio = preparedMedia ?? new Audio();
  if (preparedMediaUrl) URL.revokeObjectURL(preparedMediaUrl);
  preparedMedia = null;
  preparedMediaUrl = null;
  audio.pause();
  audio.src = url;
  audio.load();
  audio.preload = "auto";
  audio.volume = Math.min(1, normalizeBotAudioVoiceProfileV1(profile).volume);
  audio.preservesPitch = true;
  activeMedia = audio;
  activeMediaUrl = url;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let progress: ReturnType<typeof beginVoicePlaybackProgress> | null = null;
    const beginAudiblePlayback = () => {
      if (started) return;
      started = true;
      const playbackTempo = 1 + normalizeBotAudioVoiceProfileV1(profile).pace *
        BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
      progress = beginVoicePlaybackProgress(
        lifecycle,
        Math.round(plan.durationMs / playbackTempo),
        () => audio.currentTime * 1000 / playbackTempo,
        plan.alignment,
      );
      if (activeTimer !== null) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (activeTimer !== null) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }
      if (activeResolve === cancel) activeResolve = null;
      if (error) progress?.cancel();
      else progress?.finish();
      progress = null;
      releaseActiveMedia(!error);
      lifecycle?.onEnd?.();
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish();
    activeResolve = cancel;
    audio.addEventListener("ended", () => finish(), { once: true });
    audio.addEventListener("error", () => finish(new Error("Bottish audio could not play.")), {
      once: true,
    });
    audio.addEventListener("playing", beginAudiblePlayback, { once: true });
    const playbackTempo = 1 + normalizeBotAudioVoiceProfileV1(profile).pace *
      BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
    audio.playbackRate = playbackTempo;
    activeTimer = window.setTimeout(() => {
      if (!started) finish(new Error("Audio playback did not start. Check the browser tab's sound setting."));
    }, MEDIA_PLAY_START_TIMEOUT_MS);
    void audio.play().then(
      () => undefined,
      (error: unknown) => finish(
        error instanceof Error ? error : new Error("Bottish audio could not play.")
      )
    );
  });
}

async function playPlan(
  plan: BottishPlan,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  lifecycle?: VoicePlaybackLifecycle,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan?: number,
): Promise<void> {
  if (plan.durationMs <= 0 || expectedGeneration !== generation) return;
  await playPreSpeechBreath({
    plan: preSpeechBreath,
    profile,
    roomAcoustics,
    stereoPan,
    isCurrent: () => expectedGeneration === generation,
  });
  if (expectedGeneration !== generation) return;
  const bytes = encodeBottishPlanWave(plan);
  const played = await playRealtimeVoiceBytes({
    bytes,
    profile,
    seed,
    effectsEnabled,
    roomAcoustics,
    stereoPan,
    lifecycle,
    alignment: plan.alignment,
    compensateLifecycleForOutputLatency: true,
    isCurrent: () => expectedGeneration === generation,
  });
  if (!played) await playPlanWithMedia(plan, profile, expectedGeneration, lifecycle);
}

export function buildBabbleRoboticPlan(
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed: string
): VoiceRoboticPlan {
  const profile = normalizeBottishPlaybackProfile(rawProfile);
  const sourcePlan = buildBottishPlan(text, profile, `${seed}:accent-source`);
  const targetCount = Math.max(
    7,
    Math.min(28, Math.round(9 + sourcePlan.notes.length * 0.28))
  );
  const step = Math.max(1, Math.floor(sourcePlan.notes.length / targetCount));
  const selected = sourcePlan.notes.filter((_, index) => index % step === 0).slice(0, targetCount);
  const accents = selected.map((note, index) => {
    const kind = stableUnit(`${seed}:accent-kind:${index}`);
    const buzzBurst = kind < 0.1;
    const click = !buzzBurst && kind < 0.55;
    const pop = !buzzBurst && !click && kind < 0.82;
    const register = buzzBurst ? 0.22 : click ? 3.4 : pop ? 1.25 : 2.05;
    const frequencyHz = Math.max(55, Math.min(3200, note.frequencyHz * register));
    const glide = buzzBurst
      ? 0.9 + stableUnit(`${seed}:accent-glide:${index}`) * 0.2
      : 0.62 + stableUnit(`${seed}:accent-glide:${index}`) * 1.08;
    return {
      atRatio: sourcePlan.durationMs > 0 ? note.startMs / sourcePlan.durationMs : 0,
      durationMs: Math.round(buzzBurst
        ? 34 + stableUnit(`${seed}:accent-length:${index}`) * 38
        : click
          ? 8 + stableUnit(`${seed}:accent-length:${index}`) * 13
          : pop
            ? 14 + stableUnit(`${seed}:accent-length:${index}`) * 11
            : 22 + stableUnit(`${seed}:accent-length:${index}`) * 30),
      frequencyHz,
      endFrequencyHz: Math.max(90, Math.min(3000, frequencyHz * glide)),
      gain: Number((buzzBurst ? 0.09 : click ? 0.13 : pop ? 0.15 : 0.16).toFixed(3)),
      waveform: buzzBurst || click
        ? "square" as OscillatorType
        : pop
          ? "sine" as OscillatorType
          : note.waveform,
    };
  });
  const gates = accents
    .filter((_, index) => index % 4 === 2)
    .map((accent, index) => ({
      atRatio: Math.min(0.995, accent.atRatio + 0.008),
      durationMs: Math.round(12 + stableUnit(`${seed}:gate:${index}`) * 12),
      depth: Number((0.07 + stableUnit(`${seed}:gate-depth:${index}`) * 0.05).toFixed(3)),
    }));
  return {
    accents,
    gates,
    buzzFrequencyHz: 0,
    buzzDepth: 0,
    drive: 0,
    lowpassHz: 20_000,
    bitDepth: 16,
    sampleHoldFrames: 1,
  };
}

function waveChunkId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export function pcmWaveDurationMs(bytes: ArrayBuffer): number | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes);
  if (waveChunkId(view, 0) !== "RIFF" || waveChunkId(view, 8) !== "WAVE") {
    return null;
  }
  let byteRate = 0;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + chunkSize > bytes.byteLength) break;
    const chunkId = waveChunkId(view, offset);
    if (chunkId === "fmt " && chunkSize >= 16) {
      byteRate = view.getUint32(payloadOffset + 8, true);
    } else if (chunkId === "data") {
      dataSize = Math.min(chunkSize, bytes.byteLength - payloadOffset);
      break;
    }
    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }
  if (byteRate <= 0 || dataSize <= 0) return null;
  return Math.max(1, Math.round(dataSize / byteRate * 1_000));
}

export function resolveBabblePlaybackProfile(
  rawProfile: BotAudioVoiceProfileV1,
  bytes: ArrayBuffer,
  timing?: BottishPlaybackTiming,
): ReturnType<typeof normalizeBotAudioVoiceProfileV1> {
  const profile = normalizeBottishPlaybackProfile(rawProfile);
  const authoredRate = 1 + profile.pace * BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
  const deliveryRate = typeof timing?.deliveryRate === "number" &&
      Number.isFinite(timing.deliveryRate)
    ? timing.deliveryRate
    : 1;
  const sourceDurationMs = pcmWaveDurationMs(bytes);
  const targetDurationMs = timing?.targetDurationMs;
  const maximumCompressionRate = Math.max(
    1,
    Math.min(
      MAX_ROBOT_VOICE_COMPRESSION_RATE,
      typeof timing?.maximumCompressionRate === "number" &&
          Number.isFinite(timing.maximumCompressionRate)
        ? timing.maximumCompressionRate
        : 1,
    ),
  );
  const targetCompressionRate =
    sourceDurationMs &&
      typeof targetDurationMs === "number" &&
      Number.isFinite(targetDurationMs) &&
      targetDurationMs > 0
      ? Math.max(
          1,
          Math.min(maximumCompressionRate, sourceDurationMs / targetDurationMs),
        )
      : 1;
  const playbackRate = Math.max(
    1 - BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
    Math.min(
      1 + BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
      authoredRate * deliveryRate * targetCompressionRate,
    ),
  );
  return {
    ...profile,
    pace: (playbackRate - 1) / BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
  };
}

/** Bakes clean additive Babble accents into a PCM WAV for browsers that cannot
 * keep Web Audio active across async system-TTS synthesis. */
export function mixBabbleMediaWave(
  bytes: ArrayBuffer,
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
): ArrayBuffer {
  if (!effectsEnabled) return bytes;
  if (bytes.byteLength < 44) return bytes;
  const input = new DataView(bytes);
  if (waveChunkId(input, 0) !== "RIFF" || waveChunkId(input, 8) !== "WAVE") return bytes;
  let formatOffset = -1;
  let formatSize = 0;
  let dataOffset = -1;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const chunkId = waveChunkId(input, offset);
    const chunkSize = input.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + chunkSize > bytes.byteLength) break;
    if (chunkId === "fmt ") {
      formatOffset = payloadOffset;
      formatSize = chunkSize;
    } else if (chunkId === "data") {
      dataOffset = payloadOffset;
      dataSize = chunkSize;
      break;
    }
    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }
  if (formatOffset < 0 || formatSize < 16 || dataOffset < 0) return bytes;
  const audioFormat = input.getUint16(formatOffset, true);
  const channelCount = input.getUint16(formatOffset + 2, true);
  const sampleRate = input.getUint32(formatOffset + 4, true);
  const bitsPerSample = input.getUint16(formatOffset + 14, true);
  if (audioFormat !== 1 || channelCount < 1 || sampleRate < 8_000 || bitsPerSample !== 16) {
    return bytes;
  }
  const frameSize = channelCount * 2;
  const frameCount = Math.floor(Math.min(dataSize, bytes.byteLength - dataOffset) / frameSize);
  if (frameCount < 1) return bytes;

  const output = bytes.slice(0);
  const view = new DataView(output);
  const plan = buildBabbleRoboticPlan(text, rawProfile, seed);
  const durationSeconds = frameCount / sampleRate;
  const mixed = new Float32Array(frameCount * channelCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const timeSeconds = frame / sampleRate;
    let gate = 1;
    for (const event of plan.gates) {
      const start = event.atRatio * durationSeconds;
      const end = start + event.durationMs / 1000;
      if (timeSeconds >= start && timeSeconds <= end) {
        gate = Math.min(gate, 1 - event.depth);
      }
    }
    for (let channel = 0; channel < channelCount; channel += 1) {
      const offset = dataOffset + frame * frameSize + channel * 2;
      const sample = view.getInt16(offset, true) / 0x8000;
      mixed[frame * channelCount + channel] = sample * gate;
    }
  }
  for (const accent of plan.accents) {
    const startFrame = Math.max(0, Math.floor(accent.atRatio * frameCount));
    const accentFrames = Math.max(1, Math.floor((accent.durationMs / 1000) * sampleRate));
    const frequencyRatio = Math.max(0.001, accent.endFrequencyHz / accent.frequencyHz);
    let phase = 0;
    for (let frameOffset = 0; frameOffset < accentFrames; frameOffset += 1) {
      const frame = startFrame + frameOffset;
      if (frame >= frameCount) break;
      const progress = accentFrames <= 1 ? 0 : frameOffset / (accentFrames - 1);
      const frequency = accent.frequencyHz * frequencyRatio ** progress;
      phase += (2 * Math.PI * frequency) / sampleRate;
      const envelope = Math.sin(Math.PI * progress) ** 0.7;
      const accentSample = bottishWaveSample(accent.waveform, phase) * accent.gain * envelope;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sampleIndex = frame * channelCount + channel;
        mixed[sampleIndex] = (mixed[sampleIndex] ?? 0) + accentSample;
      }
    }
  }
  let peak = 0;
  for (const sample of mixed) peak = Math.max(peak, Math.abs(sample));
  const safetyGain = peak > 0.98 ? 0.98 / peak : 1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const offset = dataOffset + frame * frameSize + channel * 2;
      const sample = (mixed[frame * channelCount + channel] ?? 0) * safetyGain;
      view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true);
    }
  }
  return output;
}

async function playHybridBytesWithMedia(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const url = URL.createObjectURL(new Blob([bytes.slice(0)], { type: "audio/wav" }));
  const audio = preparedMedia ?? new Audio();
  if (preparedMediaUrl) URL.revokeObjectURL(preparedMediaUrl);
  preparedMedia = null;
  preparedMediaUrl = null;
  audio.pause();
  audio.src = url;
  audio.load();
  audio.preload = "auto";
  audio.volume = Math.min(1, normalizeBotAudioVoiceProfileV1(profile).volume);
  audio.preservesPitch = true;
  activeMedia = audio;
  activeMediaUrl = url;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let progress: ReturnType<typeof beginVoicePlaybackProgress> | null = null;
    const beginAudiblePlayback = () => {
      if (started) return;
      started = true;
      const playbackTempo = 1 + normalizeBotAudioVoiceProfileV1(profile).pace *
        BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000 / playbackTempo)
        : null;
      if (durationMs) {
        progress = beginVoicePlaybackProgress(
          lifecycle,
          durationMs,
          () => audio.currentTime * 1000 / playbackTempo,
        );
      } else {
        lifecycle?.onStart?.(null);
      }
      if (activeTimer !== null) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (activeTimer !== null) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }
      if (activeResolve === cancel) activeResolve = null;
      if (error) progress?.cancel();
      else progress?.finish();
      progress = null;
      releaseActiveMedia(!error);
      lifecycle?.onEnd?.();
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish();
    activeResolve = cancel;
    audio.addEventListener("ended", () => finish(), { once: true });
    audio.addEventListener("error", () => finish(new Error("Babble voice could not play.")), {
      once: true,
    });
    audio.addEventListener("playing", beginAudiblePlayback, { once: true });
    const playbackTempo = 1 + normalizeBotAudioVoiceProfileV1(profile).pace *
      BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
    audio.playbackRate = playbackTempo;
    activeTimer = window.setTimeout(() => {
      if (!started) finish(new Error("Audio playback did not start. Check the browser tab's sound setting."));
    }, MEDIA_PLAY_START_TIMEOUT_MS);
    void audio.play().then(
      () => undefined,
      (error: unknown) => finish(
        error instanceof Error ? error : new Error("Babble voice could not play.")
      )
    );
  });
}

async function playBabble(
  bytes: ArrayBuffer,
  text: string,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  lifecycle?: VoicePlaybackLifecycle,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan?: number,
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const normalized = normalizeBottishPlaybackProfile(profile);
  await playPreSpeechBreath({
    plan: preSpeechBreath,
    profile: normalized,
    roomAcoustics,
    stereoPan,
    isCurrent: () => expectedGeneration === generation,
  });
  if (expectedGeneration !== generation) return;
  const roboticPlan = buildBabbleRoboticPlan(text, normalized, seed);
  const played = await playRealtimeVoiceBytes({
    bytes,
    profile: normalized,
    seed,
    effectsEnabled,
    baseLowpassHz: 20_000,
    roomAcoustics,
    stereoPan,
    lifecycle,
    roboticPlan,
    cleanRoboticCarrier: true,
    compensateLifecycleForOutputLatency: true,
    isCurrent: () => expectedGeneration === generation,
  });
  if (!played) {
    await playHybridBytesWithMedia(
      mixBabbleMediaWave(bytes, text, normalized, seed, effectsEnabled),
      normalized,
      expectedGeneration,
      lifecycle,
    );
  }
}

async function playChunkedBabbleResponse(
  response: Response,
  sourceText: string,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  globalVolume: number,
  lifecycle?: VoicePlaybackLifecycle,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  timing?: BottishPlaybackTiming,
  stereoPan = 0,
): Promise<void> {
  const totalCharacters = Math.max(
    1,
    Number(response.headers.get("x-prism-voice-characters")) || 1,
  );
  const estimatedDurationMs = Math.max(
    1,
    timing?.targetDurationMs ?? botcastSignalStandardCadenceDurationMs(sourceText),
  );
  let consumedCharacters = 0;
  let playedChunks = 0;
  let playbackStarted = false;

  for await (const chunk of readEnglishVoiceWaveStream(response)) {
    if (expectedGeneration !== generation) return;
    const segmentStartMs =
      estimatedDurationMs * (consumedCharacters / totalCharacters);
    const segmentEndMs =
      estimatedDurationMs *
      (Math.min(totalCharacters, consumedCharacters + chunk.characterCount) /
        totalCharacters);
    const segmentDurationMs = Math.max(1, segmentEndMs - segmentStartMs);
    const playbackProfile = {
      ...resolveBabblePlaybackProfile(profile, chunk.bytes, {
        deliveryRate: timing?.deliveryRate,
        maximumCompressionRate: timing?.maximumCompressionRate,
      }),
      volume: normalizeBotVoiceVolume(globalVolume),
    };
    let actualChunkDurationMs: number | null = null;
    await playBabble(
      chunk.bytes,
      chunk.text ?? sourceText,
      playbackProfile,
      expectedGeneration,
      `${seed}:chunk:${chunk.index}`,
      effectsEnabled,
      {
        onStart: (durationMs) => {
          actualChunkDurationMs = durationMs;
          if (!playbackStarted) {
            playbackStarted = true;
            lifecycle?.onStart?.(estimatedDurationMs);
          }
        },
        onProgress: (elapsedMs) => {
          const progress = actualChunkDurationMs
            ? Math.min(1, elapsedMs / actualChunkDurationMs)
            : Math.min(1, elapsedMs / segmentDurationMs);
          lifecycle?.onProgress?.(
            segmentStartMs + segmentDurationMs * progress,
            estimatedDurationMs,
          );
        },
        onEnd: () => undefined,
      },
      roomAcoustics,
      playedChunks === 0 ? preSpeechBreath : null,
      stereoPan,
    );
    playedChunks += 1;
    consumedCharacters += chunk.characterCount;
    lifecycle?.onProgress?.(segmentEndMs, estimatedDurationMs);
  }

  if (expectedGeneration !== generation) return;
  if (playedChunks === 0 || !playbackStarted) {
    throw new Error("Babble voice stream returned no playable audio.");
  }
  lifecycle?.onProgress?.(estimatedDurationMs, estimatedDurationMs);
  lifecycle?.onEnd?.();
}

export function enqueueBabbleVoice(
  bytes: ArrayBuffer,
  sourceText: string,
  profile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  timing?: BottishPlaybackTiming,
  stereoPan = 0,
): Promise<void> {
  const expectedGeneration = generation;
  const playbackProfile = {
    ...resolveBabblePlaybackProfile(profile, bytes, timing),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  queue = queue
    .catch(() => undefined)
    .then(() =>
      playBabble(
        bytes,
        sourceText,
        playbackProfile,
        expectedGeneration,
        seed,
        effectsEnabled,
        lifecycle,
        roomAcoustics,
        preSpeechBreath,
        stereoPan,
      ),
    );
  return queue;
}

export function enqueueChunkedBabbleVoice(
  response: Response,
  sourceText: string,
  profile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  timing?: BottishPlaybackTiming,
  stereoPan = 0,
): Promise<void> {
  const expectedGeneration = generation;
  queue = queue
    .catch(() => undefined)
    .then(() =>
      playChunkedBabbleResponse(
        response,
        sourceText,
        profile,
        expectedGeneration,
        seed,
        effectsEnabled,
        globalVolume,
        lifecycle,
        roomAcoustics,
        preSpeechBreath,
        timing,
        stereoPan,
      ),
    );
  return queue;
}

export function enqueueBottishVoice(
  text: string,
  profile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  timing?: BottishPlaybackTiming,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan = 0,
): Promise<void> {
  const expectedGeneration = generation;
  const normalizedProfile = normalizeBottishPlaybackProfile(profile);
  const planProfile = {
    ...normalizedProfile,
    // Bottish owns its duration in the generated plan, so browser playback
    // cannot apply Pace twice.
    pace: 0,
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  const plan = buildBottishPlaybackPlan(text, normalizedProfile, seed, timing);
  // Pitch and lilt are baked into the procedural plan. Keeping the playback
  // transform neutral prevents a second shift after synthesis.
  const playbackProfile = { ...planProfile, pitch: 0, lilt: 0 };
  queue = queue
    .catch(() => undefined)
    .then(() =>
      playPlan(
        plan,
        playbackProfile,
        expectedGeneration,
        seed,
        effectsEnabled,
        lifecycle,
        roomAcoustics,
        preSpeechBreath,
        stereoPan,
      ),
    );
  return queue;
}

/** Babble and procedural Bottish share the same unlocked media lane so mode
 * switches cannot leave an old carrier or accent queue playing. */
export const prepareBabbleVoice = prepareBottishVoice;
export const stopBabbleVoice = stopBottishVoice;

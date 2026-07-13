import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  beginVoicePlaybackProgress,
  playRealtimeVoiceBytes,
  prepareRealtimeVoiceAudio,
  stopRealtimeVoiceAudio,
  type VoicePlaybackCharacterAlignment,
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";

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
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;
const BOTTISH_SAMPLE_RATE = 24_000;

const VOICE_BASES = {
  "voice-1": { frequency: 310, waveform: "sine" as OscillatorType },
  "voice-2": { frequency: 235, waveform: "triangle" as OscillatorType },
  "voice-3": { frequency: 390, waveform: "sine" as OscillatorType },
  "voice-4": { frequency: 180, waveform: "square" as OscillatorType },
  "voice-5": { frequency: 475, waveform: "triangle" as OscillatorType },
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
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  const voice = VOICE_BASES[profile.baseVoiceId];
  const pitchMultiplier = 2 ** (profile.pitch * 0.7);
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
    const liltWave = Math.sin(spokenIndex * 0.82) * profile.lilt * 4.5;
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

/** Fits procedural Bottish to a longer visible delivery window. Speech must
 * never be compressed to catch up with the UI: doing that turns a normal
 * Bottish cadence into an unintelligible burst. The reveal follows audio via
 * lifecycle timing, so a short UI window is simply ignored here. */
export function fitBottishPlanToDuration(
  plan: BottishPlan,
  targetDurationMs: number | undefined
): BottishPlan {
  if (
    plan.durationMs <= 0 ||
    typeof targetDurationMs !== "number" ||
    !Number.isFinite(targetDurationMs) ||
    targetDurationMs <= plan.durationMs
  ) {
    return plan;
  }
  const durationMs = Math.max(plan.durationMs, 80, Math.round(targetDurationMs));
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
let preparedMedia: HTMLAudioElement | null = null;
let preparedMediaUrl: string | null = null;
let activeTimer: number | null = null;
let activeResolve: (() => void) | null = null;
let generation = 0;
let queue: Promise<void> = Promise.resolve();

export async function prepareBottishVoice(): Promise<void> {
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

export function stopBottishVoice(): void {
  generation += 1;
  stopRealtimeVoiceAudio();
  stopScheduledNodes();
  releasePreparedMedia();
  queue = Promise.resolve();
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
  activeMedia = audio;
  activeMediaUrl = url;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let progress: ReturnType<typeof beginVoicePlaybackProgress> | null = null;
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
    activeTimer = window.setTimeout(() => {
      if (!started) finish(new Error("Audio playback did not start. Check the browser tab's sound setting."));
    }, MEDIA_PLAY_START_TIMEOUT_MS);
    void audio.play().then(
      () => {
        started = true;
        progress = beginVoicePlaybackProgress(
          lifecycle,
          plan.durationMs,
          () => audio.currentTime * 1000,
          plan.alignment
        );
        if (activeTimer !== null) {
          window.clearTimeout(activeTimer);
          activeTimer = null;
        }
      },
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
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  if (plan.durationMs <= 0 || expectedGeneration !== generation) return;
  const bytes = encodeBottishPlanWave(plan);
  const played = await playRealtimeVoiceBytes({
    bytes,
    profile,
    seed,
    effectsEnabled,
    lifecycle,
    alignment: plan.alignment,
  });
  if (!played) await playPlanWithMedia(plan, profile, expectedGeneration, lifecycle);
}

export function enqueueBottishVoice(
  text: string,
  profile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  timing?: BottishPlaybackTiming
): Promise<void> {
  const expectedGeneration = generation;
  const playbackProfile = {
    ...normalizeBotAudioVoiceProfileV1(profile),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  const plan = fitBottishPlanToDuration(
    buildBottishPlan(text, playbackProfile, seed),
    timing?.targetDurationMs
  );
  queue = queue
    .catch(() => undefined)
    .then(() => playPlan(plan, playbackProfile, expectedGeneration, seed, effectsEnabled, lifecycle));
  return queue;
}

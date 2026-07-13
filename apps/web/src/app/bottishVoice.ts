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
  voiceLiltDetuneCents,
  type VoicePlaybackCharacterAlignment,
  type VoicePlaybackLifecycle,
  type VoiceRoboticPlan,
} from "./voiceEffects.ts";
import {
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
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;
const BOTTISH_SAMPLE_RATE = 24_000;

/** Accept current WAV/timed responses while treating an older metadata-only
 * Bottish success as a deliberate signal to use procedural fallback. This can
 * occur briefly when the web bundle hot-reloads before the API process. */
export async function readBottishVoiceSynthesisClip(
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
let activeMediaLiltTimer: number | null = null;
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
  if (activeMediaLiltTimer !== null && typeof window !== "undefined") {
    window.clearInterval(activeMediaLiltTimer);
    activeMediaLiltTimer = null;
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
  stopScheduledNodes();
  if (!options.preservePreparedMedia) releasePreparedMedia();
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

export function buildHybridBottishPlan(
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed: string
): VoiceRoboticPlan {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  const sourcePlan = buildBottishPlan(text, profile, `${seed}:accent-source`);
  const intensity = Math.max(0, Math.min(1, (profile.bottishTone + 1) / 2));
  const targetCount = Math.max(
    4,
    Math.min(24, Math.round(4 + sourcePlan.notes.length * (0.09 + intensity * 0.11)))
  );
  const step = Math.max(1, Math.floor(sourcePlan.notes.length / targetCount));
  const selected = sourcePlan.notes.filter((_, index) => index % step === 0).slice(0, targetCount);
  const accents = selected.map((note, index) => {
    const click = stableUnit(`${seed}:accent-kind:${index}`) < 0.38 + intensity * 0.24;
    const register = click ? 2.6 + intensity * 1.8 : 1.55 + intensity * 1.15;
    const frequencyHz = Math.max(180, Math.min(2600, note.frequencyHz * register));
    const glide = 0.76 + stableUnit(`${seed}:accent-glide:${index}`) * 0.7;
    return {
      atRatio: sourcePlan.durationMs > 0 ? note.startMs / sourcePlan.durationMs : 0,
      durationMs: Math.round(click
        ? 10 + stableUnit(`${seed}:accent-length:${index}`) * 15
        : 25 + stableUnit(`${seed}:accent-length:${index}`) * 34),
      frequencyHz,
      endFrequencyHz: Math.max(90, Math.min(3000, frequencyHz * glide)),
      gain: Number((0.08 + intensity * 0.14).toFixed(3)),
      waveform: click ? "square" as OscillatorType : note.waveform,
    };
  });
  const gates = accents
    .filter((_, index) => index % (intensity > 0.72 ? 2 : 3) === 1)
    .map((accent, index) => ({
      atRatio: Math.min(0.995, accent.atRatio + 0.008),
      durationMs: Math.round(13 + intensity * 31 + stableUnit(`${seed}:gate:${index}`) * 14),
      depth: Number((0.15 + intensity * 0.42).toFixed(3)),
    }));
  return {
    accents,
    gates,
    buzzFrequencyHz: Number((20 + intensity * 28).toFixed(2)),
    buzzDepth: Number((0.07 + intensity * 0.22).toFixed(3)),
    drive: Number((0.08 + intensity * 0.32).toFixed(3)),
    lowpassHz: Math.round(12_000 - intensity * 5_200),
    bitDepth: Math.round(13 - intensity * 4),
    sampleHoldFrames: 1 + Math.floor(intensity * 2.4),
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

/** Bakes the core Bottish treatment into a PCM WAV for browsers that cannot
 * keep Web Audio active across async system-TTS synthesis. */
export function mixHybridBottishMediaWave(
  bytes: ArrayBuffer,
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
): ArrayBuffer {
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
  const plan = buildHybridBottishPlan(text, rawProfile, seed);
  const durationSeconds = frameCount / sampleRate;
  const drive = effectsEnabled ? plan.drive : plan.drive * 0.35;
  const driveScale = 1 + drive * 5;
  const driveDivisor = Math.tanh(driveScale);
  const bitDepth = effectsEnabled ? plan.bitDepth : Math.max(13, plan.bitDepth);
  const quantizationSteps = 2 ** Math.max(4, Math.min(15, bitDepth - 1));
  const sampleHoldFrames = effectsEnabled ? plan.sampleHoldFrames : 1;
  const heldSamples = new Float32Array(channelCount);
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
    const buzz = effectsEnabled && plan.buzzDepth > 0
      ? 1 - plan.buzzDepth * (Math.sin(2 * Math.PI * plan.buzzFrequencyHz * timeSeconds) >= 0 ? 0 : 1)
      : 1;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const offset = dataOffset + frame * frameSize + channel * 2;
      const sample = view.getInt16(offset, true) / 0x8000;
      let processed = Math.tanh(sample * gate * buzz * driveScale) / driveDivisor;
      processed = Math.round(processed * quantizationSteps) / quantizationSteps;
      if (frame % sampleHoldFrames === 0) heldSamples[channel] = processed;
      else processed = heldSamples[channel] ?? processed;
      view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, processed)) * 0x7fff), true);
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
        const offset = dataOffset + frame * frameSize + channel * 2;
        const carrier = view.getInt16(offset, true) / 0x8000;
        view.setInt16(
          offset,
          Math.round(Math.max(-1, Math.min(1, carrier + accentSample)) * 0x7fff),
          true,
        );
      }
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
  audio.preservesPitch = false;
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
    audio.addEventListener("error", () => finish(new Error("Bottish voice could not play.")), {
      once: true,
    });
    activeTimer = window.setTimeout(() => {
      if (!started) finish(new Error("Audio playback did not start. Check the browser tab's sound setting."));
    }, MEDIA_PLAY_START_TIMEOUT_MS);
    void audio.play().then(
      () => {
        started = true;
        const normalized = normalizeBotAudioVoiceProfileV1(profile);
        const updatePlaybackRate = () => {
          const detuneCents = normalized.pitch * 650 +
            voiceLiltDetuneCents(normalized.lilt, audio.currentTime);
          audio.playbackRate = Math.max(0.7, Math.min(1.4, 2 ** (detuneCents / 1200)));
        };
        updatePlaybackRate();
        if (normalized.lilt !== 0) {
          activeMediaLiltTimer = window.setInterval(updatePlaybackRate, 100);
        }
        const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : null;
        if (durationMs) {
          progress = beginVoicePlaybackProgress(lifecycle, durationMs, () => audio.currentTime * 1000);
        } else {
          lifecycle?.onStart?.(null);
        }
        if (activeTimer !== null) {
          window.clearTimeout(activeTimer);
          activeTimer = null;
        }
      },
      (error: unknown) => finish(
        error instanceof Error ? error : new Error("Bottish voice could not play.")
      )
    );
  });
}

async function playHybridBottish(
  bytes: ArrayBuffer,
  text: string,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  const roboticPlan = buildHybridBottishPlan(text, normalized, seed);
  const played = await playRealtimeVoiceBytes({
    bytes,
    profile: normalized,
    seed,
    effectsEnabled,
    detuneCents: Math.round(normalized.pitch * 650),
    baseLowpassHz: Math.max(10_000, Math.min(20_000, Math.round(16_000 - normalized.warmth * 6000))),
    lifecycle,
    roboticPlan,
  });
  if (!played) {
    await playHybridBytesWithMedia(
      mixHybridBottishMediaWave(bytes, text, normalized, seed, effectsEnabled),
      normalized,
      expectedGeneration,
      lifecycle,
    );
  }
}

export function enqueueHybridBottishVoice(
  bytes: ArrayBuffer,
  sourceText: string,
  profile: BotAudioVoiceProfileV1,
  seed: string,
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  const expectedGeneration = generation;
  const playbackProfile = {
    ...normalizeBotAudioVoiceProfileV1(profile),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  queue = queue
    .catch(() => undefined)
    .then(() => playHybridBottish(
      bytes,
      sourceText,
      playbackProfile,
      expectedGeneration,
      seed,
      effectsEnabled,
      lifecycle
    ));
  return queue;
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

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
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";

export interface EnglishVoicePostProcessing {
  detuneCents: number;
  lowpassHz: number;
  gain: number;
}

export interface EnglishVoiceCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface EnglishVoiceSynthesisClip {
  bytes: ArrayBuffer;
  alignment: EnglishVoiceCharacterAlignment | null;
  audioContentType: string;
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;

function decodedBase64Bytes(value: string): ArrayBuffer {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }
  const bufferConstructor = (globalThis as typeof globalThis & {
    Buffer?: { from: (input: string, encoding: string) => Uint8Array };
  }).Buffer;
  if (!bufferConstructor) throw new Error("Voice audio could not be decoded.");
  const bytes = bufferConstructor.from(value, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function normalizedAlignment(value: unknown): EnglishVoiceCharacterAlignment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const characters = record.characters;
  const starts = record.characterStartTimesSeconds;
  const ends = record.characterEndTimesSeconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return null;
  if (characters.length === 0 || characters.length !== starts.length || starts.length !== ends.length) {
    return null;
  }
  if (!characters.every((character) => typeof character === "string")) return null;
  if (!starts.every((start) => typeof start === "number" && Number.isFinite(start))) return null;
  if (!ends.every((end) => typeof end === "number" && Number.isFinite(end))) return null;
  return {
    characters: [...characters] as string[],
    characterStartTimesSeconds: [...starts] as number[],
    characterEndTimesSeconds: [...ends] as number[],
  };
}

/** Read either the legacy binary voice response or Prism's timed JSON envelope. */
export async function readEnglishVoiceSynthesisClip(
  response: Response
): Promise<EnglishVoiceSynthesisClip> {
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      bytes: await response.arrayBuffer(),
      alignment: null,
      audioContentType: contentType,
    };
  }
  const payload = await response.json() as Record<string, unknown>;
  const audioBase64 = typeof payload.audioBase64 === "string" ? payload.audioBase64.trim() : "";
  if (!audioBase64) throw new Error("Voice synthesis returned no audio.");
  return {
    bytes: decodedBase64Bytes(audioBase64),
    alignment: normalizedAlignment(payload.alignment),
    audioContentType: typeof payload.audioContentType === "string"
      ? payload.audioContentType
      : response.headers.get("x-prism-audio-content-type") ?? "application/octet-stream",
  };
}

export function resolveEnglishVoicePostProcessing(
  rawProfile: BotAudioVoiceProfileV1
): EnglishVoicePostProcessing {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  return {
    detuneCents: Math.round(profile.pitch * 650),
    // Neutral playback should preserve the synthesized voice. Warmth still
    // rolls off a little top end, but never drops into the muffled telephone
    // range used by the first pass.
    lowpassHz: Math.max(10_000, Math.min(20_000, Math.round(16_000 - profile.warmth * 6000))),
    gain: Number((0.92 + profile.warmth * 0.04).toFixed(3)),
  };
}

let activeMedia: HTMLAudioElement | null = null;
let activeMediaUrl: string | null = null;
let activeMediaStartTimer: number | null = null;
let activeMediaLiltTimer: number | null = null;
let activeMediaResolve: (() => void) | null = null;
let preparedMedia: HTMLAudioElement | null = null;
let preparedMediaUrl: string | null = null;
let generation = 0;
let queue: Promise<void> = Promise.resolve();

export async function prepareEnglishVoice(): Promise<void> {
  beginMediaUnlock();
  if (await prepareRealtimeVoiceAudio()) {
    releasePreparedMedia();
    return;
  }
  if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Audio playback is unavailable in this browser.");
  }
}

function createSilentWave(): ArrayBuffer {
  const output = new ArrayBuffer(46);
  const view = new DataView(output);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 38, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, 2, true);
  view.setInt16(44, 0, true);
  return output;
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
  const url = URL.createObjectURL(new Blob([createSilentWave()], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = 0;
  preparedMedia = audio;
  preparedMediaUrl = url;
  // This call intentionally happens before the first await in the click/send
  // handler so the same media element remains authorized for later TTS bytes.
  void audio.play().catch(() => undefined);
}

function releaseActiveMedia(keepElement = false): void {
  const media = activeMedia;
  if (activeMedia) {
    activeMedia.pause();
    activeMedia.removeAttribute("src");
    activeMedia.load();
    activeMedia = null;
  }
  if (activeMediaUrl) {
    URL.revokeObjectURL(activeMediaUrl);
    activeMediaUrl = null;
  }
  if (activeMediaStartTimer !== null) {
    window.clearTimeout(activeMediaStartTimer);
    activeMediaStartTimer = null;
  }
  if (activeMediaLiltTimer !== null) {
    window.clearInterval(activeMediaLiltTimer);
    activeMediaLiltTimer = null;
  }
  if (keepElement && media) preparedMedia = media;
}

export function stopEnglishVoice(): void {
  generation += 1;
  stopRealtimeVoiceAudio();
  releaseActiveMedia();
  releasePreparedMedia();
  activeMediaResolve?.();
  activeMediaResolve = null;
  queue = Promise.resolve();
}

async function playBytesWithMedia(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  const isWave = String.fromCharCode(...header) === "RIFF";
  const url = URL.createObjectURL(
    new Blob([bytes.slice(0)], { type: isWave ? "audio/wav" : "audio/mpeg" })
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
      if (activeMediaResolve === cancel) activeMediaResolve = null;
      if (error) progress?.cancel();
      else progress?.finish();
      progress = null;
      releaseActiveMedia(!error);
      lifecycle?.onEnd?.();
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish();
    activeMediaResolve = cancel;
    audio.addEventListener("ended", () => finish(), { once: true });
    audio.addEventListener("error", () => finish(new Error("English audio could not play.")), {
      once: true,
    });
    activeMediaStartTimer = window.setTimeout(() => {
      if (!started) finish(new Error("Audio playback did not start. Check the browser tab's sound setting."));
    }, MEDIA_PLAY_START_TIMEOUT_MS);
    void audio.play().then(
      () => {
        started = true;
        const normalizedProfile = normalizeBotAudioVoiceProfileV1(profile);
        const updatePlaybackRate = () => {
          const detuneCents =
            normalizedProfile.pitch * 650 +
            voiceLiltDetuneCents(normalizedProfile.lilt, audio.currentTime);
          audio.playbackRate = Math.max(0.7, Math.min(1.4, 2 ** (detuneCents / 1200)));
        };
        updatePlaybackRate();
        if (normalizedProfile.lilt !== 0) {
          activeMediaLiltTimer = window.setInterval(updatePlaybackRate, 100);
        }
        const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : null;
        if (durationMs) {
          progress = beginVoicePlaybackProgress(
            lifecycle,
            durationMs,
            () => audio.currentTime * 1000
          );
        } else {
          lifecycle?.onStart?.(null);
        }
        if (activeMediaStartTimer !== null) {
          window.clearTimeout(activeMediaStartTimer);
          activeMediaStartTimer = null;
        }
      },
      (error: unknown) => finish(
        error instanceof Error ? error : new Error("English audio could not play.")
      )
    );
  });
}

async function playAudio(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  lifecycle?: VoicePlaybackLifecycle
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const processing = resolveEnglishVoicePostProcessing(profile);
  const played = await playRealtimeVoiceBytes({
    bytes,
    profile,
    seed,
    effectsEnabled,
    detuneCents: processing.detuneCents,
    baseLowpassHz: processing.lowpassHz,
    lifecycle,
  });
  if (!played) {
    await playBytesWithMedia(bytes, profile, expectedGeneration, lifecycle);
    return;
  }
}

export function enqueueEnglishVoice(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  seed = "english-preview",
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
    .then(() => playAudio(bytes, playbackProfile, expectedGeneration, seed, effectsEnabled, lifecycle));
  return queue;
}

import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  playRealtimeVoiceBytes,
  prepareRealtimeVoiceAudio,
  stopRealtimeVoiceAudio,
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";

export interface EnglishVoicePostProcessing {
  detuneCents: number;
  lowpassHz: number;
  gain: number;
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;

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
  activeMedia = audio;
  activeMediaUrl = url;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (activeMediaResolve === cancel) activeMediaResolve = null;
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
        lifecycle?.onStart?.(
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1000)
            : null
        );
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

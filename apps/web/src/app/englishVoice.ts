import {
  applyVoiceDeliveryMoodToProfile,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  normalizeVoiceEffect,
  resolveVoicePlaybackTransform,
  type BotAudioVoiceProfileV1,
  type VoiceEffect,
  type VoiceDeliveryMood,
} from "@localai/shared";
import {
  beginVoicePlaybackProgress,
  playPreSpeechBreath,
  playRealtimeVoiceBytes,
  prepareRealtimeVoiceAudio,
  releaseRealtimeVoiceAudio,
  stopRealtimeVoiceAudio,
  voiceReleaseGainAt,
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";
import type { PreSpeechBreathPlan } from "./preSpeechBreath.ts";
import type { RoomAcousticsSend } from "./roomAcoustics.ts";

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
  engineUsed: string | null;
}

export interface EnglishVoiceWaveStreamChunk {
  index: number;
  characterCount: number;
  text: string | null;
  bytes: ArrayBuffer;
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;
const STREAM_MEDIA_PLAY_START_TIMEOUT_MS = 5000;

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

export function parseEnglishVoiceWaveStreamChunk(
  line: string,
): EnglishVoiceWaveStreamChunk {
  const payload = JSON.parse(line) as Record<string, unknown>;
  const index = Number(payload.index);
  const characterCount = Number(payload.characterCount);
  const audioBase64 =
    typeof payload.audioBase64 === "string" ? payload.audioBase64.trim() : "";
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    !Number.isFinite(characterCount) ||
    characterCount <= 0 ||
    !audioBase64
  ) {
    throw new Error("Local voice stream returned an invalid audio chunk.");
  }
  return {
    index,
    characterCount,
    text: typeof payload.text === "string" ? payload.text : null,
    bytes: decodedBase64Bytes(audioBase64),
  };
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
  const engineUsed = response.headers.get("x-prism-voice-engine");
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      bytes: await response.arrayBuffer(),
      alignment: null,
      audioContentType: contentType,
      engineUsed,
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
    engineUsed,
  };
}

export function voiceEffectForPlayback(
  rawProfile: BotAudioVoiceProfileV1,
): VoiceEffect {
  return normalizeVoiceEffect(
    normalizeBotAudioVoiceProfileV1(rawProfile).elevenLabsEffect,
  );
}

/** Backwards-compatible helper; playback effects no longer depend on engine. */
export function elevenLabsEffectForEngine(
  rawProfile: BotAudioVoiceProfileV1,
  engineUsed: string | null,
): VoiceEffect {
  void engineUsed;
  return voiceEffectForPlayback(rawProfile);
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

export function resolveEnglishVoicePlaybackDetuneCents(
  rawProfile: BotAudioVoiceProfileV1,
  engineUsed: string | null,
): number {
  // Both engines use the same local transform; keeping this parameter retains
  // the established call-site contract while making that neutrality explicit.
  void engineUsed;
  return resolveVoicePlaybackTransform(rawProfile).pitchCents;
}

/** Convert the media element's source-time clock to audible playback time. */
export function englishVoiceMediaElapsedMs(
  currentTimeSeconds: number,
  playbackTempo: number,
): number {
  if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds <= 0) return 0;
  const safeTempo =
    Number.isFinite(playbackTempo) && playbackTempo > 0 ? playbackTempo : 1;
  return (currentTimeSeconds * 1_000) / safeTempo;
}

/** Streaming keeps conversational Premium speech responsive, but the media
 * element path cannot reproduce Prism's local pitch/texture graph. Restrict it
 * to profiles whose authored identity is preserved by playbackRate + volume. */
export function englishVoiceProfileSupportsStreaming(
  rawProfile: BotAudioVoiceProfileV1,
  effectsEnabled = true,
  deliveryMood?: VoiceDeliveryMood | null,
): boolean {
  const profile = applyVoiceDeliveryMoodToProfile(rawProfile, deliveryMood);
  if (profile.pitch !== 0 || profile.warmth !== 0 || profile.lilt !== 0) {
    return false;
  }
  if (!effectsEnabled) return true;
  return (
    voiceEffectForPlayback(profile) === "clean" &&
    profile.texture.preset === "clean"
  );
}

/** Provider/native character timings describe the neutral-tempo source clip.
 * Scale them to the local playback clock before Signal uses them directly. */
export function scaleEnglishVoiceAlignmentForPlayback(
  alignment: EnglishVoiceCharacterAlignment | null,
  rawProfile: BotAudioVoiceProfileV1,
  deliveryMood?: VoiceDeliveryMood | null,
): EnglishVoiceCharacterAlignment | null {
  if (!alignment) return null;
  const tempo = resolveVoicePlaybackTransform(
    applyVoiceDeliveryMoodToProfile(rawProfile, deliveryMood),
  ).tempo;
  return {
    characters: [...alignment.characters],
    characterStartTimesSeconds: alignment.characterStartTimesSeconds.map(
      (time) => time / tempo,
    ),
    characterEndTimesSeconds: alignment.characterEndTimesSeconds.map(
      (time) => time / tempo,
    ),
  };
}

let activeMedia: HTMLAudioElement | null = null;
let activeMediaUrl: string | null = null;
let activeMediaStartTimer: number | null = null;
let activeMediaFadeTimer: number | null = null;
let activeMediaResolve: (() => void) | null = null;
let preparedMedia: HTMLAudioElement | null = null;
let preparedMediaUrl: string | null = null;
let generation = 0;
let queue: Promise<void> = Promise.resolve();

export async function prepareEnglishVoice(): Promise<void> {
  // Keep the media element authorized by the send gesture when a later
  // render prepares playback outside that gesture (notably Safari PWAs).
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
  if (activeMediaFadeTimer !== null) {
    window.clearTimeout(activeMediaFadeTimer);
    activeMediaFadeTimer = null;
  }
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

export function stopEnglishVoice(
  options: { preservePreparedMedia?: boolean } = {}
): void {
  generation += 1;
  stopRealtimeVoiceAudio();
  stopRealtimeVoiceAudio("presence");
  releaseActiveMedia();
  if (!options.preservePreparedMedia) releasePreparedMedia();
  activeMediaResolve?.();
  activeMediaResolve = null;
  queue = Promise.resolve();
}

export function releaseEnglishVoice(
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
    const resolve = activeMediaResolve;
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
      const playbackTempo = resolveVoicePlaybackTransform(profile).tempo;
      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round((audio.duration * 1000) / playbackTempo)
        : null;
      if (durationMs) {
        progress = beginVoicePlaybackProgress(
          lifecycle,
          durationMs,
          () => englishVoiceMediaElapsedMs(audio.currentTime, playbackTempo),
        );
      } else {
        lifecycle?.onStart?.(null);
      }
      if (activeMediaStartTimer !== null) {
        window.clearTimeout(activeMediaStartTimer);
        activeMediaStartTimer = null;
      }
    };
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
    // play() resolving means the browser accepted the request, not that the
    // first audible frame has reached its media pipeline. Signal's captions
    // and avatar state must wait for the latter.
    audio.addEventListener("playing", beginAudiblePlayback, { once: true });
    const playbackTempo = resolveVoicePlaybackTransform(profile).tempo;
    audio.playbackRate = playbackTempo;
    activeMediaStartTimer = window.setTimeout(() => {
      if (!started) finish(new Error("Audio playback did not start. Check the browser tab's sound setting."));
    }, MEDIA_PLAY_START_TIMEOUT_MS);
    void audio.play().then(
      () => undefined,
      (error: unknown) => finish(
        error instanceof Error ? error : new Error("English audio could not play.")
      )
    );
  });
}

function mediaSourceForEnglishStream(): typeof MediaSource | null {
  if (typeof window === "undefined") return null;
  const constructor = window.MediaSource;
  if (typeof constructor !== "function") return null;
  return constructor.isTypeSupported("audio/mpeg") ? constructor : null;
}

export function englishVoiceResponseSupportsStreaming(
  response: Pick<Response, "body" | "headers">,
): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    response.body !== null &&
    contentType.includes("audio/mpeg") &&
    mediaSourceForEnglishStream() !== null &&
    typeof URL.createObjectURL === "function"
  );
}

export function englishVoiceResponseSupportsChunkedStreaming(
  response: Pick<Response, "body" | "headers">,
): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    response.body !== null &&
    contentType.includes("application/x-ndjson") &&
    response.headers.get("x-prism-voice-stream") === "wav-chunks-v1"
  );
}

export async function* readEnglishVoiceWaveStream(
  response: Response,
): AsyncGenerator<EnglishVoiceWaveStreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Local voice stream returned no audio.");
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffered += decoder.decode(next.value, { stream: true });
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) yield parseEnglishVoiceWaveStreamChunk(line);
        newline = buffered.indexOf("\n");
      }
    }
    buffered += decoder.decode();
    const finalLine = buffered.trim();
    if (finalLine) yield parseEnglishVoiceWaveStreamChunk(finalLine);
  } finally {
    reader.releaseLock();
  }
}

async function appendEnglishStreamChunk(
  sourceBuffer: SourceBuffer,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.byteLength === 0) return;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      sourceBuffer.removeEventListener("updateend", finish);
      sourceBuffer.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      sourceBuffer.removeEventListener("updateend", finish);
      sourceBuffer.removeEventListener("error", fail);
      reject(new Error("English audio stream could not be buffered."));
    };
    sourceBuffer.addEventListener("updateend", finish, { once: true });
    sourceBuffer.addEventListener("error", fail, { once: true });
    try {
      sourceBuffer.appendBuffer(bytes.slice());
    } catch {
      fail();
    }
  });
}

async function playStreamingResponseWithMedia(
  response: Response,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  estimatedDurationMs: number,
  lifecycle?: VoicePlaybackLifecycle,
  preSpeechBreath?: PreSpeechBreathPlan | null,
): Promise<void> {
  const MediaSourceConstructor = mediaSourceForEnglishStream();
  const body = response.body;
  if (!MediaSourceConstructor || !body || expectedGeneration !== generation) {
    throw new Error("Streaming English audio is unavailable.");
  }
  const mediaSource = new MediaSourceConstructor();
  const url = URL.createObjectURL(mediaSource);
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

  const reader = body.getReader();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let progress: ReturnType<typeof beginVoicePlaybackProgress> | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const playbackTempo = resolveVoicePlaybackTransform(profile).tempo;
    const safeEstimatedDurationMs = Math.max(1, Math.round(estimatedDurationMs));
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (activeMediaResolve === cancel) activeMediaResolve = null;
      if (activeMediaStartTimer !== null) {
        window.clearTimeout(activeMediaStartTimer);
        activeMediaStartTimer = null;
      }
      void reader.cancel().catch(() => undefined);
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
    audio.addEventListener(
      "error",
      () => finish(new Error("English audio stream could not play.")),
      { once: true },
    );
    audio.addEventListener(
      "playing",
      () => {
        if (started) return;
        started = true;
        progress = beginVoicePlaybackProgress(
          lifecycle,
          safeEstimatedDurationMs,
          () => englishVoiceMediaElapsedMs(audio.currentTime, playbackTempo),
        );
        if (activeMediaStartTimer !== null) {
          window.clearTimeout(activeMediaStartTimer);
          activeMediaStartTimer = null;
        }
      },
      { once: true },
    );

    mediaSource.addEventListener(
      "sourceopen",
      () => {
        if (settled || expectedGeneration !== generation) {
          finish();
          return;
        }
        try {
          sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        } catch {
          finish(new Error("Streaming English audio is unavailable."));
          return;
        }
        void (async () => {
          let firstChunkAppended = false;
          try {
            while (!settled && expectedGeneration === generation) {
              const next = await reader.read();
              if (next.done) break;
              if (!next.value || next.value.byteLength === 0) continue;
              await appendEnglishStreamChunk(sourceBuffer!, next.value);
              if (!firstChunkAppended) {
                firstChunkAppended = true;
                await playPreSpeechBreath({
                  plan: preSpeechBreath,
                  profile,
                  isCurrent: () => expectedGeneration === generation,
                });
                if (settled || expectedGeneration !== generation) {
                  finish();
                  return;
                }
                audio.playbackRate = playbackTempo;
                activeMediaStartTimer = window.setTimeout(() => {
                  if (!started) {
                    finish(
                      new Error(
                        "Audio playback did not start. Check the browser tab's sound setting.",
                      ),
                    );
                  }
                }, STREAM_MEDIA_PLAY_START_TIMEOUT_MS);
                void audio.play().catch((error: unknown) =>
                  finish(
                    error instanceof Error
                      ? error
                      : new Error("English audio stream could not play."),
                  ),
                );
              }
            }
            if (!firstChunkAppended) {
              finish(new Error("Voice synthesis returned no audio."));
              return;
            }
            if (
              !settled &&
              mediaSource.readyState === "open" &&
              sourceBuffer &&
              !sourceBuffer.updating
            ) {
              mediaSource.endOfStream();
            }
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("English audio stream failed."),
            );
          }
        })();
      },
      { once: true },
    );
  });
}

async function playAudio(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  engineUsed: string | null,
  lifecycle?: VoicePlaybackLifecycle,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan?: number,
): Promise<void> {
  if (expectedGeneration !== generation) return;
  await playPreSpeechBreath({
    plan: preSpeechBreath,
    profile,
    roomAcoustics,
    stereoPan,
    isCurrent: () => expectedGeneration === generation,
  });
  if (expectedGeneration !== generation) return;
  const processing = resolveEnglishVoicePostProcessing(profile);
  const detuneCents = resolveEnglishVoicePlaybackDetuneCents(
    profile,
    engineUsed,
  );
  let played = false;
  try {
    played = await playRealtimeVoiceBytes({
      bytes,
      profile,
      seed,
      effectsEnabled,
      detuneCents,
      baseLowpassHz: processing.lowpassHz,
      voiceEffect: voiceEffectForPlayback(profile),
      roomAcoustics,
      stereoPan,
      lifecycle,
      compensateLifecycleForOutputLatency: true,
      isCurrent: () => expectedGeneration === generation,
    });
  } catch {
    // Some Safari/WebKit versions reject otherwise valid provider MP3 bytes
    // in decodeAudioData. The gesture-authorized media element below can
    // still play the same clip, so keep the soundcheck and ordinary speech
    // working through that compatibility path. It stays dry rather than
    // risking voice playback for a cosmetic room treatment.
    if (expectedGeneration !== generation) return;
  }
  if (!played) {
    await playBytesWithMedia(
      bytes,
      profile,
      expectedGeneration,
      lifecycle,
    );
    return;
  }
}

async function playChunkedEnglishResponse(
  response: Response,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number,
  seed: string,
  effectsEnabled: boolean,
  estimatedDurationMs: number,
  lifecycle?: VoicePlaybackLifecycle,
  engineUsed: string | null = null,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan = 0,
): Promise<void> {
  const totalCharacters = Math.max(
    1,
    Number(response.headers.get("x-prism-voice-characters")) || 1,
  );
  const safeEstimatedDurationMs = Math.max(1, estimatedDurationMs);
  let consumedCharacters = 0;
  let playedChunks = 0;
  let playbackStarted = false;

  for await (const chunk of readEnglishVoiceWaveStream(response)) {
    if (expectedGeneration !== generation) return;
    const segmentStartMs =
      safeEstimatedDurationMs * (consumedCharacters / totalCharacters);
    const segmentEndMs =
      safeEstimatedDurationMs *
      (Math.min(totalCharacters, consumedCharacters + chunk.characterCount) /
        totalCharacters);
    const segmentDurationMs = Math.max(1, segmentEndMs - segmentStartMs);
    let actualChunkDurationMs: number | null = null;
    await playAudio(
      chunk.bytes,
      profile,
      expectedGeneration,
      `${seed}:chunk:${chunk.index}`,
      effectsEnabled,
      engineUsed,
      {
        onStart: (durationMs) => {
          actualChunkDurationMs = durationMs;
          if (!playbackStarted) {
            playbackStarted = true;
            lifecycle?.onStart?.(safeEstimatedDurationMs);
          }
        },
        onProgress: (elapsedMs) => {
          const progress = actualChunkDurationMs
            ? Math.min(1, elapsedMs / actualChunkDurationMs)
            : Math.min(1, elapsedMs / segmentDurationMs);
          lifecycle?.onProgress?.(
            segmentStartMs + segmentDurationMs * progress,
            safeEstimatedDurationMs,
          );
        },
        // The outer stream owns the single lifecycle end event.
        onEnd: () => undefined,
      },
      roomAcoustics,
      playedChunks === 0 ? preSpeechBreath : null,
      stereoPan,
    );
    playedChunks += 1;
    consumedCharacters += chunk.characterCount;
    lifecycle?.onProgress?.(segmentEndMs, safeEstimatedDurationMs);
  }

  if (expectedGeneration !== generation) return;
  if (playedChunks === 0 || !playbackStarted) {
    throw new Error("Local voice stream returned no playable audio.");
  }
  lifecycle?.onProgress?.(safeEstimatedDurationMs, safeEstimatedDurationMs);
  lifecycle?.onEnd?.();
}

export function enqueueEnglishVoice(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  seed = "english-preview",
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  engineUsed: string | null = null,
  deliveryMood?: VoiceDeliveryMood | null,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan = 0,
): Promise<void> {
  const expectedGeneration = generation;
  const playbackProfile = {
    ...applyVoiceDeliveryMoodToProfile(profile, deliveryMood),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  queue = queue
    .catch(() => undefined)
    .then(() =>
      playAudio(
        bytes,
        playbackProfile,
        expectedGeneration,
        seed,
        effectsEnabled,
        engineUsed,
        lifecycle,
        roomAcoustics,
        preSpeechBreath,
        stereoPan,
      ),
    );
  return queue;
}

export function enqueueStreamingEnglishVoice(
  response: Response,
  profile: BotAudioVoiceProfileV1,
  seed = "english-stream",
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  deliveryMood?: VoiceDeliveryMood | null,
  estimatedDurationMs = 1,
  preSpeechBreath?: PreSpeechBreathPlan | null,
): Promise<void> {
  void seed;
  const expectedGeneration = generation;
  const playbackProfile = {
    ...applyVoiceDeliveryMoodToProfile(profile, deliveryMood),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  if (
    !englishVoiceProfileSupportsStreaming(
      profile,
      effectsEnabled,
      deliveryMood,
    )
  ) {
    return Promise.reject(
      new Error("This English voice profile requires buffered playback."),
    );
  }
  queue = queue
    .catch(() => undefined)
    .then(() =>
      playStreamingResponseWithMedia(
        response,
        playbackProfile,
        expectedGeneration,
        estimatedDurationMs,
        lifecycle,
        preSpeechBreath,
      ),
    );
  return queue;
}

export function enqueueChunkedEnglishVoice(
  response: Response,
  profile: BotAudioVoiceProfileV1,
  seed = "english-local-stream",
  effectsEnabled = true,
  globalVolume = 1,
  lifecycle?: VoicePlaybackLifecycle,
  engineUsed: string | null = null,
  deliveryMood?: VoiceDeliveryMood | null,
  estimatedDurationMs = 1,
  roomAcoustics?: RoomAcousticsSend,
  preSpeechBreath?: PreSpeechBreathPlan | null,
  stereoPan = 0,
): Promise<void> {
  const expectedGeneration = generation;
  const playbackProfile = {
    ...applyVoiceDeliveryMoodToProfile(profile, deliveryMood),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  queue = queue
    .catch(() => undefined)
    .then(() =>
      playChunkedEnglishResponse(
        response,
        playbackProfile,
        expectedGeneration,
        seed,
        effectsEnabled,
        estimatedDurationMs,
        lifecycle,
        engineUsed,
        roomAcoustics,
        preSpeechBreath,
        stereoPan,
      ),
    );
  return queue;
}

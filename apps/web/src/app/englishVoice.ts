import {
  applyVoiceDeliveryMoodToProfile,
  botAudioVoiceProfileForFeelLane,
  botVoiceFeelLaneForEngine,
  normalizeBotAudioVoiceProfileV1,
  normalizeLocalVoiceAccentLocale,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeBotVoiceVolume,
  normalizeVoiceEffect,
  resolveVoicePlaybackTransform,
  VOICE_VOCAL_ACTIONS,
  VOICE_VOCAL_ACTION_MODIFIERS,
  type BotAudioVoiceProfileV1,
  type EnglishPacingProfileV1,
  type ResolvedLocalVoicePronunciationV1,
  type ResolvedLocalVoiceSpeechprintV1,
  type VoicePerformanceVocalActionSegmentV1,
  type VoiceEffect,
  type VoiceDeliveryMood,
} from "@localai/shared";
import {
  beginVoicePlaybackProgress,
  estimateVoiceOutputLatencyMs,
  playPreSpeechBreath,
  playRealtimeVoiceBytes,
  prepareRealtimeVoiceAudio,
  releaseRealtimeVoiceAudio,
  stopRealtimeVoiceAudio,
  voiceReleaseGainAt,
  type VoicePlaybackChannel,
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";
import type { PreSpeechBreathPlan } from "./preSpeechBreath.ts";
import { resolveEnglishClauseGap } from "./englishClauseBreath.ts";
import type { RoomAcousticsSend } from "./roomAcoustics.ts";
import {
  prismAudioContext,
  replayAudioMasterCaptureActive,
  routeAudioElementToPrismOutput,
} from "./replayAudioMasterCapture.ts";
import { publishBotVoiceLightLevel } from "./voiceLightEnvelope.ts";
import { localVocalActionWave } from "./localVocalActions.ts";

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
  localEngine?: string | null;
  modelHash?: string | null;
  notice?: string | null;
  resolvedPronunciation?: ResolvedLocalVoicePronunciationV1 | null;
  resolvedSpeechprint?: ResolvedLocalVoiceSpeechprintV1 | null;
}

export interface EnglishVoiceWaveStreamChunk {
  index: number;
  characterCount: number;
  text: string | null;
  bytes: ArrayBuffer;
  kind: "speech" | "vocal-action";
  action: VoicePerformanceVocalActionSegmentV1["action"] | null;
  modifiers: VoicePerformanceVocalActionSegmentV1["modifiers"];
  authoredText: string | null;
  sourceStart: number | null;
  sourceEnd: number | null;
}

const MEDIA_PLAY_START_TIMEOUT_MS = 1500;
const STREAM_MEDIA_PLAY_START_TIMEOUT_MS = 5000;

export function readEnglishVoiceResolvedPronunciation(
  headers: Pick<Headers, "get">,
): ResolvedLocalVoicePronunciationV1 | null {
  const status = headers.get("x-prism-pronunciation-status");
  if (status !== "natural" && status !== "applied" && status !== "suspended") {
    return null;
  }
  const reasonHeader = headers.get("x-prism-pronunciation-reason");
  return {
    requestedBase: normalizeLocalVoicePronunciationBase(
      headers.get("x-prism-pronunciation-requested"),
    ),
    sourceLocale: normalizeLocalVoiceAccentLocale(
      headers.get("x-prism-pronunciation-source-locale"),
      "en-US",
    ),
    resolvedBaseLocale:
      headers.get("x-prism-pronunciation-base-locale") === "en-GB"
        ? "en-GB"
        : "en-US",
    status,
    reason:
      reasonHeader === "engine-unsupported" || reasonHeader === "system-voice"
        ? reasonHeader
        : null,
  };
}

export function readEnglishVoiceResolvedSpeechprint(
  headers: Pick<Headers, "get">,
): ResolvedLocalVoiceSpeechprintV1 | null {
  const status = headers.get("x-prism-speechprint-status");
  if (status !== "natural" && status !== "applied" && status !== "suspended") {
    return null;
  }
  const requestedInfluence = normalizeLocalVoiceSpeechprintInfluence(
    headers.get("x-prism-speechprint-id"),
  );
  const reasonHeader = headers.get("x-prism-speechprint-reason");
  const reason =
    reasonHeader === "engine-unsupported" || reasonHeader === "system-voice"
      ? reasonHeader
      : null;
  const rulesetSha256 = headers.get("x-prism-speechprint-sha256");
  return {
    requestedInfluence,
    appliedInfluence:
      status === "applied" && requestedInfluence !== "none"
        ? requestedInfluence
        : null,
    strength: normalizeLocalVoiceSpeechprintStrength(
      headers.get("x-prism-speechprint-strength"),
    ),
    baseLocale:
      headers.get("x-prism-speechprint-base-locale")?.slice(0, 32) ?? "en-US",
    status,
    reason,
    rulesetVersion:
      headers.get("x-prism-speechprint-ruleset")?.slice(0, 32) ?? null,
    rulesetSha256:
      rulesetSha256 && /^[a-f0-9]{64}$/iu.test(rulesetSha256)
        ? rulesetSha256.toLowerCase()
        : null,
  };
}

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
  const vocalAction = payload.kind === "vocal-action";
  const audioBase64 =
    typeof payload.audioBase64 === "string" ? payload.audioBase64.trim() : "";
  const action =
    vocalAction &&
    typeof payload.action === "string" &&
    (VOICE_VOCAL_ACTIONS as readonly string[]).includes(payload.action)
      ? (payload.action as VoicePerformanceVocalActionSegmentV1["action"])
      : null;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    !Number.isFinite(characterCount) ||
    characterCount < 0 ||
    (vocalAction ? !action : characterCount <= 0 || !audioBase64)
  ) {
    throw new Error("Local voice stream returned an invalid audio chunk.");
  }
  return {
    index,
    characterCount,
    text: typeof payload.text === "string" ? payload.text : null,
    bytes: audioBase64 ? decodedBase64Bytes(audioBase64) : new ArrayBuffer(0),
    kind: vocalAction ? "vocal-action" : "speech",
    action,
    modifiers: Array.isArray(payload.modifiers)
      ? payload.modifiers.filter(
          (modifier): modifier is VoicePerformanceVocalActionSegmentV1["modifiers"][number] =>
            typeof modifier === "string" &&
            (VOICE_VOCAL_ACTION_MODIFIERS as readonly string[]).includes(modifier),
        )
      : [],
    authoredText:
      typeof payload.authoredText === "string" ? payload.authoredText : null,
    sourceStart:
      Number.isInteger(payload.sourceStart) ? Number(payload.sourceStart) : null,
    sourceEnd:
      Number.isInteger(payload.sourceEnd) ? Number(payload.sourceEnd) : null,
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
  const localEngine = response.headers.get("x-prism-local-voice-engine");
  const modelHash = response.headers.get("x-prism-voice-model-sha256");
  const resolvedPronunciation = readEnglishVoiceResolvedPronunciation(
    response.headers,
  );
  const resolvedSpeechprint = readEnglishVoiceResolvedSpeechprint(
    response.headers,
  );
  const encodedNotice = response.headers.get("x-prism-voice-notice");
  let notice: string | null = null;
  if (encodedNotice) {
    try {
      notice = decodeURIComponent(encodedNotice);
    } catch {
      notice = encodedNotice;
    }
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      bytes: await response.arrayBuffer(),
      alignment: null,
      audioContentType: contentType,
      engineUsed,
      localEngine,
      modelHash,
      notice,
      resolvedPronunciation,
      resolvedSpeechprint,
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
    localEngine,
    modelHash,
    notice,
    resolvedPronunciation,
    resolvedSpeechprint,
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
  // Local and Premium each own pitch / pace / lilt. Premium still skips local
  // timbre (warmth/EQ/resonance) via localToneEnabled.
  const lane = botVoiceFeelLaneForEngine(engineUsed);
  return resolveVoicePlaybackTransform(
    botAudioVoiceProfileForFeelLane(rawProfile, lane),
  ).pitchCents;
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
  // Pitch and lilt need the Web Audio formant graph; media elements can only
  // change tempo while preserving the provider's native pitch.
  if (profile.pitch !== 0 || profile.lilt !== 0) {
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
const mediaOutputCleanup = new WeakMap<HTMLMediaElement, () => void>();

function routeEnglishMediaOutput(
  audio: HTMLMediaElement,
  lifecycle?: VoicePlaybackLifecycle,
): void {
  if (mediaOutputCleanup.has(audio)) return;
  const onLevel = lifecycle?.onLevel || lifecycle?.voiceLightTarget
    ? (level: number) => {
        if (lifecycle?.voiceLightTarget) {
          publishBotVoiceLightLevel(lifecycle.voiceLightTarget, level);
        }
        lifecycle?.onLevel?.(level);
      }
    : undefined;
  const cleanup = routeAudioElementToPrismOutput(audio, { onLevel });
  if (!cleanup && replayAudioMasterCaptureActive()) {
    throw new Error("English voice could not enter the faithful session mix.");
  }
  if (cleanup) {
    mediaOutputCleanup.set(audio, cleanup);
  } else if (onLevel) {
    let active = true;
    audio.addEventListener("playing", () => {
      if (active) onLevel(0.22);
    });
    audio.addEventListener("ended", () => {
      if (!active) return;
      active = false;
      onLevel(0);
    });
    mediaOutputCleanup.set(audio, () => {
      if (!active) return;
      active = false;
      onLevel(0);
    });
  }
}

function englishMediaOutputLatencyMs(): number {
  const context = prismAudioContext();
  return context ? estimateVoiceOutputLatencyMs(context) : 0;
}
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
    mediaOutputCleanup.get(activeMedia)?.();
    mediaOutputCleanup.delete(activeMedia);
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
  options: {
    preservePreparedMedia?: boolean;
    preserveCompletedTails?: boolean;
  } = {},
): void {
  generation += 1;
  stopRealtimeVoiceAudio("primary", {
    preserveCompletedTails: options.preserveCompletedTails,
  });
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
  lifecycle?: VoicePlaybackLifecycle,
  isPlaybackStillValid?: () => boolean,
): Promise<void> {
  const playbackStillValid = (): boolean =>
    expectedGeneration === generation && (isPlaybackStillValid?.() ?? true);
  if (!playbackStillValid()) return;
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
  routeEnglishMediaOutput(audio, lifecycle);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let naturalEndTimer: number | null = null;
    let progress: ReturnType<typeof beginVoicePlaybackProgress> | null = null;
    const beginAudiblePlayback = () => {
      if (started) return;
      if (!playbackStillValid()) {
        cancel();
        return;
      }
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
          null,
          { startDelayMs: englishMediaOutputLatencyMs() },
        );
      } else {
        lifecycle?.onStart?.(null);
      }
      if (activeMediaStartTimer !== null) {
        window.clearTimeout(activeMediaStartTimer);
        activeMediaStartTimer = null;
      }
    };
    const finish = (error?: Error, completed = true) => {
      if (settled) return;
      settled = true;
      if (naturalEndTimer !== null) {
        window.clearTimeout(naturalEndTimer);
        naturalEndTimer = null;
      }
      if (activeMediaResolve === cancel) activeMediaResolve = null;
      if (error || !completed) progress?.cancel();
      else progress?.finish();
      progress = null;
      releaseActiveMedia(!error);
      if (error || !completed) lifecycle?.onCancel?.();
      else lifecycle?.onEnd?.();
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(undefined, false);
    activeMediaResolve = cancel;
    audio.addEventListener(
      "ended",
      () => {
        const outputLatencyMs = englishMediaOutputLatencyMs();
        if (outputLatencyMs <= 0) {
          finish();
          return;
        }
        naturalEndTimer = window.setTimeout(() => {
          naturalEndTimer = null;
          finish();
        }, outputLatencyMs);
      },
      { once: true },
    );
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
    (response.headers.get("x-prism-voice-stream") === "wav-chunks-v1" ||
      response.headers.get("x-prism-voice-stream") === "wav-chunks-v2")
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
  routeEnglishMediaOutput(audio, lifecycle);

  const reader = body.getReader();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let naturalEndTimer: number | null = null;
    let progress: ReturnType<typeof beginVoicePlaybackProgress> | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const playbackTempo = resolveVoicePlaybackTransform(profile).tempo;
    const safeEstimatedDurationMs = Math.max(1, Math.round(estimatedDurationMs));
    const finish = (error?: Error, completed = true) => {
      if (settled) return;
      settled = true;
      if (naturalEndTimer !== null) {
        window.clearTimeout(naturalEndTimer);
        naturalEndTimer = null;
      }
      if (activeMediaResolve === cancel) activeMediaResolve = null;
      if (activeMediaStartTimer !== null) {
        window.clearTimeout(activeMediaStartTimer);
        activeMediaStartTimer = null;
      }
      void reader.cancel().catch(() => undefined);
      if (error || !completed) progress?.cancel();
      else progress?.finish();
      progress = null;
      releaseActiveMedia(!error);
      if (error || !completed) lifecycle?.onCancel?.();
      else lifecycle?.onEnd?.();
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(undefined, false);
    activeMediaResolve = cancel;
    audio.addEventListener(
      "ended",
      () => {
        const outputLatencyMs = englishMediaOutputLatencyMs();
        if (outputLatencyMs <= 0) {
          finish();
          return;
        }
        naturalEndTimer = window.setTimeout(() => {
          naturalEndTimer = null;
          finish();
        }, outputLatencyMs);
      },
      { once: true },
    );
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
          null,
          { startDelayMs: englishMediaOutputLatencyMs() },
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
          cancel();
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
                  onStart: lifecycle?.onPresenceStart,
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
  isPlaybackStillValid?: () => boolean,
  channel: VoicePlaybackChannel = "primary",
): Promise<void> {
  const playbackStillValid = (): boolean =>
    expectedGeneration === generation && (isPlaybackStillValid?.() ?? true);
  if (!playbackStillValid()) return;
  await playPreSpeechBreath({
    plan: preSpeechBreath,
    profile,
    roomAcoustics,
    stereoPan,
    isCurrent: playbackStillValid,
    onStart: lifecycle?.onPresenceStart,
  });
  if (!playbackStillValid()) return;
  const processing = resolveEnglishVoicePostProcessing(profile);
  const localToneEnabled = engineUsed !== "elevenlabs";
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
      baseLowpassHz: localToneEnabled ? processing.lowpassHz : 20_000,
      localToneEnabled,
      voiceEffect: voiceEffectForPlayback(profile),
      roomAcoustics,
      stereoPan,
      channel,
      lifecycle,
      compensateLifecycleForOutputLatency: true,
      isCurrent: playbackStillValid,
    });
  } catch {
    // Some Safari/WebKit versions reject otherwise valid provider MP3 bytes
    // in decodeAudioData. The gesture-authorized media element below can
    // still play the same clip, so keep the soundcheck and ordinary speech
    // working through that compatibility path. It stays dry rather than
    // risking voice playback for a cosmetic room treatment.
    if (!playbackStillValid()) return;
  }
  if (!played) {
    if (!playbackStillValid()) return;
    await playBytesWithMedia(
      bytes,
      profile,
      expectedGeneration,
      lifecycle,
      isPlaybackStillValid,
    );
    return;
  }
}

async function waitEnglishClausePauseMs(
  pauseMs: number,
  expectedGeneration: number,
): Promise<number> {
  const safeMs = Math.max(0, Math.round(pauseMs));
  if (safeMs <= 0 || expectedGeneration !== generation) return 0;
  const startedAt = Date.now();
  await new Promise<void>((resolve) => {
    const finish = () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, safeMs);
    const poll = window.setInterval(() => {
      if (expectedGeneration !== generation) finish();
    }, 32);
  });
  if (expectedGeneration !== generation) {
    return Math.max(0, Date.now() - startedAt);
  }
  return safeMs;
}

async function playEnglishClauseGap(args: {
  trailingText: string;
  chunkIndex: number;
  seed: string;
  profile: BotAudioVoiceProfileV1;
  expectedGeneration: number;
  effectsEnabled: boolean;
  fullText?: string | null;
  authoredPerformanceText?: string | null;
  roomAcoustics?: RoomAcousticsSend;
  stereoPan?: number;
  pacingProfile?: EnglishPacingProfileV1 | null;
  kokoroPunctuationPacing?: boolean;
}): Promise<number> {
  if (args.expectedGeneration !== generation) return 0;
  const gap = resolveEnglishClauseGap({
    seed: args.seed,
    chunkIndex: args.chunkIndex,
    trailingText: args.trailingText,
    fullText: args.fullText,
    authoredPerformanceText: args.authoredPerformanceText,
    enabled: args.effectsEnabled,
    pacingProfile: args.pacingProfile,
    kokoroPunctuationPacing: args.kokoroPunctuationPacing,
  });
  if (gap.breath) {
    const startedAt = Date.now();
    await playPreSpeechBreath({
      plan: gap.breath,
      profile: args.profile,
      roomAcoustics: args.roomAcoustics,
      stereoPan: args.stereoPan,
      isCurrent: () => args.expectedGeneration === generation,
    });
    return Math.max(0, Date.now() - startedAt);
  }
  return waitEnglishClausePauseMs(gap.pauseMs, args.expectedGeneration);
}

/**
 * Report a duration floor that grows with real audible time so mode watchdogs
 * (Signal/Coffee) do not hard-stop still-playing chunked speech when clause
 * pauses or slow TTS overrun the initial text estimate.
 */
export function reportedChunkedVoiceDurationMs(args: {
  estimatedDurationMs: number;
  audibleElapsedMs: number;
  remainingEstimateMs: number;
}): number {
  const estimated = Math.max(1, Math.round(args.estimatedDurationMs));
  const audible = Math.max(0, Math.round(args.audibleElapsedMs));
  const remaining = Math.max(0, Math.round(args.remainingEstimateMs));
  return Math.max(estimated, audible + remaining, 1);
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
  authoredPerformanceText?: string | null,
  pacingProfile?: EnglishPacingProfileV1 | null,
): Promise<void> {
  const totalCharacters = Math.max(
    1,
    Number(response.headers.get("x-prism-voice-characters")) || 1,
  );
  const safeEstimatedDurationMs = Math.max(1, estimatedDurationMs);
  const kokoroPunctuationPacing =
    response.headers.get("x-prism-voice-pacing") ===
    "kokoro-punctuation-v1";
  let consumedCharacters = 0;
  let playedChunks = 0;
  let playbackStarted = false;
  let audibleSegmentCursorMs = 0;
  let previousSpeechChunk: {
    text: string;
    index: number;
    sourceEnd: number;
  } | null = null;

  const remainingEstimateAfterCharacters = (charactersHeard: number): number =>
    safeEstimatedDurationMs *
    Math.max(0, totalCharacters - charactersHeard) /
    totalCharacters;

  const reportLifecycleProgress = (
    audibleElapsedMs: number,
    remainingEstimateMs: number,
  ): void => {
    lifecycle?.onProgress?.(
      Math.max(0, Math.round(audibleElapsedMs)),
      reportedChunkedVoiceDurationMs({
        estimatedDurationMs: safeEstimatedDurationMs,
        audibleElapsedMs,
        remainingEstimateMs,
      }),
    );
  };

  for await (const chunk of readEnglishVoiceWaveStream(response)) {
    if (expectedGeneration !== generation) return;
    if (chunk.kind === "vocal-action" && chunk.action) {
      previousSpeechChunk = null;
      let actualActionDurationMs: number | null = null;
      let actualActionElapsedMs = 0;
      const actionSegment: VoicePerformanceVocalActionSegmentV1 = {
        kind: "vocal-action",
        action: chunk.action,
        modifiers: chunk.modifiers,
        authoredText: chunk.authoredText ?? chunk.action,
        sourceStart: chunk.sourceStart ?? 0,
        sourceEnd: chunk.sourceEnd ?? 0,
      };
      const remainingAfterAction = remainingEstimateAfterCharacters(
        consumedCharacters,
      );
      await playAudio(
        localVocalActionWave({
          segment: actionSegment,
          profile,
          seed: `${seed}:action:${chunk.index}`,
        }),
        profile,
        expectedGeneration,
        `${seed}:action:${chunk.index}`,
        effectsEnabled,
        "procedural-vocal-action",
        {
          onStart: (durationMs) => {
            actualActionDurationMs = durationMs;
            const actionFloor = Math.max(1, durationMs ?? 1);
            const reported = reportedChunkedVoiceDurationMs({
              estimatedDurationMs: safeEstimatedDurationMs,
              audibleElapsedMs: audibleSegmentCursorMs,
              remainingEstimateMs: actionFloor + remainingAfterAction,
            });
            if (!playbackStarted) {
              playbackStarted = true;
              lifecycle?.onStart?.(reported);
            } else {
              lifecycle?.onProgress?.(audibleSegmentCursorMs, reported);
            }
            // Publish the segment as audio begins so mouth/text never race on
            // the full-utterance estimate while this clip is still playing.
            lifecycle?.onSegmentTiming?.({
              kind: "vocal-action",
              sourceStart: chunk.sourceStart ?? 0,
              sourceEnd: chunk.sourceEnd ?? chunk.sourceStart ?? 0,
              startMs: audibleSegmentCursorMs,
              endMs: audibleSegmentCursorMs + actionFloor,
              heard: true,
              action: chunk.action,
            });
          },
          onProgress: (elapsedMs) => {
            actualActionElapsedMs = Math.max(actualActionElapsedMs, elapsedMs);
            reportLifecycleProgress(
              audibleSegmentCursorMs + elapsedMs,
              Math.max(0, (actualActionDurationMs ?? 1) - elapsedMs) +
                remainingAfterAction,
            );
          },
          onEnd: () => undefined,
        },
        roomAcoustics,
        null,
        stereoPan,
      );
      const actionHeardMs = Math.max(
        actualActionElapsedMs,
        expectedGeneration === generation ? (actualActionDurationMs ?? 1) : 0,
      );
      audibleSegmentCursorMs += actionHeardMs;
      if (expectedGeneration !== generation) return;
      reportLifecycleProgress(
        audibleSegmentCursorMs,
        remainingEstimateAfterCharacters(consumedCharacters),
      );
      playedChunks += 1;
      continue;
    }

    if (previousSpeechChunk) {
      const gapHeardMs = await playEnglishClauseGap({
        trailingText: previousSpeechChunk.text,
        chunkIndex: previousSpeechChunk.index,
        seed,
        profile,
        expectedGeneration,
        effectsEnabled,
        authoredPerformanceText,
        roomAcoustics,
        stereoPan,
        pacingProfile,
        kokoroPunctuationPacing,
      });
      if (expectedGeneration !== generation) return;
      if (gapHeardMs > 0) {
        // Silence is part of the audible clock: emit a non-heard segment so
        // on-screen text and mouth hold through the clause pause.
        lifecycle?.onSegmentTiming?.({
          kind: "speech",
          sourceStart: previousSpeechChunk.sourceEnd,
          sourceEnd: previousSpeechChunk.sourceEnd,
          startMs: audibleSegmentCursorMs,
          endMs: audibleSegmentCursorMs + gapHeardMs,
          heard: false,
        });
        audibleSegmentCursorMs += gapHeardMs;
        reportLifecycleProgress(
          audibleSegmentCursorMs,
          remainingEstimateAfterCharacters(consumedCharacters),
        );
      }
    }

    const segmentStartMs =
      safeEstimatedDurationMs * (consumedCharacters / totalCharacters);
    const segmentEndMs =
      safeEstimatedDurationMs *
      (Math.min(totalCharacters, consumedCharacters + chunk.characterCount) /
        totalCharacters);
    const segmentDurationMs = Math.max(1, segmentEndMs - segmentStartMs);
    const remainingAfterChunk = remainingEstimateAfterCharacters(
      consumedCharacters + chunk.characterCount,
    );
    let actualChunkDurationMs: number | null = null;
    let actualChunkElapsedMs = 0;
    const sourceStart =
      typeof chunk.sourceStart === "number" &&
      typeof chunk.sourceEnd === "number" &&
      chunk.sourceEnd > chunk.sourceStart
        ? chunk.sourceStart
        : consumedCharacters;
    const sourceEnd =
      typeof chunk.sourceStart === "number" &&
      typeof chunk.sourceEnd === "number" &&
      chunk.sourceEnd > chunk.sourceStart
        ? chunk.sourceEnd
        : sourceStart +
          Math.max(
            1,
            chunk.text?.length ??
              Math.max(0, chunk.characterCount - (chunk.index > 0 ? 1 : 0)),
          );
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
            const chunkFloor = Math.max(1, durationMs ?? segmentDurationMs);
            const reported = reportedChunkedVoiceDurationMs({
              estimatedDurationMs: safeEstimatedDurationMs,
              audibleElapsedMs: audibleSegmentCursorMs,
              remainingEstimateMs: chunkFloor + remainingAfterChunk,
            });
            if (!playbackStarted) {
              playbackStarted = true;
              lifecycle?.onStart?.(reported);
            } else {
              lifecycle?.onProgress?.(audibleSegmentCursorMs, reported);
            }
            // Lock reveal/mouth to this clause immediately. Waiting until the
            // chunk ends left a weight-based full-line clock racing ahead of
            // the audio (mouth + stream finishing early inside each phrase).
            lifecycle?.onSegmentTiming?.({
              kind: "speech",
              sourceStart,
              sourceEnd,
              startMs: audibleSegmentCursorMs,
              endMs: audibleSegmentCursorMs + chunkFloor,
              heard: true,
            });
          },
          onProgress: (elapsedMs) => {
            actualChunkElapsedMs = Math.max(actualChunkElapsedMs, elapsedMs);
            reportLifecycleProgress(
              audibleSegmentCursorMs + elapsedMs,
              Math.max(
                0,
                (actualChunkDurationMs ?? segmentDurationMs) - elapsedMs,
              ) + remainingAfterChunk,
            );
          },
          // The outer stream owns the single lifecycle end event.
          onEnd: () => undefined,
        },
        roomAcoustics,
        playedChunks === 0 ? preSpeechBreath : null,
        stereoPan,
      );
    const speechHeardMs = Math.max(
      actualChunkElapsedMs,
      expectedGeneration === generation
        ? (actualChunkDurationMs ?? segmentDurationMs)
        : 0,
    );
    audibleSegmentCursorMs += speechHeardMs;
    if (expectedGeneration !== generation) return;
    previousSpeechChunk = {
      text: chunk.text?.trim() || "",
      index: chunk.index,
      sourceEnd: chunk.sourceEnd ?? chunk.sourceStart ?? 0,
    };
    playedChunks += 1;
    consumedCharacters += chunk.characterCount;
    reportLifecycleProgress(
      audibleSegmentCursorMs,
      remainingEstimateAfterCharacters(consumedCharacters),
    );
  }

  if (expectedGeneration !== generation) return;
  if (playedChunks === 0 || !playbackStarted) {
    throw new Error("Local voice stream returned no playable audio.");
  }
  const finalDurationMs = reportedChunkedVoiceDurationMs({
    estimatedDurationMs: safeEstimatedDurationMs,
    audibleElapsedMs: audibleSegmentCursorMs,
    remainingEstimateMs: 0,
  });
  lifecycle?.onProgress?.(
    Math.max(audibleSegmentCursorMs, finalDurationMs),
    finalDurationMs,
  );
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
  isPlaybackStillValid?: () => boolean,
  channel: VoicePlaybackChannel = "primary",
): Promise<void> {
  const expectedGeneration = generation;
  const feelProfile = botAudioVoiceProfileForFeelLane(
    profile,
    botVoiceFeelLaneForEngine(engineUsed),
  );
  const playbackProfile = {
    ...applyVoiceDeliveryMoodToProfile(feelProfile, deliveryMood),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  const run = () =>
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
      isPlaybackStillValid,
      channel,
    );
  // Crosstalk / reaction must not wait behind the primary English queue or the
  // interrupt shout cannot overlap the cut-off line.
  if (channel !== "primary") {
    return run();
  }
  queue = queue.catch(() => undefined).then(run);
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
  // Streaming is Premium-only today; project that Feel lane before tempo/pitch.
  const feelProfile = botAudioVoiceProfileForFeelLane(profile, "premium");
  const playbackProfile = {
    ...applyVoiceDeliveryMoodToProfile(feelProfile, deliveryMood),
    volume: normalizeBotVoiceVolume(globalVolume),
  };
  if (
    !englishVoiceProfileSupportsStreaming(
      feelProfile,
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
  pacingProfile?: EnglishPacingProfileV1 | null,
): Promise<void> {
  const expectedGeneration = generation;
  const feelProfile = botAudioVoiceProfileForFeelLane(
    profile,
    botVoiceFeelLaneForEngine(engineUsed),
  );
  const playbackProfile = {
    ...applyVoiceDeliveryMoodToProfile(feelProfile, deliveryMood),
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
        null,
        pacingProfile,
      ),
    );
  return queue;
}

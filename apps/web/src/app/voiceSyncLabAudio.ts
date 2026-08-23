"use client";

import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  VOICE_ALIGNMENT_TRACE_VERSION,
  normalizeVoiceAlignmentTraceV1,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type LocalVoiceEnginePreference,
  type VoiceAlignmentMouthTransitionV1,
  type VoiceAlignmentStatusV1,
  type VoiceAlignmentTraceV1,
} from "@localai/shared";
import {
  buildBottishPlaybackPlan,
  encodeBottishPlanWave,
  enqueueBabbleVoice,
  enqueueBottishVoice,
  prepareBottishVoice,
  stopBottishVoice,
  type BottishPlan,
} from "./bottishVoice.ts";
import {
  enqueueEnglishVoice,
  prepareEnglishVoice,
  readEnglishVoiceSynthesisClip,
  scaleEnglishVoiceAlignmentForPlayback,
  stopEnglishVoice,
  type EnglishVoiceCharacterAlignment,
} from "./englishVoice.ts";
import { prismAudioContext } from "./replayAudioMasterCapture.ts";
import {
  startVoiceSyncLabPcmCapture,
  type VoiceSyncLabPcmCaptureResult,
  type VoiceSyncLabPcmCaptureSession,
} from "./voiceSyncLabPcmCapture.ts";
import {
  VOICE_COMPLETED_OVERLAP_TAIL_MS,
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";
import {
  bottishMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtAlignedElapsedMs,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth.ts";

export const VOICE_SYNC_LAB_SYNTHESIS_PATH = "/api/voices/synthesize";

export type VoiceSyncLabEngineId =
  | "local-auto"
  | "local-instant"
  | "local-voice-plus"
  | "system"
  | "elevenlabs"
  | "babble"
  | "bottish";

export type VoiceSyncLabAlignmentStatus = VoiceAlignmentStatusV1;
type NormalizedVoiceSyncLabProfile = ReturnType<
  typeof normalizeBotAudioVoiceProfileV1
>;

export interface VoiceSyncLabStressCorpusEntry {
  id: string;
  label: string;
  text: string;
  tags: readonly string[];
}

/**
 * Short, deterministic lines that expose the mouth families PRISM actually
 * renders: closures, rounding, sibilants, pauses, digits, and interruption.
 */
export const VOICE_SYNC_LAB_STRESS_CORPUS = [
  {
    id: "bilabial-closures",
    label: "P / B / M closures",
    text: "Papa packed blue maps beside Mom.",
    tags: ["bilabial", "closure", "plosive"],
  },
  {
    id: "rounded-vowels",
    label: "Rounded vowels",
    text: "Oona knew two blue moons would move soon.",
    tags: ["vowel", "rounding", "glide"],
  },
  {
    id: "sibilants-fricatives",
    label: "Sibilants and fricatives",
    text: "Sasha says fresh visions shimmer softly.",
    tags: ["sibilant", "fricative", "teeth"],
  },
  {
    id: "dense-transitions",
    label: "Dense transitions",
    text: "Bright clocks click, quick drums crack, and red gears turn.",
    tags: ["cluster", "transition", "consonant"],
  },
  {
    id: "punctuation-rests",
    label: "Punctuation rests",
    text: "Wait... listen. Then, when it is quiet—begin again.",
    tags: ["pause", "silence", "punctuation"],
  },
  {
    id: "digits-symbols",
    label: "Digits and symbols",
    text: "At 7:42, unit B-12 reached 99 percent.",
    tags: ["digits", "symbols", "normalization"],
  },
  {
    id: "unicode-names",
    label: "Unicode names",
    text: "Zoë met Søren at the café beside Łukasz.",
    tags: ["unicode", "diacritic", "name"],
  },
  {
    id: "shh-interruption",
    label: "Shh cutoff probe",
    text: "Shh—stop exactly after the word amber, then discard the rest.",
    tags: ["shh", "interrupt", "cutoff"],
  },
] as const satisfies readonly VoiceSyncLabStressCorpusEntry[];

export interface VoiceSyncLabEngineOption {
  id: VoiceSyncLabEngineId;
  label: string;
  mode: "babble" | "bottish" | "english";
  requestEngine: "builtin" | "elevenlabs" | null;
  localEnginePreference: LocalVoiceEnginePreference | null;
  alignmentExpectation: "provider" | "procedural" | "unavailable";
  requiresOnline: boolean;
  requiresSystemVoice: boolean;
}

export const VOICE_SYNC_LAB_ENGINE_OPTIONS = [
  {
    id: "local-auto",
    label: "LOCAL Auto",
    mode: "english",
    requestEngine: "builtin",
    localEnginePreference: "auto",
    alignmentExpectation: "unavailable",
    requiresOnline: false,
    requiresSystemVoice: false,
  },
  {
    id: "local-instant",
    label: "LOCAL Instant",
    mode: "english",
    requestEngine: "builtin",
    localEnginePreference: "instant",
    alignmentExpectation: "unavailable",
    requiresOnline: false,
    requiresSystemVoice: false,
  },
  {
    id: "local-voice-plus",
    label: "LOCAL Voice+",
    mode: "english",
    requestEngine: "builtin",
    localEnginePreference: "voice-plus",
    alignmentExpectation: "unavailable",
    requiresOnline: false,
    requiresSystemVoice: false,
  },
  {
    id: "system",
    label: "System voice",
    mode: "english",
    requestEngine: "builtin",
    localEnginePreference: "instant",
    alignmentExpectation: "unavailable",
    requiresOnline: false,
    requiresSystemVoice: true,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    mode: "english",
    requestEngine: "elevenlabs",
    localEnginePreference: null,
    alignmentExpectation: "provider",
    requiresOnline: true,
    requiresSystemVoice: false,
  },
  {
    id: "babble",
    label: "Babble",
    mode: "babble",
    requestEngine: "builtin",
    localEnginePreference: null,
    alignmentExpectation: "unavailable",
    requiresOnline: false,
    requiresSystemVoice: false,
  },
  {
    id: "bottish",
    label: "Bottish",
    mode: "bottish",
    requestEngine: null,
    localEnginePreference: null,
    alignmentExpectation: "procedural",
    requiresOnline: false,
    requiresSystemVoice: false,
  },
] as const satisfies readonly VoiceSyncLabEngineOption[];

export interface VoiceSyncLabPcm {
  container: "decoded" | "wav";
  encoding: "float" | "pcm";
  sampleRate: number;
  channelCount: number;
  bitsPerSample: number | null;
  frameCount: number;
  durationMs: number;
  channels: readonly Float32Array[];
}

export interface VoiceSyncLabWaveformBucket {
  startFrame: number;
  endFrame: number;
  min: number;
  max: number;
  peak: number;
  rms: number;
  active: boolean;
}

export interface VoiceSyncLabActivitySpan {
  startFrame: number;
  endFrame: number;
  peak: number;
  rms: number;
}

export interface VoiceSyncLabPcmAnalysis {
  waveform: VoiceSyncLabWaveformBucket[];
  activity: VoiceSyncLabActivitySpan[];
}

export interface VoiceSyncLabPcmAnalysisOptions {
  maxWaveformPoints?: number;
  activityWindowMs?: number;
  activityRmsThreshold?: number;
  activityPeakThreshold?: number;
  activityHangoverMs?: number;
  minimumActivityMs?: number;
}

function asciiAt(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function clampSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

/** Parse ordinary PCM/IEEE-float RIFF WAVE without browser audio APIs. */
export function parseVoiceSyncLabPcmWave(bytes: ArrayBuffer): VoiceSyncLabPcm {
  if (bytes.byteLength < 12) throw new Error("WAV is shorter than its RIFF header.");
  const view = new DataView(bytes);
  if (asciiAt(view, 0, 4) !== "RIFF" || asciiAt(view, 8, 4) !== "WAVE") {
    throw new Error("Audio is not a RIFF WAVE file.");
  }

  let formatOffset = -1;
  let formatSize = 0;
  const dataChunks: Array<{ offset: number; size: number }> = [];
  for (let offset = 12; offset + 8 <= view.byteLength; ) {
    const id = asciiAt(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + size > view.byteLength) {
      throw new Error(`WAV ${id || "unknown"} chunk exceeds the file length.`);
    }
    if (id === "fmt " && formatOffset < 0) {
      formatOffset = dataOffset;
      formatSize = size;
    } else if (id === "data" && size > 0) {
      dataChunks.push({ offset: dataOffset, size });
    }
    offset = dataOffset + size + (size & 1);
  }
  if (formatOffset < 0 || formatSize < 16) {
    throw new Error("WAV has no usable fmt chunk.");
  }
  if (dataChunks.length === 0) throw new Error("WAV has no audio data chunk.");

  const declaredFormatCode = view.getUint16(formatOffset, true);
  const formatCode =
    declaredFormatCode === 0xfffe && formatSize >= 40
      ? view.getUint16(formatOffset + 24, true)
      : declaredFormatCode;
  const channelCount = view.getUint16(formatOffset + 2, true);
  const sampleRate = view.getUint32(formatOffset + 4, true);
  const blockAlign = view.getUint16(formatOffset + 12, true);
  const bitsPerSample = view.getUint16(formatOffset + 14, true);
  const bytesPerSample = bitsPerSample / 8;
  const pcm = formatCode === 1;
  const float = formatCode === 3;
  if (!pcm && !float) {
    throw new Error(`Unsupported WAV format code ${formatCode}.`);
  }
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 32) {
    throw new Error("WAV channel count is invalid.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("WAV sample rate is invalid.");
  }
  const supportedPcmDepth =
    pcm && (bitsPerSample === 8 || bitsPerSample === 16 || bitsPerSample === 24 || bitsPerSample === 32);
  const supportedFloatDepth = float && (bitsPerSample === 32 || bitsPerSample === 64);
  if (!supportedPcmDepth && !supportedFloatDepth) {
    throw new Error(`Unsupported ${bitsPerSample}-bit WAV sample format.`);
  }
  if (!Number.isInteger(bytesPerSample) || blockAlign < channelCount * bytesPerSample) {
    throw new Error("WAV block alignment is invalid.");
  }

  const frameCount = dataChunks.reduce(
    (total, chunk) => total + Math.floor(chunk.size / blockAlign),
    0,
  );
  if (frameCount <= 0) throw new Error("WAV contains no complete PCM frames.");
  const channels = Array.from(
    { length: channelCount },
    () => new Float32Array(frameCount),
  );
  let outputFrame = 0;
  for (const chunk of dataChunks) {
    const chunkFrames = Math.floor(chunk.size / blockAlign);
    for (let frame = 0; frame < chunkFrames; frame += 1) {
      const frameOffset = chunk.offset + frame * blockAlign;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sampleOffset = frameOffset + channel * bytesPerSample;
        let sample = 0;
        if (float) {
          sample =
            bitsPerSample === 32
              ? view.getFloat32(sampleOffset, true)
              : view.getFloat64(sampleOffset, true);
        } else if (bitsPerSample === 8) {
          sample = (view.getUint8(sampleOffset) - 128) / 128;
        } else if (bitsPerSample === 16) {
          sample = view.getInt16(sampleOffset, true) / 0x8000;
        } else if (bitsPerSample === 24) {
          let value =
            view.getUint8(sampleOffset) |
            (view.getUint8(sampleOffset + 1) << 8) |
            (view.getUint8(sampleOffset + 2) << 16);
          if (value & 0x800000) value |= 0xff000000;
          sample = value / 0x800000;
        } else {
          sample = view.getInt32(sampleOffset, true) / 0x80000000;
        }
        channels[channel]![outputFrame] = clampSample(sample);
      }
      outputFrame += 1;
    }
  }
  return {
    container: "wav",
    encoding: float ? "float" : "pcm",
    sampleRate,
    channelCount,
    bitsPerSample,
    frameCount,
    durationMs: (frameCount / sampleRate) * 1_000,
    channels,
  };
}

export function tryParseVoiceSyncLabPcmWave(
  bytes: ArrayBuffer,
): VoiceSyncLabPcm | null {
  try {
    return parseVoiceSyncLabPcmWave(bytes);
  } catch {
    return null;
  }
}

/** Convert decoded browser audio into the same pure PCM analysis shape. */
export function voiceSyncLabPcmFromAudioBuffer(
  buffer: Pick<
    AudioBuffer,
    "duration" | "getChannelData" | "length" | "numberOfChannels" | "sampleRate"
  >,
): VoiceSyncLabPcm {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    new Float32Array(buffer.getChannelData(index)),
  );
  return {
    container: "decoded",
    encoding: "float",
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
    bitsPerSample: null,
    frameCount: buffer.length,
    durationMs: buffer.duration * 1_000,
    channels,
  };
}

function frameMetrics(
  pcm: VoiceSyncLabPcm,
  startFrame: number,
  endFrame: number,
): { min: number; max: number; peak: number; rms: number } {
  let min = 1;
  let max = -1;
  let squareSum = 0;
  let count = 0;
  // Aggregate channel energy instead of downmixing first. Averaging an
  // antiphase stereo effect can cancel genuine audible energy into silence.
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (const channel of pcm.channels) {
      const sample = channel[frame] ?? 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
      squareSum += sample * sample;
      count += 1;
    }
  }
  if (count === 0) return { min: 0, max: 0, peak: 0, rms: 0 };
  return {
    min,
    max,
    peak: Math.max(Math.abs(min), Math.abs(max)),
    rms: Math.sqrt(squareSum / count),
  };
}

/** Detect voiced/audio-active spans in final PCM frame coordinates. */
export function extractVoiceSyncLabActivity(
  pcm: VoiceSyncLabPcm,
  options: VoiceSyncLabPcmAnalysisOptions = {},
): VoiceSyncLabActivitySpan[] {
  if (pcm.frameCount <= 0) return [];
  const windowFrames = Math.max(
    1,
    Math.round((Math.max(1, options.activityWindowMs ?? 10) / 1_000) * pcm.sampleRate),
  );
  const rmsThreshold = Math.max(0, options.activityRmsThreshold ?? 0.018);
  const peakThreshold = Math.max(
    rmsThreshold,
    options.activityPeakThreshold ?? Math.max(0.045, rmsThreshold * 2.5),
  );
  const hangoverFrames = Math.max(
    0,
    Math.round((Math.max(0, options.activityHangoverMs ?? 35) / 1_000) * pcm.sampleRate),
  );
  const minimumFrames = Math.max(
    1,
    Math.round((Math.max(0, options.minimumActivityMs ?? 20) / 1_000) * pcm.sampleRate),
  );
  const activeWindows: Array<{ startFrame: number; endFrame: number }> = [];
  for (let startFrame = 0; startFrame < pcm.frameCount; startFrame += windowFrames) {
    const endFrame = Math.min(pcm.frameCount, startFrame + windowFrames);
    const metrics = frameMetrics(pcm, startFrame, endFrame);
    if (metrics.rms >= rmsThreshold || metrics.peak >= peakThreshold) {
      activeWindows.push({ startFrame, endFrame });
    }
  }
  const merged: Array<{ startFrame: number; endFrame: number }> = [];
  for (const window of activeWindows) {
    const previous = merged.at(-1);
    if (previous && window.startFrame - previous.endFrame <= hangoverFrames) {
      previous.endFrame = window.endFrame;
    } else {
      merged.push({ ...window });
    }
  }
  return merged
    .filter((span) => span.endFrame - span.startFrame >= minimumFrames)
    .map((span) => {
      const metrics = frameMetrics(pcm, span.startFrame, span.endFrame);
      return { ...span, peak: metrics.peak, rms: metrics.rms };
    });
}

export function extractVoiceSyncLabWaveform(
  pcm: VoiceSyncLabPcm,
  options: VoiceSyncLabPcmAnalysisOptions = {},
  activity = extractVoiceSyncLabActivity(pcm, options),
): VoiceSyncLabWaveformBucket[] {
  if (pcm.frameCount <= 0) return [];
  const maxPoints = Math.max(1, Math.floor(options.maxWaveformPoints ?? 960));
  const bucketFrames = Math.max(1, Math.ceil(pcm.frameCount / maxPoints));
  const buckets: VoiceSyncLabWaveformBucket[] = [];
  let activityIndex = 0;
  for (let startFrame = 0; startFrame < pcm.frameCount; startFrame += bucketFrames) {
    const endFrame = Math.min(pcm.frameCount, startFrame + bucketFrames);
    while (
      activityIndex < activity.length &&
      (activity[activityIndex]?.endFrame ?? 0) <= startFrame
    ) {
      activityIndex += 1;
    }
    const span = activity[activityIndex];
    const metrics = frameMetrics(pcm, startFrame, endFrame);
    buckets.push({
      startFrame,
      endFrame,
      ...metrics,
      active: Boolean(span && span.startFrame < endFrame && span.endFrame > startFrame),
    });
  }
  return buckets;
}

export function analyzeVoiceSyncLabPcm(
  pcm: VoiceSyncLabPcm,
  options: VoiceSyncLabPcmAnalysisOptions = {},
): VoiceSyncLabPcmAnalysis {
  const activity = extractVoiceSyncLabActivity(pcm, options);
  return {
    activity,
    waveform: extractVoiceSyncLabWaveform(pcm, options, activity),
  };
}

/** Encode decoded/captured samples as deterministic 16-bit PCM WAVE. */
export function encodeVoiceSyncLabPcmWave(pcm: VoiceSyncLabPcm): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = pcm.channelCount * bytesPerSample;
  const dataSize = pcm.frameCount * blockAlign;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, pcm.channelCount, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < pcm.frameCount; frame += 1) {
    for (let channel = 0; channel < pcm.channelCount; channel += 1) {
      const sample = clampSample(pcm.channels[channel]?.[frame] ?? 0);
      view.setInt16(
        offset,
        sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff),
        true,
      );
      offset += bytesPerSample;
    }
  }
  return output;
}

export function parseVoiceSyncLabAlignment(
  value: unknown,
): EnglishVoiceCharacterAlignment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const characters = record.characters;
  const starts = record.characterStartTimesSeconds;
  const ends = record.characterEndTimesSeconds;
  if (
    !Array.isArray(characters) ||
    !Array.isArray(starts) ||
    !Array.isArray(ends) ||
    characters.length === 0 ||
    characters.length !== starts.length ||
    starts.length !== ends.length
  ) {
    return null;
  }
  const normalizedCharacters: string[] = [];
  const normalizedStarts: number[] = [];
  const normalizedEnds: number[] = [];
  let previousStart = 0;
  let previousEnd = 0;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const start = starts[index];
    const end = ends[index];
    if (
      typeof character !== "string" ||
      Array.from(character).length === 0 ||
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart ||
      end < previousEnd
    ) {
      return null;
    }
    normalizedCharacters.push(character);
    normalizedStarts.push(start);
    normalizedEnds.push(end);
    previousStart = start;
    previousEnd = end;
  }
  return {
    characters: normalizedCharacters,
    characterStartTimesSeconds: normalizedStarts,
    characterEndTimesSeconds: normalizedEnds,
  };
}

export interface VoiceSyncLabAlignmentResolution {
  status: VoiceSyncLabAlignmentStatus;
  reason: string;
  alignment: EnglishVoiceCharacterAlignment | null;
  origin: "generated" | "none" | "provider";
}

/**
 * Only provider-authored ElevenLabs timing and Bottish's generated note clock
 * are authoritative. Local, System, and Babble stay explicitly UNALIGNED even
 * when text cadence can produce a useful visual fallback.
 */
export function resolveVoiceSyncLabAlignment(args: {
  requestedEngine: VoiceSyncLabEngineId;
  engineUsed: string | null;
  alignment: unknown;
}): VoiceSyncLabAlignmentResolution {
  const alignment = parseVoiceSyncLabAlignment(args.alignment);
  if (args.requestedEngine === "bottish" && alignment) {
    return {
      status: "partial",
      reason:
        "Bottish has an exact generated note/character clock, but no acoustic phoneme spans.",
      alignment,
      origin: "generated",
    };
  }
  if (
    args.requestedEngine === "elevenlabs" &&
    args.engineUsed === "elevenlabs" &&
    alignment
  ) {
    return {
      status: "partial",
      reason:
        "ElevenLabs returned provider character timestamps, not phoneme truth.",
      alignment,
      origin: "provider",
    };
  }
  const reasons: Record<VoiceSyncLabEngineId, string> = {
    "local-auto": "LOCAL synthesis returned no engine timing.",
    "local-instant": "LOCAL Instant returned no engine timing.",
    "local-voice-plus": "LOCAL Voice+ returned no engine timing.",
    system: "System TTS returned no engine timing.",
    babble: "Babble returned no engine timing for its synthesized utterance.",
    bottish: "Bottish returned no valid generated note timing.",
    elevenlabs: "ElevenLabs returned no valid character timestamps.",
  };
  return {
    status: "unaligned",
    reason:
      args.requestedEngine === "elevenlabs"
        ? args.engineUsed && args.engineUsed !== "elevenlabs"
          ? `ElevenLabs resolved to ${args.engineUsed}; fallback timing is unavailable.`
          : "ElevenLabs returned no valid character timestamps."
        : reasons[args.requestedEngine],
    alignment: null,
    origin: "none",
  };
}

function engineOption(id: VoiceSyncLabEngineId): VoiceSyncLabEngineOption {
  const option = VOICE_SYNC_LAB_ENGINE_OPTIONS.find((entry) => entry.id === id);
  if (!option) throw new Error(`Unknown Voice Sync Lab engine: ${id}`);
  return option;
}

function profileForEngine(
  rawProfile: BotAudioVoiceProfileV1 | undefined,
  option: VoiceSyncLabEngineOption,
  systemVoiceName?: string | null,
): NormalizedVoiceSyncLabProfile {
  const profile = normalizeBotAudioVoiceProfileV1(
    rawProfile ?? DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  );
  if (option.id === "system") {
    const requestedSystemVoice = systemVoiceName?.trim() || profile.systemVoiceName?.trim();
    if (!requestedSystemVoice) {
      throw new Error("System voice QA requires an installed System Voice selection.");
    }
    return {
      ...profile,
      systemVoiceName: requestedSystemVoice,
      localVoiceSource: "system",
      localEnginePreference: "instant",
    };
  }
  if (option.mode === "english" && option.id !== "elevenlabs") {
    return {
      ...profile,
      systemVoiceName: null,
      localVoiceSource: "portable",
      localEnginePreference: option.localEnginePreference ?? "inherit",
    };
  }
  return profile;
}

function browserAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const nativeSessionToken = window.localStorage.getItem(
      "prism_native_session_token",
    );
    const clientAccessToken = window.localStorage.getItem(
      "prism_client_access_token",
    );
    return {
      ...(nativeSessionToken
        ? { authorization: `Bearer ${nativeSessionToken}` }
        : {}),
      ...(clientAccessToken
        ? { "x-prism-client-access": clientAccessToken }
        : {}),
    };
  } catch {
    return {};
  }
}

export interface VoiceSyncLabSynthesisClip {
  utteranceId: string;
  /** Exact seed used for synthesis and every production playback transform. */
  seed: string;
  sourceText: string;
  spokenText: string;
  spokenTextStatus: "alignment" | "unavailable";
  spokenTextReason: string | null;
  requestedEngine: VoiceSyncLabEngineId;
  mode: "babble" | "bottish" | "english";
  engineUsed: string | null;
  localEngine: string | null;
  modelHash: string | null;
  notice: string | null;
  audioContentType: string;
  bytes: ArrayBuffer;
  /** Exact response bytes only when the synthesis response itself is PCM WAV. */
  rawWavBytes: ArrayBuffer | null;
  sourcePcm: VoiceSyncLabPcm | null;
  sourceAnalysis: VoiceSyncLabPcmAnalysis | null;
  alignmentStatus: VoiceSyncLabAlignmentStatus;
  alignmentReason: string;
  alignmentOrigin: VoiceSyncLabAlignmentResolution["origin"];
  alignment: EnglishVoiceCharacterAlignment | null;
  profile: NormalizedVoiceSyncLabProfile;
  bottishPlan: BottishPlan | null;
}

export interface SynthesizeVoiceSyncLabClipArgs {
  utteranceId?: string;
  text: string;
  engine: VoiceSyncLabEngineId;
  profile?: BotAudioVoiceProfileV1;
  systemVoiceName?: string | null;
  seed?: string;
  signal?: AbortSignal;
  endpoint?: string;
  fetcher?: typeof fetch;
  effectsEnabled?: boolean;
  analysisOptions?: VoiceSyncLabPcmAnalysisOptions;
}

function randomUtteranceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `voice-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function decodeBrowserAudioPcm(bytes: ArrayBuffer): Promise<VoiceSyncLabPcm | null> {
  const context = prismAudioContext();
  if (!context) return null;
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    return voiceSyncLabPcmFromAudioBuffer(decoded);
  } catch {
    return null;
  }
}

async function errorMessageForSynthesisResponse(response: Response): Promise<string> {
  const payload = (await response.clone().json().catch(() => null)) as
    | { code?: string; error?: string }
    | null;
  return (
    payload?.error ??
    payload?.code ??
    `Voice synthesis failed (${response.status}).`
  );
}

/** Call the authenticated production synthesis boundary and retain raw bytes. */
export async function synthesizeVoiceSyncLabClip(
  args: SynthesizeVoiceSyncLabClipArgs,
): Promise<VoiceSyncLabSynthesisClip> {
  const sourceText = args.text.trim();
  if (!sourceText) throw new Error("Voice Sync Lab text cannot be empty.");
  const option = engineOption(args.engine);
  const profile = profileForEngine(args.profile, option, args.systemVoiceName);
  const utteranceId = args.utteranceId?.trim() || randomUtteranceId();
  const seed = args.seed?.trim() || utteranceId;

  let bytes: ArrayBuffer;
  let audioContentType: string;
  let engineUsed: string | null;
  let localEngine: string | null = null;
  let modelHash: string | null = null;
  let notice: string | null = null;
  let returnedAlignment: EnglishVoiceCharacterAlignment | null = null;
  let bottishPlan: BottishPlan | null = null;

  if (option.id === "bottish") {
    bottishPlan = buildBottishPlaybackPlan(sourceText, profile, seed);
    bytes = encodeBottishPlanWave(bottishPlan);
    audioContentType = "audio/wav";
    engineUsed = "bottish";
    returnedAlignment = bottishPlan.alignment;
  } else {
    const fetcher = args.fetcher ?? fetch;
    const response = await fetcher(args.endpoint ?? VOICE_SYNC_LAB_SYNTHESIS_PATH, {
      method: "POST",
      credentials: "include",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        ...browserAuthHeaders(),
      },
      body: JSON.stringify({
        text: sourceText,
        mode: option.mode,
        engine: option.requestEngine,
        seed,
        includeAlignment: true,
        streamChunks: false,
        explicitVoicePreview: option.id === "elevenlabs",
        explicitOnlineContext: option.id === "elevenlabs",
        effectsEnabled: args.effectsEnabled !== false,
        profile,
      }),
    });
    if (!response.ok) throw new Error(await errorMessageForSynthesisResponse(response));
    const clip = await readEnglishVoiceSynthesisClip(response);
    bytes = clip.bytes;
    audioContentType = clip.audioContentType;
    engineUsed = clip.engineUsed;
    localEngine = clip.localEngine ?? null;
    modelHash = clip.modelHash ?? null;
    notice = clip.notice ?? null;
    returnedAlignment = clip.alignment;
  }

  const alignment = resolveVoiceSyncLabAlignment({
    requestedEngine: option.id,
    engineUsed,
    alignment: returnedAlignment,
  });
  const parsedWave = tryParseVoiceSyncLabPcmWave(bytes);
  const sourcePcm = parsedWave ?? (await decodeBrowserAudioPcm(bytes));
  const authoritativeSpokenText = alignment.alignment?.characters.join("") ?? "";
  return {
    utteranceId,
    seed,
    sourceText,
    spokenText: authoritativeSpokenText,
    spokenTextStatus: authoritativeSpokenText ? "alignment" : "unavailable",
    spokenTextReason:
      authoritativeSpokenText
        ? null
        : option.id === "babble"
          ? "The server-authored Babble utterance is not returned by the synthesis envelope."
          : "The synthesis response did not return an authoritative spoken transcript.",
    requestedEngine: option.id,
    mode: option.mode,
    engineUsed,
    localEngine,
    modelHash,
    notice,
    audioContentType,
    bytes,
    rawWavBytes: parsedWave ? bytes.slice(0) : null,
    sourcePcm,
    sourceAnalysis: sourcePcm
      ? analyzeVoiceSyncLabPcm(sourcePcm, args.analysisOptions)
      : null,
    alignmentStatus: alignment.status,
    alignmentReason: alignment.reason,
    alignmentOrigin: alignment.origin,
    alignment: alignment.alignment,
    profile,
    bottishPlan,
  };
}

export interface VoiceSyncLabSystemVoiceOption {
  name: string;
  locale: string;
  label: string;
}

export interface VoiceSyncLabLocalEngineCapability {
  id: "instant" | "voice-plus";
  name: string;
  available: boolean;
  qualified: boolean;
}

export interface VoiceSyncLabCapabilities {
  platform: string | null;
  systemVoices: VoiceSyncLabSystemVoiceOption[];
  systemVoiceAvailable: boolean;
  operatingSystemVoicesEnabled: boolean;
  localEngines: VoiceSyncLabLocalEngineCapability[];
  elevenLabsConfigured: boolean;
}

export async function loadVoiceSyncLabCapabilities(args: {
  endpoint?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<VoiceSyncLabCapabilities> {
  const response = await (args.fetcher ?? fetch)(
    args.endpoint ?? "/api/voices/capabilities",
    {
      method: "GET",
      credentials: "include",
      signal: args.signal,
      headers: browserAuthHeaders(),
    },
  );
  if (!response.ok) throw new Error(await errorMessageForSynthesisResponse(response));
  const payload = (await response.json()) as {
    capabilities?: {
      builtinEnglish?: {
        operatingSystemVoicesEnabled?: unknown;
        platform?: unknown;
        voices?: unknown;
      };
      elevenLabs?: { configured?: unknown };
      local?: { engines?: unknown };
    };
  };
  const builtin = payload.capabilities?.builtinEnglish;
  const systemVoices = Array.isArray(builtin?.voices)
    ? builtin.voices.flatMap((value): VoiceSyncLabSystemVoiceOption[] => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const record = value as Record<string, unknown>;
        if (typeof record.name !== "string" || !record.name.trim()) return [];
        const name = record.name.trim();
        const locale =
          typeof record.locale === "string" ? record.locale.trim() : "";
        return [{
          name,
          locale,
          label: locale ? `${name} (${locale.replace("_", "-")})` : name,
        }];
      })
    : [];
  const localEngines = Array.isArray(payload.capabilities?.local?.engines)
    ? payload.capabilities.local.engines.flatMap(
        (value): VoiceSyncLabLocalEngineCapability[] => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const record = value as Record<string, unknown>;
          if (record.id !== "instant" && record.id !== "voice-plus") return [];
          return [{
            id: record.id,
            name:
              typeof record.name === "string" && record.name.trim()
                ? record.name.trim()
                : record.id === "voice-plus"
                  ? "Voice+"
                  : "Instant",
            available: record.available === true,
            qualified: record.qualified === true,
          }];
        },
      )
    : [];
  return {
    platform:
      typeof builtin?.platform === "string" ? builtin.platform : null,
    systemVoices,
    systemVoiceAvailable: systemVoices.length > 0,
    operatingSystemVoicesEnabled:
      builtin?.operatingSystemVoicesEnabled === true,
    localEngines,
    elevenLabsConfigured:
      payload.capabilities?.elevenLabs?.configured === true,
  };
}

export interface VoiceSyncLabInspectionProgress {
  currentMs: number;
  durationMs: number | null;
  playing: boolean;
}

export interface VoiceSyncLabInspectionPlayer {
  readonly kind: "actual-bytes-inspection";
  readonly productionEffectsApplied: false;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (elapsedMs: number) => void;
  setRate: (rate: number) => void;
  setLoop: (loop: boolean) => void;
  snapshot: () => VoiceSyncLabInspectionProgress;
  dispose: () => void;
}

/**
 * Scrubbable actual-byte transport for trace inspection. It is deliberately
 * separate from production validation: no claim is made that this dry media
 * element reproduces PRISM's effects/output graph.
 */
export function createVoiceSyncLabInspectionPlayer(args: {
  bytes: ArrayBuffer;
  audioContentType: string;
  offsetMs?: number;
  rate?: number;
  loop?: boolean;
  onProgress?: (progress: VoiceSyncLabInspectionProgress) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}): VoiceSyncLabInspectionPlayer {
  if (typeof Audio !== "function") {
    throw new Error("Audio inspection requires a browser media element.");
  }
  const url = URL.createObjectURL(
    new Blob([args.bytes.slice(0)], {
      type: args.audioContentType || "application/octet-stream",
    }),
  );
  const audio = new Audio();
  let disposed = false;
  let frame: number | null = null;
  let pendingOffsetMs = Math.max(0, args.offsetMs ?? 0);

  const durationMs = (): number | null =>
    Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration * 1_000
      : null;
  const snapshot = (): VoiceSyncLabInspectionProgress => ({
    currentMs: Math.max(0, audio.currentTime * 1_000),
    durationMs: durationMs(),
    playing: !audio.paused && !audio.ended,
  });
  const report = (): void => args.onProgress?.(snapshot());
  const cancelFrame = (): void => {
    if (frame !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(frame);
    }
    frame = null;
  };
  const tick = (): void => {
    report();
    if (disposed || audio.paused || audio.ended || typeof window === "undefined") {
      frame = null;
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };
  const startTick = (): void => {
    cancelFrame();
    if (typeof window !== "undefined") frame = window.requestAnimationFrame(tick);
  };
  const applyPendingOffset = (): void => {
    const duration = durationMs();
    const bounded = duration === null
      ? pendingOffsetMs
      : Math.min(duration, pendingOffsetMs);
    try {
      audio.currentTime = bounded / 1_000;
      pendingOffsetMs = bounded;
    } catch {
      // Metadata can still be unavailable; loadedmetadata retries this value.
    }
  };
  const handleLoadedMetadata = (): void => {
    applyPendingOffset();
    report();
  };
  const handlePlaying = (): void => startTick();
  const handlePause = (): void => {
    cancelFrame();
    report();
  };
  const handleEnded = (): void => {
    cancelFrame();
    report();
    args.onEnded?.();
  };
  const handleError = (): void => {
    cancelFrame();
    args.onError?.(new Error("Trace inspection audio could not play."));
  };
  audio.addEventListener("loadedmetadata", handleLoadedMetadata);
  audio.addEventListener("playing", handlePlaying);
  audio.addEventListener("pause", handlePause);
  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("error", handleError);
  audio.preload = "auto";
  audio.loop = args.loop === true;
  audio.playbackRate = Math.max(0.25, Math.min(4, args.rate ?? 1));
  audio.preservesPitch = true;
  audio.src = url;
  audio.load();

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    audio.pause();
    audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    audio.removeEventListener("playing", handlePlaying);
    audio.removeEventListener("pause", handlePause);
    audio.removeEventListener("ended", handleEnded);
    audio.removeEventListener("error", handleError);
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  };
  return {
    kind: "actual-bytes-inspection",
    productionEffectsApplied: false,
    play: async () => {
      if (disposed) throw new Error("Trace inspection player is disposed.");
      await audio.play();
      startTick();
    },
    pause: () => audio.pause(),
    stop: () => {
      audio.pause();
      pendingOffsetMs = 0;
      applyPendingOffset();
      report();
    },
    seek: (elapsedMs) => {
      pendingOffsetMs = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
      applyPendingOffset();
      report();
    },
    setRate: (rate) => {
      audio.playbackRate = Math.max(
        0.25,
        Math.min(4, Number.isFinite(rate) ? rate : 1),
      );
    },
    setLoop: (loop) => {
      audio.loop = loop;
    },
    snapshot,
    dispose,
  };
}

export function voiceSyncLabMouthShapeAt(args: {
  clip: Pick<
    VoiceSyncLabSynthesisClip,
    "alignment" | "mode" | "sourceText" | "spokenText"
  >;
  elapsedMs: number;
  durationMs: number;
}): ZenLiveBotMouthShape {
  const text = args.clip.spokenText || args.clip.sourceText;
  const input = {
    text,
    elapsedMs: args.elapsedMs,
    durationMs: args.durationMs,
    alignment: args.clip.alignment,
  };
  return args.clip.mode === "bottish"
    ? bottishMouthShapeAtAlignedElapsedMs(input)
    : crtSpeechMouthShapeAtAlignedElapsedMs(input);
}

export interface VoiceSyncLabSyntheticCalibrationWav {
  kind: "synthetic-calibration";
  label: "/p/ /æ/ /k/";
  audioContentType: "audio/wav";
  bytes: ArrayBuffer;
  pcm: VoiceSyncLabPcm;
  phonemeSpans: Array<{
    phoneme: "/p/" | "/æ/" | "/k/";
    startFrame: number;
    endFrame: number;
  }>;
  /** Authored fixture mouth events, including an explicit close for every gap. */
  mouthTransitions: VoiceAlignmentMouthTransitionV1[];
}

/** Deterministic, visibly synthetic timing ruler for lab transport checks. */
export function createVoiceSyncLabSyntheticCalibrationWav(
  sampleRate = 24_000,
): VoiceSyncLabSyntheticCalibrationWav {
  const safeSampleRate = Math.max(8_000, Math.min(96_000, Math.round(sampleRate)));
  const frameAtMs = (milliseconds: number): number =>
    Math.round((milliseconds / 1_000) * safeSampleRate);
  const frameCount = frameAtMs(640);
  const samples = new Float32Array(frameCount);
  let noiseState = 0x70ac1e5;
  const noise = (): number => {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
  };
  const pStart = frameAtMs(90);
  const pEnd = frameAtMs(145);
  const aeStart = frameAtMs(185);
  const aeEnd = frameAtMs(445);
  const kStart = frameAtMs(475);
  const kEnd = frameAtMs(535);
  for (let frame = pStart; frame < pEnd; frame += 1) {
    const progress = (frame - pStart) / Math.max(1, pEnd - pStart);
    samples[frame] = noise() * 0.42 * Math.exp(-progress * 8);
  }
  for (let frame = aeStart; frame < aeEnd; frame += 1) {
    const elapsed = (frame - aeStart) / safeSampleRate;
    const attack = Math.min(1, (frame - aeStart) / Math.max(1, frameAtMs(18)));
    const release = Math.min(1, (aeEnd - frame) / Math.max(1, frameAtMs(28)));
    const envelope = Math.max(0, Math.min(attack, release));
    samples[frame] =
      envelope *
      (Math.sin(2 * Math.PI * 190 * elapsed) * 0.34 +
        Math.sin(2 * Math.PI * 760 * elapsed) * 0.18 +
        Math.sin(2 * Math.PI * 1_260 * elapsed) * 0.09);
  }
  let previousNoise = 0;
  for (let frame = kStart; frame < kEnd; frame += 1) {
    const progress = (frame - kStart) / Math.max(1, kEnd - kStart);
    const currentNoise = noise();
    const highpassed = currentNoise - previousNoise * 0.72;
    previousNoise = currentNoise;
    samples[frame] = highpassed * 0.34 * Math.exp(-progress * 5.5);
  }
  const pcm: VoiceSyncLabPcm = {
    container: "decoded",
    encoding: "float",
    sampleRate: safeSampleRate,
    channelCount: 1,
    bitsPerSample: null,
    frameCount,
    durationMs: (frameCount / safeSampleRate) * 1_000,
    channels: [samples],
  };
  return {
    kind: "synthetic-calibration",
    label: "/p/ /æ/ /k/",
    audioContentType: "audio/wav",
    bytes: encodeVoiceSyncLabPcmWave(pcm),
    pcm,
    phonemeSpans: [
      { phoneme: "/p/", startFrame: pStart, endFrame: pEnd },
      { phoneme: "/æ/", startFrame: aeStart, endFrame: aeEnd },
      { phoneme: "/k/", startFrame: kStart, endFrame: kEnd },
    ],
    mouthTransitions: [
      { atFrame: pStart, from: "closed", to: "speech-closed", open: false },
      { atFrame: pEnd, from: "speech-closed", to: "closed", open: false },
      { atFrame: aeStart, from: "closed", to: "open-wide", open: true },
      { atFrame: aeEnd, from: "open-wide", to: "closed", open: false },
      { atFrame: kStart, from: "closed", to: "open-round", open: true },
      { atFrame: kEnd, from: "open-round", to: "closed", open: false },
    ],
  };
}

export type VoiceSyncLabPlaybackEventKind =
  | "cancel"
  | "end"
  | "progress"
  | "shh"
  | "start"
  | "stop";

export interface VoiceSyncLabPlaybackEvent {
  kind: VoiceSyncLabPlaybackEventKind;
  contextTime: number | null;
  captureFrame: number | null;
  elapsedMs: number | null;
  durationMs: number | null;
  mouthShape: ZenLiveBotMouthShape | null;
}

export interface VoiceSyncLabCapturedMouthTransition {
  contextTime: number;
  captureFrame: number;
  from: ZenLiveBotMouthShape | null;
  to: ZenLiveBotMouthShape;
  open: boolean;
}

export interface VoiceSyncLabFinalAudio {
  availability: "final-pcm" | "source-only";
  unavailableReason: string | null;
  captureKind: VoiceSyncLabPcmCaptureResult["captureKind"] | null;
  deterministicRenderClock: boolean;
  rawSoftwareBusPcm: VoiceSyncLabPcm | null;
  rawSoftwareBusAnalysis: VoiceSyncLabPcmAnalysis | null;
  rawSoftwareBusWavBytes: ArrayBuffer | null;
  frameZeroContextTime: number | null;
  deviceLatencyEstimateMs: number | null;
  deviceLatencyEstimateFrames: number | null;
  physicalLoopbackMeasured: false;
  droppedQuantumCount: number;
  unobservedFrameCount: number;
  clockNotes: string | null;
}

export interface VoiceSyncLabPlaybackResult {
  utteranceId: string;
  completed: boolean;
  interrupted: boolean;
  events: VoiceSyncLabPlaybackEvent[];
  mouthTransitions: VoiceSyncLabCapturedMouthTransition[];
  finalAudio: VoiceSyncLabFinalAudio;
  /** Canonical unshifted final software-bus PCM trace. */
  trace: VoiceAlignmentTraceV1 | null;
  traceMetricBasis: "software-bus-pcm" | "none";
  perceptualMetricsEstimate: VoiceSyncLabPerceptualMetricsEstimate | null;
  /** This verifies only the gap-free software-bus clock, never physical loopback. */
  traceVerification: "unavailable" | "software-clock-verified";
  traceUnavailableReason: string | null;
  interruptionAudit: VoiceSyncLabInterruptionAudit | null;
}

export interface VoiceSyncLabPerceptualMetricsEstimate {
  basis: "browser-device-latency-estimate";
  deviceLatencyEstimateFrames: number;
  deviceLatencyEstimateMs: number;
  physicalLoopbackMeasured: false;
  onsetDeltaFrames: number | null;
  onsetDeltaMs: number | null;
  offsetDeltaFrames: number | null;
  offsetDeltaMs: number | null;
  driftFrames: number | null;
  driftMs: number | null;
}

export interface VoiceSyncLabInterruptionAudit {
  shhFrame: number;
  lastActiveFrame: number | null;
  cutoffDeltaFrames: number | null;
  observedPostCutSilenceFrames: number;
  observedPostCutSilenceMs: number;
  postCutSilenceObserved: boolean;
  cutoffToleranceFrames: number;
  immediateCutoffObserved: boolean;
  mouthCloseDeltaFrames: number | null;
  mouthClosedImmediately: boolean | null;
}

export interface VoiceSyncLabPlaybackSession {
  id: string;
  done: Promise<VoiceSyncLabPlaybackResult>;
  /** Immediate production interruption probe. */
  shh: () => void;
  stop: () => void;
}

export interface PlayVoiceSyncLabClipArgs {
  clip: VoiceSyncLabSynthesisClip;
  effectsEnabled?: boolean;
  globalVolume?: number;
  captureFinalPcm?: boolean;
  analysisOptions?: VoiceSyncLabPcmAnalysisOptions;
  lifecycle?: VoicePlaybackLifecycle;
  onEvent?: (event: VoiceSyncLabPlaybackEvent) => void;
  onMouthShape?: (
    shape: ZenLiveBotMouthShape,
    event: VoiceSyncLabPlaybackEvent,
  ) => void;
}

function voiceSyncLabMouthIsOpen(shape: ZenLiveBotMouthShape): boolean {
  return shape !== "closed" && shape !== "speech-closed";
}

function delayMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.round(milliseconds)));
  });
}

function pcmFromCapture(result: VoiceSyncLabPcmCaptureResult): VoiceSyncLabPcm {
  return {
    container: "decoded",
    encoding: "float",
    sampleRate: result.sampleRate,
    channelCount: result.channelCount,
    bitsPerSample: null,
    frameCount: result.frameCount,
    durationMs: (result.frameCount / result.sampleRate) * 1_000,
    channels: result.channels,
  };
}

function silenceSpansForSpeech(
  speechSpans: readonly { startFrame: number; endFrame: number }[],
  frameCount: number,
): Array<{ startFrame: number; endFrame: number }> {
  const silence: Array<{ startFrame: number; endFrame: number }> = [];
  let cursor = 0;
  for (const span of speechSpans) {
    const startFrame = Math.max(cursor, Math.min(frameCount, span.startFrame));
    const endFrame = Math.max(startFrame, Math.min(frameCount, span.endFrame));
    if (startFrame > cursor) silence.push({ startFrame: cursor, endFrame: startFrame });
    cursor = Math.max(cursor, endFrame);
  }
  if (cursor < frameCount) silence.push({ startFrame: cursor, endFrame: frameCount });
  return silence;
}

function traceFrameForEvent(
  event: VoiceSyncLabPlaybackEvent | undefined,
  fallback: number,
): number {
  return typeof event?.captureFrame === "number" && Number.isFinite(event.captureFrame)
    ? Math.max(0, Math.round(event.captureFrame))
    : fallback;
}

export function buildVoiceSyncLabTrace(args: {
  clip: VoiceSyncLabSynthesisClip;
  capture: VoiceSyncLabPcmCaptureResult;
  analysis?: VoiceSyncLabPcmAnalysis;
  events: readonly VoiceSyncLabPlaybackEvent[];
  mouthTransitions: readonly VoiceSyncLabCapturedMouthTransition[];
}): VoiceAlignmentTraceV1 {
  const rawPcm = pcmFromCapture(args.capture);
  const analysis = args.analysis ?? analyzeVoiceSyncLabPcm(rawPcm);
  // Every span stays on the raw exported software-bus PCM clock. Device
  // latency is modeled separately and never mutates the canonical trace.
  const speechSpans = analysis.activity.map((span) => ({
    startFrame: span.startFrame,
    endFrame: span.endFrame,
    origin: "measured" as const,
    confidence: null,
  }));
  const frameCount = rawPcm.frameCount;
  const silenceSpans = silenceSpansForSpeech(speechSpans, frameCount).map(
    (span) => ({ ...span, origin: "measured" as const, confidence: null }),
  );
  const mouthTransitions: VoiceAlignmentMouthTransitionV1[] = [];
  for (const transition of args.mouthTransitions) {
    const atFrame = Math.max(0, Math.min(frameCount, transition.captureFrame));
    const previous = mouthTransitions.at(-1);
    const normalized = {
      atFrame,
      from: transition.from,
      to: transition.to,
      open: transition.open,
    };
    if (previous?.atFrame === atFrame) mouthTransitions[mouthTransitions.length - 1] = normalized;
    else mouthTransitions.push(normalized);
  }
  const startEvent = args.events.find((event) => event.kind === "start");
  const endEvent = [...args.events]
    .reverse()
    .find((event) => event.kind === "end" || event.kind === "cancel");
  const presentationStartFrame = Math.min(
    frameCount,
    traceFrameForEvent(startEvent, speechSpans[0]?.startFrame ?? 0),
  );
  const presentationEndFrame = Math.max(
    presentationStartFrame,
    Math.min(
      frameCount,
      traceFrameForEvent(endEvent, speechSpans.at(-1)?.endFrame ?? frameCount),
    ),
  );
  const visemeOrigin = "heuristic" as const;
  const visemeSpans = mouthTransitions.flatMap((transition, index) => {
    const endFrame =
      mouthTransitions[index + 1]?.atFrame ?? presentationEndFrame;
    if (endFrame <= transition.atFrame) return [];
    return [{
      startFrame: transition.atFrame,
      endFrame,
      origin: visemeOrigin,
      confidence: null,
      sourceStart: null,
      sourceEnd: null,
      viseme: transition.to,
    }];
  });
  const characterOrigin =
    args.clip.alignmentOrigin === "provider"
      ? "provider"
      : args.clip.alignmentOrigin === "generated"
        ? "generated"
        : null;
  const playbackStartFrame = presentationStartFrame;
  const playbackAlignment =
    args.clip.mode === "english"
      ? scaleEnglishVoiceAlignmentForPlayback(
          args.clip.alignment,
          args.clip.profile,
        )
      : args.clip.alignment;
  let sourceCursor = 0;
  const characterSpans = characterOrigin && playbackAlignment
    ? playbackAlignment.characters.flatMap((character, index) => {
        const startSeconds = playbackAlignment.characterStartTimesSeconds[index];
        const endSeconds = playbackAlignment.characterEndTimesSeconds[index];
        const characterLength = Array.from(character).length;
        const sourceStart = sourceCursor;
        const sourceEnd = sourceStart + characterLength;
        sourceCursor = sourceEnd;
        if (
          typeof startSeconds !== "number" ||
          typeof endSeconds !== "number" ||
          endSeconds <= startSeconds
        ) {
          return [];
        }
        return [{
          startFrame: playbackStartFrame + Math.round(startSeconds * args.capture.sampleRate),
          endFrame: playbackStartFrame + Math.round(endSeconds * args.capture.sampleRate),
          origin: characterOrigin,
          confidence: null,
          sourceStart,
          sourceEnd,
          character,
        }];
      })
    : [];
  const articulation = speechSpans.length
    ? {
        startFrame: speechSpans[0]!.startFrame,
        endFrame: speechSpans.at(-1)!.endFrame,
      }
    : { startFrame: presentationStartFrame, endFrame: presentationStartFrame };
  return normalizeVoiceAlignmentTraceV1({
    v: VOICE_ALIGNMENT_TRACE_VERSION,
    utteranceId: args.clip.utteranceId,
    surface: "voice-sync-lab",
    engine: {
      requested: args.clip.requestedEngine,
      resolved: args.clip.engineUsed ?? args.clip.requestedEngine,
      provider: args.clip.engineUsed === "elevenlabs" ? "elevenlabs" : null,
      model: args.clip.modelHash,
    },
    alignmentStatus: args.clip.alignmentStatus,
    alignmentReason: args.clip.alignmentReason,
    sourceText: args.clip.sourceText,
    spokenText: args.clip.spokenText,
    sampleRate: args.capture.sampleRate,
    frameCount,
    articulation,
    presentation: {
      startFrame: presentationStartFrame,
      endFrame: presentationEndFrame,
    },
    characterSpans,
    phonemeSpans: [],
    visemeSpans,
    speechSpans,
    silenceSpans,
    mouthTransitions,
    metrics: {},
  });
}

function roundedMetricMs(frames: number, sampleRate: number): number {
  return Math.round(((frames / sampleRate) * 1_000) * 1_000) / 1_000;
}

export function estimateVoiceSyncLabPerceptualMetrics(args: {
  trace: VoiceAlignmentTraceV1;
  deviceLatencyEstimateMs: number;
}): VoiceSyncLabPerceptualMetricsEstimate {
  const latencyMs = Math.max(
    0,
    Number.isFinite(args.deviceLatencyEstimateMs)
      ? args.deviceLatencyEstimateMs
      : 0,
  );
  const latencyFrames = Math.max(
    0,
    Math.round((latencyMs / 1_000) * args.trace.sampleRate),
  );
  const onsetDeltaFrames =
    args.trace.metrics.onsetDeltaFrames === null
      ? null
      : args.trace.metrics.onsetDeltaFrames - latencyFrames;
  const offsetDeltaFrames =
    args.trace.metrics.offsetDeltaFrames === null
      ? null
      : args.trace.metrics.offsetDeltaFrames - latencyFrames;
  return {
    basis: "browser-device-latency-estimate",
    deviceLatencyEstimateFrames: latencyFrames,
    deviceLatencyEstimateMs: latencyMs,
    physicalLoopbackMeasured: false,
    onsetDeltaFrames,
    onsetDeltaMs:
      onsetDeltaFrames === null
        ? null
        : roundedMetricMs(onsetDeltaFrames, args.trace.sampleRate),
    offsetDeltaFrames,
    offsetDeltaMs:
      offsetDeltaFrames === null
        ? null
        : roundedMetricMs(offsetDeltaFrames, args.trace.sampleRate),
    driftFrames: args.trace.metrics.driftFrames,
    driftMs: args.trace.metrics.driftMs,
  };
}

function sourceOnlyFinalAudio(reason: string): VoiceSyncLabFinalAudio {
  return {
    availability: "source-only",
    unavailableReason: reason,
    captureKind: null,
    deterministicRenderClock: false,
    rawSoftwareBusPcm: null,
    rawSoftwareBusAnalysis: null,
    rawSoftwareBusWavBytes: null,
    frameZeroContextTime: null,
    deviceLatencyEstimateMs: null,
    deviceLatencyEstimateFrames: null,
    physicalLoopbackMeasured: false,
    droppedQuantumCount: 0,
    unobservedFrameCount: 0,
    clockNotes: null,
  };
}

function finalAudioFromCapture(
  capture: VoiceSyncLabPcmCaptureResult,
  analysisOptions: VoiceSyncLabPcmAnalysisOptions | undefined,
): VoiceSyncLabFinalAudio {
  const pcm = pcmFromCapture(capture);
  return {
    availability: "final-pcm",
    unavailableReason: null,
    captureKind: capture.captureKind,
    deterministicRenderClock: capture.deterministicRenderClock,
    rawSoftwareBusPcm: pcm,
    rawSoftwareBusAnalysis: analyzeVoiceSyncLabPcm(pcm, analysisOptions),
    rawSoftwareBusWavBytes: encodeVoiceSyncLabPcmWave(pcm),
    frameZeroContextTime: capture.frameZeroContextTime,
    deviceLatencyEstimateMs: capture.deviceLatency.estimatedTotalMs,
    deviceLatencyEstimateFrames: Math.round(
      (capture.deviceLatency.estimatedTotalMs / 1_000) * capture.sampleRate,
    ),
    physicalLoopbackMeasured: false,
    droppedQuantumCount: capture.droppedQuantumCount,
    unobservedFrameCount: capture.unobservedFrameCount,
    clockNotes: capture.clockNotes,
  };
}

export function analyzeVoiceSyncLabInterruption(args: {
  sampleRate: number;
  frameCount: number;
  activity: readonly VoiceSyncLabActivitySpan[];
  shhFrame: number;
  minimumObservedSilenceMs?: number;
  cutoffToleranceFrames?: number;
  mouthTransitions?: readonly Pick<
    VoiceSyncLabCapturedMouthTransition,
    "captureFrame" | "to"
  >[];
}): VoiceSyncLabInterruptionAudit {
  const sampleRate = Math.max(1, Math.round(args.sampleRate));
  const frameCount = Math.max(0, Math.round(args.frameCount));
  const shhFrame = Math.max(0, Math.min(frameCount, Math.round(args.shhFrame)));
  const lastActiveFrame = args.activity.reduce<number | null>(
    (latest, span) =>
      latest === null ? span.endFrame : Math.max(latest, span.endFrame),
    null,
  );
  const observedPostCutSilenceFrames = Math.max(
    0,
    frameCount - Math.max(shhFrame, lastActiveFrame ?? shhFrame),
  );
  const observedPostCutSilenceMs =
    (observedPostCutSilenceFrames / sampleRate) * 1_000;
  const postCutSilenceObserved =
    observedPostCutSilenceMs >= (args.minimumObservedSilenceMs ?? 80);
  const cutoffToleranceFrames = Math.max(
    1,
    Math.round(
      args.cutoffToleranceFrames ?? Math.min(256, sampleRate * 0.01),
    ),
  );
  const mouthClose = args.mouthTransitions
    ?.filter(
      (transition) =>
        transition.to === "closed" && transition.captureFrame >= shhFrame,
    )
    .sort((left, right) => left.captureFrame - right.captureFrame)[0];
  const mouthCloseDeltaFrames = mouthClose
    ? mouthClose.captureFrame - shhFrame
    : null;
  const cutoffDeltaFrames =
    lastActiveFrame === null ? null : lastActiveFrame - shhFrame;
  return {
    shhFrame,
    lastActiveFrame,
    cutoffDeltaFrames,
    observedPostCutSilenceFrames,
    observedPostCutSilenceMs,
    postCutSilenceObserved,
    cutoffToleranceFrames,
    immediateCutoffObserved: Boolean(
      cutoffDeltaFrames !== null &&
      cutoffDeltaFrames <= cutoffToleranceFrames &&
      postCutSilenceObserved,
    ),
    mouthCloseDeltaFrames,
    mouthClosedImmediately:
      args.mouthTransitions === undefined
        ? null
        : mouthCloseDeltaFrames !== null &&
          mouthCloseDeltaFrames <= cutoffToleranceFrames,
  };
}

let activeVoiceSyncLabPlaybackStop: (() => void) | null = null;

/**
 * One-shot production validation. Synthesis bytes enter the same enqueue,
 * effects, output, lifecycle, and interruption path as the shipping surfaces.
 */
export function playVoiceSyncLabClip(
  args: PlayVoiceSyncLabClipArgs,
): VoiceSyncLabPlaybackSession {
  activeVoiceSyncLabPlaybackStop?.();
  const controller = new AbortController();
  const events: VoiceSyncLabPlaybackEvent[] = [];
  const mouthTransitions: VoiceSyncLabCapturedMouthTransition[] = [];
  let captureSession: VoiceSyncLabPcmCaptureSession | null = null;
  let completed = false;
  let interrupted = false;
  let lastMouthShape: ZenLiveBotMouthShape | null = null;

  const contextTime = (): number | null => {
    const context = prismAudioContext();
    return context ? context.currentTime : null;
  };
  const emit = (
    kind: VoiceSyncLabPlaybackEventKind,
    elapsedMs: number | null,
    durationMs: number | null,
    mouthShape: ZenLiveBotMouthShape | null = null,
  ): VoiceSyncLabPlaybackEvent => {
    const now = contextTime();
    const event: VoiceSyncLabPlaybackEvent = {
      kind,
      contextTime: now,
      captureFrame:
        now === null || !captureSession
          ? null
          : captureSession.contextTimeToFrame(now),
      elapsedMs,
      durationMs,
      mouthShape,
    };
    events.push(event);
    if (captureSession && now !== null) {
      captureSession.markContextTime(kind, now);
    }
    args.onEvent?.(event);
    return event;
  };
  const commitMouth = (
    shape: ZenLiveBotMouthShape,
    elapsedMs: number | null,
    durationMs: number | null,
    event?: VoiceSyncLabPlaybackEvent,
  ): void => {
    if (shape === lastMouthShape) return;
    const mouthEvent = event ?? emit("progress", elapsedMs, durationMs, shape);
    if (
      mouthEvent.contextTime !== null &&
      mouthEvent.captureFrame !== null
    ) {
      mouthTransitions.push({
        contextTime: mouthEvent.contextTime,
        captureFrame: mouthEvent.captureFrame,
        from: lastMouthShape,
        to: shape,
        open: voiceSyncLabMouthIsOpen(shape),
      });
      captureSession?.markContextTime(`mouth:${shape}`, mouthEvent.contextTime);
    }
    lastMouthShape = shape;
    args.onMouthShape?.(shape, mouthEvent);
  };
  const stopPlayback = (kind: "shh" | "stop"): void => {
    if (controller.signal.aborted || completed) return;
    interrupted = true;
    controller.abort();
    emit(kind, null, null, lastMouthShape);
    if (args.clip.mode === "english") {
      stopEnglishVoice({ preservePreparedMedia: true });
    } else {
      stopBottishVoice({ preservePreparedMedia: true });
    }
  };
  activeVoiceSyncLabPlaybackStop = () => stopPlayback("stop");

  const done = (async (): Promise<VoiceSyncLabPlaybackResult> => {
    let captureResult: VoiceSyncLabPcmCaptureResult | null = null;
    let captureUnavailableReason: string | null = null;
    try {
      if (args.clip.mode === "english") await prepareEnglishVoice();
      else await prepareBottishVoice();
      if (controller.signal.aborted) {
        captureUnavailableReason = "Playback stopped before final-bus capture began.";
      } else if (args.captureFinalPcm === false) {
        captureUnavailableReason = "Final-bus PCM capture was disabled for this run.";
      } else {
        captureSession = await startVoiceSyncLabPcmCapture({ channelCount: 2 });
        if (!captureSession) {
          captureUnavailableReason =
            "The development final-bus PCM tap is unavailable in this browser/runtime.";
        }
      }

      let lifecycleDurationMs: number | null = null;
      const playbackAlignment =
        args.clip.mode === "english"
          ? scaleEnglishVoiceAlignmentForPlayback(
              args.clip.alignment,
              args.clip.profile,
            )
          : args.clip.alignment;
      const lifecycle: VoicePlaybackLifecycle = {
        ...args.lifecycle,
        onStart: (durationMs) => {
          lifecycleDurationMs = durationMs;
          const event = emit("start", 0, durationMs, lastMouthShape);
          if (durationMs && durationMs > 0) {
            commitMouth(
              voiceSyncLabMouthShapeAt({
                clip: { ...args.clip, alignment: playbackAlignment },
                elapsedMs: 0,
                durationMs,
              }),
              0,
              durationMs,
              event,
            );
          }
          args.lifecycle?.onStart?.(durationMs, playbackAlignment);
        },
        onProgress: (elapsedMs, durationMs) => {
          lifecycleDurationMs = durationMs;
          const shape = voiceSyncLabMouthShapeAt({
            clip: { ...args.clip, alignment: playbackAlignment },
            elapsedMs,
            durationMs,
          });
          const event = emit("progress", elapsedMs, durationMs, shape);
          commitMouth(shape, elapsedMs, durationMs, event);
          args.lifecycle?.onProgress?.(elapsedMs, durationMs);
        },
        onEnd: () => {
          completed = true;
          const event = emit(
            "end",
            lifecycleDurationMs,
            lifecycleDurationMs,
            "closed",
          );
          commitMouth("closed", lifecycleDurationMs, lifecycleDurationMs, event);
          args.lifecycle?.onEnd?.();
        },
        onCancel: () => {
          interrupted = true;
          const event = emit("cancel", null, lifecycleDurationMs, "closed");
          commitMouth("closed", null, lifecycleDurationMs, event);
          args.lifecycle?.onCancel?.();
        },
      };
      if (!controller.signal.aborted) {
        const volume = args.globalVolume ?? args.clip.profile.volume;
        if (args.clip.mode === "bottish") {
          await enqueueBottishVoice(
            args.clip.sourceText,
            args.clip.profile,
            args.clip.seed,
            args.effectsEnabled !== false,
            volume,
            lifecycle,
          );
        } else if (args.clip.mode === "babble") {
          await enqueueBabbleVoice(
            args.clip.bytes,
            args.clip.sourceText,
            args.clip.profile,
            args.clip.seed,
            args.effectsEnabled !== false,
            volume,
            lifecycle,
          );
        } else {
          await enqueueEnglishVoice(
            args.clip.bytes,
            args.clip.profile,
            args.clip.seed,
            args.effectsEnabled !== false,
            volume,
            { ...lifecycle, sourceAlignment: args.clip.alignment },
            args.clip.engineUsed,
          );
        }
      }
      if (captureSession) {
        if (completed || interrupted) {
          // The completed source has relinquished queue ownership, but the
          // exact production graph remains connected for this bounded tail.
          // Interrupted audio stops immediately; keeping the muted tap alive
          // proves that the post-Shh interval is actually silent.
          await delayMs(VOICE_COMPLETED_OVERLAP_TAIL_MS);
        }
        captureResult = await captureSession.stop();
      }
    } catch (error) {
      captureSession?.cancel();
      throw error;
    } finally {
      captureSession = null;
      if (activeVoiceSyncLabPlaybackStop === stopCurrentSession) {
        activeVoiceSyncLabPlaybackStop = null;
      }
    }

    const finalAudio = captureResult
      ? finalAudioFromCapture(captureResult, args.analysisOptions)
      : sourceOnlyFinalAudio(
          captureUnavailableReason ?? "Final-bus PCM capture did not complete.",
        );
    const expectedAudiblePlayback = Boolean(
      events.some((event) => event.kind === "start") &&
      (args.globalVolume ?? args.clip.profile.volume) > 0,
    );
    const finalTapUnexpectedlySilent = Boolean(
      captureResult &&
      expectedAudiblePlayback &&
      (finalAudio.rawSoftwareBusAnalysis?.activity.length ?? 0) === 0,
    );
    const canVerifyTrace = Boolean(
      captureResult?.deterministicRenderClock &&
      captureResult.droppedQuantumCount === 0 &&
      captureResult.unobservedFrameCount === 0 &&
      !finalTapUnexpectedlySilent,
    );
    const trace = captureResult && canVerifyTrace
      ? buildVoiceSyncLabTrace({
          clip: args.clip,
          capture: captureResult,
          analysis: finalAudio.rawSoftwareBusAnalysis ?? undefined,
          events,
          mouthTransitions,
        })
      : null;
    const traceUnavailableReason = trace
      ? null
      : !captureResult
        ? finalAudio.unavailableReason
        : finalTapUnexpectedlySilent
          ? "The synthesized source had activity but the final-bus tap was silent; playback may have used an unrouted media fallback, so signed metrics are withheld."
          : "The fallback final-bus tap dropped or could not observe render quanta; signed metrics are unverified.";
    const shhEvent = events.find((event) => event.kind === "shh");
    const interruptionAudit =
      captureResult &&
      canVerifyTrace &&
      typeof shhEvent?.captureFrame === "number" &&
      finalAudio.rawSoftwareBusAnalysis
        ? analyzeVoiceSyncLabInterruption({
            sampleRate: captureResult.sampleRate,
            frameCount: captureResult.frameCount,
            activity: finalAudio.rawSoftwareBusAnalysis.activity,
            shhFrame: shhEvent.captureFrame,
            mouthTransitions,
          })
        : null;
    return {
      utteranceId: args.clip.utteranceId,
      completed,
      interrupted,
      events,
      mouthTransitions,
      finalAudio,
      trace,
      traceMetricBasis: trace ? "software-bus-pcm" : "none",
      perceptualMetricsEstimate:
        trace && finalAudio.deviceLatencyEstimateMs !== null
          ? estimateVoiceSyncLabPerceptualMetrics({
              trace,
              deviceLatencyEstimateMs: finalAudio.deviceLatencyEstimateMs,
            })
          : null,
      traceVerification: trace
        ? "software-clock-verified"
        : "unavailable",
      traceUnavailableReason,
      interruptionAudit,
    };
  })();

  function stopCurrentSession(): void {
    stopPlayback("stop");
  }
  activeVoiceSyncLabPlaybackStop = stopCurrentSession;
  return {
    id: args.clip.utteranceId,
    done,
    shh: () => stopPlayback("shh"),
    stop: stopCurrentSession,
  };
}

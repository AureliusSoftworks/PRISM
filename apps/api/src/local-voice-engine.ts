import { freemem, totalmem } from "node:os";
import {
  LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  LOCAL_VOICE_SPEECHPRINT_RULESET_VERSION,
  localVoicePronunciationOverrideIsActive,
  normalizeBotAudioVoiceProfileV1,
  normalizeLocalVoiceEnginePreference,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  resolveLocalAccentFallback,
  resolveLocalVoicePronunciationLocale,
  type BotAudioVoiceProfileV1,
  type LocalVoiceCalibrationStateV1,
  type LocalVoiceEngineCapabilityV1,
  type LocalVoiceEngineDecisionV1,
  type LocalVoiceEnginePreference,
  type ResolvedLocalVoicePronunciationV1,
  type ResolvedLocalVoiceSpeechprintV1,
} from "@localai/shared";
import { builtinEnglishAvailable } from "./builtin-tts.ts";

export const PRISM_VOICE_PLUS_MODEL_ID =
  "ResembleAI/chatterbox-turbo-ONNX-q4";
export const PRISM_INSTANT_VOICE_MODEL_ID = "kokoro-82m-q8";
export const PRISM_INSTANT_VOICE_MODEL_SHA256 =
  "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";

const VOICE_PLUS_MAX_WARM_REALTIME_FACTOR = 1;
const VOICE_PLUS_MAX_FIRST_PLAYABLE_MS = 2_500;
const MIN_FREE_MEMORY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_PROCESS_MEMORY_RATIO = 0.82;

let measuredInstantCalibration: {
  calibratedAt: string;
  warmRealtimeFactor: number;
  firstPlayableMs: number;
} | null = null;

/**
 * Voice+ remains unavailable until the official ONNX Q4 graph, PRISM-owned
 * reference deck, watermark path, and all four desktop targets have produced a
 * signed qualification record. This prevents a partial install from silently
 * becoming a release voice engine.
 */
export function localVoiceCalibrationState(): LocalVoiceCalibrationStateV1 {
  return {
    v: 1,
    platform: process.platform,
    architecture: process.arch,
    calibratedAt: measuredInstantCalibration?.calibratedAt ?? null,
    instant: {
      available: builtinEnglishAvailable(),
      warmRealtimeFactor:
        measuredInstantCalibration?.warmRealtimeFactor ?? null,
      firstPlayableMs: measuredInstantCalibration?.firstPlayableMs ?? null,
    },
    voicePlus: {
      available: false,
      qualified: false,
      warmRealtimeFactor: null,
      firstPlayableMs: null,
      modelHash: null,
      unavailableReason:
        "Voice+ is release-blocked until its pinned Q4 runtime and original reference deck pass cross-platform qualification.",
    },
  };
}

/**
 * Keep calibration process-local: it describes this exact runtime and model
 * load, and must not be reused after an application restart or model update.
 */
export function recordInstantVoiceCalibration(args: {
  elapsedMs: number;
  audioDurationMs: number;
  calibratedAt?: string;
}): LocalVoiceCalibrationStateV1 {
  const elapsedMs = Math.max(0, Math.round(args.elapsedMs));
  const audioDurationMs = Math.max(1, args.audioDurationMs);
  measuredInstantCalibration = {
    calibratedAt: args.calibratedAt ?? new Date().toISOString(),
    warmRealtimeFactor: Number((elapsedMs / audioDurationMs).toFixed(4)),
    firstPlayableMs: elapsedMs,
  };
  return localVoiceCalibrationState();
}

export function pcmWaveDurationMs(wave: Buffer): number | null {
  if (
    wave.length < 44 ||
    wave.subarray(0, 4).toString("ascii") !== "RIFF" ||
    wave.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return null;
  }
  let byteRate: number | null = null;
  let dataBytes: number | null = null;
  for (let offset = 12; offset + 8 <= wave.length; ) {
    const chunkId = wave.subarray(offset, offset + 4).toString("ascii");
    const chunkBytes = wave.readUInt32LE(offset + 4);
    const valueOffset = offset + 8;
    if (valueOffset + chunkBytes > wave.length) return null;
    if (chunkId === "fmt " && chunkBytes >= 12) {
      byteRate = wave.readUInt32LE(valueOffset + 8);
    } else if (chunkId === "data") {
      dataBytes = chunkBytes;
    }
    offset = valueOffset + chunkBytes + (chunkBytes % 2);
  }
  if (!byteRate || dataBytes === null) return null;
  return Math.max(1, Math.round((dataBytes / byteRate) * 1_000));
}

export function localVoiceEngineCapabilities(): LocalVoiceEngineCapabilityV1[] {
  const calibration = localVoiceCalibrationState();
  return [
    {
      id: "voice-plus",
      name: "Voice+",
      model: PRISM_VOICE_PLUS_MODEL_ID,
      modelHash: calibration.voicePlus.modelHash,
      available: calibration.voicePlus.available,
      qualified: calibration.voicePlus.qualified,
      supportsNativeVocalActions: true,
      supportsPronunciationBases: false,
      supportsSpeechprints: false,
      preservesProvenanceWatermark: true,
    },
    {
      id: "instant",
      name: "Instant",
      model: PRISM_INSTANT_VOICE_MODEL_ID,
      modelHash: PRISM_INSTANT_VOICE_MODEL_SHA256,
      available: calibration.instant.available,
      qualified: calibration.instant.available,
      supportsNativeVocalActions: false,
      supportsPronunciationBases: true,
      supportsSpeechprints: true,
      preservesProvenanceWatermark: false,
    },
  ];
}

export function localVoiceRuntimeHealthy(args: {
  freeMemoryBytes?: number;
  totalMemoryBytes?: number;
  processResidentBytes?: number;
} = {}): boolean {
  const free = args.freeMemoryBytes ?? freemem();
  const total = Math.max(1, args.totalMemoryBytes ?? totalmem());
  const resident = args.processResidentBytes ?? process.memoryUsage().rss;
  return free >= MIN_FREE_MEMORY_BYTES && resident / total <= MAX_PROCESS_MEMORY_RATIO;
}

function calibratedVoicePlusEligible(
  state: LocalVoiceCalibrationStateV1,
): boolean {
  return (
    state.voicePlus.available &&
    state.voicePlus.qualified &&
    state.voicePlus.warmRealtimeFactor !== null &&
    state.voicePlus.warmRealtimeFactor <= VOICE_PLUS_MAX_WARM_REALTIME_FACTOR &&
    state.voicePlus.firstPlayableMs !== null &&
    state.voicePlus.firstPlayableMs < VOICE_PLUS_MAX_FIRST_PLAYABLE_MS
  );
}

export function resolveLocalVoiceEngine(args: {
  preference: LocalVoiceEnginePreference | unknown;
  calibration?: LocalVoiceCalibrationStateV1;
  runtimeHealthy?: boolean;
  speechprintActive?: boolean;
  pronunciationOverrideActive?: boolean;
}): LocalVoiceEngineDecisionV1 {
  const requested = normalizeLocalVoiceEnginePreference(args.preference);
  const calibration = args.calibration ?? localVoiceCalibrationState();
  const healthy = args.runtimeHealthy ?? localVoiceRuntimeHealthy();
  const eligible = calibratedVoicePlusEligible(calibration) && healthy;
  const runnable =
    calibration.voicePlus.available &&
    calibration.voicePlus.qualified &&
    healthy;

  if (
    (args.speechprintActive === true ||
      args.pronunciationOverrideActive === true) &&
    (requested === "auto" || requested === "inherit")
  ) {
    return { requested, resolved: "instant", fallback: false, notice: null };
  }

  if (requested === "voice-plus") {
    // A deliberate Voice+ choice opts out of Auto's latency thresholds. We
    // still recover visibly when the qualified runtime cannot start safely.
    return runnable
      ? { requested, resolved: "voice-plus", fallback: false, notice: null }
      : {
          requested,
          resolved: "instant",
          fallback: true,
          notice:
            calibration.voicePlus.unavailableReason ??
            "Voice+ could not start, so this utterance used Instant.",
        };
  }
  if ((requested === "auto" || requested === "inherit") && eligible) {
    return { requested, resolved: "voice-plus", fallback: false, notice: null };
  }
  return { requested, resolved: "instant", fallback: false, notice: null };
}

export function resolveLocalVoicePronunciation(args: {
  profile: BotAudioVoiceProfileV1;
  localEngine: LocalVoiceEngineDecisionV1;
  usingSystemVoice: boolean;
}): ResolvedLocalVoicePronunciationV1 {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const localAccent = resolveLocalAccentFallback({
    accentDefinitionId: profile.accentDefinitionId,
    pronunciationBase: profile.pronunciationBase,
    speechprintInfluence: profile.speechprintInfluence,
  });
  const requestedBase = normalizeLocalVoicePronunciationBase(
    localAccent.pronunciationBase,
  );
  const sourceLocale = profile.accentLocale ?? "en-US";
  const sourceBaseLocale = resolveLocalVoicePronunciationLocale(
    "follow-voice",
    sourceLocale,
  );
  const requestedBaseLocale = resolveLocalVoicePronunciationLocale(
    requestedBase,
    sourceLocale,
  );
  const active = localVoicePronunciationOverrideIsActive(
    requestedBase,
    sourceLocale,
  );
  const reason = !active
    ? null
    : args.usingSystemVoice
      ? "system-voice"
      : args.localEngine.resolved !== "instant"
        ? "engine-unsupported"
        : null;
  return {
    requestedBase,
    sourceLocale,
    resolvedBaseLocale: reason ? sourceBaseLocale : requestedBaseLocale,
    status: !active ? "natural" : reason ? "suspended" : "applied",
    reason,
  };
}

export function resolveLocalVoiceSpeechprint(args: {
  profile: BotAudioVoiceProfileV1;
  localEngine: LocalVoiceEngineDecisionV1;
  usingSystemVoice: boolean;
  pronunciation?: ResolvedLocalVoicePronunciationV1;
}): ResolvedLocalVoiceSpeechprintV1 {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const localAccent = resolveLocalAccentFallback({
    accentDefinitionId: profile.accentDefinitionId,
    pronunciationBase: profile.pronunciationBase,
    speechprintInfluence: profile.speechprintInfluence,
  });
  const requestedInfluence = normalizeLocalVoiceSpeechprintInfluence(
    localAccent.speechprintInfluence,
  );
  const strength = normalizeLocalVoiceSpeechprintStrength(
    profile.speechprintStrength,
  );
  const baseLocale = args.pronunciation?.resolvedBaseLocale ??
    resolveLocalVoicePronunciationLocale(
      localAccent.pronunciationBase,
      profile.accentLocale,
    );
  if (requestedInfluence === "none") {
    return {
      requestedInfluence: "none",
      appliedInfluence: null,
      strength,
      baseLocale,
      status: "natural",
      reason: null,
      rulesetVersion: null,
      rulesetSha256: null,
    };
  }
  const reason = args.usingSystemVoice
    ? "system-voice"
    : args.localEngine.resolved !== "instant"
      ? "engine-unsupported"
      : null;
  return {
    requestedInfluence,
    appliedInfluence: reason ? null : requestedInfluence,
    strength,
    baseLocale,
    status: reason ? "suspended" : "applied",
    reason,
    rulesetVersion: reason ? null : LOCAL_VOICE_SPEECHPRINT_RULESET_VERSION,
    rulesetSha256: reason ? null : LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  };
}

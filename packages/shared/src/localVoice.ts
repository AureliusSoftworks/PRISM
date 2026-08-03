import {
  normalizeLocalVoiceAccentLocale,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  resolveLocalVoicePronunciationLocale,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
  type LocalVoiceEnginePreference,
} from "./audioVoice.js";

export type ResolvedLocalVoiceEngine = "voice-plus" | "instant";

export interface LocalVoiceCalibrationStateV1 {
  v: 1;
  platform: string;
  architecture: string;
  calibratedAt: string | null;
  instant: {
    available: boolean;
    warmRealtimeFactor: number | null;
    firstPlayableMs: number | null;
  };
  voicePlus: {
    available: boolean;
    qualified: boolean;
    warmRealtimeFactor: number | null;
    firstPlayableMs: number | null;
    modelHash: string | null;
    unavailableReason: string | null;
  };
}

export interface LocalVoiceEngineCapabilityV1 {
  id: ResolvedLocalVoiceEngine;
  name: string;
  model: string;
  modelHash: string | null;
  available: boolean;
  qualified: boolean;
  supportsNativeVocalActions: boolean;
  supportsPronunciationBases: boolean;
  supportsSpeechprints: boolean;
  preservesProvenanceWatermark: boolean;
}

export interface LocalVoiceEngineDecisionV1 {
  requested: LocalVoiceEnginePreference;
  resolved: ResolvedLocalVoiceEngine;
  fallback: boolean;
  notice: string | null;
}

export interface ResolvedLocalVoiceSpeechprintV1 {
  requestedInfluence: LocalVoiceSpeechprintInfluence;
  appliedInfluence: Exclude<LocalVoiceSpeechprintInfluence, "none"> | null;
  strength: LocalVoiceSpeechprintStrength;
  baseLocale: string;
  status: "natural" | "applied" | "suspended";
  reason: "engine-unsupported" | "system-voice" | null;
  rulesetVersion: string | null;
  rulesetSha256: string | null;
}

export interface ResolvedLocalVoicePronunciationV1 {
  requestedBase: LocalVoicePronunciationBase;
  sourceLocale: string;
  resolvedBaseLocale: "en-US" | "en-GB";
  status: "natural" | "applied" | "suspended";
  reason: "engine-unsupported" | "system-voice" | null;
}

export function normalizeResolvedLocalVoicePronunciationV1(
  value: unknown,
): ResolvedLocalVoicePronunciationV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const requestedBase = normalizeLocalVoicePronunciationBase(
    record.requestedBase,
  );
  const sourceLocale = normalizeLocalVoiceAccentLocale(
    record.sourceLocale,
    "en-US",
  );
  const status =
    record.status === "applied" ||
    record.status === "suspended" ||
    record.status === "natural"
      ? record.status
      : "natural";
  const reason =
    status === "suspended" &&
    (record.reason === "engine-unsupported" ||
      record.reason === "system-voice")
      ? record.reason
      : null;
  return {
    requestedBase,
    sourceLocale,
    resolvedBaseLocale: resolveLocalVoicePronunciationLocale(
      record.resolvedBaseLocale,
      sourceLocale,
    ),
    status,
    reason,
  };
}

export function normalizeResolvedLocalVoiceSpeechprintV1(
  value: unknown,
): ResolvedLocalVoiceSpeechprintV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const requestedInfluence = normalizeLocalVoiceSpeechprintInfluence(
    record.requestedInfluence,
  );
  const status =
    record.status === "applied" ||
    record.status === "suspended" ||
    record.status === "natural"
      ? record.status
      : requestedInfluence === "none"
        ? "natural"
        : "suspended";
  const appliedCandidate = normalizeLocalVoiceSpeechprintInfluence(
    record.appliedInfluence,
  );
  const appliedInfluence =
    status === "applied" && appliedCandidate !== "none"
      ? appliedCandidate
      : null;
  const reason =
    status === "suspended" &&
    (record.reason === "engine-unsupported" ||
      record.reason === "system-voice")
      ? record.reason
      : null;
  const baseLocale =
    typeof record.baseLocale === "string" && record.baseLocale.trim()
      ? record.baseLocale.trim().slice(0, 40)
      : "en-US";
  const rulesetVersion =
    typeof record.rulesetVersion === "string" &&
    record.rulesetVersion.trim()
      ? record.rulesetVersion.trim().slice(0, 80)
      : null;
  const rulesetSha256 =
    typeof record.rulesetSha256 === "string" &&
    /^[a-f0-9]{64}$/iu.test(record.rulesetSha256)
      ? record.rulesetSha256.toLowerCase()
      : null;
  return {
    requestedInfluence,
    appliedInfluence,
    strength: normalizeLocalVoiceSpeechprintStrength(record.strength),
    baseLocale,
    status,
    reason,
    rulesetVersion: status === "applied" ? rulesetVersion : null,
    rulesetSha256: status === "applied" ? rulesetSha256 : null,
  };
}

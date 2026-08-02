import type { LocalVoiceEnginePreference } from "./audioVoice.js";

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
  preservesProvenanceWatermark: boolean;
}

export interface LocalVoiceEngineDecisionV1 {
  requested: LocalVoiceEnginePreference;
  resolved: ResolvedLocalVoiceEngine;
  fallback: boolean;
  notice: string | null;
}

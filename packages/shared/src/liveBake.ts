/**
 * Live full-bake artifacts for Debate spectator and Signal "Watch a show".
 *
 * Naming (do not conflate):
 * - `liveBake` — generate structure + audio ahead of play for a seamless watch
 * - `faithfulArchive` — post-show master (Signal/Coffee today; Debate later)
 * - `sealedReopen` — Debate archive reopen via perspective=replay (not audio master)
 *
 * Premium ElevenLabs upgrade for Debate/Coffee is deferred; utterance metadata
 * records voice engine so a later pass can skip already-Premium takes when
 * generalizing Signal's startReplayPremiumProduction.
 */

export const LIVE_BAKE_ARTIFACT_VERSION = 1 as const;

/** Playback provenance — keep distinct from faithful archive and sealed reopen. */
export type LiveBakePlaybackKindV1 =
  | "liveBake"
  | "faithfulArchive"
  | "sealedReopen";

/** Surfaces that use the shared live-bake contract today. */
export type LiveBakeSurfaceV1 = "debate" | "signal";

/**
 * Extension point for future faithful Debate archive masters.
 * Do not widen ReplaySurfaceV1 until capture + archive Watch ship.
 */
export type FutureReplaySurfaceExtensionV1 = "debate";

export type LiveBakeStatusV1 =
  | "pending"
  | "baking"
  | "ready"
  | "failed"
  | "cancelled";

export type LiveBakeVoiceEngineV1 =
  | "local"
  | "elevenlabs"
  | "browser"
  | "unknown";

export interface LiveBakeProgressV1 {
  completedSteps: number;
  /** Null when total is unknown until the bake finishes. */
  totalStepsEstimate: number | null;
  phaseLabel: string;
  /** ISO timestamp updated while the bake job is alive (stale-job resume). */
  heartbeatAt?: string | null;
}

export interface LiveBakeUtteranceV1 {
  id: string;
  sourceEventId: string | null;
  speakerId: string;
  speakerRole: string;
  text: string;
  spokenText: string;
  /** Engine used when this line was synthesized for the bake. */
  voiceEngine: LiveBakeVoiceEngineV1;
  /** True when this take was already Premium ElevenLabs. */
  isPremium: boolean;
  audioUrl: string | null;
  durationMs: number | null;
  metadata?: Record<string, unknown>;
}

export interface LiveBakeEventV1 {
  id: string;
  kind: string;
  atMs: number | null;
  sourceEventId: string | null;
  payload: Record<string, unknown>;
}

export interface LiveBakeArtifactV1 {
  v: typeof LIVE_BAKE_ARTIFACT_VERSION;
  kind: "liveBake";
  surface: LiveBakeSurfaceV1;
  sourceId: string;
  title: string;
  status: LiveBakeStatusV1;
  progress: LiveBakeProgressV1;
  privacyMode: "local" | "online" | "mixed";
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  utterances: LiveBakeUtteranceV1[];
  events: LiveBakeEventV1[];
  /**
   * Surface-specific frozen session/episode snapshot after bake.
   * Presenter must not call the LLM while status === "ready".
   */
  sessionSnapshot?: Record<string, unknown>;
}

export const LIVE_BAKE_MAX_STEPS_DEBATE = 240;
export const LIVE_BAKE_MAX_STEPS_SIGNAL = 120;
export const LIVE_BAKE_DEFAULT_TIMEOUT_MS = 12 * 60_000;
/** Estimated playback runway required before early Spectator/Watch entry. */
export const LIVE_BAKE_UNLOCK_BUFFER_MS = 150_000;
export const LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE = 6;
export const LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL = 4;
/** Treat in-flight bake heartbeats older than this as stale and resumable. */
export const LIVE_BAKE_STALE_HEARTBEAT_MS = 45_000;
/** ~150 wpm speaking rate for duration estimates when audio length is unknown. */
export const LIVE_BAKE_ESTIMATED_MS_PER_WORD = 400;
export const LIVE_BAKE_ESTIMATED_DURATION_MIN_MS = 1_200;
export const LIVE_BAKE_ESTIMATED_DURATION_MAX_MS = 45_000;

export function isLiveBakeSurfaceV1(value: unknown): value is LiveBakeSurfaceV1 {
  return value === "debate" || value === "signal";
}

export function isLiveBakeVoiceEngineV1(
  value: unknown,
): value is LiveBakeVoiceEngineV1 {
  return (
    value === "local" ||
    value === "elevenlabs" ||
    value === "browser" ||
    value === "unknown"
  );
}

export function liveBakeVoiceIsPremium(
  engine: LiveBakeVoiceEngineV1,
  explicit?: boolean | null,
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return engine === "elevenlabs";
}

export function createEmptyLiveBakeArtifact(args: {
  surface: LiveBakeSurfaceV1;
  sourceId: string;
  title: string;
  privacyMode?: LiveBakeArtifactV1["privacyMode"];
  createdAt?: string;
}): LiveBakeArtifactV1 {
  const createdAt = args.createdAt ?? new Date().toISOString();
  return {
    v: LIVE_BAKE_ARTIFACT_VERSION,
    kind: "liveBake",
    surface: args.surface,
    sourceId: args.sourceId,
    title: args.title,
    status: "pending",
    progress: {
      completedSteps: 0,
      totalStepsEstimate: null,
      phaseLabel: "Waiting to bake",
    },
    privacyMode: args.privacyMode ?? "mixed",
    createdAt,
    completedAt: null,
    error: null,
    utterances: [],
    events: [],
  };
}

export function liveBakeArtifactIsPlayable(
  artifact: LiveBakeArtifactV1 | null | undefined,
): boolean {
  if (
    !artifact ||
    artifact.v !== LIVE_BAKE_ARTIFACT_VERSION ||
    artifact.kind !== "liveBake" ||
    artifact.utterances.length === 0
  ) {
    return false;
  }
  if (artifact.status === "ready") return true;
  if (artifact.status === "baking") {
    return liveBakeMayStartWatch(artifact, 0);
  }
  return false;
}

/** Estimate spoken duration from text when bake utterances lack `durationMs`. */
export function estimateSpokenDurationMs(text: string | null | undefined): number {
  const normalized = typeof text === "string" ? text.trim() : "";
  if (!normalized) return LIVE_BAKE_ESTIMATED_DURATION_MIN_MS;
  const words = normalized.split(/\s+/u).filter(Boolean).length;
  const punctuationBonus = (normalized.match(/[,.;:!?—–-]/gu) ?? []).length * 180;
  const estimated =
    Math.max(1, words) * LIVE_BAKE_ESTIMATED_MS_PER_WORD + punctuationBonus;
  return Math.min(
    LIVE_BAKE_ESTIMATED_DURATION_MAX_MS,
    Math.max(LIVE_BAKE_ESTIMATED_DURATION_MIN_MS, Math.round(estimated)),
  );
}

export function liveBakeUtteranceDurationMs(
  utterance: Pick<LiveBakeUtteranceV1, "durationMs" | "spokenText" | "text">,
): number {
  if (
    typeof utterance.durationMs === "number" &&
    Number.isFinite(utterance.durationMs) &&
    utterance.durationMs > 0
  ) {
    return Math.round(utterance.durationMs);
  }
  return estimateSpokenDurationMs(utterance.spokenText || utterance.text);
}

/** Total estimated playback length of baked utterances. */
export function liveBakeBufferedPlaybackMs(
  artifact: LiveBakeArtifactV1 | null | undefined,
): number {
  if (!artifact?.utterances.length) return 0;
  return artifact.utterances.reduce(
    (sum, utterance) => sum + liveBakeUtteranceDurationMs(utterance),
    0,
  );
}

export function liveBakeUnlockMinSteps(
  surface: LiveBakeSurfaceV1 | null | undefined,
): number {
  return surface === "signal"
    ? LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL
    : LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE;
}

/**
 * Early-entry gate: require both a time buffer ahead of the viewer and a
 * minimum number of settled baker steps (avoids unlocking on tiny steps alone).
 */
export function liveBakeMayStartWatch(
  artifact: LiveBakeArtifactV1 | null | undefined,
  viewerPositionMs = 0,
): boolean {
  if (!artifact || artifact.utterances.length === 0) return false;
  if (artifact.status === "ready") return true;
  if (artifact.status !== "baking" && artifact.status !== "cancelled") {
    return false;
  }
  const bufferedMs = liveBakeBufferedPlaybackMs(artifact);
  const aheadMs = bufferedMs - Math.max(0, viewerPositionMs);
  const minSteps = liveBakeUnlockMinSteps(artifact.surface);
  const steps = artifact.progress?.completedSteps ?? artifact.utterances.length;
  return aheadMs >= LIVE_BAKE_UNLOCK_BUFFER_MS && steps >= minSteps;
}

/** Whether restore/open should auto-start or resume the bake job. */
export function liveBakeShouldResumeOnOpen(
  artifact: LiveBakeArtifactV1 | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!artifact) return true;
  if (artifact.status === "ready") return false;
  if (artifact.status === "pending" || artifact.status === "cancelled") {
    return true;
  }
  if (artifact.status === "failed") return true;
  if (artifact.status !== "baking") return false;
  const heartbeat = artifact.progress?.heartbeatAt;
  if (!heartbeat) return true;
  const heartbeatMs = new Date(heartbeat).getTime();
  if (!Number.isFinite(heartbeatMs)) return true;
  return nowMs - heartbeatMs >= LIVE_BAKE_STALE_HEARTBEAT_MS;
}

/**
 * Seam note for generalizing Signal Premium production:
 * - Eligibility: AUTO/ONLINE only; explicit confirm-to-ElevenLabs
 * - Skip takes where `isPremium === true` / resolvedEngine === elevenlabs
 * - Widen startReplayPremiumProduction beyond surface === "signal" later
 * - Coffee masters and Debate bake artifacts should carry the same take metadata
 */
export const LIVE_BAKE_PREMIUM_UPGRADE_SEAM = {
  referenceSurface: "signal" as const,
  deferredSurfaces: ["coffee", "debate"] as const,
  skipWhenAlreadyPremium: true,
  requireConfirmToElevenLabs: true,
  blockInHardLocal: true,
} as const;

export function isLiveBakeArtifactV1(
  value: unknown,
): value is LiveBakeArtifactV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (raw.v !== LIVE_BAKE_ARTIFACT_VERSION || raw.kind !== "liveBake") {
    return false;
  }
  if (!isLiveBakeSurfaceV1(raw.surface)) return false;
  if (typeof raw.sourceId !== "string" || typeof raw.title !== "string") {
    return false;
  }
  if (
    raw.status !== "pending" &&
    raw.status !== "baking" &&
    raw.status !== "ready" &&
    raw.status !== "failed" &&
    raw.status !== "cancelled"
  ) {
    return false;
  }
  if (!raw.progress || typeof raw.progress !== "object") return false;
  if (!Array.isArray(raw.utterances) || !Array.isArray(raw.events)) return false;
  return true;
}

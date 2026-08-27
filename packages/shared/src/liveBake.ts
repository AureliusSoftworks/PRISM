import { BOTCAST_TIMED_MAX_UTTERANCES } from "./botcast.js";

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

/**
 * Readiness-only timing intent for future just-in-time voice synthesis.
 * This never proves that a take was synthesized; completed-audio provenance
 * remains exclusively on each utterance's `voiceEngine`, `isPremium`, and
 * `audioUrl` fields.
 */
export interface LiveBakePlannedSynthesisTimingV1 {
  /** Provider configured for future just-in-time playback synthesis. */
  engine: LiveBakeVoiceEngineV1;
  /** Conservative expected wall-clock latency for one future take. */
  estimatedLatencyMsPerTake: number;
  /** Fixed rolling-lookahead take count; it does not grow with the artifact. */
  runwayTakeCount: number;
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
   * Optional for backward compatibility. Missing metadata means no additional
   * synthesis runway; it is not inferred from completed-audio provenance.
   */
  plannedSynthesisTiming?: LiveBakePlannedSynthesisTimingV1;
  /**
   * Surface-specific frozen session/episode snapshot after bake.
   * Presenter must not call the LLM while status === "ready".
   */
  sessionSnapshot?: Record<string, unknown>;
}

export const LIVE_BAKE_MAX_STEPS_DEBATE = 240;
/**
 * A timed Signal interview may use all 120 public interview utterances, then
 * needs one final host turn to persist its formal closing. Keep that terminal
 * allowance explicit rather than treating it as unbounded extra runway.
 */
export const LIVE_BAKE_MAX_STEPS_SIGNAL = BOTCAST_TIMED_MAX_UTTERANCES + 1;
export const LIVE_BAKE_DEFAULT_TIMEOUT_MS = 12 * 60_000;
/** Debate keeps a long runway because its procedural floor can fan out. */
export const LIVE_BAKE_UNLOCK_BUFFER_MS = 150_000;
/**
 * Signal used to unlock on a single opening line with zero lead, which put the
 * viewer directly on the baker's heels: the first slow beat starved playback and
 * the fullscreen bake loader reopened mid-show. Calibrated against episode
 * e620c078523ad691ae82d431, whose worst generation gap was 18.9s (the closing's
 * four-model auto-fallback ladder) with 15.1s for the opening line. Buffered ms
 * are `estimateSpokenDurationMs` estimates, not measured audio, so this is a
 * generous-looking number that buys roughly 30-40s of real lead. Re-tune it
 * against the generation gaps in the next Watch review rather than by feel.
 */
export const LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL = 60_000;
export const LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE = 6;
/** Two settled exchanges, so one long line cannot satisfy the lead on its own. */
export const LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL = 3;
/** Conservative expected wall-clock latency for one future ElevenLabs take. */
export const LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE = 12_000;
/**
 * Reserve a fixed three-take lookahead, not one latency charge per baked line.
 * The 36s maximum represents a rolling just-in-time generation runway and
 * therefore stays reachable as additional short dialogue is buffered.
 */
export const LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES = 3;
export const LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS =
  LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE *
  LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES;
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

export function createLiveBakePlannedSynthesisTiming(
  engine: LiveBakeVoiceEngineV1,
): LiveBakePlannedSynthesisTimingV1 {
  const premiumPlanned = engine === "elevenlabs";
  return {
    engine,
    estimatedLatencyMsPerTake: premiumPlanned
      ? LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE
      : 0,
    runwayTakeCount: premiumPlanned
      ? LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES
      : 0,
  };
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
  // Artifacts arrive over the wire; a missing array must read as "nothing
  // buffered", not throw inside an unlock gate.
  if (!Array.isArray(artifact?.utterances) || artifact.utterances.length === 0) {
    return 0;
  }
  return artifact.utterances.reduce(
    (sum, utterance) => sum + liveBakeUtteranceDurationMs(utterance),
    0,
  );
}

/**
 * Bounded readiness runway for configured future Premium synthesis.
 * Waiting does not synthesize audio: this only asks for enough buffered
 * dialogue to cover a fixed just-in-time lookahead once playback begins.
 */
export function liveBakePlannedSynthesisRunwayMs(
  artifact: LiveBakeArtifactV1 | null | undefined,
): number {
  const timing = artifact?.plannedSynthesisTiming;
  if (!timing || timing.engine !== "elevenlabs") return 0;
  const latencyMs =
    typeof timing.estimatedLatencyMsPerTake === "number" &&
    Number.isFinite(timing.estimatedLatencyMsPerTake)
      ? Math.min(
          LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE,
          Math.max(0, Math.round(timing.estimatedLatencyMsPerTake)),
        )
      : 0;
  const runwayTakes =
    typeof timing.runwayTakeCount === "number" &&
    Number.isFinite(timing.runwayTakeCount)
      ? Math.min(
          LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES,
          Math.max(0, Math.trunc(timing.runwayTakeCount)),
        )
      : 0;
  return Math.min(
    LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
    latencyMs * runwayTakes,
  );
}

/** Playback lead plus bounded planned synthesis runway. */
export function liveBakeRequiredBufferMs(
  artifact: LiveBakeArtifactV1 | null | undefined,
): number {
  return (
    liveBakeUnlockBufferMs(artifact?.surface) +
    liveBakePlannedSynthesisRunwayMs(artifact)
  );
}

export function liveBakeUnlockMinSteps(
  surface: LiveBakeSurfaceV1 | null | undefined,
): number {
  return surface === "signal"
    ? LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL
    : LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE;
}

export function liveBakeUnlockBufferMs(
  surface: LiveBakeSurfaceV1 | null | undefined,
): number {
  return surface === "signal"
    ? LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL
    : LIVE_BAKE_UNLOCK_BUFFER_MS;
}

/**
 * Progress toward the early-entry gate, for the loader shown before playback.
 * `totalStepsEstimate` stays null for the whole bake (it is only written when a
 * bake finishes), so step count cannot drive a bar during the hold — and the
 * hold is exactly when the viewer needs to see motion. The buffer and the step
 * floor are both measurable, both must be met, so the lower of the two is the
 * honest number.
 */
export function liveBakeUnlockProgressRatio(
  artifact: LiveBakeArtifactV1 | null | undefined,
): number | null {
  if (!artifact) return null;
  if (artifact.status === "ready") return 1;
  const bufferTargetMs = liveBakeRequiredBufferMs(artifact);
  const stepTarget = liveBakeUnlockMinSteps(artifact.surface);
  const utteranceCount = Array.isArray(artifact.utterances)
    ? artifact.utterances.length
    : 0;
  const steps = artifact.progress?.completedSteps ?? utteranceCount;
  const stepRatio = stepTarget > 0 ? steps / stepTarget : 1;
  const bufferRatio =
    bufferTargetMs > 0
      ? liveBakeBufferedPlaybackMs(artifact) / bufferTargetMs
      : 1;
  return Math.min(1, Math.max(0, Math.min(stepRatio, bufferRatio)));
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
  return (
    aheadMs >= liveBakeRequiredBufferMs(artifact) && steps >= minSteps
  );
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

/**
 * Known Debate floor/step keys → loader copy. Unknown snake_case keys fall
 * through {@link humanizeLiveBakePhaseLabel}'s generic title-casing.
 */
const LIVE_BAKE_DEBATE_STEP_LABELS: Readonly<Record<string, string>> = {
  intro: "Opening the chamber",
  turnabout_intro: "Opening the chamber",
  opening_for: "For side opening",
  opening_against: "Against side opening",
  opening_for_player: "Your For opening",
  opening_against_player: "Your Against opening",
  challenge_for_prompt: "For challenge",
  challenge_against_prompt: "Against challenge",
  challenge_for: "For challenge",
  challenge_against: "Against challenge",
  challenge_judge_question: "Judge challenge question",
  challenge_participant_prompt: "Your challenge",
  challenge_participant_partner: "Partner challenge",
  challenge_opponent_prompt: "Opponent challenge",
  moderator_to_rebuttal: "Moving to rebuttal",
  moderator_to_closing: "Moving to closing",
  moderator_to_jury: "Turning to the Jury",
  closing_for: "For closing",
  closing_against: "Against closing",
  closing_moderator: "Moderator closing",
  participant_closing_moderator: "Moderator closing",
  jury_closing_moderator: "Moderator closing",
  judge_closing_moderator: "Moderator closing",
  judge_aftermath_for: "For reacts to the ruling",
  judge_aftermath_against: "Against reacts to the ruling",
  jury_aftermath_for: "For reacts to the Jury",
  jury_aftermath_against: "Against reacts to the Jury",
  judge_objection_ruling: "Ruling on an objection",
  participant_objection_reason: "Objection reason",
  audience_order: "Calling the gallery to order",
  pause: "Recess",
  resume: "Returning from recess",
  completed: "Finishing the gallery",
  turnabout_testimony_for: "For testimony",
  turnabout_testimony_against: "Against testimony",
  turnabout_spectator_press: "Pressing the testimony",
  turnabout_ballot_moderator: "Moderator ballot",
  turnabout_ballot_for: "For ballot",
  turnabout_ballot_against: "Against ballot",
  ballot_for: "For ballot",
  ballot_against: "Against ballot",
};

const LIVE_BAKE_PHASE_TOKEN_LABELS: Readonly<Record<string, string>> = {
  for: "For",
  against: "Against",
  player: "your",
  moderator: "Moderator",
  jury: "Jury",
  judge: "Judge",
  participant: "Participant",
  partner: "partner",
  opponent: "opponent",
  opening: "opening",
  closing: "closing",
  challenge: "challenge",
  rebuttal: "rebuttal",
  testimony: "testimony",
  examination: "examination",
  reversal: "reversal",
  resolution: "resolution",
  aftermath: "aftermath",
  deliberation: "deliberation",
  initial: "first thoughts",
  final: "final ballot",
  press: "press",
  ruling: "ruling",
  objection: "objection",
  reason: "reason",
  prompt: "prompt",
  question: "question",
  ballot: "ballot",
  intro: "opening",
  to: "to",
  of: "of",
  turnabout: "Turnabout",
};

function titleCaseLiveBakeWord(word: string): string {
  if (!word) return word;
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

function humanizeLiveBakeSnakeCase(label: string): string {
  const tokens = label.split("_").filter(Boolean);
  if (tokens.length === 0) return label;

  const trailingNumber =
    tokens.length > 1 && /^\d+$/u.test(tokens[tokens.length - 1]!)
      ? Number(tokens[tokens.length - 1])
      : null;
  const bodyTokens =
    trailingNumber === null ? tokens : tokens.slice(0, -1);

  if (bodyTokens[0] === "rebuttal" && bodyTokens.length >= 2) {
    const side = bodyTokens[1] === "against" ? "Against" : "For";
    // Forum rebuttal step keys use 1-based round ids (rebuttal_for_1).
    const roundLabel =
      trailingNumber !== null ? ` · round ${Math.max(1, trailingNumber)}` : "";
    return `${side} rebuttal${roundLabel}`;
  }

  if (bodyTokens[0] === "jury" && bodyTokens.length >= 2) {
    const kind = bodyTokens[1];
    const seat =
      trailingNumber !== null ? ` · seat ${trailingNumber + 1}` : "";
    if (kind === "initial") return `Jury first thoughts${seat}`;
    if (kind === "deliberation") return `Jury deliberation${seat}`;
    if (kind === "final") return `Jury final ballot${seat}`;
    if (kind === "aftermath") {
      const side = bodyTokens[2] === "against" ? "Against" : "For";
      return `${side} reacts to the Jury`;
    }
  }

  const words = bodyTokens.map((token, index) => {
    const mapped = LIVE_BAKE_PHASE_TOKEN_LABELS[token];
    if (mapped) {
      if (index === 0) return titleCaseLiveBakeWord(mapped);
      return mapped;
    }
    return titleCaseLiveBakeWord(token.replace(/-/gu, " "));
  });

  let phrase = words.join(" ").replace(/\s+/gu, " ").trim();
  if (trailingNumber !== null && !phrase.includes("round") && !phrase.includes("seat")) {
    phrase = `${phrase} · ${trailingNumber + 1}`;
  }
  return phrase || label;
}

/**
 * Turn machine step keys (e.g. `opening_for`) into loader-friendly copy.
 * Already-human labels (spaces, Ready, Preparing…) pass through unchanged.
 */
export function humanizeLiveBakePhaseLabel(
  label: string | null | undefined,
  fallback = "Preparing…",
): string {
  const trimmed = typeof label === "string" ? label.trim() : "";
  if (!trimmed) return fallback;
  if (LIVE_BAKE_DEBATE_STEP_LABELS[trimmed]) {
    return LIVE_BAKE_DEBATE_STEP_LABELS[trimmed]!;
  }
  // Already prose, status copy, or Signal segment words like "interview".
  if (/\s/u.test(trimmed) || !/_/u.test(trimmed)) {
    if (trimmed === "interview") return "Interview";
    if (trimmed === "opening") return "Opening";
    if (trimmed === "closing") return "Closing";
    return trimmed;
  }
  return humanizeLiveBakeSnakeCase(trimmed);
}

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

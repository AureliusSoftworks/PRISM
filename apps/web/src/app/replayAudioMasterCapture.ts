"use client";

import type {
  ReplayDirectionEventKindV2,
  ReplayDirectionEventV2,
  ReplayEventV1,
  ReplayMouthShapeV2,
  ReplayMouthTrackV2,
  ReplayVoiceLightTrackV1,
  ReplaySpeechActivityTrackV1,
  ReplayThinkingDirectionPayloadV2,
  ReplayVoiceSelectionSnapshotV2,
} from "@localai/shared";
import {
  audioContextNeedsResume,
  installAudioContextRecoveryLifecycle,
  resumeAudioContextIfNeeded,
} from "./audioContextRecovery.ts";
import { createVoiceLightMeter } from "./voiceLightEnvelope.ts";
import {
  connectVoiceCensorTone,
  resolveVoiceCensorTimings,
  type VoiceCensorPlanV1,
} from "./voiceCensorTone.ts";
import {
  connectRoomAcoustics,
  type RoomAcousticsConnection,
  type RoomAcousticsSend,
} from "./roomAcoustics.ts";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects.ts";

export type ReplayAudioMasterCaptureResult = {
  sourceId: string;
  bytes: ArrayBuffer;
  contentType: string;
  durationMs: number;
  /** Temporary V1 compatibility for the Coffee restoration boundary. */
  events: ReplayEventV1[];
  direction: ReplayDirectionEventV2[];
  mouthTracks: ReplayMouthTrackV2[];
  voiceLightTracks: ReplayVoiceLightTrackV1[];
  speechActivityTracks?: ReplaySpeechActivityTrackV1[];
  voiceSelection?: ReplayVoiceSelectionSnapshotV2;
};

type ReplayAudioMasterCaptureSession = {
  sourceId: string;
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  recorder: MediaRecorder;
  recorderMimeType: string;
  chunks: Blob[];
  startedAt: number;
  /** Wall time removed from the logical capture clock while the recorder is held. */
  totalPausedMs: number;
  /** Wall timestamp when the current compact hold began, if any. */
  pausedAt: number | null;
  /**
   * Signal-only: pause the whole master while a bot's presented thinking
   * state is active. Signal and Coffee both enable this.
   */
  compactThinkingGaps: boolean;
  /** Coffee-only: discard cancelled/orphan thinking without a delivered line. */
  requireLinkedThinkingMessage: boolean;
  /** Set when neither pause nor stop/restart can hold the recorder. */
  compactThinkingGapsDisabled: boolean;
  /** Defensive depth for overlapping presented thinking owners. */
  compactHoldDepth: number;
  /** True when pause() failed and the recorder was stopped for a clean restart. */
  needsRecorderRestart: boolean;
  events: ReplayEventV1[];
  direction: ReplayDirectionEventV2[];
  mouthCuesByParticipant: Map<
    string,
    ReplayMouthTrackV2["cues"]
  >;
  voiceLightCuesByParticipant: Map<
    string,
    ReplayVoiceLightTrackV1["cues"]
  >;
  speechActivityCuesByParticipant: Map<
    string,
    ReplaySpeechActivityTrackV1["cues"]
  >;
  voiceSelection?: ReplayVoiceSelectionSnapshotV2;
  thinkingByParticipant: Map<string, ReplayThinkingPresentation>;
  stopPromise: Promise<ReplayAudioMasterCaptureResult | null> | null;
  /** Release minimize keep-alive for this capture session. */
  releaseKeepAlive: () => void;
};

type ReplayThinkingPresentation = {
  participantId: string;
  botId: string;
  startMs: number;
  startedAtWallMs: number;
  audible: boolean;
  camera: string | null;
  segment: string | null;
};

let sharedAudioContext: AudioContext | null = null;
let sharedAudioContextConstructor: typeof AudioContext | null = null;
let sharedWorldOutput: AudioNode | null = null;
let sharedLocalOnlyOutput: GainNode | null = null;
let activeCapture: ReplayAudioMasterCaptureSession | null = null;
let releaseSharedAudioContextRecovery: (() => void) | null = null;

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function ensureSharedAudioContextRecovery(): void {
  // Server rendering and test-only window shims have no application lifecycle
  // to observe. A real browser always supplies document before a mixer exists.
  if (releaseSharedAudioContextRecovery || typeof document === "undefined") {
    return;
  }
  releaseSharedAudioContextRecovery = installAudioContextRecoveryLifecycle({
    // Do not call prismAudioContext here: app/focus events must recover an
    // existing mixer, never create audio or override a player's settings.
    getContext: () => sharedAudioContext,
  });
}

/**
 * The one AudioContext owned by PRISM's in-world sound system. UI earcons use
 * their own output path and intentionally never enter this context.
 */
export function prismAudioContext(): AudioContext | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext !== "function"
  ) {
    return null;
  }
  if (
    !sharedAudioContext ||
    sharedAudioContext.state === "closed" ||
    sharedAudioContextConstructor !== window.AudioContext
  ) {
    sharedAudioContext = new window.AudioContext({ latencyHint: "interactive" });
    sharedAudioContextConstructor = window.AudioContext;
    sharedWorldOutput = null;
    sharedLocalOnlyOutput = null;
    ensureSharedAudioContextRecovery();
  }
  return sharedAudioContext;
}

export const PRISM_WORLD_AUDIO_LIMITER_THRESHOLD_DBFS = -6;
export const PRISM_WORLD_AUDIO_LIMITER_RATIO = 20;

function worldOutputForSharedContext(): AudioNode | null {
  const context = prismAudioContext();
  if (!context) return null;
  if (!sharedWorldOutput) {
    if (typeof context.createDynamicsCompressor === "function") {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = PRISM_WORLD_AUDIO_LIMITER_THRESHOLD_DBFS;
      limiter.knee.value = 0;
      limiter.ratio.value = PRISM_WORLD_AUDIO_LIMITER_RATIO;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      sharedWorldOutput = limiter;
    } else {
      // Older Web Audio shims retain sound, while supported browsers always
      // install the final safety limiter.
      sharedWorldOutput = context.createGain();
    }
    sharedWorldOutput.connect(context.destination);
  }
  return sharedWorldOutput;
}

function localOnlyOutputForSharedContext(): GainNode | null {
  const context = prismAudioContext();
  if (!context) return null;
  if (!sharedLocalOnlyOutput) {
    sharedLocalOnlyOutput = context.createGain();
    // Speakers only — never connected to the faithful-master capture tap.
    sharedLocalOnlyOutput.connect(context.destination);
  }
  return sharedLocalOnlyOutput;
}

/**
 * The final post-effect in-world output. Device playback and recording are
 * connected from this exact node, so there is no second capture mix.
 */
export function prismAudioOutputNode(context: AudioContext): AudioNode {
  const shared = prismAudioContext();
  if (!shared || context !== shared) {
    if (activeCapture) {
      throw new Error(
        "Recordable in-world audio must use the shared PRISM AudioContext.",
      );
    }
    const compatibilityOutput = context.createGain();
    compatibilityOutput.connect(context.destination);
    return compatibilityOutput;
  }
  const output = worldOutputForSharedContext();
  if (!output) throw new Error("PRISM in-world audio is unavailable.");
  return output;
}

/**
 * Local-only QoL beds (Coffee Jazz and café environment) hear on device speakers but never enter
 * the faithful audio-master capture tap on {@link prismAudioOutputNode}.
 */
export function prismLocalOnlyAudioOutputNode(context: AudioContext): AudioNode {
  const shared = prismAudioContext();
  if (!shared || context !== shared) {
    const compatibilityOutput = context.createGain();
    compatibilityOutput.connect(context.destination);
    return compatibilityOutput;
  }
  const output = localOnlyOutputForSharedContext();
  if (!output) throw new Error("PRISM local-only audio is unavailable.");
  return output;
}

/**
 * Routes an HTML media element into the same final post-effect output. A
 * recordable element is never allowed to fall back to direct device playback.
 */
export type PrismAudioElementRouteCleanup = (() => void) & {
  /** Stop the dry feed while allowing the current room return to decay. */
  release(): void;
};

export function routeAudioElementToPrismOutput(
  audio: HTMLMediaElement,
  options: {
    onLevel?: (level: number) => void;
    censorPlan?: VoiceCensorPlanV1 | null;
    censorAlignment?: VoicePlaybackCharacterAlignment | null;
    censorDurationMs?: number;
    readCensorElapsedMs?: () => number;
    roomAcoustics?: RoomAcousticsSend | null;
    stereoPan?: number;
  } = {},
): PrismAudioElementRouteCleanup | null {
  const context = prismAudioContext();
  const output = worldOutputForSharedContext();
  if (!context || !output) {
    options.onLevel?.(0);
    return null;
  }
  try {
    if (audioContextNeedsResume(context)) {
      void context.resume().catch(() => undefined);
    }
    const source = context.createMediaElementSource(audio);
    const lightMeter = options.onLevel
      ? createVoiceLightMeter(context, options.onLevel)
      : null;
    const routedNodes: AudioNode[] = [];
    let roomConnection: RoomAcousticsConnection | null = null;
    let routed = false;
    const connectRoute = () => {
      if (routed) return;
      routed = true;
      const nativeDurationMs =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? (audio.duration * 1_000) / Math.max(0.01, audio.playbackRate)
          : 0;
      const durationMs = Math.max(
        1,
        options.censorDurationMs ?? nativeDurationMs,
      );
      const timings = resolveVoiceCensorTimings({
        plan: options.censorPlan,
        alignment: options.censorAlignment,
        durationMs,
      });
      const routeInput = timings.length > 0 ? context.createGain() : source;
      if (timings.length > 0) {
        routedNodes.push(routeInput);
        routedNodes.push(
          ...connectVoiceCensorTone({
            context,
            speechInput: source,
            output: routeInput,
            timings,
            startAt: context.currentTime,
            elapsedMs: options.readCensorElapsedMs?.() ?? 0,
          }),
        );
      }
      const roomInput = lightMeter ? lightMeter.node : routeInput;
      if (lightMeter) routeInput.connect(lightMeter.node);
      roomConnection = connectRoomAcoustics({
        context,
        input: roomInput,
        destination: output,
        send: options.roomAcoustics,
        stereoPan: options.stereoPan,
      });
    };
    if (options.censorPlan) audio.addEventListener("playing", connectRoute, { once: true });
    else connectRoute();
    let closed = false;
    let released = false;
    const finishNodes = (): void => {
      lightMeter?.stop();
      if (typeof audio.removeEventListener === "function") {
        audio.removeEventListener("playing", connectRoute);
      }
      for (const node of routedNodes) {
        try {
          if ("stop" in node && typeof node.stop === "function") node.stop();
        } catch {
          // Scheduled source already ended.
        }
      }
      try {
        source.disconnect();
        for (const node of routedNodes) node.disconnect();
        lightMeter?.node.disconnect();
      } catch {
        // The media element or shared context is already released.
      }
    };
    const cleanup = (() => {
      if (closed || released) return;
      closed = true;
      roomConnection?.disconnect();
      finishNodes();
    }) as PrismAudioElementRouteCleanup;
    cleanup.release = (): void => {
      if (closed || released) return;
      released = true;
      roomConnection?.release();
      finishNodes();
    };
    return cleanup;
  } catch {
    options.onLevel?.(0);
    return null;
  }
}

function supportedCaptureMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ??
    ""
  );
}

function attachRecorderDataHandler(
  capture: ReplayAudioMasterCaptureSession,
  recorder: MediaRecorder,
): void {
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) capture.chunks.push(event.data);
  });
}

function createCaptureRecorder(
  capture: ReplayAudioMasterCaptureSession,
): MediaRecorder {
  const recorder = capture.recorderMimeType
    ? new MediaRecorder(capture.destination.stream, {
        mimeType: capture.recorderMimeType,
        audioBitsPerSecond: 192_000,
      })
    : new MediaRecorder(capture.destination.stream);
  attachRecorderDataHandler(capture, recorder);
  return recorder;
}

/** Resume the shared mixer while the initiating user gesture is active. */
export function primeReplayAudioMasterCapture(): void {
  void prismAudioContext()?.resume().catch(() => undefined);
}

/** Nudge the shared mixer awake if the browser suspended it while minimized. */
export function ensurePrismAudioContextRunning(): void {
  const context = prismAudioContext();
  if (!context || !audioContextNeedsResume(context)) return;
  void context.resume().catch(() => undefined);
}

/**
 * Wait until the shared mixer is ready before attaching a media element to it.
 * Once a media element is routed through Web Audio, a suspended context makes
 * its native output silent, so callers must not start playback first.
 */
export async function resumePrismAudioContext(): Promise<boolean> {
  const context = prismAudioContext();
  if (!context) return false;
  return resumeAudioContextIfNeeded(context);
}

let audioContextKeepAliveOwners = 0;
let releaseAudioContextKeepAliveListeners: (() => void) | null = null;
let audioContextKeepAliveInterval: number | null = null;
let audioContextKeepAliveTone: {
  context: AudioContext;
  source: ConstantSourceNode;
  gain: GainNode;
} | null = null;

/**
 * A merely-running AudioContext outputs nothing, and WebKit's render-throttle
 * heuristic (and macOS App Nap) only exempts pages that are actually playing
 * audio — session 9c2a7b79 froze to 1 FPS with an idle main thread until a
 * foley clip happened to play and the throttle lifted. While the keepalive is
 * held, render a constant −80 dBFS tone so the page counts as audible.
 */
function startAudioContextKeepAliveTone(): void {
  const context = prismAudioContext();
  if (!context) return;
  if (audioContextKeepAliveTone?.context === context) return;
  stopAudioContextKeepAliveTone();
  try {
    const source = context.createConstantSource();
    source.offset.value = 1;
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    audioContextKeepAliveTone = { context, source, gain };
  } catch {
    audioContextKeepAliveTone = null;
  }
}

function stopAudioContextKeepAliveTone(): void {
  if (!audioContextKeepAliveTone) return;
  try {
    audioContextKeepAliveTone.source.stop();
    audioContextKeepAliveTone.source.disconnect();
    audioContextKeepAliveTone.gain.disconnect();
  } catch {
    // Context may already be closed; nothing to release.
  }
  audioContextKeepAliveTone = null;
}

let renderThrottleNudgeUntilMs = 0;

/**
 * One-shot recovery for a throttled webview with no live session claimed
 * (e.g. parked on the topic picker): play the inaudible tone briefly so
 * WebKit lifts frame throttling. Deduped to one nudge per 15 seconds.
 */
export function nudgePrismRenderThrottleRecovery(nowMs = Date.now()): void {
  if (audioContextKeepAliveOwners > 0) return;
  if (nowMs < renderThrottleNudgeUntilMs) return;
  renderThrottleNudgeUntilMs = nowMs + 15_000;
  ensurePrismAudioContextRunning();
  startAudioContextKeepAliveTone();
  window.setTimeout(() => {
    if (audioContextKeepAliveOwners === 0) stopAudioContextKeepAliveTone();
  }, 10_000);
}

/**
 * Keep the shared AudioContext running across minimize/hide for live sessions
 * and faithful audio masters. Ref-counted; safe to nest with capture.
 */
export function acquirePrismAudioContextKeepAlive(): () => void {
  audioContextKeepAliveOwners += 1;
  if (
    !releaseAudioContextKeepAliveListeners &&
    typeof document !== "undefined" &&
    typeof window !== "undefined"
  ) {
    const bump = (): void => {
      ensurePrismAudioContextRunning();
      startAudioContextKeepAliveTone();
    };
    const handleVisibility = (): void => {
      bump();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    window.addEventListener("pageshow", handleVisibility);
    // Desktop may allow resume while hidden; retry briefly if OS suspended us.
    audioContextKeepAliveInterval = window.setInterval(bump, 2_000);
    releaseAudioContextKeepAliveListeners = () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      window.removeEventListener("pageshow", handleVisibility);
      if (audioContextKeepAliveInterval !== null) {
        window.clearInterval(audioContextKeepAliveInterval);
        audioContextKeepAliveInterval = null;
      }
    };
    bump();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    audioContextKeepAliveOwners = Math.max(0, audioContextKeepAliveOwners - 1);
    if (audioContextKeepAliveOwners > 0) return;
    stopAudioContextKeepAliveTone();
    releaseAudioContextKeepAliveListeners?.();
    releaseAudioContextKeepAliveListeners = null;
  };
}

export function resetPrismAudioContextKeepAliveForTests(): void {
  audioContextKeepAliveOwners = 0;
  stopAudioContextKeepAliveTone();
  renderThrottleNudgeUntilMs = 0;
  releaseAudioContextKeepAliveListeners?.();
  releaseAudioContextKeepAliveListeners = null;
  if (audioContextKeepAliveInterval !== null) {
    clearInterval(audioContextKeepAliveInterval);
    audioContextKeepAliveInterval = null;
  }
}

export function cancelPrimedReplayAudioMasterCapture(): void {
  // The shared mixer is session-neutral and may still own live ambience.
}

export async function startReplayAudioMasterCapture(
  sourceId: string,
  options: {
    markIntro?: boolean;
    /** Pause the master during thinking / synthesis holds (Signal and Coffee). */
    compactThinkingGaps?: boolean;
    /** Persist thinking direction only when it resolves into a real message. */
    requireLinkedThinkingMessage?: boolean;
    voiceSelection?: ReplayVoiceSelectionSnapshotV2;
  } = {},
): Promise<boolean> {
  const normalizedSourceId = sourceId.trim();
  const mimeType = supportedCaptureMimeType();
  if (!normalizedSourceId || mimeType === null) return false;
  if (activeCapture?.sourceId === normalizedSourceId) return true;
  if (activeCapture) await stopReplayAudioMasterCapture(activeCapture.sourceId);
  const context = prismAudioContext();
  const output = worldOutputForSharedContext();
  if (!context || !output) return false;
  const releaseKeepAlive = acquirePrismAudioContextKeepAlive();
  if (!(await resumeAudioContextIfNeeded(context))) {
    releaseKeepAlive();
    return false;
  }
  try {
    const destination = context.createMediaStreamDestination();
    const recorderMimeType = mimeType;
    const recorder = recorderMimeType
      ? new MediaRecorder(destination.stream, {
          mimeType: recorderMimeType,
          audioBitsPerSecond: 192_000,
        })
      : new MediaRecorder(destination.stream);
    const capture: ReplayAudioMasterCaptureSession = {
      sourceId: normalizedSourceId,
      context,
      destination,
      recorder,
      recorderMimeType,
      chunks: [],
      startedAt: nowMs(),
      totalPausedMs: 0,
      pausedAt: null,
      compactThinkingGaps: options.compactThinkingGaps === true,
      requireLinkedThinkingMessage:
        options.requireLinkedThinkingMessage === true,
      compactThinkingGapsDisabled: false,
      compactHoldDepth: 0,
      needsRecorderRestart: false,
      events: [],
      direction: [],
      mouthCuesByParticipant: new Map(),
      voiceLightCuesByParticipant: new Map(),
      speechActivityCuesByParticipant: new Map(),
      ...(options.voiceSelection
        ? { voiceSelection: { ...options.voiceSelection } }
        : {}),
      thinkingByParticipant: new Map(),
      stopPromise: null,
      releaseKeepAlive,
    };
    attachRecorderDataHandler(capture, recorder);
    activeCapture = capture;
    output.connect(destination);
    recorder.start(250);
    if (options.markIntro !== false) {
      markReplayDirectionEvent({
        sourceId: normalizedSourceId,
        kind: "intro",
        payload: { active: true },
      });
      markReplayAudioMasterCapture({
        sourceId: normalizedSourceId,
        phase: "intro_start",
      });
    }
    return true;
  } catch {
    releaseKeepAlive();
    if (activeCapture?.sourceId === normalizedSourceId) activeCapture = null;
    try {
      output.disconnect();
      output.connect(context.destination);
    } catch {
      // The shared context is unavailable.
    }
    return false;
  }
}

export function adoptReplayAudioMasterCaptureSourceId(
  currentSourceId: string,
  nextSourceId: string,
): boolean {
  const capture = activeCapture;
  const normalizedNext = nextSourceId.trim();
  if (
    !capture ||
    capture.sourceId !== currentSourceId ||
    !normalizedNext
  ) {
    return false;
  }
  capture.sourceId = normalizedNext;
  return true;
}

export function replayAudioMasterCaptureElapsedMs(
  sourceId: string,
): number | null {
  if (activeCapture?.sourceId !== sourceId) return null;
  const capture = activeCapture;
  const openPauseMs =
    capture.pausedAt !== null ? Math.max(0, nowMs() - capture.pausedAt) : 0;
  return Math.max(
    0,
    Math.round(nowMs() - capture.startedAt - capture.totalPausedMs - openPauseMs),
  );
}

export function replayAudioMasterCaptureActive(): boolean {
  return activeCapture !== null;
}

export function markReplayMouthShape(args: {
  sourceId: string;
  participantId: string;
  shape: ReplayMouthShapeV2;
  atMs?: number;
}): void {
  const capture = activeCapture;
  const participantId = args.participantId.trim();
  if (!capture || capture.sourceId !== args.sourceId || !participantId) return;
  const atMs = Math.max(
    0,
    Math.round(
      typeof args.atMs === "number" && Number.isFinite(args.atMs)
        ? args.atMs
        : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? 0,
    ),
  );
  const cues = capture.mouthCuesByParticipant.get(participantId) ?? [];
  const previous = cues[cues.length - 1];
  if (previous?.shape === args.shape) return;
  cues.push({ atMs, shape: args.shape });
  capture.mouthCuesByParticipant.set(participantId, cues);
}

function captureMouthTracks(
  capture: ReplayAudioMasterCaptureSession,
  endMs?: number,
): ReplayMouthTrackV2[] {
  return [...capture.mouthCuesByParticipant.entries()]
    .map(([participantId, capturedCues]) => {
      const cues = capturedCues.map((cue) => ({ ...cue }));
      const finalCue = cues[cues.length - 1];
      if (
        endMs !== undefined &&
        finalCue &&
        finalCue.shape !== "closed"
      ) {
        cues.push({
          atMs: Math.max(finalCue.atMs, Math.round(endMs)),
          shape: "closed",
        });
      }
      return { participantId, cues };
    })
    .sort((left, right) =>
      left.participantId.localeCompare(right.participantId),
    );
}

export function replayAudioMasterCaptureMouthTracks(
  sourceId: string,
): ReplayMouthTrackV2[] {
  if (activeCapture?.sourceId !== sourceId) return [];
  return captureMouthTracks(activeCapture);
}

export function markReplayVoiceLightLevel(args: {
  sourceId: string;
  participantId: string;
  level: number;
  atMs?: number;
}): void {
  const capture = activeCapture;
  const participantId = args.participantId.trim();
  if (!capture || capture.sourceId !== args.sourceId || !participantId) return;
  const atMs = Math.max(
    0,
    Math.round(
      typeof args.atMs === "number" && Number.isFinite(args.atMs)
        ? args.atMs
        : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? 0,
    ),
  );
  const level = Math.round(
    Math.max(0, Math.min(1, Number.isFinite(args.level) ? args.level : 0)) * 100,
  ) / 100;
  const cues = capture.voiceLightCuesByParticipant.get(participantId) ?? [];
  const previous = cues[cues.length - 1];
  if (previous) {
    const elapsedMs = atMs - previous.atMs;
    if (elapsedMs < 50 && level !== 0) return;
    if (previous.level === level && elapsedMs < 250) return;
    if (Math.abs(previous.level - level) < 0.03 && elapsedMs < 250) return;
  }
  cues.push({ atMs, level });
  capture.voiceLightCuesByParticipant.set(participantId, cues);
}

export function markReplaySpeechActivity(args: {
  sourceId: string;
  participantId: string;
  active: boolean;
  atMs?: number;
}): void {
  const capture = activeCapture;
  const participantId = args.participantId.trim();
  if (!capture || capture.sourceId !== args.sourceId || !participantId) return;
  const atMs = Math.max(0, Math.round(
    typeof args.atMs === "number" && Number.isFinite(args.atMs)
      ? args.atMs
      : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? 0,
  ));
  const cues = capture.speechActivityCuesByParticipant.get(participantId) ?? [];
  const previous = cues.at(-1);
  if (previous?.active === args.active) return;
  cues.push({ atMs, active: args.active });
  capture.speechActivityCuesByParticipant.set(participantId, cues);
}

function captureSpeechActivityTracks(
  capture: ReplayAudioMasterCaptureSession,
  endMs?: number,
): ReplaySpeechActivityTrackV1[] {
  return [...capture.speechActivityCuesByParticipant.entries()]
    .map(([participantId, capturedCues]) => {
      const cues = capturedCues.map((cue) => ({ ...cue }));
      const finalCue = cues.at(-1);
      if (endMs !== undefined && finalCue?.active) {
        cues.push({ atMs: Math.max(finalCue.atMs, Math.round(endMs)), active: false });
      }
      return { participantId, cues };
    })
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
}

function captureVoiceLightTracks(
  capture: ReplayAudioMasterCaptureSession,
  endMs?: number,
): ReplayVoiceLightTrackV1[] {
  return [...capture.voiceLightCuesByParticipant.entries()]
    .map(([participantId, capturedCues]) => {
      const cues = capturedCues.map((cue) => ({ ...cue }));
      const finalCue = cues[cues.length - 1];
      if (endMs !== undefined && finalCue && finalCue.level !== 0) {
        cues.push({ atMs: Math.max(finalCue.atMs, Math.round(endMs)), level: 0 });
      }
      return { participantId, cues };
    })
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
}

export function replayAudioMasterCaptureVoiceLightTracks(
  sourceId: string,
): ReplayVoiceLightTrackV1[] {
  if (activeCapture?.sourceId !== sourceId) return [];
  return captureVoiceLightTracks(activeCapture);
}

/** True while a Signal session is compacting thinking/interruption gaps. */
export function replayAudioMasterCaptureCompactsThinkingGaps(
  sourceId: string,
): boolean {
  const capture = activeCapture;
  return Boolean(
    capture &&
      capture.sourceId === sourceId &&
      capture.compactThinkingGaps &&
      !capture.compactThinkingGapsDisabled,
  );
}

function captureShouldCompactThinkingGaps(
  capture: ReplayAudioMasterCaptureSession,
): boolean {
  return capture.compactThinkingGaps && !capture.compactThinkingGapsDisabled;
}

function pauseCaptureRecorder(capture: ReplayAudioMasterCaptureSession): void {
  if (capture.pausedAt !== null) return;
  // Freeze the logical clock immediately even if the recorder pause is async.
  capture.pausedAt = nowMs();
  try {
    if (
      capture.recorder.state === "recording" &&
      typeof capture.recorder.pause === "function"
    ) {
      capture.recorder.pause();
    }
  } catch {
    // Fall through to stop/restart.
  }
  if (capture.recorder.state === "paused") return;

  // Fallback: stop this segment so no thinking audio is appended; resume starts
  // a fresh MediaRecorder on the same stream and keeps prior chunks.
  capture.needsRecorderRestart = true;
  try {
    // After the early return above, state cannot be "paused".
    if (capture.recorder.state === "recording") {
      capture.recorder.requestData();
      capture.recorder.stop();
    }
  } catch {
    capture.compactThinkingGapsDisabled = true;
    capture.totalPausedMs += Math.max(0, nowMs() - capture.pausedAt);
    capture.pausedAt = null;
    capture.needsRecorderRestart = false;
  }
}

function resumeCaptureRecorder(capture: ReplayAudioMasterCaptureSession): void {
  if (capture.pausedAt === null) return;
  capture.totalPausedMs += Math.max(0, nowMs() - capture.pausedAt);
  capture.pausedAt = null;

  if (capture.needsRecorderRestart || capture.recorder.state === "inactive") {
    capture.needsRecorderRestart = false;
    try {
      const recorder = createCaptureRecorder(capture);
      capture.recorder = recorder;
      recorder.start(250);
    } catch {
      capture.compactThinkingGapsDisabled = true;
    }
    return;
  }

  if (capture.recorder.state !== "paused") return;
  try {
    capture.recorder.resume();
  } catch {
    capture.needsRecorderRestart = true;
    try {
      const recorder = createCaptureRecorder(capture);
      capture.recorder = recorder;
      recorder.start(250);
      capture.needsRecorderRestart = false;
    } catch {
      capture.compactThinkingGapsDisabled = true;
    }
  }
}

/**
 * Depth-counted hold for presented thinking and voice-preparation intervals.
 * Signal holds during thinking; Coffee holds during bot thinking and while a
 * player line's voice is still synthesizing.
 */
export function setReplayAudioMasterCompactHold(
  sourceId: string,
  holding: boolean,
): void {
  const capture = activeCapture;
  if (!capture || capture.sourceId !== sourceId) return;
  if (!captureShouldCompactThinkingGaps(capture)) return;
  if (holding) {
    capture.compactHoldDepth += 1;
    if (capture.compactHoldDepth === 1) pauseCaptureRecorder(capture);
    return;
  }
  if (capture.compactHoldDepth <= 0) return;
  capture.compactHoldDepth -= 1;
  if (capture.compactHoldDepth === 0) resumeCaptureRecorder(capture);
}

export function markReplayDirectionEvent(args: {
  sourceId: string;
  kind: ReplayDirectionEventKindV2;
  sourceMessageId?: string | null;
  atMs?: number;
  endMs?: number;
  payload?: Record<string, unknown>;
}): void {
  const capture = activeCapture;
  if (!capture || capture.sourceId !== args.sourceId) return;
  const atMs = Math.max(
    0,
    Math.round(
      typeof args.atMs === "number" && Number.isFinite(args.atMs)
        ? args.atMs
        : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? 0,
    ),
  );
  const endMs =
    typeof args.endMs === "number" && Number.isFinite(args.endMs)
      ? Math.max(atMs, Math.round(args.endMs))
      : undefined;
  capture.direction.push({
    sequence: capture.direction.length + 1,
    atMs,
    ...(endMs === undefined ? {} : { endMs }),
    kind: args.kind,
    sourceMessageId: args.sourceMessageId ?? null,
    payload: { ...(args.payload ?? {}) },
  });
}

/**
 * Replaces a planned speech end with the instant the shared output actually
 * completed or was cancelled. Matching the message, speaker, and channel keeps
 * overlapping reaction/crosstalk lanes independent.
 */
export function reconcileReplaySpeechDirection(args: {
  sourceId: string;
  sourceMessageId: string;
  speakerId: string;
  channel?: string;
  endReason: "completed" | "cancelled";
  atMs?: number;
}): boolean {
  const capture = activeCapture;
  const sourceMessageId = args.sourceMessageId.trim();
  const speakerId = args.speakerId.trim();
  if (
    !capture ||
    capture.sourceId !== args.sourceId ||
    !sourceMessageId ||
    !speakerId
  ) {
    return false;
  }
  const channel = args.channel ?? "primary";
  const event = [...capture.direction].reverse().find((candidate) =>
    candidate.kind === "speech" &&
    candidate.sourceMessageId === sourceMessageId &&
    candidate.payload.active !== false &&
    candidate.payload.audible !== false &&
    candidate.payload.speakerId === speakerId &&
    (candidate.payload.channel ?? "primary") === channel
  );
  if (!event) return false;
  const actualEndMs = Math.max(
    event.atMs + 1,
    Math.round(
      typeof args.atMs === "number" && Number.isFinite(args.atMs)
        ? args.atMs
        : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? event.atMs + 1,
    ),
  );
  event.endMs = actualEndMs;
  event.payload = {
    ...event.payload,
    endReason: args.endReason,
  };
  return true;
}

/**
 * Starts a private thinking interval when its visual presentation is committed.
 * The interval is emitted only when it closes, so interrupted and failed turns
 * retain their exact visual duration without inventing a transcript row.
 * Compact recorder holds are driven separately via setReplayAudioMasterCompactHold.
 */
export function startReplayThinkingPresentation(args: {
  sourceId: string;
  participantId: string;
  botId?: string;
  audible: boolean;
  camera: string | null;
  segment: string | null;
  atMs?: number;
}): void {
  const capture = activeCapture;
  const participantId = args.participantId.trim();
  if (!capture || capture.sourceId !== args.sourceId || !participantId) return;
  if (capture.thinkingByParticipant.has(participantId)) return;
  capture.thinkingByParticipant.set(participantId, {
    participantId,
    botId: args.botId?.trim() || participantId,
    startMs: Math.max(
      0,
      Math.round(
        typeof args.atMs === "number" && Number.isFinite(args.atMs)
          ? args.atMs
          : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? 0,
      ),
    ),
    startedAtWallMs: nowMs(),
    audible: args.audible,
    camera: args.camera,
    segment: args.segment,
  });
}

export function endReplayThinkingPresentation(args: {
  sourceId: string;
  participantId: string;
  resolvedParticipantId?: string | null;
  resolvedBotId?: string | null;
  followingMessageId?: string | null;
  reason?: ReplayThinkingDirectionPayloadV2["endReason"];
  atMs?: number;
}): void {
  const capture = activeCapture;
  const participantId = args.participantId.trim();
  if (!capture || capture.sourceId !== args.sourceId || !participantId) return;
  const active = capture.thinkingByParticipant.get(participantId);
  if (!active) return;
  capture.thinkingByParticipant.delete(participantId);
  const followingMessageId = args.followingMessageId?.trim() || null;
  if (capture.requireLinkedThinkingMessage && !followingMessageId) return;
  const compact = captureShouldCompactThinkingGaps(capture);
  const rawEndMs = Math.round(
    typeof args.atMs === "number" && Number.isFinite(args.atMs)
      ? args.atMs
      : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? active.startMs + 1,
  );
  // Compacted Signal masters collapse thinking to a near-zero direction tick.
  const endMs = compact
    ? active.startMs + 1
    : Math.max(active.startMs + 1, rawEndMs);
  const presentationDurationMs = compact
    ? Math.max(1, Math.round(nowMs() - active.startedAtWallMs))
    : endMs - active.startMs;
  const resolvedParticipantId =
    args.resolvedParticipantId?.trim() || active.participantId;
  const resolvedBotId =
    args.resolvedBotId?.trim() ||
    (args.resolvedParticipantId?.trim()
      ? resolvedParticipantId
      : active.botId);
  const payload: ReplayThinkingDirectionPayloadV2 = {
    participantId: resolvedParticipantId,
    botId: resolvedBotId,
    startMs: active.startMs,
    endMs,
    presentationDurationMs,
    timelineCompacted: compact,
    audible: active.audible,
    camera: active.camera,
    segment: active.segment,
    followingMessageId,
    endReason: args.reason ?? "completed",
  };
  markReplayDirectionEvent({
    sourceId: args.sourceId,
    kind: "thinking",
    sourceMessageId: payload.followingMessageId,
    atMs: active.startMs,
    endMs,
    payload,
  });
}

export function syncReplayThinkingPresentations(args: {
  sourceId: string;
  presentations: readonly {
    participantId: string;
    botId?: string;
    audible: boolean;
    camera: string | null;
    segment: string | null;
  }[];
  followingMessageId?: string | null;
  followingParticipant?: {
    participantId: string;
    botId?: string | null;
  } | null;
  endReason?: ReplayThinkingDirectionPayloadV2["endReason"];
  endingSegment?: string | null;
}): void {
  const capture = activeCapture;
  if (!capture || capture.sourceId !== args.sourceId) return;
  const nextByParticipant = new Map(
    args.presentations
      .filter((presentation) => presentation.participantId.trim().length > 0)
      .map((presentation) => [
        presentation.participantId.trim(),
        presentation,
      ]),
  );
  for (const [participantId, active] of capture.thinkingByParticipant) {
    const next = nextByParticipant.get(participantId);
    if (!next) {
      if (args.endingSegment !== undefined) {
        active.segment = args.endingSegment;
      }
      endReplayThinkingPresentation({
        sourceId: args.sourceId,
        participantId,
        resolvedParticipantId: args.followingParticipant?.participantId,
        resolvedBotId: args.followingParticipant?.botId,
        followingMessageId: args.followingMessageId,
        reason: args.endReason ?? "completed",
      });
      continue;
    }
    // Update camera/segment/audible in place — do not end/restart, or a
    // camera flicker would thrash MediaRecorder resume during thinking.
    const nextBotId = next.botId?.trim() || participantId;
    if (nextBotId !== active.botId) {
      endReplayThinkingPresentation({
        sourceId: args.sourceId,
        participantId,
        followingMessageId: args.followingMessageId,
        reason: "replaced",
      });
      continue;
    }
    active.audible = next.audible;
    active.camera = next.camera;
    active.segment = next.segment;
  }
  for (const presentation of nextByParticipant.values()) {
    startReplayThinkingPresentation({
      sourceId: args.sourceId,
      ...presentation,
    });
  }
}

function closeReplayThinkingPresentations(
  capture: ReplayAudioMasterCaptureSession,
  atMs: number,
): void {
  for (const participantId of [...capture.thinkingByParticipant.keys()]) {
    endReplayThinkingPresentation({
      sourceId: capture.sourceId,
      participantId,
      reason: "capture_end",
      atMs,
    });
  }
}

export function markReplayAudioMasterCapture(args: {
  sourceId: string;
  phase:
    | "intro_start"
    | "speech_start"
    | "speech_end"
    | "outro_start"
    | "capture_end";
  messageId?: string | null;
  atMs?: number;
}): void {
  const capture = activeCapture;
  if (!capture || capture.sourceId !== args.sourceId) return;
  const atMs = Math.max(
    0,
    Math.round(
      typeof args.atMs === "number" && Number.isFinite(args.atMs)
        ? args.atMs
        : replayAudioMasterCaptureElapsedMs(args.sourceId) ?? 0,
    ),
  );
  const duplicate = capture.events.some(
    (event) =>
      event.payload.phase === args.phase &&
      (event.payload.messageId ?? null) === (args.messageId ?? null),
  );
  if (!duplicate || args.phase === "capture_end") {
    capture.events.push({
      id: `capture:${args.sourceId}:${args.phase}:${args.messageId ?? "session"}:${atMs}`,
      kind: "capture_timing",
      sourceMessageId: args.messageId ?? null,
      payload: {
        phase: args.phase,
        atMs,
        ...(args.messageId ? { messageId: args.messageId } : {}),
      },
      occurredAt: new Date().toISOString(),
    });
  }
  if (args.phase === "outro_start") {
    markReplayDirectionEvent({
      sourceId: args.sourceId,
      kind: "outro",
      atMs,
      payload: { active: true },
    });
  }
}

export function replayAudioMasterCaptureEvents(
  sourceId: string,
): ReplayEventV1[] {
  if (activeCapture?.sourceId !== sourceId) return [];
  return activeCapture.events.map((event) => ({
    ...event,
    payload: { ...event.payload },
  }));
}

export function replayAudioMasterCaptureDirection(
  sourceId: string,
): ReplayDirectionEventV2[] {
  if (activeCapture?.sourceId !== sourceId) return [];
  return activeCapture.direction.map((event) => ({
    ...event,
    payload: { ...event.payload },
  }));
}

export function stopReplayAudioMasterCapture(
  sourceId: string,
  stopFallbackMs = 4_000,
): Promise<ReplayAudioMasterCaptureResult | null> {
  const capture = activeCapture;
  if (!capture || capture.sourceId !== sourceId) return Promise.resolve(null);
  if (capture.stopPromise) return capture.stopPromise;
  const provisionalMs = replayAudioMasterCaptureElapsedMs(sourceId) ?? 0;
  closeReplayThinkingPresentations(capture, provisionalMs);
  // Drop nested holds and resume before finalizing duration.
  while (capture.compactHoldDepth > 0) {
    setReplayAudioMasterCompactHold(sourceId, false);
  }
  if (capture.pausedAt !== null) resumeCaptureRecorder(capture);
  const durationMs = replayAudioMasterCaptureElapsedMs(sourceId) ?? 0;
  markReplayAudioMasterCapture({ sourceId, phase: "capture_end" });
  capture.stopPromise = new Promise((resolve) => {
    let settled = false;
    let stopFallbackHandle: ReturnType<typeof setTimeout> | null = null;
    const finish = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      if (stopFallbackHandle !== null) {
        clearTimeout(stopFallbackHandle);
        stopFallbackHandle = null;
      }
      if (activeCapture === capture) activeCapture = null;
      capture.releaseKeepAlive();
      try {
        sharedWorldOutput?.disconnect(capture.destination);
      } catch {
        // The shared output or destination is already released.
      }
      const contentType =
        capture.recorder.mimeType.split(";", 1)[0] || "audio/webm";
      const blob = new Blob(capture.chunks, { type: contentType });
      const speechActivityTracks = captureSpeechActivityTracks(capture, durationMs);
      const result =
        blob.size > 0
          ? {
              sourceId: capture.sourceId,
              bytes: await blob.arrayBuffer(),
              contentType,
              durationMs,
              events: capture.events.map((event) => ({
                ...event,
                payload: { ...event.payload },
              })),
              direction: capture.direction.map((event) => ({
                ...event,
                payload: { ...event.payload },
              })),
              mouthTracks: captureMouthTracks(capture, durationMs),
              voiceLightTracks: captureVoiceLightTracks(capture, durationMs),
              ...(speechActivityTracks.length > 0
                ? { speechActivityTracks }
                : {}),
              ...(capture.voiceSelection
                ? { voiceSelection: { ...capture.voiceSelection } }
                : {}),
            }
          : null;
      try {
        capture.destination.disconnect();
      } catch {
        // The destination is already released.
      }
      for (const track of capture.destination.stream.getTracks?.() ?? []) {
        track.stop();
      }
      resolve(result);
    };
    capture.recorder.addEventListener("stop", () => void finish(), {
      once: true,
    });
    capture.recorder.addEventListener("error", () => void finish(), {
      once: true,
    });
    // WebKit and Chromium can occasionally leave MediaRecorder in an inactive
    // state without dispatching its terminal event. Preserve any flushed
    // chunks and release capture ownership instead of stranding the replay.
    stopFallbackHandle = setTimeout(
      () => void finish(),
      Math.max(1, stopFallbackMs),
    );
    try {
      if (capture.recorder.state === "inactive") {
        void finish();
        return;
      }
      capture.recorder.requestData();
      capture.recorder.stop();
    } catch {
      void finish();
    }
  });
  return capture.stopPromise;
}

/**
 * Tear down a failed or abandoned capture without publishing its partial
 * bytes. Awaiting this prevents a leaked recorder from blocking the next
 * recordable session.
 */
export async function abortReplayAudioMasterCapture(
  sourceId: string,
): Promise<void> {
  await stopReplayAudioMasterCapture(sourceId);
}

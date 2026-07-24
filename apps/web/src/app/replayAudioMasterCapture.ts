"use client";

import type {
  ReplayDirectionEventKindV2,
  ReplayDirectionEventV2,
  ReplayEventV1,
  ReplayThinkingDirectionPayloadV2,
} from "@localai/shared";

export type ReplayAudioMasterCaptureResult = {
  sourceId: string;
  bytes: ArrayBuffer;
  contentType: string;
  durationMs: number;
  /** Temporary V1 compatibility for the Coffee restoration boundary. */
  events: ReplayEventV1[];
  direction: ReplayDirectionEventV2[];
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
   * Signal-only: pause the whole master during thinking / interruption
   * processing beats. Coffee leaves this false.
   */
  compactThinkingGaps: boolean;
  /** Set when neither pause nor stop/restart can hold the recorder. */
  compactThinkingGapsDisabled: boolean;
  /** Nested holds (thinking presentation + interruption retort delay). */
  compactHoldDepth: number;
  /** True when pause() failed and the recorder was stopped for a clean restart. */
  needsRecorderRestart: boolean;
  events: ReplayEventV1[];
  direction: ReplayDirectionEventV2[];
  thinkingByParticipant: Map<string, ReplayThinkingPresentation>;
  stopPromise: Promise<ReplayAudioMasterCaptureResult | null> | null;
};

type ReplayThinkingPresentation = {
  participantId: string;
  botId: string;
  startMs: number;
  audible: boolean;
  camera: string | null;
  segment: string | null;
};

let sharedAudioContext: AudioContext | null = null;
let sharedAudioContextConstructor: typeof AudioContext | null = null;
let sharedWorldOutput: GainNode | null = null;
let activeCapture: ReplayAudioMasterCaptureSession | null = null;

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
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
  }
  return sharedAudioContext;
}

function worldOutputForSharedContext(): GainNode | null {
  const context = prismAudioContext();
  if (!context) return null;
  if (!sharedWorldOutput) {
    sharedWorldOutput = context.createGain();
    sharedWorldOutput.connect(context.destination);
  }
  return sharedWorldOutput;
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
 * Routes an HTML media element into the same final post-effect output. A
 * recordable element is never allowed to fall back to direct device playback.
 */
export function routeAudioElementToPrismOutput(
  audio: HTMLMediaElement,
): (() => void) | null {
  const context = prismAudioContext();
  const output = worldOutputForSharedContext();
  if (!context || !output) return null;
  try {
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    const source = context.createMediaElementSource(audio);
    source.connect(output);
    return () => {
      try {
        source.disconnect();
      } catch {
        // The media element or shared context is already released.
      }
    };
  } catch {
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

export function cancelPrimedReplayAudioMasterCapture(): void {
  // The shared mixer is session-neutral and may still own live ambience.
}

export async function startReplayAudioMasterCapture(
  sourceId: string,
  options: {
    markIntro?: boolean;
    /** Signal only — pause the master during thinking / interruption holds. */
    compactThinkingGaps?: boolean;
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
      compactThinkingGapsDisabled: false,
      compactHoldDepth: 0,
      needsRecorderRestart: false,
      events: [],
      direction: [],
      thinkingByParticipant: new Map(),
      stopPromise: null,
    };
    attachRecorderDataHandler(capture, recorder);
    activeCapture = capture;
    output.connect(destination);
    if (context.state === "suspended") await context.resume();
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
 * Nested Signal hold for thinking presentations and interruption processing
 * beats. Coffee captures ignore this (compactThinkingGaps stays false).
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

/**
 * Hold the master for a timed interruption processing beat, then release.
 * Nested with thinking holds via compactHoldDepth.
 */
export function pulseReplayAudioMasterCompactHold(
  sourceId: string,
  durationMs: number,
): void {
  const capture = activeCapture;
  if (!capture || capture.sourceId !== sourceId) return;
  if (!captureShouldCompactThinkingGaps(capture)) return;
  const boundedMs = Math.max(0, Math.round(durationMs));
  if (boundedMs <= 0) return;
  setReplayAudioMasterCompactHold(sourceId, true);
  const expectedSourceId = sourceId;
  window.setTimeout(() => {
    if (activeCapture?.sourceId !== expectedSourceId) return;
    setReplayAudioMasterCompactHold(expectedSourceId, false);
  }, boundedMs);
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
    audible: args.audible,
    camera: args.camera,
    segment: args.segment,
  });
}

export function endReplayThinkingPresentation(args: {
  sourceId: string;
  participantId: string;
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
  const payload: ReplayThinkingDirectionPayloadV2 = {
    participantId: active.participantId,
    botId: active.botId,
    startMs: active.startMs,
    endMs,
    audible: active.audible,
    camera: active.camera,
    segment: active.segment,
    followingMessageId: args.followingMessageId?.trim() || null,
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
  endReason?: ReplayThinkingDirectionPayloadV2["endReason"];
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
      endReplayThinkingPresentation({
        sourceId: args.sourceId,
        participantId,
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
    const finish = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      if (activeCapture === capture) activeCapture = null;
      try {
        sharedWorldOutput?.disconnect(capture.destination);
      } catch {
        // The shared output or destination is already released.
      }
      const contentType =
        capture.recorder.mimeType.split(";", 1)[0] || "audio/webm";
      const blob = new Blob(capture.chunks, { type: contentType });
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
            }
          : null;
      try {
        capture.destination.disconnect();
      } catch {
        // The destination is already released.
      }
      resolve(result);
    };
    capture.recorder.addEventListener("stop", () => void finish(), {
      once: true,
    });
    capture.recorder.addEventListener("error", () => void finish(), {
      once: true,
    });
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

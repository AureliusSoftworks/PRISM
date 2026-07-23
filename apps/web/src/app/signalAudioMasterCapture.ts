"use client";

import type { BotcastReplayEvent } from "@localai/shared";

type AudioOutputRoute = {
  context: AudioContext;
  output: GainNode;
  captureDestination: MediaStreamAudioDestinationNode | null;
  captureSource: MediaStreamAudioSourceNode | null;
};

export type SignalAudioMasterCaptureResult = {
  episodeId: string;
  bytes: ArrayBuffer;
  contentType: string;
  durationMs: number;
  events: BotcastReplayEvent[];
};

type SignalAudioMasterCaptureSession = {
  episodeId: string;
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  events: BotcastReplayEvent[];
  stopPromise: Promise<SignalAudioMasterCaptureResult | null> | null;
};

const outputRoutes = new Map<AudioContext, AudioOutputRoute>();
let mediaElementAudioContext: AudioContext | null = null;
let primedCaptureContext: AudioContext | null = null;
let activeCapture: SignalAudioMasterCaptureSession | null = null;

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function browserAudioContext(): AudioContext | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext !== "function"
  ) {
    return null;
  }
  return new window.AudioContext({ latencyHint: "interactive" });
}

function attachRouteToCapture(
  route: AudioOutputRoute,
  capture: SignalAudioMasterCaptureSession,
): void {
  if (route.context.state === "closed" || route.captureDestination) return;
  try {
    const destination = route.context.createMediaStreamDestination();
    const source = capture.context.createMediaStreamSource(destination.stream);
    route.output.connect(destination);
    source.connect(capture.destination);
    route.captureDestination = destination;
    route.captureSource = source;
  } catch {
    route.captureDestination = null;
    route.captureSource = null;
  }
}

function detachRouteFromCapture(route: AudioOutputRoute): void {
  if (route.captureDestination) {
    try {
      route.output.disconnect(route.captureDestination);
    } catch {
      // A closed source context has already released the route.
    }
  }
  try {
    route.captureSource?.disconnect();
  } catch {
    // A closed capture context has already released the source.
  }
  route.captureDestination = null;
  route.captureSource = null;
}

/**
 * The single device-output node for PRISM's Web Audio engines. During a Signal
 * session the exact post-mix output is mirrored into the live master recorder.
 */
export function prismAudioOutputNode(context: AudioContext): AudioNode {
  const existing = outputRoutes.get(context);
  if (existing) return existing.output;
  const output = context.createGain();
  output.connect(context.destination);
  const route: AudioOutputRoute = {
    context,
    output,
    captureDestination: null,
    captureSource: null,
  };
  outputRoutes.set(context, route);
  const releaseClosedRoute = (): void => {
    if (context.state !== "closed") return;
    detachRouteFromCapture(route);
    outputRoutes.delete(context);
    context.removeEventListener?.("statechange", releaseClosedRoute);
  };
  context.addEventListener?.("statechange", releaseClosedRoute);
  if (activeCapture) attachRouteToCapture(route, activeCapture);
  return output;
}

/**
 * Routes an HTML audio element through the same output bus as Web Audio
 * sources. The returned cleanup must run only after the element has finished.
 */
export function routeAudioElementToPrismOutput(
  audio: HTMLMediaElement,
): (() => void) | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext !== "function"
  ) {
    return null;
  }
  try {
    if (
      !mediaElementAudioContext ||
      mediaElementAudioContext.state === "closed"
    ) {
      mediaElementAudioContext = new window.AudioContext({
        latencyHint: "interactive",
      });
    }
    if (mediaElementAudioContext.state === "suspended") {
      void mediaElementAudioContext.resume().catch(() => undefined);
    }
    const source = mediaElementAudioContext.createMediaElementSource(audio);
    source.connect(prismAudioOutputNode(mediaElementAudioContext));
    return () => {
      try {
        source.disconnect();
      } catch {
        // The media element or context is already released.
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

/** Prime the recorder clock while the original Begin episode gesture is live. */
export function primeSignalAudioMasterCapture(): void {
  if (primedCaptureContext && primedCaptureContext.state !== "closed") {
    void primedCaptureContext.resume().catch(() => undefined);
    return;
  }
  primedCaptureContext = browserAudioContext();
  void primedCaptureContext?.resume().catch(() => undefined);
}

export function cancelPrimedSignalAudioMasterCapture(): void {
  const context = primedCaptureContext;
  primedCaptureContext = null;
  if (context && context.state !== "closed") {
    void context.close().catch(() => undefined);
  }
}

export function startSignalAudioMasterCapture(episodeId: string): boolean {
  const normalizedEpisodeId = episodeId.trim();
  const mimeType = supportedCaptureMimeType();
  if (!normalizedEpisodeId || mimeType === null) return false;
  if (activeCapture?.episodeId === normalizedEpisodeId) return true;
  if (activeCapture) {
    void stopSignalAudioMasterCapture(activeCapture.episodeId);
    return false;
  }
  const context =
    primedCaptureContext && primedCaptureContext.state !== "closed"
      ? primedCaptureContext
      : browserAudioContext();
  primedCaptureContext = null;
  if (!context) return false;
  try {
    const destination = context.createMediaStreamDestination();
    const recorder = mimeType
      ? new MediaRecorder(destination.stream, {
          mimeType,
          audioBitsPerSecond: 192_000,
        })
      : new MediaRecorder(destination.stream);
    const capture: SignalAudioMasterCaptureSession = {
      episodeId: normalizedEpisodeId,
      context,
      destination,
      recorder,
      chunks: [],
      startedAt: nowMs(),
      events: [],
      stopPromise: null,
    };
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) capture.chunks.push(event.data);
    });
    activeCapture = capture;
    for (const route of outputRoutes.values()) {
      attachRouteToCapture(route, capture);
    }
    void context.resume().catch(() => undefined);
    recorder.start(250);
    markSignalAudioMasterCapture({
      episodeId: normalizedEpisodeId,
      phase: "intro_start",
    });
    return true;
  } catch {
    void context.close().catch(() => undefined);
    return false;
  }
}

export function signalAudioMasterCaptureElapsedMs(
  episodeId: string,
): number | null {
  if (activeCapture?.episodeId !== episodeId) return null;
  return Math.max(0, Math.round(nowMs() - activeCapture.startedAt));
}

export function markSignalAudioMasterCapture(args: {
  episodeId: string;
  phase:
    | "intro_start"
    | "speech_start"
    | "speech_end"
    | "outro_start"
    | "capture_end";
  messageId?: string | null;
}): void {
  const capture = activeCapture;
  if (!capture || capture.episodeId !== args.episodeId) return;
  const atMs = signalAudioMasterCaptureElapsedMs(args.episodeId) ?? 0;
  const duplicate = capture.events.some(
    (event) =>
      event.payload.phase === args.phase &&
      (event.payload.messageId ?? null) === (args.messageId ?? null),
  );
  if (duplicate && args.phase !== "capture_end") return;
  capture.events.push({
    id: `capture:${args.episodeId}:${args.phase}:${args.messageId ?? "episode"}:${atMs}`,
    episodeId: args.episodeId,
    sequence: capture.events.length + 1,
    kind: "capture_timing",
    payload: {
      phase: args.phase,
      atMs,
      ...(args.messageId ? { messageId: args.messageId } : {}),
    },
    occurredAt: new Date().toISOString(),
  });
}

export function signalAudioMasterCaptureEvents(
  episodeId: string,
): BotcastReplayEvent[] {
  if (activeCapture?.episodeId !== episodeId) return [];
  return activeCapture.events.map((event) => ({
    ...event,
    payload: { ...event.payload },
  }));
}

export function stopSignalAudioMasterCapture(
  episodeId: string,
): Promise<SignalAudioMasterCaptureResult | null> {
  const capture = activeCapture;
  if (!capture || capture.episodeId !== episodeId) {
    return Promise.resolve(null);
  }
  if (capture.stopPromise) return capture.stopPromise;
  markSignalAudioMasterCapture({ episodeId, phase: "capture_end" });
  const durationMs = signalAudioMasterCaptureElapsedMs(episodeId) ?? 0;
  capture.stopPromise = new Promise((resolve) => {
    let settled = false;
    const finish = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      if (activeCapture === capture) activeCapture = null;
      for (const route of outputRoutes.values()) detachRouteFromCapture(route);
      const contentType =
        capture.recorder.mimeType.split(";", 1)[0] || "audio/webm";
      const blob = new Blob(capture.chunks, { type: contentType });
      const result =
        blob.size > 0
          ? {
              episodeId,
              bytes: await blob.arrayBuffer(),
              contentType,
              durationMs,
              events: capture.events.map((event) => ({
                ...event,
                payload: { ...event.payload },
              })),
            }
          : null;
      try {
        capture.destination.disconnect();
      } catch {
        // The capture context is already closing.
      }
      void capture.context.close().catch(() => undefined);
      resolve(result);
    };
    capture.recorder.addEventListener("stop", () => void finish(), {
      once: true,
    });
    capture.recorder.addEventListener("error", () => void finish(), {
      once: true,
    });
    try {
      capture.recorder.requestData();
      capture.recorder.stop();
    } catch {
      void finish();
    }
  });
  return capture.stopPromise;
}

"use client";

import {
  prismAudioContext,
  prismAudioOutputNode,
} from "./replayAudioMasterCapture.ts";
import { estimateVoiceOutputLatencyMs } from "./voiceEffects.ts";

export const VOICE_SYNC_LAB_PCM_CAPTURE_PROCESSOR =
  "prism-voice-sync-lab-capture-v1";
export const VOICE_SYNC_LAB_PCM_CAPTURE_WORKLET_URL =
  "/worklets/prism-voice-sync-lab-capture.js";

export type VoiceSyncLabPcmCaptureKind =
  | "audio-worklet"
  | "script-processor";

export interface VoiceSyncLabPcmCaptureMarker {
  label: string;
  contextTime: number;
  frame: number;
}

export interface VoiceSyncLabPcmCaptureQuantum {
  sequence: number;
  contextStartFrame: number;
  contextStartTime: number;
  frameCount: number;
  channels: readonly Float32Array[];
}

export interface VoiceSyncLabDeviceLatencyEstimate {
  /** Browser-reported processing latency. This is not measured loopback. */
  baseLatencyMs: number | null;
  /** Browser-reported output-device latency. This is not measured loopback. */
  outputLatencyMs: number | null;
  /** Production estimator used by visible voice lifecycle timing. */
  estimatedTotalMs: number;
  /** The raw PCM remains in the software-bus clock; no shift is baked in. */
  appliedToPcm: false;
  /** A microphone/speaker/display loopback is deliberately outside this tool. */
  physicalLoopbackIncluded: false;
}

export interface VoiceSyncLabPcmCaptureResult {
  captureKind: VoiceSyncLabPcmCaptureKind;
  sampleRate: number;
  channelCount: number;
  /** Absolute AudioContext frame chosen as frame zero before playback starts. */
  frameZeroContextFrame: number;
  frameZeroContextTime: number;
  captureStopContextFrame: number;
  captureStopContextTime: number;
  firstQuantumContextFrame: number | null;
  firstQuantumContextTime: number | null;
  frameCount: number;
  /** Raw final-software-bus PCM. Every channel has exactly frameCount samples. */
  channels: readonly Float32Array[];
  quanta: readonly Omit<VoiceSyncLabPcmCaptureQuantum, "channels">[];
  markers: readonly VoiceSyncLabPcmCaptureMarker[];
  droppedQuantumCount: number;
  /** Logical capture frames not covered by a delivered render quantum. */
  unobservedFrameCount: number;
  deterministicRenderClock: boolean;
  deviceLatency: VoiceSyncLabDeviceLatencyEstimate;
  clockNotes: string;
}

export interface VoiceSyncLabPcmCaptureSession {
  captureKind: VoiceSyncLabPcmCaptureKind;
  sampleRate: number;
  channelCount: number;
  frameZeroContextFrame: number;
  frameZeroContextTime: number;
  /** Stable mapping into the result's raw PCM clock, available immediately. */
  contextTimeToFrame(contextTime: number): number;
  markContextTime(label: string, contextTime?: number): VoiceSyncLabPcmCaptureMarker;
  stop(): Promise<VoiceSyncLabPcmCaptureResult>;
  cancel(): void;
}

export interface StartVoiceSyncLabPcmCaptureOptions {
  channelCount?: number;
  workletUrl?: string;
  /** Deterministic test/debug escape hatch; normal runs always prefer Worklet. */
  forceScriptProcessor?: boolean;
}

interface VoiceSyncLabPcmResultInput {
  captureKind: VoiceSyncLabPcmCaptureKind;
  sampleRate: number;
  channelCount: number;
  frameZeroContextFrame: number;
  captureStopContextFrame: number;
  quanta: readonly VoiceSyncLabPcmCaptureQuantum[];
  markerTimes: readonly { label: string; contextTime: number }[];
  deviceLatency: VoiceSyncLabDeviceLatencyEstimate;
}

const workletRegistrationByContext = new WeakMap<
  AudioContext,
  Promise<void>
>();

function finiteNonNegativeMilliseconds(seconds: unknown): number | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? Math.round(seconds * 1_000 * 1_000) / 1_000
    : null;
}

export function voiceSyncLabDeviceLatencyEstimate(
  context: Pick<AudioContext, "baseLatency" | "currentTime"> &
    Partial<Pick<AudioContext, "getOutputTimestamp" | "outputLatency">>,
): VoiceSyncLabDeviceLatencyEstimate {
  return {
    baseLatencyMs: finiteNonNegativeMilliseconds(context.baseLatency),
    outputLatencyMs: finiteNonNegativeMilliseconds(context.outputLatency),
    estimatedTotalMs: estimateVoiceOutputLatencyMs(context),
    appliedToPcm: false,
    physicalLoopbackIncluded: false,
  };
}

export function voiceSyncLabPcmCaptureFrameForContextTime(args: {
  contextTime: number;
  frameZeroContextFrame: number;
  sampleRate: number;
}): number {
  if (!Number.isFinite(args.contextTime)) return 0;
  const sampleRate = Math.max(1, Math.round(args.sampleRate));
  return Math.round(args.contextTime * sampleRate) - args.frameZeroContextFrame;
}

function normalizedChannelCount(value: number | undefined): number {
  return Number.isInteger(value) ? Math.max(1, Math.min(8, value!)) : 2;
}

function countDroppedQuanta(
  quanta: readonly VoiceSyncLabPcmCaptureQuantum[],
): number {
  const sequences = [...new Set(quanta.map((quantum) => quantum.sequence))].sort(
    (left, right) => left - right,
  );
  // The Worklet sequence is zero-based. Missing quanta before the first
  // delivered message are just as material as a gap later in the stream.
  let dropped = sequences[0] ?? 0;
  for (let index = 1; index < sequences.length; index += 1) {
    dropped += Math.max(0, sequences[index]! - sequences[index - 1]! - 1);
  }
  return dropped;
}

/** Pure assembler shared by Worklet, fallback, and focused tests. */
export function assembleVoiceSyncLabPcmCaptureResult(
  input: VoiceSyncLabPcmResultInput,
): VoiceSyncLabPcmCaptureResult {
  const sampleRate = Math.max(1, Math.round(input.sampleRate));
  const channelCount = normalizedChannelCount(input.channelCount);
  const frameZeroContextFrame = Math.max(
    0,
    Math.round(input.frameZeroContextFrame),
  );
  const sortedQuanta = input.quanta
    .filter(
      (quantum) =>
        Number.isInteger(quantum.contextStartFrame) &&
        quantum.contextStartFrame >= 0 &&
        Number.isInteger(quantum.frameCount) &&
        quantum.frameCount > 0,
    )
    .slice()
    .sort(
      (left, right) =>
        left.contextStartFrame - right.contextStartFrame ||
        left.sequence - right.sequence,
    );
  const latestQuantumEnd = sortedQuanta.reduce(
    (latest, quantum) =>
      Math.max(latest, quantum.contextStartFrame + quantum.frameCount),
    frameZeroContextFrame,
  );
  const captureStopContextFrame = Math.max(
    frameZeroContextFrame,
    Math.round(input.captureStopContextFrame),
    latestQuantumEnd,
  );
  const frameCount = captureStopContextFrame - frameZeroContextFrame;
  const channels = Array.from(
    { length: channelCount },
    () => new Float32Array(frameCount),
  );
  const observed = new Uint8Array(frameCount);
  for (const quantum of sortedQuanta) {
    const destinationStart = Math.max(
      0,
      quantum.contextStartFrame - frameZeroContextFrame,
    );
    const sourceStart = Math.max(
      0,
      frameZeroContextFrame - quantum.contextStartFrame,
    );
    const copyCount = Math.min(
      quantum.frameCount - sourceStart,
      frameCount - destinationStart,
    );
    if (copyCount <= 0) continue;
    observed.fill(1, destinationStart, destinationStart + copyCount);
    for (let channel = 0; channel < channelCount; channel += 1) {
      const source = quantum.channels[channel];
      if (!source) continue;
      channels[channel]!.set(
        source.subarray(sourceStart, sourceStart + copyCount),
        destinationStart,
      );
    }
  }
  let unobservedFrameCount = 0;
  for (const value of observed) if (value === 0) unobservedFrameCount += 1;
  const droppedQuantumCount = countDroppedQuanta(sortedQuanta);
  const markers = input.markerTimes.map(({ label, contextTime }) => ({
    label,
    contextTime,
    frame: voiceSyncLabPcmCaptureFrameForContextTime({
      contextTime,
      frameZeroContextFrame,
      sampleRate,
    }),
  }));
  const firstQuantum = sortedQuanta[0] ?? null;
  return {
    captureKind: input.captureKind,
    sampleRate,
    channelCount,
    frameZeroContextFrame,
    frameZeroContextTime: frameZeroContextFrame / sampleRate,
    captureStopContextFrame,
    captureStopContextTime: captureStopContextFrame / sampleRate,
    firstQuantumContextFrame: firstQuantum?.contextStartFrame ?? null,
    firstQuantumContextTime: firstQuantum?.contextStartTime ?? null,
    frameCount,
    channels,
    quanta: sortedQuanta.map((quantum) => ({
      sequence: quantum.sequence,
      contextStartFrame: quantum.contextStartFrame,
      contextStartTime: quantum.contextStartTime,
      frameCount: quantum.frameCount,
    })),
    markers,
    droppedQuantumCount,
    unobservedFrameCount,
    deterministicRenderClock:
      input.captureKind === "audio-worklet" &&
      sortedQuanta.length > 0 &&
      droppedQuantumCount === 0 &&
      unobservedFrameCount === 0,
    deviceLatency: input.deviceLatency,
    clockNotes:
      input.captureKind === "audio-worklet"
        ? "Post-effects software-bus PCM and markers share the AudioContext render clock. Device latency is reported separately; physical speaker/display loopback is not measured."
        : "ScriptProcessor fallback uses the AudioContext playback clock but runs on the main thread and may drop render buffers. Device latency is reported separately; physical speaker/display loopback is not measured.",
  };
}

function parseWorkletQuantum(
  value: unknown,
  channelCount: number,
): VoiceSyncLabPcmCaptureQuantum | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "quantum") return null;
  const sequence = record.sequence;
  const contextStartFrame = record.contextStartFrame;
  const contextStartTime = record.contextStartTime;
  const frameCount = record.frameCount;
  const rawChannels = record.channels;
  if (
    typeof sequence !== "number" ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    typeof contextStartFrame !== "number" ||
    !Number.isInteger(contextStartFrame) ||
    contextStartFrame < 0 ||
    typeof contextStartTime !== "number" ||
    !Number.isFinite(contextStartTime) ||
    typeof frameCount !== "number" ||
    !Number.isInteger(frameCount) ||
    frameCount <= 0 ||
    !Array.isArray(rawChannels)
  ) {
    return null;
  }
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    const raw = rawChannels[channel];
    const samples = raw instanceof ArrayBuffer ? new Float32Array(raw) : null;
    if (!samples || samples.length !== frameCount) return null;
    channels.push(samples);
  }
  return {
    sequence,
    contextStartFrame,
    contextStartTime,
    frameCount,
    channels,
  };
}

async function registerCaptureWorklet(
  context: AudioContext,
  workletUrl: string,
): Promise<void> {
  const existing = workletRegistrationByContext.get(context);
  if (existing) return existing;
  const registration = context.audioWorklet.addModule(workletUrl);
  workletRegistrationByContext.set(context, registration);
  try {
    await registration;
  } catch (error) {
    workletRegistrationByContext.delete(context);
    throw error;
  }
}

function productionCaptureIsAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

function makeSession(args: {
  context: AudioContext;
  captureKind: VoiceSyncLabPcmCaptureKind;
  channelCount: number;
  frameZeroContextFrame: number;
  quanta: VoiceSyncLabPcmCaptureQuantum[];
  disconnect: () => void;
  requestWorkletStop?: () => Promise<number | null>;
}): VoiceSyncLabPcmCaptureSession {
  const {
    context,
    captureKind,
    channelCount,
    frameZeroContextFrame,
    quanta,
  } = args;
  const sampleRate = context.sampleRate;
  const markerTimes: Array<{ label: string; contextTime: number }> = [];
  const deviceLatency = voiceSyncLabDeviceLatencyEstimate(context);
  let canceled = false;
  let disconnected = false;
  let stopPromise: Promise<VoiceSyncLabPcmCaptureResult> | null = null;
  const disconnect = (): void => {
    if (disconnected) return;
    disconnected = true;
    args.disconnect();
  };
  const contextTimeToFrame = (contextTime: number): number =>
    voiceSyncLabPcmCaptureFrameForContextTime({
      contextTime,
      frameZeroContextFrame,
      sampleRate,
    });

  return {
    captureKind,
    sampleRate,
    channelCount,
    frameZeroContextFrame,
    frameZeroContextTime: frameZeroContextFrame / sampleRate,
    contextTimeToFrame,
    markContextTime(label, contextTime = context.currentTime) {
      const marker = {
        label: label.trim() || "marker",
        contextTime: Number.isFinite(contextTime)
          ? contextTime
          : context.currentTime,
        frame: 0,
      };
      marker.frame = contextTimeToFrame(marker.contextTime);
      markerTimes.push({ label: marker.label, contextTime: marker.contextTime });
      return marker;
    },
    stop() {
      if (canceled) {
        return Promise.reject(new Error("Voice Sync Lab PCM capture was canceled."));
      }
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        const acknowledgedStopFrame = await args.requestWorkletStop?.();
        const captureStopContextFrame = Math.max(
          frameZeroContextFrame,
          acknowledgedStopFrame ?? Math.round(context.currentTime * sampleRate),
        );
        disconnect();
        return assembleVoiceSyncLabPcmCaptureResult({
          captureKind,
          sampleRate,
          channelCount,
          frameZeroContextFrame,
          captureStopContextFrame,
          quanta,
          markerTimes,
          deviceLatency,
        });
      })();
      return stopPromise;
    },
    cancel() {
      if (canceled || stopPromise) return;
      canceled = true;
      quanta.length = 0;
      markerTimes.length = 0;
      disconnect();
    },
  };
}

async function startWorkletCapture(args: {
  context: AudioContext;
  output: AudioNode;
  channelCount: number;
  workletUrl: string;
}): Promise<VoiceSyncLabPcmCaptureSession> {
  await registerCaptureWorklet(args.context, args.workletUrl);
  const node = new AudioWorkletNode(
    args.context,
    VOICE_SYNC_LAB_PCM_CAPTURE_PROCESSOR,
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [args.channelCount],
      channelCount: args.channelCount,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { channelCount: args.channelCount },
    },
  );
  const mute = args.context.createGain();
  mute.gain.value = 0;
  const quanta: VoiceSyncLabPcmCaptureQuantum[] = [];
  let stopResolver: ((frame: number | null) => void) | null = null;
  let firstQuantumResolver:
    | ((quantum: VoiceSyncLabPcmCaptureQuantum) => void)
    | null = null;
  const firstQuantumPromise = new Promise<VoiceSyncLabPcmCaptureQuantum>(
    (resolve) => {
      firstQuantumResolver = resolve;
    },
  );
  node.port.onmessage = (event: MessageEvent<unknown>) => {
    const quantum = parseWorkletQuantum(event.data, args.channelCount);
    if (quantum) {
      quanta.push(quantum);
      firstQuantumResolver?.(quantum);
      firstQuantumResolver = null;
      return;
    }
    if (
      event.data &&
      typeof event.data === "object" &&
      !Array.isArray(event.data) &&
      (event.data as Record<string, unknown>).type === "stopped"
    ) {
      const contextFrame = (event.data as Record<string, unknown>).contextFrame;
      stopResolver?.(
        typeof contextFrame === "number" && Number.isInteger(contextFrame)
          ? contextFrame
          : null,
      );
      stopResolver = null;
    }
  };
  args.output.connect(node);
  node.connect(mute);
  mute.connect(args.context.destination);
  if (args.context.state === "suspended") await args.context.resume();
  let firstQuantum: VoiceSyncLabPcmCaptureQuantum;
  try {
    firstQuantum = await Promise.race([
      firstQuantumPromise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("Voice Sync Lab PCM worklet did not start.")),
          750,
        );
      }),
    ]);
  } catch (error) {
    node.port.onmessage = null;
    node.port.close();
    try {
      args.output.disconnect(node);
    } catch {}
    try {
      node.disconnect();
    } catch {}
    try {
      mute.disconnect();
    } catch {}
    throw error;
  }
  // Waiting for the first delivered render quantum gives the session a stable,
  // observed sample zero before the caller is allowed to begin playback.
  const frameZeroContextFrame = firstQuantum.contextStartFrame;

  return makeSession({
    context: args.context,
    captureKind: "audio-worklet",
    channelCount: args.channelCount,
    frameZeroContextFrame,
    quanta,
    disconnect: () => {
      node.port.onmessage = null;
      node.port.close();
      try {
        args.output.disconnect(node);
      } catch {}
      try {
        node.disconnect();
      } catch {}
      try {
        mute.disconnect();
      } catch {}
    },
    requestWorkletStop: () =>
      new Promise<number | null>((resolve) => {
        let settled = false;
        const finish = (frame: number | null): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(frame);
        };
        stopResolver = finish;
        const timeout = setTimeout(() => finish(null), 250);
        node.port.postMessage({ type: "stop" });
      }),
  });
}

function startScriptProcessorCapture(args: {
  context: AudioContext;
  output: AudioNode;
  channelCount: number;
}): VoiceSyncLabPcmCaptureSession | null {
  if (typeof args.context.createScriptProcessor !== "function") return null;
  const processor = args.context.createScriptProcessor(
    1_024,
    args.channelCount,
    args.channelCount,
  );
  const mute = args.context.createGain();
  mute.gain.value = 0;
  const quanta: VoiceSyncLabPcmCaptureQuantum[] = [];
  let sequence = 0;
  processor.onaudioprocess = (event) => {
    const frameCount = event.inputBuffer.length;
    const channels = Array.from({ length: args.channelCount }, (_, channel) =>
      new Float32Array(event.inputBuffer.getChannelData(channel)),
    );
    for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
      event.outputBuffer.getChannelData(channel).fill(0);
    }
    const contextStartTime = event.playbackTime;
    quanta.push({
      sequence,
      contextStartFrame: Math.round(contextStartTime * args.context.sampleRate),
      contextStartTime,
      frameCount,
      channels,
    });
    sequence += 1;
  };
  args.output.connect(processor);
  processor.connect(mute);
  mute.connect(args.context.destination);
  const frameZeroContextFrame = Math.round(
    args.context.currentTime * args.context.sampleRate,
  );
  return makeSession({
    context: args.context,
    captureKind: "script-processor",
    channelCount: args.channelCount,
    frameZeroContextFrame,
    quanta,
    disconnect: () => {
      processor.onaudioprocess = null;
      try {
        args.output.disconnect(processor);
      } catch {}
      try {
        processor.disconnect();
      } catch {}
      try {
        mute.disconnect();
      } catch {}
    },
  });
}

/**
 * Start a development-only tap on the exact post-effects in-world bus.
 * The production speaker connection is untouched; this is a muted side branch.
 */
export async function startVoiceSyncLabPcmCapture(
  options: StartVoiceSyncLabPcmCaptureOptions = {},
): Promise<VoiceSyncLabPcmCaptureSession | null> {
  if (!productionCaptureIsAllowed()) return null;
  const context = prismAudioContext();
  if (!context) return null;
  const output = prismAudioOutputNode(context);
  const channelCount = normalizedChannelCount(options.channelCount);
  if (context.state === "suspended") await context.resume();
  if (
    !options.forceScriptProcessor &&
    context.audioWorklet &&
    typeof AudioWorkletNode === "function"
  ) {
    try {
      return await startWorkletCapture({
        context,
        output,
        channelCount,
        workletUrl:
          options.workletUrl ?? VOICE_SYNC_LAB_PCM_CAPTURE_WORKLET_URL,
      });
    } catch {
      // Dev environments with a strict worklet/CSP setup retain a labeled,
      // lower-confidence main-thread fallback instead of losing the lab.
    }
  }
  return startScriptProcessorCapture({ context, output, channelCount });
}

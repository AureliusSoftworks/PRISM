import {
  setSignalLiveAudioRoute,
  type SignalLiveAudioRoute,
} from "./signalLiveAudioRoute";

export interface SignalLiveAudioChunk {
  timestamp: number;
  frameCount: number;
  sampleRate: number;
  data: ArrayBuffer;
}

export class SignalLiveAudioBus {
  readonly context: AudioContext;
  readonly route: SignalLiveAudioRoute;
  private readonly master: GainNode;
  private recorderNode: AudioWorkletNode | null = null;
  private silentSink: GainNode | null = null;
  private epochContextTime: number | null = null;
  private expectedFrame: number | null = null;
  private captureStopResolve: (() => void) | null = null;
  private stopped = false;

  private constructor(
    context: AudioContext,
    master: GainNode,
    private readonly onChunk: (chunk: SignalLiveAudioChunk) => void,
    private readonly onDiscontinuity: () => void,
  ) {
    this.context = context;
    this.master = master;
    this.route = { context, destination: master };
  }

  static begin(args: {
    onChunk: (chunk: SignalLiveAudioChunk) => void;
    onDiscontinuity: () => void;
  }): { bus: SignalLiveAudioBus; ready: Promise<void> } | null {
    if (
      typeof window === "undefined" ||
      typeof window.AudioContext !== "function" ||
      typeof AudioWorkletNode !== "function"
    ) {
      return null;
    }
    const context = new window.AudioContext({
      latencyHint: "interactive",
      sampleRate: 48_000,
    });
    const master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
    const bus = new SignalLiveAudioBus(
      context,
      master,
      args.onChunk,
      args.onDiscontinuity,
    );
    setSignalLiveAudioRoute(bus.route);
    void context.resume().catch(() => undefined);
    const ready = bus.initialize();
    return { bus, ready };
  }

  private async initialize(): Promise<void> {
    await this.context.audioWorklet.addModule(
      "/worklets/signal-live-recording-processor.js",
    );
    if (this.stopped) return;
    const recorderNode = new AudioWorkletNode(
      this.context,
      "signal-live-recording-processor",
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      },
    );
    const silentSink = this.context.createGain();
    silentSink.gain.value = 0;
    this.master.connect(recorderNode);
    recorderNode.connect(silentSink).connect(this.context.destination);
    recorderNode.port.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
      if (event.data.type === "stopped") {
        this.captureStopResolve?.();
        this.captureStopResolve = null;
        return;
      }
      if (this.stopped || event.data.type !== "audio") return;
      const startFrame = Number(event.data.startFrame);
      const frameCount = Number(event.data.frameCount);
      const chunkSampleRate = Number(event.data.sampleRate);
      const data = event.data.data;
      if (
        !(data instanceof ArrayBuffer) ||
        !Number.isFinite(startFrame) ||
        !Number.isFinite(frameCount) ||
        !Number.isFinite(chunkSampleRate) ||
        this.epochContextTime === null
      ) {
        return;
      }
      if (
        this.expectedFrame !== null &&
        Math.abs(startFrame - this.expectedFrame) > 1
      ) {
        this.onDiscontinuity();
      }
      this.expectedFrame = startFrame + frameCount;
      this.onChunk({
        timestamp: Math.max(0, startFrame / chunkSampleRate - this.epochContextTime),
        frameCount,
        sampleRate: chunkSampleRate,
        data,
      });
    };
    this.recorderNode = recorderNode;
    this.silentSink = silentSink;
  }

  startClock(): number {
    this.epochContextTime = this.context.currentTime;
    this.expectedFrame = null;
    return this.epochContextTime;
  }

  elapsedSeconds(): number {
    return this.epochContextTime === null
      ? 0
      : Math.max(0, this.context.currentTime - this.epochContextTime);
  }

  async finishCapture(): Promise<void> {
    if (!this.recorderNode || this.stopped) return;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.captureStopResolve = null;
        reject(new Error("Signal recording audio tap did not stop cleanly."));
      }, 1_000);
      this.captureStopResolve = () => {
        window.clearTimeout(timer);
        resolve();
      };
      this.recorderNode!.port.postMessage({ type: "stop" });
    });
  }

  stop(preservePlayback = false): void {
    if (this.stopped) return;
    this.stopped = true;
    this.captureStopResolve?.();
    this.captureStopResolve = null;
    setSignalLiveAudioRoute(null);
    this.recorderNode?.port.postMessage({ type: "stop" });
    try {
      this.recorderNode?.disconnect();
      this.silentSink?.disconnect();
      if (!preservePlayback) this.master.disconnect();
    } catch {
      // Audio teardown is best effort and must never affect Signal cleanup.
    }
    if (!preservePlayback) void this.context.close().catch(() => undefined);
  }

  release(): void {
    setSignalLiveAudioRoute(null);
    try {
      this.master.disconnect();
      this.recorderNode?.disconnect();
      this.silentSink?.disconnect();
    } catch {
      // The playback graph may already have been torn down by the experience.
    }
    if (this.context.state !== "closed") {
      void this.context.close().catch(() => undefined);
    }
  }
}

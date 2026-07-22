"use client";

import {
  REPLAY_VIDEO_FPS,
  REPLAY_VIDEO_HEIGHT,
  REPLAY_VIDEO_WIDTH,
  type ReplayCaptureReportV1,
  type ReplayManifestV1,
  type ReplayRecordingV1,
  type ReplayTimelineBeatV1,
  type ReplayTimelineV1,
} from "@localai/shared";
import {
  abortLiveReplayRecording,
  completeLiveReplayRecording,
  queueReplayManifest,
  replayAuthHeaders,
  startLiveReplayRecording,
} from "./replayClient";
import { SignalLiveAudioBus, type SignalLiveAudioChunk } from "./signalLiveAudioBus";
import { REPLAY_RECORDING_CHANGED_EVENT } from "./ReplayRenderCoordinator";
import { REPLAY_VIDEO_BITRATE } from "./signalFilmGrain";

const LIVE_CAPTURE_INTERVAL_MS = 100;
const LIVE_CAPTURE_DEGRADE_AFTER_MS = 2_000;
const LIVE_WORKER_WAIT_MS = 30_000;

type WorkerReply = Record<string, unknown> & { type?: unknown };

interface LiveUtterance {
  sourceMessageId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  channel: "primary" | "crosstalk" | "reaction";
  startMs: number;
  endMs: number | null;
}

export interface SignalLiveUtteranceInput {
  id: string;
  botId: string;
  content: string;
}

export interface SignalLiveReplayRecorderOptions {
  title: string;
  captureRoot: () => HTMLElement | null;
  onRecordingChange?: (sourceId: string, recording: ReplayRecordingV1) => void;
  onDegraded?: () => void;
}

function isoNow(): string {
  return new Date().toISOString();
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out.`)),
      LIVE_WORKER_WAIT_MS,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class SignalLiveReplayRecorder {
  readonly ready: Promise<void>;

  get isCapturing(): boolean {
    return !this.terminal;
  }

  private readonly report: ReplayCaptureReportV1 = {
    startedAt: isoNow(),
    completedAt: null,
    capturedFrames: 0,
    heldFrames: 0,
    audioFrames: 0,
    audioDiscontinuities: 0,
    visibilityInterruptions: 0,
    longestVisualGapMs: 0,
    degradedReason: null,
  };
  private readonly utterances: LiveUtterance[] = [];
  private activeUtterance: LiveUtterance | null = null;
  private recordingId: string | null = null;
  private renderToken: string | null = null;
  private attachment: Promise<void> | null = null;
  private captureTimer: number | null = null;
  private healthTimer: number | null = null;
  private hiddenAtMs: number | null = null;
  private lastValidFrameAtMs = performance.now();
  private frameNumber = 0;
  private frameInWorker = false;
  private captureInFlight: Promise<void> | null = null;
  private fontEmbedCss: string | null = null;
  private closingStartedAtMs: number | null = null;
  private terminal = false;
  private finishing = false;
  private rebuildQueued = false;
  private workerReadyResolve!: () => void;
  private workerReadyReject!: (error: Error) => void;
  private uploadAttachedResolve: (() => void) | null = null;
  private uploadAttachedReject: ((error: Error) => void) | null = null;
  private doneResolve: ((message: WorkerReply) => void) | null = null;
  private doneReject: ((error: Error) => void) | null = null;

  private constructor(
    private readonly worker: Worker,
    private readonly audioBus: SignalLiveAudioBus,
    audioReady: Promise<void>,
    private readonly options: SignalLiveReplayRecorderOptions,
  ) {
    const workerReady = new Promise<void>((resolve, reject) => {
      this.workerReadyResolve = resolve;
      this.workerReadyReject = reject;
    });
    this.ready = Promise.all([workerReady, audioReady]).then(() => undefined);
    void this.ready.then(
      () => this.scheduleCapture(0),
      (error) => void this.degrade(this.errorMessage(error, "Live recorder initialization failed.")),
    );
    this.audioBus.startClock();
    this.worker.addEventListener("message", this.onWorkerMessage);
    this.worker.addEventListener("error", this.onWorkerError);
    this.worker.postMessage({
      type: "init-live",
      title: options.title,
      width: REPLAY_VIDEO_WIDTH,
      height: REPLAY_VIDEO_HEIGHT,
      fps: REPLAY_VIDEO_FPS,
      filmGrainLevel: 0,
      videoBitrate: REPLAY_VIDEO_BITRATE,
      sampleRate: 48_000,
      numberOfChannels: 2,
    });
    this.healthTimer = window.setInterval(() => this.checkHealth(), 250);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide, { once: true });
  }

  static begin(options: SignalLiveReplayRecorderOptions): SignalLiveReplayRecorder | null {
    if (
      typeof window === "undefined" ||
      typeof Worker === "undefined" ||
      typeof createImageBitmap === "undefined" ||
      typeof VideoEncoder === "undefined" ||
      typeof AudioEncoder === "undefined"
    ) {
      return null;
    }
    let recorder: SignalLiveReplayRecorder | null = null;
    const audio = SignalLiveAudioBus.begin({
      onChunk: (chunk) => recorder?.acceptAudio(chunk),
      onDiscontinuity: () => recorder?.handleAudioDiscontinuity(),
    });
    if (!audio) return null;
    try {
      const worker = new Worker(
        new URL("./replayEncoder.worker.ts", import.meta.url),
        { type: "module", name: "prism-signal-live-replay" },
      );
      recorder = new SignalLiveReplayRecorder(worker, audio.bus, audio.ready, options);
      return recorder;
    } catch {
      audio.bus.stop();
      return null;
    }
  }

  attach(sourceId: string): Promise<void> {
    if (this.attachment) return this.attachment;
    this.attachment = (async () => {
      await withTimeout(this.ready, "Live recorder initialization");
      if (this.terminal) return;
      const lease = await startLiveReplayRecording(sourceId);
      if (this.terminal) return;
      this.recordingId = lease.recording.id;
      this.renderToken = lease.renderToken;
      this.options.onRecordingChange?.(sourceId, lease.recording);
      const attached = new Promise<void>((resolve, reject) => {
        this.uploadAttachedResolve = resolve;
        this.uploadAttachedReject = reject;
      });
      this.worker.postMessage({
        type: "attach-upload",
        recordingId: lease.recording.id,
        renderToken: lease.renderToken,
        authHeaders: replayAuthHeaders(),
      });
      await withTimeout(attached, "Live recorder attachment");
    })().catch((error) => {
      void this.degrade(this.errorMessage(error, "Live recording lease failed."));
      throw error;
    });
    void this.attachment.catch(() => undefined);
    return this.attachment;
  }

  noteUtteranceStart(
    message: SignalLiveUtteranceInput,
    speakerName: string,
    channel: "primary" | "crosstalk" | "reaction" = "primary",
  ): void {
    if (this.terminal) return;
    if (this.activeUtterance?.sourceMessageId === message.id) return;
    this.closeActiveUtterance();
    const utterance: LiveUtterance = {
      sourceMessageId: message.id,
      speakerId: message.botId,
      speakerName,
      text: message.content,
      channel,
      startMs: Math.round(this.audioBus.elapsedSeconds() * 1_000),
      endMs: null,
    };
    this.utterances.push(utterance);
    this.activeUtterance = utterance;
  }

  noteUtteranceEnd(sourceMessageId: string): void {
    if (this.activeUtterance?.sourceMessageId !== sourceMessageId) return;
    this.closeActiveUtterance();
  }

  noteClosingStarted(): void {
    this.closingStartedAtMs ??= Math.round(this.audioBus.elapsedSeconds() * 1_000);
    this.closeActiveUtterance();
  }

  async finish(manifest: ReplayManifestV1): Promise<ReplayRecordingV1 | null> {
    if (this.terminal) {
      this.audioBus.release();
      if (this.report.degradedReason) {
        await this.queueRebuild(manifest).catch(() => undefined);
      }
      return null;
    }
    if (this.finishing) return null;
    this.finishing = true;
    try {
      await this.attachment;
      if (!this.recordingId || !this.renderToken || this.report.degradedReason) {
        await this.degrade("Live recording never obtained a durable upload lease.");
        return null;
      }
      await nextAnimationFrame();
      await nextAnimationFrame();
      await this.captureInFlight;
      await this.captureFrame();
      await this.audioBus.finishCapture();
      this.closeActiveUtterance();
      const durationSeconds = Math.max(0.1, this.audioBus.elapsedSeconds());
      const durationMs = Math.round(durationSeconds * 1_000);
      this.report.completedAt = isoNow();
      const timeline = this.timeline(manifest, durationMs);
      const done = new Promise<WorkerReply>((resolve, reject) => {
        this.doneResolve = resolve;
        this.doneReject = reject;
      });
      this.worker.postMessage({ type: "finish", duration: durationSeconds });
      const encoded = await withTimeout(done, "Live recorder finalization");
      const recording = await completeLiveReplayRecording({
        recordingId: this.recordingId,
        renderToken: this.renderToken,
        manifest,
        timeline,
        captureReport: { ...this.report },
        contentType: encoded.contentType === "video/webm" ? "video/webm" : "video/mp4",
        codec: String(encoded.codec ?? "unknown"),
        durationMs,
      });
      this.options.onRecordingChange?.(manifest.sourceId, recording);
      window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
      this.terminal = true;
      this.cleanup();
      return recording;
    } catch (error) {
      await this.degrade(this.errorMessage(error, "Live recording finalization failed."));
      this.audioBus.release();
      await this.queueRebuild(manifest).catch(() => undefined);
      return null;
    } finally {
      this.finishing = false;
    }
  }

  async degrade(reason: string, preservePlayback = true): Promise<void> {
    if (this.terminal) return;
    this.terminal = true;
    this.report.degradedReason = reason.slice(0, 500);
    this.report.completedAt = isoNow();
    this.worker.postMessage({ type: "abort" });
    const recordingId = this.recordingId;
    const renderToken = this.renderToken;
    this.cleanup(preservePlayback);
    if (recordingId && renderToken) {
      await abortLiveReplayRecording({
        recordingId,
        renderToken,
        reason: this.report.degradedReason,
        captureReport: { ...this.report },
      }).then(
        (recording) => {
          this.options.onRecordingChange?.(recording.sourceId, recording);
          window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
        },
        () => undefined,
      );
    }
    this.options.onDegraded?.();
  }

  async queueRebuild(manifest: ReplayManifestV1): Promise<void> {
    if (this.rebuildQueued) return;
    this.rebuildQueued = true;
    try {
      const recording = await queueReplayManifest(manifest);
      this.options.onRecordingChange?.(manifest.sourceId, recording);
      window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
    } catch (error) {
      this.rebuildQueued = false;
      throw error;
    }
  }

  private acceptAudio(chunk: SignalLiveAudioChunk): void {
    if (this.terminal) return;
    if (chunk.sampleRate !== 48_000) {
      void this.degrade("Signal recording audio did not remain at 48 kHz.");
      return;
    }
    this.report.audioFrames += chunk.frameCount;
    this.worker.postMessage(
      { type: "audio", timestamp: chunk.timestamp, data: chunk.data },
      [chunk.data],
    );
  }

  private handleAudioDiscontinuity(): void {
    if (this.terminal) return;
    this.report.audioDiscontinuities += 1;
    void this.degrade("Signal recording audio became discontinuous.");
  }

  private readonly onWorkerMessage = (event: MessageEvent<WorkerReply>): void => {
    const type = String(event.data.type ?? "");
    if (type === "ready") {
      this.workerReadyResolve();
    } else if (type === "upload-attached") {
      this.uploadAttachedResolve?.();
      this.uploadAttachedResolve = null;
      this.uploadAttachedReject = null;
    } else if (type === "frame-added") {
      this.frameInWorker = false;
      this.report.heldFrames += Math.max(0, Number(event.data.heldFrames) || 0);
    } else if (type === "done") {
      this.doneResolve?.(event.data);
      this.doneResolve = null;
      this.doneReject = null;
    } else if (type === "error") {
      const error = new Error(String(event.data.error ?? "Live replay worker failed."));
      this.rejectWorkerWaits(error);
      void this.degrade(error.message);
    }
  };

  private readonly onWorkerError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Live replay worker crashed.");
    this.rejectWorkerWaits(error);
    void this.degrade(error.message);
  };

  private readonly onVisibilityChange = (): void => {
    if (this.terminal) return;
    if (document.visibilityState === "hidden") {
      if (this.hiddenAtMs === null) {
        this.hiddenAtMs = performance.now();
        this.report.visibilityInterruptions += 1;
      }
    } else {
      this.hiddenAtMs = null;
    }
  };

  private readonly onPageHide = (): void => {
    void this.degrade(
      "Signal page was closed or reloaded during live recording.",
      false,
    );
  };

  private checkHealth(): void {
    if (this.terminal || this.finishing) return;
    const now = performance.now();
    const frameGapMs = now - this.lastValidFrameAtMs;
    this.report.longestVisualGapMs = Math.max(
      this.report.longestVisualGapMs,
      Math.round(frameGapMs),
    );
    if (this.hiddenAtMs !== null && now - this.hiddenAtMs > LIVE_CAPTURE_DEGRADE_AFTER_MS) {
      void this.degrade("Signal remained hidden for more than two seconds.");
    } else if (frameGapMs > LIVE_CAPTURE_DEGRADE_AFTER_MS) {
      void this.degrade("Signal had no valid visible-stage frame for more than two seconds.");
    }
  }

  private scheduleCapture(delayMs = LIVE_CAPTURE_INTERVAL_MS): void {
    if (this.terminal || this.finishing || this.captureTimer !== null) return;
    this.captureTimer = window.setTimeout(() => {
      this.captureTimer = null;
      if (this.terminal || this.finishing) return;
      const startedAt = performance.now();
      this.captureInFlight = this.captureFrame().finally(() => {
        this.captureInFlight = null;
        this.scheduleCapture(
          Math.max(0, LIVE_CAPTURE_INTERVAL_MS - (performance.now() - startedAt)),
        );
      });
    }, delayMs);
  }

  private async captureFrame(): Promise<void> {
    if (
      this.terminal ||
      this.frameInWorker ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    const root = this.options.captureRoot();
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    try {
      const { getFontEmbedCSS, toCanvas } = await import("html-to-image");
      this.fontEmbedCss ??= await getFontEmbedCSS(root);
      const canvas = await toCanvas(root, {
        pixelRatio: 1,
        cacheBust: false,
        fontEmbedCSS: this.fontEmbedCss,
        filter: (node) =>
          !(node instanceof HTMLElement) ||
          node.dataset.signalRecordingExclude !== "true",
      });
      if (this.terminal || document.visibilityState !== "visible") return;
      const bitmap = await createImageBitmap(canvas);
      if (this.terminal) {
        bitmap.close();
        return;
      }
      const now = performance.now();
      const gapMs = now - this.lastValidFrameAtMs;
      this.report.longestVisualGapMs = Math.max(
        this.report.longestVisualGapMs,
        Math.round(gapMs),
      );
      this.lastValidFrameAtMs = now;
      this.frameInWorker = true;
      const frame = this.frameNumber;
      this.frameNumber += 1;
      this.report.capturedFrames += 1;
      this.worker.postMessage(
        {
          type: "frame",
          live: true,
          frame,
          timestamp: this.audioBus.elapsedSeconds(),
          bitmap,
        },
        [bitmap],
      );
    } catch {
      // The health monitor decides whether transient capture failures degrade.
    }
  }

  private closeActiveUtterance(): void {
    if (!this.activeUtterance) return;
    this.activeUtterance.endMs = Math.max(
      this.activeUtterance.startMs + 1,
      Math.round(this.audioBus.elapsedSeconds() * 1_000),
    );
    this.activeUtterance = null;
  }

  private timeline(manifest: ReplayManifestV1, durationMs: number): ReplayTimelineV1 {
    const participantNames = new Map(
      manifest.participants.map((participant) => [participant.id, participant.name]),
    );
    const utteranceByMessage = new Map(
      manifest.utterances.map((utterance) => [utterance.sourceMessageId, utterance]),
    );
    const actual = this.utterances
      .filter((utterance) => utterance.endMs !== null)
      .sort((a, b) => a.startMs - b.startMs);
    const firstUtteranceAt = actual[0]?.startMs ?? durationMs;
    const beats: ReplayTimelineBeatV1[] = [
      {
        id: "live-title",
        kind: "title",
        startMs: 0,
        endMs: Math.max(1, Math.min(durationMs, firstUtteranceAt)),
        utteranceId: null,
        sourceMessageId: null,
        speakerId: null,
        speakerName: null,
        text: manifest.title,
        channel: null,
      },
      ...actual.map((beat, index): ReplayTimelineBeatV1 => {
        const utterance = utteranceByMessage.get(beat.sourceMessageId);
        const speakerId = utterance?.speakerId ?? beat.speakerId;
        const startMs = Math.max(0, Math.min(durationMs - 1, beat.startMs));
        return {
          id: `live-utterance-${index}-${beat.sourceMessageId}`,
          kind: "utterance",
          startMs,
          endMs: Math.max(
            startMs + 1,
            Math.min(durationMs, beat.endMs ?? durationMs),
          ),
          utteranceId: utterance?.id ?? beat.sourceMessageId,
          sourceMessageId: beat.sourceMessageId,
          speakerId,
          speakerName:
            participantNames.get(speakerId) ?? beat.speakerName,
          text: utterance?.text ?? beat.text,
          channel: beat.channel,
        };
      }),
    ];
    const lastUtteranceEnd = actual.at(-1)?.endMs ?? 0;
    const endStart = Math.max(
      0,
      Math.min(durationMs, this.closingStartedAtMs ?? lastUtteranceEnd),
    );
    beats.push({
      id: "live-end",
      kind: "end",
      startMs: endStart,
      endMs: durationMs,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: manifest.title,
      channel: null,
    });
    return { v: 1, durationMs, beats };
  }

  private rejectWorkerWaits(error: Error): void {
    this.workerReadyReject(error);
    this.uploadAttachedReject?.(error);
    this.doneReject?.(error);
    this.uploadAttachedResolve = null;
    this.uploadAttachedReject = null;
    this.doneResolve = null;
    this.doneReject = null;
  }

  private cleanup(preservePlayback = false): void {
    if (this.captureTimer !== null) window.clearTimeout(this.captureTimer);
    if (this.healthTimer !== null) window.clearInterval(this.healthTimer);
    this.captureTimer = null;
    this.healthTimer = null;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pagehide", this.onPageHide);
    this.worker.removeEventListener("message", this.onWorkerMessage);
    this.worker.removeEventListener("error", this.onWorkerError);
    this.worker.terminate();
    this.audioBus.stop(preservePlayback);
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}

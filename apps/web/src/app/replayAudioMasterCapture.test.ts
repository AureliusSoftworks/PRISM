import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  abortReplayAudioMasterCapture,
  endReplayThinkingPresentation,
  primeReplayAudioMasterCapture,
  markReplayAudioMasterCapture,
  markReplayDirectionEvent,
  markReplayMouthShape,
  markReplayVoiceLightLevel,
  prismAudioContext,
  prismAudioOutputNode,
  replayAudioMasterCaptureCompactsThinkingGaps,
  replayAudioMasterCaptureElapsedMs,
  routeAudioElementToPrismOutput,
  setReplayAudioMasterCompactHold,
  startReplayAudioMasterCapture,
  startReplayThinkingPresentation,
  stopReplayAudioMasterCapture,
  syncReplayThinkingPresentations,
} from "./replayAudioMasterCapture.ts";
import type { ReplayVoiceSelectionSnapshotV2 } from "@localai/shared";

class FakeAudioNode {
  readonly connections = new Set<object>();

  connect(destination: object): object {
    this.connections.add(destination);
    return destination;
  }

  disconnect(destination?: object): void {
    if (destination) {
      this.connections.delete(destination);
      return;
    }
    this.connections.clear();
  }
}

class FakeAudioContext {
  static created = 0;
  static lastMediaElementSource: FakeAudioNode | null = null;
  state: AudioContextState = "running";
  readonly destination = new FakeAudioNode();
  readonly listeners = new Set<() => void>();

  constructor() {
    FakeAudioContext.created += 1;
  }

  createGain(): FakeAudioNode {
    return new FakeAudioNode();
  }

  createMediaStreamDestination(): FakeAudioNode & { stream: object } {
    return Object.assign(new FakeAudioNode(), { stream: {} });
  }

  createMediaStreamSource(): FakeAudioNode {
    return new FakeAudioNode();
  }

  createMediaElementSource(): FakeAudioNode {
    const source = new FakeAudioNode();
    FakeAudioContext.lastMediaElementSource = source;
    return source;
  }

  addEventListener(_kind: string, listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_kind: string, listener: () => void): void {
    this.listeners.delete(listener);
  }

  async resume(): Promise<void> {}

  async close(): Promise<void> {
    this.state = "closed";
    for (const listener of this.listeners) listener();
  }
}

class FakeMediaRecorder {
  static constructed = 0;
  static started = 0;
  static paused = 0;
  static resumed = 0;
  static isTypeSupported(): boolean {
    return true;
  }

  readonly mimeType = "audio/webm;codecs=opus";
  readonly listeners = new Map<string, Set<(event: { data: Blob }) => void>>();
  readonly stream: object;
  readonly options?: MediaRecorderOptions;
  state: "inactive" | "recording" | "paused" = "inactive";

  constructor(stream: object, options?: MediaRecorderOptions) {
    FakeMediaRecorder.constructed += 1;
    this.stream = stream;
    this.options = options;
  }

  addEventListener(
    kind: string,
    listener: (event: { data: Blob }) => void,
  ): void {
    const listeners = this.listeners.get(kind) ?? new Set();
    listeners.add(listener);
    this.listeners.set(kind, listeners);
  }

  start(): void {
    FakeMediaRecorder.started += 1;
    this.state = "recording";
  }

  pause(): void {
    if (this.state !== "recording") {
      throw new Error("Invalid state");
    }
    FakeMediaRecorder.paused += 1;
    this.state = "paused";
  }

  resume(): void {
    if (this.state !== "paused") {
      throw new Error("Invalid state");
    }
    FakeMediaRecorder.resumed += 1;
    this.state = "recording";
  }

  requestData(): void {
    for (const listener of this.listeners.get("dataavailable") ?? []) {
      listener({ data: new Blob(["flattened-master"]) });
    }
  }

  stop(): void {
    this.state = "inactive";
    for (const listener of this.listeners.get("stop") ?? []) {
      listener({ data: new Blob() });
    }
  }
}

test("the replay master captures the same shared output bus that reaches the device", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    const liveContext = prismAudioContext() as unknown as FakeAudioContext;
    const output = prismAudioOutputNode(
      liveContext as unknown as AudioContext,
    ) as unknown as FakeAudioNode;
    assert.equal(output.connections.size, 1);

    primeReplayAudioMasterCapture();
    assert.equal(
      await startReplayAudioMasterCapture("episode-1"),
      true,
      JSON.stringify({
        contexts: FakeAudioContext.created,
        recorders: FakeMediaRecorder.constructed,
        started: FakeMediaRecorder.started,
      }),
    );
    assert.equal(FakeAudioContext.created, 1);
    assert.equal(output.connections.size, 2);
    markReplayAudioMasterCapture({
      sourceId: "episode-1",
      phase: "speech_start",
      messageId: "message-1",
    });
    markReplayDirectionEvent({
      sourceId: "episode-1",
      kind: "speech",
      sourceMessageId: "message-1",
      atMs: 100,
      endMs: 800,
      payload: {
        speakerId: "host-1",
        voiceMode: "english",
        audible: true,
        gain: 0.8,
        pan: -0.25,
        effects: ["studio-room"],
      },
    });
    const releaseElement = routeAudioElementToPrismOutput(
      {} as HTMLAudioElement,
    );
    assert.ok(releaseElement);
    assert.equal(FakeAudioContext.lastMediaElementSource?.connections.has(output), true);

    const result = await stopReplayAudioMasterCapture("episode-1");
    assert.ok(result);
    assert.equal(result.sourceId, "episode-1");
    assert.ok(result.bytes.byteLength > 0);
    assert.deepEqual(
      result.events.map((event) => event.payload.phase),
      ["intro_start", "speech_start", "capture_end"],
    );
    assert.deepEqual(result.direction[1], {
      sequence: 2,
      atMs: 100,
      endMs: 800,
      kind: "speech",
      sourceMessageId: "message-1",
      payload: {
        speakerId: "host-1",
        voiceMode: "english",
        audible: true,
        gain: 0.8,
        pan: -0.25,
        effects: ["studio-room"],
      },
    });
    releaseElement?.();
    assert.equal(output.connections.size, 1);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("Coffee can share the recorder and failed captures fully release it", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    primeReplayAudioMasterCapture();
    assert.equal(
      await startReplayAudioMasterCapture("coffee-1", { markIntro: false }),
      true,
    );
    await abortReplayAudioMasterCapture("coffee-1");

    primeReplayAudioMasterCapture();
    assert.equal(
      await startReplayAudioMasterCapture("coffee-2", { markIntro: false }),
      true,
    );
    const result = await stopReplayAudioMasterCapture("coffee-2");
    assert.ok(result);
    assert.deepEqual(
      result.events.map((event) => event.payload.phase),
      ["capture_end"],
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("mouth capture coalesces rendered shapes and snapshots the recording Voice selection", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    const voiceSelection: ReplayVoiceSelectionSnapshotV2 = {
      voiceMode: "english",
      englishVoiceEngine: "builtin",
    };
    assert.equal(
      await startReplayAudioMasterCapture("baked-presentation", {
        markIntro: false,
        voiceSelection,
      }),
      true,
    );
    voiceSelection.voiceMode = "bottish";
    markReplayMouthShape({
      sourceId: "baked-presentation",
      participantId: "host",
      shape: "closed",
      atMs: 100,
    });
    markReplayMouthShape({
      sourceId: "baked-presentation",
      participantId: "host",
      shape: "closed",
      atMs: 150,
    });
    markReplayMouthShape({
      sourceId: "baked-presentation",
      participantId: "host",
      shape: "open-wide",
      atMs: 200,
    });
    markReplayMouthShape({
      sourceId: "baked-presentation",
      participantId: "host",
      shape: "open-wide",
      atMs: 250,
    });
    markReplayMouthShape({
      sourceId: "baked-presentation",
      participantId: "host",
      shape: "closed",
      atMs: 300,
    });
    markReplayVoiceLightLevel({
      sourceId: "baked-presentation",
      participantId: "host",
      level: 0.126,
      atMs: 100,
    });
    markReplayVoiceLightLevel({
      sourceId: "baked-presentation",
      participantId: "host",
      level: 0.9,
      atMs: 120,
    });
    markReplayVoiceLightLevel({
      sourceId: "baked-presentation",
      participantId: "host",
      level: 0.14,
      atMs: 170,
    });
    markReplayVoiceLightLevel({
      sourceId: "baked-presentation",
      participantId: "host",
      level: 0.14,
      atMs: 360,
    });
    markReplayVoiceLightLevel({
      sourceId: "baked-presentation",
      participantId: "host",
      level: 0,
      atMs: 400,
    });

    const result = await stopReplayAudioMasterCapture("baked-presentation");
    assert.deepEqual(result?.voiceSelection, {
      voiceMode: "english",
      englishVoiceEngine: "builtin",
    });
    assert.deepEqual(result?.mouthTracks, [
      {
        participantId: "host",
        cues: [
          { atMs: 100, shape: "closed" },
          { atMs: 200, shape: "open-wide" },
          { atMs: 300, shape: "closed" },
        ],
      },
    ]);
    assert.deepEqual(result?.voiceLightTracks, [
      {
        participantId: "host",
        cues: [
          { atMs: 100, level: 0.13 },
          { atMs: 360, level: 0.14 },
          { atMs: 400, level: 0 },
        ],
      },
    ]);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("thinking intervals retain presentation timing, silence, interruption, overlap, and following speech", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    assert.equal(
      await startReplayAudioMasterCapture("thinking-session", {
        markIntro: false,
      }),
      true,
    );
    assert.equal(
      replayAudioMasterCaptureCompactsThinkingGaps("thinking-session"),
      false,
    );
    startReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "host",
      audible: false,
      camera: "left",
      segment: "opening",
      atMs: 100,
    });
    startReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "guest",
      audible: true,
      camera: "wide",
      segment: "opening",
      atMs: 120,
    });
    endReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "host",
      followingMessageId: "host-line",
      atMs: 500,
    });
    endReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "guest",
      reason: "interrupted",
      atMs: 340,
    });
    startReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "cancelled-early",
      audible: false,
      camera: "wide",
      segment: "opening",
      atMs: 360,
    });
    endReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "cancelled-early",
      reason: "cancelled",
      atMs: 370,
    });
    startReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "failed-bot",
      audible: false,
      camera: "wide",
      segment: "opening",
      atMs: 380,
    });
    endReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "failed-bot",
      reason: "failed",
      atMs: 390,
    });
    startReplayThinkingPresentation({
      sourceId: "thinking-session",
      participantId: "cancelled-bot",
      audible: false,
      camera: "right",
      segment: "closing",
      atMs: 700,
    });

    const result = await stopReplayAudioMasterCapture("thinking-session");
    assert.ok(result);
    const thinking = result.direction.filter(
      (event) => event.kind === "thinking",
    );
    assert.equal(thinking.length, 5);
    assert.deepEqual(thinking[0], {
      sequence: 1,
      atMs: 100,
      endMs: 500,
      kind: "thinking",
      sourceMessageId: "host-line",
      payload: {
        participantId: "host",
        botId: "host",
        startMs: 100,
        endMs: 500,
        presentationDurationMs: 400,
        timelineCompacted: false,
        audible: false,
        camera: "left",
        segment: "opening",
        followingMessageId: "host-line",
        endReason: "completed",
      },
    });
    assert.equal(thinking[1]?.payload.endReason, "interrupted");
    assert.equal(thinking[1]?.payload.audible, true);
    assert.equal(thinking[2]?.payload.endReason, "cancelled");
    assert.equal(thinking[3]?.payload.endReason, "failed");
    assert.equal(thinking[4]?.payload.endReason, "capture_end");
    assert.ok(Number(thinking[4]?.endMs) > 700);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("Coffee capture persists thinking only when it resolves into a message", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    assert.equal(
      await startReplayAudioMasterCapture("coffee-linked-thinking", {
        markIntro: false,
        compactThinkingGaps: true,
        requireLinkedThinkingMessage: true,
      }),
      true,
    );
    startReplayThinkingPresentation({
      sourceId: "coffee-linked-thinking",
      participantId: "orphan",
      audible: false,
      camera: "wide",
      segment: "live",
      atMs: 100,
    });
    endReplayThinkingPresentation({
      sourceId: "coffee-linked-thinking",
      participantId: "orphan",
      reason: "cancelled",
      atMs: 300,
    });
    startReplayThinkingPresentation({
      sourceId: "coffee-linked-thinking",
      participantId: "speaker",
      audible: false,
      camera: "speaker",
      segment: "live",
      atMs: 400,
    });
    endReplayThinkingPresentation({
      sourceId: "coffee-linked-thinking",
      participantId: "speaker",
      followingMessageId: "delivered-line",
      atMs: 800,
    });
    const result = await stopReplayAudioMasterCapture("coffee-linked-thinking");
    const thinking = result?.direction.filter((event) => event.kind === "thinking") ?? [];
    assert.equal(thinking.length, 1);
    assert.equal(thinking[0]?.sourceMessageId, "delivered-line");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("Signal compactThinkingGaps pauses the master clock across thinking holds", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalNow = performance.now;
  let fakeNow = 1_000;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: FakeAudioContext,
      setTimeout: (fn: () => void, _ms?: number) => {
        fn();
        return 1;
      },
    },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });
  performance.now = () => fakeNow;

  try {
    FakeMediaRecorder.paused = 0;
    FakeMediaRecorder.resumed = 0;
    assert.equal(
      await startReplayAudioMasterCapture("signal-compact", {
        markIntro: false,
        compactThinkingGaps: true,
      }),
      true,
    );
    assert.equal(
      replayAudioMasterCaptureCompactsThinkingGaps("signal-compact"),
      true,
    );
    fakeNow = 1_500;
    assert.equal(replayAudioMasterCaptureElapsedMs("signal-compact"), 500);
    startReplayThinkingPresentation({
      sourceId: "signal-compact",
      participantId: "host",
      audible: true,
      camera: "wide",
      segment: "interview",
    });
    // Compact hold is driven explicitly (not by thinking presentation start).
    setReplayAudioMasterCompactHold("signal-compact", true);
    assert.equal(FakeMediaRecorder.paused, 1);
    fakeNow = 4_500;
    // Logical clock frozen while thinking — wall advanced 3s, capture did not.
    assert.equal(replayAudioMasterCaptureElapsedMs("signal-compact"), 500);
    markReplayAudioMasterCapture({
      sourceId: "signal-compact",
      phase: "speech_start",
      messageId: "line-1",
    });
    endReplayThinkingPresentation({
      sourceId: "signal-compact",
      participantId: "host",
      followingMessageId: "line-1",
    });
    setReplayAudioMasterCompactHold("signal-compact", false);
    assert.equal(FakeMediaRecorder.resumed, 1);
    fakeNow = 5_000;
    assert.equal(replayAudioMasterCaptureElapsedMs("signal-compact"), 1_000);
    const result = await stopReplayAudioMasterCapture("signal-compact");
    assert.ok(result);
    const thinking = result.direction.filter(
      (event) => event.kind === "thinking",
    );
    assert.equal(thinking.length, 1);
    assert.equal(thinking[0]?.atMs, 500);
    assert.equal(thinking[0]?.endMs, 501);
    assert.equal(thinking[0]?.payload.presentationDurationMs, 3_000);
    assert.equal(thinking[0]?.payload.timelineCompacted, true);
    assert.equal(
      result.events.find((event) => event.payload.phase === "speech_start")
        ?.payload.atMs,
      500,
    );
  } finally {
    performance.now = originalNow;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("camera flicker during thinking updates in place without thrashing the recorder", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: FakeAudioContext,
      setTimeout: (fn: () => void) => {
        fn();
        return 1;
      },
    },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    FakeMediaRecorder.paused = 0;
    FakeMediaRecorder.resumed = 0;
    assert.equal(
      await startReplayAudioMasterCapture("signal-camera", {
        markIntro: false,
        compactThinkingGaps: true,
      }),
      true,
    );
    setReplayAudioMasterCompactHold("signal-camera", true);
    startReplayThinkingPresentation({
      sourceId: "signal-camera",
      participantId: "host",
      audible: true,
      camera: "wide",
      segment: "interview",
    });
    syncReplayThinkingPresentations({
      sourceId: "signal-camera",
      presentations: [
        {
          participantId: "host",
          audible: true,
          camera: "left",
          segment: "interview",
        },
      ],
    });
    syncReplayThinkingPresentations({
      sourceId: "signal-camera",
      presentations: [
        {
          participantId: "host",
          audible: true,
          camera: "right",
          segment: "interview",
        },
      ],
    });
    syncReplayThinkingPresentations({
      sourceId: "signal-camera",
      presentations: [],
      followingMessageId: "closing-line",
      endReason: "completed",
      endingSegment: "closing",
    });
    assert.equal(FakeMediaRecorder.paused, 1);
    assert.equal(FakeMediaRecorder.resumed, 0);
    const result = await stopReplayAudioMasterCapture("signal-camera");
    const thinking = result?.direction.find(
      (event) => event.kind === "thinking",
    );
    assert.equal(thinking?.sourceMessageId, "closing-line");
    assert.equal(thinking?.payload.endReason, "completed");
    assert.equal(thinking?.payload.segment, "closing");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("a leaked prior capture is finalized before the next session starts", async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  try {
    primeReplayAudioMasterCapture();
    assert.equal(
      await startReplayAudioMasterCapture("coffee-leaked", {
        markIntro: false,
      }),
      true,
    );

    primeReplayAudioMasterCapture();
    assert.equal(
      await startReplayAudioMasterCapture("coffee-next", {
        markIntro: false,
      }),
      true,
    );
    const result = await stopReplayAudioMasterCapture("coffee-next");
    assert.equal(result?.sourceId, "coffee-next");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: originalMediaRecorder,
    });
  }
});

test("all in-world fallback lanes enter the shared mixer while UI earcons remain outside it", () => {
  for (const file of [
    "englishVoice.ts",
    "bottishVoice.ts",
    "signalIntroAudio.ts",
    "signalSoundboard.ts",
    "coffee-action-sfx.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(
      source,
      /routeAudioElementToPrismOutput/u,
      `${file} routes media-element playback through the session mix`,
    );
    assert.match(
      source,
      /replayAudioMasterCaptureActive/u,
      `${file} refuses an unrecorded device fallback during capture`,
    );
  }
  for (const file of [
    "voiceEffects.ts",
    "session-atmosphere-audio.ts",
    "botAvatarSfx.ts",
    "coffee-player-voice.ts",
  ]) {
    assert.match(
      readFileSync(new URL(file, import.meta.url), "utf8"),
      /prismAudioOutputNode/u,
      `${file} reaches the shared post-effect output`,
    );
  }
  const ui = readFileSync(new URL("spatialUiSfx.ts", import.meta.url), "utf8");
  assert.match(ui, /output\.connect\(context\.destination\)/u);
  assert.doesNotMatch(
    ui,
    /prismAudioOutputNode|routeAudioElementToPrismOutput/u,
  );
});

test("keeps the shared AudioContext awake across minimize for capture and living sessions", () => {
  const source = readFileSync(
    new URL("replayAudioMasterCapture.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /export function ensurePrismAudioContextRunning/u);
  assert.match(source, /export function acquirePrismAudioContextKeepAlive/u);
  assert.match(source, /visibilitychange/u);
  assert.match(
    source,
    /const releaseKeepAlive = acquirePrismAudioContextKeepAlive\(\)/u,
  );
  assert.match(source, /capture\.releaseKeepAlive\(\)/u);

  const suspendSource = readFileSync(
    new URL("prismPresentationSuspend.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    suspendSource,
    /acquirePrismAudioContextKeepAlive\(\)/u,
  );
});

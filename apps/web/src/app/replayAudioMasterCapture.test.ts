import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  abortReplayAudioMasterCapture,
  endReplayThinkingPresentation,
  primeReplayAudioMasterCapture,
  markReplayAudioMasterCapture,
  markReplayDirectionEvent,
  prismAudioContext,
  prismAudioOutputNode,
  routeAudioElementToPrismOutput,
  startReplayAudioMasterCapture,
  startReplayThinkingPresentation,
  stopReplayAudioMasterCapture,
} from "./replayAudioMasterCapture.ts";

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
  static isTypeSupported(): boolean {
    return true;
  }

  readonly mimeType = "audio/webm;codecs=opus";
  readonly listeners = new Map<string, Set<(event: { data: Blob }) => void>>();
  readonly stream: object;
  readonly options?: MediaRecorderOptions;

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
  }

  requestData(): void {
    for (const listener of this.listeners.get("dataavailable") ?? []) {
      listener({ data: new Blob(["flattened-master"]) });
    }
  }

  stop(): void {
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

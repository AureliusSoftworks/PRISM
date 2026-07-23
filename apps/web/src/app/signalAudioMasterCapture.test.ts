import assert from "node:assert/strict";
import test from "node:test";
import {
  markSignalAudioMasterCapture,
  primeSignalAudioMasterCapture,
  prismAudioOutputNode,
  startSignalAudioMasterCapture,
  stopSignalAudioMasterCapture,
} from "./signalAudioMasterCapture.ts";

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

test("Signal captures the same shared output bus that reaches the device", async () => {
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
    const liveContext = new FakeAudioContext();
    const output = prismAudioOutputNode(
      liveContext as unknown as AudioContext,
    ) as unknown as FakeAudioNode;
    assert.equal(output.connections.size, 1);

    primeSignalAudioMasterCapture();
    assert.equal(
      startSignalAudioMasterCapture("episode-1"),
      true,
      JSON.stringify({
        contexts: FakeAudioContext.created,
        recorders: FakeMediaRecorder.constructed,
        started: FakeMediaRecorder.started,
      }),
    );
    assert.equal(FakeAudioContext.created, 2);
    assert.equal(output.connections.size, 2);
    markSignalAudioMasterCapture({
      episodeId: "episode-1",
      phase: "speech_start",
      messageId: "message-1",
    });

    const result = await stopSignalAudioMasterCapture("episode-1");
    assert.ok(result);
    assert.ok(result.bytes.byteLength > 0);
    assert.deepEqual(
      result.events.map((event) => event.payload.phase),
      ["intro_start", "speech_start", "capture_end"],
    );
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

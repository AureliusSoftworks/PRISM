import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, it } from "node:test";
import {
  BuiltinTtsWorkerBusyError,
  BuiltinTtsWorkerClient,
} from "../builtin-tts-worker-client.ts";
import {
  sendBuiltinTtsChildResponse,
} from "../builtin-tts-child-ipc.ts";

const PROFILE = {
  v: 1 as const,
  baseVoiceId: "voice-1" as const,
  pitch: 0,
  warmth: 0,
  pace: 0,
  lilt: 0,
};

const clients: BuiltinTtsWorkerClient[] = [];

function createClient(): BuiltinTtsWorkerClient {
  const client = new BuiltinTtsWorkerClient({
    workerUrl: new URL(
      "./fixtures/builtin-tts-child-fixture.mjs",
      import.meta.url,
    ),
    timeoutMs: 2_000,
  });
  clients.push(client);
  return client;
}

function decodeResult(wave: Buffer): {
  text: string;
  pid: number;
  startedAt: number;
  endedAt: number;
} {
  return JSON.parse(wave.toString("utf8")) as {
    text: string;
    pid: number;
    startedAt: number;
    endedAt: number;
  };
}

function createFakeWorker(options: {
  exitAfterDisconnectMs?: number;
  exitOnSigkill?: boolean;
} = {}): {
  worker: ChildProcess;
  requestSent: Promise<void>;
  disconnectCalls: () => number;
  killSignals: Array<NodeJS.Signals | number | undefined>;
  refCalls: () => number;
  unrefCalls: () => number;
} {
  const worker = new EventEmitter() as ChildProcess;
  let disconnectCount = 0;
  let refCount = 0;
  let unrefCount = 0;
  const killSignals: Array<NodeJS.Signals | number | undefined> = [];
  let markRequestSent: (() => void) | null = null;
  const requestSent = new Promise<void>((resolve) => {
    markRequestSent = resolve;
  });
  const emitExit = (signal: NodeJS.Signals | null = null) => {
    worker.exitCode = signal ? null : 0;
    worker.emit("exit", worker.exitCode, signal);
  };
  Object.assign(worker, {
    connected: true,
    exitCode: null,
    ref: () => {
      refCount += 1;
      return worker;
    },
    unref: () => {
      unrefCount += 1;
      return worker;
    },
    send: (
      _message: unknown,
      callback?: (error: Error | null) => void,
    ) => {
      markRequestSent?.();
      callback?.(null);
      return true;
    },
    disconnect: () => {
      disconnectCount += 1;
      worker.connected = false;
      if (options.exitAfterDisconnectMs !== undefined) {
        setTimeout(() => emitExit(), options.exitAfterDisconnectMs);
      }
    },
    kill: (signal?: NodeJS.Signals | number) => {
      killSignals.push(signal);
      if (options.exitOnSigkill && signal === "SIGKILL") {
        queueMicrotask(() => emitExit("SIGKILL"));
      }
      return true;
    },
  });
  return {
    worker,
    requestSent,
    disconnectCalls: () => disconnectCount,
    killSignals,
    refCalls: () => refCount,
    unrefCalls: () => unrefCount,
  };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
});

describe("built-in TTS worker isolation", () => {
  it("keeps the parent event loop responsive during CPU-bound speech", async () => {
    const client = createClient();
    let synthesisSettled = false;
    const synthesis = client
      .generate({ text: "busy:350", profile: PROFILE })
      .finally(() => {
        synthesisSettled = true;
      });
    const timerStartedAt = Date.now();
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    const timerElapsedMs = Date.now() - timerStartedAt;

    assert.ok(
      timerElapsedMs < 200,
      `parent timer took ${timerElapsedMs}ms while speech ran`,
    );
    assert.equal(synthesisSettled, false);
    assert.equal(decodeResult(await synthesis).text, "busy:350");
  });

  it("serializes requests so local speech jobs never multiply inference load", async () => {
    const client = createClient();
    const [first, second] = await Promise.all([
      client.generate({ text: "busy:120", profile: PROFILE }),
      client.generate({ text: "busy:80", profile: PROFILE }),
    ]);
    const firstTiming = decodeResult(first);
    const secondTiming = decodeResult(second);

    assert.ok(secondTiming.startedAt >= firstTiming.endedAt);
  });

  it("contains a child crash and lazily respawns for the next line", async () => {
    const client = createClient();
    await assert.rejects(
      client.generate({ text: "crash", profile: PROFILE }),
      /local voice worker stopped/i,
    );

    const recovered = decodeResult(
      await client.generate({ text: "recovered", profile: PROFILE }),
    );
    assert.equal(recovered.text, "recovered");
  });

  it("drains an aborted native inference before reusing the same serialized worker", async () => {
    const client = createClient();
    const workerBeforeAbort = decodeResult(
      await client.generate({ text: "before-abort", profile: PROFILE }),
    );
    const controller = new AbortController();
    const inferenceStartedAt = Date.now();
    const pending = client.generate({
      text: "busy:260",
      profile: PROFILE,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);

    await assert.rejects(pending, { name: "AbortError" });
    const recovered = decodeResult(
      await client.generate({ text: "after-abort", profile: PROFILE }),
    );
    assert.equal(recovered.text, "after-abort");
    assert.equal(recovered.pid, workerBeforeAbort.pid);
    assert.ok(
      recovered.startedAt >= inferenceStartedAt + 220,
      "the next line must wait for abandoned native work to finish",
    );
  });

  it("bounds an interrupted drain before releasing a queued line to fallback", async () => {
    const client = new BuiltinTtsWorkerClient({
      workerUrl: new URL(
        "./fixtures/builtin-tts-child-fixture.mjs",
        import.meta.url,
      ),
      timeoutMs: 2_000,
      abandonedDrainTimeoutMs: 80,
    });
    clients.push(client);
    const workerBeforeAbort = decodeResult(
      await client.generate({ text: "before-bounded-abort", profile: PROFILE }),
    );
    const controller = new AbortController();
    const interrupted = client.generate({
      text: "busy:800",
      profile: PROFILE,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 25);

    await assert.rejects(interrupted, { name: "AbortError" });
    const queuedAt = Date.now();
    await assert.rejects(
      client.generate({ text: "queued-reaction", profile: PROFILE }),
      (error: unknown) => error instanceof BuiltinTtsWorkerBusyError,
    );
    assert.ok(
      Date.now() - queuedAt < 500,
      "the queued reaction must be released within the drain deadline",
    );
    await assert.rejects(
      client.generate({ text: "late-reaction", profile: PROFILE }),
      (error: unknown) => error instanceof BuiltinTtsWorkerBusyError,
    );

    // The abandoned inference remains the only native ONNX job. Once it
    // drains, the same worker is reusable; no parallel child was spawned.
    await new Promise<void>((resolve) => setTimeout(resolve, 760));
    const recovered = decodeResult(
      await client.generate({ text: "after-bounded-abort", profile: PROFILE }),
    );
    assert.equal(recovered.pid, workerBeforeAbort.pid);
  });

  it("lets active native inference drain on dispose without signalling it", async () => {
    const fake = createFakeWorker({ exitAfterDisconnectMs: 15 });
    const client = new BuiltinTtsWorkerClient({
      timeoutMs: 80,
      spawnWorker: () => {
        queueMicrotask(() => fake.worker.emit("message", { type: "ready" }));
        return fake.worker;
      },
    });
    clients.push(client);
    const pending = client.generate({ text: "active-dispose", profile: PROFILE });
    await fake.requestSent;

    client.dispose();

    await assert.rejects(pending, /worker stopped/i);
    assert.equal(fake.disconnectCalls(), 1);
    assert.deepEqual(fake.killSignals, []);
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(fake.killSignals, []);
    assert.ok(fake.refCalls() >= 1);
    assert.ok(fake.unrefCalls() >= 1);
  });

  it("force-stops a disposed active worker only after its hard drain deadline", async () => {
    const fake = createFakeWorker({ exitOnSigkill: true });
    const client = new BuiltinTtsWorkerClient({
      timeoutMs: 60,
      spawnWorker: () => {
        queueMicrotask(() => fake.worker.emit("message", { type: "ready" }));
        return fake.worker;
      },
    });
    clients.push(client);
    const pending = client.generate({ text: "wedged-dispose", profile: PROFILE });
    await fake.requestSent;

    client.dispose();

    await assert.rejects(pending, /worker stopped/i);
    assert.deepEqual(fake.killSignals, []);
    await new Promise<void>((resolve) => setTimeout(resolve, 90));
    assert.deepEqual(fake.killSignals, ["SIGKILL"]);
    assert.ok(fake.unrefCalls() >= 1);
  });

  it("preserves the forced-exit deadline when disposed during recycle", async () => {
    const fake = createFakeWorker({ exitOnSigkill: true });
    const client = new BuiltinTtsWorkerClient({
      timeoutMs: 40,
      recycleGraceMs: 60,
      spawnWorker: () => {
        queueMicrotask(() => fake.worker.emit("message", { type: "ready" }));
        return fake.worker;
      },
    });
    clients.push(client);

    await assert.rejects(
      client.generate({ text: "recycling-dispose", profile: PROFILE }),
      /timed out/i,
    );
    assert.deepEqual(fake.killSignals, ["SIGTERM"]);
    client.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 90));

    assert.deepEqual(fake.killSignals, ["SIGTERM", "SIGKILL"]);
    assert.ok(fake.unrefCalls() >= 1);
  });

  it("treats a closed parent IPC channel as a dropped result, not a crash", async () => {
    const response = {
      type: "result" as const,
      id: "voice-test",
      waveBase64: "UklGRg==",
    };
    assert.equal(
      await sendBuiltinTtsChildResponse(
        { connected: false, send: () => assert.fail("send should not run") },
        response,
      ),
      false,
    );
    assert.equal(
      await sendBuiltinTtsChildResponse(
        {
          connected: true,
          send: (_message, callback) => {
            callback?.(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
            return false;
          },
        },
        response,
      ),
      false,
    );
    const receiverSensitiveSender = {
      connected: true,
      send(
        this: unknown,
        _message: typeof response,
        callback?: (error: Error | null) => void,
      ): boolean {
        assert.equal(this, receiverSensitiveSender);
        callback?.(null);
        return true;
      },
    };
    assert.equal(
      await sendBuiltinTtsChildResponse(receiverSensitiveSender, response),
      true,
    );
  });

  it("force-stops a timed-out worker that ignores graceful recycle", async () => {
    const client = new BuiltinTtsWorkerClient({
      workerUrl: new URL(
        "./fixtures/builtin-tts-child-fixture.mjs",
        import.meta.url,
      ),
      timeoutMs: 80,
      recycleGraceMs: 60,
    });
    clients.push(client);
    const beforeTimeout = decodeResult(
      await client.generate({ text: "before-timeout", profile: PROFILE }),
    );

    await assert.rejects(
      client.generate({ text: "hang", profile: PROFILE }),
      /timed out/i,
    );
    const recovered = decodeResult(
      await client.generate({ text: "after-timeout", profile: PROFILE }),
    );
    assert.equal(recovered.text, "after-timeout");
    assert.notEqual(recovered.pid, beforeTimeout.pid);
  });

  it("rejects a queued line when a child never becomes ready", async () => {
    const client = new BuiltinTtsWorkerClient({
      workerUrl: new URL(
        "./fixtures/builtin-tts-never-ready-fixture.mjs",
        import.meta.url,
      ),
      timeoutMs: 2_000,
      readyTimeoutMs: 60,
      recycleGraceMs: 60,
    });
    clients.push(client);

    await assert.rejects(
      client.generate({ text: "never-ready", profile: PROFILE }),
      /did not become ready/i,
    );
  });
});

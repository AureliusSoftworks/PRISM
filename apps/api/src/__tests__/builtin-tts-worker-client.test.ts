import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  BuiltinTtsWorkerClient,
} from "../builtin-tts-worker-client.ts";

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
  startedAt: number;
  endedAt: number;
} {
  return JSON.parse(wave.toString("utf8")) as {
    text: string;
    startedAt: number;
    endedAt: number;
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

  it("kills an aborted active inference and lets the next request recover", async () => {
    const client = createClient();
    const controller = new AbortController();
    const pending = client.generate({
      text: "busy:600",
      profile: PROFILE,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 40);

    await assert.rejects(pending, { name: "AbortError" });
    const recovered = decodeResult(
      await client.generate({ text: "after-abort", profile: PROFILE }),
    );
    assert.equal(recovered.text, "after-abort");
  });
});

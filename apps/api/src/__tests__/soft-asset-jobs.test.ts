import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SoftAssetJobDestinationV1 } from "@localai/shared";
import {
  SoftAssetJobConflictError,
  SoftAssetJobManager,
} from "../soft-asset-jobs.ts";

const DESTINATION: SoftAssetJobDestinationV1 = {
  kind: "debate_exhibit_sprite",
  sessionId: "debate-1",
  exhibitId: "exhibit-1",
};

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for soft asset job state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function startInput(overrides: {
  requestId?: string;
  acquire?: (signal: AbortSignal) => Promise<void>;
  generate?: (signal: AbortSignal) => Promise<{ imageId: string }>;
  attach?: (
    image: { imageId: string },
    signal: AbortSignal,
  ) => Promise<void>;
} = {}) {
  return {
    userId: "user-1",
    requestId: overrides.requestId ?? "request-1",
    applet: "debate" as const,
    title: "Rusty spoon",
    destinationLabel: "The Rail Question · Rusty spoon",
    destination: DESTINATION,
    acquire: overrides.acquire,
    generate:
      overrides.generate ?? (async () => ({ imageId: "generated-image" })),
    attach: overrides.attach ?? (async () => undefined),
  };
}

describe("SoftAssetJobManager", () => {
  it("owns generation through durable destination attachment after enqueue", async () => {
    let releaseAcquire!: () => void;
    const acquire = new Promise<void>((resolve) => {
      releaseAcquire = resolve;
    });
    const attached: string[] = [];
    const manager = new SoftAssetJobManager(
      () => new Date("2026-08-10T19:00:00.000Z"),
      () => "job-1",
    );

    const queued = manager.start(
      startInput({
        acquire: async () => acquire,
        attach: async (image) => {
          attached.push(image.imageId);
        },
      }),
    );
    assert.equal(queued.status, "queued");
    releaseAcquire();

    await waitFor(() => manager.get("user-1", "job-1")?.status === "succeeded");
    assert.deepEqual(attached, ["generated-image"]);
    assert.equal(manager.get("user-1", "job-1")?.imageId, "generated-image");
  });

  it("deduplicates request ids and rejects a second active destination owner", async () => {
    let releaseAcquire!: () => void;
    const acquire = new Promise<void>((resolve) => {
      releaseAcquire = resolve;
    });
    const manager = new SoftAssetJobManager(undefined, () => "job-1");
    const input = startInput({ acquire: async () => acquire });
    const first = manager.start(input);
    const replay = manager.start(input);
    assert.equal(replay.id, first.id);
    assert.throws(
      () => manager.start(startInput({ requestId: "request-2" })),
      SoftAssetJobConflictError,
    );
    releaseAcquire();
    await waitFor(() => manager.get("user-1", first.id)?.status === "succeeded");
  });

  it("cancels queued work without generating or attaching", async () => {
    let generated = false;
    let attached = false;
    const manager = new SoftAssetJobManager(undefined, () => "job-1");
    const queued = manager.start(
      startInput({
        acquire: (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                const error = new Error("cancelled");
                error.name = "AbortError";
                reject(error);
              },
              { once: true },
            );
          }),
        generate: async () => {
          generated = true;
          return { imageId: "unexpected" };
        },
        attach: async () => {
          attached = true;
        },
      }),
    );
    assert.equal(manager.cancel("user-1", queued.id)?.status, "cancelling");
    await waitFor(() => manager.get("user-1", queued.id)?.status === "cancelled");
    assert.equal(generated, false);
    assert.equal(attached, false);
  });
});

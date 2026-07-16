import assert from "node:assert/strict";
import test from "node:test";
import {
  SignalArtworkJobManager,
  type SignalArtworkJobSnapshot,
} from "../signal-artwork-jobs.ts";

async function waitForTerminal(
  manager: SignalArtworkJobManager,
  userId: string,
): Promise<SignalArtworkJobSnapshot> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = manager.getLatest(userId);
    if (
      job &&
      ["completed", "partial", "failed", "cancelled"].includes(job.status)
    ) {
      return job;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Signal artwork job did not settle.");
}

test("runs Dark studio, canonical-source Light relight, and logo sequentially", async () => {
  const calls: string[] = [];
  let released = 0;
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-order");

  manager.start({
    userId: "user-order",
    showId: "show-1",
    showName: "The Signal",
    releaseSlot: async () => {
      released += 1;
    },
    generate: async (kind, sourceNightImageId) => {
      calls.push(`generate:${kind}:${sourceNightImageId ?? "none"}`);
      return { imageId: `image-${kind}`, imageUrl: `/images/${kind}` };
    },
    attach: async (kind, asset) => {
      calls.push(`attach:${kind}:${asset.imageId}`);
    },
  });

  const job = await waitForTerminal(manager, "user-order");
  assert.equal(job.status, "completed");
  assert.equal(job.completedCount, 3);
  assert.deepEqual(calls, [
    "generate:night-studio:none",
    "attach:night-studio:image-night-studio",
    "generate:day-studio:image-night-studio",
    "attach:day-studio:image-day-studio",
    "generate:logo:none",
    "attach:logo:image-logo",
  ]);
  assert.equal(released, 1);
});

test("cancellation aborts the active provider call, skips remaining assets, and releases once", async () => {
  let released = 0;
  let activeSignal: AbortSignal | null = null;
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-cancel");
  manager.start({
    userId: "user-cancel",
    showId: "show-2",
    showName: "Cancel Me",
    releaseSlot: async () => {
      released += 1;
    },
    generate: async (_kind, _sourceNightImageId, signal) => {
      activeSignal = signal;
      await new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
      });
    },
    attach: async () => {
      assert.fail("cancelled artwork must not attach");
    },
  });

  const cancelling = manager.cancel("user-cancel", "job-cancel");
  assert.equal(cancelling?.status, "cancelling");
  const job = await waitForTerminal(manager, "user-cancel");
  assert.equal(activeSignal?.aborted, true);
  assert.equal(job.status, "cancelled");
  assert.equal(job.completedCount, 0);
  assert.ok(job.assets.every((asset) => asset.status === "skipped"));
  assert.equal(released, 1);
});

test("a failed Dark studio skips only its dependent relight and still preserves a logo", async () => {
  const generated: string[] = [];
  const attached: string[] = [];
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-partial");
  manager.start({
    userId: "user-partial",
    showId: "show-3",
    showName: "Partial Signal",
    releaseSlot: async () => undefined,
    generate: async (kind) => {
      generated.push(kind);
      if (kind === "night-studio") throw new Error("Dark studio provider failed");
      return { imageId: `image-${kind}`, imageUrl: `/images/${kind}` };
    },
    attach: async (kind) => {
      attached.push(kind);
    },
  });

  const job = await waitForTerminal(manager, "user-partial");
  assert.equal(job.status, "partial");
  assert.equal(job.completedCount, 1);
  assert.deepEqual(generated, ["night-studio", "logo"]);
  assert.deepEqual(attached, ["logo"]);
  assert.equal(
    job.assets.find((asset) => asset.kind === "day-studio")?.status,
    "skipped",
  );
});

test("an attachment failure keeps the generated canonical Dark image available to the relight", async () => {
  const sources: Array<string | null> = [];
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-attach");
  manager.start({
    userId: "user-attach",
    showId: "show-4",
    showName: "Attachment Signal",
    releaseSlot: async () => undefined,
    generate: async (kind, sourceNightImageId) => {
      sources.push(sourceNightImageId);
      return { imageId: `image-${kind}`, imageUrl: `/images/${kind}` };
    },
    attach: async (kind) => {
      if (kind === "night-studio") throw new Error("temporary attachment failure");
    },
  });

  const job = await waitForTerminal(manager, "user-attach");
  assert.equal(job.status, "partial");
  assert.equal(job.completedCount, 2);
  assert.deepEqual(sources, [null, "image-night-studio", null]);
  assert.equal(
    job.assets.find((asset) => asset.kind === "night-studio")?.imageId,
    "image-night-studio",
  );
});

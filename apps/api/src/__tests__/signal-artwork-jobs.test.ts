import assert from "node:assert/strict";
import test from "node:test";
import {
  SignalArtworkJobManager,
  normalizeSignalArtworkAssetKinds,
  type SignalArtworkJobSnapshot,
} from "../signal-artwork-jobs.ts";

test("normalizes each partial artwork request without adding historical assets", () => {
  assert.deepEqual(normalizeSignalArtworkAssetKinds(["logo"]), ["logo"]);
  assert.deepEqual(normalizeSignalArtworkAssetKinds(["day-studio"]), ["day-studio"]);
  assert.deepEqual(normalizeSignalArtworkAssetKinds(["night-studio"]), ["night-studio"]);
  assert.deepEqual(
    normalizeSignalArtworkAssetKinds(["logo", "night-studio"]),
    ["night-studio", "logo"],
  );
  assert.deepEqual(normalizeSignalArtworkAssetKinds(undefined), [
    "night-studio",
    "day-studio",
    "logo",
  ]);
  assert.deepEqual(normalizeSignalArtworkAssetKinds(["unknown"]), []);
  assert.deepEqual(normalizeSignalArtworkAssetKinds("logo"), []);
});

test("live progress contains only the specifically requested artwork asset", async () => {
  for (const kind of ["logo", "day-studio", "night-studio"] as const) {
    let releaseGeneration!: () => void;
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const userId = `user-${kind}`;
    const manager = new SignalArtworkJobManager(
      () => new Date(),
      () => `job-${kind}`,
    );
    const initial = manager.start({
      userId,
      showId: `show-${kind}`,
      showName: `Only ${kind}`,
      kinds: [kind],
      sourceNightImageId: kind === "day-studio" ? "saved-night" : null,
      releaseSlot: async () => undefined,
      generate: async (generatedKind) => {
        await generationGate;
        return {
          imageId: `image-${generatedKind}`,
          imageUrl: `/images/${generatedKind}`,
        };
      },
      attach: async () => undefined,
    });

    assert.equal(initial.completedCount, 0);
    assert.equal(initial.totalCount, 1);
    assert.equal(initial.currentAsset, kind);
    assert.deepEqual(initial.assets.map((asset) => asset.kind), [kind]);
    assert.deepEqual(initial.assets.map((asset) => asset.status), ["generating"]);

    releaseGeneration();
    const completed = await waitForTerminal(manager, userId);
    assert.equal(completed.completedCount, 1);
    assert.equal(completed.totalCount, 1);
    assert.deepEqual(completed.assets.map((asset) => asset.kind), [kind]);
  }
});

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

test("runs a single requested logo as a one-asset background job", async () => {
  const generated: string[] = [];
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-logo");
  manager.start({
    userId: "user-logo",
    showId: "show-logo",
    showName: "Small Mark",
    kinds: ["logo"],
    releaseSlot: async () => undefined,
    generate: async (kind, sourceNightImageId) => {
      generated.push(`${kind}:${sourceNightImageId ?? "none"}`);
      return { imageId: "image-logo", imageUrl: "/images/logo" };
    },
    attach: async () => undefined,
  });

  const job = await waitForTerminal(manager, "user-logo");
  assert.equal(job.status, "completed");
  assert.equal(job.completedCount, 1);
  assert.equal(job.totalCount, 1);
  assert.deepEqual(job.assets.map((asset) => asset.kind), ["logo"]);
  assert.deepEqual(generated, ["logo:none"]);
});

test("uses the saved Dark studio as the source for a Light-only refresh", async () => {
  const sources: Array<string | null> = [];
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-day");
  manager.start({
    userId: "user-day",
    showId: "show-day",
    showName: "Day Shift",
    kinds: ["day-studio"],
    sourceNightImageId: "saved-night",
    releaseSlot: async () => undefined,
    generate: async (_kind, sourceNightImageId) => {
      sources.push(sourceNightImageId);
      return { imageId: "image-day", imageUrl: "/images/day" };
    },
    attach: async () => undefined,
  });

  const job = await waitForTerminal(manager, "user-day");
  assert.equal(job.status, "completed");
  assert.equal(job.totalCount, 1);
  assert.deepEqual(sources, ["saved-night"]);
});

test("can render the independent online logo while preserving the Dark-to-Light dependency", async () => {
  const started: string[] = [];
  let releaseNight: (() => void) | null = null;
  const nightGate = new Promise<void>((resolve) => {
    releaseNight = resolve;
  });
  const manager = new SignalArtworkJobManager(() => new Date(), () => "job-parallel");
  manager.start({
    userId: "user-parallel",
    showId: "show-parallel",
    showName: "Faster Signal",
    parallelIndependentAssets: true,
    releaseSlot: async () => undefined,
    generate: async (kind, sourceNightImageId) => {
      started.push(`${kind}:${sourceNightImageId ?? "none"}`);
      if (kind === "night-studio") await nightGate;
      return { imageId: `image-${kind}`, imageUrl: `/images/${kind}` };
    },
    attach: async () => undefined,
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["night-studio:none", "logo:none"]);
  releaseNight?.();
  const job = await waitForTerminal(manager, "user-parallel");
  assert.equal(job.status, "completed");
  assert.equal(job.completedCount, 3);
  assert.deepEqual(started, [
    "night-studio:none",
    "logo:none",
    "day-studio:image-night-studio",
  ]);
});

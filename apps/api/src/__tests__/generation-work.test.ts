import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  normalizePrismGenerationWorkContext,
  resetPrismGenerationWorkForTests,
  schedulePrismAuxiliaryWork,
} from "../generation-work.ts";

function context(
  priority: "interactive" | "compilation" | "background",
  cacheKey?: string,
) {
  return normalizePrismGenerationWorkContext({
    workflow: "test",
    operation: "schedule",
    stage: priority,
    executionLane: "auxiliary",
    role: "prepare",
    outputClass: "internal",
    priority,
    privacyMode: "local",
    timeoutMs: 2_000,
    ...(cacheKey ? { cacheKey } : {}),
  });
}

afterEach(() => resetPrismGenerationWorkForTests());

describe("PRISM auxiliary generation scheduler", () => {
  it("serializes one host while allowing a different host to overlap", async () => {
    let releaseFirst!: () => void;
    const events: string[] = [];
    const first = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("compilation"),
      run: async () => {
        events.push("primary-start");
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        events.push("primary-end");
        return "first";
      },
    });
    const queued = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("compilation"),
      run: async () => {
        events.push("queued-start");
        return "queued";
      },
    });
    const secondary = schedulePrismAuxiliaryWork({
      host: "http://secondary",
      context: context("compilation"),
      run: async () => {
        events.push("secondary-start");
        return "secondary";
      },
    });

    assert.equal(await secondary, "secondary");
    assert.deepEqual(events, ["primary-start", "secondary-start"]);
    releaseFirst();
    assert.deepEqual(await Promise.all([first, queued]), ["first", "queued"]);
    assert.deepEqual(events, [
      "primary-start",
      "secondary-start",
      "primary-end",
      "queued-start",
    ]);
  });

  it("yields lower-priority work and starts interactive work before queued background work", async () => {
    const events: string[] = [];
    const active = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("background"),
      run: async (signal) => {
        events.push("active");
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
        return "unreachable";
      },
    });
    const background = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("background"),
      run: async () => {
        events.push("background");
        return "background";
      },
    });
    const interactive = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("interactive"),
      run: async () => {
        events.push("interactive");
        return "interactive";
      },
    });

    await assert.rejects(active, /higher-priority/u);
    assert.equal(await interactive, "interactive");
    assert.equal(await background, "background");
    assert.deepEqual(events, ["interactive", "background"]);
  });

  it("coalesces identical in-flight cache keys", async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return "shared";
    };
    const first = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("background", "same-work"),
      run,
    });
    const second = schedulePrismAuxiliaryWork({
      host: "http://primary/",
      context: context("interactive", "same-work"),
      run,
    });
    assert.deepEqual(await Promise.all([first, second]), ["shared", "shared"]);
    assert.equal(calls, 1);
  });
});

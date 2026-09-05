import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  normalizePrismGenerationWorkContext,
  resetPrismGenerationWorkForTests,
  schedulePrismAuxiliaryWork,
  setPrismAuxiliaryHostPaused,
} from "../generation-work.ts";

function context(
  priority: "interactive" | "compilation" | "background",
  cacheKey?: string,
  ownerId = "owner-a",
) {
  return normalizePrismGenerationWorkContext({
    ownerId,
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

  it("never coalesces four identical in-flight requests across account owners", async () => {
    let calls = 0;
    const owners = ["owner-a", "owner-b", "owner-c", "owner-d"] as const;
    const results = await Promise.all(
      owners.map((owner) =>
        schedulePrismAuxiliaryWork({
          host: "http://primary",
          context: context("background", "same-work", owner),
          run: async () => ({ owner, call: ++calls }),
        }),
      ),
    );

    assert.deepEqual(
      results.map((result) => result.owner),
      owners,
    );
    assert.equal(calls, 4);
    assert.equal(new Set(results).size, 4);
  });

  it("disables coalescing when account ownership is missing", async () => {
    let calls = 0;
    const run = async () => ({ call: ++calls });
    const ownerless = normalizePrismGenerationWorkContext({
      ...context("background", "same-work"),
      ownerId: undefined,
    });
    const [first, second] = await Promise.all([
      schedulePrismAuxiliaryWork({
        host: "http://primary",
        context: ownerless,
        run,
      }),
      schedulePrismAuxiliaryWork({
        host: "http://primary",
        context: ownerless,
        run,
      }),
    ]);
    assert.deepEqual(first, { call: 1 });
    assert.deepEqual(second, { call: 2 });
    assert.notEqual(first, second);
  });

  it("keeps cache versions independent", async () => {
    let calls = 0;
    const run = async () => String(++calls);
    const first = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("background", "voice-card:v1:source"),
      run,
    });
    const second = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("background", "voice-card:v2:source"),
      run,
    });
    assert.deepEqual(await Promise.all([first, second]), ["1", "2"]);
  });

  it("holds auxiliary work while allowing selected foreground work", async () => {
    const events: string[] = [];
    setPrismAuxiliaryHostPaused("http://primary", true);
    const auxiliary = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: context("background"),
      run: async () => {
        events.push("auxiliary");
        return "auxiliary";
      },
    });
    const selectedContext = normalizePrismGenerationWorkContext({
      ...context("interactive"),
      executionLane: "selected",
      role: "author",
      outputClass: "critical",
    });
    const selected = schedulePrismAuxiliaryWork({
      host: "http://primary",
      context: selectedContext,
      run: async () => {
        events.push("selected");
        return "selected";
      },
    });
    assert.equal(await selected, "selected");
    assert.deepEqual(events, ["selected"]);
    setPrismAuxiliaryHostPaused("http://primary", false);
    assert.equal(await auxiliary, "auxiliary");
    assert.deepEqual(events, ["selected", "auxiliary"]);
  });
});

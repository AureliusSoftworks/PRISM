import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cancelCoffeeTurnJobsForConversation,
  coffeeThinkingCutInDelayMs,
  getCoffeeTurnJob,
  interruptCoffeeTurnJob,
  setCoffeeTurnJobPhase,
  startCoffeeTurnJob,
} from "../coffee-turn-jobs.ts";

describe("Coffee turn jobs", () => {
  it("publishes thinking before a completed response and advances through speaking", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const started = startCoffeeTurnJob({
      userId: "u",
      conversationId: "c",
      effort: "medium",
      run: async ({ setPhase }) => {
        setPhase("thinking", "b1");
        await wait;
        return { conversation: {} as never, speakerBotId: "b1" };
      },
    });
    await Promise.resolve();
    assert.equal(getCoffeeTurnJob("u", started.id)?.phase, "thinking");
    assert.equal(getCoffeeTurnJob("u", started.id)?.speakerBotId, "b1");
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getCoffeeTurnJob("u", started.id)?.phase, "voicing");
    assert.equal(setCoffeeTurnJobPhase("u", started.id, "speaking")?.phase, "speaking");
    assert.equal(setCoffeeTurnJobPhase("u", started.id, "completed")?.phase, "completed");
  });

  it("aborts and ignores late results after interruption", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const started = startCoffeeTurnJob({
      userId: "u2",
      conversationId: "c2",
      run: async ({ setPhase, signal }) => {
        setPhase("thinking", "b2");
        await wait;
        assert.equal(signal.aborted, true);
        return { conversation: {} as never, speakerBotId: "b2" };
      },
    });
    await Promise.resolve();
    assert.equal(interruptCoffeeTurnJob("u2", started.id)?.phase, "interrupted");
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getCoffeeTurnJob("u2", started.id)?.phase, "interrupted");
  });

  it("uses effort-sensitive thinking thresholds", () => {
    assert.equal(coffeeThinkingCutInDelayMs("minimal"), 3500);
    assert.equal(coffeeThinkingCutInDelayMs("low"), 5000);
    assert.equal(coffeeThinkingCutInDelayMs("medium"), 7500);
    assert.equal(coffeeThinkingCutInDelayMs("high"), 11000);
    assert.equal(coffeeThinkingCutInDelayMs("xhigh"), 15000);
  });

  it("publishes stale responses as terminal and will not advance them", async () => {
    const started = startCoffeeTurnJob({
      userId: "u3",
      conversationId: "c3",
      run: async ({ setPhase }) => {
        setPhase("thinking", "b3");
        return { conversation: {} as never, speakerBotId: "b3", stale: true };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getCoffeeTurnJob("u3", started.id)?.phase, "stale");
    assert.equal(setCoffeeTurnJobPhase("u3", started.id, "speaking"), null);
  });

  it("cancels every active job for a conversation", async () => {
    const started = startCoffeeTurnJob({
      userId: "u4",
      conversationId: "c4",
      run: async ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    });
    assert.equal(cancelCoffeeTurnJobsForConversation("u4", "c4"), 1);
    assert.equal(getCoffeeTurnJob("u4", started.id)?.phase, "interrupted");
  });

  it("expires abandoned in-memory jobs and aborts their work", async () => {
    let aborted = false;
    const started = startCoffeeTurnJob({
      userId: "u5",
      conversationId: "c5",
      ttlMs: 1,
      run: async ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("expired"));
        }, { once: true });
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(getCoffeeTurnJob("u5", started.id), null);
    assert.equal(aborted, true);
  });
});

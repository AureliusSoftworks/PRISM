import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_FOUNDRY_AUTOMATIC_CONCURRENCY,
  botFoundryBatchAvatarTier,
  projectBotFoundryBatchSlots,
  runAutomaticBotFoundryJobs,
} from "./botFoundryBatch.ts";

describe("automatic Bot Foundry batch jobs", () => {
  it("bounds concurrent work and reports every success or recoverable failure", async () => {
    let active = 0;
    let maximumActive = 0;
    const settled: number[] = [];
    const results = await runAutomaticBotFoundryJobs({
      indices: [1, 2, 3, 4, 5, 6],
      concurrency: BOT_FOUNDRY_AUTOMATIC_CONCURRENCY,
      run: async (index) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        if (index === 4) throw new Error("Model unavailable");
        return `bot-${index}`;
      },
      onSettled: ({ index }) => {
        settled.push(index);
      },
    });
    assert.ok(maximumActive <= BOT_FOUNDRY_AUTOMATIC_CONCURRENCY);
    assert.equal(results.length, 6);
    assert.equal(results.find((result) => result.index === 4)?.error, "Model unavailable");
    assert.deepEqual(
      results.filter((result) => result.value).map((result) => result.value),
      ["bot-1", "bot-2", "bot-3", "bot-5", "bot-6"],
    );
    assert.equal(new Set(settled).size, 6);
  });

  it("projects live previews into fixed generation-index slots", () => {
    const slots = projectBotFoundryBatchSlots({
      total: 4,
      // Deliberately supplied out of completion order.
      previews: {
        3: { name: "Third", color: "#35c7ff", glyph: "sparkles", face: null },
        1: { name: "First", color: "#ff4da6", glyph: "heart", face: null },
      },
      completedIndices: [3, 1],
      failedIndices: [2],
    });
    assert.deepEqual(
      slots.map((slot) => [slot.index, slot.state, slot.preview?.name ?? null]),
      [
        [1, "complete", "First"],
        [2, "failed", null],
        [3, "complete", "Third"],
        [4, "pending", null],
      ],
    );
  });

  it("keeps mini previews through 20 and switches to static micro at 21", () => {
    assert.equal(botFoundryBatchAvatarTier(2), "mini");
    assert.equal(botFoundryBatchAvatarTier(20), "mini");
    assert.equal(botFoundryBatchAvatarTier(21), "micro");
    assert.equal(botFoundryBatchAvatarTier(100), "micro");
  });
});

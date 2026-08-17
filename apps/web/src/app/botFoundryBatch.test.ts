import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeBotGeneratedDraftV1 } from "@localai/shared";

import {
  BOT_FOUNDRY_AUTOMATIC_CONCURRENCY,
  botFoundryAutomaticConcurrencyForLane,
  botFoundryBatchAvatarTier,
  createLatestBotFoundryBatchPersistence,
  generatedBotDraftCreatePayload,
  projectBotFoundryBatchSlots,
  runAutomaticBotFoundryJobs,
} from "./botFoundryBatch.ts";

describe("automatic Bot Foundry batch jobs", () => {
  it("preserves generated pronunciation and Accent Map casting in automatic saves", () => {
    const draft = normalizeBotGeneratedDraftV1({
      name: "Ron Weasley",
      namePronunciation: "RON WEEZ-lee",
      profile: {},
      face: {},
      voice: {
        accentDefinitionId: "british-english",
        speechprintStrength: "balanced",
      },
      settings: {},
    }, undefined, () => 0);
    assert.ok(draft);
    const payload = generatedBotDraftCreatePayload(draft);
    assert.equal(payload.namePronunciation, "RON WEEZ-lee");
    assert.equal(
      (payload.authoredAudioVoiceProfile as { accentDefinitionId?: string })
        .accentDefinitionId,
      "british-english",
    );
    const savedVoice = payload.authoredAudioVoiceProfile as {
      pronunciationMapPoint?: { x: number; y: number };
    };
    assert.deepEqual(
      savedVoice.pronunciationMapPoint,
      draft.audioVoiceProfile.pronunciationMapPoint,
    );
    assert.ok(savedVoice.pronunciationMapPoint);
  });

  it("fills every rich online cast in one wave without contending on one local host", () => {
    assert.equal(BOT_FOUNDRY_AUTOMATIC_CONCURRENCY, 10);
    assert.equal(botFoundryAutomaticConcurrencyForLane("online", 2), 2);
    assert.equal(botFoundryAutomaticConcurrencyForLane("online", 10), 10);
    assert.equal(botFoundryAutomaticConcurrencyForLane("online", 100), 10);
    assert.equal(botFoundryAutomaticConcurrencyForLane("local"), 1);
    assert.equal(botFoundryAutomaticConcurrencyForLane("local", 100), 1);
  });

  it("completes a rich online cast near one delayed generation instead of several waves", async () => {
    let active = 0;
    let maximumActive = 0;
    const settled: number[] = [];
    const startedAt = performance.now();
    const results = await runAutomaticBotFoundryJobs({
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      concurrency: botFoundryAutomaticConcurrencyForLane("online", 10),
      run: async (index) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
        if (index === 4) throw new Error("Model unavailable");
        return `bot-${index}`;
      },
      onSettled: ({ index }) => {
        settled.push(index);
      },
    });
    const elapsedMs = performance.now() - startedAt;
    assert.equal(maximumActive, BOT_FOUNDRY_AUTOMATIC_CONCURRENCY);
    assert.ok(elapsedMs < 150, `expected one wave, received ${elapsedMs}ms`);
    assert.equal(results.length, 10);
    assert.equal(results.find((result) => result.index === 4)?.error, "Model unavailable");
    assert.deepEqual(
      results.filter((result) => result.value).map((result) => result.value),
      [
        "bot-1",
        "bot-2",
        "bot-3",
        "bot-5",
        "bot-6",
        "bot-7",
        "bot-8",
        "bot-9",
        "bot-10",
      ],
    );
    assert.equal(new Set(settled).size, 10);
  });

  it("runs actual local generation serially even when the cast has many pending members", async () => {
    let active = 0;
    let maximumActive = 0;
    const started: number[] = [];
    const results = await runAutomaticBotFoundryJobs({
      indices: [1, 2, 3, 4],
      concurrency: botFoundryAutomaticConcurrencyForLane("local", 4),
      run: async (index) => {
        started.push(index);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return `local-bot-${index}`;
      },
    });
    assert.equal(maximumActive, 1);
    assert.deepEqual(started, [1, 2, 3, 4]);
    assert.deepEqual(
      results.map((result) => result.value),
      ["local-bot-1", "local-bot-2", "local-bot-3", "local-bot-4"],
    );
  });

  it("preserves requested retry order and stops launching queued work after cancellation", async () => {
    let stopped = false;
    const started: number[] = [];
    const results = await runAutomaticBotFoundryJobs({
      indices: [8, 3, 5, 2],
      concurrency: 2,
      shouldStop: () => stopped,
      run: async (index) => {
        started.push(index);
        if (index === 3) stopped = true;
        await Promise.resolve();
        return `bot-${index}`;
      },
    });
    assert.deepEqual(started, [8, 3]);
    assert.deepEqual(results.map((result) => result.index), [8, 3]);
  });

  it("coalesces partial group saves without losing the newest snapshot", async () => {
    const persisted: number[] = [];
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const persistence = createLatestBotFoundryBatchPersistence<number>(
      async (snapshot) => {
        persisted.push(snapshot);
        if (snapshot === 1) await firstWrite;
      },
    );
    persistence.push(1);
    persistence.push(2);
    persistence.push(3);
    await Promise.resolve();
    assert.deepEqual(persisted, [1]);
    releaseFirst();
    await persistence.flush();
    assert.deepEqual(persisted, [1, 3]);
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

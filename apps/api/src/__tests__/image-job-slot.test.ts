import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@localai/shared";
import {
  conversationIdForImageGeneration,
  finishImageJob,
  peekActiveImageJobForUser,
  pollImageJobForUser,
  releaseImageSlot,
  releaseImageSlotIfOwned,
  tryAcquireImageSlot,
  waitForImageSlot,
} from "../image-job-slot.ts";

function slotRequest(userId: string, label: string) {
  return {
    userId,
    conversationId: null,
    botId: null,
    mode: "sandbox" as const,
    incognito: false,
    captionPrompt: label,
    userMessage: label,
    source: "signal_artwork" as const,
  };
}

describe("image-job-slot", () => {
  it("grants one slot per user and refuses second acquire while running", async () => {
    const userId = "user-slot-a";
    const first = await tryAcquireImageSlot({
      userId,
      conversationId: "conv-1",
      botId: null,
      mode: "chat",
      incognito: false,
      captionPrompt: "a red apple",
      userMessage: "draw apple",
      source: "chat_tool",
    });
    assert.equal(first.ok, true);
    assert.ok(first.ok && first.job.id.length > 0);
    const peek = peekActiveImageJobForUser(userId);
    assert.ok(peek);
    assert.equal(peek?.conversationId, "conv-1");

    const second = await tryAcquireImageSlot({
      userId,
      conversationId: "conv-2",
      botId: null,
      mode: "chat",
      incognito: false,
      captionPrompt: "a blue boat",
      userMessage: "draw boat",
      source: "chat_tool",
    });
    assert.equal(second.ok, false);
    assert.ok(!second.ok && second.busyJob.id === (first.ok ? first.job.id : ""));

    await releaseImageSlot(userId);
    assert.equal(peekActiveImageJobForUser(userId), undefined);

    const third = await tryAcquireImageSlot({
      userId,
      conversationId: "conv-2",
      botId: null,
      mode: "chat",
      incognito: false,
      captionPrompt: "a blue boat",
      userMessage: "draw boat",
      source: "chat_tool",
    });
    assert.equal(third.ok, true);
    await releaseImageSlot(userId);
  });

  it("poll returns running then succeeded with messages", async () => {
    const userId = "user-slot-b";
    const acq = await tryAcquireImageSlot({
      userId,
      conversationId: "conv-p",
      botId: "bot-1",
      mode: "sandbox",
      incognito: false,
      captionPrompt: "test",
      userMessage: "hi",
      source: "images_panel",
    });
    assert.equal(acq.ok, true);
    if (!acq.ok) return;
    const r1 = pollImageJobForUser(userId, acq.job.id);
    assert.deepEqual(r1, { ok: true, status: "running" });

    const stubMessages: ChatMessage[] = [
      {
        id: "m-follow",
        role: "assistant",
        content: "Here you go.",
        createdAt: new Date().toISOString(),
      },
    ];
    await finishImageJob(acq.job.id, userId, { status: "succeeded", messages: stubMessages });
    const r2 = pollImageJobForUser(userId, acq.job.id);
    assert.deepEqual(r2, { ok: true, status: "succeeded", messages: stubMessages });

    const r3 = pollImageJobForUser(userId, acq.job.id);
    assert.equal(r3.ok, false);
    assert.equal(r3.error, "not_found");
  });

  it("rejects poll for another user's job id", async () => {
    const acq = await tryAcquireImageSlot({
      userId: "user-c",
      conversationId: null,
      botId: null,
      mode: "chat",
      incognito: true,
      captionPrompt: "x",
      userMessage: "y",
      source: "chat_tool",
    });
    assert.equal(acq.ok, true);
    if (!acq.ok) return;
    const bad = pollImageJobForUser("someone-else", acq.job.id);
    assert.deepEqual(bad, { ok: false, error: "forbidden" });
    await releaseImageSlot("user-c");
  });

  it("does not attach private image generation to ephemeral conversation ids", () => {
    assert.equal(
      conversationIdForImageGeneration({ conversationId: "private-session-1", incognito: true }),
      null
    );
    assert.equal(
      conversationIdForImageGeneration({ conversationId: "conversation-1", incognito: false }),
      "conversation-1"
    );
  });

  it("releases a Signal-owned slot only for its exact background job", async () => {
    const userId = "user-signal-slot";
    const acquired = await tryAcquireImageSlot({
      userId,
      conversationId: null,
      botId: "signal-host",
      mode: "sandbox",
      incognito: false,
      captionPrompt: "Signal studio",
      userMessage: "Create show look",
      source: "signal_artwork",
    });
    assert.equal(acquired.ok, true);
    if (!acquired.ok) return;

    assert.equal(await releaseImageSlotIfOwned(userId, "another-job"), false);
    assert.equal(peekActiveImageJobForUser(userId)?.id, acquired.job.id);
    assert.equal(await releaseImageSlotIfOwned(userId, acquired.job.id), true);
    assert.equal(peekActiveImageJobForUser(userId), undefined);
  });

  it("waits for the active image slot and promotes queued work FIFO", async () => {
    const userId = "image-slot-fifo-user";
    const first = await tryAcquireImageSlot(slotRequest(userId, "first"));
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const secondController = new AbortController();
    const thirdController = new AbortController();
    let secondStarted = false;
    let thirdStarted = false;
    const secondPromise = waitForImageSlot({
      ...slotRequest(userId, "second"),
      signal: secondController.signal,
    }).then((job) => {
      secondStarted = true;
      return job;
    });
    const thirdPromise = waitForImageSlot({
      ...slotRequest(userId, "third"),
      signal: thirdController.signal,
    }).then((job) => {
      thirdStarted = true;
      return job;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(secondStarted, false);
    assert.equal(thirdStarted, false);

    await releaseImageSlotIfOwned(userId, first.job.id);
    const second = await secondPromise;
    assert.equal(second.captionPrompt, "second");
    assert.equal(thirdStarted, false);
    assert.equal(peekActiveImageJobForUser(userId)?.id, second.id);

    await releaseImageSlotIfOwned(userId, second.id);
    const third = await thirdPromise;
    assert.equal(third.captionPrompt, "third");
    assert.equal(peekActiveImageJobForUser(userId)?.id, third.id);
    await releaseImageSlotIfOwned(userId, third.id);
  });

  it("removes cancelled work while it is waiting for the image slot", async () => {
    const userId = "image-slot-cancel-user";
    const first = await tryAcquireImageSlot(slotRequest(userId, "active"));
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const waitingController = new AbortController();
    const waiting = waitForImageSlot({
      ...slotRequest(userId, "cancel me"),
      signal: waitingController.signal,
    });
    waitingController.abort();
    await assert.rejects(waiting, (error: unknown) => {
      return error instanceof Error && error.name === "AbortError";
    });

    await releaseImageSlotIfOwned(userId, first.job.id);
    assert.equal(peekActiveImageJobForUser(userId), undefined);
  });
});

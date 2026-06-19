import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage } from "@localai/shared";
import {
  conversationIdForImageGeneration,
  finishImageJob,
  peekActiveImageJobForUser,
  pollImageJobForUser,
  releaseImageSlot,
  tryAcquireImageSlot,
} from "../image-job-slot.ts";

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
});

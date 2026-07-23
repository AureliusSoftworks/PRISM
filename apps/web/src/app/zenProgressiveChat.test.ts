import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseZenProgressiveChatEvent,
  readZenProgressiveChatStream,
} from "./zenProgressiveChat.ts";

describe("Zen progressive chat stream", () => {
  it("validates segment and completion events", () => {
    const segment = parseZenProgressiveChatEvent(
      JSON.stringify({
        type: "segment",
        conversationId: "conversation-a",
        assistantMessageId: "assistant-a",
        voiceSegmentId: "voice-a",
        segmentIndex: 0,
        text: "First beat.",
        provider: "openai",
        model: "gpt-test",
        botId: null,
        moodKey: "warm",
        createdAt: "2026-07-23T00:00:00.000Z",
        finalSegment: false,
      }),
    );
    assert.equal(segment?.type, "segment");
    assert.equal(
      parseZenProgressiveChatEvent('{"type":"segment","text":"missing"}'),
      null,
    );
  });

  it("delivers split NDJSON chunks in order and returns the final envelope", async () => {
    const encoder = new TextEncoder();
    const payload = [
      JSON.stringify({
        type: "segment",
        conversationId: "conversation-a",
        assistantMessageId: "assistant-a",
        voiceSegmentId: "voice-a",
        segmentIndex: 0,
        text: "First beat.",
        provider: "openai",
        model: "gpt-test",
        botId: "bot-a",
        moodKey: "warm",
        createdAt: "2026-07-23T00:00:00.000Z",
        finalSegment: true,
      }),
      JSON.stringify({
        type: "progressive_end",
        conversationId: "conversation-a",
        assistantMessageId: "assistant-a",
        deliveredSegments: 1,
        interrupted: false,
      }),
      JSON.stringify({
        type: "complete",
        envelope: { conversation: { id: "conversation-a" } },
      }),
      "",
    ].join("\n");
    const splitAt = Math.floor(payload.length / 2);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(payload.slice(0, splitAt)));
          controller.enqueue(encoder.encode(payload.slice(splitAt)));
          controller.close();
        },
      }),
      {
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
        },
      },
    );
    const segments: string[] = [];
    let ended = false;
    const result = await readZenProgressiveChatStream<{
      conversation: { id: string };
    }>({
      response,
      onSegment: (event) => segments.push(event.text),
      onEnd: () => {
        ended = true;
      },
    });
    assert.deepEqual(segments, ["First beat."]);
    assert.equal(ended, true);
    assert.equal(result.conversation.id, "conversation-a");
  });
});


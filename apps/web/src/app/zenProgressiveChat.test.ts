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

  it("validates live Psychic planning events", () => {
    const psychic = parseZenProgressiveChatEvent(
      JSON.stringify({
        type: "psychic",
        stage: "audit",
        summary: "I'm checking the answer against the request.",
        scratchpad: "Plan scratchpad: keep the answer concise.",
        effort: "medium",
        provider: "local",
        model: "qwen3.5:9b",
        simulated: true,
        passCount: 2,
        guidanceChars: 240,
        createdAt: "2026-08-02T22:00:00.000Z",
      }),
    );
    assert.equal(psychic?.type, "psychic");
    assert.equal(psychic?.type === "psychic" ? psychic.stage : null, "audit");
    assert.equal(
      parseZenProgressiveChatEvent('{"type":"psychic","stage":"plan"}'),
      null,
    );
  });

  it("delivers split NDJSON chunks in order and returns the final envelope", async () => {
    const encoder = new TextEncoder();
    const payload = [
      JSON.stringify({
        type: "psychic",
        stage: "plan",
        summary: "I'm choosing the clearest reply.",
        scratchpad: "Plan scratchpad: answer directly.",
        effort: "minimal",
        provider: "local",
        model: "qwen3.5:9b",
        simulated: false,
        passCount: 1,
        guidanceChars: 64,
        createdAt: "2026-08-02T22:00:00.000Z",
      }),
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
    const psychicStages: string[] = [];
    let ended = false;
    const result = await readZenProgressiveChatStream<{
      conversation: { id: string };
    }>({
      response,
      onSegment: (event) => segments.push(event.text),
      onEnd: () => {
        ended = true;
      },
      onPsychic: (event) => psychicStages.push(event.stage),
    });
    assert.deepEqual(segments, ["First beat."]);
    assert.deepEqual(psychicStages, ["plan"]);
    assert.equal(ended, true);
    assert.equal(result.conversation.id, "conversation-a");
  });
});

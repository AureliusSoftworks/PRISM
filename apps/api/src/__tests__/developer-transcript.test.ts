import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeveloperTranscript,
  redactDeveloperTranscript,
} from "../developer-transcript.ts";

describe("developer transcript redaction", () => {
  it("deterministically redacts credentials, env values, headers, and local paths", () => {
    const raw = [
      '"apiKey": "sk-proj-super-secret-value"',
      "Authorization: Bearer auth-value-123",
      "BRAVE_SEARCH_API_KEY=brv-search-secret-123",
      "x-subscription-token: brave-header-secret",
      "configured=private-env-secret",
      "/Users/jared/private/config.json",
      "C:\\Users\\jared\\private\\config.json",
    ].join("\n");
    const expected = redactDeveloperTranscript(raw, {
      secretValues: ["private-env-secret"],
    });

    assert.equal(
      redactDeveloperTranscript(raw, { secretValues: ["private-env-secret"] }),
      expected,
    );
    for (const secret of [
      "sk-proj-super-secret-value",
      "auth-value-123",
      "brv-search-secret-123",
      "brave-header-secret",
      "private-env-secret",
      "/Users/jared",
      "C:\\Users\\jared",
    ]) {
      assert.doesNotMatch(expected, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
    }
    assert.match(expected, /\[REDACTED/u);
  });
});

describe("buildDeveloperTranscript", () => {
  it("includes calls, prompts, raw and parsed output, messages, tools, and distinct ambient events", () => {
    const transcript = buildDeveloperTranscript({
      exportedAt: "2026-07-14T20:00:00.000Z",
      conversation: {
        id: "conversation-1",
        title: "Debug session",
        mode: "coffee",
        topic: "A useful disagreement",
        createdAt: "2026-07-14T19:00:00.000Z",
        updatedAt: "2026-07-14T19:05:00.000Z",
      },
      events: [
        {
          id: "event-1",
          requestId: "request-1",
          requestSequence: 1,
          messageId: "assistant-1",
          kind: "llm",
          purpose: "coffee_turn",
          provider: "openai",
          model: "gpt-test",
          createdAt: "2026-07-14T19:04:00.000Z",
          payloadJson: JSON.stringify({
            request: {
              messages: [
                { role: "system", content: "System prompt with sk-secret-value-123" },
                { role: "user", content: "Say hello" },
              ],
            },
            rawOutput: { choices: [{ message: { content: "Hello" } }] },
            parsedOutput: "Hello",
            stopReason: "stop",
            streaming: false,
            durationMs: 321,
            usage: { inputTokens: 12, outputTokens: 2, totalTokens: 14 },
          }),
        },
      ],
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "Hello",
          provider: "openai",
          model: "gpt-test",
          botId: "bot-1",
          audienceBotIds: '["bot-2"]',
          createdAt: "2026-07-14T19:04:01.000Z",
          toolPayload: JSON.stringify({
            webSearch: { query: "news" },
            coffeeAmbientAction: { action: "*sips*" },
            coffeeReplayEvents: [
              { kind: "arrival", botId: "bot-1", occurredAt: "2026-07-14T19:00:01.000Z" },
            ],
          }),
        },
      ],
    });

    assert.match(transcript, /^# PRISM Developer Transcript/u);
    assert.match(transcript, /### Call 1/u);
    assert.match(transcript, /Purpose \/ routing decision: coffee_turn/u);
    assert.match(transcript, /Selected topic: A useful disagreement/u);
    assert.match(transcript, /#### System prompts/u);
    assert.match(transcript, /#### Raw model \/ service output/u);
    assert.match(transcript, /#### Parsed output/u);
    assert.match(transcript, /Input tokens: 12/u);
    assert.match(transcript, /Mention resolution \/ audience bot IDs/u);
    assert.match(transcript, /Tool calls, search results, routing metadata, and retry state/u);
    assert.match(transcript, /## Ambient Events \(not LLM calls\)/u);
    assert.match(transcript, /coffeeAmbientAction/u);
    assert.match(transcript, /coffeeReplayEvent/u);
    assert.doesNotMatch(transcript, /sk-secret-value-123/u);
  });

  it("marks visible-call output that was generated but never displayed", () => {
    const transcript = buildDeveloperTranscript({
      exportedAt: "2026-07-14T20:00:00.000Z",
      conversation: {
        id: "conversation-1",
        title: "Retry session",
        mode: "chat",
        createdAt: "2026-07-14T19:00:00.000Z",
        updatedAt: "2026-07-14T19:05:00.000Z",
      },
      events: [
        {
          id: "event-1",
          requestId: "request-1",
          requestSequence: 2,
          messageId: "assistant-1",
          kind: "llm",
          purpose: "chat_fallback",
          provider: "local",
          model: "fallback-model",
          createdAt: "2026-07-14T19:04:00.000Z",
          payloadJson: JSON.stringify({ parsedOutput: "discarded", fallback: true }),
        },
      ],
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "winning output",
          provider: "local",
          model: "fallback-model",
          botId: null,
          audienceBotIds: null,
          toolPayload: null,
          createdAt: "2026-07-14T19:04:01.000Z",
        },
      ],
    });

    assert.match(transcript, /Retry \/ fallback: yes/u);
    assert.match(transcript, /Generated output was transformed, rejected, retried, or not displayed verbatim/u);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assistantGenerationMetadata,
  psychicSourceForAssistantMessage,
} from "./psychicMessagePresentation.ts";

const psychicThought = {
  v: 1 as const,
  summary: "I checked the request before answering.",
  effort: "high" as const,
  provider: "local" as const,
  model: "qwen3.5:9b",
  createdAt: "2026-08-03T20:00:00.000Z",
};

describe("Psychic message presentation", () => {
  it("associates a user turn's Psychic plan with the next assistant message", () => {
    const messages = [
      { role: "user", psychicThought },
      { role: "assistant", model: "qwen3.5:9b" },
    ];

    assert.equal(psychicSourceForAssistantMessage(messages, 1), messages[0]);
    assert.equal(psychicSourceForAssistantMessage(messages, 0), null);
  });

  it("does not leak a plan across consecutive assistant messages", () => {
    const messages = [
      { role: "user", psychicThought },
      { role: "assistant", model: "qwen3.5:9b" },
      { role: "assistant", model: "qwen3.5:9b" },
    ];

    assert.equal(psychicSourceForAssistantMessage(messages, 2), null);
  });

  it("reports the assistant model with the associated effort", () => {
    assert.deepEqual(
      assistantGenerationMetadata(
        { role: "assistant", model: "qwen3.5:9b" },
        { role: "user", psychicThought },
      ),
      {
        model: "LOCAL · qwen3.5:9b",
        effort: "high",
        automatic: false,
        turbo: false,
        recovered: false,
        recoveryAttemptCount: 0,
      },
    );
  });

  it("always supplies an effort glyph contract and marks Auto plus Turbo", () => {
    assert.deepEqual(
      assistantGenerationMetadata(
        {
          role: "assistant",
          model: "gpt-5.6-sol",
          autoRoute: {
            v: 1,
            lane: "online",
            provider: "openai",
            model: "gpt-5.6-sol",
            reasoningEffort: "medium",
            reasonCodes: ["standard_request"],
          },
          turbo: true,
        },
        null,
      ),
      {
        model: "Auto → OpenAI · gpt-5.6-sol",
        effort: "medium",
        automatic: true,
        turbo: true,
        recovered: false,
        recoveryAttemptCount: 0,
      },
    );

    assert.equal(
      assistantGenerationMetadata(
        { role: "assistant", model: "claude-fable-5" },
        null,
      ),
      null,
    );
  });

  it("freezes recovery metadata to the final successful route", () => {
    const metadata = assistantGenerationMetadata(
      {
        role: "assistant",
        model: "gpt-5-mini",
        autoRoute: {
          v: 1,
          lane: "online",
          provider: "openai",
          model: "gpt-5.6-sol",
          reasoningEffort: "high",
          reasonCodes: ["deep_request"],
        },
        autoRecovery: {
          v: 1,
          attempts: [
            {
              provider: "openai",
              model: "gpt-5.6-sol",
              reasoningEffort: "high",
              durationMs: 10,
              outcome: "failed",
              reason: "provider_error",
            },
            {
              provider: "openai",
              model: "gpt-5-mini",
              reasoningEffort: "xhigh",
              durationMs: 20,
              outcome: "succeeded",
            },
          ],
          finalProvider: "openai",
          finalModel: "gpt-5-mini",
          crossedOnline: false,
        },
      },
      null,
    );

    assert.equal(metadata?.model, "Auto → OpenAI · gpt-5-mini");
    assert.equal(metadata?.effort, "xhigh");
    assert.equal(metadata?.recovered, true);
  });

  it("does not annotate deterministic or unrecorded assistant turns", () => {
    assert.equal(
      assistantGenerationMetadata(
        { role: "assistant", botPowerExactResponse: "speech_copy" },
        null,
      ),
      null,
    );
    assert.equal(assistantGenerationMetadata({ role: "assistant" }, null), null);
  });
});

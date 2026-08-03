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
      { model: "qwen3.5:9b", effort: "high" },
    );
  });
});

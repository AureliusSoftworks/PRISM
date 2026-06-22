import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAskQuestionTimeoutPenalty,
  resolveAskQuestionTimeoutApplicability,
  type AskQuestionTimeoutMessage,
} from "../ask-question-timeout.ts";

const askQuestionPayload = JSON.stringify({
  v: 1,
  name: "AskQuestion",
  prompt: "Which direction should we take?",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
});

function assistantMessage(
  overrides: Partial<AskQuestionTimeoutMessage> = {}
): AskQuestionTimeoutMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "Quick check: pick a direction.",
    created_at: "2026-06-21T12:00:00.000Z",
    tool_payload: askQuestionPayload,
    ...overrides,
  };
}

describe("resolveAskQuestionTimeoutApplicability", () => {
  it("allows the latest unanswered AskQuestion", () => {
    assert.deepEqual(
      resolveAskQuestionTimeoutApplicability(assistantMessage(), undefined),
      { applies: true, messageId: "assistant-1" }
    );
  });

  it("rejects duplicate work for an answered AskQuestion", () => {
    assert.deepEqual(
      resolveAskQuestionTimeoutApplicability(assistantMessage(), {
        id: "user-1",
        role: "user",
        created_at: "2026-06-21T12:01:00.000Z",
      }),
      { applies: false, reason: "answered" }
    );
  });

  it("rejects stale AskQuestions when a newer assistant message exists", () => {
    assert.deepEqual(
      resolveAskQuestionTimeoutApplicability(assistantMessage(), {
        id: "assistant-2",
        role: "assistant",
        created_at: "2026-06-21T12:01:00.000Z",
      }),
      { applies: false, reason: "stale" }
    );
  });

  it("rejects story actions and non-AskQuestion messages", () => {
    assert.deepEqual(
      resolveAskQuestionTimeoutApplicability(
        assistantMessage({
          tool_payload: JSON.stringify({
            v: 1,
            tellFictionalStory: {
              v: 1,
              name: "tellFictionalStory",
              continueLabel: "Continue",
            },
          }),
        }),
        undefined
      ),
      { applies: false, reason: "not_askquestion" }
    );
    assert.deepEqual(
      resolveAskQuestionTimeoutApplicability(
        assistantMessage({ tool_payload: null }),
        undefined
      ),
      { applies: false, reason: "not_askquestion" }
    );
  });
});

describe("classifyAskQuestionTimeoutPenalty", () => {
  it("uses a light penalty for simple practical choices", () => {
    assert.equal(
      classifyAskQuestionTimeoutPenalty(
        assistantMessage({ content: "Quick check: pick a direction." })
      ),
      "light"
    );
  });

  it("uses the normal penalty for medium context without elevated stakes", () => {
    assert.equal(
      classifyAskQuestionTimeoutPenalty(
        assistantMessage({
          content:
            "We have a few competing implementation tradeoffs here, and either route can work depending on how much churn is acceptable. One path keeps the current flow compact, while the other adds a bit more structure for future changes. I can keep it focused or make the model a bit richer.",
        })
      ),
      "normal"
    );
  });

  it("uses an elevated penalty for story-like or involved context", () => {
    assert.equal(
      classifyAskQuestionTimeoutPenalty(
        assistantMessage({
          content:
            "The story has been building across this scene for a while: the character is at the threshold, the room has gone quiet, and the next choice decides whether the chapter turns toward trust or retreat.",
        })
      ),
      "elevated"
    );
  });
});

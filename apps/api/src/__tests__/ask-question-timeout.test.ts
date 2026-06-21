import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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

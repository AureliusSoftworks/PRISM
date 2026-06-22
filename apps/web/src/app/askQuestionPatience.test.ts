import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceAskQuestionPatience,
  buildAskQuestionInteractionKey,
  normalizeAskQuestionPatienceDurationMs,
  shouldPauseAskQuestionPatience,
  shouldReportAskQuestionPatienceExpiry,
} from "./askQuestionPatience.ts";

describe("AskQuestion patience timer", () => {
  it("counts down only while active", () => {
    const active = advanceAskQuestionPatience({
      durationMs: 75_000,
      elapsedMs: 10_000,
      fromMs: 1_000,
      toMs: 6_000,
      paused: false,
    });
    const paused = advanceAskQuestionPatience({
      durationMs: 75_000,
      elapsedMs: active.elapsedMs,
      fromMs: 6_000,
      toMs: 16_000,
      paused: true,
    });

    assert.equal(active.elapsedMs, 15_000);
    assert.equal(paused.elapsedMs, active.elapsedMs);
    assert.equal(paused.progress, active.progress);
  });

  it("pauses while typing and resumes after the idle window", () => {
    assert.equal(
      shouldPauseAskQuestionPatience({
        active: true,
        pendingReply: false,
        documentHidden: false,
        nowMs: 2_000,
        lastTypingAtMs: 800,
      }),
      true
    );
    assert.equal(
      shouldPauseAskQuestionPatience({
        active: true,
        pendingReply: false,
        documentHidden: false,
        nowMs: 2_400,
        lastTypingAtMs: 800,
      }),
      false
    );
  });

  it("pauses for inactive, pending, or hidden surfaces", () => {
    assert.equal(
      shouldPauseAskQuestionPatience({
        active: false,
        pendingReply: false,
        documentHidden: false,
        nowMs: 10,
        lastTypingAtMs: null,
      }),
      true
    );
    assert.equal(
      shouldPauseAskQuestionPatience({
        active: true,
        pendingReply: true,
        documentHidden: false,
        nowMs: 10,
        lastTypingAtMs: null,
      }),
      true
    );
    assert.equal(
      shouldPauseAskQuestionPatience({
        active: true,
        pendingReply: false,
        documentHidden: true,
        nowMs: 10,
        lastTypingAtMs: null,
      }),
      true
    );
  });

  it("pauses once the user opens the answer composer", () => {
    assert.equal(
      shouldPauseAskQuestionPatience({
        active: true,
        pendingReply: false,
        documentHidden: false,
        composerRevealed: true,
        nowMs: 10_000,
        lastTypingAtMs: null,
      }),
      true
    );
  });

  it("keys repeated questions by assistant message id", () => {
    const sharedQuestion = {
      conversationId: "zen-1",
      prompt: "Which route feels right?",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    };

    assert.notEqual(
      buildAskQuestionInteractionKey({
        ...sharedQuestion,
        assistantMessageId: "assistant-1",
      }),
      buildAskQuestionInteractionKey({
        ...sharedQuestion,
        assistantMessageId: "assistant-2",
      })
    );
  });

  it("clamps duration and reports expiry once", () => {
    assert.equal(normalizeAskQuestionPatienceDurationMs(1_000), 20_000);
    assert.equal(normalizeAskQuestionPatienceDurationMs(999_000), 180_000);
    const expired = advanceAskQuestionPatience({
      durationMs: 20_000,
      elapsedMs: 19_500,
      fromMs: 0,
      toMs: 1_000,
      paused: false,
    });

    assert.equal(expired.expired, true);
    assert.equal(shouldReportAskQuestionPatienceExpiry({ expired: true, alreadyReported: false }), true);
    assert.equal(shouldReportAskQuestionPatienceExpiry({ expired: true, alreadyReported: true }), false);
  });
});

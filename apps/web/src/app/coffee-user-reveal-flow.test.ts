import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeePendingSubmittedUserLineVisible,
  coffeeShouldQueueAssistantRevealAfterUserTyping,
  coffeeShouldIgnoreStaleTurnResponse,
  coffeeTableTalkAutoplayDeferralMs,
} from "./coffee-user-reveal-flow.ts";

describe("coffee user reveal flow", () => {
  it("queues assistant reveal while the user line is still typing", () => {
    assert.equal(coffeeShouldQueueAssistantRevealAfterUserTyping("userTableTyping"), true);
    assert.equal(coffeeShouldQueueAssistantRevealAfterUserTyping("botThinking"), false);
  });

  it("keeps a submitted user line visible after typing while the bot is thinking", () => {
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "botThinking",
        userRevealText: "Mr Krabs has not said anything yet.",
        sessionFinished: false,
      }),
      true
    );
  });

  it("hides the pending user line while it is actively typing or after finish", () => {
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "userTableTyping",
        userRevealText: "Still typing.",
        sessionFinished: false,
      }),
      false
    );
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "botThinking",
        userRevealText: "Done.",
        sessionFinished: true,
      }),
      false
    );
  });

  it("ignores stale Coffee turn responses without a visible speaker", () => {
    assert.equal(coffeeShouldIgnoreStaleTurnResponse({ stale: true, speakerBotId: null }), true);
    assert.equal(coffeeShouldIgnoreStaleTurnResponse({ speakerBotId: null }), true);
    assert.equal(coffeeShouldIgnoreStaleTurnResponse({ speakerBotId: "bot-vader" }), false);
  });

  it("defers Coffee autoplay while Table talk is active or freshly edited", () => {
    assert.equal(
      coffeeTableTalkAutoplayDeferralMs({
        conversationId: "coffee-1",
        draft: "wait",
        lastTypedAtMs: 1000,
        lastTypedConversationId: "coffee-1",
        nowMs: 10_000,
        graceMs: 5200,
      }),
      5200
    );
    assert.equal(
      coffeeTableTalkAutoplayDeferralMs({
        conversationId: "coffee-1",
        draft: "",
        lastTypedAtMs: 10_000,
        lastTypedConversationId: "coffee-1",
        nowMs: 12_000,
        graceMs: 5200,
      }),
      3200
    );
    assert.equal(
      coffeeTableTalkAutoplayDeferralMs({
        conversationId: "coffee-2",
        draft: "wait",
        lastTypedAtMs: 10_000,
        lastTypedConversationId: "coffee-1",
        nowMs: 12_000,
        graceMs: 5200,
      }),
      0
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeePendingSubmittedUserLineVisible,
  coffeeShouldQueueAssistantRevealAfterUserTyping,
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
});

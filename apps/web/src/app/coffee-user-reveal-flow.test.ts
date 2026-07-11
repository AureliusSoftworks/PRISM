import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeArrivalAutoplayCanScheduleNow,
  coffeeArrivalAutoplayRetryDelayMs,
  coffeeCenterFeedMessagesDuringPendingReveal,
  coffeeDraftChangeCountsAsTyping,
  coffeeDirectedMentionBotIds,
  coffeeGeneratedReplyRevealDeferralMs,
  coffeePendingSubmittedUserLineVisible,
  coffeeShouldQueueAssistantRevealAfterUserTyping,
  coffeeShouldIgnoreStaleTurnResponse,
  coffeeShouldWaitForPendingBotRevealBeforeNextTurn,
  coffeeTableTalkAutoplayDeferralMs,
  coffeeVisibleDirectedMentionBotIds,
} from "./coffee-user-reveal-flow.ts";

describe("coffee user reveal flow", () => {
  it("queues assistant reveal while the user line is still typing", () => {
    assert.equal(coffeeShouldQueueAssistantRevealAfterUserTyping("userTableTyping"), true);
    assert.equal(coffeeShouldQueueAssistantRevealAfterUserTyping("botThinking"), false);
  });

  it("waits before starting another bot turn while a bot line is still revealing", () => {
    assert.equal(coffeeShouldWaitForPendingBotRevealBeforeNextTurn("tableTyping"), true);
    assert.equal(coffeeShouldWaitForPendingBotRevealBeforeNextTurn("userTableTyping"), false);
    assert.equal(coffeeShouldWaitForPendingBotRevealBeforeNextTurn("botThinking"), false);
  });

  it("keeps arrival autoplay waking while the opener reveal is still busy", () => {
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("idle"), true);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("playerComposing"), true);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("tableTyping"), false);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("cooldown"), false);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("userTableTyping"), false);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("botThinking"), false);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("idle", 850), 0);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("tableTyping", 850), 420);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("cooldown", 0), 120);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("botThinking", 1100), 900);
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

  it("gives a pending assistant message one center-table owner while it streams", () => {
    const messages = [
      { id: "earlier", content: "Earlier line." },
      { id: "first-bot-reply", content: "Streaming line." },
    ];

    assert.deepEqual(
      coffeeCenterFeedMessagesDuringPendingReveal({
        messages,
        pendingMessageId: "first-bot-reply",
        revealInProgress: true,
      }),
      [{ id: "earlier", content: "Earlier line." }]
    );
    assert.deepEqual(
      coffeeCenterFeedMessagesDuringPendingReveal({
        messages,
        pendingMessageId: "first-bot-reply",
        revealInProgress: false,
      }),
      messages
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

  it("does not hide generated bot replies behind an empty Table Talk grace window", () => {
    assert.equal(
      coffeeGeneratedReplyRevealDeferralMs({
        conversationId: "coffee-1",
        draft: "",
        includeCooldown: false,
        lastTypedAtMs: 10_000,
        lastTypedConversationId: "coffee-1",
        nowMs: 12_000,
        graceMs: 5200,
      }),
      0
    );
    assert.equal(
      coffeeGeneratedReplyRevealDeferralMs({
        conversationId: "coffee-1",
        draft: "wait",
        includeCooldown: false,
        lastTypedAtMs: 10_000,
        lastTypedConversationId: "coffee-1",
        nowMs: 12_000,
        graceMs: 5200,
      }),
      5200
    );
    assert.equal(
      coffeeGeneratedReplyRevealDeferralMs({
        conversationId: "coffee-1",
        draft: "wait",
        includeCooldown: true,
        lastTypedAtMs: 10_000,
        lastTypedConversationId: "coffee-1",
        nowMs: 12_000,
        graceMs: 5200,
      }),
      0
    );
  });

  it("does not treat no-op empty Table Talk syncs as typing activity", () => {
    assert.equal(coffeeDraftChangeCountsAsTyping("", ""), false);
    assert.equal(coffeeDraftChangeCountsAsTyping("  ", ""), false);
    assert.equal(coffeeDraftChangeCountsAsTyping("", "hi"), true);
    assert.equal(coffeeDraftChangeCountsAsTyping("hi", ""), true);
    assert.equal(coffeeDraftChangeCountsAsTyping("hi", "hi there"), true);
  });

  it("returns ordered unique seated bot mentions for directed Coffee rounds", () => {
    const text = [
      "[SpongeBob](prism-bot://bot-sponge)",
      "and",
      "[Patrick Star](prism-bot://bot-patrick),",
      "haven't you guys gone to Weenie Hut General?",
      "[SpongeBob](prism-bot://bot-sponge)",
      "[Squidward](prism-bot://bot-squidward)",
    ].join(" ");

    assert.deepEqual(coffeeDirectedMentionBotIds(text, ["bot-patrick", "bot-sponge"]), [
      "bot-sponge",
      "bot-patrick",
    ]);
  });

  it("reveals directed mention ids when the displayed bot name starts streaming", () => {
    const text = [
      "Hey",
      "[Patrick Star](prism-bot://bot-patrick),",
      "look at",
      "[SpongeBob](prism-bot://bot-sponge).",
    ].join(" ");
    const seatedBotIds = ["bot-patrick", "bot-sponge"];

    assert.deepEqual(coffeeVisibleDirectedMentionBotIds(text, seatedBotIds, "Hey ".length), []);
    assert.deepEqual(coffeeVisibleDirectedMentionBotIds(text, seatedBotIds, "Hey P".length), [
      "bot-patrick",
    ]);
    assert.deepEqual(
      coffeeVisibleDirectedMentionBotIds(
        text,
        seatedBotIds,
        "Hey Patrick Star, look at S".length
      ),
      ["bot-patrick", "bot-sponge"]
    );
  });
});

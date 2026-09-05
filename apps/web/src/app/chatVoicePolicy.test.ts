import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHAT_AND_ZEN_SHARED_VOICE_REASON,
  CHAT_FORCED_MUTE_REASON,
  chatPresentationForSurface,
  chatPresentationForcesVoiceMute,
  effectiveVoiceModeForPresentation,
  zenPresentationIsVoiceMuted,
} from "./chatVoicePolicy.ts";

describe("Chat voice policy", () => {
  it("keeps transcript Chat on the configured Speech Type", () => {
    assert.equal(chatPresentationForSurface("chat", true), "chat");
    assert.equal(chatPresentationForcesVoiceMute("chat", true), false);
    assert.equal(
      effectiveVoiceModeForPresentation("chat", true, "english"),
      "english",
    );
    assert.equal(
      effectiveVoiceModeForPresentation("chat", true, "bottish"),
      "bottish",
    );
    assert.equal(CHAT_FORCED_MUTE_REASON, CHAT_AND_ZEN_SHARED_VOICE_REASON);
    assert.doesNotMatch(CHAT_FORCED_MUTE_REASON, /muted in Chat|return to Zen/u);
  });

  it("keeps immersive Zen on the same configured Speech Type", () => {
    assert.equal(chatPresentationForSurface("chat", false), "zen");
    assert.equal(chatPresentationForcesVoiceMute("chat", false), false);
    assert.equal(
      effectiveVoiceModeForPresentation("chat", false, "english"),
      "english",
    );
    assert.equal(
      effectiveVoiceModeForPresentation("chat", false, "bottish"),
      "bottish",
    );
  });

  it("identifies configured Mute across both Chat and Zen presentations", () => {
    assert.equal(zenPresentationIsVoiceMuted("chat", false, "mute"), true);
    assert.equal(zenPresentationIsVoiceMuted("chat", false, "english"), false);
    assert.equal(zenPresentationIsVoiceMuted("chat", true, "mute"), true);
    assert.equal(zenPresentationIsVoiceMuted("chat", true, "english"), false);
    assert.equal(zenPresentationIsVoiceMuted("coffee", false, "mute"), false);
    assert.equal(chatPresentationForSurface("coffee", false), null);
  });

  it("preserves voice choices in every other applet", () => {
    for (const view of [
      "coffee",
      "debate",
      "sandbox",
      "botcast",
      "story",
      "slate",
    ] as const) {
      assert.equal(
        effectiveVoiceModeForPresentation(view, false, "english"),
        "english",
      );
      assert.equal(
        effectiveVoiceModeForPresentation(view, true, "babble"),
        "babble",
      );
    }
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CHAT_FORCED_MUTE_REASON,
  chatPresentationForcesVoiceMute,
  effectiveVoiceModeForPresentation,
  zenPresentationIsVoiceMuted,
} from "./chatVoicePolicy.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Chat voice policy", () => {
  it("forces transcript Chat to mute without changing the configured mode", () => {
    assert.equal(chatPresentationForcesVoiceMute("chat", true), true);
    assert.equal(
      effectiveVoiceModeForPresentation("chat", true, "english"),
      "mute",
    );
    assert.equal(
      effectiveVoiceModeForPresentation("chat", true, "bottish"),
      "mute",
    );
    assert.match(CHAT_FORCED_MUTE_REASON, /saved Voice preference resumes/u);
  });

  it("preserves configured voices on the immersive Zen canvas", () => {
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

  it("identifies user-muted Zen without conflating forced-mute Chat", () => {
    assert.equal(zenPresentationIsVoiceMuted("chat", false, "mute"), true);
    assert.equal(zenPresentationIsVoiceMuted("chat", false, "english"), false);
    assert.equal(zenPresentationIsVoiceMuted("chat", true, "mute"), false);
    assert.equal(zenPresentationIsVoiceMuted("coffee", false, "mute"), false);
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

  it("enforces Chat silence across playback, requests, replay, and chrome", () => {
    assert.match(
      pageSource,
      /voiceMode:\s*effectiveVoiceModeForPresentation\(\s*view,\s*sidebarOpen,\s*normalizeVoiceMode\(settings\?\.voiceMode\)/u,
    );
    assert.match(
      pageSource,
      /if \(!chatVoiceForcedMuted\) return;[\s\S]{0,700}stopAudioForStateExit\(\);/u,
    );
    assert.match(
      pageSource,
      /!chatVoiceForcedMuted &&\s*mode === "zen"[\s\S]{0,180}progressiveZenVoice: true/u,
    );
    assert.match(
      pageSource,
      /async function replayAssistantMessageVoice[\s\S]{0,180}chatVoiceForcedMuted/u,
    );
    assert.match(
      pageSource,
      /data-chat-forced-mute=\{chatVoiceForcedMuted \? "true" : undefined\}/u,
    );
    assert.match(
      pageSource,
      /!isUser &&\s*!chatVoiceForcedMuted &&\s*settings\?\.voiceMode !== "mute"/u,
    );
    assert.match(
      pageSource,
      /voiceAwaitingReplyRef\.current =\s*!chatVoiceForcedMuted/u,
    );
    assert.match(
      pageSource,
      /const zenVoiceMuted = zenPresentationIsVoiceMuted\([\s\S]{0,140}const zenCanvasTypingDelayMultiplier =\s*view === "chat"\s*\? zenVoiceMuted\s*\? ZEN_MUTED_REVEAL_TIMING_MULTIPLIER/u,
    );
    assert.match(
      pageSource,
      /const zenLivePresenceRailVisible =\s*!zenVoiceMuted &&/u,
    );
    assert.match(
      pageSource,
      /const ZEN_MUTED_REVEAL_TIMING_MULTIPLIER = 0\.05;/u,
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /:\s*!zenVoiceMuted &&\s*chatAssistantTypingMechanicsActive &&/gu,
        ),
      ].length,
      2,
    );
    assert.match(
      tutorialSource,
      /In Zen, choosing Mute lets the live avatar step out and reveals each completed reply in a near-instant sweep\./u,
    );
  });
});

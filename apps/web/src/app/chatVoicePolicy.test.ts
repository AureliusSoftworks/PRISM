import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CHAT_FORCED_MUTE_REASON,
  chatViewForcesVoiceMute,
  effectiveVoiceModeForView,
} from "./chatVoicePolicy.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Chat voice policy", () => {
  it("forces product Chat to mute without changing the configured mode", () => {
    assert.equal(chatViewForcesVoiceMute("chat"), true);
    assert.equal(effectiveVoiceModeForView("chat", "english"), "mute");
    assert.equal(effectiveVoiceModeForView("chat", "bottish"), "mute");
    assert.match(CHAT_FORCED_MUTE_REASON, /saved Voice preference resumes/u);
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
      assert.equal(effectiveVoiceModeForView(view, "english"), "english");
      assert.equal(effectiveVoiceModeForView(view, "babble"), "babble");
    }
  });

  it("enforces Chat silence across playback, requests, replay, and chrome", () => {
    assert.match(
      pageSource,
      /voiceMode:\s*effectiveVoiceModeForView\(\s*view,\s*normalizeVoiceMode\(settings\?\.voiceMode\)/u,
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
  });
});

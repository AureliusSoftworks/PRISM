import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  beginChatTurnSpeechLock,
  ZEN_CANVAS_STREAM_RATE_MULTIPLIER,
  chatTurnSpeechTypeLocked,
  chatTurnStreamRateMultiplier,
  releaseChatTurnSpeechLock,
  resolveChatTurnSpeechSelection,
  type ChatTurnSpeechSelection,
} from "./chatTurnSpeechPolicy.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Chat/Zen turn Speech Type policy", () => {
  it("keeps the submitted selection authoritative for the whole reply", () => {
    const configured: {
      voiceMode: ChatTurnSpeechSelection["voiceMode"];
      englishVoiceEngine: ChatTurnSpeechSelection["englishVoiceEngine"];
    } = {
      voiceMode: "english",
      englishVoiceEngine: "elevenlabs",
    };
    const lock = beginChatTurnSpeechLock("run-1", configured);

    configured.voiceMode = "mute";
    configured.englishVoiceEngine = "builtin";

    assert.deepEqual(resolveChatTurnSpeechSelection(configured, lock), {
      voiceMode: "english",
      englishVoiceEngine: "elevenlabs",
    });
    assert.equal(Object.isFrozen(lock), true);
    assert.equal(Object.isFrozen(lock.selection), true);
    assert.equal(resolveChatTurnSpeechSelection(configured, null), configured);
  });

  it("lets only the owning run release the Speech Type lock", () => {
    const lock = beginChatTurnSpeechLock("run-1", {
      voiceMode: "babble",
      englishVoiceEngine: "builtin",
    });

    assert.equal(chatTurnSpeechTypeLocked(lock), true);
    assert.equal(releaseChatTurnSpeechLock(lock, "stale-run"), lock);
    assert.equal(releaseChatTurnSpeechLock(lock, "run-1"), null);
    assert.equal(chatTurnSpeechTypeLocked(null), false);
  });

  it("keeps visual text timing independent from Speech Type", () => {
    assert.equal(
      chatTurnStreamRateMultiplier("zen", 2),
      1 / (2 * ZEN_CANVAS_STREAM_RATE_MULTIPLIER),
    );
    assert.equal(
      chatTurnStreamRateMultiplier("zen", 0.5),
      1 / (0.5 * ZEN_CANVAS_STREAM_RATE_MULTIPLIER),
    );
    assert.equal(
      chatTurnStreamRateMultiplier("zen", 0),
      1 / ZEN_CANVAS_STREAM_RATE_MULTIPLIER,
    );
    assert.equal(chatTurnStreamRateMultiplier(null, 2), 1);
  });

  it("keeps transcript Chat unscaled because it bypasses the reveal clock", () => {
    assert.equal(
      chatTurnStreamRateMultiplier("chat", 1),
      1,
    );
    assert.equal(
      chatTurnStreamRateMultiplier("chat", 2),
      1 / 2,
    );
  });

  it("gives immersive Zen a mostly-instant visual cadence", () => {
    assert.equal(ZEN_CANVAS_STREAM_RATE_MULTIPLIER, 12);
    assert.equal(
      chatTurnStreamRateMultiplier("zen", 1),
      1 / ZEN_CANVAS_STREAM_RATE_MULTIPLIER,
    );
    assert.equal(
      chatTurnStreamRateMultiplier("zen", 2),
      1 / (2 * ZEN_CANVAS_STREAM_RATE_MULTIPLIER),
    );
  });

  it("bypasses assistant token scheduling in transcript Chat only", () => {
    assert.match(
      pageSource,
      /const chatAssistantTypingMechanicsActive\s*=\s*sharedChatConversationPresentation && chatPresentation === "zen"/u,
    );
    assert.match(
      pageSource,
      /Transcript Chat renders\s+incoming bot text instantly/u,
    );
  });
});

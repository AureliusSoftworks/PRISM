import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  beginChatTurnSpeechLock,
  CHAT_TRANSCRIPT_STREAM_RATE_MULTIPLIER,
  chatTurnSpeechTypeLocked,
  chatTurnStreamRateMultiplier,
  releaseChatTurnSpeechLock,
  resolveChatTurnSpeechSelection,
  type ChatTurnSpeechSelection,
} from "./chatTurnSpeechPolicy.ts";

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
    assert.equal(chatTurnStreamRateMultiplier("zen", 2), 0.5);
    assert.equal(chatTurnStreamRateMultiplier("zen", 0.5), 2);
    assert.equal(chatTurnStreamRateMultiplier("zen", 0), 1);
    assert.equal(chatTurnStreamRateMultiplier(null, 2), 1);
  });

  it("gives transcript Chat a substantially faster visual cadence", () => {
    assert.equal(CHAT_TRANSCRIPT_STREAM_RATE_MULTIPLIER, 2.5);
    assert.equal(
      chatTurnStreamRateMultiplier("chat", 1),
      1 / CHAT_TRANSCRIPT_STREAM_RATE_MULTIPLIER,
    );
    assert.equal(
      chatTurnStreamRateMultiplier("chat", 2),
      1 / (2 * CHAT_TRANSCRIPT_STREAM_RATE_MULTIPLIER),
    );
  });
});

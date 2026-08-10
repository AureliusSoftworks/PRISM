import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  beginChatTurnSpeechLock,
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

  it("applies stream rate only to Mute", () => {
    const selection = (
      voiceMode: ChatTurnSpeechSelection["voiceMode"],
      englishVoiceEngine: ChatTurnSpeechSelection["englishVoiceEngine"] =
        "builtin",
    ): ChatTurnSpeechSelection => ({ voiceMode, englishVoiceEngine });

    assert.equal(chatTurnStreamRateMultiplier(selection("mute"), 2), 0.5);
    assert.equal(chatTurnStreamRateMultiplier(selection("mute"), 0.5), 2);
    assert.equal(chatTurnStreamRateMultiplier(selection("mute"), 0), 1);
    assert.equal(chatTurnStreamRateMultiplier(selection("english"), 2), 1);
    assert.equal(
      chatTurnStreamRateMultiplier(selection("english", "elevenlabs"), 2),
      1,
    );
    assert.equal(chatTurnStreamRateMultiplier(selection("babble"), 2), 1);
    assert.equal(chatTurnStreamRateMultiplier(selection("bottish"), 2), 1);
  });
});

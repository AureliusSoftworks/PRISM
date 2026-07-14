import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_MODE_OPTIONS,
  voiceModeDisplayName,
} from "./voiceQuickToggle.ts";

describe("global voice selector", () => {
  it("offers explicit modes in the intended continuum order", () => {
    assert.deepEqual(VOICE_MODE_OPTIONS, ["mute", "english", "babble", "bottish"]);
  });

  it("formats concise header labels", () => {
    assert.equal(voiceModeDisplayName("mute"), "Mute");
    assert.equal(voiceModeDisplayName("babble"), "Babble");
    assert.equal(voiceModeDisplayName("bottish"), "Bottish");
    assert.equal(voiceModeDisplayName("english"), "English");
  });
});

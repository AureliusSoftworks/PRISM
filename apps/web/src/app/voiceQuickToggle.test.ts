import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  voiceModeAfterQuickToggle,
  voiceModeDisplayName,
} from "./voiceQuickToggle.ts";

describe("global voice quick toggle", () => {
  it("cycles English to Bottish to Mute", () => {
    assert.equal(voiceModeAfterQuickToggle("english"), "bottish");
    assert.equal(voiceModeAfterQuickToggle("bottish"), "mute");
    assert.equal(voiceModeAfterQuickToggle("mute"), "english");
  });

  it("formats concise header labels", () => {
    assert.equal(voiceModeDisplayName("mute"), "Muted");
    assert.equal(voiceModeDisplayName("bottish"), "Bottish");
    assert.equal(voiceModeDisplayName("english"), "English");
  });
});

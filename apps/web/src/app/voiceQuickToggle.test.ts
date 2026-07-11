import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeAudibleVoiceMode,
  voiceModeAfterQuickToggle,
  voiceModeDisplayName,
} from "./voiceQuickToggle.ts";

describe("global voice quick toggle", () => {
  it("mutes an audible mode and restores the remembered mode", () => {
    assert.equal(voiceModeAfterQuickToggle("english", "english"), "mute");
    assert.equal(voiceModeAfterQuickToggle("mute", "english"), "english");
    assert.equal(voiceModeAfterQuickToggle("mute", "bottish"), "bottish");
  });

  it("falls back to Bottish for malformed remembered state", () => {
    assert.equal(normalizeAudibleVoiceMode("robot"), "bottish");
  });

  it("formats concise header labels", () => {
    assert.equal(voiceModeDisplayName("mute"), "Muted");
    assert.equal(voiceModeDisplayName("bottish"), "Bottish");
    assert.equal(voiceModeDisplayName("english"), "English");
  });
});

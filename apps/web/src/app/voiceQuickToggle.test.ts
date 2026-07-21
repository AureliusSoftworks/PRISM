import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_PLAYBACK_CHOICES,
  voicePlaybackChoice,
  voiceModeDrivesCanvasReveal,
  voiceModeDisplayName,
  voiceSettingsForPlaybackChoice,
} from "./voiceQuickToggle.ts";

describe("global voice selector", () => {
  it("offers explicit modes in the intended continuum order", () => {
    assert.deepEqual(VOICE_PLAYBACK_CHOICES, [
      "mute",
      "english",
      "premium",
      "babble",
      "bottish",
    ]);
  });

  it("derives all five visible choices from persisted synthesis settings", () => {
    assert.equal(voicePlaybackChoice("mute", "builtin"), "mute");
    assert.equal(voicePlaybackChoice("english", "builtin"), "english");
    assert.equal(voicePlaybackChoice("english", "elevenlabs"), "premium");
    assert.equal(voicePlaybackChoice("babble", "elevenlabs"), "babble");
    assert.equal(voicePlaybackChoice("bottish", "builtin"), "bottish");
  });

  it("builds one atomic settings payload and preserves the engine outside English", () => {
    assert.deepEqual(voiceSettingsForPlaybackChoice("english", "elevenlabs"), {
      voiceMode: "english",
      englishVoiceEngine: "builtin",
    });
    assert.deepEqual(voiceSettingsForPlaybackChoice("premium", "builtin"), {
      voiceMode: "english",
      englishVoiceEngine: "elevenlabs",
    });
    assert.deepEqual(voiceSettingsForPlaybackChoice("babble", "elevenlabs"), {
      voiceMode: "babble",
      englishVoiceEngine: "elevenlabs",
    });
  });

  it("formats concise header labels", () => {
    assert.equal(voiceModeDisplayName("mute"), "Mute");
    assert.equal(voiceModeDisplayName("babble"), "Babble");
    assert.equal(voiceModeDisplayName("bottish"), "Bottish");
    assert.equal(voiceModeDisplayName("english"), "English");
    assert.equal(voiceModeDisplayName("premium"), "Premium");
  });

  it("keeps robot voice playback from blocking the canvas reveal clock", () => {
    assert.equal(voiceModeDrivesCanvasReveal("bottish"), false);
    assert.equal(voiceModeDrivesCanvasReveal("mute"), false);
    assert.equal(voiceModeDrivesCanvasReveal("babble"), false);
    assert.equal(voiceModeDrivesCanvasReveal("english"), true);
  });
});

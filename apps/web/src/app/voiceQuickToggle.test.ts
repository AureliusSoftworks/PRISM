import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_PLAYBACK_CHOICES,
  conversationEnglishVoiceEngine,
  effectiveVoicePlaybackChoice,
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
    assert.equal(
      voiceModeDisplayName("premium", { localPremiumFallback: true }),
      "English · LOCAL",
    );
  });

  it("uses the persisted reply provider as Premium's privacy authority", () => {
    assert.equal(
      conversationEnglishVoiceEngine("elevenlabs", "local"),
      "builtin",
    );
    assert.equal(
      conversationEnglishVoiceEngine("elevenlabs", "openai"),
      "elevenlabs",
    );
    assert.equal(
      conversationEnglishVoiceEngine("elevenlabs", null),
      "elevenlabs",
    );
  });

  it("shows the actual local voice when Premium cannot leave the device", () => {
    assert.equal(effectiveVoicePlaybackChoice("premium", true), "english");
    assert.equal(effectiveVoicePlaybackChoice("premium", false), "premium");
    assert.equal(effectiveVoicePlaybackChoice("babble", true), "babble");
  });

  it("lets generated voices own reveal timing while Bottish stays immediate", () => {
    assert.equal(voiceModeDrivesCanvasReveal("bottish"), false);
    assert.equal(voiceModeDrivesCanvasReveal("mute"), false);
    assert.equal(voiceModeDrivesCanvasReveal("babble"), true);
    assert.equal(voiceModeDrivesCanvasReveal("english"), true);
  });
});

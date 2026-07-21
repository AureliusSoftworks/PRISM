import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import { initializePremiumVoiceDefaults } from "../premium-voice-defaults.ts";

const voices = [
  { voiceId: "voice-c" },
  { voiceId: "voice-a" },
  { voiceId: "voice-b" },
];

describe("Premium voice default initialization", () => {
  it("assigns stable account overrides to eligible bots and Default Prism", () => {
    const first = initializePremiumVoiceDefaults({
      userId: "user-1",
      voices,
      bots: [{
        id: "bot-1",
        authoredAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        audioVoiceProfileOverride: null,
      }],
      prismDefaultBotAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    });
    assert.equal(first.botUpdates.length, 1);
    assert.equal(first.botUpdates[0].audioVoiceProfileOverride.elevenLabsVoiceInitialized, true);
    assert.ok(first.botUpdates[0].audioVoiceProfileOverride.elevenLabsVoiceId);
    assert.equal(first.prismDefaultBotAudioVoiceProfile?.elevenLabsVoiceInitialized, true);

    const second = initializePremiumVoiceDefaults({
      userId: "user-1",
      voices: [{ voiceId: "new-voice" }, ...voices],
      bots: [{
        id: "bot-1",
        authoredAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        audioVoiceProfileOverride: first.botUpdates[0].audioVoiceProfileOverride,
      }],
      prismDefaultBotAudioVoiceProfile: first.prismDefaultBotAudioVoiceProfile,
    });
    assert.deepEqual(second.botUpdates, []);
    assert.equal(second.prismDefaultBotAudioVoiceProfile, null);
  });

  it("preserves imported, marketplace, manual, and explicit local-only identities", () => {
    const result = initializePremiumVoiceDefaults({
      userId: "user-2",
      voices,
      bots: [
        {
          id: "marketplace",
          authoredAudioVoiceProfile: {
            ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
            elevenLabsVoiceIdOverride: "authored-exact-id",
          },
          audioVoiceProfileOverride: null,
        },
        {
          id: "manual",
          authoredAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          audioVoiceProfileOverride: {
            ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
            elevenLabsVoiceId: "manual-id",
            elevenLabsVoiceInitialized: true,
          },
        },
        {
          id: "local-only",
          authoredAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          audioVoiceProfileOverride: {
            ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
            systemVoiceName: "Alex",
            elevenLabsVoiceInitialized: true,
          },
        },
      ],
      prismDefaultBotAudioVoiceProfile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsVoiceInitialized: true,
      },
    });
    assert.deepEqual(result.botUpdates, []);
    assert.equal(result.prismDefaultBotAudioVoiceProfile, null);
  });

  it("does not mutate profiles when a catalog is empty", () => {
    assert.deepEqual(
      initializePremiumVoiceDefaults({
        userId: "user-3",
        voices: [],
        bots: [{
          id: "bot-1",
          authoredAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          audioVoiceProfileOverride: null,
        }],
        prismDefaultBotAudioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      }),
      { botUpdates: [], prismDefaultBotAudioVoiceProfile: null },
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  parseStoredBotAudioVoiceProfileV1,
  serializeBotAudioVoiceProfileV1,
} from "./audioVoice.ts";
import {
  botLocalLaughSynthesisText,
  normalizeBotLocalLaughDelimiter,
  projectLocalWrittenLaughterForSynthesis,
  projectPremiumLaughterForSynthesis,
} from "./localLaugh.ts";

describe("local authored laughter", () => {
  it("uses only the authored delimiter across the three intensities", () => {
    assert.equal(
      botLocalLaughSynthesisText({
        syllable: "ha",
        delimiter: ",",
        intensity: "soft",
      }),
      "ha,ha",
    );
    assert.equal(
      botLocalLaughSynthesisText({
        syllable: "ha",
        delimiter: "-",
        intensity: "medium",
      }),
      "ha-ha-ha-ha",
    );
    assert.equal(
      botLocalLaughSynthesisText({
        syllable: "heh",
        delimiter: " ",
        intensity: "hard",
      }),
      "heh heh heh heh heh heh heh",
    );
  });

  it("projects written laughter with the saved recipe without changing surrounding punctuation", () => {
    assert.equal(
      projectLocalWrittenLaughterForSynthesis("Okay, hahahaha!", "kek", "."),
      "Okay, kek.kek.kek.kek!",
    );
  });

  it("accepts punctuation, space, or blank but rejects word characters", () => {
    assert.equal(normalizeBotLocalLaughDelimiter(","), ",");
    assert.equal(normalizeBotLocalLaughDelimiter(" "), " ");
    assert.equal(normalizeBotLocalLaughDelimiter(""), "");
    assert.equal(normalizeBotLocalLaughDelimiter("x"), "-");
  });

  it("round-trips both parts of the laugh recipe through V3 storage", () => {
    const stored = serializeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      localLaughSyllable: "kek",
      localLaughDelimiter: ",",
    });
    const parsed = parseStoredBotAudioVoiceProfileV1(stored);
    assert.equal(parsed.localLaughSyllable, "kek");
    assert.equal(parsed.localLaughDelimiter, ",");
    assert.equal(JSON.parse(stored).local.laughDelimiter, ",");
  });
});

describe("premium authored laughter", () => {
  it("speaks a laughter tag as the authored recipe at the tag's own intensity", () => {
    assert.equal(
      projectPremiumLaughterForSynthesis("[laughs] Fair point.", "ey", "."),
      "ey.ey.ey.ey Fair point.",
    );
    assert.equal(
      projectPremiumLaughterForSynthesis("[chuckles] Fair point.", "ey", "."),
      "ey.ey Fair point.",
    );
    assert.equal(
      projectPremiumLaughterForSynthesis(
        "[laughs uproariously] Fair point.",
        "ey",
        ".",
      ),
      "ey.ey.ey.ey.ey.ey.ey Fair point.",
    );
  });

  it("leaves other provider tags and unauthored profiles untouched", () => {
    assert.equal(
      projectPremiumLaughterForSynthesis("[sighs] Fine.", "ey", "."),
      "[sighs] Fine.",
    );
    assert.equal(
      projectPremiumLaughterForSynthesis("[laughs] Fine.", null, "."),
      "[laughs] Fine.",
    );
  });

  it("projects written laughter in Premium prose the way Instant TTS does", () => {
    assert.equal(
      projectPremiumLaughterForSynthesis("Okay, hahahaha!", "kek", "."),
      "Okay, kek.kek.kek.kek!",
    );
  });

  it("round-trips the Premium laugh gate through V3 storage", () => {
    const stored = serializeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      localLaughSyllable: "kek",
      premiumLaughEnabled: true,
    });
    const parsed = parseStoredBotAudioVoiceProfileV1(stored);
    assert.equal(parsed.premiumLaughEnabled, true);
    assert.equal(JSON.parse(stored).premium.laughEnabled, true);
    assert.equal(
      parseStoredBotAudioVoiceProfileV1(
        serializeBotAudioVoiceProfileV1(DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1),
      ).premiumLaughEnabled,
      false,
    );
  });
});

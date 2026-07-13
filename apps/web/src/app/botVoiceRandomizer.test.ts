import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  fillMissingBotAudioVoiceIdentities,
  randomizeBotAudioVoiceProfile,
} from "./botVoiceRandomizer.ts";

describe("bot voice randomizer", () => {
  it("randomizes the exposed Bottish controls and installed voice identity", () => {
    const values = [0.99, 0, 0.25, 0.5, 0.75, 0.99];
    const profile = randomizeBotAudioVoiceProfile(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      "builtin",
      ["Alex", "Fred"],
      () => values.shift() ?? 0
    );
    assert.equal(profile.systemVoiceName, "Fred");
    assert.equal(profile.baseVoiceId, "voice-1");
    assert.equal(profile.pitch, -0.35);
    assert.equal(profile.lilt, 0);
    assert.equal(profile.bottishTone, 0.35);
    assert.equal(profile.texture.preset, "clean");
    assert.equal(profile.enabled, true);
  });

  it("fills late-loaded provider identities without changing customized controls", () => {
    const customized = randomizeBotAudioVoiceProfile(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      "builtin",
      [],
      () => 0.4
    );
    const filled = fillMissingBotAudioVoiceIdentities(
      customized,
      ["Alex", "Fred"],
      ["eleven-a", "eleven-b"],
      () => 0.99
    );
    assert.equal(filled.systemVoiceName, "Fred");
    assert.equal(filled.elevenLabsVoiceId, "eleven-b");
    assert.equal(filled.pitch, customized.pitch);
    assert.equal(filled.texture.preset, customized.texture.preset);
  });

  it("keeps fresh bot drafts deterministic until the explicit randomizer is used", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(pageSource, /const randomBotVoiceProfileForCreation = useCallback/);
    assert.match(pageSource, /setNewBotAudioVoiceProfile\(randomBotVoiceProfileForCreation\(\)\)/);
    assert.match(
      pageSource,
      /useState<BotAudioVoiceProfileV1>\(DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1\)/,
    );
    assert.match(
      pageSource,
      /setNewBotAudioVoiceProfile\(DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1\)/,
    );
    assert.match(
      pageSource,
      /useState<string>\(\s*DEFAULT_PRISM_BOT_CUSTOMIZER_COLOR\s*\)/,
    );
    assert.match(
      pageSource,
      /useState<BotGlyphName>\(DEFAULT_BOT_GLYPH\)/,
    );
    assert.match(pageSource, /setNewBotColor\(DEFAULT_PRISM_BOT_CUSTOMIZER_COLOR\)/);
    assert.match(pageSource, /setNewBotGlyph\(DEFAULT_BOT_GLYPH\)/);
    assert.match(pageSource, /const createdAudioVoiceProfile = normalizeBotAudioVoiceProfileV1\(/);
    assert.doesNotMatch(pageSource, /const createdAudioVoiceProfile = fillMissingBotAudioVoiceIdentities\(/);
    assert.match(pageSource, /authoredAudioVoiceProfile: createdAudioVoiceProfile/);
  });
});

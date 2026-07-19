import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  resolveBotVoiceCharacter,
} from "@localai/shared";
import {
  botVoiceCharacterPadPoint,
  botVoiceCharacterProfileFromPoint,
  botVoiceCharacterValueText,
  nudgeBotVoiceCharacterProfile,
  resetBotVoiceCharacterProfile,
} from "./botVoiceCharacter.ts";

describe("Voice Character pad", () => {
  it("keeps the neutral profile in the visual center", () => {
    assert.deepEqual(
      botVoiceCharacterPadPoint(DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1),
      { xRatio: 0.5, yRatio: 0.5 },
    );
  });

  it("maps the expressive corners into tonal tilt and asymmetric gain", () => {
    const bold = botVoiceCharacterProfileFromPoint(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      { xRatio: 0, yRatio: 0 },
    );
    assert.deepEqual(resolveBotVoiceCharacter(bold), {
      eqTilt: -1,
      lowShelfDb: 6,
      highShelfDb: -6,
      gainDb: 6,
      gainMultiplier: 1.995262,
    });

    const airy = botVoiceCharacterProfileFromPoint(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      { xRatio: 1, yRatio: 1 },
    );
    assert.deepEqual(resolveBotVoiceCharacter(airy), {
      eqTilt: 1,
      lowShelfDb: -6,
      highShelfDb: 6,
      gainDb: -12,
      gainMultiplier: 0.251189,
    });
  });

  it("supports bounded keyboard nudges and a tone-only reset", () => {
    const nudged = nudgeBotVoiceCharacterProfile(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      { eqTilt: 0.15, gainDb: -1.5 },
    );
    assert.equal(nudged.eqTilt, 0.15);
    assert.equal(nudged.gainDb, -1.5);
    assert.equal(
      botVoiceCharacterValueText(nudged),
      "Low -0.9 dB · High +0.9 dB · Gain -1.5 dB",
    );
    assert.deepEqual(resetBotVoiceCharacterProfile(nudged), {
      ...nudged,
      eqTilt: 0,
      gainDb: 0,
    });
  });
});

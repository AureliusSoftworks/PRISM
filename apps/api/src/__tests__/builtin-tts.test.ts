import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  builtinEnglishGenerationSettings,
  encodePcm16Wave,
} from "../builtin-tts-audio.ts";

describe("built-in English audio", () => {
  it("maps five portable voices to stable Kitten speakers and pace", () => {
    assert.deepEqual(
      builtinEnglishGenerationSettings({
        v: 1,
        baseVoiceId: "voice-5",
        pitch: 0,
        warmth: 0,
        pace: 0.5,
        lilt: 0,
      }),
      { speakerId: 7, speed: 1.12 }
    );
  });

  it("encodes mono PCM samples as a valid in-memory WAV", () => {
    const wave = encodePcm16Wave(new Float32Array([-1, 0, 1]), 24_000);
    assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(wave.readUInt32LE(24), 24_000);
    assert.equal(wave.readUInt32LE(40), 6);
    assert.equal(wave.length, 50);
  });
});

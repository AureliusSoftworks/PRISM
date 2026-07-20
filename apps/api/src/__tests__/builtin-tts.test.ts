import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRISM_BUILTIN_ENGLISH_VOICES,
} from "@localai/shared";
import {
  builtinEnglishAvailable,
  generateBuiltinEnglishWave,
  parseMacSystemVoiceList,
  parseMacSystemVoiceOptions,
  selectSystemVoice,
  systemEnglishGenerationSettings,
} from "../builtin-tts.ts";

describe("built-in English audio", () => {
  it("ships five stable, distinct PRISM voice identities", () => {
    assert.deepEqual(
      PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => voice.voiceId),
      ["voice-1", "voice-2", "voice-3", "voice-4", "voice-5"],
    );
    assert.equal(
      new Set(PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => voice.engineVoiceId)).size,
      5,
    );
  });

  it("parses installed macOS voices and exposes English choices", () => {
    const output = [
      "Fred                en_US    # Hello! My name is Fred.",
      "Bad News            en_US    # Hello! My name is Bad News.",
      "Alice               it_IT    # Ciao! Mi chiamo Alice.",
      "",
    ].join("\n");
    assert.deepEqual(parseMacSystemVoiceOptions(output), [
      { name: "Fred", locale: "en_US" },
      { name: "Bad News", locale: "en_US" },
      { name: "Alice", locale: "it_IT" },
    ]);
    assert.deepEqual(
      parseMacSystemVoiceList(output),
      ["Fred", "Bad News"]
    );
  });

  it("uses an explicitly selected installed voice and otherwise keeps the OS default", () => {
    const installed = ["Alex", "Samantha"];
    assert.equal(selectSystemVoice({
      platform: "darwin",
      voiceId: "voice-2",
      voiceName: "Samantha",
      installedVoices: installed,
    }), "Samantha");
    assert.equal(selectSystemVoice({
      platform: "darwin",
      voiceId: "voice-4",
      voiceName: null,
      installedVoices: installed,
    }), null);
  });

  it("keeps native synthesis neutral so browser Pace owns duration", () => {
    const fastProfile = {
      v: 1 as const,
      baseVoiceId: "voice-1" as const,
      pitch: 0,
      warmth: 0,
      pace: 1,
      lilt: 0,
    };
    assert.deepEqual(
      systemEnglishGenerationSettings({
        profile: fastProfile,
        platform: "darwin",
        installedVoices: ["Fred"],
      }),
      { voiceName: null, rate: 175, slotIndex: 0 }
    );
    assert.deepEqual(
      systemEnglishGenerationSettings({
        profile: fastProfile,
        platform: "win32",
        installedVoices: ["Microsoft Sam"],
      }),
      { voiceName: null, rate: 0, slotIndex: 0 }
    );
  });

  it("renders a real local PCM wave through the packaged model", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "Prism built-in voice test.",
      profile: {
        v: 1,
        baseVoiceId: "voice-1",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
    });
    assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
    assert.ok(wave.length > 44);
  });
});

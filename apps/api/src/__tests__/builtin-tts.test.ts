import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MACOS_CLASSIC_VOICE_BY_ID,
  WINDOWS_CLASSIC_VOICE_CANDIDATES_BY_ID,
  builtinEnglishAvailable,
  generateBuiltinEnglishWave,
  parseMacSystemVoiceList,
  selectSystemVoice,
  systemEnglishGenerationSettings,
} from "../builtin-tts.ts";

const voiceIds = ["voice-1", "voice-2", "voice-3", "voice-4", "voice-5"] as const;

describe("system English audio", () => {
  it("maps all five slots to genuinely different classic macOS voices", () => {
    assert.deepEqual(
      voiceIds.map((voiceId) => MACOS_CLASSIC_VOICE_BY_ID[voiceId]),
      ["Fred", "Zarvox", "Trinoids", "Junior", "Ralph"]
    );
    assert.equal(new Set(Object.values(MACOS_CLASSIC_VOICE_BY_ID)).size, 5);
  });

  it("prefers legacy Windows voice identities before modern installed fallbacks", () => {
    assert.equal(WINDOWS_CLASSIC_VOICE_CANDIDATES_BY_ID["voice-1"][0], "Microsoft Sam");
    assert.equal(WINDOWS_CLASSIC_VOICE_CANDIDATES_BY_ID["voice-2"][0], "Microsoft Mike");
    assert.equal(WINDOWS_CLASSIC_VOICE_CANDIDATES_BY_ID["voice-3"][0], "Microsoft Mary");
  });

  it("parses multi-word macOS voice names without locale or sample text", () => {
    assert.deepEqual(
      parseMacSystemVoiceList([
        "Fred                en_US    # Hello! My name is Fred.",
        "Bad News            en_US    # Hello! My name is Bad News.",
        "Zarvox              en_US    # Hello! My name is Zarvox.",
        "",
      ].join("\n")),
      ["Fred", "Bad News", "Zarvox"]
    );
  });

  it("uses the requested native identity when installed and a stable slot fallback otherwise", () => {
    const installed = ["Fred", "Zarvox", "Trinoids", "Junior", "Ralph"];
    assert.equal(selectSystemVoice({
      platform: "darwin",
      voiceId: "voice-2",
      installedVoices: installed,
    }), "Zarvox");
    assert.equal(selectSystemVoice({
      platform: "darwin",
      voiceId: "voice-4",
      installedVoices: ["Alex", "Samantha"],
    }), "Samantha");
  });

  it("maps portable pace into each operating system's safe native range", () => {
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
      { voiceName: "Fred", rate: 230, slotIndex: 0 }
    );
    assert.deepEqual(
      systemEnglishGenerationSettings({
        profile: fastProfile,
        platform: "win32",
        installedVoices: ["Microsoft Sam"],
      }),
      { voiceName: "Microsoft Sam", rate: 4, slotIndex: 0 }
    );
  });

  it("renders a real local PCM wave through the host voice engine", {
    skip: process.platform !== "darwin" || !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "Prism system voice test.",
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

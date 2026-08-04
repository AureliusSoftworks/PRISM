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
import { protectedSpeechRanges } from "../builtin-tts-runtime.ts";

describe("built-in English audio", () => {
  it("ships 28 stable, distinct PRISM voice identities", () => {
    assert.deepEqual(
      PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => voice.voiceId),
      Array.from({ length: 28 }, (_, index) => `voice-${index + 1}`),
    );
    assert.equal(
      new Set(PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => voice.engineVoiceId)).size,
      PRISM_BUILTIN_ENGLISH_VOICES.length,
    );
    assert.ok(
      PRISM_BUILTIN_ENGLISH_VOICES.every(
        (voice) =>
          voice.presentation === "feminine" ||
          voice.presentation === "masculine",
      ),
    );
  });

  it("protects authored pronunciations, initialisms, and code-like tokens", () => {
    assert.deepEqual(
      protectedSpeechRanges(
        "Dr. Icarus uses PRISM with GPT-5 and path/to_file.",
        ["Dr. Icarus"],
      ),
      [
        { start: 0, end: 10 },
        { start: 16, end: 21 },
        { start: 27, end: 32 },
        { start: 37, end: 49 },
      ],
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

  it("keeps double-digit voice identities aligned with their pack slot", () => {
    assert.deepEqual(
      systemEnglishGenerationSettings({
        profile: {
          v: 1,
          baseVoiceId: "voice-12",
          pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
        },
        platform: "win32",
        installedVoices: [],
      }),
      { voiceName: null, rate: 0, slotIndex: 11 },
    );
  });

  it("renders an added PRISM identity through the packaged local model", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "Prism built-in voice test.",
      profile: {
        v: 1,
        baseVoiceId: "voice-12",
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

  it("renders a Speechprint through the pinned phoneme token interface", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "This river carries a very clear voice.",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-3",
        speechprintInfluence: "indian-english",
        speechprintStrength: "balanced",
        speechprintVariationSeed: "runtime-qualification",
      },
    });
    assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
    assert.ok(wave.length > 44);
  });

  it("renders British phonemes through an American portable voice", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "Ready for a glass of water after class?",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        accentLocale: "en-US",
        pronunciationBase: "en-GB",
      },
    });
    assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
    assert.ok(wave.length > 44);
  });

  it("renders recent Speechprints through the pinned token interface", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    for (const influence of [
      "french-influenced-english",
      "german-influenced-english",
      "russian-influenced-english",
      "italian-influenced-english",
      "australian-english",
      "canadian-english",
    ] as const) {
      const wave = await generateBuiltinEnglishWave({
        text: "This warm river road has a very clear ending.",
        profile: {
          v: 2,
          enabled: true,
          baseVoiceId: "voice-3",
          speechprintInfluence: influence,
          speechprintStrength: "strong",
          speechprintVariationSeed: `${influence}-qualification`,
        },
      });
      assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
      assert.ok(wave.length > 44);
    }
  });

  it("keeps API-side timers moving during a representative local reply", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    let timerTicks = 0;
    const timer = setInterval(() => {
      timerTicks += 1;
    }, 10);
    try {
      const wave = await generateBuiltinEnglishWave({
        text: "A local voice reply should never freeze chat, health checks, or the rest of Prism while its audio is being prepared. The dedicated speech process keeps the main API responsive even for a complete conversational paragraph with several sentences.",
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
      assert.ok(
        timerTicks >= 5,
        `API timer advanced only ${timerTicks} times during local speech`,
      );
    } finally {
      clearInterval(timer);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
  PRISM_BUILTIN_ENGLISH_VOICES,
  applyLocalVoiceSpeechprintToIpa,
  resolveVoiceAccentField,
  VOICE_ACCENT_MAP_ANCHORS,
} from "@localai/shared";
import {
  builtinEnglishAvailable,
  generateBuiltinEnglishWave,
  isPlayablePcmWave,
  parseMacSystemVoiceList,
  parseMacSystemVoiceOptions,
  requirePlayablePrismVoicePackWave,
  selectSystemVoice,
  systemEnglishGenerationSettings,
} from "../builtin-tts.ts";
import {
  preparePrismVoicePackPronunciation,
  protectedSpeechRanges,
} from "../builtin-tts-runtime.ts";
import { phonemize } from "phonemizer";

function pcmWave(
  dataBytes: number,
  audioFormat = 1,
  options: { silent?: boolean } = {},
): Buffer {
  const sampleRate = 24_000;
  const bitsPerSample = audioFormat === 3 ? 32 : 16;
  const blockAlign = bitsPerSample / 8;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(audioFormat, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * blockAlign, 28);
  wave.writeUInt16LE(blockAlign, 32);
  wave.writeUInt16LE(bitsPerSample, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataBytes, 40);
  if (!options.silent && dataBytes >= blockAlign) {
    if (audioFormat === 3) wave.writeFloatLE(0.25, 44);
    else wave.writeInt16LE(4_096, 44);
  }
  return wave;
}

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

  it("maps Peter Piper bidirectionally without changing text or voice identity", async () => {
    const sourceText = "Peter Piper picked a peck of pickled peppers.";
    const plan = (
      baseVoiceId: "voice-1" | "voice-4",
      accentDefinitionId: "american-english" | "british-english",
      stalePronunciationBase: "en-US" | "en-GB",
    ) =>
      preparePrismVoicePackPronunciation({
        text: sourceText,
        profile: {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
          baseVoiceId,
          accentDefinitionId,
          pronunciationBase: stalePronunciationBase,
        },
      });
    const [britishTarget, americanTarget, nativeBritish, nativeAmerican] =
      await Promise.all([
        plan("voice-1", "british-english", "en-US"),
        plan("voice-4", "american-english", "en-GB"),
        plan("voice-4", "british-english", "en-US"),
        plan("voice-1", "american-english", "en-GB"),
      ]);

    assert.equal(britishTarget.sourceText, sourceText);
    assert.equal(americanTarget.sourceText, sourceText);
    assert.equal(nativeBritish.sourceText, sourceText);
    assert.equal(nativeAmerican.sourceText, sourceText);
    assert.equal(britishTarget.engineVoiceId, "af_heart");
    assert.equal(americanTarget.engineVoiceId, "bf_emma");
    assert.equal(britishTarget.voiceLocale, "en-US");
    assert.equal(americanTarget.voiceLocale, "en-GB");
    assert.equal(britishTarget.targetLocale, "en-GB");
    assert.equal(americanTarget.targetLocale, "en-US");
    assert.equal(
      britishTarget.targetIpa,
      "pˈiːtə pˈaɪpə pˈɪkt ɐ pˈɛk ɒv pˈɪkəld pˈɛpəz",
    );
    assert.equal(
      americanTarget.targetIpa,
      "pˈiːɾəɹ pˈaɪpəɹ pˈɪkt ɐ pˈɛk ʌv pˈɪkəld pˈɛpəɹz",
    );
    assert.equal(nativeBritish.targetIpa, britishTarget.targetIpa);
    assert.equal(nativeAmerican.targetIpa, americanTarget.targetIpa);
    assert.notEqual(britishTarget.targetIpa, americanTarget.targetIpa);
  });

  it("projects a saved Cockney pin deterministically without changing text or timbre", async () => {
    const london = VOICE_ACCENT_MAP_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "cockney-english",
    );
    assert.ok(london);
    const sourceText = "This thoughtful river runs far from home.";
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      baseVoiceId: "voice-1" as const,
      accentDefinitionId: "cockney-english",
      pronunciationBase: "en-GB" as const,
      pronunciationMapPoint: london.point,
      speechprintInfluence: "cockney-english" as const,
      speechprintStrength: "balanced" as const,
      speechprintVariationSeed: "cockney-runtime",
    };
    const first = await preparePrismVoicePackPronunciation({
      text: sourceText,
      profile,
    });
    const second = await preparePrismVoicePackPronunciation({
      text: sourceText,
      profile,
    });
    const field = resolveVoiceAccentField({
      point: profile.pronunciationMapPoint,
      accentDefinitionId: profile.accentDefinitionId,
      pronunciationBase: profile.pronunciationBase,
      speechprintInfluence: profile.speechprintInfluence,
    });
    assert.deepEqual(second, first);
    assert.deepEqual(
      field.layers.map((layer) => [layer.accentDefinitionId, layer.weight]),
      [["cockney-english", 1]],
    );
    assert.equal(first.sourceText, sourceText);
    assert.equal(first.engineVoiceId, "af_heart");
    assert.equal(first.voiceLocale, "en-US");
    assert.equal(first.targetLocale, "en-GB");
    assert.match(first.targetIpa ?? "", /f/u);
  });

  it("projects an unnamed point through the deterministic two-anchor Local field", async () => {
    const newYork = VOICE_ACCENT_MAP_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "new-york-english",
    );
    const newJersey = VOICE_ACCENT_MAP_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "new-jersey-english",
    );
    assert.ok(newYork && newJersey);
    const pronunciationMapPoint = {
      x: (newYork.point.x + newJersey.point.x) / 2,
      y: (newYork.point.y + newJersey.point.y) / 2,
    };
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      baseVoiceId: "voice-1" as const,
      accentDefinitionId: null,
      pronunciationMapPoint,
      pronunciationBase: "en-US" as const,
      speechprintInfluence: "none" as const,
      speechprintVariationSeed: "ny-nj-continuum",
    };
    const field = resolveVoiceAccentField({
      point: pronunciationMapPoint,
      accentDefinitionId: null,
      pronunciationBase: "en-US",
      speechprintInfluence: "none",
    });
    const [first, second] = await Promise.all([
      preparePrismVoicePackPronunciation({ text: "The bird crossed the harbor.", profile }),
      preparePrismVoicePackPronunciation({ text: "The bird crossed the harbor.", profile }),
    ]);

    assert.deepEqual(
      field.layers.map((layer) => layer.accentDefinitionId),
      ["new-york-english", "new-jersey-english"],
    );
    assert.ok(
      field.layers.every((layer) => Math.abs(layer.weight - 0.5) < 0.001),
    );
    assert.deepEqual(second, first);
    assert.equal(first.sourceText, "The bird crossed the harbor.");
    assert.equal(first.targetLocale, "en-US");
    assert.ok(first.targetIpa);
  });

  it("maps the tuned PRISM-zikkv Cockney sample exactly at shared runtime strength", async () => {
    const sourceText = "Vincent went to get a bottle of water";
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      baseVoiceId: "voice-1" as const,
      accentDefinitionId: "cockney-english",
      pronunciationBase: "en-GB" as const,
      speechprintInfluence: "cockney-english" as const,
      speechprintStrength: "balanced" as const,
      speechprintVariationSeed: "zikkv-cockney",
    };
    const expectedIpa = "vˈiːnsɪnʔ weɪnʔ tə ɡɛʔ ə bˈɒʔo ə wˈɔːʔə";
    const [plan, sharedProjection] = await Promise.all([
      preparePrismVoicePackPronunciation({
        text: sourceText,
        profile,
      }),
      (async () => {
        const sourceIpa = (await phonemize(sourceText, "en")).join(" ").trim();
        return applyLocalVoiceSpeechprintToIpa({
          ipa: sourceIpa,
          speechprint: {
            influence: "cockney-english",
            strength: "balanced",
            variationSeed: "zikkv-cockney",
          },
        });
      })(),
    ]);

    assert.equal(plan.targetIpa, expectedIpa);
    assert.equal(plan.targetIpa, sharedProjection.ipa);
    assert.equal(plan.targetLocale, "en-GB");
    assert.equal(plan.voiceLocale, "en-US");
  });

  it("enforces hard American Rs on a stubborn British base voice", async () => {
    const plan = await preparePrismVoicePackPronunciation({
      text: "Her early birthday work turned out first.",
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        baseVoiceId: "voice-4",
        accentDefinitionId: "american-english",
      },
    });
    assert.equal(plan.voiceLocale, "en-GB");
    assert.equal(plan.targetLocale, "en-US");
    // Every NURSE vowel carries an explicit ɹ token the voice cannot skip;
    // none of espeak's non-rhotic spellings (ɜː, ɚ, ːɹ) survive.
    assert.equal(
      plan.targetIpa,
      "hɜɹ ˈɜɹli bˈɜɹθdeɪ wˈɜɹk tˈɜɹnd ˈaʊt fˈɜɹst",
    );
    assert.doesNotMatch(plan.targetIpa ?? "", /ɜː|ɚ|ːɹ/u);
  });

  it("keeps regional American pins on the rhotic en-US base for British voices", async () => {
    const plan = await preparePrismVoicePackPronunciation({
      text: "Park the car forever.",
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        baseVoiceId: "voice-4",
        accentDefinitionId: "texas-english",
        // A stale saved base must not drag a Texas pin back to en-GB.
        pronunciationBase: "en-GB",
      },
    });
    assert.equal(plan.voiceLocale, "en-GB");
    assert.equal(plan.targetLocale, "en-US");
    assert.equal(plan.targetIpa, "pˈɑɹk ðə kˈɑɹ fəɹˈɛvəɹ");
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

  it("accepts playable PCM and rejects header-only native speech output", () => {
    assert.equal(isPlayablePcmWave(pcmWave(2)), true);
    assert.equal(isPlayablePcmWave(pcmWave(4, 3)), true);
    assert.equal(isPlayablePcmWave(pcmWave(0)), false);
    assert.equal(isPlayablePcmWave(pcmWave(2, 6)), false);

    const truncated = pcmWave(2).subarray(0, 44);
    assert.equal(isPlayablePcmWave(truncated), false);
    assert.equal(
      isPlayablePcmWave(pcmWave(4_800, 1, { silent: true })),
      false,
    );
    assert.equal(
      isPlayablePcmWave(pcmWave(4_800, 3, { silent: true })),
      false,
    );
    const quantizationDust = pcmWave(4_800, 1, { silent: true });
    quantizationDust.writeInt16LE(1, 44);
    assert.equal(isPlayablePcmWave(quantizationDust), false);
    const nearSilentFloat = pcmWave(4_800, 3, { silent: true });
    nearSilentFloat.writeFloatLE(1e-8, 44);
    assert.equal(isPlayablePcmWave(nearSilentFloat), false);
  });

  it("rejects header-only portable voice output before it reaches playback", () => {
    assert.throws(
      () => requirePlayablePrismVoicePackWave(pcmWave(0)),
      /PRISM Voice Pack returned no playable PCM audio/,
    );
    const playable = pcmWave(2);
    assert.equal(requirePlayablePrismVoicePackWave(playable), playable);
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

  it("falls back to playable portable audio when a system voice is unusable", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "A broken device voice must not silence Prism.",
      profile: {
        v: 1,
        baseVoiceId: "voice-1",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
        systemVoiceName: "PRISM missing system voice fixture",
      },
      allowOperatingSystemVoices: true,
    });
    assert.equal(isPlayablePcmWave(wave), true);
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

  it("renders a delivery mood through the blended style row without an accent pin", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "The morning report is ready.",
      deliveryMood: "guarded",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-4",
      },
    });
    assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
    assert.ok(wave.length > 44);
  });

  it("renders a hard-R American pin on a British voice through the blended style row", {
    skip: !builtinEnglishAvailable(),
  }, async () => {
    const wave = await generateBuiltinEnglishWave({
      text: "Her early work turned out first.",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-4",
        accentDefinitionId: "american-english",
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
      "new-york-english",
      "southern-us-english",
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

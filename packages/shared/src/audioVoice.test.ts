import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOT_VOICE_TEXTURE_RECIPES,
  BOT_VOICE_EQ_TILT_DB_MAX,
  BOT_AVATAR_SFX_DEFAULT_VOLUME,
  BOT_AVATAR_SFX_MAX_BYTES,
  ELEVENLABS_VOICE_DIRECTION_BY_MOOD,
  VOICE_DELIVERY_RATE_BY_MOOD,
  applyVoiceDeliveryMoodToProfile,
  applyBotNamePronunciations,
  expandSpeechAbbreviations,
  expandSpeechText,
  projectSpeechAbbreviations,
  projectSpeechText,
  builtinAccentRealizationBlend,
  builtinMelodicityRealizationBlend,
  builtinMoodRealizationBlend,
  botAudioVoiceProfileForFeelLane,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V3,
  DEFAULT_VOICE_EFFECT,
  PRISM_BUILTIN_ENGLISH_VOICES,
  VOICE_EFFECT_DESCRIPTIONS,
  VOICE_EFFECT_LABELS,
  botVoiceTextureIsModified,
  elevenLabsVoiceDirectionForMood,
  expectedVoicePlaybackDurationMs,
  localVoicePronunciationOverrideIsActive,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileForSynthesisV1,
  migrateLegacyAccentPronunciationEnginesV1,
  botAudioVoiceProfileHasExplicitAccentPronunciationSetting,
  normalizeBotAudioVoiceProfileV3,
  normalizeBotAvatarSfxV1,
  normalizeBotNamePronunciation,
  normalizeBotVoiceTexture,
  normalizeEnglishVoiceEngine,
  normalizeElevenLabsVoiceDirection,
  normalizeElevenLabsVoiceEffect,
  normalizeVoiceEffect,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeSpeechTypeVoiceMode,
  resolveBotAudioVoiceProfileV1,
  resolveBotPronunciationMapPointV1,
  resolveLocalVoicePronunciationLocale,
  normalizeVoiceMode,
  normalizeWhodunnitTextVoiceMode,
  resolveVoicePlaybackTransform,
  resolveBotVoiceCharacter,
  parseStoredBotAudioVoiceProfileV1,
  parseStoredBotAudioVoiceProfileV3,
  serializeBotAudioVoiceProfileV1,
} from "./audioVoice.ts";

describe("audio voice normalization", () => {
  it("leads the named picker with the five Prism Originals", () => {
    const pickerOrder = [...PRISM_BUILTIN_ENGLISH_VOICES]
      .sort((left, right) => left.selectionOrder - right.selectionOrder)
      .map((voice) => voice.name);
    assert.deepEqual(pickerOrder.slice(0, 5), [
      "Pia",
      "Rowan",
      "Iris",
      "Sol",
      "Mira",
    ]);
    assert.equal(new Set(pickerOrder).size, pickerOrder.length);
    assert.ok(
      PRISM_BUILTIN_ENGLISH_VOICES.every(
        (voice) => !/American|British/iu.test(voice.character),
      ),
    );
  });

  it("keeps every PRISM voice embedding in the packaged desktop runtime", () => {
    const stagingSource = readFileSync(
      new URL("../../../scripts/stage-desktop-runtime.mjs", import.meta.url),
      "utf8",
    );
    const whitelist = stagingSource.match(
      /const includedPrismVoiceFiles = new Set\(\[([\s\S]*?)\]\);/,
    );
    assert.ok(whitelist, "desktop voice embedding whitelist is missing");
    const stagedVoiceFiles = [...whitelist[1].matchAll(/"([^"]+\.bin)"/g)].map(
      (match) => match[1],
    );

    assert.deepEqual(
      new Set(stagedVoiceFiles),
      new Set(
        PRISM_BUILTIN_ENGLISH_VOICES.map(
          (voice) => `${voice.engineVoiceId}.bin`,
        ),
      ),
    );
  });

  it("normalizes and applies bot name pronunciations without changing visible-name boundaries", () => {
    assert.equal(normalizeBotNamePronunciation("  Light   Yah-gah-mee  "), "Light Yah-gah-mee");
    assert.equal(
      applyBotNamePronunciations(
        "Light Yagami asked Light for help; Yagamilight stays written.",
        [
          { name: "Light", namePronunciation: "Lite" },
          { name: "Light Yagami", name_pronunciation: "Light Yah-gah-mee" },
        ],
      ),
      "Light Yah-gah-mee asked Lite for help; Yagamilight stays written.",
    );
  });

  it("expands common name-led titles only in the speech projection", () => {
    const source =
      'Mr. Hale, Mrs Hale, Ms. Rivera, Mx Quinn, Dr. Patel, Prof Ng, Rev. Jones, Gov Lee, Sen. Cruz, Rep Adams, Amb. Okafor, Atty Chen, Det. Benson, Insp Morse, Supt. Chalmers, Fr Brown, Adm. Nimitz, Gen Leia, Lt. Uhura, Maj Kira, Capt. O\'Brien, Cmdr Data, Cdr. Sisko, Col Mustard, Brig. Organa, Sgt Pepper, Cpl. Hicks, Pvt Ryan, Ofc. Diaz, Dep Garcia, Dir. Vance, Pres Snow, Hon. Judy, Asst Prof. Kim, and Assoc. Prof van Helsing.';
    assert.equal(
      expandSpeechAbbreviations(source),
      'Mister Hale, Missus Hale, Miss Rivera, Mix Quinn, Doctor Patel, Professor Ng, Reverend Jones, Governor Lee, Senator Cruz, Representative Adams, Ambassador Okafor, Attorney Chen, Detective Benson, Inspector Morse, Superintendent Chalmers, Father Brown, Admiral Nimitz, General Leia, Lieutenant Uhura, Major Kira, Captain O\'Brien, Commander Data, Commander Sisko, Colonel Mustard, Brigadier Organa, Sergeant Pepper, Corporal Hicks, Private Ryan, Officer Diaz, Deputy Garcia, Director Vance, President Snow, Honorable Judy, Assistant Professor Kim, and Associate Professor van Helsing.',
    );
    assert.match(source, /Ms\. Rivera/u);
  });

  it("keeps case variants, embedded words, and ambiguous abbreviations written", () => {
    assert.equal(
      expandSpeechAbbreviations(
        "MS. Rivera logged 20 ms. in St. Louis; caption and Capt. 7 remain.",
      ),
      "MS. Rivera logged 20 ms. in St. Louis; caption and Capt. 7 remain.",
    );
  });

  it("layers title expansion after bot-name pronunciations for every speech caller", () => {
    const named = applyBotNamePronunciations(
      "Ms. Icarus spoke with Capt. Chen.",
      [{ name: "Icarus", namePronunciation: "Eye-car-us" }],
    );
    assert.equal(
      expandSpeechAbbreviations(named),
      "Miss Eye-car-us spoke with Captain Chen.",
    );
  });

  it("keeps source-to-synthesis segments for Premium alignment projection", () => {
    const projection = projectSpeechAbbreviations(
      "Ms. Rivera called Capt Chen.",
    );
    assert.equal(projection.sourceText, "Ms. Rivera called Capt Chen.");
    assert.equal(projection.synthesisText, "Miss Rivera called Captain Chen.");
    assert.equal(projection.changed, true);
    assert.deepEqual(
      projection.segments.filter(
        (segment) => segment.synthesisText !== segment.sourceText,
      ),
      [
        { synthesisText: "Miss", sourceText: "Ms." },
        { synthesisText: "Captain", sourceText: "Capt" },
      ],
    );
  });

  it("speaks exact 12-hour clock times naturally without changing precision", () => {
    assert.equal(
      expandSpeechText(
        "10:09 AM; 1:10 pm; 12:00 PM; 12:00 a.m.; 5:00 PM; 9:01 p.m.",
      ),
      "ten oh nine in the morning; one ten in the afternoon; noon; midnight; five in the evening; nine oh one at night",
    );
    assert.equal(
      expandSpeechAbbreviations("Dr. Rivera arrived at 09:05 AM"),
      "Doctor Rivera arrived at nine oh five in the morning",
    );
  });

  it("keeps approximate testimony and non-time colon syntax untouched", () => {
    const source =
      "A little after ten in the morning; ratio 10:09; v10:09 AM; 25:09 AM; https://example.test/10:09.";
    assert.equal(expandSpeechText(source), source);
  });

  it("keeps source clock text in alignment projection segments", () => {
    const projection = projectSpeechText("Meet Ms. Rivera at 10:09 AM.");
    assert.equal(
      projection.synthesisText,
      "Meet Miss Rivera at ten oh nine in the morning",
    );
    assert.equal(projection.sourceText, "Meet Ms. Rivera at 10:09 AM.");
    assert.deepEqual(
      projection.segments.filter(
        (segment) => segment.synthesisText !== segment.sourceText,
      ),
      [
        { synthesisText: "Miss", sourceText: "Ms." },
        {
          synthesisText: "ten oh nine in the morning",
          sourceText: "10:09 AM.",
        },
      ],
    );
  });

  it("uses self-referral only for the speaking bot and falls back to its written name", () => {
    const entries = [
      {
        id: "icarus",
        name: "Dr. Icarus",
        namePronunciation: "Doctor Eye-car-us",
        selfReferral: "Icarus",
      },
      {
        id: "light",
        name: "Light Yagami",
        namePronunciation: "Light Yah-gah-mee",
      },
    ];
    assert.equal(
      applyBotNamePronunciations(
        "Dr. Icarus asked Light Yagami for help.",
        entries,
        "icarus",
      ),
      "Icarus asked Light Yah-gah-mee for help.",
    );
    assert.equal(
      applyBotNamePronunciations(
        "Dr. Icarus asked Light Yagami for help.",
        [{ ...entries[0], selfReferral: "   " }, entries[1]],
        "icarus",
      ),
      "Dr. Icarus asked Light Yah-gah-mee for help.",
    );
  });

  it("keeps only supported modes and engines", () => {
    assert.equal(normalizeVoiceMode("english"), "english");
    assert.equal(normalizeVoiceMode("babble"), "babble");
    assert.equal(normalizeVoiceMode("bottish"), "bottish");
    assert.equal(normalizeVoiceMode("robot"), "mute");
    assert.equal(normalizeSpeechTypeVoiceMode("mute"), "english");
    assert.equal(normalizeSpeechTypeVoiceMode("babble"), "babble");
    assert.equal(normalizeSpeechTypeVoiceMode("robot", "bottish"), "bottish");
    assert.equal(normalizeWhodunnitTextVoiceMode("off"), "off");
    assert.equal(normalizeWhodunnitTextVoiceMode("babble"), "babble");
    assert.equal(normalizeWhodunnitTextVoiceMode("bottish"), "bottish");
    assert.equal(normalizeWhodunnitTextVoiceMode("robot"), "babble");
    assert.equal(normalizeWhodunnitTextVoiceMode(undefined), "babble");
    assert.equal(normalizeWhodunnitTextVoiceMode(undefined, "bottish"), "bottish");
    assert.equal(normalizeEnglishVoiceEngine("elevenlabs"), "elevenlabs");
    assert.equal(normalizeEnglishVoiceEngine("remote"), "builtin");
  });

  it("layers a bounded app-wide mood rate over the authored voice pace", () => {
    assert.deepEqual(VOICE_DELIVERY_RATE_BY_MOOD, {
      joyful: 1.18,
      warm: 1.12,
      neutral: 1.08,
      guarded: 1,
      strained: 0.94,
    });
    assert.equal(
      applyVoiceDeliveryMoodToProfile(
        { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
        "joyful",
      ).pace,
      0.75,
    );
    assert.equal(
      applyVoiceDeliveryMoodToProfile(
        { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
        "strained",
      ).pace,
      -0.25,
    );
    assert.equal(
      applyVoiceDeliveryMoodToProfile(
        { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 1, lilt: 0 },
        "joyful",
      ).pace,
      1,
    );
  });

  it("maps only non-neutral moods into sparse Eleven v3 directions", () => {
    assert.deepEqual(ELEVENLABS_VOICE_DIRECTION_BY_MOOD, {
      joyful: "delighted",
      warm: "warmly",
      guarded: "reserved",
      strained: "strained",
    });
    assert.equal(elevenLabsVoiceDirectionForMood("joyful"), "delighted");
    assert.equal(elevenLabsVoiceDirectionForMood("warm"), "warmly");
    assert.equal(elevenLabsVoiceDirectionForMood("guarded"), "reserved");
    assert.equal(elevenLabsVoiceDirectionForMood("strained"), "strained");
    assert.equal(elevenLabsVoiceDirectionForMood("neutral"), null);
    assert.equal(elevenLabsVoiceDirectionForMood("dramatic"), null);
    assert.equal(elevenLabsVoiceDirectionForMood(undefined), null);
  });

  it("keeps pitch independent from the single playback tempo contract", () => {
    const profile = applyVoiceDeliveryMoodToProfile(
      {
        v: 1,
        baseVoiceId: "voice-1",
        pitch: -0.75,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
      "neutral",
    );
    assert.deepEqual(resolveVoicePlaybackTransform(profile), {
      tempo: 1.08,
      pitchCents: -487,
    });
    assert.equal(
      resolveVoicePlaybackTransform({ ...profile, pitch: 1 }).tempo,
      resolveVoicePlaybackTransform({ ...profile, pitch: -1 }).tempo,
    );
    assert.equal(
      expectedVoicePlaybackDurationMs(10_000, { ...profile, pitch: 1 }),
      expectedVoicePlaybackDurationMs(10_000, { ...profile, pitch: -1 }),
    );
  });
  it("uses a deterministic portable profile and clamps controls", () => {
    assert.deepEqual(normalizeBotAudioVoiceProfileV1(undefined), {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      premiumPitch: 0,
      premiumPace: 0,
      premiumLilt: 0,
    });
    assert.deepEqual(normalizeBotAudioVoiceProfileV1({ v: 1, baseVoiceId: "voice-4", pitch: 4, warmth: -4, pace: ".125", lilt: 0.2, signal: 4 }), {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      elevenLabsEffect: "chorus",
      pitch: 1,
      warmth: -1,
      openness: 0,
      weight: 0,
      brightness: 0,
      resonance: 0,
      localEnginePreference: "inherit",
      localVoiceSource: "portable",
      localLaughDelimiter: "-",
      accentLocale: "en-GB",
      pronunciationBase: "follow-voice",
      accentMode: "prefer-genuine",
      speechprintInfluence: "none",
      ttsPronunciationEnabled: false,
      premiumLaughEnabled: false,
      premiumPronunciationEnabled: false,
      speechprintStrength: "balanced",
      speechprintVariationSeed: "natural-v1",
      pace: 0.125,
      lilt: 0.2,
      premiumPitch: 0,
      premiumPace: 0.125,
      premiumLilt: 0.2,
      bottishTone: 1,
      corporality: 0.5,
      eqTilt: 0,
      gainDb: 0,
      volume: 1,
      texture: BOT_VOICE_TEXTURE_RECIPES.clean,
    });
    assert.equal(
      normalizeBotAudioVoiceProfileV1({ v: 2, baseVoiceId: "voice-12" })
        .baseVoiceId,
      "voice-12",
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({ v: 2, baseVoiceId: "voice-29" })
        .baseVoiceId,
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1.baseVoiceId,
    );
  });

  it("persists V3 with separate local, premium, and shared delivery profiles", () => {
    const v3 = normalizeBotAudioVoiceProfileV3({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-28",
      localEnginePreference: "voice-plus",
      accentLocale: "en-GB",
      pronunciationBase: "en-US",
      accentDefinitionId: "japanese-influenced-english",
      pronunciationMapPoint: { x: 0.28731, y: 0.29842 },
      openness: 0.35,
      weight: -0.4,
      resonance: 0.25,
      speechprintInfluence: "japanese-influenced-english",
      speechprintStrength: "light",
      speechprintVariationSeed: "voice-28-japanese",
      elevenLabsVoiceId: "premium-id",
      pace: 0.2,
    });
    assert.equal(v3.v, 3);
    assert.equal(v3.local.archetypeId, "voice-28");
    assert.equal(v3.local.enginePreference, "voice-plus");
    assert.deepEqual(v3.local.pronunciation, {
      base: "en-US",
      ttsPronunciationEnabled: false,
      accentDefinitionId: "japanese-influenced-english",
      mapPoint: { x: 0.28731, y: 0.29842 },
    });
    assert.equal(v3.local.tone.openness, 0.35);
    assert.deepEqual(v3.local.speechprint, {
      influence: "japanese-influenced-english",
      strength: "light",
      variationSeed: "voice-28-japanese",
    });
    assert.equal(v3.premium.voiceId, "premium-id");
    assert.equal(v3.premium.pronunciationEnabled, false);
    assert.equal(v3.local.tone.pace, 0.2);
    assert.equal(v3.premium.pace, 0.2);
    assert.equal(v3.delivery.pace, undefined);

    const serialized = serializeBotAudioVoiceProfileV1(v3);
    assert.equal(JSON.parse(serialized).v, 3);
    assert.deepEqual(parseStoredBotAudioVoiceProfileV3(serialized), v3);
    const compatible = parseStoredBotAudioVoiceProfileV1(serialized);
    assert.equal(compatible?.baseVoiceId, "voice-28");
    assert.equal(compatible?.localEnginePreference, "voice-plus");
    assert.equal(compatible?.pronunciationBase, "en-US");
    assert.equal(
      compatible?.accentDefinitionId,
      "japanese-influenced-english",
    );
    assert.deepEqual(compatible?.pronunciationMapPoint, {
      x: 0.28731,
      y: 0.29842,
    });
    assert.equal(compatible?.pace, 0.2);
    assert.equal(compatible?.premiumPace, 0.2);
  });

  it("normalizes accent IDs compatibly and lets Original clear them", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      accentDefinitionId: " German-Influenced-English ",
    });
    assert.equal(
      profile.accentDefinitionId,
      "german-influenced-english",
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1(
        { ...profile, accentDefinitionId: null },
        profile,
      ).accentDefinitionId,
      undefined,
    );
    const serialized = serializeBotAudioVoiceProfileV1(profile);
    assert.equal(
      JSON.parse(serialized).local.pronunciation.accentDefinitionId,
      "german-influenced-english",
    );
    assert.equal(
      parseStoredBotAudioVoiceProfileV1(serialized)?.accentDefinitionId,
      "german-influenced-english",
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        accentDefinitionId: "american-english",
      }).accentDefinitionId,
      "general-american-english",
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        accentDefinitionId: "british-english",
      }).accentDefinitionId,
      "modern-rp-english",
    );
  });

  it("migrates an enabled legacy map gate to independent engine gates and keeps disabled bots untouched", () => {
    const authoredLegacyAccent = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      accentDefinitionId: "irish-english",
      pronunciationMapPoint: { x: 0.42, y: 0.31 },
      speechprintInfluence: "irish-english",
      ttsPronunciationEnabled: undefined,
      premiumPronunciationEnabled: undefined,
    });
    assert.equal(authoredLegacyAccent.ttsPronunciationEnabled, true);
    assert.equal(authoredLegacyAccent.premiumPronunciationEnabled, true);

    const disabledLegacy = {
      ...authoredLegacyAccent,
      accentPronunciationEnabled: false,
    };
    assert.equal(
      migrateLegacyAccentPronunciationEnginesV1(disabledLegacy),
      null,
    );
    const migrated = migrateLegacyAccentPronunciationEnginesV1({
      ...authoredLegacyAccent,
      accentPronunciationEnabled: true,
      ttsPronunciationEnabled: undefined,
      premiumPronunciationEnabled: undefined,
    });
    assert.equal(migrated?.ttsPronunciationEnabled, true);
    assert.equal(migrated?.premiumPronunciationEnabled, true);
    const stored = parseStoredBotAudioVoiceProfileV1(
      serializeBotAudioVoiceProfileV1({
        ...authoredLegacyAccent,
        ttsPronunciationEnabled: false,
        premiumPronunciationEnabled: true,
      }),
    );
    assert.equal(stored?.ttsPronunciationEnabled, false);
    assert.equal(stored?.premiumPronunciationEnabled, true);
    assert.equal(stored?.accentDefinitionId, "irish-english");
    assert.deepEqual(stored?.pronunciationMapPoint, { x: 0.42, y: 0.31 });

    const ttsSynthesis = normalizeBotAudioVoiceProfileForSynthesisV1(
      stored,
      "tts",
    );
    assert.equal(ttsSynthesis.accentDefinitionId, undefined);
    const premiumSynthesis = normalizeBotAudioVoiceProfileForSynthesisV1(
      stored,
      "premium",
    );
    assert.equal(premiumSynthesis.accentDefinitionId, "irish-english");
    assert.equal(migrateLegacyAccentPronunciationEnginesV1(migrated), null);
    assert.equal(botAudioVoiceProfileHasExplicitAccentPronunciationSetting(stored), true);
    assert.equal(
      botAudioVoiceProfileHasExplicitAccentPronunciationSetting(
        JSON.stringify({
          v: 3,
          local: {
            pronunciation: { accentPronunciationEnabled: false },
          },
        }),
      ),
      true,
    );
    assert.equal(
      botAudioVoiceProfileHasExplicitAccentPronunciationSetting({
        v: 2,
        accentDefinitionId: "irish-english",
      }),
      false,
    );
  });

  it("keeps independent Local and Premium Feel after V3 round-trip", () => {
    const v3 = normalizeBotAudioVoiceProfileV3({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      pitch: 0.4,
      pace: -0.2,
      lilt: 0.1,
      premiumPitch: -0.35,
      premiumPace: 0.55,
      premiumLilt: -0.25,
    });
    assert.equal(v3.local.tone.pitch, 0.4);
    assert.equal(v3.local.tone.pace, -0.2);
    assert.equal(v3.local.tone.lilt, 0.1);
    assert.equal(v3.premium.pitch, -0.35);
    assert.equal(v3.premium.pace, 0.55);
    assert.equal(v3.premium.lilt, -0.25);

    const compatible = parseStoredBotAudioVoiceProfileV1(
      serializeBotAudioVoiceProfileV1(v3),
    );
    assert.equal(compatible?.pitch, 0.4);
    assert.equal(compatible?.premiumPitch, -0.35);
    assert.equal(compatible?.premiumPace, 0.55);
    assert.equal(
      botAudioVoiceProfileForFeelLane(compatible!, "premium").pitch,
      -0.35,
    );
    assert.equal(
      botAudioVoiceProfileForFeelLane(compatible!, "premium").pace,
      0.55,
    );
  });

  it("migrates legacy shared delivery Feel onto both Local and Premium lanes", () => {
    const { pace: _pace, lilt: _lilt, ...legacyTone } =
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V3.local.tone;
    const compatible = normalizeBotAudioVoiceProfileV1({
      v: 3,
      enabled: true,
      local: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V3.local,
        tone: {
          ...legacyTone,
          pitch: 0.2,
        },
      },
      // Legacy Premium identity had no per-lane Feel keys yet.
      premium: { voiceId: "premium-id" },
      delivery: {
        effect: "prism",
        pace: 0.3,
        lilt: -0.15,
        volume: 1,
        texture: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1.texture,
      },
      bottishTone: 0.45,
    });
    assert.equal(compatible.pitch, 0.2);
    assert.equal(compatible.pace, 0.3);
    assert.equal(compatible.lilt, -0.15);
    assert.equal(compatible.premiumPitch, 0);
    assert.equal(compatible.premiumPace, 0.3);
    assert.equal(compatible.premiumLilt, -0.15);
  });

  it("clamps Accent Map positions without replacing their free placement", () => {
    assert.deepEqual(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        pronunciationMapPoint: { x: -0.25, y: 0.73129 },
      }).pronunciationMapPoint,
      { x: 0, y: 0.73129 },
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1(
        {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          pronunciationMapPoint: null,
        },
        {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          pronunciationMapPoint: { x: 0.3, y: 0.4 },
        },
      ).pronunciationMapPoint,
      undefined,
    );
  });

  it("resolves only an explicitly persisted Accent Map pin for Power dialects", () => {
    assert.equal(resolveBotPronunciationMapPointV1(null, null), null);
    assert.deepEqual(
      resolveBotPronunciationMapPointV1(
        JSON.stringify({
          v: 3,
          pronunciationMapPoint: { x: -0.2, y: 0.74 },
        }),
        null,
      ),
      { x: 0, y: 0.74 },
    );
    assert.deepEqual(
      resolveBotPronunciationMapPointV1(
        { v: 3, pronunciationMapPoint: { x: 0.2, y: 0.3 } },
        { v: 3, pronunciationMapPoint: { x: 0.8, y: 0.9 } },
      ),
      { x: 0.8, y: 0.9 },
    );
  });

  it("realizes cross-region accents as a group-mean translation that keeps voices distinct", () => {
    const AMERICAN_MASCULINE = [
      "am_michael",
      "am_fenrir",
      "am_puck",
      "am_echo",
      "am_eric",
      "am_liam",
      "am_onyx",
    ];
    const BRITISH_MASCULINE = ["bm_george", "bm_fable", "bm_daniel", "bm_lewis"];
    const georgeBlend = builtinAccentRealizationBlend({
      engineVoiceId: "bm_george",
      targetLocale: "en-US",
    });
    assert.deepEqual(georgeBlend, {
      towardEngineVoiceIds: AMERICAN_MASCULINE,
      awayEngineVoiceIds: BRITISH_MASCULINE,
      weight: 1,
    });
    // Every same-presentation voice shares the same direction, so the
    // translation preserves what makes Daniel, George, and Lewis different.
    assert.deepEqual(
      builtinAccentRealizationBlend({
        engineVoiceId: "bm_daniel",
        targetLocale: "en-US",
      }),
      georgeBlend,
    );
    assert.deepEqual(
      builtinAccentRealizationBlend({
        engineVoiceId: "bf_emma",
        targetLocale: "en-US",
      })?.towardEngineVoiceIds.slice(0, 2),
      ["af_heart", "af_bella"],
    );
    // The mirrored direction swaps the groups.
    assert.deepEqual(
      builtinAccentRealizationBlend({
        engineVoiceId: "am_puck",
        targetLocale: "en-GB",
      }),
      {
        towardEngineVoiceIds: BRITISH_MASCULINE,
        awayEngineVoiceIds: AMERICAN_MASCULINE,
        weight: 1,
      },
    );
    // Native pairings and unknown engine ids never blend.
    assert.equal(
      builtinAccentRealizationBlend({
        engineVoiceId: "af_heart",
        targetLocale: "en-US",
      }),
      null,
    );
    assert.equal(
      builtinAccentRealizationBlend({
        engineVoiceId: "bf_emma",
        targetLocale: "en-GB",
      }),
      null,
    );
    assert.equal(
      builtinAccentRealizationBlend({
        engineVoiceId: "system-voice",
        targetLocale: "en-US",
      }),
      null,
    );
  });

  it("realizes delivery moods as balanced American-only style directions", () => {
    assert.deepEqual(
      builtinMoodRealizationBlend({
        engineVoiceId: "bm_george",
        deliveryMood: "joyful",
      }),
      {
        towardEngineVoiceIds: ["am_santa", "am_fenrir", "am_eric"],
        awayEngineVoiceIds: ["am_onyx", "am_echo", "am_adam"],
        weight: 0.5,
      },
    );
    // The feminine hush is anchored on the catalog's one true whisper voice.
    assert.deepEqual(
      builtinMoodRealizationBlend({
        engineVoiceId: "af_sky",
        deliveryMood: "guarded",
      }),
      {
        towardEngineVoiceIds: ["af_nicole"],
        awayEngineVoiceIds: ["af_jessica", "af_sarah", "af_heart"],
        weight: 0.4,
      },
    );
    // Every direction keeps both sides same-presentation American voices so
    // gender and accent cancel — a mood must never move a bot across regions.
    for (const mood of ["joyful", "warm", "guarded", "strained"]) {
      for (const engineVoiceId of ["af_heart", "am_puck"]) {
        const blend = builtinMoodRealizationBlend({
          engineVoiceId,
          deliveryMood: mood,
        });
        assert.ok(blend, `${mood}:${engineVoiceId}`);
        const gender = engineVoiceId[1];
        for (const id of [
          ...blend.towardEngineVoiceIds,
          ...blend.awayEngineVoiceIds,
        ]) {
          assert.match(id, new RegExp(`^a${gender}_`, "u"), `${mood}:${id}`);
        }
        assert.ok(blend.weight > 0 && blend.weight <= 0.5, `${mood} weight`);
      }
    }
    // Neutral, unknown moods, and non-engine voices stay untouched.
    assert.equal(
      builtinMoodRealizationBlend({
        engineVoiceId: "bf_emma",
        deliveryMood: "neutral",
      }),
      null,
    );
    assert.equal(
      builtinMoodRealizationBlend({
        engineVoiceId: "bf_emma",
        deliveryMood: "furious",
      }),
      null,
    );
    assert.equal(
      builtinMoodRealizationBlend({
        engineVoiceId: "system-voice",
        deliveryMood: "joyful",
      }),
      null,
    );
  });

  it("scales melodic range per dialect, reversing the direction to narrow", () => {
    const irish = builtinMelodicityRealizationBlend({
      engineVoiceId: "bm_george",
      accentDefinitionId: "irish-english",
    });
    assert.deepEqual(irish, {
      towardEngineVoiceIds: ["am_santa", "am_fenrir", "am_liam"],
      awayEngineVoiceIds: ["am_onyx", "am_echo", "am_adam"],
      weight: 0.25,
    });
    // Scottish narrows: same axis, swapped poles, positive weight — the
    // runtime clamps negative weights so reversal must happen here.
    const scottish = builtinMelodicityRealizationBlend({
      engineVoiceId: "bm_george",
      accentDefinitionId: "scottish-english",
    });
    assert.deepEqual(scottish?.towardEngineVoiceIds, [
      "am_onyx",
      "am_echo",
      "am_adam",
    ]);
    assert.equal(scottish?.weight, 0.2);
    // Legacy influence-only profiles resolve; unmapped accents stay natural.
    assert.equal(
      builtinMelodicityRealizationBlend({
        engineVoiceId: "af_sky",
        accentDefinitionId: null,
        speechprintInfluence: "indian-english",
      })?.weight,
      0.15,
    );
    assert.equal(
      builtinMelodicityRealizationBlend({
        engineVoiceId: "bm_george",
        accentDefinitionId: "texas-english",
      }),
      null,
    );
    assert.equal(
      builtinMelodicityRealizationBlend({
        engineVoiceId: "system-voice",
        accentDefinitionId: "irish-english",
      }),
      null,
    );
  });

  it("keeps genuine voice identity separate from an approximate pronunciation base", () => {
    const american = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-1",
      pronunciationBase: "en-GB",
    });
    assert.equal(american.accentLocale, "en-US");
    assert.equal(american.pronunciationBase, "en-GB");
    assert.equal(
      resolveLocalVoicePronunciationLocale(
        american.pronunciationBase,
        american.accentLocale,
      ),
      "en-GB",
    );
    assert.equal(
      localVoicePronunciationOverrideIsActive(
        american.pronunciationBase,
        american.accentLocale,
      ),
      true,
    );
    assert.equal(
      localVoicePronunciationOverrideIsActive("en-US", "en-US"),
      false,
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...american,
        pronunciationBase: "unsupported",
      }).pronunciationBase,
      "follow-voice",
    );
  });

  it("treats a portable voice as authoritative over stale legacy accent metadata", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      v: 2,
      baseVoiceId: "voice-4",
      accentLocale: "en-US",
      accentMode: "approximate",
    });
    assert.equal(profile.accentLocale, "en-GB");
    assert.equal(profile.speechprintInfluence, "none");
    assert.equal(profile.speechprintVariationSeed, "natural-v1");
  });
  it("normalizes and round-trips a bounded looping avatar SFX profile", () => {
    const audioDataUrl = `data:audio/mpeg;base64,${Buffer.from("loop").toString("base64")}`;
    const avatarSfx = normalizeBotAvatarSfxV1({
      v: 99,
      source: "elevenlabs",
      audioDataUrl: `  ${audioDataUrl}  `,
      fileName: "  Soft servo loop.mp3  ",
      prompt: " soft   servo breathing ",
      playWhileTalking: true,
      playWhileIdle: false,
      playWhileThinking: true,
      volume: 4,
    });
    assert.deepEqual(avatarSfx, {
      v: 1,
      source: "elevenlabs",
      audioDataUrl,
      fileName: "Soft servo loop.mp3",
      prompt: "soft servo breathing",
      playWhileTalking: true,
      playWhileIdle: false,
      playWhileThinking: true,
      volume: 0.2,
    });
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      avatarSfx,
    });
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile,
    );
    assert.equal(BOT_AVATAR_SFX_MAX_BYTES, 4 * 1024 * 1024);
  });

  it("treats the quiet twenty-percent Avatar SFX ceiling as full scale", () => {
    const audioDataUrl = `data:audio/mpeg;base64,${Buffer.from("loop").toString("base64")}`;
    assert.equal(BOT_AVATAR_SFX_DEFAULT_VOLUME, 0.2);
    assert.equal(
      normalizeBotAvatarSfxV1({
        audioDataUrl,
        playWhileThinking: true,
      })?.volume,
      BOT_AVATAR_SFX_DEFAULT_VOLUME,
    );
  });

  it("round-trips an explicit avatar SFX mute independently of uploaded audio", () => {
    const muted = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      avatarSfxMuted: true,
    });
    assert.equal(muted.avatarSfx, undefined);
    assert.equal(muted.avatarSfxMuted, true);
    assert.equal(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(muted))
        ?.avatarSfxMuted,
      true,
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({ ...muted, avatarSfxMuted: false })
        .avatarSfxMuted,
      undefined,
    );
  });

  it("round-trips an avatar SFX design brief before audio exists", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      avatarSfxPrompt: "  soft   cassette ticks and relay hum  ",
    });
    assert.equal(
      profile.avatarSfxPrompt,
      "soft cassette ticks and relay hum",
    );
    assert.equal(profile.avatarSfx, undefined);
    assert.equal(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile))
        ?.avatarSfxPrompt,
      "soft cassette ticks and relay hum",
    );
  });

  it("rejects non-audio and oversized avatar SFX data URLs", () => {
    assert.equal(
      normalizeBotAvatarSfxV1({
        audioDataUrl: "data:text/html;base64,PGgxPk5vPC9oMT4=",
      }),
      null,
    );
    assert.equal(
      normalizeBotAvatarSfxV1({
        audioDataUrl: `data:audio/mpeg;base64,${"A".repeat(
          Math.ceil((BOT_AVATAR_SFX_MAX_BYTES * 4) / 3) + 300,
        )}`,
      }),
      null,
    );
  });
  it("maps the Voice Character pad to coupled shelves and bounded per-bot gain", () => {
    const character = resolveBotVoiceCharacter({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      eqTilt: 0.5,
      gainDb: -30,
    });
    assert.equal(BOT_VOICE_EQ_TILT_DB_MAX, 6);
    assert.deepEqual(character, {
      eqTilt: 0.5,
      lowShelfDb: -3,
      highShelfDb: 3,
      gainDb: -12,
      gainMultiplier: 0.251189,
    });
    assert.deepEqual(
      resolveBotVoiceCharacter({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        eqTilt: -1,
        gainDb: 20,
      }),
      {
        eqTilt: -1,
        lowShelfDb: 6,
        highShelfDb: -6,
        gainDb: 6,
        gainMultiplier: 1.995262,
      },
    );
  });
  it("does not turn malformed user overrides into an override", () => {
    assert.equal(normalizeOptionalBotAudioVoiceProfileV1(null), null);
    assert.equal(normalizeOptionalBotAudioVoiceProfileV1("voice-1"), null);
    assert.equal(normalizeOptionalBotAudioVoiceProfileV1({}), null);
    assert.deepEqual(
      normalizeOptionalBotAudioVoiceProfileV1({ v: 1, baseVoiceId: "voice-2" }),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        baseVoiceId: "voice-2",
        premiumPitch: 0,
        premiumPace: 0,
        premiumLilt: 0,
      },
    );
    assert.deepEqual(
      normalizeOptionalBotAudioVoiceProfileV1(JSON.stringify({
        baseVoiceId: "voice-3",
        systemVoiceName: "Samantha",
      })),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        baseVoiceId: "voice-3",
        systemVoiceName: "Samantha",
        premiumPitch: 0,
        premiumPace: 0,
        premiumLilt: 0,
      },
    );
  });

  it("keeps crafted ElevenLabs voices visible through legacy local overrides", () => {
    const authored = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceIdOverride: "crafted-voice",
      elevenLabsEffect: "deep-space",
      elevenLabsDirection: "measured, quietly menacing",
      pitch: -0.4,
    });
    const legacyOverride = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "Alex",
      pitch: 0.25,
      lilt: 0.5,
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, legacyOverride);

    assert.equal(resolved.elevenLabsVoiceIdOverride, "crafted-voice");
    assert.equal(resolved.elevenLabsEffect, "deep-space");
    assert.equal(resolved.elevenLabsDirection, "measured, quietly menacing");
    assert.equal(resolved.systemVoiceName, "Alex");
    assert.equal(resolved.pitch, 0.25);
    assert.equal(resolved.lilt, 0.5);
  });

  it("preserves a user's chosen ElevenLabs voice while filling a missing direction", () => {
    const authored = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceIdOverride: "crafted-voice",
      elevenLabsEffect: "deep-space",
      elevenLabsDirection: "patient, warm",
    });
    const customized = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceId: "my-voice",
      elevenLabsEffect: "radio",
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, customized);

    assert.equal(resolved.elevenLabsVoiceId, "my-voice");
    assert.equal(resolved.elevenLabsVoiceIdOverride, undefined);
    assert.equal(resolved.elevenLabsEffect, "radio");
    assert.equal(resolved.elevenLabsDirection, "patient, warm");
  });

  it("lets an initialized local-only override suppress an authored Premium identity", () => {
    const authored = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceIdOverride: "marketplace-voice",
      elevenLabsDirection: "bright, quick",
    });
    const localOnly = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "Alex",
      elevenLabsVoiceInitialized: true,
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, localOnly);

    assert.equal(resolved.systemVoiceName, "Alex");
    assert.equal(resolved.elevenLabsVoiceId, undefined);
    assert.equal(resolved.elevenLabsVoiceIdOverride, undefined);
    assert.equal(resolved.elevenLabsVoiceInitialized, true);
  });

  it("resolves serialized saved profiles before applying authored and override precedence", () => {
    const authored = serializeBotAudioVoiceProfileV1({
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      elevenLabsVoiceIdOverride: "marketplace-voice",
      elevenLabsDirection: "measured, exact",
    });
    const override = serializeBotAudioVoiceProfileV1({
      v: 2,
      enabled: true,
      baseVoiceId: "voice-9",
      systemVoiceName: "Alex",
    });

    const resolved = resolveBotAudioVoiceProfileV1(authored, override);

    assert.equal(resolved.baseVoiceId, "voice-9");
    assert.equal(resolved.systemVoiceName, "Alex");
    assert.equal(resolved.elevenLabsVoiceIdOverride, "marketplace-voice");
    assert.equal(resolved.elevenLabsDirection, "measured, exact");
  });

  it("normalizes v2 volume and retires legacy texture controls to clean audio", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      volume: 4,
      texture: {
        preset: "tape",
        amount: 2,
        bandwidth: -1,
        noise: 0.2,
        instability: 0.3,
        distortion: 0.4,
        damage: 0.5,
      },
    });
    assert.equal(profile.volume, 1.25);
    assert.deepEqual(profile.texture, BOT_VOICE_TEXTURE_RECIPES.clean);
  });

  it("keeps provider-specific voice selections independent", () => {
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      systemVoiceName: "  Alex  ",
      elevenLabsVoiceId: " eleven-voice-id ",
      elevenLabsVoiceIdOverride: " portable-voice-id ",
      elevenLabsVoiceInitialized: true,
      elevenLabsEffect: "radio",
    });
    assert.equal(profile.systemVoiceName, "Alex");
    assert.equal(profile.elevenLabsVoiceId, "eleven-voice-id");
    assert.equal(profile.elevenLabsVoiceIdOverride, "portable-voice-id");
    assert.equal(profile.elevenLabsVoiceInitialized, true);
    assert.equal(profile.elevenLabsEffect, "radio");
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile
    );
  });

  it("presents the compatible Chorus ID as the Prism default", () => {
    assert.equal(DEFAULT_VOICE_EFFECT, "chorus");
    assert.equal(VOICE_EFFECT_LABELS.chorus, "Prism");
    assert.match(VOICE_EFFECT_DESCRIPTIONS.chorus, /PRISM/u);
    assert.equal(normalizeVoiceEffect(undefined), "chorus");
    assert.equal(normalizeVoiceEffect("clean"), "clean");
    assert.equal(normalizeVoiceEffect("resonance"), "resonance");
    assert.equal(normalizeElevenLabsVoiceEffect("robot"), "robot");
    assert.equal(normalizeElevenLabsVoiceEffect(undefined), "chorus");
    assert.equal(normalizeElevenLabsVoiceEffect("distortion"), "chorus");
    assert.equal(normalizeElevenLabsVoiceEffect("crt-speaker"), "clean");
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "clean",
      }).elevenLabsEffect,
      "chorus",
    );
    assert.deepEqual(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "clean",
        voiceEffectExplicit: true,
      }),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "clean",
        voiceEffectExplicit: true,
        premiumPitch: 0,
        premiumPace: 0,
        premiumLilt: 0,
      },
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "deep-space",
      }).elevenLabsEffect,
      "deep-space"
    );
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "resonance",
        voiceEffectExplicit: true,
      })),
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        elevenLabsEffect: "resonance",
        voiceEffectExplicit: true,
        premiumPitch: 0,
        premiumPace: 0,
        premiumLilt: 0,
      },
    );
  });

  it("normalizes and persists a compact ElevenLabs voice direction deck", () => {
    assert.equal(
      normalizeElevenLabsVoiceDirection(
        " warm , [hushed]; warm\nwith measured pauses, mischievously ",
      ),
      "warm, hushed, with measured pauses",
    );
    const profile = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsVoiceId: "voice-id",
      elevenLabsEffect: "chorus",
      elevenLabsDirection: "warm, hushed, with measured pauses",
    });
    assert.deepEqual(
      parseStoredBotAudioVoiceProfileV1(serializeBotAudioVoiceProfileV1(profile)),
      profile,
    );
    assert.equal(profile.elevenLabsEffect, "chorus");
    assert.equal(profile.elevenLabsDirection, "warm, hushed, with measured pauses");
  });

  it("does not cut a generated direction cue through the middle of a word", () => {
    assert.equal(
      normalizeElevenLabsVoiceDirection(
        "grounded conversational delivery with crisp phrasing",
      ),
      "grounded conversational delivery with crisp",
    );
  });

  it("detects modified texture recipes and restores canonical defaults", () => {
    assert.equal(botVoiceTextureIsModified({ ...BOT_VOICE_TEXTURE_RECIPES.lofi }), false);
    assert.equal(botVoiceTextureIsModified({ ...BOT_VOICE_TEXTURE_RECIPES.lofi, noise: 0.4 }), true);
    assert.deepEqual(normalizeBotVoiceTexture({ preset: "crt-speaker" }), BOT_VOICE_TEXTURE_RECIPES["crt-speaker"]);
  });
});

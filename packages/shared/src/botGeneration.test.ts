import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_GENERATED_AVATAR_INK_MAX_PAINTED_PIXELS,
  BOT_GENERATION_PROMPT_MAX_LENGTH,
  CURSED_TONGUE_GENERATED_AUTHORING_PROMPT,
  normalizeBotGeneratedDraftV1,
  normalizeGeneratedBotPowerPromptV1,
  normalizeLeanBotGeneratedDraftV1,
  normalizeBotGenerationPrompt,
} from "./botGeneration.ts";
import { BOT_AUDIO_VOICE_IDS } from "./audioVoice.ts";
import {
  decodeBotAvatarDetailsPaintColorMap,
} from "./botAvatarDetails.ts";
import { hexToHsl } from "./color.ts";

function paintedPixelCount(bytes: Uint8Array): number {
  return Array.from(bytes).reduce((count, byte) =>
    count + [6, 4, 2, 0].filter((shift) => ((byte >>> shift) & 0x03) !== 0).length,
  0);
}

function completeDraft(): Record<string, unknown> {
  return {
    name: "  Nyx  ",
    namePronunciation: "nicks",
    selfReferral: "Nyx",
    profile: {
      v: 2,
      purpose: { statement: "a midnight cartographer", legacyNotes: "" },
      core: {
        traits: "patient, sly, observant",
        communicationStyle: "warm",
        responseCues: {
          v: 1,
          enabled: true,
          interruption: ["A new route, then.", "Course corrected."],
          redirect: ["I see another path.", "Let's chart that."],
          waiting: ["Reading the stars…", "Finding our bearings…"],
          blockedDefaults: [],
        },
        openness: 2,
        conscientiousness: 1,
        extraversion: -1,
        agreeableness: 0,
        emotionalStability: 1,
        humor: null,
        curiosity: null,
        directness: null,
        interests: "lost cities and night skies",
        boundaries: "never invents certainty",
        quirks: "describes plans as routes",
      },
      identity: {
        age: "ageless",
        species: "star spirit",
        pronouns: "she/her",
        background: "born between constellations",
        role: "guide",
      },
      worldview: {
        politicalView: null,
        religion: "",
        optimism: 1,
        tradition: -1,
        values: "curiosity, consent, precision",
      },
      appearance: {
        description: "silver eyes and an ink-dark silhouette",
        style: "astral workwear",
        presence: "quietly magnetic",
      },
      facts: {
        birthday: "",
        birthMonthDay: "",
        birthYear: "",
        birthEra: "ad",
        deceased: false,
        basedOnRealPersonOrCharacter: false,
        customFacts: [{ label: "Compass", value: "Points toward unanswered questions" }],
      },
    },
    color: "#7A5CFF",
    accentColor: "#7799AA",
    glyph: "moon",
    face: {
      intentionalCustomEyes: true,
      intentionalCustomMouth: true,
      intentionalCustomBlink: false,
      intentionalEyeGeometryException: false,
      intentionalMouthGeometryException: false,
      intentionalBlinkGeometryException: false,
      faceEyesFont: "warm",
      faceEyeCharacter: "*",
      faceEyeCount: 2,
      faceMouthFont: "concise",
      faceMouthCharacter: "_",
      faceMouthAnimation: "flicker",
      faceMouthCoffeePucker: true,
      faceFontWeight: 625,
      faceEyeScale: 1.2,
      faceEyeOffsetX: 0.04,
      faceEyeOffsetY: -0.04,
      faceEyeRotationDeg: 0,
      faceMouthScale: 0.9,
      faceMouthOffsetX: 0,
      faceMouthOffsetY: 0.04,
      faceMouthRotationDeg: 0,
      faceBlinkBar: "¦",
      faceBlinkScale: 1,
      faceBlinkOffsetX: 0,
      faceBlinkOffsetY: 0,
      faceBlinkRotationDeg: 0,
      faceThinkingFrames: ["·", "✦", "*", "✧"],
    },
    avatarDetails: {
      stamps: [
        { id: "round-glasses", offsetX: 2, offsetY: -1, scalePct: 105 },
        { id: "freckles", offsetX: 0, offsetY: 0, scalePct: 100 },
        { id: "circuit-mark", offsetX: 0, offsetY: 0, scalePct: 100 },
      ],
      ink: [
        { role: "effect", shape: "line", x1: 30, y1: 30, x2: 50, y2: 30, size: 1 },
        { role: "talking", shape: "line", x1: 56, y1: 76, x2: 72, y2: 76, size: 2 },
      ],
      speechInkAnimation: "wobble",
    },
    voice: {
      v: 2,
      baseVoiceId: "voice-8",
      elevenLabsVoiceId: "voice-premium-nyx",
      elevenLabsEffect: "echo",
      elevenLabsDirection: "hushed, wry, deliberate",
      elevenLabsStability: 0.63,
      pitch: 0.2,
      warmth: 0.35,
      openness: -0.25,
      weight: 0.4,
      brightness: -0.2,
      resonance: 0.55,
      pace: -0.15,
      lilt: 0.3,
      bottishTone: 0.2,
      eqTilt: -0.1,
      gainDb: -1.5,
      volume: 0.9,
    },
    avatarSfxPrompt: "Soft celestial relay ticks and a low glass shimmer",
    voicePreviewLine: "Every unanswered question leaves a trail in the dark.",
    settings: {
      flirtEnabled: false,
      temperature: 0.82,
      maxTokens: 1800,
      topP: 0.91,
      topK: 55,
      repetitionPenalty: 1.08,
    },
  };
}

describe("normalizeBotGeneratedDraftV1", () => {
  it("normalizes a complete generated bot while dropping deprecated accessory stamps", () => {
    const draft = normalizeBotGeneratedDraftV1(completeDraft());
    assert.ok(draft);
    assert.equal(draft.name, "Nyx");
    assert.equal(draft.namePronunciation, "nicks");
    assert.equal(draft.selfReferral, "");
    assert.equal(draft.profile.core.communicationStyle, "warm");
    assert.deepEqual(draft.profile.core.responseCues?.waiting, [
      "Reading the stars…",
      "Finding our bearings…",
    ]);
    assert.equal(draft.profile.facts.customFacts.length, 1);
    const generatedColor = hexToHsl(draft.color);
    const requestedColor = hexToHsl("#7A5CFF");
    assert.ok(Math.abs(generatedColor.h - requestedColor.h) < 0.6);
    assert.ok(Math.abs(generatedColor.s - 100) < 0.6);
    assert.ok(Math.abs(generatedColor.l - 50) < 0.6);
    assert.equal(draft.accentColor, "#22b5ff");
    assert.equal(draft.glyph, "moon");
    assert.equal(draft.face.eyeCharacter, "*");
    assert.equal(draft.face.eyeCount, 2);
    assert.equal(draft.face.mouthCharacter, "_");
    assert.equal(draft.face.eyeScale, 1);
    assert.equal(draft.face.mouthScale, 0.7);
    assert.equal(draft.face.blinkScale, 1);
    assert.equal(draft.face.eyeRotationDeg, 0);
    assert.equal(draft.face.mouthRotationDeg, 0);
    assert.equal(draft.face.blinkRotationDeg, 0);
    assert.equal(draft.face.blinkBar, " ");
    assert.equal(draft.face.eyeOffsetX, 0);
    assert.equal(draft.face.eyeOffsetY, 0);
    assert.equal(draft.face.blinkOffsetX, 0);
    assert.equal(draft.face.blinkOffsetY, 0);
    assert.equal(draft.face.mouthOffsetX, 0);
    assert.equal(draft.face.mouthOffsetY, 0);
    assert.deepEqual(draft.avatarDetails?.screen.stamps, []);
    assert.ok(draft.avatarDetails?.screen.paintColorMapBase64);
    assert.equal(draft.avatarDetails?.screen.speechInkAnimation, "wobble");
    assert.equal(draft.audioVoiceProfile.baseVoiceId, "voice-8");
    assert.deepEqual(draft.powers, []);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceId, undefined);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceIdOverride, undefined);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceInitialized, true);
    assert.ok(draft.audioVoiceProfile.accentDefinitionId);
    assert.ok(draft.audioVoiceProfile.pronunciationMapPoint);
    assert.ok(["light", "balanced", "strong"].includes(draft.audioVoiceProfile.speechprintStrength ?? ""));
    assert.equal(draft.audioVoiceProfile.systemVoiceName, undefined);
    assert.equal(draft.audioVoiceProfile.elevenLabsDirection, "hushed, wry, deliberate");
    assert.equal(draft.audioVoiceProfile.openness, -0.25);
    assert.equal(draft.audioVoiceProfile.weight, 0.4);
    assert.equal(draft.audioVoiceProfile.brightness, -0.2);
    assert.equal(draft.audioVoiceProfile.resonance, 0.55);
    assert.equal(
      draft.avatarSfxPrompt,
      "Soft celestial relay ticks and a low glass shimmer",
    );
    assert.equal(draft.settings.maxTokens, 1800);
  });

  it("preserves model-authored accent, eligible identity, and an explicit alternate effect", () => {
    const source = completeDraft();
    source.voice = {
      ...(source.voice as Record<string, unknown>),
      voiceIdentity: "premium:allotted-voice",
      accentDefinitionId: "german-influenced-english",
      speechprintStrength: "strong",
      elevenLabsEffect: "radio",
    };
    const draft = normalizeBotGeneratedDraftV1(source, {
      premiumVoices: [{ voiceId: "allotted-voice", name: "Archive" }],
      preserveModelVoiceEffect: true,
    }, () => 0);
    assert.ok(draft);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceId, "allotted-voice");
    assert.equal(draft.audioVoiceProfile.accentDefinitionId, "german-influenced-english");
    assert.equal(draft.audioVoiceProfile.speechprintStrength, "strong");
    assert.equal(draft.audioVoiceProfile.elevenLabsEffect, "radio");
  });

  it("forces Prism when the model invents an unrequested alternate voice effect", () => {
    const source = completeDraft();
    source.voice = {
      ...(source.voice as Record<string, unknown>),
      elevenLabsEffect: "deep-space",
    };
    const draft = normalizeBotGeneratedDraftV1(source, undefined, () => 0);
    assert.ok(draft);
    assert.equal(draft.audioVoiceProfile.elevenLabsEffect, "chorus");
  });

  it("assigns a valid random portable voice, Accent Map anchor, strength, and Prism effect when absent", () => {
    const source = completeDraft();
    source.voice = {};
    const draft = normalizeBotGeneratedDraftV1(source, undefined, () => 0.99);
    assert.ok(draft);
    assert.equal(draft.audioVoiceProfile.baseVoiceId, BOT_AUDIO_VOICE_IDS.at(-1));
    assert.ok(draft.audioVoiceProfile.accentDefinitionId);
    assert.ok(draft.audioVoiceProfile.pronunciationMapPoint);
    assert.equal(draft.audioVoiceProfile.speechprintStrength, "strong");
    assert.equal(draft.audioVoiceProfile.elevenLabsEffect, "chorus");
  });

  it("places each generated batch sibling at a distinct deterministic Accent Map point", () => {
    const source = completeDraft();
    source.voice = { accentDefinitionId: "german-influenced-english" };
    const points = [1, 2, 3, 4].map((batchIndex) => {
      const draft = normalizeBotGeneratedDraftV1(source, {
        generatedAccentMapLocation: {
          seed: "A midnight field crew",
          batchIndex,
          batchCount: 4,
        },
      });
      assert.ok(draft?.audioVoiceProfile.pronunciationMapPoint);
      assert.equal(
        draft.audioVoiceProfile.accentDefinitionId,
        "german-influenced-english",
      );
      return draft!.audioVoiceProfile.pronunciationMapPoint!;
    });
    assert.equal(new Set(points.map(({ x, y }) => `${x}:${y}`)).size, 4);
    assert.deepEqual(
      normalizeBotGeneratedDraftV1(source, {
        generatedAccentMapLocation: {
          seed: "A midnight field crew",
          batchIndex: 2,
          batchCount: 4,
        },
      })?.audioVoiceProfile.pronunciationMapPoint,
      points[1],
    );
  });

  it("derives a one-off generated pin from the bot identity as well as its brief", () => {
    const firstSource = completeDraft();
    const secondSource = completeDraft();
    firstSource.name = "Northstar Ada";
    secondSource.name = "Harbor Jules";
    firstSource.voice = { accentDefinitionId: "american-english" };
    secondSource.voice = { accentDefinitionId: "american-english" };
    const catalog = {
      generatedAccentMapLocation: {
        seed: "A dependable night operator",
        batchIndex: 1,
        batchCount: 1,
      },
    };
    const first = normalizeBotGeneratedDraftV1(firstSource, catalog);
    const second = normalizeBotGeneratedDraftV1(secondSource, catalog);
    assert.ok(first?.audioVoiceProfile.pronunciationMapPoint);
    assert.ok(second?.audioVoiceProfile.pronunciationMapPoint);
    assert.notDeepEqual(
      first.audioVoiceProfile.pronunciationMapPoint,
      second.audioVoiceProfile.pronunciationMapPoint,
    );
  });

  it("preserves a valid persona-authored map target without requiring literal geography in the brief", () => {
    const source = completeDraft();
    source.voice = {
      ...(source.voice as Record<string, unknown>),
      accentDefinitionId: "german-influenced-english",
      speechprintStrength: "strong",
      pronunciationMapPoint: { x: 0.74, y: 0.33 },
    };
    const draft = normalizeBotGeneratedDraftV1(source, undefined, () => 0);
    assert.ok(draft);
    assert.equal(draft.audioVoiceProfile.accentDefinitionId, "german-influenced-english");
    assert.equal(draft.audioVoiceProfile.speechprintStrength, "strong");
    assert.deepEqual(draft.audioVoiceProfile.pronunciationMapPoint, {
      x: 0.74,
      y: 0.33,
    });
  });

  it("permits OS voices only when capability data supplies them and keeps every portable voice eligible", () => {
    const source = completeDraft();
    source.voice = { voiceIdentity: "os:Alex" };
    const noOptIn = normalizeBotGeneratedDraftV1(source, undefined, () => 0);
    const optedIn = normalizeBotGeneratedDraftV1(source, {
      operatingSystemVoiceNames: ["Alex"],
    }, () => 0);
    assert.ok(noOptIn && optedIn);
    assert.equal(noOptIn.audioVoiceProfile.systemVoiceName, undefined);
    assert.equal(optedIn.audioVoiceProfile.systemVoiceName, "Alex");
    for (const voiceId of BOT_AUDIO_VOICE_IDS) {
      source.voice = { voiceIdentity: `portable:${voiceId}` };
      assert.equal(
        normalizeBotGeneratedDraftV1(source, undefined, () => 0)?.audioVoiceProfile.baseVoiceId,
        voiceId,
      );
    }
  });

  it("defaults unrequested generated eye and mouth glyphs while preserving deliberate canon", () => {
    const ordinary = completeDraft();
    ordinary.face = {
      ...(ordinary.face as Record<string, unknown>),
      intentionalCustomEyes: false,
      intentionalCustomMouth: false,
      intentionalCustomBlink: false,
      faceEyeCharacter: "*",
      faceMouthCharacter: "_",
      faceBlinkBar: "¦",
      faceEyeCount: 2,
    };
    const ordinaryDraft = normalizeBotGeneratedDraftV1(ordinary);
    assert.ok(ordinaryDraft);
    assert.equal(ordinaryDraft.face.eyeCharacter, null);
    assert.equal(ordinaryDraft.face.eyeCount, 1);
    assert.equal(ordinaryDraft.face.mouthCharacter, null);
    assert.equal(ordinaryDraft.face.blinkBar, " ");
    assert.equal(ordinaryDraft.face.eyeScale, 1);
    assert.equal(ordinaryDraft.face.mouthScale, 0.7);
    assert.equal(ordinaryDraft.face.blinkScale, 1);
    assert.equal(ordinaryDraft.face.eyeRotationDeg, 0);
    assert.equal(ordinaryDraft.face.mouthRotationDeg, 0);
    assert.equal(ordinaryDraft.face.blinkRotationDeg, 0);

    const canon = completeDraft();
    const canonDraft = normalizeBotGeneratedDraftV1(canon);
    assert.ok(canonDraft);
    assert.equal(canonDraft.face.eyeCharacter, "*");
    assert.equal(canonDraft.face.mouthCharacter, "_");
  });

  it("preserves directional geometry only for the explicitly custom feature", () => {
    const exception = completeDraft();
    exception.face = {
      ...(exception.face as Record<string, unknown>),
      intentionalCustomBlink: true,
      intentionalEyeGeometryException: true,
      intentionalMouthGeometryException: true,
      intentionalBlinkGeometryException: true,
      faceEyeScale: 1.2,
      faceEyeOffsetX: -0.3,
      faceEyeOffsetY: -0.04,
      faceEyeRotationDeg: 25,
      faceMouthScale: 0.9,
      faceMouthOffsetX: 0.2,
      faceMouthOffsetY: 0.04,
      faceMouthRotationDeg: -15,
      faceBlinkBar: "╱",
      faceBlinkScale: 1.1,
      faceBlinkOffsetX: -0.2,
      faceBlinkOffsetY: 0.12,
      faceBlinkRotationDeg: 20,
    };
    const draft = normalizeBotGeneratedDraftV1(exception);
    assert.ok(draft);
    assert.deepEqual(
      {
        eyeScale: draft.face.eyeScale,
        eyeX: draft.face.eyeOffsetX,
        eyeY: draft.face.eyeOffsetY,
        eyeRotation: draft.face.eyeRotationDeg,
        mouthScale: draft.face.mouthScale,
        mouthX: draft.face.mouthOffsetX,
        mouthY: draft.face.mouthOffsetY,
        mouthRotation: draft.face.mouthRotationDeg,
        blinkBar: draft.face.blinkBar,
        blinkScale: draft.face.blinkScale,
        blinkX: draft.face.blinkOffsetX,
        blinkY: draft.face.blinkOffsetY,
        blinkRotation: draft.face.blinkRotationDeg,
      },
      {
        eyeScale: 1.2,
        eyeX: -0.3,
        eyeY: -0.04,
        eyeRotation: 25,
        mouthScale: 0.9,
        mouthX: 0.2,
        mouthY: 0.04,
        mouthRotation: -15,
        blinkBar: "╱",
        blinkScale: 1.1,
        blinkX: -0.2,
        blinkY: 0.12,
        blinkRotation: 20,
      },
    );

    const defaultMouth = completeDraft();
    defaultMouth.face = {
      ...(defaultMouth.face as Record<string, unknown>),
      intentionalCustomMouth: false,
      intentionalMouthGeometryException: true,
      faceMouthScale: 1.4,
      faceMouthRotationDeg: 40,
    };
    const defaultMouthDraft = normalizeBotGeneratedDraftV1(defaultMouth);
    assert.ok(defaultMouthDraft);
    assert.equal(defaultMouthDraft.face.mouthCharacter, null);
    assert.equal(defaultMouthDraft.face.mouthScale, 0.7);
    assert.equal(defaultMouthDraft.face.mouthRotationDeg, 0);
  });

  it("keeps generated Atmosphere accents optional and portable", () => {
    const auto = completeDraft();
    delete auto.accentColor;
    assert.equal(normalizeBotGeneratedDraftV1(auto).accentColor, null);

    const invalid = completeDraft();
    invalid.accentColor = "blue";
    assert.equal(normalizeBotGeneratedDraftV1(invalid).accentColor, null);
  });

  it("turns pale generated primary colors into the vivid hue-only picker midpoint", () => {
    const paleOrange = completeDraft();
    paleOrange.color = "#eadcc7";

    const draft = normalizeBotGeneratedDraftV1(paleOrange);
    assert.ok(draft);
    const generatedColor = hexToHsl(draft.color);
    const requestedColor = hexToHsl("#eadcc7");
    assert.ok(Math.abs(generatedColor.h - requestedColor.h) < 0.6);
    assert.ok(Math.abs(generatedColor.s - 100) < 0.6);
    assert.ok(Math.abs(generatedColor.l - 50) < 0.6);
  });

  it("creates up to three compiler-ready prompt Powers from a master draft", () => {
    const value = completeDraft();
    value.powerPrompts = [
      "She can hear lies as broken glass, but only from detectives.",
      "Moonlight makes every promise hover visibly until the speaker fulfills it.",
      "Old maps whisper one safe direction, but never the destination.",
      "A fourth Power must be ignored by the bounded contract.",
    ];
    const draft = normalizeBotGeneratedDraftV1(value);
    assert.ok(draft);
    assert.equal(draft.powers.length, 3);
    assert.equal(draft.powers[0]?.authoringMode, "prompt");
    assert.equal(draft.powers[0]?.intent, value.powerPrompts[0]);
    assert.equal(draft.powers[0]?.compileStatus, "draft");
  });

  it("canonicalizes known Cursed Tongue activation filler and rejects generic activation filler", () => {
    assert.equal(
      normalizeGeneratedBotPowerPromptV1("Cursed Tongue Power activated!"),
      CURSED_TONGUE_GENERATED_AUTHORING_PROMPT,
    );
    assert.equal(normalizeGeneratedBotPowerPromptV1("Lantern Voice Power activated!"), "");

    const cursedTongue = completeDraft();
    cursedTongue.powerPrompts = ["Cursed Tongue Power activated!"];
    assert.equal(
      normalizeBotGeneratedDraftV1(cursedTongue)?.powers[0]?.intent,
      CURSED_TONGUE_GENERATED_AUTHORING_PROMPT,
    );

    const genericActivation = completeDraft();
    genericActivation.powerPrompts = ["Lantern Voice Power activated!"];
    assert.deepEqual(normalizeBotGeneratedDraftV1(genericActivation)?.powers, []);
  });

  it("keeps legacy null and malformed generated Power prompts removable by normalizing them to no draft Power", () => {
    const legacyNull = completeDraft();
    legacyNull.powerPrompt = null;
    const malformed = completeDraft();
    malformed.powerPrompt = { intent: "not a sentence" };

    assert.deepEqual(normalizeBotGeneratedDraftV1(legacyNull)?.powers, []);
    assert.deepEqual(normalizeBotGeneratedDraftV1(malformed)?.powers, []);
  });

  it("never links a premium voice during generation while preserving local casting", () => {
    const input = completeDraft();
    input.voice = {
      ...(input.voice as Record<string, unknown>),
      baseVoiceId: "voice-12",
      elevenLabsVoiceId: "provider-voice-that-must-not-link",
    };
    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceId, undefined);
    assert.equal(draft.audioVoiceProfile.baseVoiceId, "voice-12");
    assert.equal(draft.audioVoiceProfile.accentLocale, "en-GB");
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceInitialized, true);
    assert.equal(draft.audioVoiceProfile.pitch, 0.2);
    assert.equal(draft.audioVoiceProfile.warmth, 0.35);
  });

  it("rasterizes bounded filled portrait paths into editable semantic ink", () => {
    const input = completeDraft();
    input.avatarDetails = {
      ink: [
        {
          role: "effect",
          points: [
            { x: 38, y: 22 },
            { x: 90, y: 22 },
            { x: 86, y: 45 },
            { x: 42, y: 45 },
          ],
          closed: true,
          fill: true,
          size: 2,
        },
        {
          role: "effect",
          points: [
            { x: 30, y: 46 },
            { x: 98, y: 46 },
          ],
          closed: false,
          fill: false,
          size: 3,
        },
        {
          role: "effect",
          points: [
            { x: 42, y: 52 },
            { x: 30, y: 62 },
            { x: 38, y: 76 },
            { x: 28, y: 88 },
          ],
          closed: false,
          fill: false,
          size: 2,
        },
      ],
    };

    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft?.avatarDetails?.screen.paintColorMapBase64);
    const bytes = decodeBotAvatarDetailsPaintColorMap(
      draft.avatarDetails.screen.paintColorMapBase64,
    );
    assert.ok(paintedPixelCount(bytes) > 500);
  });

  it("preserves semantic eyebrow, eyelash, and lip ink with speech motion", () => {
    const input = completeDraft();
    input.avatarDetails = {
      ink: [
        {
          role: "talking",
          points: [
            { x: 54, y: 80 },
            { x: 74, y: 80 },
          ],
          closed: false,
          fill: false,
          size: 2,
        },
        {
          role: "blink",
          shape: "line",
          x1: 48,
          y1: 54,
          x2: 56,
          y2: 52,
          size: 2,
        },
        {
          role: "effect",
          shape: "line",
          x1: 46,
          y1: 46,
          x2: 58,
          y2: 44,
          size: 2,
        },
      ],
      speechInkAnimation: "pulsate",
    };
    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft?.avatarDetails?.screen.paintColorMapBase64);
    assert.equal(draft.avatarDetails.screen.speechInkAnimation, "pulsate");
    const bytes = decodeBotAvatarDetailsPaintColorMap(
      draft.avatarDetails.screen.paintColorMapBase64,
    );
    const roles = new Set<number>();
    for (const byte of bytes) {
      for (const shift of [6, 4, 2, 0]) roles.add((byte >>> shift) & 0x03);
    }
    assert.equal(roles.has(1), true);
    assert.equal(roles.has(2), true);
    assert.equal(roles.has(3), true);
  });

  it("reserves live windows by semantic role while allowing lashes and lips", () => {
    const input = completeDraft();
    input.avatarDetails = {
      ink: [
        {
          role: "blink",
          points: [
            { x: 56, y: 60 },
            { x: 72, y: 60 },
          ],
          closed: false,
          fill: false,
          size: 2,
        },
        {
          role: "talking",
          points: [
            { x: 48, y: 80 },
            { x: 80, y: 80 },
          ],
          closed: false,
          fill: false,
          size: 3,
        },
        {
          role: "effect",
          points: [
            { x: 20, y: 20 },
            { x: 108, y: 20 },
            { x: 108, y: 100 },
            { x: 20, y: 100 },
          ],
          closed: true,
          fill: true,
          size: 2,
        },
      ],
    };
    input.face = {
      ...(input.face as Record<string, unknown>),
      faceEyeOffsetX: -0.3,
      faceEyeOffsetY: -0.3,
      faceBlinkOffsetX: 0.3,
      faceBlinkOffsetY: -0.3,
      faceMouthOffsetX: 0.3,
      faceMouthOffsetY: 0.3,
    };

    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft?.avatarDetails?.screen.paintColorMapBase64);
    assert.deepEqual(
      {
        eyeX: draft.face.eyeOffsetX,
        eyeY: draft.face.eyeOffsetY,
        blinkX: draft.face.blinkOffsetX,
        blinkY: draft.face.blinkOffsetY,
        mouthX: draft.face.mouthOffsetX,
        mouthY: draft.face.mouthOffsetY,
      },
      {
        eyeX: 0,
        eyeY: 0,
        blinkX: 0,
        blinkY: 0,
        mouthX: 0,
        mouthY: 0,
      },
    );
    const bytes = decodeBotAvatarDetailsPaintColorMap(
      draft.avatarDetails.screen.paintColorMapBase64,
    );
    const roleAt = (x: number, y: number): number => {
      const pixelIndex = y * 128 + x;
      return ((bytes[pixelIndex >>> 2] ?? 0) >>> (6 - (pixelIndex & 3) * 2)) & 0x03;
    };
    assert.equal(roleAt(64, 60), 1);
    assert.equal(roleAt(64, 81), 2);
    assert.equal(Array.from(bytes).some((byte) =>
      [6, 4, 2, 0].some((shift) => ((byte >>> shift) & 0x03) === 2)
    ), true);
  });

  it("caps generated portrait ink at the restrained accent density", () => {
    const input = completeDraft();
    input.avatarDetails = {
      ink: [
        [[20, 12], [64, 12], [64, 64], [20, 64]],
        [[64, 12], [108, 12], [108, 64], [64, 64]],
        [[20, 64], [64, 64], [64, 108], [20, 108]],
        [[64, 64], [108, 64], [108, 108], [64, 108]],
      ].map((points) => ({
        role: "effect",
        points: points.map(([x, y]) => ({ x, y })),
        closed: true,
        fill: true,
        size: 4,
      })),
    };

    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft?.avatarDetails?.screen.paintColorMapBase64);
    const bytes = decodeBotAvatarDetailsPaintColorMap(
      draft.avatarDetails.screen.paintColorMapBase64,
    );
    assert.equal(
      paintedPixelCount(bytes),
      BOT_GENERATED_AVATAR_INK_MAX_PAINTED_PIXELS,
    );
  });

  it("clamps malformed geometry and generation settings", () => {
    const input = completeDraft();
    input.color = "not-a-color";
    input.glyph = "triangle";
    input.settings = {
      flirtEnabled: true,
      temperature: 99,
      maxTokens: -10,
      topP: 9,
      topK: 900,
      repetitionPenalty: 0,
    };
    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft);
    assert.equal(draft.color, "#00c0ff");
    assert.equal(draft.glyph, "sparkles");
    assert.deepEqual(draft.settings, {
      flirtEnabled: true,
      temperature: 2,
      maxTokens: 256,
      topP: 1,
      topK: 200,
      repetitionPenalty: 0.5,
    });
  });

  it("drops oversized portrait strokes while preserving small avatar accents", () => {
    const input = completeDraft();
    input.avatarDetails = {
      ink: [
        { role: "effect", shape: "circle", x1: 64, y1: 58, x2: 112, y2: 58, size: 2 },
        { role: "effect", shape: "line", x1: 18, y1: 40, x2: 110, y2: 96, size: 2 },
        { role: "effect", shape: "line", x1: 24, y1: 54, x2: 32, y2: 58, size: 1 },
      ],
    };
    const compactOnly = completeDraft();
    compactOnly.avatarDetails = {
      ink: [
        { role: "effect", shape: "line", x1: 24, y1: 54, x2: 32, y2: 58, size: 1 },
      ],
    };

    const draft = normalizeBotGeneratedDraftV1(input);
    const expected = normalizeBotGeneratedDraftV1(compactOnly);
    assert.ok(draft);
    assert.ok(expected);
    assert.equal(
      draft.avatarDetails?.screen.paintColorMapBase64,
      expected.avatarDetails?.screen.paintColorMapBase64,
    );
  });
});

describe("normalizeLeanBotGeneratedDraftV1", () => {
  it("keeps the shared voice and Accent Map contract while stripping rich visual output", () => {
    const rich = completeDraft();
    rich.voiceBaseId = "voice-8";
    const draft = normalizeLeanBotGeneratedDraftV1(rich);
    assert.ok(draft);
    assert.equal(draft.name, "Nyx");
    assert.equal(draft.namePronunciation, "nicks");
    assert.equal(draft.profile.core.traits, "patient, sly, observant");
    assert.equal(draft.color, "#2f00ff");
    assert.equal(draft.glyph, "moon");
    assert.equal(draft.face.eyesFont, "warm");
    assert.equal(draft.face.eyeCount, 2);
    assert.equal(draft.face.eyeScale, 1.2);
    assert.equal(draft.face.mouthFont, "concise");
    assert.equal(draft.face.mouthScale, 0.9);
    assert.equal(draft.face.eyeCharacter, null);
    assert.equal(draft.face.mouthCharacter, null);
    assert.equal(draft.face.blinkBar, " ");
    assert.equal(draft.face.eyeAnimation, "natural");
    assert.equal(draft.face.mouthAnimation, "none");
    assert.equal(draft.avatarDetails, null);
    assert.equal(draft.avatarSfxPrompt, "");
    assert.equal(draft.accentColor, null);
    assert.deepEqual(draft.powers, []);
    assert.equal(draft.audioVoiceProfile.baseVoiceId, "voice-8");
    assert.equal(draft.audioVoiceProfile.pitch, 0.2);
    assert.equal(draft.audioVoiceProfile.warmth, 0.35);
    assert.equal(draft.audioVoiceProfile.pace, -0.15);
    assert.ok(draft.audioVoiceProfile.accentDefinitionId);
    assert.equal(draft.audioVoiceProfile.elevenLabsEffect, "chorus");
    assert.equal(draft.audioVoiceProfile.avatarSfx, undefined);
  });
});

describe("normalizeBotGenerationPrompt", () => {
  it("keeps the brief bounded and single-line without losing ordinary prose", () => {
    const prompt = normalizeBotGenerationPrompt(`  A calm\n\narchivist ${"x".repeat(4_000)}  `);
    assert.equal(prompt.length, BOT_GENERATION_PROMPT_MAX_LENGTH);
    assert.match(prompt, /^A calm archivist/u);
    assert.doesNotMatch(prompt, /\n/u);
  });

  it("keeps generated Purpose within the editor limit at a completed sentence", () => {
    const input = completeDraft();
    input.profile = {
      ...(input.profile as Record<string, unknown>),
      purpose: {
        statement:
          "a meticulous keeper of forgotten gardens who teaches patience through weather, soil, and small rituals. This sentence must not enter the short Purpose field.",
        legacyNotes: "",
      },
    };
    const draft = normalizeBotGeneratedDraftV1(input);
    assert.ok(draft);
    assert.equal(
      draft.profile.purpose.statement,
      "a meticulous keeper of forgotten gardens who teaches patience through weather, soil, and small rituals.",
    );
    assert.ok(draft.profile.purpose.statement.length <= 120);
  });
});

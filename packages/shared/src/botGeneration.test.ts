import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_GENERATION_PROMPT_MAX_LENGTH,
  normalizeBotGeneratedDraftV1,
  normalizeBotGenerationPrompt,
} from "./botGeneration.ts";

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
    glyph: "moon",
    face: {
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
      faceThinkingFrames: ["·", "✦", "*", "✧"],
    },
    avatarDetails: {
      stamps: [
        { id: "round-glasses", offsetX: 2, offsetY: -1, scalePct: 105 },
        { id: "freckles", offsetX: 0, offsetY: 0, scalePct: 100 },
        { id: "circuit-mark", offsetX: 0, offsetY: 0, scalePct: 100 },
      ],
      ink: [
        { role: "effect", shape: "circle", x1: 64, y1: 56, x2: 72, y2: 56, size: 1 },
        { role: "talking", shape: "line", x1: 56, y1: 76, x2: 72, y2: 76, size: 2 },
      ],
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
      pace: -0.15,
      lilt: 0.3,
      bottishTone: 0.2,
      eqTilt: -0.1,
      gainDb: -1.5,
      volume: 0.9,
    },
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
  it("normalizes a complete generated bot into Avatar Studio fields", () => {
    const draft = normalizeBotGeneratedDraftV1(completeDraft(), {
      availableElevenLabsVoiceIds: ["voice-premium-nyx"],
    });
    assert.ok(draft);
    assert.equal(draft.name, "Nyx");
    assert.equal(draft.profile.core.communicationStyle, "warm");
    assert.equal(draft.profile.facts.customFacts.length, 1);
    assert.equal(draft.color, "#7a5cff");
    assert.equal(draft.glyph, "moon");
    assert.equal(draft.face.eyeCharacter, "*");
    assert.equal(draft.face.eyeCount, 2);
    assert.equal(draft.face.eyeRotationDeg, -90);
    assert.equal(draft.avatarDetails?.screen.stamps.length, 3);
    assert.ok(draft.avatarDetails?.screen.paintColorMapBase64);
    assert.equal(draft.audioVoiceProfile.baseVoiceId, "voice-8");
    assert.deepEqual(draft.powers, []);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceId, "voice-premium-nyx");
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceIdOverride, undefined);
    assert.equal(draft.audioVoiceProfile.systemVoiceName, undefined);
    assert.equal(draft.audioVoiceProfile.elevenLabsDirection, "hushed, wry, deliberate");
    assert.equal(draft.settings.maxTokens, 1800);
  });

  it("creates at most one compiler-ready prompt Power from a master draft", () => {
    const value = completeDraft();
    value.powerPrompt = "She can hear lies as broken glass, but only from detectives.";
    const draft = normalizeBotGeneratedDraftV1(value);
    assert.ok(draft);
    assert.equal(draft.powers.length, 1);
    assert.equal(draft.powers[0]?.authoringMode, "prompt");
    assert.equal(draft.powers[0]?.intent, value.powerPrompt);
    assert.equal(draft.powers[0]?.compileStatus, "draft");
  });

  it("rejects invented premium voice IDs while preserving the local equivalent", () => {
    const input = completeDraft();
    const draft = normalizeBotGeneratedDraftV1(input, {
      availableElevenLabsVoiceIds: ["different-provider-voice"],
    });
    assert.ok(draft);
    assert.equal(draft.audioVoiceProfile.elevenLabsVoiceId, undefined);
    assert.equal(draft.audioVoiceProfile.baseVoiceId, "voice-8");
    assert.equal(draft.audioVoiceProfile.pitch, 0.2);
    assert.equal(draft.audioVoiceProfile.warmth, 0.35);
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
    assert.equal(draft.color, "#5ad6ff");
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
});

describe("normalizeBotGenerationPrompt", () => {
  it("keeps the brief bounded and single-line without losing ordinary prose", () => {
    const prompt = normalizeBotGenerationPrompt(`  A calm\n\narchivist ${"x".repeat(4_000)}  `);
    assert.equal(prompt.length, BOT_GENERATION_PROMPT_MAX_LENGTH);
    assert.match(prompt, /^A calm archivist/u);
    assert.doesNotMatch(prompt, /\n/u);
  });
});

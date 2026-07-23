import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDeterministicProvider } from "../test-support.ts";
import {
  BotGenerationError,
  generateBotDraft,
  generateBotField,
  parseGeneratedBotDraftText,
  sanitizeBotGenerationFieldContext,
} from "../bot-generator.ts";
import type { GenerateOptions, ProviderMessage } from "../providers.ts";

function rawDraft(voiceId: string | null = null): Record<string, unknown> {
  return {
    name: "Mara Vale",
    namePronunciation: "MAH-ruh VAYL",
    selfReferral: "Mara",
    profile: {
      v: 2,
      purpose: { statement: "a skeptical folklore investigator", legacyNotes: "" },
      core: {
        traits: "observant, dryly funny, patient under pressure",
        communicationStyle: "concise",
        openness: 1,
        conscientiousness: 2,
        extraversion: -1,
        agreeableness: 0,
        emotionalStability: 1,
        humor: null,
        curiosity: null,
        directness: null,
        interests: "oral histories, field recordings, old maps",
        boundaries: "distinguishes evidence from speculation",
        quirks: "labels unlikely theories as weather reports",
      },
      identity: {
        age: "38",
        species: "human",
        pronouns: "she/her",
        background: "a former radio producer who investigates local legends",
        role: "folklore investigator",
      },
      worldview: {
        politicalView: null,
        religion: "agnostic",
        optimism: 0,
        tradition: -1,
        values: "evidence, dignity, curiosity",
      },
      appearance: {
        description: "sharp eyes, cropped dark hair, weathered field jacket",
        style: "practical analog field gear",
        presence: "quietly alert",
      },
      facts: {
        birthday: "",
        birthMonthDay: "",
        birthYear: "",
        birthEra: "ad",
        deceased: false,
        basedOnRealPersonOrCharacter: false,
        customFacts: [{ label: "Recorder", value: "Carries a battered cassette recorder" }],
      },
    },
    color: "#4F8C7A",
    glyph: "telescope",
    face: {
      faceEyesFont: "concise",
      faceEyeCharacter: null,
      faceEyeCount: 1,
      faceEyeAnimation: "none",
      faceEyeAnimation: "none",
      faceMouthFont: "concise",
      faceMouthCharacter: "_",
      faceMouthAnimation: "flicker",
      faceMouthCoffeePucker: false,
      faceFontWeight: 650,
      faceEyeScale: 0.95,
      faceEyeOffsetX: 0,
      faceEyeOffsetY: -0.02,
      faceEyeRotationDeg: 0,
      faceMouthScale: 0.9,
      faceMouthOffsetX: 0,
      faceMouthOffsetY: 0.03,
      faceMouthRotationDeg: 0,
      faceBlinkBar: " ",
      faceBlinkScale: 1,
      faceBlinkOffsetX: 0,
      faceBlinkOffsetY: 0,
      faceBlinkRotationDeg: 0,
      faceThinkingFrames: ["|", "/", "-", "\\"],
    },
    avatarDetails: {
      stamps: [{ id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 }],
      ink: [{ role: "effect", shape: "line", x1: 45, y1: 68, x2: 52, y2: 71, size: 1 }],
    },
    voice: {
      baseVoiceId: "voice-7",
      elevenLabsVoiceId: voiceId,
      elevenLabsEffect: "radio",
      elevenLabsDirection: "measured, dry, observant",
      elevenLabsStability: 0.72,
      pitch: -0.1,
      warmth: -0.05,
      pace: -0.1,
      lilt: -0.1,
      bottishTone: 0.1,
      eqTilt: -0.15,
      gainDb: -0.5,
      volume: 0.95,
    },
    voicePreviewLine: "The tape caught something the room did not.",
    settings: {
      flirtEnabled: false,
      temperature: 0.72,
      maxTokens: 1800,
      topP: 0.9,
      topK: 45,
      repetitionPenalty: 1.08,
    },
  };
}

describe("PRISM bot generator", () => {
  it("scrubs memories, media, exact Voice IDs, routing, and secrets from field context", () => {
    assert.deepEqual(sanitizeBotGenerationFieldContext({
      name: "Mara",
      profile: { core: { traits: "dry" } },
      memories: ["private"],
      conversation: "private",
      imageData: "private",
      audioDataUrl: "private",
      elevenLabsVoiceId: "private",
      provider: "online",
      apiKey: "private",
    }), {
      name: "Mara",
      profile: { core: { traits: "dry" } },
    });
  });

  it("rerolls one semantic field locally and rejects unchanged output", async () => {
    const provider = createDeterministicProvider([JSON.stringify({ value: "Mara Voss" })]);
    const result = await generateBotField({
      fieldKey: "identity.name",
      currentValue: "Mara Vale",
      context: { name: "Mara Vale", memories: ["private"] },
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });
    assert.equal(result.fieldKey, "identity.name");
    assert.equal(result.value, "Mara Voss");
    assert.equal(result.providerNameUsed, "local");
    assert.equal(provider.calls.length, 1);
    await assert.rejects(
      generateBotField({
        fieldKey: "identity.name",
        currentValue: "Mara Vale",
        context: {},
        provider: createDeterministicProvider([JSON.stringify({ value: "Mara Vale" })]),
        providerName: "local",
        model: "llama-local",
        responseMode: "local",
      }),
      (error: unknown) => error instanceof BotGenerationError && error.kind === "invalid_output",
    );
  });

  it("parses fenced model JSON and accepts only catalog-backed Premium voices", () => {
    const parsed = parseGeneratedBotDraftText(
      `\n\`\`\`json\n${JSON.stringify(rawDraft("premium-mara"))}\n\`\`\``,
      ["premium-mara"],
    );
    assert.ok(parsed);
    assert.equal(parsed.name, "Mara Vale");
    assert.equal(parsed.audioVoiceProfile.elevenLabsVoiceId, "premium-mara");
    assert.equal(parsed.audioVoiceProfile.baseVoiceId, "voice-7");
    assert.equal(parsed.face.eyeCount, 1);
    assert.equal(parsed.face.eyeRotationDeg, 0);
    assert.equal(parsed.face.mouthCoffeePucker, false);
    assert.deepEqual(parsed.avatarDetails?.screen.stamps, []);
    assert.ok(parsed.avatarDetails?.screen.paintColorMapBase64);
  });

  it("keeps LOCAL generation on the supplied local provider and requests structured output", async () => {
    const provider = createDeterministicProvider([JSON.stringify(rawDraft())]);
    const deterministicGenerate = provider.generateResponse.bind(provider);
    let capturedOptions: GenerateOptions | undefined;
    provider.generateResponse = async (
      messages: ProviderMessage[],
      options?: GenerateOptions,
    ) => {
      capturedOptions = options;
      return deterministicGenerate(messages, options);
    };
    const result = await generateBotDraft({
      prompt: "A skeptical folklore investigator with a cassette recorder.",
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
      voiceCatalog: [],
    });
    assert.equal(result.providerNameUsed, "local");
    assert.equal(result.modelUsed, "llama-local");
    assert.equal(result.draft.audioVoiceProfile.elevenLabsVoiceId, undefined);
    assert.equal(provider.calls.length, 1);
    assert.equal(capturedOptions?.model, "llama-local");
    assert.equal(capturedOptions?.jsonMode, true);
    assert.equal(capturedOptions?.jsonSchemaName, "prism_bot_generated_draft_v1");
    assert.ok(capturedOptions?.jsonSchema);
    assert.doesNotMatch(JSON.stringify(capturedOptions?.jsonSchema), /"stamps"/u);
    assert.deepEqual(result.draft.avatarDetails?.screen.stamps, []);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /No ElevenLabs catalog is available/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Do not create memories/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Do not create stamps or accessories/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /faceMouthCoffeePucker true by default/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /faceEyeCount is 2, set faceEyeRotationDeg to -90/u,
    );
  });

  it("retains a useful retry error when the model output is malformed", async () => {
    const provider = createDeterministicProvider(["not json"]);
    await assert.rejects(
      () => generateBotDraft({
        prompt: "A meticulous archivist.",
        provider,
        providerName: "local",
        model: "llama-local",
        responseMode: "local",
      }),
      (error: unknown) =>
        error instanceof BotGenerationError &&
        error.kind === "invalid_output" &&
        /brief is still here/iu.test(error.message),
    );
  });

  it("refuses an empty brief before calling a model", async () => {
    const provider = createDeterministicProvider([JSON.stringify(rawDraft())]);
    await assert.rejects(
      () => generateBotDraft({
        prompt: "   ",
        provider,
        providerName: "local",
        model: "llama-local",
        responseMode: "local",
      }),
      (error: unknown) =>
        error instanceof BotGenerationError && error.kind === "invalid_prompt",
    );
    assert.equal(provider.calls.length, 0);
  });
});

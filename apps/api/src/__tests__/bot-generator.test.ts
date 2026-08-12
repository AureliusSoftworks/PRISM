import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

describe("bot generation route", () => {
  it("honors live navbar model and effort while preserving Auto routing", () => {
    const routeSource = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/bots/generate-draft"'),
      serverSource.indexOf('route("POST", "/api/bots"'),
    );

    assert.match(routeSource, /readModelOverride\(body\.modelOverride\)/u);
    assert.match(routeSource, /requestedModelOverride\?\.toLowerCase\(\) === "auto"/u);
    assert.match(routeSource, /explicitModelOverride,/u);
    assert.match(routeSource, /normalizeProviderReasoningEffort\(body\.reasoningEffort\)/u);
    assert.match(routeSource, /requestedProviderReasoningEffort === "max"/u);
    assert.match(routeSource, /storedReasoningEffort !== "xhigh"/u);
    assert.match(routeSource, /!resolvedEffortCapability\.supportsMax/u);
    assert.match(routeSource, /resolvedEffortCapability\.levels\.includes\(requestedReasoningEffort\)/u);
    assert.match(routeSource, /resolved\.autoRoute\?\.reasoningEffort/u);
    assert.match(routeSource, /reasoningEffort,/u);
    assert.doesNotMatch(routeSource, /requestElevenLabsVoiceCatalog/u);
    assert.doesNotMatch(routeSource, /voiceCatalog/u);
  });
});

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
        responseCues: {
          v: 1,
          enabled: true,
          interruption: ["Tape stopped.", "New lead."],
          redirect: ["Changing reels.", "Following that signal."],
          waiting: ["Checking the tape…", "Listening again…"],
          blockedDefaults: [],
        },
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
    accentColor: "#7799AA",
    glyph: "telescope",
    face: {
      intentionalCustomEyes: false,
      intentionalCustomMouth: false,
      intentionalCustomBlink: false,
      intentionalEyeGeometryException: false,
      intentionalMouthGeometryException: false,
      intentionalBlinkGeometryException: false,
      faceEyesFont: "concise",
      faceEyeCharacter: null,
      faceEyeCount: 1,
      faceEyeAnimation: "natural",
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
      ink: [
        {
          role: "effect",
          points: [
            { x: 36, y: 30 },
            { x: 50, y: 22 },
            { x: 78, y: 22 },
            { x: 92, y: 30 },
          ],
          closed: false,
          fill: false,
          size: 2,
        },
      ],
      speechInkAnimation: "none",
    },
    voice: {
      baseVoiceId: "voice-7",
      elevenLabsVoiceId: voiceId,
      elevenLabsEffect: "radio",
      elevenLabsDirection: "measured, dry, observant",
      elevenLabsStability: 0.72,
      pitch: -0.1,
      warmth: -0.05,
      openness: 0.15,
      weight: -0.1,
      brightness: -0.2,
      resonance: 0.25,
      pace: -0.1,
      lilt: -0.1,
      bottishTone: 0.1,
      eqTilt: -0.15,
      gainDb: -0.5,
      volume: 0.95,
    },
    avatarSfxPrompt: "Soft cassette transport ticks and a muted relay hum",
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

  it("rerolls a concise Power name from the original Power prompt", async () => {
    const provider = createDeterministicProvider([
      JSON.stringify({ value: "Borrowed Voice" }),
    ]);
    const result = await generateBotField({
      fieldKey: "power.name",
      currentValue: "Mask Relay",
      context: {
        power: {
          name: "Mask Relay",
          prompt: "A floating puppet speaks whenever the bot is asked a personal question.",
        },
      },
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });

    assert.equal(result.value, "Borrowed Voice");
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /concise, evocative Power title/u,
    );
    assert.match(
      provider.calls[0]?.[1]?.content ?? "",
      /floating puppet speaks/u,
    );
  });

  it("parses fenced model JSON while keeping premium voice identity unlinked", () => {
    const parsed = parseGeneratedBotDraftText(
      `\n\`\`\`json\n${JSON.stringify(rawDraft("premium-mara"))}\n\`\`\``,
    );
    assert.ok(parsed);
    assert.equal(parsed.name, "Mara Vale");
    assert.equal(parsed.accentColor, "#22b5ff");
    assert.equal(parsed.namePronunciation, "");
    assert.equal(parsed.selfReferral, "");
    assert.equal(parsed.audioVoiceProfile.elevenLabsVoiceId, undefined);
    assert.equal(parsed.audioVoiceProfile.elevenLabsVoiceInitialized, true);
    assert.equal(parsed.audioVoiceProfile.baseVoiceId, "voice-7");
    assert.equal(parsed.audioVoiceProfile.openness, 0.15);
    assert.equal(parsed.audioVoiceProfile.weight, -0.1);
    assert.equal(parsed.audioVoiceProfile.brightness, -0.2);
    assert.equal(parsed.audioVoiceProfile.resonance, 0.25);
    assert.deepEqual(parsed.profile.core.responseCues?.interruption, [
      "Tape stopped.",
      "New lead.",
    ]);
    assert.equal(
      parsed.avatarSfxPrompt,
      "Soft cassette transport ticks and a muted relay hum",
    );
    assert.equal(parsed.face.eyeCount, 1);
    assert.equal(parsed.face.eyeRotationDeg, 0);
    assert.equal(parsed.face.mouthCoffeePucker, false);
    assert.deepEqual(parsed.avatarDetails?.screen.stamps, []);
    assert.ok(parsed.avatarDetails?.screen.paintColorMapBase64);
    assert.equal(parsed.face.eyeOffsetX, 0);
    assert.equal(parsed.face.eyeOffsetY, 0.18);
    assert.equal(parsed.face.blinkOffsetX, 0);
    assert.equal(parsed.face.blinkOffsetY, 0.18);
    assert.equal(parsed.face.mouthScale, 0.7);
    assert.equal(parsed.face.mouthOffsetX, 0.04);
    assert.equal(parsed.face.mouthOffsetY, 0.22);
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
    assert.doesNotMatch(JSON.stringify(capturedOptions?.jsonSchema), /elevenLabsVoiceId/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /"points"/u);
    assert.match(
      JSON.stringify(capturedOptions?.jsonSchema),
      /"enum":\["blink","talking","effect"\]/u,
    );
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /"maxItems":8/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /speechInkAnimation/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /responseCues/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /avatarSfxPrompt/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /"openness"/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /"resonance"/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /faceThinkingScale/u);
    assert.doesNotMatch(JSON.stringify(capturedOptions?.jsonSchema), /namePronunciation/u);
    assert.doesNotMatch(JSON.stringify(capturedOptions?.jsonSchema), /selfReferral/u);
    assert.match(
      JSON.stringify(capturedOptions?.jsonSchema),
      /"powerPrompt":\{"type":"string","minLength":24,"maxLength":640\}/u,
    );
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /intentionalCustomEyes/u);
    assert.match(JSON.stringify(capturedOptions?.jsonSchema), /intentionalCustomBlink/u);
    assert.match(
      JSON.stringify(capturedOptions?.jsonSchema),
      /"statement":\{"type":"string","maxLength":120\}/u,
    );
    assert.deepEqual(result.draft.avatarDetails?.screen.stamps, []);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /named local PRISM Voice Pack timbre/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Accent and map location are separate player-authored choices/u,
    );
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Do not select or link an ElevenLabs voice/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /response cues/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /vocal weight/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /avatarSfxPrompt/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /subtle seamless thinking loop/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Do not create memories/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /primary bot color picker has no saturation or lightness axis/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /alloy\/phosphor body/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /canonicalized to 100% saturation and 50% lightness/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /buckle glyph as the persona's compact signature/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /deliberately usable for this persona/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /visibly distinguishes atmosphere from the bot body/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /start from analogous tones, then step to triadic\/contrasting/i);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Always set powerPrompt to exactly one concise, player-readable sentence/u,
    );
    assert.match(provider.calls[0]?.[0]?.content ?? "", /whole character/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /concrete trigger, affected target or subject, observable consequence, and a real boundary/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /never remove another person's agency/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /generic buff, ordinary talent or job skill, personality restatement, random gimmick/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Do not create stamps or raw image\/accessory data/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /safe,\s*low-noise pixel-portrait accent layer/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /smaller canonical 100% size: physical scale 0\.7, rotation 0, x 0\.04, y 0\.22/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /compact live mouth around 67,90/u,
    );
    assert.match(provider.calls[0]?.[0]?.content ?? "", /eye window x 42-86 and y 50-70/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Effect\/green for stable silhouette/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Blink\/red for optional eyelashes/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Speech\/blue for commonly useful lips/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /hide while the bot talks/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /custom blink is the rarest exception/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /visible facing requires nonstandard alignment/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /pulsate, spin, flicker, or wobble/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /subtle three-quarter view/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /player explicitly requests a straight-on portrait/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Keep live face landmarks fixed, level, and readable/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /faceMouthCoffeePucker true by default/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /built-in eye and mouth characters/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /intentionalCustomEyes/u,
    );
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Bob Ross-scale accents/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Prefer sparse, low-complexity contours/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /first canonical hair or hat\/headwear, second canonical facial hair/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /only when neither supplies the character's defining read.*one key recognizable character cue/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Use both hair\/headwear and facial hair when both are essential/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Never draw the head itself or a nose/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /no enclosing head\/face\/skull outline, jaw contour, or nasal mark/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /circular CRT already supplies the head/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Live eyes and live mouth must stay readable and owned by the Face layer/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Speech\/blue/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /facial-hair pixels only when they are near the animated mouth/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Stable facial hair farther from the mouth may remain Effect ink/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Speech ink is allowed for facial hair only near animated-mouth pixels/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Preserve minimal-ink defaults/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /never add a beard as generic decoration/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Bob Ross \(beard plus rounded hair edge\)/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Alan Watts \(beard, mustache, and hair silhouette\)/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Thomas Hobbes \(mustache and facial hair\)/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Jesus Christ \(beard and hairline\)/u,
    );
  });

  it("uses explicit LOCAL effort for private preparation and the final structured draft", async () => {
    const provider = createDeterministicProvider([
      "Keep the cartographer coherent and protect the JSON contract.",
      JSON.stringify(rawDraft()),
    ]);
    const deterministicGenerate = provider.generateResponse.bind(provider);
    const capturedOptions: GenerateOptions[] = [];
    provider.generateResponse = async (
      messages: ProviderMessage[],
      options?: GenerateOptions,
    ) => {
      if (options) capturedOptions.push(options);
      return deterministicGenerate(messages, options);
    };

    const result = await generateBotDraft({
      prompt: "A lunar cartographer with dry warmth.",
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
      reasoningEffort: "low",
    });

    assert.equal(result.modelUsed, "llama-local");
    assert.equal(provider.calls.length, 2);
    assert.equal(capturedOptions[0]?.usagePurpose, "psychic_planning");
    assert.equal(capturedOptions[1]?.usagePurpose, "bot_generation");
    assert.equal(capturedOptions[1]?.reasoningEffort, "low");
    assert.match(
      provider.calls[1]?.at(-1)?.content ?? "",
      /Private PRISM preparation notes follow/u,
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

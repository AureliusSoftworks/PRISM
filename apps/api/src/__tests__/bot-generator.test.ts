import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createDeterministicProvider } from "../test-support.ts";
import {
  BotGenerationError,
  botGenerationModelSupportsStructuredOutput,
  generateAvatarDetailsInk,
  generateBotDraft,
  generateBotField,
  parseGeneratedBotDraftText,
  sanitizeBotGenerationFieldContext,
} from "../bot-generator.ts";
import type { GenerateOptions, ProviderMessage } from "../providers.ts";
import { decodeBotAvatarDetailsPaintColorMap } from "@localai/shared";

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

describe("bot generation route", () => {
  it("uses dynamic Auto escalation for Power compilation without borrowing the fixed-model chain", () => {
    const routeSource = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/bot-powers/compile"'),
      serverSource.indexOf('route("POST", "/api/bots/generate-field"'),
    );

    assert.match(routeSource, /resolveAutoModelRoutePlan\(/u);
    assert.match(
      routeSource,
      /const recoveryChain:[\s\S]*?resolved\.autoRoute[\s\S]*?: parseStoredAutoFallbackChain\(user\.auto_fallback_chain\)/u,
    );
    assert.match(routeSource, /reasoningEffort: route\.reasoningEffort/u);
    assert.match(routeSource, /providerWithTextRecovery\(/u);
  });

  it("keeps refracted Ink on the selected LOCAL/ONLINE lane without image generation", () => {
    const routeSource = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/bots/generate-avatar-details-ink"'),
      serverSource.indexOf('route("POST", "/api/bots/generate-draft"'),
    );
    assert.match(routeSource, /responseMode === "local"\s*\? "local"/u);
    assert.match(routeSource, /const onlineAllowed = responseMode !== "local"/u);
    assert.match(routeSource, /getOpenAiApiKeyForUser[\s\S]*: undefined/u);
    assert.match(routeSource, /generateAvatarDetailsInk\(/u);
    assert.doesNotMatch(routeSource, /generateImage|\/api\/images\/generate/u);
  });
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
    assert.match(routeSource, /buildBotGenerationVoiceCatalogForUser/u);
    assert.match(routeSource, /voiceCatalog,/u);
  });

  it("builds one account-eligible voice catalog for direct and internal generation", () => {
    const helperSource = serverSource.slice(
      serverSource.indexOf("async function buildBotGenerationVoiceCatalogForUser"),
      serverSource.indexOf("async function checkPrismCreditMonitorForUser"),
    );
    const internalSource = serverSource.slice(
      serverSource.indexOf("const prismCapabilityRegistry"),
      serverSource.indexOf("function botIdsFromPrismCapabilityInput"),
    );

    assert.match(helperSource, /operating_system_voices_enabled !== 0/u);
    assert.match(helperSource, /getSystemVoiceCapabilities/u);
    assert.match(helperSource, /args\.onlineAllowed && args\.userKey/u);
    assert.match(helperSource, /requestElevenLabsVoiceCatalog/u);
    assert.match(helperSource, /elevenlabs_voice_collection_id/u);
    assert.match(internalSource, /buildBotGenerationVoiceCatalogForUser/u);
    assert.match(internalSource, /onlineAllowed: false/u);
    assert.match(internalSource, /voiceCatalog,/u);
  });

  it("rehydrates Inspire sources from owned Library rows", () => {
    const routeSource = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/bots/generate-draft"'),
      serverSource.indexOf('route("POST", "/api/bots"'),
    );

    assert.match(routeSource, /WHERE id = \? AND user_id = \?/u);
    assert.match(routeSource, /SELECT id, name, system_prompt, color FROM bots/u);
    assert.match(routeSource, /stripBotProfileMetaSuffix\(row\.system_prompt\)/u);
    assert.match(routeSource, /Choose at least one bot from your Library/u);
    assert.match(routeSource, /inspirationSources: inspirationRows\.map/u);
    assert.match(routeSource, /blendWeightedBotIdentityColors\(/u);
    assert.match(routeSource, /requestedGenerationContext\.mode === "inspire" && inspiredPrimaryColor/u);
    assert.match(routeSource, /color: inspiredPrimaryColor/u);
  });

  it("re-resolves explicit brief Power intent for older clients before generation", () => {
    const routeSource = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/bots/generate-draft"'),
      serverSource.indexOf('route("POST", "/api/bots"'),
    );

    assert.match(
      routeSource,
      /resolveBotFoundryGenerationContextForBriefV1\(body\.generationContext, prompt\)/u,
    );
    assert.match(routeSource, /result\.draft\.powers\.length > 0/u);
    assert.match(routeSource, /compileBotPowers\([\s\S]*?powers: result\.draft\.powers/u);
    assert.match(routeSource, /powers: compiledPowers\?\.powers \?\? draft\.powers/u);
    assert.match(routeSource, /includeBatchGroupIdentity/u);
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
      accentPronunciationEnabled: false,
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

function rawLeanDraft(): Record<string, unknown> {
  const rich = rawDraft();
  return {
    name: rich.name,
    namePronunciation: rich.namePronunciation,
    profile: rich.profile,
    color: rich.color,
    glyph: rich.glyph,
    face: {
      faceEyesFont: "warm",
      faceEyeCount: 2,
      faceEyeScale: 1.15,
      faceMouthFont: "concise",
      faceMouthScale: 0.85,
    },
    voiceBaseId: "voice-7",
    voicePreviewLine: rich.voicePreviewLine,
    batchGroupIdentity: {
      name: "Midnight Relay",
      description: "Distinct night-shift personalities linked by one shared signal.",
    },
  };
}

describe("PRISM bot generator", () => {
  it("rasterizes valid refracted Ink and rejects malformed output without a fallback mutation", async () => {
    const valid = await generateAvatarDetailsInk({
      prompt: "a sparse comet crown",
      provider: createDeterministicProvider([
        JSON.stringify({
          avatarDetails: {
            ink: [{
              role: "effect",
              points: [{ x: 42, y: 28 }, { x: 58, y: 20 }, { x: 74, y: 28 }],
              closed: false,
              fill: false,
              size: 2,
            }],
            speechInkAnimation: "none",
          },
        }),
      ]),
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });
    assert.ok(valid.details.screen.paintColorMapBase64);

    const defaulted = await generateAvatarDetailsInk({
      prompt: "a sparse comet crown",
      provider: createDeterministicProvider([
        JSON.stringify({
          avatarDetails: {
            ink: [{
              role: "talking",
              points: [{ x: 42, y: 28 }, { x: 58, y: 20 }, { x: 74, y: 28 }],
              closed: false,
              fill: false,
              size: 2,
            }],
            speechInkAnimation: "wobble",
          },
        }),
      ]),
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });
    assert.equal(defaulted.details.screen.speechInkAnimation, undefined);
    assert.equal(
      Array.from(
        decodeBotAvatarDetailsPaintColorMap(
          defaulted.details.screen.paintColorMapBase64,
        ),
      ).some((byte) => [6, 4, 2, 0].some((shift) => ((byte >>> shift) & 0x03) === 2)),
      false,
    );

    await assert.rejects(
      () => generateAvatarDetailsInk({
        prompt: "a sparse comet crown",
        provider: createDeterministicProvider(["not json"]),
        providerName: "local",
        model: "llama-local",
        responseMode: "local",
      }),
      (error: unknown) =>
        error instanceof BotGenerationError && error.kind === "invalid_output",
    );
  });
  it("hydrates every batch draft with its own persisted Accent Map location", async () => {
    const generate = (batchIndex: number) =>
      generateBotDraft({
        prompt: "A midnight field crew",
        generationContext: {
          mode: "batch",
          powers: { enabled: false, count: 1, craziness: 50 },
          resemblance: 50,
          inspirationSources: [],
          batchIndex,
          batchCount: 3,
        },
        provider: createDeterministicProvider([JSON.stringify(rawDraft())]),
        providerName: "local",
        model: "llama-local",
        responseMode: "local",
      });
    const [first, second, third] = await Promise.all([generate(1), generate(2), generate(3)]);
    const points = [first, second, third].map(
      ({ draft }) => draft.audioVoiceProfile.pronunciationMapPoint,
    );
    assert.ok(points.every(Boolean));
    assert.equal(
      new Set(points.map((point) => `${point!.x}:${point!.y}`)).size,
      3,
    );
  });

  it("uses the same eligible voice and Accent Map contract for standard and automatic drafts", async () => {
    const standard = rawDraft();
    standard.voice = {
      ...(standard.voice as Record<string, unknown>),
      voiceIdentity: "premium:allotted-voice",
      accentDefinitionId: "irish-english",
      speechprintStrength: "light",
      elevenLabsEffect: "chorus",
    };
    const lean = rawLeanDraft();
    lean.voice = {
      voiceIdentity: "os:Alex",
      baseVoiceId: "voice-3",
      accentDefinitionId: "british-english",
      speechprintStrength: "balanced",
      elevenLabsEffect: "chorus",
      elevenLabsDirection: null,
      elevenLabsStability: 0.5,
      pitch: -0.2,
      warmth: 0.1,
      openness: 0,
      weight: 0,
      brightness: 0,
      resonance: 0,
      pace: -0.15,
      lilt: 0.2,
      bottishTone: 0.45,
      eqTilt: 0,
      gainDb: 0,
      volume: 1,
    };
    const richProvider = createDeterministicProvider([
      "Keep the archive keeper's voice measured.",
      JSON.stringify(standard),
    ]);
    const leanProvider = createDeterministicProvider([
      "Keep the operator's voice attentive.",
      JSON.stringify(lean),
    ]);
    const catalog = {
      operatingSystemVoiceNames: ["Alex"],
      premiumVoices: [{ voiceId: "allotted-voice", name: "Archive" }],
    };
    const richResult = await generateBotDraft({
      prompt: "An Irish archive keeper.", provider: richProvider, providerName: "local",
      model: "llama-local", responseMode: "local", voiceCatalog: catalog, reasoningEffort: "low",
    });
    const leanResult = await generateBotDraft({
      prompt: "A careful night operator.", provider: leanProvider, providerName: "local",
      model: "llama-local", responseMode: "local", voiceCatalog: catalog,
      generationContext: { mode: "batch", powers: { enabled: false, count: 0, craziness: 0 }, resemblance: 50, inspirationSources: [], batchIndex: 12, batchCount: 12 }, reasoningEffort: "low",
    });
    assert.equal(richResult.draft.audioVoiceProfile.elevenLabsVoiceId, "allotted-voice");
    assert.equal(richResult.draft.audioVoiceProfile.accentDefinitionId, "irish-english");
    assert.equal(richResult.draft.namePronunciation, "");
    assert.equal(leanResult.draft.audioVoiceProfile.systemVoiceName, "Alex");
    assert.equal(
      leanResult.draft.audioVoiceProfile.accentDefinitionId,
      "modern-rp-english",
    );
    assert.ok(leanResult.draft.audioVoiceProfile.pronunciationMapPoint);
    assert.equal(leanResult.draft.audioVoiceProfile.pace, -0.15);
    assert.equal(leanResult.draft.namePronunciation, "");
    const prompts = [...richProvider.calls, ...leanProvider.calls]
      .map((call) => call[0]?.content ?? "").join("\n");
    assert.match(prompts, /portable:voice-28/u);
    assert.match(prompts, /premium:allotted-voice/u);
    assert.match(prompts, /os:Alex/u);
    assert.match(
      prompts,
      /1-3 comma-separated delivery cues[\s\S]*never end mid-word/u,
    );
    assert.match(
      prompts,
      /accentPronunciationEnabled true only for a historically or biographically accurate real person[\s\S]*false for every fictional character and original persona/u,
    );
  });

  it("uses Prism unless the player explicitly requests another voice effect", async () => {
    const modelDraft = rawDraft();
    modelDraft.voice = {
      ...(modelDraft.voice as Record<string, unknown>),
      elevenLabsEffect: "radio",
    };
    const defaultProvider = createDeterministicProvider([
      "Keep the delivery restrained.",
      JSON.stringify(modelDraft),
    ]);
    const explicitProvider = createDeterministicProvider([
      "Give the delivery a broadcast texture.",
      JSON.stringify(modelDraft),
    ]);
    const defaults = await generateBotDraft({
      prompt: "A midnight archive keeper.",
      provider: defaultProvider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
      reasoningEffort: "low",
    });
    const explicit = await generateBotDraft({
      prompt: "A midnight archive keeper with a radio voice effect.",
      provider: explicitProvider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
      reasoningEffort: "low",
    });
    assert.equal(defaults.draft.audioVoiceProfile.elevenLabsEffect, "chorus");
    assert.equal(explicit.draft.audioVoiceProfile.elevenLabsEffect, "radio");
  });

  it("skips a known incompatible structured-output model before using its online fallback", async () => {
    const incompatible = createDeterministicProvider(["should not run"]);
    const fallback = createDeterministicProvider([JSON.stringify(rawDraft())]);

    const result = await generateBotDraft({
      prompt: "Create a concise folklore investigator.",
      provider: incompatible,
      providerName: "openai",
      model: "gpt-3.5-turbo",
      responseMode: "online",
      autoFallbackChain: {
        v: 1,
        fallbacks: [{ provider: "openai", model: "gpt-5.6-luna" }],
      },
      openAiApiKey: "configured-for-test",
      providerFactory: () => fallback,
    });

    assert.equal(
      botGenerationModelSupportsStructuredOutput({
        provider: "openai",
        model: "gpt-3.5-turbo",
      }),
      false,
    );
    assert.equal(incompatible.calls.length, 0);
    assert.equal(fallback.calls.length, 1);
    assert.equal(result.providerNameUsed, "openai");
    assert.equal(result.modelUsed, "gpt-5.6-luna");
  });

  it("rejects generic Power activation filler and retries a valid generated Power", async () => {
    const placeholder = rawDraft();
    placeholder.powerPrompts = ["Lantern Voice Power activated!"];
    const canonical = rawDraft();
    canonical.powerPrompts = ["Cursed Tongue Power activated!"];
    const primary = createDeterministicProvider([JSON.stringify(placeholder)]);
    const fallback = createDeterministicProvider([JSON.stringify(canonical)]);

    const result = await generateBotDraft({
      prompt: "Create a warm cooking guide with one Power.",
      generationContext: {
        mode: "standard",
        powers: { enabled: true, count: 1, craziness: 50 },
        resemblance: 50,
        inspirationSources: [],
      },
      provider: primary,
      providerName: "openai",
      model: "primary-online",
      responseMode: "auto",
      autoFallbackChain: {
        v: 1,
        fallbacks: [{ provider: "anthropic", model: "fallback-online" }],
      },
      openAiApiKey: "configured-for-test",
      anthropicApiKey: "configured-for-test",
      providerFactory: () => fallback,
    });

    assert.equal(primary.calls.length, 1);
    assert.equal(fallback.calls.length, 1);
    assert.equal(result.providerNameUsed, "anthropic");
    assert.equal(result.modelUsed, "fallback-online");
    assert.equal(
      result.draft.powers[0]?.intent,
      "Every non-silent public spoken reply is involuntarily laced with frequent strong non-slur profanity; their private intended wording stays clean.",
    );
  });

  it("keeps a three-bot automatic batch on the rich schema and selected Power budget", async () => {
    const generated = rawDraft();
    generated.powerPrompts = [
      "Static briefly reveals nearby hidden writing, but never private messages.",
    ];
    generated.batchGroupIdentity = {
      name: "Midnight Relay",
      description: "Three distinct night-shift personalities linked by one shared signal.",
    };
    let capturedOptions: GenerateOptions | undefined;
    const provider = createDeterministicProvider([JSON.stringify(generated)]);
    const deterministicGenerate = provider.generateResponse.bind(provider);
    provider.generateResponse = async (messages, options) => {
      capturedOptions = options;
      return deterministicGenerate(messages, options);
    };

    const result = await generateBotDraft({
      prompt: "Create three strange night-shift radio personalities.",
      generationContext: {
        mode: "batch",
        powers: { enabled: true, count: 1, craziness: 60 },
        resemblance: 50,
        inspirationSources: [],
        batchIndex: 1,
        batchCount: 3,
      },
      includeBatchGroupIdentity: true,
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });

    const schema = JSON.stringify(capturedOptions?.jsonSchema);
    assert.equal(capturedOptions?.allowFinalLocalFallback, false);
    assert.match(schema, /"avatarDetails"/u);
    assert.match(schema, /"avatarSfxPrompt"/u);
    assert.match(schema, /"powerPrompts":\{"type":"array","minItems":1,"maxItems":1/u);
    assert.match(schema, /"elevenLabsDirection"/u);
    assert.equal(result.draft.powers.length, 1);
    assert.ok(result.draft.avatarDetails);
    assert.equal(result.draft.accentColor, "#22b5ff");
    assert.equal(result.draft.audioVoiceProfile.pitch, -0.1);
    assert.deepEqual(result.batchGroupIdentity, generated.batchGroupIdentity);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /rich automatic bot 1 of 3/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Keep runtime Power mechanics separate from the underlying persona/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /post-generation speech transformation/u,
    );
  });

  it("uses a genuinely lean schema, forces no Powers, and returns one group identity", async () => {
    let capturedOptions: GenerateOptions | undefined;
    const provider = createDeterministicProvider([JSON.stringify(rawLeanDraft())]);
    const deterministicGenerate = provider.generateResponse.bind(provider);
    provider.generateResponse = async (messages, options) => {
      capturedOptions = options;
      return deterministicGenerate(messages, options);
    };
    const result = await generateBotDraft({
      prompt: "A century of strange night-shift radio personalities with Powers.",
      generationContext: {
        mode: "batch",
        powers: { enabled: true, count: 3, craziness: 100 },
        resemblance: 50,
        inspirationSources: [],
        batchIndex: 1,
        batchCount: 100,
      },
      includeBatchGroupIdentity: true,
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });
    const schema = JSON.stringify(capturedOptions?.jsonSchema);
    assert.match(schema, /"voiceIdentity"/u);
    assert.match(schema, /"accentDefinitionId"/u);
    assert.match(schema, /"batchGroupIdentity"/u);
    for (const forbidden of [
      "powerPrompts",
      "avatarDetails",
      "accentColor",
      "avatarSfxPrompt",
      "faceEyeCharacter",
      "faceMouthCharacter",
      "faceThinkingFrames",
    ]) {
      assert.equal(schema.includes(`"${forbidden}"`), false, forbidden);
    }
    assert.deepEqual(result.batchGroupIdentity, {
      name: "Midnight Relay",
      description: "Distinct night-shift personalities linked by one shared signal.",
    });
    assert.deepEqual(result.draft.powers, []);
    assert.equal(result.draft.avatarDetails, null);
    assert.equal(result.draft.accentColor, null);
    assert.equal(result.draft.face.eyeCount, 2);
    assert.equal(result.draft.audioVoiceProfile.baseVoiceId, "voice-7");
    assert.equal(result.draft.audioVoiceProfile.pitch, 0);
    const leanPrompt = provider.calls[0]?.[0]?.content ?? "";
    assert.match(leanPrompt, /lean automatic batch/u);
    assert.match(leanPrompt, /Personality is the primary differentiator/u);
    assert.match(leanPrompt, /Do not emit Powers/u);
    assert.doesNotMatch(leanPrompt, /Avatar ink is a safe/u);
    assert.doesNotMatch(leanPrompt, /Tune pitch, warmth/u);
    assert.doesNotMatch(leanPrompt, /avatarSfxPrompt/u);
  });

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
    await assert.rejects(
      generateBotField({
        fieldKey: "identity.namePronunciation",
        currentValue: "",
        context: { name: "Mara Vale" },
        provider: createDeterministicProvider([
          JSON.stringify({ value: "MAH-ruh VAYL" }),
        ]),
        providerName: "local",
        model: "llama-local",
        responseMode: "local",
      }),
      (error: unknown) =>
        error instanceof BotGenerationError &&
        error.kind === "invalid_prompt" &&
        /player-authored only/u.test(error.message),
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

  it("repairs a prompt-fragment Power title with a fresh valid fallback", async () => {
    const provider = createDeterministicProvider([
      JSON.stringify({ value: "When Jim Makes" }),
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

    assert.equal(result.fieldKey, "power.name");
    assert.equal(typeof result.value, "string");
    assert.notEqual(result.value, "Mask Relay");
    assert.doesNotMatch(String(result.value), /^(?:when|whenever|while|if)\b/iu);
    assert.equal(provider.calls.length, 1);
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
    assert.equal(parsed.face.eyeOffsetY, 0);
    assert.equal(parsed.face.blinkOffsetX, 0);
    assert.equal(parsed.face.blinkOffsetY, 0);
    assert.equal(parsed.face.mouthScale, 0.7);
    assert.equal(parsed.face.mouthOffsetX, 0);
    assert.equal(parsed.face.mouthOffsetY, 0);
  });

  it("pins requested Power count, fixed strength budget, and craziness in the generation contract", async () => {
    const generated = rawDraft();
    generated.powerPrompts = [
      "Rain reveals one hidden regret nearby, but never who owns it.",
      "A spoken nickname briefly changes gravity for its speaker alone.",
      "Every third silence grows visible moss, which vanishes when addressed.",
    ];
    let capturedOptions: GenerateOptions | undefined;
    const provider = createDeterministicProvider([JSON.stringify(generated)]);
    const deterministicGenerate = provider.generateResponse.bind(provider);
    provider.generateResponse = async (messages, options) => {
      capturedOptions = options;
      return deterministicGenerate(messages, options);
    };

    const result = await generateBotDraft({
      prompt: "A dreamlike night custodian.",
      generationContext: {
        mode: "standard",
        powers: { enabled: true, count: 3, craziness: 88 },
        resemblance: 50,
        inspirationSources: [],
        batchIndex: 1,
        batchCount: 1,
      },
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });

    assert.equal(result.draft.powers.length, 3);
    assert.match(
      JSON.stringify(capturedOptions?.jsonSchema),
      /"powerPrompts":\{"type":"array","minItems":3,"maxItems":3/u,
    );
    assert.match(provider.calls[0]?.[0]?.content ?? "", /exactly 3 distinct weak compound Powers/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /interlock into one powerful compound kit/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Social influence \/ craziness is 88\/100/u);
  });

  it("weights Inspire sources while prohibiting identity cloning", async () => {
    const provider = createDeterministicProvider([JSON.stringify(rawDraft())]);
    await generateBotDraft({
      prompt: "A new observer of impossible weather.",
      generationContext: {
        mode: "inspire",
        powers: { enabled: false, count: 1, craziness: 50 },
        resemblance: 72,
        inspirationSources: [
          { id: "a", name: "Mara", influence: 80, essence: "Dry folklore investigator." },
          { id: "b", name: "Sol", influence: 25, essence: "Playful stellar gardener." },
        ],
        batchIndex: 1,
        batchCount: 1,
      },
      provider,
      providerName: "local",
      model: "llama-local",
      responseMode: "local",
    });

    const system = provider.calls[0]?.[0]?.content ?? "";
    assert.match(system, /72\/100 overall resemblance/u);
    assert.match(system, /Mara \(80\/100 influence\)/u);
    assert.match(system, /Sol \(25\/100 influence\)/u);
    assert.match(system, /without cloning names, exact identities/u);
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
    assert.doesNotMatch(
      JSON.stringify(capturedOptions?.jsonSchema),
      /namePronunciation/u,
    );
    assert.match(
      JSON.stringify(capturedOptions?.jsonSchema),
      /"accentPronunciationEnabled":\{"type":"boolean"\}/u,
    );
    assert.doesNotMatch(JSON.stringify(capturedOptions?.jsonSchema), /selfReferral/u);
    assert.match(
      JSON.stringify(capturedOptions?.jsonSchema),
      /"powerPrompts":\{"type":"array","minItems":0,"maxItems":0/u,
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
      /false for every fictional character and original persona/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Name pronunciation is player-authored only/u,
    );
    assert.doesNotMatch(
      provider.calls[0]?.[0]?.content ?? "",
      /Always set namePronunciation/u,
    );
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
      /Set powerPrompts to an empty array/u,
    );
    assert.match(provider.calls[0]?.[0]?.content ?? "", /whole character/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /concrete trigger, affected target or subject, observable consequence, and a real boundary/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /never remove another person's agency/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /generic buff, ordinary talent, personality restatement/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Do not create stamps or raw image\/accessory data/u);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /safe,\s*low-noise pixel-portrait accent layer/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Default eyes and blink always use scale 1 and rotation 0 at x 0, y 0/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /smaller canonical 100% size: physical scale 0\.7, rotation 0, x 0, y 0/u,
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
    assert.ok(
      provider.calls[1]?.some(
        (message) =>
          message.role === "system" &&
          /Private PRISM preparation notes follow/u.test(message.content),
      ),
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

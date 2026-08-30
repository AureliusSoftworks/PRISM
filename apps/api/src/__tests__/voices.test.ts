import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
  VOICE_ACCENT_MAP_ANCHORS,
} from "@localai/shared";
import {
  ElevenLabsVoiceError,
  VOICE_CAPABILITIES,
  applyPlayerNamePronunciation,
  cleanSpeakableAssistantProse,
  elevenLabsVoiceIsolationSeed,
  elevenLabsVoiceSettings,
  requestElevenLabsSpeech,
  requestElevenLabsSpeechWithTimestamps,
  requestElevenLabsVoiceCatalog,
  requestElevenLabsVoiceCollections,
  requestElevenLabsVoiceIdentity,
  requestElevenLabsSharedVoiceCandidates,
  selectElevenLabsSharedVoiceCandidate,
  importElevenLabsSharedVoice,
  resolveElevenLabsVoiceId,
  resolveFrozenReplayVoiceEngine,
  resolveVoiceSynthesisExplicitOnlineContext,
  resolveVoiceSynthesisBoundary,
  validateVoiceSynthesisRequest,
} from "../voices.ts";

describe("voice Phase 1 boundary", () => {
  it("regenerates replay speech only with the frozen resolved engine", () => {
    assert.equal(
      resolveFrozenReplayVoiceEngine({
        privacyMode: "local",
        requestedEngine: "elevenlabs",
        resolvedEngine: "builtin-local-fallback",
      }),
      "builtin",
    );
    assert.equal(
      resolveFrozenReplayVoiceEngine({
        privacyMode: "local",
        requestedEngine: "elevenlabs",
        resolvedEngine: null,
      }),
      null,
    );
    assert.equal(
      resolveFrozenReplayVoiceEngine({
        privacyMode: "online",
        requestedEngine: "builtin",
        resolvedEngine: "elevenlabs",
      }),
      "elevenlabs",
    );
  });

  it("advertises the packaged local neural voice model", () => {
    assert.equal(VOICE_CAPABILITIES.builtinEnglish.model, "kokoro-82m-q8");
    assert.deepEqual(VOICE_CAPABILITIES.modes, ["mute", "english", "babble", "bottish"]);
    assert.deepEqual(VOICE_CAPABILITIES.builtinBottish, {
      available: true,
      synthesis: "procedural",
    });
    assert.deepEqual(VOICE_CAPABILITIES.builtinBabble, {
      available: true,
      synthesis: "system-hybrid",
      proceduralFallback: true,
    });
  });
  it("keeps Bottish client-procedural and routes Babble only to builtin system synthesis", () => {
    const bottishRequest = validateVoiceSynthesisRequest({
      text: "hello",
      mode: "bottish",
      engine: "elevenlabs",
      explicitOnlineContext: true,
    });
    assert.deepEqual(resolveVoiceSynthesisBoundary(bottishRequest), {
      ok: false,
      status: 409,
      code: "procedural-client-only",
    });
    const request = validateVoiceSynthesisRequest({
      text: "hello",
      mode: "babble",
      engine: "elevenlabs",
      explicitOnlineContext: true,
      seed: " message-1 ",
    });
    assert.equal(request.seed, "message-1");
    assert.deepEqual(resolveVoiceSynthesisBoundary(request), {
      ok: true,
      kind: "builtin-babble",
      engineUsed: "builtin-babble",
      text: "hello",
      censorRanges: [],
      profile: request.profile,
    });
  });
  it("cleans markdown, tools, URLs, code, and stage directions", () => {
    assert.equal(cleanSpeakableAssistantProse("# Hi\n*waves*\n```js\nsecret()\n```\n[link](https://example.com) https://raw.example"), "Hi link");
    assert.equal(
      cleanSpeakableAssistantProse(
        "*leans back, antennae twitching* Alright, Potter—you've got me there.",
      ),
      "Alright, Potter—you've got me there.",
    );
    assert.equal(
      cleanSpeakableAssistantProse("The *important* part is trust."),
      "The important part is trust.",
    );
  });
  it("sends only a harmless carrier plus exact censor ranges to synthesizers", () => {
    const request = validateVoiceSynthesisRequest({
      text: "That is f***ing ridiculous, you absolute b••••••.",
      elevenLabsText:
        "[sighs] That is f***ing ridiculous, you absolute b••••••.",
      mode: "english",
      engine: "elevenlabs",
      explicitOnlineContext: true,
    });
    assert.equal(
      request.text,
      "That is bleep ridiculous, you absolute bleep.",
    );
    assert.equal(
      request.elevenLabsText,
      "[sighs] That is bleep ridiculous, you absolute bleep.",
    );
    assert.deepEqual(request.textCensorRanges, [
      { start: 8, end: 13 },
      { start: 39, end: 44 },
    ]);
    assert.deepEqual(request.elevenLabsCensorRanges, [
      { start: 16, end: 21 },
      { start: 47, end: 52 },
    ]);
    const local = resolveVoiceSynthesisBoundary({
      ...request,
      persistedMessageProvider: "local",
    });
    const online = resolveVoiceSynthesisBoundary(request);
    const synthesisInputs = [
      local.ok ? local.text : "",
      online.ok && online.kind === "elevenlabs-stream"
        ? online.elevenLabsText
        : "",
    ];
    assert.ok(synthesisInputs.every((text) => text.includes("bleep")));
    assert.ok(synthesisInputs.every((text) => !text.includes("•")));
    assert.ok(synthesisInputs.every((text) =>
      !/\b(?:fuck\w*|goddamn|shit\w*|damn|hell|asshole|bastard)\b/iu.test(text)
    ));
  });
  it("uses a phonetic player name only in synthesized text", () => {
    assert.equal(
      applyPlayerNamePronunciation("Jared, what do you think?", "Jared", "Jair-id"),
      "Jair-id, what do you think?"
    );
    assert.equal(
      applyPlayerNamePronunciation("Jaredson is different.", "Jared", "Jair-id"),
      "Jaredson is different."
    );
  });
  it("forces ElevenLabs history from LOCAL through builtin fallback without egress", () => {
    const request = validateVoiceSynthesisRequest({ text: "hello", mode: "english", engine: "elevenlabs", explicitOnlineContext: true });
    const result = resolveVoiceSynthesisBoundary({ ...request, persistedMessageProvider: "local" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "builtin-english");
    assert.equal(result.engineUsed, "builtin-local-fallback");
    assert.equal(result.text, "hello");
    assert.equal(result.profile.v, 2);
    assert.equal(result.profile.enabled, true);
    assert.equal(result.profile.baseVoiceId, "voice-1");
    assert.equal(result.profile.elevenLabsEffect, "chorus");
    assert.equal(result.profile.pace, 0.333);
    assert.equal(result.profile.texture.preset, "clean");
  });
  it("requires explicit online context for an ElevenLabs preview", () => {
    const request = validateVoiceSynthesisRequest({ text: "hello", mode: "english", engine: "elevenlabs" });
    assert.equal(resolveVoiceSynthesisBoundary(request).code, "online-context-required");
  });

  it("allows an explicit online ElevenLabs request without weakening LOCAL fallback", () => {
    const request = validateVoiceSynthesisRequest({
      text: "hello",
      mode: "english",
      engine: "elevenlabs",
      explicitOnlineContext: true,
    });
    assert.equal(resolveVoiceSynthesisBoundary(request).ok, true);
  });

  it("allows an explicit editor preview online without opening LOCAL message audio", () => {
    assert.equal(
      resolveVoiceSynthesisExplicitOnlineContext({
        preferredProvider: "local",
        explicitOnlineContext: true,
        explicitVoicePreview: true,
        hasMessageId: false,
      }),
      true,
    );
    assert.equal(
      resolveVoiceSynthesisExplicitOnlineContext({
        preferredProvider: "local",
        explicitOnlineContext: true,
        explicitVoicePreview: false,
        hasMessageId: false,
      }),
      false,
    );
    assert.equal(
      resolveVoiceSynthesisExplicitOnlineContext({
        preferredProvider: "local",
        explicitOnlineContext: true,
        explicitVoicePreview: true,
        hasMessageId: true,
      }),
      false,
    );
    assert.equal(
      resolveVoiceSynthesisExplicitOnlineContext({
        persistedMessageProvider: "local",
        preferredProvider: "openai",
        explicitOnlineContext: true,
        explicitVoicePreview: true,
        hasMessageId: true,
      }),
      false,
    );
  });

  it("keeps Signal reaction tags in the ElevenLabs lane only", () => {
    const request = validateVoiceSynthesisRequest({
      text: "Welcome back.",
      elevenLabsText: "[sighs] Welcome back. [laughs]",
      mode: "english",
      engine: "elevenlabs",
      explicitOnlineContext: true,
    });
    assert.equal(request.text, "Welcome back.");
    assert.equal(
      request.elevenLabsText,
      "[sighs] Welcome back. [laughs]",
    );
    const online = resolveVoiceSynthesisBoundary(request);
    assert.equal(online.ok && online.kind === "elevenlabs-stream"
      ? online.elevenLabsText
      : null, "[sighs] Welcome back. [laughs]");
    const local = resolveVoiceSynthesisBoundary({
      ...request,
      persistedMessageProvider: "local",
    });
    assert.equal(local.ok ? local.text : null, "Welcome back.");
    assert.equal(
      validateVoiceSynthesisRequest({
        ...request,
        elevenLabsText: "[explosion] Welcome back.",
      }).elevenLabsText,
      null,
    );
    assert.equal(
      validateVoiceSynthesisRequest({
        ...request,
        text: "That surprised me. Excuse me.",
        elevenLabsText: "That surprised me. [burps] Excuse me.",
      }).elevenLabsText,
      "That surprised me. [burps] Excuse me.",
    );
    const withLeakedStageDirection = validateVoiceSynthesisRequest({
      ...request,
      text: "*leans back* Welcome back.",
      elevenLabsText: "[sighs] *leans back* Welcome back.",
    });
    assert.equal(withLeakedStageDirection.text, "Welcome back.");
    assert.equal(
      withLeakedStageDirection.elevenLabsText,
      "[sighs] Welcome back.",
    );
  });

  it("prefers a per-profile voice ID override over the catalog identity", () => {
    assert.equal(
      resolveElevenLabsVoiceId({
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        elevenLabsVoiceId: "bot-voice",
        elevenLabsVoiceIdOverride: "portable-voice",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
        bottishTone: 0.45,
        volume: 1,
        texture: {
          preset: "clean",
          amount: 0,
          bandwidth: 1,
          noise: 0,
          instability: 0,
          distortion: 0,
          damage: 0,
        },
      }),
      "portable-voice",
    );
    assert.equal(
      resolveElevenLabsVoiceId({
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        elevenLabsVoiceId: "bot-voice",
        elevenLabsEffect: "clean",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
        bottishTone: 0.45,
        volume: 1,
        texture: {
          preset: "clean",
          amount: 0,
          bandwidth: 1,
          noise: 0,
          instability: 0,
          distortion: 0,
          damage: 0,
        },
      }),
      "bot-voice",
    );
    assert.equal(
      resolveElevenLabsVoiceId({
        v: 1,
        baseVoiceId: "voice-1",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      }),
      null,
    );
  });

  it("sends one persisted stability control and omits unsupported v3 settings", () => {
    assert.deepEqual(
      elevenLabsVoiceSettings({
        v: 1,
        baseVoiceId: "voice-3",
        pitch: 1,
        warmth: -1,
        pace: 1,
        lilt: 1,
        elevenLabsStability: 0.3,
      }, "eleven_flash_v2_5"),
      {
        stability: 0.3,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      }
    );
    assert.deepEqual(
      elevenLabsVoiceSettings({
        v: 1,
        baseVoiceId: "voice-3",
        pitch: 1,
        warmth: -1,
        pace: 1,
        lilt: 1,
        elevenLabsStability: 0.3,
      }, "eleven_v3"),
      { stability: 0.3 },
    );
  });

  it("applies mood pace ephemerally before selecting a synthesis boundary", () => {
    const request = validateVoiceSynthesisRequest({
      text: "A quick answer.",
      mode: "english",
      engine: "elevenlabs",
      explicitOnlineContext: true,
      moodKey: "joyful",
      profile: {
        v: 1,
        baseVoiceId: "voice-1",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
    });
    assert.equal(request.deliveryMood, "joyful");
    assert.equal(request.profile.pace, 0.75);
    assert.deepEqual(
      elevenLabsVoiceSettings(request.profile, "eleven_v3"),
      { stability: 0.52 },
    );
  });

  it("keeps the ElevenLabs key server-side and sends the expected streaming payload", async () => {
    let request: { url: string; init?: RequestInit } | null = null;
    const response = await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice/provider id",
      model: "eleven_flash_v2_5",
      text: "hello",
      seed: elevenLabsVoiceIsolationSeed("bot-morty"),
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (url, init) => {
        request = { url: String(url), init };
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }) as typeof fetch,
    });
    assert.equal(response.status, 200);
    assert.match(request?.url ?? "", /voice%2Fprovider%20id\/stream/);
    assert.equal(new Headers(request?.init?.headers).get("xi-api-key"), "secret-key");
    const body = JSON.parse(String(request?.init?.body));
    assert.equal(body.model_id, "eleven_flash_v2_5");
    assert.equal(body.text, "hello");
    assert.equal(body.seed, elevenLabsVoiceIsolationSeed("bot-morty"));
    assert.equal(body.previous_text, undefined);
    assert.equal(body.next_text, undefined);
    assert.equal(body.previous_request_ids, undefined);
    assert.equal(body.next_request_ids, undefined);
  });

  it("gives bots sharing one ElevenLabs actor stable isolated sampling lanes", () => {
    const morty = elevenLabsVoiceIsolationSeed("bot-morty");
    const rick = elevenLabsVoiceIsolationSeed("bot-rick");
    assert.equal(morty, elevenLabsVoiceIsolationSeed("bot-morty"));
    assert.notEqual(morty, rick);
    assert.equal(elevenLabsVoiceIsolationSeed("  bot-morty  "), morty);
    assert.equal(elevenLabsVoiceIsolationSeed(null), undefined);
    assert.ok(morty !== undefined && morty >= 0 && morty <= 4_294_967_295);
  });

  it("turns a saved voice direction deck into Eleven v3 audio tags", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: "The door is already open.",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        elevenLabsVoiceId: "voice-id",
        elevenLabsEffect: "clean",
        elevenLabsDirection: "warm, hushed, with measured pauses",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
        bottishTone: 0.45,
        volume: 1,
        texture: {
          preset: "clean",
          amount: 0,
          bandwidth: 1,
          noise: 0,
          instability: 0,
          distortion: 0,
          damage: 0,
        },
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(requestBody?.model_id, "eleven_v3");
    assert.equal(
      requestBody?.text,
      "[warm] [hushed] [with measured pauses] The door is already open.",
    );
  });

  it("combines the private Accent Map cue with authored directions in Eleven v3", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const text = "The door is already open.";
    const request = {
      apiKey: "secret-key", voiceId: "voice-id", model: "eleven_flash_v2_5",
      text, deliveryMood: "warm" as const,
      profile: {
        v: 2 as const, enabled: true, baseVoiceId: "voice-1" as const, elevenLabsEffect: "clean" as const,
        elevenLabsDirection: "hushed, measured", elevenLabsNativeAccentHint: "American",
        accentDefinitionId: "german-influenced-english",
        pronunciationBase: "en-US", speechprintInfluence: "italian-influenced-english",
        speechprintStrength: "balanced", pitch: 0, warmth: 0, pace: 0, lilt: 0,
        bottishTone: 0.45, volume: 1, texture: { preset: "clean", amount: 0, bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0 },
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    };
    await requestElevenLabsSpeech(request);
    assert.equal(requestBody?.model_id, "eleven_v3");
    assert.equal(
      requestBody?.text,
      "[German accent] [hushed] [measured] The door is already open.",
    );
    assert.equal(request.text, text);
    assert.doesNotMatch(requestBody?.text as string, /warmly/u);
  });

  it("bypasses Accent Map direction and phonology when the bot switch is off", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let ipaResolverCalled = false;
    const text = "Peter Piper picked a peck of pickled peppers.";
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "british-premium-voice",
      model: "eleven_flash_v2_5",
      text,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        accentPronunciationEnabled: false,
        accentDefinitionId: "american-english",
        pronunciationMapPoint: { x: 0.28, y: 0.31 },
        speechprintInfluence: "american-english",
      },
      accentIpaResolver: async () => {
        ipaResolverCalled = true;
        throw new Error("disabled Accent Map must not resolve IPA");
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    assert.equal(ipaResolverCalled, false);
    assert.equal(requestBody?.model_id, "eleven_flash_v2_5");
    assert.equal(requestBody?.text, text);
  });

  it("normalizes umbrella profiles to concrete directions and reserves target IPA for Scottish", async () => {
    const sourceText = "Peter Piper picked a peck of pickled peppers.";
    const cases = [
      {
        voiceId: "british-premium-voice",
        nativeAccent: "British",
        accentDefinitionId: "american-english",
        targetIpa: "ˈpiːtɚ ˈpaɪpɚ pɪkt ə pɛk əv ˈpɪkəld ˈpɛpɚz",
        expectedText:
          `[General American accent] ${sourceText}`,
      },
      {
        voiceId: "american-premium-voice",
        nativeAccent: "American",
        accentDefinitionId: "british-english",
        targetIpa: "ˈpiːtə ˈpaɪpə pɪkt ə pɛk əv ˈpɪkəld ˈpɛpəz",
        expectedText:
          `[Received Pronunciation accent] ${sourceText}`,
      },
      {
        voiceId: "american-premium-voice",
        nativeAccent: "American",
        accentDefinitionId: "scottish-english",
        targetIpa: "ˈpitər ˈpaɪpər pɪkt ə pɛk əv ˈpɪkəld ˈpɛpərz",
        expectedText:
          "[Scottish accent] /ˈpitər ˈpaɪpər pɪkt ə pɛk əv ˈpɪkəld ˈpɛpərz/",
      },
    ] as const;
    const providerTexts: string[] = [];

    for (const testCase of cases) {
      let requestedUrl = "";
      let requestBody: Record<string, unknown> | null = null;
      const request = {
        apiKey: "secret-key",
        voiceId: testCase.voiceId,
        model: "eleven_flash_v2_5",
        text: sourceText,
        profile: {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
          elevenLabsNativeAccentHint: testCase.nativeAccent,
          accentDefinitionId: testCase.accentDefinitionId,
        },
        accentIpaResolver: async (args: { text: string }) => ({
          sourceText: args.text,
          targetLocale: "en-US",
          targetIpa: testCase.targetIpa,
        }),
        fetchImpl: (async (url, init) => {
          requestedUrl = String(url);
          requestBody = JSON.parse(String(init?.body));
          return new Response(new Uint8Array([1]), { status: 200 });
        }) as typeof fetch,
      };

      await requestElevenLabsSpeech(request);

      assert.match(
        requestedUrl,
        new RegExp(`${testCase.voiceId}/stream`, "u"),
      );
      assert.equal(requestBody?.model_id, "eleven_v3");
      assert.equal(requestBody?.text, testCase.expectedText);
      assert.equal(requestBody?.pronunciation_dictionary_locators, undefined);
      assert.equal(request.text, sourceText);
      providerTexts.push(String(requestBody?.text));
    }

    assert.equal(new Set(providerTexts).size, 3);
  });

  it("carries an unnamed point as the same weighted two-anchor Premium blend", async () => {
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
    let requestBody: Record<string, unknown> | null = null;
    const text = "The river bends past the harbor.";
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "premium-voice",
      model: "eleven_flash_v2_5",
      text,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        accentDefinitionId: null,
        pronunciationMapPoint,
        pronunciationBase: "en-US",
        speechprintInfluence: "none",
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    assert.equal(
      requestBody?.text,
      `[50% New York accent] [50% New Jersey accent] ${text}`,
    );
    assert.equal(requestBody?.model_id, "eleven_v3");
  });

  it("keeps an unnamed Bavarian-core drop as one exact Premium source", async () => {
    const bavaria = VOICE_ACCENT_MAP_ANCHORS.find(
      (anchor) =>
        anchor.accentDefinitionId ===
        "bavarian-german-influenced-english",
    );
    assert.ok(bavaria);
    const text = "The river bends past the old road.";
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "premium-voice",
      model: "eleven_flash_v2_5",
      text,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        accentDefinitionId: null,
        pronunciationMapPoint: bavaria.point,
        pronunciationBase: "en-US",
        speechprintInfluence: "none",
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    assert.equal(requestBody?.text, `[Bavarian German accent] ${text}`);
    assert.doesNotMatch(String(requestBody?.text), /%/u);
    assert.equal(requestBody?.model_id, "eleven_v3");
  });

  it("keeps the exact objection sentence authored in British-family Premium routing", async () => {
    const text =
      "Objection. Your theory collapses under the weight of a single, undeniable contradiction.";
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "american-premium-voice",
      model: "eleven_flash_v2_5",
      text,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "American",
        accentDefinitionId: "british-english",
      },
      accentIpaResolver: async () => {
        throw new Error("removed umbrella must not take the full-utterance IPA path");
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    assert.equal(
      requestBody?.text,
      `[Received Pronunciation accent] ${text}`,
    );
  });

  it("carries Accent Map strength in the Premium direction, never in the line", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const text = "They think this hard river is home late.";
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "american-premium-voice",
      model: "eleven_flash_v2_5",
      text,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "American",
        accentDefinitionId: "parisian-french-influenced-english",
        speechprintStrength: "strong",
        speechprintVariationSeed: "paris-preview-runtime",
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    assert.equal(requestBody?.model_id, "eleven_v3");
    assert.equal(
      requestBody?.text,
      `[strong Parisian French accent] ${text}`,
    );
  });

  it("never respells names or words on the Premium Accent Map path", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: "Walter waits.",
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        accentDefinitionId: "german-influenced-english",
        speechprintStrength: "balanced",
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    // Phoneme notation in the request text is read aloud as notation. The
    // accent is a direction; the line stays exactly as the bot wrote it.
    assert.equal(requestBody?.text, "[German accent] Walter waits.");
    assert.equal(requestBody?.pronunciation_dictionary_locators, undefined);
  });

  it("turns non-neutral delivery moods into sparse Eleven v3 directions", async () => {
    const cases = [
      ["joyful", "delighted"],
      ["warm", "warmly"],
      ["guarded", "reserved"],
      ["strained", "strained"],
    ] as const;
    for (const [deliveryMood, direction] of cases) {
      let requestBody: Record<string, unknown> | null = null;
      await requestElevenLabsSpeech({
        apiKey: "secret-key",
        voiceId: "voice-id",
        model: "eleven_flash_v2_5",
        text: "The door is already open.",
        deliveryMood,
        profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
        fetchImpl: (async (_url, init) => {
          requestBody = JSON.parse(String(init?.body));
          return new Response(new Uint8Array([1]), { status: 200 });
        }) as typeof fetch,
      });
      assert.equal(requestBody?.model_id, "eleven_v3");
      assert.equal(
        requestBody?.text,
        `[${direction}] The door is already open.`,
      );
    }
  });

  it("leaves neutral delivery untagged on the selected ElevenLabs model", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_multilingual_v2",
      text: "The door is already open.",
      deliveryMood: "neutral",
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(requestBody?.model_id, "eleven_multilingual_v2");
    assert.equal(requestBody?.text, "The door is already open.");
  });

  it("keeps all authored identity directions ahead of an ephemeral mood", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: "The door is already open.",
      deliveryMood: "strained",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        elevenLabsEffect: "clean",
        elevenLabsDirection: "strained, hushed, with measured pauses",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
        bottishTone: 0.45,
        volume: 1,
        texture: {
          preset: "clean",
          amount: 0,
          bandwidth: 1,
          noise: 0,
          instability: 0,
          distortion: 0,
          damage: 0,
        },
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(
      requestBody?.text,
      "[strained] [hushed] [with measured pauses] The door is already open.",
    );
  });

  it("does not let a turn mood evict a bot's third authored direction", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "shared-actor",
      model: "eleven_flash_v2_5",
      text: "The door is already open.",
      deliveryMood: "joyful",
      profile: {
        v: 1,
        baseVoiceId: "voice-1",
        elevenLabsDirection: "anxious stammer, youthful pitch, quick cadence",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(
      requestBody?.text,
      "[anxious stammer] [youthful pitch] [quick cadence] The door is already open.",
    );
  });

  it("appends a turn mood only when the bot has a free direction slot", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "shared-actor",
      model: "eleven_flash_v2_5",
      text: "The door is already open.",
      deliveryMood: "joyful",
      profile: {
        v: 1,
        baseVoiceId: "voice-1",
        elevenLabsDirection: "anxious stammer, quick cadence",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(
      requestBody?.text,
      "[anxious stammer] [quick cadence] [delighted] The door is already open.",
    );
  });

  it("lets explicit vocal reactions suppress the broader automatic mood tag", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: "[sighs] The door is already open.",
      deliveryMood: "strained",
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(requestBody?.model_id, "eleven_v3");
    assert.equal(requestBody?.text, "[sighs] The door is already open.");
  });

  it("removes non-spoken direction tags from provider timing alignment", async () => {
    const providerText = "[warm] Hi";
    const characters = Array.from(providerText);
    const speech = await requestElevenLabsSpeechWithTimestamps({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: "Hi",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        elevenLabsVoiceId: "voice-id",
        elevenLabsEffect: "clean",
        elevenLabsDirection: "warm",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
        bottishTone: 0.45,
        volume: 1,
        texture: {
          preset: "clean",
          amount: 0,
          bandwidth: 1,
          noise: 0,
          instability: 0,
          distortion: 0,
          damage: 0,
        },
      },
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.text, providerText);
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, index) => index * 0.05),
            character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
          },
        }), { status: 200 });
      }) as typeof fetch,
    });
    assert.deepEqual(speech.alignment?.characters, ["H", "i"]);
    assert.ok(
      Math.abs((speech.alignment?.characterStartTimesSeconds[0] ?? 0) - 0.35) < 0.000_001,
    );
    assert.equal(speech.alignment?.characterStartTimesSeconds[1], 0.4);
  });

  it("removes ephemeral mood direction from provider timing alignment", async () => {
    const providerText = "[reserved] Hi";
    const characters = Array.from(providerText);
    const speech = await requestElevenLabsSpeechWithTimestamps({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: "Hi",
      deliveryMood: "guarded",
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.text, providerText);
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, index) => index * 0.05),
            character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
          },
        }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(speech.alignment?.characters.join(""), "Hi");
  });

  it("uses Eleven v3 and removes Signal reaction tags from timing alignment", async () => {
    const taggedText = "[sighs] Hi there. [laughs]";
    const characters = Array.from(taggedText);
    const speech = await requestElevenLabsSpeechWithTimestamps({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: taggedText,
      profile: {
        v: 1,
        baseVoiceId: "voice-1",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model_id, "eleven_v3");
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, index) => index * 0.05),
            character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
          },
        }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(speech.alignment?.characters.join(""), "Hi there.");
  });

  it("projects titles and exact clock times only into every Premium speech request", async () => {
    const sourceText = "Ms. Rivera called Capt. Chen at 10:09 AM";
    let providerText = "";
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: sourceText,
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (_url, init) => {
        providerText = JSON.parse(String(init?.body)).text;
        return new Response("audio", { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(
      providerText,
      "Miss Rivera called Captain Chen at ten oh nine in the morning",
    );
    assert.equal(sourceText, "Ms. Rivera called Capt. Chen at 10:09 AM");
  });

  it("maps expanded Premium titles back onto the authored transcript", async () => {
    const sourceText = "Ms. Rivera called Capt. Chen.";
    const providerText = "Miss Rivera called Captain Chen.";
    const characters = Array.from(providerText);
    const speech = await requestElevenLabsSpeechWithTimestamps({
      apiKey: "secret-key",
      voiceId: "voice-id",
      model: "eleven_flash_v2_5",
      text: sourceText,
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (_url, init) => {
        assert.equal(JSON.parse(String(init?.body)).text, providerText);
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map(
              (_, index) => index * 0.05,
            ),
            character_end_times_seconds: characters.map(
              (_, index) => (index + 1) * 0.05,
            ),
          },
        }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(speech.alignment?.characters.join(""), sourceText);
  });

  it("composes title and Accent Map projections without changing alignment text", async () => {
    const sourceText = "Capt. Rivera.";
    const providerText = "[General American accent] Captain Rivera.";
    const characters = Array.from(providerText);
    const speech = await requestElevenLabsSpeechWithTimestamps({
      apiKey: "secret-key",
      voiceId: "british-premium-voice",
      model: "eleven_flash_v2_5",
      text: sourceText,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "British",
        accentDefinitionId: "american-english",
      },
      accentIpaResolver: async ({ text }) => {
        assert.equal(text, "Captain Rivera.");
        return {
          sourceText: text,
          targetLocale: "en-US",
          targetIpa: "ˈkæptən ɹɪˈvɛɹə",
        };
      },
      fetchImpl: (async (_url, init) => {
        assert.equal(JSON.parse(String(init?.body)).text, providerText);
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map(
              (_, index) => index * 0.05,
            ),
            character_end_times_seconds: characters.map(
              (_, index) => (index + 1) * 0.05,
            ),
          },
        }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(speech.alignment?.characters.join(""), sourceText);
  });

  it("maps timestamped alignment back onto the original tagged transcript", async () => {
    const spokenText = "Peter Piper picked a peck of pickled peppers.";
    const sourceText = `[sighs] ${spokenText} [laughs]`;
    let providerText = "";
    let requestedUrl = "";
    const request = {
      apiKey: "secret-key",
      voiceId: "british-premium-voice",
      model: "eleven_flash_v2_5",
      text: sourceText,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "British",
        elevenLabsDirection: "hushed",
        accentDefinitionId: "american-english",
      },
      accentIpaResolver: async () => ({
        sourceText: spokenText,
        targetLocale: "en-US",
        targetIpa: "ˈpiːtɚ ˈpaɪpɚ pɪkt ə pɛk əv ˈpɪkəld ˈpɛpɚz",
      }),
      fetchImpl: (async (url, init) => {
        requestedUrl = String(url);
        const body = JSON.parse(String(init?.body)) as {
          text: string;
          model_id: string;
        };
        assert.equal(body.model_id, "eleven_v3");
        providerText = body.text;
        const characters = Array.from(body.text);
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map(
              (_, index) => index * 0.01,
            ),
            character_end_times_seconds: characters.map(
              (_, index) => (index + 1) * 0.01,
            ),
          },
        }), { status: 200 });
      }) as typeof fetch,
    };

    const speech = await requestElevenLabsSpeechWithTimestamps(request);

    assert.match(requestedUrl, /british-premium-voice\/with-timestamps/u);
    assert.equal(
      providerText,
      `[General American accent] [hushed] [sighs] ${spokenText} [laughs]`,
    );
    assert.equal(speech.alignment?.characters.join(""), spokenText);
    assert.doesNotMatch(speech.alignment?.characters.join("") ?? "", /[\/\[\]ˈɾɚɹ]/u);
    assert.equal(request.text, sourceText);
  });

  it("hands respelled provider timing back to the words as written", async () => {
    const spokenText = "I think this brother said thanks.";
    const sourceText = `[sighs] ${spokenText} [laughs]`;
    let providerText = "";
    const request = {
      apiKey: "secret-key",
      voiceId: "american-premium-voice",
      model: "eleven_flash_v2_5",
      text: sourceText,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "American",
        accentDefinitionId: "cockney-english",
        speechprintStrength: "strong" as const,
      },
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { text: string };
        providerText = body.text;
        const characters = Array.from(body.text);
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, i) => i * 0.01),
            character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.01),
          },
        }), { status: 200 });
      }) as typeof fetch,
    };

    const speech = await requestElevenLabsSpeechWithTimestamps(request);

    // Consonants move in the request; audio tags and spacing do not.
    assert.equal(
      providerText,
      "[strong Cockney accent] [sighs] I fink this bruvver said fanks. [laughs]",
    );
    // Timing comes back attached to the line the bot actually wrote.
    assert.equal(speech.alignment?.characters.join(""), spokenText);
    const starts = speech.alignment?.characterStartTimesSeconds ?? [];
    for (let index = 1; index < starts.length; index += 1) {
      assert.ok(
        starts[index]! >= starts[index - 1]!,
        "projected timings must not run backwards",
      );
    }
    assert.equal(request.text, sourceText);
  });

  it("leaves the written line untouched when the voice already has the accent", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const text = "I think this brother said thanks.";
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "cockney-premium-voice",
      model: "eleven_flash_v2_5",
      text,
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "Cockney",
        accentDefinitionId: "cockney-english",
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    // No direction means the voice already speaks it; respelling on top
    // would double the accent.
    assert.equal(requestBody?.text, text);
  });

  it("never respells an authored name pronunciation", async () => {
    let requestBody: Record<string, unknown> | null = null;
    await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "american-premium-voice",
      model: "eleven_flash_v2_5",
      text: "Thanks, Thistle. I think DATA is three things.",
      protectedPhrases: ["Thistle"],
      profile: {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        elevenLabsNativeAccentHint: "American",
        accentDefinitionId: "irish-english",
        speechprintStrength: "strong" as const,
      },
      fetchImpl: (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as typeof fetch,
    });

    assert.equal(
      requestBody?.text,
      "[strong Irish accent] Tanks, Thistle. I tink DATA is tree tings.",
    );
  });

  it("rejects incomplete timestamped speech before returning partial audio", async () => {
    await assert.rejects(
      requestElevenLabsSpeechWithTimestamps({
        apiKey: "secret-key",
        voiceId: "british-premium-voice",
        model: "eleven_flash_v2_5",
        text: "Peter Piper picked a peck of pickled peppers.",
        profile: {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
          elevenLabsNativeAccentHint: "British",
          accentDefinitionId: "american-english",
        },
        fetchImpl: (async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as { text: string };
          const characters = Array.from(body.text).slice(0, -12);
          return new Response(JSON.stringify({
            audio_base64: "AQID",
            alignment: {
              characters,
              character_start_times_seconds: characters.map(
                (_, index) => index * 0.01,
              ),
              character_end_times_seconds: characters.map(
                (_, index) => (index + 1) * 0.01,
              ),
            },
          }), { status: 200 });
        }) as typeof fetch,
      }),
      /ended before the requested line/u,
    );
  });

  it("normalizes timestamped ElevenLabs audio and character alignment", async () => {
    let requestUrl = "";
    const speech = await requestElevenLabsSpeechWithTimestamps({
      apiKey: "secret-key",
      voiceId: "voice/provider id",
      model: "eleven_flash_v2_5",
      text: "Hi",
      seed: elevenLabsVoiceIsolationSeed("bot-rick"),
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (url, init) => {
        requestUrl = String(url);
        const body = JSON.parse(String(init?.body));
        assert.equal(body.seed, elevenLabsVoiceIsolationSeed("bot-rick"));
        return new Response(JSON.stringify({
          audio_base64: "AQID",
          alignment: {
            characters: ["H", "i"],
            character_start_times_seconds: [0, 0.12],
            character_end_times_seconds: [0.12, 0.24],
          },
          normalized_alignment: {
            characters: ["H", "i"],
            character_start_times_seconds: [0.01, 0.13],
            character_end_times_seconds: [0.13, 0.25],
          },
        }), {
          status: 200,
          headers: { "request-id": "provider-request" },
        });
      }) as typeof fetch,
    });
    assert.match(requestUrl, /voice%2Fprovider%20id\/with-timestamps/);
    assert.deepEqual(speech, {
      audioBase64: "AQID",
      audioContentType: "audio/mpeg",
      alignment: {
        characters: ["H", "i"],
        characterStartTimesSeconds: [0, 0.12],
        characterEndTimesSeconds: [0.12, 0.24],
      },
      normalizedAlignment: {
        characters: ["H", "i"],
        characterStartTimesSeconds: [0.01, 0.13],
        characterEndTimesSeconds: [0.13, 0.25],
      },
      providerRequestId: "provider-request",
    });
  });

  it("rejects timestamped speech whose alignment ends at a strict text prefix", async () => {
    const requestedText =
      "Gentlemen, vanity is not evidence, however handsomely dressed.";
    const truncatedText = "Gentlemen, vanity";

    await assert.rejects(
      requestElevenLabsSpeechWithTimestamps({
        apiKey: "secret-key",
        voiceId: "voice-id",
        model: "eleven_flash_v2_5",
        text: requestedText,
        profile: {
          v: 1,
          baseVoiceId: "voice-1",
          pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
        },
        fetchImpl: (async () => {
          const characters = Array.from(truncatedText);
          return new Response(
            JSON.stringify({
              audio_base64: "AQID",
              alignment: {
                characters,
                character_start_times_seconds: characters.map(
                  (_, index) => index * 0.05,
                ),
                character_end_times_seconds: characters.map(
                  (_, index) => (index + 1) * 0.05,
                ),
              },
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      }),
      /ended before the requested line/u,
    );
  });

  it("preserves ElevenLabs provider codes while surfacing their readable message", async () => {
    await assert.rejects(
      requestElevenLabsSpeechWithTimestamps({
        apiKey: "secret-key",
        voiceId: "voice-id",
        model: "eleven_flash_v2_5",
        text: "Hi",
        profile: {
          v: 1,
          baseVoiceId: "voice-1",
          pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
        },
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              detail: {
                code: "quota_exceeded",
                message: "This request exceeds the available voice credits.",
              },
            }),
            { status: 401 },
          )) as typeof fetch,
      }),
      (error: unknown) =>
        error instanceof ElevenLabsVoiceError &&
        error.status === 401 &&
        error.providerCode === "quota_exceeded" &&
        error.message === "This request exceeds the available voice credits.",
    );
  });

  it("opts into alignment transport without changing legacy requests", () => {
    assert.equal(validateVoiceSynthesisRequest({ text: "hello" }).includeAlignment, false);
    assert.equal(
      validateVoiceSynthesisRequest({ text: "hello", includeAlignment: true }).includeAlignment,
      true
    );
  });

  it("normalizes the ElevenLabs voice catalog", async () => {
    let requestedUrl = "";
    const voices = await requestElevenLabsVoiceCatalog({
      apiKey: "secret-key",
      collectionId: " collection-main ",
      fetchImpl: (async (input) => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({
            voices: [{
              voice_id: "voice-a",
              name: "Alex",
              category: "premade",
              preview_url: "https://example.test/alex.mp3",
              labels: { accent: "American", ignored: 3 },
            }],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    assert.equal(
      new URL(requestedUrl).searchParams.get("collection_id"),
      "collection-main",
    );
    assert.deepEqual(voices, [{
      voiceId: "voice-a",
      name: "Alex",
      category: "premade",
      description: null,
      previewUrl: "https://example.test/alex.mp3",
      labels: { accent: "American" },
    }]);
  });

  it("paginates saved voices and preserves their original shared identity", async () => {
    const requestedUrls: string[] = [];
    const voices = await requestElevenLabsVoiceCatalog({
      apiKey: "secret-key",
      fetchImpl: (async (input) => {
        const url = new URL(String(input));
        requestedUrls.push(url.toString());
        if (!url.searchParams.has("next_page_token")) {
          return new Response(JSON.stringify({
            voices: [{
              voice_id: "provider-copy-a",
              name: "Avery",
              category: "professional",
              sharing: {
                original_voice_id: "source-a",
                public_owner_id: "owner-a",
              },
            }],
            has_more: true,
            next_page_token: "page-two",
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          voices: [{ voice_id: "voice-b", name: "Blair" }],
          has_more: false,
        }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(requestedUrls.length, 2);
    assert.equal(
      new URL(requestedUrls[1]!).searchParams.get("next_page_token"),
      "page-two",
    );
    assert.deepEqual(voices[0], {
      voiceId: "provider-copy-a",
      name: "Avery",
      category: "professional",
      description: null,
      previewUrl: null,
      labels: {},
      originalVoiceId: "source-a",
      publicOwnerId: "owner-a",
    });
    assert.equal(voices[1]?.voiceId, "voice-b");
  });

  it("filters importable English professional Voice Library entries and uses the official query", async () => {
    let requestedUrl = "";
    const voices = await requestElevenLabsSharedVoiceCandidates({
      apiKey: "secret-key",
      page: 3,
      fetchImpl: (async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({
          voices: [
            {
              public_owner_id: "owner-a",
              voice_id: "voice-a",
              name: "Avery",
              language: "en",
              accent: "American",
              category: "professional",
              description: "Warm character voice",
              rate: 1,
            },
            { public_owner_id: "owner-b", voice_id: "voice-b", name: "French", language: "fr", category: "professional" },
            { public_owner_id: "owner-c", voice_id: "voice-c", name: "Moderated", language: "en", category: "professional", live_moderation_enabled: true },
            { public_owner_id: "owner-d", voice_id: "voice-d", name: "Custom", language: "en", category: "professional", rate: 2 },
          ],
        }), { status: 200 });
      }) as typeof fetch,
    });
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, "/v1/shared-voices");
    assert.equal(url.searchParams.get("page_size"), "100");
    assert.equal(url.searchParams.get("page"), "3");
    assert.equal(url.searchParams.get("category"), "professional");
    assert.equal(url.searchParams.get("language"), "en");
    assert.equal(url.searchParams.get("include_custom_rates"), "false");
    assert.equal(url.searchParams.get("include_live_moderated"), "false");
    assert.deepEqual(voices, [{
      publicOwnerId: "owner-a",
      voiceId: "voice-a",
      name: "Avery",
      category: "professional",
      description: "Warm character voice",
      previewUrl: null,
      labels: { language: "en", accent: "American" },
    }]);
  });

  it("imports a shared voice under its owner and preserves the bookmarked name", async () => {
    let requestedUrl = "";
    let init: RequestInit | undefined;
    const voiceId = await importElevenLabsSharedVoice({
      apiKey: "secret-key",
      publicOwnerId: "public/user",
      voiceId: "voice/a",
      name: "Avery",
      fetchImpl: (async (input, requestInit) => {
        requestedUrl = String(input);
        init = requestInit;
        return new Response(JSON.stringify({ voice_id: "imported-a" }), { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(requestedUrl, "https://api.elevenlabs.io/v1/voices/add/public%2Fuser/voice%2Fa");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("xi-api-key"), "secret-key");
    assert.deepEqual(JSON.parse(String(init?.body)), { new_name: "Avery", bookmarked: true });
    assert.equal(voiceId, "imported-a");
  });

  it("selects a playable shared audition while honoring recent exclusions", () => {
    const candidates = [
      {
        publicOwnerId: "owner-a",
        voiceId: "voice-a",
        name: "Avery",
        category: "professional" as const,
        description: null,
        previewUrl: "https://example.test/a.mp3",
        labels: {},
      },
      {
        publicOwnerId: "owner-b",
        voiceId: "voice-b",
        name: "Blair",
        category: "high_quality" as const,
        description: null,
        previewUrl: "https://example.test/b.mp3",
        labels: {},
      },
      {
        publicOwnerId: "owner-c",
        voiceId: "voice-c",
        name: "Casey",
        category: "professional" as const,
        description: null,
        previewUrl: null,
        labels: {},
      },
    ];
    assert.equal(
      selectElevenLabsSharedVoiceCandidate(candidates, new Set(["voice-a"]), () => 0)
        ?.voiceId,
      "voice-b",
    );
    assert.equal(
      selectElevenLabsSharedVoiceCandidate(
        candidates,
        new Set(["voice-a", "voice-b"]),
      ),
      null,
    );
    assert.equal(
      selectElevenLabsSharedVoiceCandidate(
        candidates.map((candidate) =>
          candidate.voiceId === "voice-b"
            ? { ...candidate, description: "Warm British narrator" }
            : { ...candidate, description: "Bright American character" },
        ),
        new Set(),
        () => 0,
        "British narrator",
      )?.voiceId,
      "voice-b",
    );
  });

  it("treats explicit Refract accent and gender words as provider-metadata constraints", () => {
    const candidates = [
      {
        publicOwnerId: "owner-a",
        voiceId: "australian-male",
        name: "Lachlan",
        category: "professional" as const,
        description: "Warm narrator",
        previewUrl: "https://example.test/lachlan.mp3",
        labels: { accent: "Australian", gender: "male" },
      },
      {
        publicOwnerId: "owner-b",
        voiceId: "indian-female",
        name: "Priya",
        category: "professional" as const,
        description: "Warm narrator",
        previewUrl: "https://example.test/priya.mp3",
        labels: { accent: "Indian", gender: "female" },
      },
    ];
    assert.equal(
      selectElevenLabsSharedVoiceCandidate(
        candidates,
        new Set(),
        () => 0.99,
        "australian man",
      )?.voiceId,
      "australian-male",
    );
    assert.equal(
      selectElevenLabsSharedVoiceCandidate(
        candidates.filter((candidate) => candidate.voiceId !== "australian-male"),
        new Set(),
        () => 0,
        "australian man",
      ),
      null,
    );
    assert.equal(
      selectElevenLabsSharedVoiceCandidate(
        candidates,
        new Set(),
        () => 0.99,
        "man",
      )?.voiceId,
      "australian-male",
    );
  });

  it("resolves an authenticated ElevenLabs voice ID to its display name", async () => {
    let requestedUrl = "";
    let requestedKey = "";
    const voice = await requestElevenLabsVoiceIdentity({
      apiKey: "secret-key",
      voiceId: " portable/voice ",
      fetchImpl: (async (input, init) => {
        requestedUrl = String(input);
        requestedKey = new Headers(init?.headers).get("xi-api-key") ?? "";
        return new Response(
          JSON.stringify({ voice_id: "portable/voice", name: "Portable Muse" }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    assert.equal(
      requestedUrl,
      "https://api.elevenlabs.io/v1/voices/portable%2Fvoice",
    );
    assert.equal(requestedKey, "secret-key");
    assert.deepEqual(voice, {
      voiceId: "portable/voice",
      name: "Portable Muse",
      labels: {},
    });
  });

  it("preserves ElevenLabs voice lookup failures for the route to classify", async () => {
    await assert.rejects(
      requestElevenLabsVoiceIdentity({
        apiKey: "secret-key",
        voiceId: "missing-voice",
        fetchImpl: (async () =>
          new Response("Voice not found", { status: 404 })) as typeof fetch,
      }),
      (error: unknown) =>
        error instanceof ElevenLabsVoiceError &&
        error.status === 404 &&
        error.message === "Voice not found",
    );
  });

  it("discovers and names authenticated ElevenLabs voice collections", async () => {
    const requestedUrls: URL[] = [];
    const collections = await requestElevenLabsVoiceCollections({
      apiKey: "secret-key",
      fetchImpl: (async (input) => {
        const url = new URL(String(input));
        requestedUrls.push(url);
        if (url.pathname === "/v2/voices") {
          if (!url.searchParams.has("next_page_token")) {
            return new Response(JSON.stringify({
              voices: [{
                voice_id: "voice-a",
                name: "Alex",
                collection_ids: ["col-red", "col-blue"],
              }],
              has_more: true,
              next_page_token: "page-2",
            }));
          }
          return new Response(JSON.stringify({
            voices: [{
              voice_id: "voice-b",
              name: "Bill",
              collection_ids: ["col-red"],
            }],
            has_more: false,
            next_page_token: null,
          }));
        }
        if (url.pathname.endsWith("/col-red")) {
          return new Response(JSON.stringify({ resource_name: "Studio Cast" }));
        }
        return new Response("Forbidden", { status: 403 });
      }) as typeof fetch,
    });
    assert.deepEqual(collections, [
      {
        collectionId: "col-blue",
        name: "Collection col-blue",
        voiceCount: 1,
        sampleVoiceNames: ["Alex"],
      },
      {
        collectionId: "col-red",
        name: "Studio Cast",
        voiceCount: 2,
        sampleVoiceNames: ["Alex", "Bill"],
      },
    ]);
    assert.equal(
      requestedUrls.filter((url) => url.pathname === "/v2/voices").length,
      2,
    );
    assert.equal(
      requestedUrls.find((url) => url.pathname === "/v2/voices")
        ?.searchParams.get("voice_type"),
      "saved",
    );
    assert.equal(
      requestedUrls.find((url) => url.pathname.endsWith("/col-red"))
        ?.searchParams.get("resource_type"),
      "voice_collection",
    );
  });

  it("keeps voice catalog configuration independent from the active response lane", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const catalogRoute = serverSource.slice(
      serverSource.indexOf('route("GET", "/api/voices/elevenlabs"'),
      serverSource.indexOf('route("POST", "/api/voices/preview-line"'),
    );
    assert.match(catalogRoute, /requestElevenLabsVoiceCatalog\(\{/u);
    assert.match(catalogRoute, /requestElevenLabsVoiceCollections\(\{/u);
    assert.match(catalogRoute, /requestElevenLabsVoiceIdentity\(\{/u);
    assert.match(
      catalogRoute,
      /collectionId: user\.elevenlabs_voice_collection_id/u,
    );
    assert.doesNotMatch(catalogRoute, /preferred_provider|Switch to Online/u);
    assert.match(serverSource, /resolveVoiceSynthesisExplicitOnlineContext\(\{/u);
  });

  it("keeps discovery non-importing with bounded exclusions and saves idempotently", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const discoverRoute = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/voices/elevenlabs/shared/discover"'),
      serverSource.indexOf('route("POST", "/api/voices/elevenlabs/shared/use"'),
    );
    const saveRoute = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/voices/elevenlabs/library"'),
      serverSource.indexOf('route("GET", "/api/voices/elevenlabs"'),
    );
    const useRoute = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/voices/elevenlabs/shared/use"'),
      serverSource.indexOf('route("POST", "/api/voices/elevenlabs/library"'),
    );
    assert.match(discoverRoute, /getElevenLabsApiKeyForUser\(userId, userKey\) \?\? config\.elevenLabsApiKey/u);
    assert.match(discoverRoute, /sharedVoiceExclusions\(body\.excludeVoiceIds\)/u);
    assert.match(discoverRoute, /boundedSharedVoiceText\(body\.direction\)/u);
    assert.match(discoverRoute, /listPremiumVoiceLibrary\(db, userId\)/u);
    assert.match(discoverRoute, /selectElevenLabsSharedVoiceCandidate\(/u);
    assert.doesNotMatch(discoverRoute, /importElevenLabsSharedVoice|\/v1\/voices\/add|DELETE/u);
    assert.match(useRoute, /requestElevenLabsVoiceCatalog\(/u);
    assert.match(useRoute, /importElevenLabsSharedVoice\(/u);
    assert.doesNotMatch(useRoute, /savePremiumVoiceLibraryEntry|premium_voice_library/u);
    assert.match(saveRoute, /findPremiumVoiceLibraryEntry\(db, userId, input\.sourceVoiceId\)/u);
    assert.match(saveRoute, /getElevenLabsApiKeyForUser\(userId, userKey\) \?\? config\.elevenLabsApiKey/u);
    assert.match(saveRoute, /requestElevenLabsVoiceCatalog\(/u);
    assert.match(saveRoute, /voice\.originalVoiceId === input\.sourceVoiceId/u);
    assert.match(saveRoute, /importElevenLabsSharedVoice\(/u);
    assert.match(saveRoute, /savePremiumVoiceLibraryEntry\(db, userId/u);
    assert.match(saveRoute, /elevenLabsSharedVoiceSaveFlights/u);
    assert.doesNotMatch(saveRoute, /DELETE/u);
  });
});

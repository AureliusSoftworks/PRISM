import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
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
    assert.deepEqual(result, {
      ok: true,
      kind: "builtin-english",
      engineUsed: "builtin-local-fallback",
      text: "hello",
      profile: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-1",
        elevenLabsEffect: "chorus",
        pitch: 0,
        warmth: 0,
        pace: 0.333,
        lilt: 0,
        bottishTone: 0.45,
        eqTilt: 0,
        gainDb: 0,
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
    });
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
      "[explosion] Welcome back.",
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
      "[sighs] [leans back] Welcome back.",
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
});

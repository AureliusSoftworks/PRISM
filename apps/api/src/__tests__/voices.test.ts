import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  VOICE_CAPABILITIES,
  applyPlayerNamePronunciation,
  cleanSpeakableAssistantProse,
  elevenLabsVoiceSettings,
  requestElevenLabsSpeech,
  requestElevenLabsSpeechWithTimestamps,
  requestElevenLabsVoiceCatalog,
  resolveElevenLabsVoiceId,
  resolveVoiceSynthesisBoundary,
  validateVoiceSynthesisRequest,
} from "../voices.ts";

describe("voice Phase 1 boundary", () => {
  it("advertises native system speech instead of the retired neural model", () => {
    assert.equal(VOICE_CAPABILITIES.builtinEnglish.model, "system-native");
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
        elevenLabsEffect: "clean",
        pitch: 0,
        warmth: 0,
        pace: 0.333,
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
  });

  it("uses only an explicit per-profile ElevenLabs identity", () => {
    assert.equal(resolveElevenLabsVoiceId({
      v: 2,
      enabled: true,
      baseVoiceId: "voice-1",
      elevenLabsVoiceId: "bot-voice",
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
    }), "bot-voice");
    assert.equal(resolveElevenLabsVoiceId({
      v: 1,
      baseVoiceId: "voice-1",
      pitch: 0,
      warmth: 0,
      pace: 0,
      lilt: 0,
    }), null);
  });

  it("maps profile performance effects into bounded ElevenLabs settings", () => {
    assert.deepEqual(
      elevenLabsVoiceSettings({
        v: 1,
        baseVoiceId: "voice-3",
        pitch: 1,
        warmth: -1,
        pace: 1,
        lilt: 1,
      }),
      {
        stability: 0.28,
        similarity_boost: 0.75,
        style: 0.36,
        use_speaker_boost: true,
        speed: 0.852,
      }
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
    assert.equal(elevenLabsVoiceSettings(request.profile).speed, 1.18);
  });

  it("keeps the ElevenLabs key server-side and sends the expected streaming payload", async () => {
    let request: { url: string; init?: RequestInit } | null = null;
    const response = await requestElevenLabsSpeech({
      apiKey: "secret-key",
      voiceId: "voice/provider id",
      model: "eleven_flash_v2_5",
      text: "hello",
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
      profile: { v: 1, baseVoiceId: "voice-1", pitch: 0, warmth: 0, pace: 0, lilt: 0 },
      fetchImpl: (async (url) => {
        requestUrl = String(url);
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

  it("opts into alignment transport without changing legacy requests", () => {
    assert.equal(validateVoiceSynthesisRequest({ text: "hello" }).includeAlignment, false);
    assert.equal(
      validateVoiceSynthesisRequest({ text: "hello", includeAlignment: true }).includeAlignment,
      true
    );
  });

  it("normalizes the ElevenLabs voice catalog", async () => {
    const voices = await requestElevenLabsVoiceCatalog({
      apiKey: "secret-key",
      fetchImpl: (async () => new Response(JSON.stringify({
        voices: [{
          voice_id: "voice-a",
          name: "Alex",
          category: "premade",
          preview_url: "https://example.test/alex.mp3",
          labels: { accent: "American", ignored: 3 },
        }],
      }), { status: 200 })) as typeof fetch,
    });
    assert.deepEqual(voices, [{
      voiceId: "voice-a",
      name: "Alex",
      category: "premade",
      description: null,
      previewUrl: "https://example.test/alex.mp3",
      labels: { accent: "American" },
    }]);
  });

  it("keeps voice catalog configuration independent from the active response lane", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const catalogRoute = serverSource.slice(
      serverSource.indexOf('route("GET", "/api/voices/elevenlabs"'),
      serverSource.indexOf('route("POST", "/api/voices/preview-line"'),
    );
    assert.match(catalogRoute, /requestElevenLabsVoiceCatalog\(\{/u);
    assert.doesNotMatch(catalogRoute, /preferred_provider|Switch to Online/u);
    assert.match(
      serverSource,
      /raw\.explicitOnlineContext === true && user\.preferred_provider !== "local"/u,
    );
  });
});

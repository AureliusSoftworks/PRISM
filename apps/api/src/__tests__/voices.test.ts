import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_CAPABILITIES,
  applyGlobalEnglishVoiceDefault,
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

  it("uses only the resolved per-bot or account-default ElevenLabs identity", () => {
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

  it("applies the global voice only when the bot has no explicit selection", () => {
    assert.equal(
      applyGlobalEnglishVoiceDefault({}, "builtin", { systemVoiceName: "Alex" }).systemVoiceName,
      "Alex"
    );
    assert.equal(
      applyGlobalEnglishVoiceDefault({ systemVoiceName: "Fred" }, "builtin", { systemVoiceName: "Alex" }).systemVoiceName,
      "Fred"
    );
    assert.equal(
      applyGlobalEnglishVoiceDefault({}, "elevenlabs", { elevenLabsVoiceId: "global-eleven" }).elevenLabsVoiceId,
      "global-eleven"
    );
  });

  it("maps portable pace and lilt controls into bounded ElevenLabs settings", () => {
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
});

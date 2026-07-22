import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATAR_ELEVENLABS_SFX_DURATION_SECONDS,
  AVATAR_ELEVENLABS_SFX_MODEL,
  buildAvatarElevenLabsSfxPrompt,
  buildCoffeeElevenLabsActionSfxPrompt,
  buildSignalAtmospherePrompt,
  COFFEE_ELEVENLABS_ACTION_SFX_MODEL,
  isCoffeeElevenLabsActionSfxKind,
  requestCoffeeElevenLabsActionSfx,
  requestAvatarElevenLabsSfx,
  requestSignalElevenLabsAtmosphere,
  SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL,
  SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS,
} from "../elevenlabs-sound.ts";

test("Avatar SFX generation requests a short seamless ElevenLabs loop", async () => {
  let body: Record<string, unknown> | null = null;
  const result = await requestAvatarElevenLabsSfx({
    apiKey: "test-key",
    prompt: "Soft clockwork breathing with tiny brass ticks",
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(Uint8Array.from([0x49, 0x44, 0x33]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "request-id": "avatar-sfx-1" },
      });
    },
  });
  const requestBody = body as Record<string, unknown>;
  assert.equal(
    requestBody.text,
    buildAvatarElevenLabsSfxPrompt(
      "Soft clockwork breathing with tiny brass ticks",
    ),
  );
  assert.equal(requestBody.duration_seconds, AVATAR_ELEVENLABS_SFX_DURATION_SECONDS);
  assert.equal(requestBody.prompt_influence, 0.35);
  assert.equal(requestBody.loop, true);
  assert.equal(requestBody.model_id, AVATAR_ELEVENLABS_SFX_MODEL);
  assert.equal(result.requestId, "avatar-sfx-1");
  assert.equal(result.audioBytes.length, 3);
});

test("Coffee action foley uses a small trusted physical-action allowlist", () => {
  assert.equal(isCoffeeElevenLabsActionSfxKind("coffee_pour"), true);
  assert.equal(isCoffeeElevenLabsActionSfxKind("spoken_whisper"), false);
  assert.match(buildCoffeeElevenLabsActionSfxPrompt("cup_set_down"), /ceramic coffee mug/iu);
  assert.doesNotMatch(
    buildCoffeeElevenLabsActionSfxPrompt("cup_set_down"),
    /\b(?:no|avoid|without)\b/iu,
  );
});

test("Coffee action foley requests a brief non-looping ElevenLabs effect", async () => {
  let body: Record<string, unknown> | null = null;
  const result = await requestCoffeeElevenLabsActionSfx({
    apiKey: "test-key",
    kind: "spoon_stir",
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(Uint8Array.from([0x49, 0x44, 0x33]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "request-id": "coffee-sfx-1" },
      });
    },
  });
  const requestBody = body as Record<string, unknown>;
  assert.equal(requestBody.duration_seconds, 1);
  assert.equal(requestBody.prompt_influence, 0.3);
  assert.equal(requestBody.loop, false);
  assert.equal(requestBody.model_id, COFFEE_ELEVENLABS_ACTION_SFX_MODEL);
  assert.equal(requestBody.text, buildCoffeeElevenLabsActionSfxPrompt("spoon_stir"));
  assert.equal(result.requestId, "coffee-sfx-1");
  assert.equal(result.audioBytes.length, 3);
});

test("Signal atmosphere prompt asks what the finished studio sounds like in silence", () => {
  const prompt = buildSignalAtmospherePrompt({
    showName: "Under the Surface",
    studioIdentity:
      "An underwater glass studio with slow water channels, occasional bubbles, and a radio static panel.",
  });
  assert.match(
    prompt,
    /What would it sound like in this room if one were completely silent\?/u,
  );
  assert.match(prompt, /underwater glass studio/iu);
  assert.match(prompt, /water channels/iu);
  assert.match(prompt, /occasional bubbles/iu);
  assert.match(prompt, /room-and-Foley loop unique to this studio/iu);
  assert.match(prompt, /distinctive backing bed/iu);
  assert.match(prompt, /warm low resonance/iu);
  assert.match(prompt, /damped low mids/iu);
  assert.match(prompt, /materials, objects, mechanisms, and setting/iu);
  assert.match(prompt, /highs faint/iu);
  assert.match(prompt, /smooth the loop boundary/iu);
  assert.doesNotMatch(prompt, /\bstatic\b|\bhiss\b|\bcrackle\b/iu);
  assert.doesNotMatch(prompt, /ventilation|microphone-room/iu);
  assert.doesNotMatch(prompt, /\bquiet\b|\bhush\b|\brestrained\b/iu);
  assert.doesNotMatch(prompt, /\bno\b|\bavoid\b|\bwithout\b/iu);
  assert.notEqual(
    prompt,
    buildSignalAtmospherePrompt({
      showName: "The Timber Line",
      studioIdentity:
        "A timber observatory with brass shutters, pendulum clocks, and a rain-dark roof.",
    }),
  );
});

test("Signal atmosphere prompt stays within ElevenLabs' 450-character limit", () => {
  const prompt = buildSignalAtmospherePrompt({
    showName: "The Long View",
    studioIdentity: `A timber observatory ${"with layered acoustic artifacts ".repeat(120)}`,
  });
  assert.ok(prompt.length <= SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS);
  assert.match(
    prompt,
    /What would it sound like in this room if one were completely silent\?/u,
  );
  assert.match(prompt, /Studio: A timber observatory/iu);
  assert.match(prompt, /room-and-Foley loop unique to this studio/iu);
  assert.match(prompt, /smooth the loop boundary/iu);
});

test("Signal atmosphere prompt carries up to five producer keyword cues", () => {
  const prompt = buildSignalAtmospherePrompt({
    showName: "The Long View",
    studioIdentity: "A timber observatory with brass shutters.",
    keywords: ["rain-dark", "clockwork", "tactile"],
  });
  assert.match(prompt, /Producer cues: rain-dark, clockwork, tactile/u);
  assert.match(prompt, /associative|shape its sparse material sounds/iu);
  assert.ok(prompt.length <= SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS);
});

test("Signal atmosphere request asks ElevenLabs for a 30-second loop", async () => {
  let body: Record<string, unknown> | null = null;
  const result = await requestSignalElevenLabsAtmosphere({
    apiKey: "test-key",
    prompt: `quiet studio air ${"and distant building hush ".repeat(30)}`,
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(Uint8Array.from([0x49, 0x44, 0x33]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "request-id": "sound-1" },
      });
    },
  });
  const requestBody = body as Record<string, unknown>;
  assert.equal(requestBody.duration_seconds, 30);
  assert.equal(requestBody.prompt_influence, 0.3);
  assert.equal(requestBody.loop, true);
  assert.equal(requestBody.model_id, SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL);
  assert.equal(typeof requestBody.text, "string");
  assert.ok(
    String(requestBody.text).length <=
      SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS,
  );
  assert.equal(result.requestId, "sound-1");
  assert.equal(result.audioBytes.length, 3);
});

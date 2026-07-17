import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalAtmospherePrompt,
  requestSignalElevenLabsAtmosphere,
  SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL,
  SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS,
} from "../elevenlabs-sound.ts";

test("Signal atmosphere prompt stays environmental and studio-specific", () => {
  const prompt = buildSignalAtmospherePrompt({
    showName: "The Long View",
    studioIdentity: "A timber observatory above a rain-dark valley.",
  });
  assert.match(prompt, /environmental room-tone loop/iu);
  assert.match(prompt, /timber observatory/iu);
  assert.doesNotMatch(prompt, /\bno\b|\bavoid\b|\bwithout\b/iu);
});

test("Signal atmosphere prompt stays within ElevenLabs' 450-character limit", () => {
  const prompt = buildSignalAtmospherePrompt({
    showName: "The Long View",
    studioIdentity: `A timber observatory ${"with layered acoustic artifacts ".repeat(120)}`,
  });
  assert.ok(prompt.length <= SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS);
  assert.match(prompt, /Acoustic identity: A timber observatory/iu);
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

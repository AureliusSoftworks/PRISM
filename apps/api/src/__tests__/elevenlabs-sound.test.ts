import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalAtmospherePrompt,
  requestSignalElevenLabsAtmosphere,
  SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL,
  SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS,
} from "../elevenlabs-sound.ts";

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
  assert.match(prompt, /warm low room resonance/iu);
  assert.match(prompt, /soft bass weight/iu);
  assert.match(prompt, /damped low-mid texture/iu);
  assert.match(prompt, /upper-frequency detail faint and diffuse/iu);
  assert.match(prompt, /occasional distinct set sounds/iu);
  assert.match(prompt, /smooth loop boundary/iu);
  assert.doesNotMatch(prompt, /\bstatic\b|\bhiss\b|\bcrackle\b/iu);
  assert.doesNotMatch(prompt, /ventilation|microphone-room/iu);
  assert.doesNotMatch(prompt, /\bquiet\b|\bhush\b|\brestrained\b/iu);
  assert.doesNotMatch(prompt, /\bno\b|\bavoid\b|\bwithout\b/iu);
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
  assert.match(prompt, /sounds implied by this exact studio/iu);
  assert.match(prompt, /smooth loop boundary/iu);
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

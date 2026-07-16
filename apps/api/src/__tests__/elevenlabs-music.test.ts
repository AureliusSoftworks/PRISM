import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_ELEVENLABS_MUSIC_MODEL,
  buildSignalElevenLabsMusicCompositionPlan,
  requestSignalElevenLabsIntroMusic,
} from "../elevenlabs-music.ts";

describe("Signal ElevenLabs intro music", () => {
  it("builds a stable copyright-safe two-part melody plan without show identity text", () => {
    const plan = buildSignalElevenLabsMusicCompositionPlan({
      showId: "show-private-name",
      accentColor: "#12AACC",
    });
    assert.equal(
      JSON.stringify(plan),
      JSON.stringify(buildSignalElevenLabsMusicCompositionPlan({
        showId: "show-private-name",
        accentColor: "#12AACC",
      })),
    );
    const serialized = JSON.stringify(plan);
    assert.doesNotMatch(serialized, /show-private-name/u);
    assert.equal(plan.chunks.length, 2);
    assert.deepEqual(plan.chunks.map((chunk) => chunk.duration_ms), [3_000, 3_000]);
    assert.match(serialized, /four clearly separated monophonic pitches/u);
    assert.match(serialized, /rising variation/u);
    assert.match(serialized, /single sustained chord/u);
    assert.match(serialized, /one-chord sting/u);
    assert.match(serialized, /#12aacc/u);
  });

  it("requests an exact Music v2 composition plan and returns its bytes", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const compositionPlan = buildSignalElevenLabsMusicCompositionPlan({
      showId: "show-1",
      accentColor: "#7b5cff",
    });
    const result = await requestSignalElevenLabsIntroMusic({
      apiKey: "secret-test-key",
      compositionPlan,
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "request-id": "music-request-1",
          },
        });
      },
    });
    assert.match(capturedUrl, /\/v1\/music\?output_format=mp3_48000_192$/u);
    assert.equal(new Headers(capturedInit?.headers).get("xi-api-key"), "secret-test-key");
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    assert.equal(body.model_id, SIGNAL_ELEVENLABS_MUSIC_MODEL);
    assert.deepEqual(body.composition_plan, compositionPlan);
    assert.equal(body.prompt, undefined);
    assert.equal(body.music_length_ms, undefined);
    assert.equal(body.force_instrumental, undefined);
    assert.deepEqual([...result.audioBytes], [1, 2, 3, 4]);
    assert.equal(result.contentType, "audio/mpeg");
    assert.equal(result.requestId, "music-request-1");
  });
});

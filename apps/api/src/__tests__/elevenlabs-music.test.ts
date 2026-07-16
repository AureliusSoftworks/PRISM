import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_ELEVENLABS_MUSIC_MODEL,
  buildSignalElevenLabsMusicCompositionPlan,
  requestSignalElevenLabsIntroMusic,
} from "../elevenlabs-music.ts";

describe("Signal ElevenLabs intro music", () => {
  it("builds a stable, severe commanding plan without raw-persona leakage", () => {
    const plan = buildSignalElevenLabsMusicCompositionPlan({
      temperament: "commanding",
      seed: "show-private-name",
    });
    assert.equal(
      JSON.stringify(plan),
      JSON.stringify(buildSignalElevenLabsMusicCompositionPlan({
        temperament: "commanding",
        seed: "show-private-name",
      })),
    );
    const serialized = JSON.stringify(plan);
    const positive = plan.chunks.flatMap((chunk) => chunk.positive_styles).join(" ");
    const negative = plan.chunks.flatMap((chunk) => chunk.negative_styles).join(" ");
    assert.doesNotMatch(serialized, /Mara|Vale|urgent public evidence|system_prompt|show-private-name/iu);
    assert.equal(plan.chunks.length, 2);
    assert.deepEqual(plan.chunks.map((chunk) => chunk.duration_ms), [3_000, 3_000]);
    assert.match(positive, /foreground four-note hook begins immediately/u);
    assert.match(positive, /descending minor-tonal four-note motif/u);
    assert.match(positive, /abrupt dry hard-button ending/u);
    assert.match(negative, /ambient pad/u);
    assert.match(negative, /pad-only/u);
    assert.match(negative, /drone/u);
    assert.match(negative, /cheerful/u);
    assert.match(negative, /whimsical/u);
    assert.match(negative, /upbeat corporate/u);
    assert.doesNotMatch(positive, /cheerful|whimsical|corporate|ambient|soundscape/iu);
    assert.doesNotMatch(serialized, /rising variation|warm and modern/iu);
    assert.doesNotMatch(positive, /resolving chime/iu);
  });

  it("keeps playful and warm provider directions distinct from commanding", () => {
    const commanding = buildSignalElevenLabsMusicCompositionPlan({
      temperament: "commanding",
      seed: "show-1",
    });
    const playful = buildSignalElevenLabsMusicCompositionPlan({
      temperament: "playful",
      seed: "show-1",
    });
    const warm = buildSignalElevenLabsMusicCompositionPlan({
      temperament: "warm",
      seed: "show-1",
    });
    assert.notDeepEqual(commanding, playful);
    assert.notDeepEqual(playful, warm);
    assert.match(JSON.stringify(playful), /118 BPM/u);
    assert.match(JSON.stringify(playful), /bright articulated mallet-synth lead/u);
    assert.match(JSON.stringify(warm), /rounded electric-key lead/u);
  });

  it("requests an exact Music v2 composition plan and returns its bytes", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const compositionPlan = buildSignalElevenLabsMusicCompositionPlan({
      temperament: "neutral",
      seed: "show-1",
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

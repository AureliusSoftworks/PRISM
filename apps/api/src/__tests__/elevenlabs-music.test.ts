import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSignalMusicProfile } from "@localai/shared";
import {
  SIGNAL_ELEVENLABS_MUSIC_MODEL,
  buildSignalElevenLabsMusicCompositionPlan,
  requestSignalElevenLabsIntroMusic,
} from "../elevenlabs-music.ts";

describe("Signal ElevenLabs intro music", () => {
  it("builds a stable, severe commanding plan without raw-persona leakage", () => {
    const plan = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "commanding",
        seed: "show-private-name",
        premise: "A severe inquiry into empire and control.",
      }),
      seed: "show-private-name",
    });
    assert.equal(
      JSON.stringify(plan),
      JSON.stringify(buildSignalElevenLabsMusicCompositionPlan({
        profile: buildSignalMusicProfile({
          temperament: "commanding",
          seed: "show-private-name",
          premise: "A severe inquiry into empire and control.",
        }),
        seed: "show-private-name",
      })),
    );
    const serialized = JSON.stringify(plan);
    const positive = plan.chunks.flatMap((chunk) => chunk.positive_styles).join(" ");
    const negative = plan.chunks.flatMap((chunk) => chunk.negative_styles).join(" ");
    assert.doesNotMatch(serialized, /Mara|Vale|urgent public evidence|system_prompt|show-private-name/iu);
    assert.equal(plan.chunks.length, 2);
    assert.deepEqual(plan.chunks.map((chunk) => chunk.duration_ms), [3_000, 3_000]);
    assert.match(positive, /foreground melody begins immediately/u);
    assert.match(positive, /genuinely melodic theme/u);
    assert.match(positive, /two-note low-brass call/u);
    assert.match(positive, /descending minor-tonal melodic contour/u);
    assert.match(positive, /decisive resolved hard-button cadence/u);
    assert.match(positive, /brief natural release/u);
    assert.match(negative, /ambient pad/u);
    assert.match(negative, /pad-only/u);
    assert.match(negative, /drone/u);
    assert.match(negative, /cheerful/u);
    assert.match(negative, /whimsical/u);
    assert.match(negative, /upbeat corporate/u);
    assert.doesNotMatch(positive, /cheerful|whimsical|corporate|ambient|soundscape/iu);
    assert.doesNotMatch(serialized, /rising variation|warm and modern/iu);
    assert.doesNotMatch(positive, /resolving chime/iu);
    assert.doesNotMatch(negative, /fade out/u);
  });

  it("keeps playful and warm provider directions distinct from commanding", () => {
    const commanding = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "commanding",
        seed: "show-1",
      }),
      seed: "show-1",
    });
    const playful = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "playful",
        seed: "show-1",
      }),
      seed: "show-1",
    });
    const warm = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "warm",
        seed: "show-1",
      }),
      seed: "show-1",
    });
    assert.notDeepEqual(commanding, playful);
    assert.notDeepEqual(playful, warm);
    assert.match(JSON.stringify(playful), /124 BPM/u);
    assert.match(JSON.stringify(playful), /xylophone|clarinet|toy-piano/u);
    assert.match(JSON.stringify(warm), /guitar|mandolin/u);
  });

  it("keeps cinematic, magical, and nautical plans structurally distinct", () => {
    const cinematic = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "commanding",
        seed: "vader-private-seed",
        premise: "Darth Vader interrogates the cost of empire and control.",
        studioIdentity: "An armoured imperial chamber inside a dark fortress.",
      }),
      seed: "vader-private-seed",
    });
    const magical = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "adventurous",
        seed: "harry-private-seed",
        premise: "Harry Potter examines courage, friendship, and prophecy.",
        studioIdentity: "An enchanted castle study with wands, potions, and owls.",
      }),
      seed: "harry-private-seed",
    });
    const nautical = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "playful",
        seed: "host-private-seed",
        premise: "SpongeBob hosts a comic show from an undersea neighbourhood.",
        studioIdentity: "A pineapple room with coral and nautical tools.",
      }),
      seed: "host-private-seed",
    });
    const cinematicText = JSON.stringify(cinematic);
    const magicalText = JSON.stringify(magical);
    const nauticalText = JSON.stringify(nautical);
    assert.match(cinematicText, /brass|horn|trombone/u);
    assert.match(cinematicText, /two-note low-brass call/u);
    assert.match(magicalText, /celesta|tuned-glass/u);
    assert.match(magicalText, /irregular five-note question/u);
    assert.match(magicalText, /106 BPM/u);
    assert.doesNotMatch(magicalText, /92 BPM|severe low pulse/u);
    assert.match(nauticalText, /ukulele/u);
    assert.match(nauticalText, /syncopated ukulele strum gesture/u);
    assert.match(
      magical.chunks.flatMap((chunk) => chunk.negative_styles).join(" "),
      /acoustic guitar/u,
    );
    assert.match(
      nautical.chunks.flatMap((chunk) => chunk.negative_styles).join(" "),
      /arpeggio|arpeggiator/u,
    );
    assert.doesNotMatch(
      `${cinematicText}${magicalText}${nauticalText}`,
      /Darth Vader|Harry Potter|SpongeBob|pineapple|coral|private-seed/iu,
    );
    assert.notDeepEqual(cinematic, magical);
    assert.notDeepEqual(magical, nautical);
  });

  it("requests an exact Music v2 composition plan and returns its bytes", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const compositionPlan = buildSignalElevenLabsMusicCompositionPlan({
      profile: buildSignalMusicProfile({
        temperament: "neutral",
        seed: "show-1",
      }),
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

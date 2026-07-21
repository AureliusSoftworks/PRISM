import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSignalMusicProfile } from "./signalMusicProfile.ts";

describe("Signal music profile", () => {
  it("separates cinematic, magical, and nautical show identities", () => {
    const cinematic = buildSignalMusicProfile({
      temperament: "commanding",
      seed: "show-a",
      premise: "An intimidating inquiry into the cost of empire.",
      studioIdentity: "An armoured imperial chamber inside a dark fortress.",
    });
    const nautical = buildSignalMusicProfile({
      temperament: "playful",
      seed: "show-b",
      premise: "Buoyant comic questions from an undersea neighbourhood.",
      studioIdentity: "A pineapple room with coral, nautical tools, and a reef window.",
    });
    const magical = buildSignalMusicProfile({
      temperament: "adventurous",
      seed: "show-c",
      premise: "A young wizard examines courage, friendship, and prophecy.",
      studioIdentity: "An enchanted castle study with wands, potions, and owls.",
    });
    assert.equal(cinematic.palette, "cinematic");
    assert.match(cinematic.lead, /brass|horn|trombone/u);
    assert.match(cinematic.avoidStyles.join(" "), /acoustic guitar/u);
    assert.equal(nautical.palette, "nautical");
    assert.match(nautical.lead, /ukulele/u);
    assert.match(nautical.avoidStyles.join(" "), /arpeggio/u);
    assert.equal(magical.palette, "magical");
    assert.match(magical.lead, /celesta|tuned-glass/u);
    assert.match(magical.avoidStyles.join(" "), /acoustic guitar/u);
    assert.equal(cinematic.tempoBpm, 92);
    assert.equal(cinematic.register, "low");
    assert.equal(cinematic.ending, "hard");
    assert.deepEqual(cinematic.motifIntervals, [7, 5, 3, 0]);
    assert.equal(magical.tempoBpm, 106);
    assert.equal(magical.register, "middle-high");
    assert.equal(magical.ending, "resolve");
    assert.deepEqual(magical.motifIntervals, [0, 5, 7, 12]);
    assert.equal(nautical.tempoBpm, 122);
    assert.notDeepEqual(cinematic, nautical);
    assert.notDeepEqual(cinematic, magical);
    assert.notDeepEqual(magical, nautical);
  });

  it("is deterministic and never carries raw show prose into the profile", () => {
    const args = {
      temperament: "inventive" as const,
      seed: "private-show-seed",
      premise: "PRIVATE PERSONA NAME builds impossible machines.",
      hostingStyle: "Exacting but delighted by a clever mechanism.",
      studioIdentity: "A workshop of gears, circuits, and metal instruments.",
    };
    const profile = buildSignalMusicProfile(args);
    assert.deepEqual(profile, buildSignalMusicProfile(args));
    assert.equal(profile.palette, "mechanical");
    assert.doesNotMatch(
      JSON.stringify(profile),
      /PRIVATE PERSONA NAME|impossible machines|private-show-seed/iu,
    );
  });
});

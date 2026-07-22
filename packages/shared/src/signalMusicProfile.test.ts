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
    assert.equal(magical.tempoBpm, 98);
    assert.equal(magical.register, "low-middle");
    assert.equal(magical.ending, "resolve");
    assert.deepEqual(magical.motifIntervals, [0, 5, 10, 7]);
    assert.equal(nautical.tempoBpm, 124);
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

  it("translates distinct persona tensions into materially different music identities", () => {
    const volatileScientist = buildSignalMusicProfile({
      temperament: "inventive",
      seed: "volatile-show",
      persona:
        "A reckless, chaotic scientist with dangerous genius, sardonic wit, and a concealed protective streak.",
      musicDirection:
        "Volatile alien science: warped theremin, crackling analog electricity, lurching asymmetric rhythm, chromatic instability, and a dry short-circuit ending.",
    });
    const tragicCommander = buildSignalMusicProfile({
      temperament: "commanding",
      seed: "commander-show",
      persona:
        "A feared authoritarian enforcer whose disciplined command hides grief and conflict.",
      musicDirection:
        "Monumental orchestral weight: low brass, contrabass strings, martial timpani, deliberate minor gravity, and an inevitable hard cadence.",
    });
    const sunnyOptimist = buildSignalMusicProfile({
      temperament: "playful",
      seed: "optimist-show",
      persona:
        "An innocent, cheerful optimist with unstoppable confidence, playful curiosity, and generous comic energy.",
      musicDirection:
        "Carefree wooden acoustic world: dry ukulele, wooden marimba, buoyant syncopation, bright modal harmony, and a lifted smile-button ending.",
    });

    assert.deepEqual(
      [
        volatileScientist.energyShape,
        volatileScientist.rhythmicCharacter,
        volatileScientist.harmonicLanguage,
        volatileScientist.productionTexture,
        volatileScientist.endingBehavior,
      ],
      [
        "volatile",
        "lurching-asymmetric",
        "chromatic-unstable",
        "electrical-analog",
        "short-circuit",
      ],
    );
    assert.match(volatileScientist.lead, /theremin|analog-synth/u);

    assert.deepEqual(
      [
        tragicCommander.energyShape,
        tragicCommander.rhythmicCharacter,
        tragicCommander.harmonicLanguage,
        tragicCommander.productionTexture,
        tragicCommander.endingBehavior,
      ],
      [
        "monumental",
        "martial-deliberate",
        "minor-gravity",
        "monumental-orchestral",
        "inevitable-hard",
      ],
    );
    assert.match(tragicCommander.lead, /contrabass|low-brass/u);

    assert.deepEqual(
      [
        sunnyOptimist.energyShape,
        sunnyOptimist.rhythmicCharacter,
        sunnyOptimist.harmonicLanguage,
        sunnyOptimist.productionTexture,
        sunnyOptimist.endingBehavior,
      ],
      [
        "buoyant",
        "buoyant-syncopated",
        "bright-modal",
        "wooden-acoustic",
        "lifted-smile",
      ],
    );
    assert.match(sunnyOptimist.lead, /ukulele|wooden-marimba/u);
    assert.notDeepEqual(volatileScientist, tragicCommander);
    assert.notDeepEqual(tragicCommander, sunnyOptimist);
    assert.doesNotMatch(
      JSON.stringify([
        volatileScientist,
        tragicCommander,
        sunnyOptimist,
      ]),
      /volatile-show|commander-show|optimist-show|reckless, chaotic|feared authoritarian|innocent, cheerful/iu,
    );
  });
});

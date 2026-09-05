import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PREMIUM_RESPELLING_RULESET_VERSION,
  VOICE_ACCENT_DEFINITIONS,
  applyPremiumRespelling,
  premiumRespellingIsAvailable,
  premiumRespellingRules,
} from "@localai/shared";

const LINE =
  "I think this is the other thing. Three of them said thanks, brother.";

function respell(
  influence: string,
  strength: string,
  text = LINE,
  protectedPhrases?: readonly string[],
) {
  return applyPremiumRespelling({ text, influence, strength, protectedPhrases });
}

describe("Premium respelling", () => {
  it("publishes a versioned consonant-only ruleset", () => {
    assert.match(PREMIUM_RESPELLING_RULESET_VERSION, /^\d{4}\.\d{2}\.\d{2}\.\d+$/u);
    assert.equal(premiumRespellingIsAvailable("cockney-english"), true);
    assert.equal(premiumRespellingIsAvailable("bay-area-english"), false);
    assert.equal(premiumRespellingIsAvailable("none"), false);
  });

  it("keeps the written line byte-identical no matter what it respells", () => {
    // Captions, transcripts, memories, boards, and exports all read the
    // source side. This is the invariant a future refactor breaks first.
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      for (const strength of ["light", "balanced", "strong"]) {
        const result = respell(definition.localSpeechprintFallback, strength);
        assert.equal(
          result.segments.map((segment) => segment.sourceText).join(""),
          LINE,
        );
        assert.equal(
          result.text === LINE,
          !result.changed,
          `${definition.id} ${strength} reported the wrong change flag`,
        );
      }
    }
  });

  it("leaves every accent alone at Light, where the direction carries it", () => {
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      const result = respell(definition.localSpeechprintFallback, "light");
      assert.equal(result.changed, false);
      assert.equal(result.text, LINE);
    }
  });

  it("spells the th families apart instead of treating them as one", () => {
    // Orthographic "th" is θ in "think" and ð in "this". An accent that
    // fronts only θ must not touch the ð words.
    assert.match(respell("essex-english", "strong").text, /I fink this/u);
    assert.doesNotMatch(respell("essex-english", "strong").text, /vis|dis/u);
    // Cockney fronts both, but ð only word-medially: "bruvver", never "vis".
    const cockney = respell("cockney-english", "strong").text;
    assert.match(cockney, /I fink this/u);
    assert.match(cockney, /bruvver/u);
    // MLE and Irish stop rather than front: "tink" and "dis".
    assert.match(respell("multicultural-london-english", "balanced").text, /I tink dis/u);
    assert.match(respell("irish-english", "balanced").text, /I tink dis/u);
    // French fricates: "sink" and "zis".
    assert.match(respell("french-influenced-english", "balanced").text, /I sink zis/u);
  });

  it("lets Strength widen the word list rather than change the sound", () => {
    const balanced = respell("irish-english", "balanced");
    const strong = respell("irish-english", "strong");
    assert.ok(balanced.changed && strong.changed);
    assert.match(balanced.text, /of them said/u);
    assert.match(strong.text, /of dem said/u);
    assert.deepEqual(strong.appliedRuleIds, balanced.appliedRuleIds);
  });

  it("holds an accent whose Local rule only fires at Strong until Strong", () => {
    assert.equal(respell("essex-english", "balanced").changed, false);
    assert.equal(respell("essex-english", "strong").changed, true);
  });

  it("never respells a protected name, initialism, or numbered token", () => {
    const text = "Thanks, Thistle. THINK and think3 and think are different.";
    const result = respell("irish-english", "strong", text, ["Thistle"]);
    assert.match(result.text, /Thistle/u);
    assert.match(result.text, /THINK/u);
    assert.match(result.text, /think3/u);
    assert.match(result.text, /and tink are/u);
  });

  it("carries the source word's capitalization onto its respelling", () => {
    assert.match(respell("irish-english", "balanced", "Think about it.").text, /^Tink/u);
    assert.match(
      respell("cockney-english", "strong", "Have a look.").text,
      /^'Ave/u,
    );
  });

  it("names one respelling per word so no rule silently shadows another", () => {
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      const seen = new Map<string, string>();
      for (const rule of premiumRespellingRules(definition.localSpeechprintFallback)) {
        for (const word of Object.keys(rule.words)) {
          const previous = seen.get(word);
          assert.equal(
            previous,
            undefined,
            `${definition.id}: "${word}" respelled by both ${previous} and ${rule.id}`,
          );
          seen.set(word, rule.id);
          assert.equal(word, word.toLocaleLowerCase());
        }
      }
    }
  });

  it("descends every respelling from a rule the accent already has", () => {
    // The word side and the phoneme side of one accent must stay traceable
    // to each other; a respelling with no Local counterpart is invented
    // phonology the Accent Map never claimed.
    const known = new Set([
      "theta-front", "eth-front", "theta-stop", "eth-stop", "theta-t",
      "eth-d", "theta-s", "eth-z", "h-drop", "w-labiodental",
    ]);
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      for (const rule of premiumRespellingRules(definition.localSpeechprintFallback)) {
        assert.ok(known.has(rule.id), `${definition.id}: unknown rule ${rule.id}`);
      }
    }
  });
});

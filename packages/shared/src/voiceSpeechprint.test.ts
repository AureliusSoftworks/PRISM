import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  applyLocalVoiceSpeechprintMelodyToIpa,
  applyLocalVoiceSpeechprintToIpa,
} from "@localai/shared";

const SAMPLE_IPA = "θɪs ɹɪvɚ wɪl ðɹaɪv vɛɹi faɹ";

describe("local voice Speechprints", () => {
  it("publishes broad versioned Instant-compatible profiles for both bases", () => {
    assert.equal(LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.length, 42);
    assert.match(LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256, /^[a-f0-9]{64}$/u);
    for (const capability of LOCAL_VOICE_SPEECHPRINT_CAPABILITIES) {
      assert.deepEqual(capability.supportedBaseLocales, ["en-US", "en-GB"]);
      assert.deepEqual(capability.strengths, ["light", "balanced", "strong"]);
      assert.deepEqual(capability.supportedEngines, ["instant"]);
      assert.equal(capability.approximate, true);
    }
  });

  it("covers additional regions without collapsing them into distant profiles", () => {
    for (const id of [
      "latin-american-spanish-influenced-english",
      "mexican-spanish-influenced-english",
      "north-african-arabic-influenced-english",
      "nigerian-english",
      "south-african-english",
      "bengali-influenced-english",
      "filipino-english",
      "vietnamese-influenced-english",
      "pacific-island-english",
    ]) {
      assert.ok(
        LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.some(
          (capability) => capability.id === id,
        ),
        id,
      );
    }

    const arabic = applyLocalVoiceSpeechprintToIpa({
      ipa: "ɹɪvɚ",
      speechprint: {
        influence: "middle-eastern-arabic-influenced-english",
        strength: "light",
        variationSeed: "arabic-character",
      },
    });
    const newZealand = applyLocalVoiceSpeechprintToIpa({
      ipa: "fɪt faɹ",
      speechprint: {
        influence: "new-zealand-english",
        strength: "balanced",
        variationSeed: "new-zealand-character",
      },
    });
    assert.equal(arabic.ipa.startsWith("ɾ"), true);
    assert.equal(newZealand.ipa.includes("ɪ"), false);
    assert.equal(newZealand.ipa.includes("ɹ"), false);
  });

  it("adds restrained Italian, Australian, and Canadian signatures", () => {
    const italian = applyLocalVoiceSpeechprintToIpa({
      ipa: "θɪs ɹɛd bag",
      speechprint: {
        influence: "italian-influenced-english",
        strength: "balanced",
        variationSeed: "italian-character",
      },
    });
    const australian = applyLocalVoiceSpeechprintToIpa({
      ipa: "faɹ oʊvɚ seɪf",
      speechprint: {
        influence: "australian-english",
        strength: "balanced",
        variationSeed: "australian-character",
      },
    });
    const canadian = applyLocalVoiceSpeechprintToIpa({
      ipa: "ɹaɪt ɹaɪd aʊt laʊd",
      speechprint: {
        influence: "canadian-english",
        strength: "balanced",
        variationSeed: "canadian-character",
      },
    });

    assert.match(italian.ipa, /^tɪs ɾɛd /u);
    assert.equal(australian.ipa.includes("ɹ"), false);
    assert.match(australian.ipa, /əʉvə/u);
    assert.equal(canadian.ipa, "ɹʌɪt ɹaɪd ʌʊt laʊd");
  });

  it("adds distinct New York and Southern U.S. signatures", () => {
    const newYork = applyLocalVoiceSpeechprintToIpa({
      ipa: "faɹ ɔl taɪm",
      speechprint: {
        influence: "new-york-english",
        strength: "balanced",
        variationSeed: "new-york-character",
      },
    });
    const southern = applyLocalVoiceSpeechprintToIpa({
      ipa: "pɛn ɹaɪd seɪf",
      speechprint: {
        influence: "southern-us-english",
        strength: "balanced",
        variationSeed: "southern-character",
      },
    });

    assert.equal(newYork.ipa, "fa oəl taɪm");
    assert.equal(southern.ipa, "pɪn ɹaːd seɪf");
  });

  it("keeps French and German influences restrained and strength-bounded", () => {
    const frenchLight = applyLocalVoiceSpeechprintToIpa({
      ipa: "θɪs hɪɹz ðə ɹɪvɚ",
      speechprint: {
        influence: "french-influenced-english",
        strength: "light",
        variationSeed: "french-character",
      },
    });
    const germanLight = applyLocalVoiceSpeechprintToIpa({
      ipa: "wɪ ðɹaɪv təwɔɹd",
      speechprint: {
        influence: "german-influenced-english",
        strength: "light",
        variationSeed: "german-character",
      },
    });
    assert.deepEqual(frenchLight.appliedRuleIds, ["theta-s"]);
    assert.deepEqual(germanLight.appliedRuleIds, ["w-labiodental"]);
    assert.equal(frenchLight.ipa.includes("ʁ"), false);
    assert.equal(germanLight.ipa.includes("ʁ"), false);
  });

  it("gives Russian-influenced English a restrained welcome progression", () => {
    const light = applyLocalVoiceSpeechprintToIpa({
      ipa: "wɛlkəm θɪs ɹɪvɚ",
      speechprint: {
        influence: "russian-influenced-english",
        strength: "light",
        variationSeed: "russian-character",
      },
    });
    const balanced = applyLocalVoiceSpeechprintToIpa({
      ipa: "wɛlkəm θɪs ɹɪvɚ",
      speechprint: {
        influence: "russian-influenced-english",
        strength: "balanced",
        variationSeed: "russian-character",
      },
    });
    const strong = applyLocalVoiceSpeechprintToIpa({
      ipa: "wɛlkəm θɪs ɹɪvɚ",
      speechprint: {
        influence: "russian-influenced-english",
        strength: "strong",
        variationSeed: "russian-character",
      },
    });

    assert.equal(light.ipa, "vɛlkəm θɪs ɹɪvɚ");
    assert.match(balanced.ipa, /^v(?:ɛ|e)lkəm sɪs /u);
    assert.match(strong.ipa, /^v(?:ɛ|e)lkʌm sɪs /u);
    assert.deepEqual(light.appliedRuleIds, ["w-labiodental"]);
    assert.ok(strong.appliedRuleIds.length >= balanced.appliedRuleIds.length);
  });

  it("is deterministic per character seed across every profile and strength", () => {
    for (const capability of LOCAL_VOICE_SPEECHPRINT_CAPABILITIES) {
      for (const strength of capability.strengths) {
        const speechprint = {
          influence: capability.id,
          strength,
          variationSeed: "character-seed-14",
        } as const;
        assert.deepEqual(
          applyLocalVoiceSpeechprintToIpa({ ipa: SAMPLE_IPA, speechprint }),
          applyLocalVoiceSpeechprintToIpa({ ipa: SAMPLE_IPA, speechprint }),
        );
      }
    }
  });

  it("adds a distinct Mexican Spanish signature beside Latin American Spanish", () => {
    const phrase = "ðə sˈʌn hɪɹ vɛɹi faɹ";
    const mexican = applyLocalVoiceSpeechprintToIpa({
      ipa: phrase,
      speechprint: {
        influence: "mexican-spanish-influenced-english",
        strength: "strong",
        variationSeed: "mexican-character",
      },
    });
    const latinAmerican = applyLocalVoiceSpeechprintToIpa({
      ipa: phrase,
      speechprint: {
        influence: "latin-american-spanish-influenced-english",
        strength: "strong",
        variationSeed: "mexican-character",
      },
    });
    assert.notEqual(mexican.ipa, latinAmerican.ipa);
    assert.ok(
      mexican.appliedRuleIds.includes("near-close-i") ||
        mexican.appliedRuleIds.includes("h-velar") ||
        mexican.ipa.includes("x") ||
        /[^ʌ]/.test(mexican.ipa),
    );
    assert.match(mexican.ipa, /sˈa[nɴ]?|sa[nɴ]/u);
  });

  it("keeps Natural byte-for-byte and applies only rules allowed by strength", () => {
    assert.deepEqual(
      applyLocalVoiceSpeechprintToIpa({
        ipa: SAMPLE_IPA,
        speechprint: {
          influence: "none",
          strength: "strong",
          variationSeed: "ignored",
        },
      }),
      { ipa: SAMPLE_IPA, appliedRuleIds: [] },
    );
    const light = applyLocalVoiceSpeechprintToIpa({
      ipa: SAMPLE_IPA,
      speechprint: {
        influence: "spanish-influenced-english",
        strength: "light",
        variationSeed: "persona-a",
      },
    });
    const strong = applyLocalVoiceSpeechprintToIpa({
      ipa: SAMPLE_IPA,
      speechprint: {
        influence: "spanish-influenced-english",
        strength: "strong",
        variationSeed: "persona-a",
      },
    });
    assert.notEqual(light.ipa, SAMPLE_IPA);
    assert.ok(strong.appliedRuleIds.length >= light.appliedRuleIds.length);
  });

  it("maps English STRUT (sun) to open/central a for realist Romance Speechprints", () => {
    const sun = "sˈʌn";
    const spanish = applyLocalVoiceSpeechprintToIpa({
      ipa: sun,
      speechprint: {
        influence: "spanish-influenced-english",
        strength: "balanced",
        variationSeed: "sun-realism",
      },
    });
    const italian = applyLocalVoiceSpeechprintToIpa({
      ipa: sun,
      speechprint: {
        influence: "italian-influenced-english",
        strength: "balanced",
        variationSeed: "sun-realism",
      },
    });
    const europeanPortuguese = applyLocalVoiceSpeechprintToIpa({
      ipa: sun,
      speechprint: {
        influence: "european-portuguese-influenced-english",
        strength: "balanced",
        variationSeed: "sun-realism",
      },
    });
    assert.equal(spanish.ipa, "sˈan");
    assert.equal(italian.ipa, "sˈan");
    assert.equal(europeanPortuguese.ipa, "sˈɐn");
    assert.ok(spanish.appliedRuleIds.includes("strut-open-a"));
    assert.ok(europeanPortuguese.appliedRuleIds.includes("strut-central-a"));
  });

  it("differentiates Italian vs Spanish stress and rhythm on multi-syllable English", () => {
    const phrase = "ðə sˈʌn ɹˈaɪzᵻz ˌoʊvɚ ðə kɹiːˈeɪɾɪv pˈiːpəl";
    const italian = applyLocalVoiceSpeechprintToIpa({
      ipa: phrase,
      speechprint: {
        influence: "italian-influenced-english",
        strength: "balanced",
        variationSeed: "inflection-bench",
      },
    });
    const spanish = applyLocalVoiceSpeechprintToIpa({
      ipa: phrase,
      speechprint: {
        influence: "spanish-influenced-english",
        strength: "balanced",
        variationSeed: "inflection-bench",
      },
    });

    assert.notEqual(italian.ipa, spanish.ipa);
    assert.match(italian.ipa, /s[ˈˌ]an/u);
    assert.match(spanish.ipa, /sˈan/u);
    assert.match(italian.ipa, /k[ɾɹ]iːˈeɪɾɪv/u);
    assert.match(spanish.ipa, /k[ɾɹ][ˈˌ]iːeɪɾɪv|k[ɾɹ]iː[ˈˌ]eɪɾɪv/u);
    assert.ok(italian.appliedRuleIds.includes("rhythm-demote-secondary"));
    assert.ok(spanish.appliedRuleIds.includes("rhythm-stress-early"));
    assert.equal(italian.appliedRuleIds.includes("rhythm-stress-early"), false);
    assert.ok(
      italian.appliedRuleIds.includes("melody-contour-wave-final") ||
        spanish.appliedRuleIds.includes("melody-contour-peak-edges"),
    );
  });

  it("skips stress-rhythm reshaping for digit and code-like tokens", () => {
    const spanish = applyLocalVoiceSpeechprintToIpa({
      ipa: "PRISM_42 kɹiːˈeɪɾɪv",
      speechprint: {
        influence: "spanish-influenced-english",
        strength: "strong",
        variationSeed: "protected-bench",
      },
    });
    assert.match(spanish.ipa, /^PRISM_42 /u);
    assert.equal(spanish.ipa.startsWith("PRISM_42 "), true);
    assert.match(spanish.ipa, /k[ɾɹ]ˈiːe[iɪ]ɾ[iɪ]v/u);
  });

  it("applies distinct approximate phrase-melody contours for Romance Speechprints", () => {
    // Four content peaks: sun, rises, creative, people.
    const phrase = "ðə sˈʌn ɹˈaɪzᵻz ˌoʊvɚ ðə kɹiːˈeɪɾɪv pˈiːpəl";
    const italian = applyLocalVoiceSpeechprintMelodyToIpa({
      ipa: phrase,
      speechprint: {
        influence: "italian-influenced-english",
        strength: "balanced",
        variationSeed: "melody-bench",
      },
    });
    const spanish = applyLocalVoiceSpeechprintMelodyToIpa({
      ipa: phrase,
      speechprint: {
        influence: "spanish-influenced-english",
        strength: "balanced",
        variationSeed: "melody-bench",
      },
    });
    const french = applyLocalVoiceSpeechprintMelodyToIpa({
      ipa: phrase,
      speechprint: {
        influence: "french-influenced-english",
        strength: "balanced",
        variationSeed: "melody-bench",
      },
    });

    assert.notEqual(italian.ipa, phrase);
    assert.notEqual(spanish.ipa, italian.ipa);
    assert.notEqual(french.ipa, spanish.ipa);
    // Italian wave softens the opening peak.
    assert.match(italian.ipa, /sˌʌn/u);
    assert.match(italian.ipa, /pˈiːpəl/u);
    assert.ok(italian.appliedRuleIds.includes("melody-contour-wave-final"));
    // Spanish keeps the first peak and softens a middle peak.
    assert.match(spanish.ipa, /sˈʌn/u);
    assert.match(spanish.ipa, /ɹˌaɪzᵻz|kɹiːˌeɪɾɪv/u);
    assert.ok(spanish.appliedRuleIds.includes("melody-contour-peak-edges"));
    // French concentrates on the final group.
    assert.match(french.ipa, /pˈiːpəl/u);
    assert.ok(french.appliedRuleIds.includes("melody-contour-final-group"));
  });

  it("leaves non-Romance melody as a no-op and never invents pause marks", () => {
    const phrase = "ðə sˈʌn ɹˈaɪzᵻz, kɹiːˈeɪɾɪv.";
    const german = applyLocalVoiceSpeechprintMelodyToIpa({
      ipa: phrase,
      speechprint: {
        influence: "german-influenced-english",
        strength: "strong",
        variationSeed: "melody-noop",
      },
    });
    assert.deepEqual(german, { ipa: phrase, appliedRuleIds: [] });
    const italian = applyLocalVoiceSpeechprintMelodyToIpa({
      ipa: phrase,
      speechprint: {
        influence: "italian-influenced-english",
        strength: "balanced",
        variationSeed: "melody-punct",
      },
    });
    assert.equal(italian.ipa.includes(","), true);
    assert.equal(italian.ipa.endsWith("."), true);
    assert.equal(/\s{2,}/u.test(italian.ipa), false);
  });
});

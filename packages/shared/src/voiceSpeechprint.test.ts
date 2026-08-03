import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  applyLocalVoiceSpeechprintToIpa,
} from "@localai/shared";

const SAMPLE_IPA = "θɪs ɹɪvɚ wɪl ðɹaɪv vɛɹi faɹ";

describe("local voice Speechprints", () => {
  it("publishes nine versioned Instant-compatible profiles for both bases", () => {
    assert.equal(LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.length, 9);
    assert.match(LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256, /^[a-f0-9]{64}$/u);
    for (const capability of LOCAL_VOICE_SPEECHPRINT_CAPABILITIES) {
      assert.deepEqual(capability.supportedBaseLocales, ["en-US", "en-GB"]);
      assert.deepEqual(capability.strengths, ["light", "balanced", "strong"]);
      assert.deepEqual(capability.supportedEngines, ["instant"]);
      assert.equal(capability.approximate, true);
    }
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
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS,
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  VOICE_ACCENT_DEFINITIONS,
  VOICE_ACCENT_MAP_ANCHORS,
  normalizeElevenLabsVoiceDirection,
  applyLocalVoiceSpeechprintMelodyToIpa,
  applyLocalVoiceSpeechprintToIpa,
  applyVoiceAccentFieldToIpa,
  enforceAmericanRhoticIpa,
  premiumVoiceNativeAccentHintFromLabels,
  resolveLocalAccentFallback,
  resolvePremiumAccentDirection,
  resolveVoiceAccentField,
  voiceAccentDefinitionForId,
} from "@localai/shared";

const SAMPLE_IPA = "θɪs ɹɪvɚ wɪl ðɹaɪv vɛɹi faɹ";

describe("local voice Speechprints", () => {
  it("publishes broad versioned Instant-compatible profiles for both bases", () => {
    assert.equal(LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.length, 63);
    assert.match(LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256, /^[a-f0-9]{64}$/u);
    for (const capability of LOCAL_VOICE_SPEECHPRINT_CAPABILITIES) {
      assert.deepEqual(capability.supportedBaseLocales, ["en-US", "en-GB"]);
      assert.deepEqual(capability.strengths, ["light", "balanced", "strong"]);
      assert.deepEqual(capability.supportedEngines, ["instant"]);
      assert.equal(capability.approximate, true);
      const definition = VOICE_ACCENT_DEFINITIONS.find(
        (candidate) => candidate.id === capability.id,
      );
      assert.ok(definition?.premiumAccentedEnglishLabel);
      assert.ok(definition.premiumNativeAccentAliases.length > 0);
      assert.equal(definition.localSpeechprintFallback, capability.id);
    }
    assert.ok(
      VOICE_ACCENT_DEFINITIONS.some(
        (definition) =>
          definition.id === "american-english" &&
          definition.localSpeechprintFallback === "none",
      ),
    );
    assert.ok(
      VOICE_ACCENT_DEFINITIONS.some(
        (definition) =>
          definition.id === "british-english" &&
          definition.localSpeechprintFallback === "none",
      ),
    );
  });

  it("normalizes a continuous field with smooth deterministic weights", () => {
    assert.equal(
      voiceAccentDefinitionForId(" Cockney-English ")?.id,
      "cockney-english",
    );
    const london = VOICE_ACCENT_MAP_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "modern-rp-english",
    );
    assert.ok(london);
    const first = resolveVoiceAccentField({
      point: london.point,
      accentDefinitionId: "modern-rp-english",
      pronunciationBase: "en-GB",
      speechprintInfluence: "modern-rp-english",
    });
    const shifted = resolveVoiceAccentField({
      point: { x: london.point.x + 0.0005, y: london.point.y },
      accentDefinitionId: "modern-rp-english",
      pronunciationBase: "en-GB",
      speechprintInfluence: "modern-rp-english",
    });
    assert.equal(first.legacy, false);
    assert.ok(Math.abs(first.layers.reduce((sum, layer) => sum + layer.weight, 0) - 1) < 1e-12);
    assert.ok(Math.abs(shifted.layers.reduce((sum, layer) => sum + layer.weight, 0) - 1) < 1e-12);
    assert.ok(
      first.layers.every(
        (layer, index) =>
          index === 0 || first.layers[index - 1]!.weight >= layer.weight,
      ),
    );
    assert.deepEqual(
      resolveVoiceAccentField({
        point: london.point,
        accentDefinitionId: "modern-rp-english",
        pronunciationBase: "en-GB",
        speechprintInfluence: "modern-rp-english",
      }),
      first,
    );
    assert.ok(Math.abs((first.layers[0]?.weight ?? 0) - (shifted.layers[0]?.weight ?? 0)) < 0.03);
    const applied = applyVoiceAccentFieldToIpa({
      ipa: "θɪs ɹɪvɚ faɹ hɑm",
      resolution: first,
      strength: "balanced",
      variationSeed: "stable-london-bot",
    });
    assert.deepEqual(
      applyVoiceAccentFieldToIpa({
        ipa: "θɪs ɹɪvɚ faɹ hɑm",
        resolution: first,
        strength: "balanced",
        variationSeed: "stable-london-bot",
      }),
      applied,
    );
  });

  it("keeps an explicit co-located London variant dominant", () => {
    const cockney = VOICE_ACCENT_MAP_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "cockney-english",
    );
    assert.ok(cockney);
    const field = resolveVoiceAccentField({
      point: cockney.point,
      accentDefinitionId: "cockney-english",
      pronunciationBase: "en-GB",
      speechprintInfluence: "cockney-english",
    });
    assert.equal(field.layers[0]?.accentDefinitionId, "cockney-english");
    assert.ok((field.layers[0]?.weight ?? 0) > (field.layers[1]?.weight ?? 0));
  });

  it("preserves the exact legacy single-Speechprint path without a point", () => {
    const resolution = resolveVoiceAccentField({
      accentDefinitionId: "new-york-english",
      pronunciationBase: "en-US",
      speechprintInfluence: "new-york-english",
    });
    const speechprint = {
      influence: "new-york-english" as const,
      strength: "balanced" as const,
      variationSeed: "legacy-new-york",
    };
    assert.equal(resolution.legacy, true);
    assert.deepEqual(
      applyVoiceAccentFieldToIpa({
        ipa: SAMPLE_IPA,
        resolution,
        strength: speechprint.strength,
        variationSeed: speechprint.variationSeed,
      }),
      applyLocalVoiceSpeechprintToIpa({ ipa: SAMPLE_IPA, speechprint }),
    );
  });

  it("keeps NORTH/FORCE rounded and CHOICE intact through the cot-caught merger", () => {
    // "the floor is yours, boy, on the lawn" — the merger owns THOUGHT/LOT
    // ("on", "lawn") but must never touch pre-R vowels or the CHOICE
    // diphthong: a Southern California pin saying "the flar is yars" is the
    // exact artifact this pins against.
    const socal = applyLocalVoiceSpeechprintToIpa({
      ipa: "ðə flˈɔːɹ ɪz jˈɔːɹz bˈɔɪ ɔn ðə lˈɔːn",
      speechprint: {
        influence: "southern-california-english",
        strength: "balanced",
        variationSeed: "socal-floor",
      },
    });
    assert.doesNotMatch(socal.ipa, /ɑː?ɹ/u);
    assert.match(socal.ipa, /flˈɔːɹ/u);
    assert.match(socal.ipa, /jˈɔːɹz/u);
    assert.match(socal.ipa, /bˈɔɪ/u);
    assert.match(socal.ipa, /ɑn/u);
    assert.match(socal.ipa, /lˈɑːn/u);
  });

  it("gives the Celtic and South Asian dialects their own phrase melodies", () => {
    const irish = applyLocalVoiceSpeechprintToIpa({
      ipa: "ðə mˈɔɹnɪŋ bˈoʊts kˈeɪm ˈɪn ɐɡˈɛn",
      speechprint: {
        influence: "irish-english",
        strength: "balanced",
        variationSeed: "melody-pin",
      },
    });
    assert.ok(irish.appliedRuleIds.includes("melody-contour-wave-final"));
    const indian = applyLocalVoiceSpeechprintToIpa({
      ipa: "ðə kˈɑmpjuːɾɚ ɹɪpˈoːɹt wɜz ɹˈɛdi tədˈeɪ",
      speechprint: {
        influence: "indian-english",
        strength: "balanced",
        variationSeed: "melody-pin",
      },
    });
    assert.ok(
      indian.appliedRuleIds.includes("melody-contour-penult-nuclear"),
    );
    // Syllable timing: early stress bias plus unreduced vowels.
    assert.ok(indian.appliedRuleIds.includes("rhythm-stress-early"));
    const scottish = applyLocalVoiceSpeechprintToIpa({
      ipa: "ðə mˈɔɹnɪŋ bˈoʊts kˈeɪm ˈɪn ɐɡˈɛn",
      speechprint: {
        influence: "scottish-english",
        strength: "balanced",
        variationSeed: "melody-pin",
      },
    });
    assert.ok(scottish.appliedRuleIds.includes("melody-contour-final-group"));
  });

  it("applies stable regional distinctions for London, the U.S., and Europe", () => {
    const cases = [
      ["cockney-english", "θɪs hɑɹ", /f/u],
      ["inland-north-english", "bæg", /eə/u],
      ["texas-english", "pɛn taɪm", /pɪn/u],
      // "curtains" => "coy-tins" from both the raw espeak NURSE (ɜː) and the
      // hard-R enforced form (ɜɹ); an onset ɹ ("furry") never coalesces.
      ["new-jersey-english", "kˈɜːtənz", /kˈɔɪtənz/u],
      ["new-jersey-english", "kˈɜɹtənz bˈɜɹd fˈɜɹi", /kˈɔɪtənz bˈɔɪd fˈɜɹi/u],
      ["parisian-french-influenced-english", "θɪs ɹɛd", /^s/u],
      ["northern-italian-influenced-english", "ɹɛd", /^ɾ/u],
    ] as const;
    for (const [influence, ipa, expected] of cases) {
      const result = applyLocalVoiceSpeechprintToIpa({
        ipa,
        speechprint: {
          influence,
          strength: "balanced",
          variationSeed: `regional-${influence}`,
        },
      });
      assert.match(result.ipa, expected, influence);
    }
  });

  it("renders the tuned Cockney sample with a bounded broad-East-London shape", () => {
    const source = "vˈɪnsənt wɛnt tə ɡɛt ɐ bˈɒtəl ɒv wˈɔːtə";
    const balanced = applyLocalVoiceSpeechprintToIpa({
      ipa: source,
      speechprint: {
        influence: "cockney-english",
        strength: "balanced",
        variationSeed: "zikkv-cockney",
      },
    });
    const strong = applyLocalVoiceSpeechprintToIpa({
      ipa: source,
      speechprint: {
        influence: "cockney-english",
        strength: "strong",
        variationSeed: "zikkv-cockney",
      },
    });
    const light = applyLocalVoiceSpeechprintToIpa({
      ipa: source,
      speechprint: {
        influence: "cockney-english",
        strength: "light",
        variationSeed: "zikkv-cockney",
      },
    });

    assert.equal(
      balanced.ipa,
      "vˈiːnsɪnʔ weɪnʔ tə ɡɛʔ ə bˈɒʔo ə wˈɔːʔə",
    );
    assert.equal(light.ipa, source);
    assert.equal(strong.ipa, balanced.ipa);
    assert.match(strong.ipa, / weɪnʔ tə ɡɛʔ /u);
    assert.doesNotMatch(strong.ipa, / weɪnʔ ʔə ɡɛʔ /u);
    for (const ruleId of [
      "article-centralize",
      "dress-after-w-before-nt",
      "of-reduction",
      "stressed-kit-lengthen-before-n",
      "syllabic-l-vocalize",
      "t-glottal-before-schwa",
      "t-glottal-final",
      "weak-schwa-before-nt",
    ]) {
      assert.ok(balanced.appliedRuleIds.includes(ruleId), ruleId);
    }

    const codeLike = applyLocalVoiceSpeechprintToIpa({
      ipa: "PRISM_42 THING_42",
      speechprint: {
        influence: "cockney-english",
        strength: "strong",
        variationSeed: "zikkv-code",
      },
    });
    assert.equal(codeLike.ipa, "PRISM_42 THING_42");
    assert.equal(codeLike.appliedRuleIds.length, 0);
  });

  it("resolves shared Premium accent cues without changing language", () => {
    assert.equal(
      resolvePremiumAccentDirection({
        pronunciationBase: "en-US",
        speechprintInfluence: "german-influenced-english",
        speechprintStrength: "balanced",
        nativeAccentHint: "German",
      }),
      null,
    );
    assert.equal(
      resolvePremiumAccentDirection({
        pronunciationBase: "en-US",
        speechprintInfluence: "german-influenced-english",
        speechprintStrength: "light",
        nativeAccentHint: "German",
      }),
      "subtle German accent",
    );
    assert.equal(
      resolvePremiumAccentDirection({
        pronunciationBase: "en-US",
        speechprintInfluence: "german-influenced-english",
        speechprintStrength: "strong",
        nativeAccentHint: "German",
      }),
      "strong German accent",
    );
    assert.equal(
      resolvePremiumAccentDirection({
        pronunciationBase: "en-US",
        speechprintInfluence: "italian-influenced-english",
        speechprintStrength: "balanced",
        nativeAccentHint: "American",
      }),
      "Italian accent",
    );
    assert.equal(
      resolvePremiumAccentDirection({
        pronunciationBase: "en-US",
        speechprintInfluence: "none",
        speechprintStrength: "balanced",
        nativeAccentHint: "American",
      }),
      null,
    );
    assert.equal(
      resolvePremiumAccentDirection({
        pronunciationBase: "en-GB",
        speechprintInfluence: "none",
        speechprintStrength: "balanced",
        nativeAccentHint: null,
      }),
      "British accent",
    );
  });

  it("keeps every Premium accent cue inside the direction character cap", () => {
    // The bracketed direction is the entire Premium accent mechanism: Premium
    // never rewrites the spoken line. A cue clipped by the shared normalizer
    // loses the trailing "accent" and stops reading as an accent direction.
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      for (const speechprintStrength of ["light", "balanced", "strong"]) {
        const cue = resolvePremiumAccentDirection({
          accentDefinitionId: definition.id,
          pronunciationBase: "en-US",
          speechprintInfluence: "none",
          speechprintStrength,
          nativeAccentHint: null,
        });
        assert.ok(cue, `${definition.id} ${speechprintStrength} has no cue`);
        assert.ok(
          cue.length <= ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS,
          `${cue} exceeds ${ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS}`,
        );
        assert.match(cue, / accent$/u);
        assert.equal(normalizeElevenLabsVoiceDirection(cue), cue);
      }
    }
  });

  it("gives dialectologist place names a cue a performer could act on", () => {
    // A tag naming a region the provider has no concept of produces no accent
    // at all. PRISM picks the nearest well-known neighbour itself rather than
    // leaving a place name to the provider's guess.
    const cue = (accentDefinitionId: string) =>
      resolvePremiumAccentDirection({
        accentDefinitionId,
        pronunciationBase: "en-US",
        speechprintInfluence: "none",
        speechprintStrength: "balanced",
        nativeAccentHint: null,
      });
    assert.equal(cue("bay-area-english"), "Northern Californian accent");
    assert.equal(cue("inland-north-english"), "Midwestern American accent");
    assert.equal(cue("north-florida-english"), "Southern American accent");
    assert.equal(cue("eastern-new-england-english"), "Boston accent");
    assert.equal(
      cue("parisian-french-influenced-english"),
      "Parisian French accent",
    );
    assert.equal(cue("modern-rp-english"), "Received Pronunciation accent");
  });

  it("keeps the Accent Map display label out of the Premium substitution", () => {
    // The atlas still shows the precise place; only the private cue changes.
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      if (!definition.premiumDirectionLabel) continue;
      assert.match(
        definition.premiumAccentedEnglishLabel,
        /-accented English$/u,
      );
      assert.notEqual(
        definition.premiumAccentedEnglishLabel,
        `${definition.premiumDirectionLabel}-accented English`,
      );
    }
  });

  it("never carries an alias slash into a Premium cue", () => {
    // A slash-joined atlas label names one accent twice. Left intact it both
    // overruns the direction cap and reads as two conflicting directions.
    for (const definition of VOICE_ACCENT_DEFINITIONS) {
      const cue = resolvePremiumAccentDirection({
        accentDefinitionId: definition.id,
        pronunciationBase: "en-GB",
        speechprintInfluence: "none",
        speechprintStrength: "strong",
        nativeAccentHint: null,
      });
      assert.doesNotMatch(cue ?? "", /\//u);
    }
    assert.equal(
      resolvePremiumAccentDirection({
        accentDefinitionId: "modern-rp-english",
        pronunciationBase: "en-GB",
        speechprintInfluence: "none",
        speechprintStrength: "strong",
        nativeAccentHint: null,
      }),
      "strong Received Pronunciation accent",
    );
  });

  it("prefers the provider-neutral definition and recognizes provider variants", () => {
    assert.equal(
      premiumVoiceNativeAccentHintFromLabels({
        language: "American English",
        accent: "German (Germany)",
      }),
      "german germany",
    );
    assert.equal(
      resolvePremiumAccentDirection({
        accentDefinitionId: "german-influenced-english",
        pronunciationBase: "en-US",
        speechprintInfluence: "italian-influenced-english",
        speechprintStrength: "balanced",
        nativeAccentHint: "German (Germany)",
      }),
      null,
    );
    assert.equal(
      resolvePremiumAccentDirection({
        accentDefinitionId: "american-english",
        pronunciationBase: "en-GB",
        speechprintInfluence: "italian-influenced-english",
        speechprintStrength: "balanced",
        nativeAccentHint: "American English",
      }),
      null,
    );
    assert.equal(
      resolvePremiumAccentDirection({
        accentDefinitionId: "german-influenced-english",
        pronunciationBase: "en-US",
        speechprintInfluence: "italian-influenced-english",
        speechprintStrength: "strong",
        nativeAccentHint: "American English",
      }),
      "strong German accent",
    );
  });

  it("derives Local fallback from the shared accent identity", () => {
    assert.deepEqual(
      resolveLocalAccentFallback({
        accentDefinitionId: "german-influenced-english",
        pronunciationBase: "en-US",
        speechprintInfluence: "italian-influenced-english",
      }),
      {
        pronunciationBase: "en-US",
        speechprintInfluence: "german-influenced-english",
      },
    );
    assert.deepEqual(
      resolveLocalAccentFallback({
        accentDefinitionId: "british-english",
        pronunciationBase: "en-US",
        speechprintInfluence: "italian-influenced-english",
      }),
      {
        pronunciationBase: "en-GB",
        speechprintInfluence: "none",
      },
    );
    // Regional American accents stay on the rhotic en-US base even when the
    // saved profile carries a British voice's follow-voice base.
    assert.deepEqual(
      resolveLocalAccentFallback({
        accentDefinitionId: "texas-english",
        pronunciationBase: "en-GB",
        speechprintInfluence: "none",
      }),
      {
        pronunciationBase: "en-US",
        speechprintInfluence: "texas-english",
      },
    );
  });

  it("enforces explicit hard Rs for the American pronunciation base", () => {
    const enforced = enforceAmericanRhoticIpa(
      "hɜː bˈɜːd hˈɑːɹd fˈoːɹ lˈɛɾɚ mˈɑːɹɾɚɹ fˈɜːɹi",
    );
    assert.equal(
      enforced.ipa,
      "hɜɹ bˈɜɹd hˈɑɹd fˈɔːɹ lˈɛɾəɹ mˈɑɹɾəɹ fˈɜɹi",
    );
    assert.deepEqual(enforced.appliedRuleIds, [
      "nurse-hard-r",
      "rhotic-schwa-hard-r",
      "rhotic-force-merge",
      "rhotic-coda-length",
    ]);
    // Idempotent: re-enforcing enforced output changes nothing, so protected
    // and unprotected parts can be normalized independently.
    assert.deepEqual(enforceAmericanRhoticIpa(enforced.ipa), {
      ipa: enforced.ipa,
      appliedRuleIds: [],
    });
    // Non-rhotic accent rules can still delete the explicit coda R.
    assert.equal(
      applyLocalVoiceSpeechprintToIpa({
        ipa: enforceAmericanRhoticIpa("bˈɜːd").ipa,
        speechprint: {
          influence: "modern-rp-english",
          strength: "light",
          variationSeed: "rp-hard-r",
        },
        includeProsody: false,
      }).ipa,
      "bˈɜd",
    );
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

  it("gives Paris-region French a graduated, distinct Strong delivery", () => {
    const source = "θɪs ðʌɹ hɪm eɪnd oʊvɚ";
    const speechprint = (strength: "light" | "balanced" | "strong") =>
      applyLocalVoiceSpeechprintToIpa({
        ipa: source,
        speechprint: {
          influence: "parisian-french-influenced-english",
          strength,
          variationSeed: "paris-region-character",
        },
      });
    const light = speechprint("light");
    const balanced = speechprint("balanced");
    const strong = speechprint("strong");
    const broaderFrenchStrong = applyLocalVoiceSpeechprintToIpa({
      ipa: source,
      speechprint: {
        influence: "french-influenced-english",
        strength: "strong",
        variationSeed: "paris-region-character",
      },
    });

    assert.ok(light.appliedRuleIds.includes("theta-s"));
    assert.equal(light.appliedRuleIds.includes("eth-z"), false);
    assert.equal(light.appliedRuleIds.includes("r-uvular"), false);
    assert.ok(balanced.appliedRuleIds.includes("eth-z"));
    assert.ok(balanced.appliedRuleIds.includes("strut-open-a"));
    assert.ok(balanced.appliedRuleIds.includes("r-uvular"));
    for (const ruleId of [
      "near-close-i",
      "h-drop",
      "face-monophthong",
      "goat-monophthong",
    ]) {
      assert.ok(strong.appliedRuleIds.includes(ruleId), ruleId);
    }
    assert.ok(
      strong.appliedRuleIds.some((ruleId) => ruleId.startsWith("melody-")),
    );
    assert.notEqual(light.ipa, balanced.ipa);
    assert.notEqual(balanced.ipa, strong.ipa);
    assert.notEqual(strong.ipa, broaderFrenchStrong.ipa);
    assert.match(strong.ipa, /end ov/u);
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

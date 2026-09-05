import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_VERNACULAR_DEFINITIONS,
  BOT_VERNACULAR_IDS,
  BOT_VERNACULAR_SHARED_RULES_V1,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
  botVernacularAuthoringCueV1,
  botVernacularDefinitionForId,
  botVernacularIdForAccentDefinition,
  botVernacularIdFromStoredVoiceProfile,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileV3,
  normalizeBotVernacularId,
  voiceAccentDefinitionForId,
} from "@localai/shared";

describe("bot vernacular catalog", () => {
  it("publishes regional varieties with complete catalog copy", () => {
    assert.equal(BOT_VERNACULAR_DEFINITIONS.length, BOT_VERNACULAR_IDS.length);
    assert.equal(
      new Set(BOT_VERNACULAR_DEFINITIONS.map((definition) => definition.id))
        .size,
      BOT_VERNACULAR_DEFINITIONS.length,
    );
    for (const definition of BOT_VERNACULAR_DEFINITIONS) {
      assert.ok(definition.label.trim().length > 0, definition.id);
      assert.ok(definition.description.trim().length > 0, definition.id);
      assert.ok(definition.example.trim().length > 0, definition.id);
      assert.ok(definition.guidance.trim().length >= 80, definition.id);
    }
  });

  it("anchors every vernacular to a real Accent Map home", () => {
    // Registers moved to the Powers system, so every remaining entry is
    // regional and must resolve to a live accent definition.
    for (const definition of BOT_VERNACULAR_DEFINITIONS) {
      assert.ok(
        definition.accentDefinitionId &&
          voiceAccentDefinitionForId(definition.accentDefinitionId),
        `${definition.id} needs a live accent home`,
      );
    }
    assert.equal(
      botVernacularDefinitionForId("scots")?.accentDefinitionId,
      "scottish-english",
    );
    assert.equal(
      botVernacularDefinitionForId("new-york")?.accentDefinitionId,
      "new-york-english",
    );
    assert.equal(
      botVernacularDefinitionForId("new-england")?.accentDefinitionId,
      "eastern-new-england-english",
    );
    assert.equal(
      botVernacularDefinitionForId("canadian")?.accentDefinitionId,
      "canadian-english",
    );
    assert.equal(
      botVernacularDefinitionForId("kiwi")?.accentDefinitionId,
      "new-zealand-english",
    );
  });

  it("keeps spelling standard and never ships eye-dialect mockery", () => {
    // The accent stack owns pronunciation; vernacular text must never respell
    // ordinary words phonetically. Established vernacular lexicon is welcome.
    const eyeDialect = /\b(?:dat|dis|dese|dose|wot)\b/iu;
    for (const definition of BOT_VERNACULAR_DEFINITIONS) {
      assert.doesNotMatch(definition.guidance, eyeDialect, definition.id);
      assert.doesNotMatch(definition.example, eyeDialect, definition.id);
    }
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /never respell words phonetically/u,
    );
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /accent carries the sound/u,
    );
    // Transcripts showed Scots and Southern pins saturating replies with
    // g-dropped ordinary words (somethin', makin', hollerin'). The abstract
    // "never respell" rule did not land, so the ban is now concrete, and no
    // authored example may model the pattern it forbids.
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /never clip the g from ordinary -ing words/u,
    );
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /never stack more than two markers in one sentence/u,
    );
    const gDroppedOrdinaryWord =
      /\b(?:somethin|makin|helpin|hollerin|sittin|standin|goin|talkin|waitin|guessin|writin)'/iu;
    for (const definition of BOT_VERNACULAR_DEFINITIONS) {
      assert.doesNotMatch(definition.example, gDroppedOrdinaryWord, definition.id);
    }
  });

  it("subordinates the dialect to character, care, and harder speech effects", () => {
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /a few times per reply rather than in every sentence/u,
    );
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /character, knowledge, and care .* come before the dialect/u,
    );
    assert.match(
      BOT_VERNACULAR_SHARED_RULES_V1,
      /speech instruction from your Powers takes precedence/u,
    );
  });

  it("builds one authoring cue per variety and stays silent without one", () => {
    const cue = botVernacularAuthoringCueV1("scots");
    assert.match(cue, /^Vernacular — Scots: /u);
    assert.ok(cue.includes(BOT_VERNACULAR_SHARED_RULES_V1));
    assert.equal(botVernacularAuthoringCueV1(null), "");
    assert.equal(botVernacularAuthoringCueV1("klingon"), "");
    assert.equal(normalizeBotVernacularId(" SCOTS "), "scots");
    assert.equal(normalizeBotVernacularId("klingon"), null);
  });

  it("derives the vernacular from the accent pin unless one is authored", () => {
    assert.equal(
      botVernacularIdFromStoredVoiceProfile(
        JSON.stringify({ v: 2, accentDefinitionId: "cockney-english" }),
      ),
      "cockney",
    );
    assert.equal(
      botVernacularIdFromStoredVoiceProfile({
        v: 3,
        local: { pronunciation: { accentDefinitionId: "irish-english" } },
      }),
      "hiberno-english",
    );
    // An authored regional id still outranks the pin.
    assert.equal(
      botVernacularIdFromStoredVoiceProfile({
        accentDefinitionId: "scottish-english",
        vernacularId: "aussie",
      }),
      "aussie",
    );
    assert.equal(botVernacularIdForAccentDefinition(" Texas-English "), "southern-us");
    assert.equal(botVernacularIdForAccentDefinition("miami-english"), null);
    assert.equal(botVernacularIdForAccentDefinition(42), null);
  });

  it("rides the audio voice profile through V2, V3, and stored JSON", () => {
    const v2 = normalizeBotAudioVoiceProfileV1({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      vernacularId: "aussie",
    });
    assert.equal(v2.vernacularId, "aussie");
    const v3 = normalizeBotAudioVoiceProfileV3(v2);
    assert.equal(v3.local.pronunciation?.vernacularId, "aussie");
    assert.equal(normalizeBotAudioVoiceProfileV1(v3).vernacularId, "aussie");
    assert.equal(
      botVernacularIdFromStoredVoiceProfile(JSON.stringify(v3)),
      "aussie",
    );
    assert.equal(
      botVernacularIdFromStoredVoiceProfile(JSON.stringify(v2)),
      "aussie",
    );
    // Invalid ids drop instead of persisting, and clearing round-trips.
    assert.equal(
      normalizeBotAudioVoiceProfileV1({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
        vernacularId: "klingon",
      }).vernacularId,
      undefined,
    );
    assert.equal(
      normalizeBotAudioVoiceProfileV1({ ...v2, vernacularId: null })
        .vernacularId,
      undefined,
    );
    assert.equal(botVernacularIdFromStoredVoiceProfile("not json"), null);
    assert.equal(botVernacularIdFromStoredVoiceProfile(null), null);
  });
});

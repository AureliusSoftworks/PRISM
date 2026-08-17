import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_VERNACULAR_DEFINITIONS,
  BOT_VERNACULAR_IDS,
  BOT_VERNACULAR_SHARED_RULES_V1,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
  botVernacularAuthoringCueV1,
  botVernacularDefinitionForId,
  botVernacularIdFromStoredVoiceProfile,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileV3,
  normalizeBotVernacularId,
  voiceAccentDefinitionForId,
} from "@localai/shared";

describe("bot vernacular catalog", () => {
  it("publishes cultural varieties and registers with complete picker copy", () => {
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

  it("pairs geographic varieties with real Accent Map homes and leaves registers unpinned", () => {
    for (const definition of BOT_VERNACULAR_DEFINITIONS) {
      if (definition.accentDefinitionId) {
        assert.ok(
          voiceAccentDefinitionForId(definition.accentDefinitionId),
          `${definition.id} points at a missing accent definition`,
        );
      }
    }
    assert.equal(
      botVernacularDefinitionForId("scots")?.accentDefinitionId,
      "scottish-english",
    );
    assert.equal(
      botVernacularDefinitionForId("southern-us")?.accentDefinitionId,
      "southern-us-english",
    );
    // Registers have no geography; the handshake never suggests a pin for them.
    assert.equal(
      botVernacularDefinitionForId("noir")?.accentDefinitionId,
      undefined,
    );
    assert.equal(
      botVernacularDefinitionForId("archaic")?.accentDefinitionId,
      undefined,
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

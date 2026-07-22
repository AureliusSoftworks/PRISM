import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_GENERATION_FIELD_REGISTRY_V1,
  botGenerationFieldDefinitionV1,
  normalizeBotGenerationFieldKeyV1,
} from "./botGenerationFields.ts";

test("Avatar Studio field registry covers every creative surface and explicit safety exclusion", () => {
  const keys = Object.keys(BOT_GENERATION_FIELD_REGISTRY_V1);
  for (const prefix of ["identity.", "profile.", "face.", "details.", "voice.", "sfx.", "settings.", "power."]) {
    assert.ok(keys.some((key) => key.startsWith(prefix)), `missing ${prefix}`);
  }
  assert.equal(botGenerationFieldDefinitionV1("power.prompt").policy, "semantic");
  assert.equal(botGenerationFieldDefinitionV1("power.sigil").policy, "bounded");
  assert.equal(botGenerationFieldDefinitionV1("voice.externalVoiceId").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("routing.provider").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("privacy.onlineEnabled").policy, "excluded");
  assert.equal(normalizeBotGenerationFieldKeyV1("profile.core.traits"), "profile.core.traits");
  assert.equal(normalizeBotGenerationFieldKeyV1("profile.upload.secret"), null);
});

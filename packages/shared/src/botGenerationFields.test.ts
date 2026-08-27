import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_GENERATION_FIELD_REGISTRY_V1,
  botGenerationFieldDefinitionV1,
  normalizeBotGenerationFieldKeyV1,
} from "./botGenerationFields.ts";
import { BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH } from "./botProfile.ts";
import { BOT_POWER_NAME_MAX_LENGTH } from "./botPower.ts";

test("Avatar Studio field registry covers every creative surface and explicit safety exclusion", () => {
  const keys = Object.keys(BOT_GENERATION_FIELD_REGISTRY_V1);
  for (const prefix of ["identity.", "profile.", "face.", "details.", "voice.", "sfx.", "settings.", "power."]) {
    assert.ok(keys.some((key) => key.startsWith(prefix)), `missing ${prefix}`);
  }
  assert.equal(botGenerationFieldDefinitionV1("power.name").policy, "semantic");
  assert.equal(
    botGenerationFieldDefinitionV1("power.name").maxLength,
    BOT_POWER_NAME_MAX_LENGTH,
  );
  assert.equal(botGenerationFieldDefinitionV1("power.prompt").policy, "semantic");
  assert.equal(
    botGenerationFieldDefinitionV1("profile.purpose.statement").maxLength,
    BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH,
  );
  assert.equal(
    botGenerationFieldDefinitionV1("profile.core.responseCues.waiting").kind,
    "string-array",
  );
  for (const key of [
    "face.eyes.spacing",
    "face.blink.rotation",
    "face.thinking.scale",
    "face.thinking.offsetX",
    "face.thinking.offsetY",
    "voice.openness",
    "voice.weight",
    "voice.brightness",
    "voice.resonance",
  ] as const) {
    assert.equal(botGenerationFieldDefinitionV1(key).policy, "bounded", key);
  }
  assert.equal(
    botGenerationFieldDefinitionV1("identity.namePronunciation").policy,
    "excluded",
  );
  assert.match(
    botGenerationFieldDefinitionV1("identity.namePronunciation").reason ?? "",
    /player-authored only/u,
  );
  assert.equal(
    botGenerationFieldDefinitionV1("identity.selfReferral").policy,
    "excluded",
  );
  assert.equal(botGenerationFieldDefinitionV1("power.sigil").policy, "bounded");
  assert.equal(botGenerationFieldDefinitionV1("details.stamp.id").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("details.stamp.offsetX").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("details.stamp.offsetY").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("details.stamp.scalePct").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("voice.externalVoiceId").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("routing.provider").policy, "excluded");
  assert.equal(botGenerationFieldDefinitionV1("privacy.onlineEnabled").policy, "excluded");
  assert.equal(normalizeBotGenerationFieldKeyV1("profile.core.traits"), "profile.core.traits");
  assert.equal(normalizeBotGenerationFieldKeyV1("profile.upload.secret"), null);
});

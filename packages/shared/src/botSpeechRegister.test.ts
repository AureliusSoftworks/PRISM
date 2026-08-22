import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_SPEECH_REGISTER_DEFINITIONS,
  BOT_SPEECH_REGISTER_IDS,
  BOT_SPEECH_REGISTER_SHARED_RULES_V1,
  botPowerSpeechRegistersV1,
  botPowerSourceHashForPowerV1,
  botSpeechRegisterAuthoringCueV1,
  normalizeBotSpeechRegisterId,
  normalizeBotVernacularId,
} from "@localai/shared";

describe("bot speech registers", () => {
  it("publishes the placeless registers with canonical copy", () => {
    assert.deepEqual(BOT_SPEECH_REGISTER_IDS, ["noir", "archaic"]);
    for (const definition of BOT_SPEECH_REGISTER_DEFINITIONS) {
      assert.ok(definition.guidance.trim().length >= 80, definition.id);
      assert.ok(definition.example.trim().length > 0, definition.id);
    }
    // Registers left the vernacular catalog when they became Powers.
    assert.equal(normalizeBotVernacularId("noir"), null);
    assert.equal(normalizeBotVernacularId("archaic"), null);
  });

  it("keeps spelling standard and lets harder Powers win", () => {
    assert.match(
      BOT_SPEECH_REGISTER_SHARED_RULES_V1,
      /never respell words phonetically/u,
    );
    assert.match(
      BOT_SPEECH_REGISTER_SHARED_RULES_V1,
      /harder speech effect from your Powers wins/u,
    );
    const cue = botSpeechRegisterAuthoringCueV1("noir");
    assert.match(cue, /^Speech register — Noir narrator: /u);
    assert.ok(cue.includes(BOT_SPEECH_REGISTER_SHARED_RULES_V1));
    assert.equal(botSpeechRegisterAuthoringCueV1("klingon"), "");
    assert.equal(normalizeBotSpeechRegisterId(" ARCHAIC "), "archaic");
  });

  it("detects granted registers on active compiled powers", () => {
    const name = "Noir Narrator";
    const intent = "Narrates like a detective.";
    const powers = [
      {
        version: 1,
        id: "noir-cloak",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashForPowerV1({ name, intent }),
          selfCue: botSpeechRegisterAuthoringCueV1("noir"),
          observerCue: "Speaks in noir narration.",
          effects: [{ type: "speech_register", register: "noir" }],
          ruleLabels: ["Noir narrator"],
        },
      },
    ];
    assert.deepEqual(botPowerSpeechRegistersV1(powers), ["noir"]);
    assert.deepEqual(botPowerSpeechRegistersV1([]), []);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import type { BotPowerEffectV1 } from "@localai/shared";
import {
  applyCoffeeHearingRepeatMoodPenalty,
  botPowerTextRequestsRepeat,
  lowerVoiceMoodForHearingRepeat,
  strongestHearingRepeatEffect,
} from "../bot-power-hearing-repeat.ts";

test("repeat-request recognition covers natural short variants without matching ordinary recall", () => {
  for (const phrase of [
    "What did you say?",
    "Sorry, what was that?",
    "Could you repeat that?",
    "[Mira](prism-bot://mira), say that again.",
    "I didn't catch what you said.",
    "Pardon?",
    "Come again?",
  ]) {
    assert.equal(botPowerTextRequestsRepeat(phrase), true, phrase);
  }
  assert.equal(botPowerTextRequestsRepeat("I heard what you said, and I disagree."), false);
  assert.equal(botPowerTextRequestsRepeat("Repeat the plan tomorrow."), false);
});

test("the strongest duplicate hearing-repeat effect wins once per request", () => {
  const effects: BotPowerEffectV1[] = [
    { type: "hearing_repeat", frequency: "frequent", moodPenalty: "small" },
    { type: "hearing_repeat", frequency: "occasional", moodPenalty: "large" },
  ];
  assert.deepEqual(strongestHearingRepeatEffect(effects), effects[1]);
});

test("Coffee repeat costs stack against the repeating bot only", () => {
  const initial = {
    speaker: {
      disposition: 0.6,
      valuesFriction: 0.2,
      restraint: 0.5,
      engagement: 0.7,
      leavePressure: 0.1,
    },
    holder: {
      disposition: 0.5,
      valuesFriction: 0.3,
      restraint: 0.5,
      engagement: 0.6,
      leavePressure: 0.1,
    },
  };
  const once = applyCoffeeHearingRepeatMoodPenalty({
    socialByBotId: initial,
    repeatingBotId: "speaker",
    strength: "small",
  });
  const twice = applyCoffeeHearingRepeatMoodPenalty({
    socialByBotId: once,
    repeatingBotId: "speaker",
    strength: "small",
  });

  assert.equal(once.holder, initial.holder);
  assert.ok(once.speaker.disposition < initial.speaker.disposition);
  assert.ok(once.speaker.valuesFriction > initial.speaker.valuesFriction);
  assert.ok(once.speaker.engagement < initial.speaker.engagement);
  assert.ok(twice.speaker.disposition < once.speaker.disposition);
});

test("Signal repeat delivery steps downward and saturates at strained", () => {
  assert.equal(lowerVoiceMoodForHearingRepeat("joyful"), "warm");
  assert.equal(lowerVoiceMoodForHearingRepeat("warm"), "neutral");
  assert.equal(lowerVoiceMoodForHearingRepeat("neutral"), "guarded");
  assert.equal(lowerVoiceMoodForHearingRepeat("guarded"), "strained");
  assert.equal(lowerVoiceMoodForHearingRepeat("strained"), "strained");
});

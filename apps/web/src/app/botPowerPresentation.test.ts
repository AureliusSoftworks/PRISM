import assert from "node:assert/strict";
import test from "node:test";
import {
  botPowerBehaviorDetailsForDisplay,
  botPowerRuleLabelForDisplay,
} from "./botPowerPresentation.ts";

test("Power rule labels read like player-facing effects", () => {
  assert.equal(
    botPowerRuleLabelForDisplay("annoyingLaugh"),
    "Annoying Laugh",
  );
  assert.equal(
    botPowerRuleLabelForDisplay("hearing_repeat"),
    "Hearing repeat",
  );
  assert.equal(
    botPowerRuleLabelForDisplay("annoyance, auditory disruption"),
    "Annoyance, auditory disruption",
  );
  assert.equal(botPowerRuleLabelForDisplay("  "), "Power effect");
});

test("Cursed Tongue details keep internal compiler cues out of the player-facing UI", () => {
  const details = botPowerBehaviorDetailsForDisplay({
    version: 1,
    id: "cursed-tongue",
    name: "Cursed Tongue",
    intent: "Everything they say is vulgar.",
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: "test",
      selfCue: "HARD self-perception rule: Draft fully natural clean speech only.",
      observerCue: "PRISM applies an internal public mutation.",
      effects: [{
        type: "cursed_tongue",
        version: 1,
        frequency: "frequent",
        strength: "strong",
        vocabulary: "uncensored_non_slur",
        phraseMode: "occasional_2_3_words",
      }],
      ruleLabels: [],
    },
  }, "Iris");
  assert.equal(details.selfCue, "Iris means to speak normally; the curse changes what others hear.");
  assert.equal(
    details.observerCue,
    "Every spoken sentence lands with one to four strong, non-slur curse words.",
  );
  assert.doesNotMatch(`${details.selfCue}\n${details.observerCue}`, /HARD|PRISM|internal|mutation/iu);
});

test("Surname Drift details keep the given name and a session last name", () => {
  const details = botPowerBehaviorDetailsForDisplay({
    version: 1,
    id: "surname-drift",
    name: "Surname Drift",
    intent: "Give this bot a new last name each session.",
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: "test",
      selfCue: "Keep your given name. Each session, add a new last name.",
      observerCue: "Vex is using a new last name this session.",
      effects: [{
        type: "false_name",
        continuity: "session_sticky_until_amnesia",
        pool: "given_plus_random_surname",
      }],
      ruleLabels: [],
    },
  }, "Vex");
  assert.equal(
    details.selfCue,
    "Vex keeps their given name and receives a new last name each session.",
  );
  assert.match(details.observerCue, /session full name/iu);
});

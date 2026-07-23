import assert from "node:assert/strict";
import test from "node:test";
import { botPowerRuleLabelForDisplay } from "./botPowerPresentation.ts";

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

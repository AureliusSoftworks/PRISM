import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rankSignalPersonaTemperaments,
  signalPersonaTemperamentFor,
} from "./signalPersonaTemperament.ts";

describe("Signal persona temperament", () => {
  it("finds commanding gravity without metadata substring collisions", () => {
    const persona = [
      "Purpose: An authoritarian, disciplined, intimidating enforcer who maintains order through fear.",
      "Core personality: ruthlessly goal-driven and tightly controlled.",
      "Extraversion: quietly expressive.",
      "Curiosity: balanced.",
      "Openness: grounded and concrete.",
      "Species or form: Human.",
    ].join(" ");
    assert.equal(signalPersonaTemperamentFor(persona), "commanding");
    assert.deepEqual(
      rankSignalPersonaTemperaments(persona).slice(0, 2).map((match) => match.temperament),
      ["commanding"],
    );
  });

  it("does not treat structured labels as calm, warm, playful, or bright traits", () => {
    const metadataOnly = [
      "Extraversion: quietly expressive.",
      "Curiosity: balanced.",
      "Openness: grounded and concrete.",
      "Species or form: Human.",
    ].join(" ");
    assert.equal(signalPersonaTemperamentFor(metadataOnly), "neutral");
    assert.equal(
      signalPersonaTemperamentFor([
        "An intimidating military commander.",
        "<<<PRISM_BOT_META>>>",
        '{"purpose":{"notes":"cheerful warm artist"}}',
        "<<<END_PRISM_BOT_META>>>",
      ].join("\n")),
      "commanding",
    );
  });

  it("keeps broad contrasting personas distinct and deterministic", () => {
    assert.equal(
      signalPersonaTemperamentFor("A cheerful, whimsical optimist who loves absurd surprises."),
      "playful",
    );
    assert.equal(
      signalPersonaTemperamentFor("A forensic detective devoted to evidence and precise investigation."),
      "analytical",
    );
    assert.equal(
      signalPersonaTemperamentFor("A gentle, empathetic mentor grounded in compassion."),
      "warm",
    );
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CoffeePowerPlanV1 } from "@localai/shared";
import { coffeeAutomaticCutInCandidateV1 } from "./coffee-power-interruption.ts";

const plan: CoffeePowerPlanV1 = {
  version: 1,
  resolvedAt: "2026-07-20T00:00:00.000Z",
  warnings: [],
  bots: {
    tom: {
      botId: "tom",
      powerIds: ["interrupting-tom"],
      selfCue: "Cut in.",
      observerCue: "Tom interrupts.",
      visibleToBotIds: null,
      speechAudienceBotIds: null,
      effects: [{
        type: "interruption",
        frequency: "frequent",
        strength: "large",
        targets: [{ kind: "bot", botId: "alice", name: "Alice" }],
      }],
      ruleLabels: ["Interrupts"],
      warnings: [],
    },
  },
};

test("an eligible interruption Power outranks a more eager ordinary cut-in", () => {
  const result = coffeeAutomaticCutInCandidateV1({
    candidateBotIds: ["boris", "tom"],
    interruptedBotId: "alice",
    socialByBotId: {
      boris: { engagement: 1, valuesFriction: 1, restraint: 0, disposition: 0.5, leavePressure: 0 },
      tom: { engagement: 0.2, valuesFriction: 0.1, restraint: 0.9, disposition: 0.5, leavePressure: 0 },
    },
    powerPlan: plan,
    crossTalk: "rare",
  });

  assert.equal(result?.botId, "tom");
  assert.equal(result?.powerEffect?.frequency, "frequent");
  assert.ok((result?.chance ?? 0) >= 0.76);
});

test("a targeted interruption Power does not cut off a different bot", () => {
  const result = coffeeAutomaticCutInCandidateV1({
    candidateBotIds: ["tom", "boris"],
    interruptedBotId: "charlie",
    socialByBotId: undefined,
    powerPlan: plan,
    crossTalk: "normal",
  });

  assert.equal(result?.powerEffect, null);
  assert.equal(result?.chance, 0.05);
});

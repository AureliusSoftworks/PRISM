import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CoffeePowerPlanV1 } from "@localai/shared";
import {
  coffeeAutomaticCutInCandidateV1,
  coffeeInterruptionTriggerProgressV1,
} from "./coffee-power-interruption.ts";

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
        certainty: "always",
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
  assert.equal(result?.powerEffect?.certainty, "always");
  assert.equal(result?.directlyAddressed, false);
  assert.ok((result?.chance ?? 0) > 0);
  assert.ok((result?.chance ?? 1) < 1);
});

test("an unconditional interruption always cuts a turn addressed to its holder", () => {
  const result = coffeeAutomaticCutInCandidateV1({
    candidateBotIds: ["boris", "tom"],
    interruptedBotId: "alice",
    directlyAddressedBotId: "tom",
    socialByBotId: undefined,
    powerPlan: plan,
    crossTalk: "rare",
  });

  assert.equal(result?.botId, "tom");
  assert.equal(result?.directlyAddressed, true);
  assert.equal(result?.chance, 1);
});

test("an unconditional interruption can land from early through late in a turn", () => {
  assert.equal(coffeeInterruptionTriggerProgressV1("always", 0), 0.08);
  assert.equal(coffeeInterruptionTriggerProgressV1("always", 1), 0.88);
  assert.equal(coffeeInterruptionTriggerProgressV1(undefined, 1), 0.35);
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

test("Coffee turns a live bot cutoff into prepared two-voice crosstalk", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const crosstalkPlan =");
  const end = source.indexOf("// Whenever we leave Coffee view", start);
  const interruption = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(interruption, /buildBotCrosstalkListenerReactionPlanV1/u);
  assert.match(interruption, /prepareCoffeeCrosstalkRef\.current\(crosstalkPlan\)/u);
  assert.match(interruption, /playCoffeeListenerReactionRef\.current\(crosstalkPlan\)/u);
  assert.match(interruption, /COFFEE_BOT_INTERRUPTION_OVERLAP_MS/u);
  assert.match(
    interruption,
    /releaseVoicePlaybackPreservingPreparedMode\([\s\S]{0,120}COFFEE_BOT_INTERRUPTION_RELEASE_MS/u,
  );
  assert.ok(
    interruption.indexOf(
      "playCoffeeListenerReactionRef.current(crosstalkPlan)",
    ) <
      interruption.indexOf(
        "releaseVoicePlaybackPreservingPreparedMode(",
      ),
  );
  assert.match(interruption, /interrupterCue: crosstalkPlan\.spokenCue/u);
  assert.match(
    interruption,
    /interruptedSpeakerCue: crosstalkPlan\.interruptedSpeakerCue/u,
  );
});

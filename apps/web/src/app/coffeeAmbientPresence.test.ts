import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE,
  COFFEE_AMBIENT_FOLEY_PROFILE,
  COFFEE_AMBIENT_FOLEY_URLS,
  COFFEE_AMBIENT_LISTENER_MIN_GAP_MS,
  coffeeAmbientListenerAcknowledgementPlan,
  coffeeAmbientListenerCandidateIsEligible,
  coffeeAmbientListenerPlanIsLocal,
  coffeeAmbientSeatStereoPan,
  type CoffeeAmbientListenerCandidate,
} from "./coffeeAmbientPresence.ts";

const eligible = (botId: string): CoffeeAmbientListenerCandidate => ({
  botId,
  present: true,
  voiceEnabled: true,
});

test("Coffee uses a dense but bounded local physical Foley cadence", () => {
  assert.deepEqual(COFFEE_AMBIENT_FOLEY_PROFILE, {
    minDelayMs: 5_500,
    maxDelayMs: 12_500,
    trim: 0.38,
  });
  assert.deepEqual(COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE, {
    minDelayMs: 18_000,
    maxDelayMs: 34_000,
    trim: 0.5,
  });
  assert.ok(COFFEE_AMBIENT_FOLEY_URLS.length >= 10);
  assert.ok(
    COFFEE_AMBIENT_FOLEY_URLS.some((url) => /coffee-cup-place/u.test(url)),
  );
  assert.ok(
    COFFEE_AMBIENT_FOLEY_URLS.some((url) => /chair-shift/u.test(url)),
  );
  assert.ok(
    COFFEE_AMBIENT_FOLEY_URLS.some((url) => /clothing-shuffle/u.test(url)),
  );
  assert.ok(
    COFFEE_AMBIENT_FOLEY_URLS.some((url) => /soft-foot-tap/u.test(url)),
  );
  for (const url of COFFEE_AMBIENT_FOLEY_URLS) {
    assert.match(url, /^\/audio\//u);
    assert.ok(
      statSync(new URL(`../../public${url}`, import.meta.url)).size > 1_000,
      `${url} should be bundled locally`,
    );
  }
});

test("ambient listener eligibility rejects every unavailable seat state", () => {
  assert.equal(
    coffeeAmbientListenerCandidateIsEligible(eligible("listener"), "speaker"),
    true,
  );
  assert.equal(
    coffeeAmbientListenerCandidateIsEligible(eligible("speaker"), "speaker"),
    false,
  );
  for (const ineligible of [
    { present: false },
    { absent: true },
    { departed: true },
    { departing: true },
    { arriving: true },
    { speaking: true },
    { thinking: true },
    { hardMuted: true },
    { voiceEnabled: false },
    { sipping: true },
    { reacting: true },
    { authoredActionActive: true },
  ] satisfies Array<Partial<CoffeeAmbientListenerCandidate>>) {
    assert.equal(
      coffeeAmbientListenerCandidateIsEligible(
        { ...eligible("listener"), ...ineligible },
        "speaker",
      ),
      false,
      JSON.stringify(ineligible),
    );
  }
});

test("listener chatter is deterministic, sparse, cooldown-bound, and keeps floor ownership", () => {
  const args = {
    conversationId: "coffee-session",
    speakerBotId: "speaker",
    durationMs: 8_000,
    elapsedSincePreviousMs: COFFEE_AMBIENT_LISTENER_MIN_GAP_MS,
    candidates: [eligible("speaker"), eligible("left"), eligible("right")],
  };
  const planned = Array.from({ length: 100 }, (_, index) =>
    coffeeAmbientListenerAcknowledgementPlan({
      ...args,
      messageId: `message-${index}`,
    }),
  );
  assert.ok(planned.filter(Boolean).length >= 20);
  assert.ok(planned.filter(Boolean).length <= 50);
  const plan = planned.find(Boolean)!;
  assert.deepEqual(
    plan,
    coffeeAmbientListenerAcknowledgementPlan({
      ...args,
      messageId: plan.messageId,
    }),
  );
  assert.equal(plan.speakerBotId, "speaker");
  assert.notEqual(plan.listenerBotId, plan.speakerBotId);
  assert.equal(plan.messageId.startsWith("message-"), true);
  assert.match(plan.spokenCue ?? "", /^(?:Hmm\.|mm-hm|I see\.|Right\.)$/u);
  assert.equal(plan.cameraCutEligible, false);
  assert.equal(coffeeAmbientListenerPlanIsLocal(plan), true);
  assert.equal(
    coffeeAmbientListenerAcknowledgementPlan({
      ...args,
      messageId: "cooldown",
      elapsedSincePreviousMs: COFFEE_AMBIENT_LISTENER_MIN_GAP_MS - 1,
    }),
    null,
  );
  assert.equal(
    coffeeAmbientListenerAcknowledgementPlan({
      ...args,
      messageId: "short",
      durationMs: 2_799,
    }),
    null,
  );
});

test("all eligible seats can own chatter and rendered seat position supplies pan", () => {
  const heard = new Set<string>();
  for (let index = 0; index < 1_000; index += 1) {
    const plan = coffeeAmbientListenerAcknowledgementPlan({
      conversationId: "coffee-session",
      messageId: `coverage-${index}`,
      speakerBotId: "speaker",
      durationMs: 8_000,
      elapsedSincePreviousMs: COFFEE_AMBIENT_LISTENER_MIN_GAP_MS,
      candidates: [eligible("left"), eligible("center"), eligible("right")],
    });
    if (plan) heard.add(plan.listenerBotId);
  }
  assert.deepEqual([...heard].sort(), ["center", "left", "right"]);
  assert.equal(
    coffeeAmbientSeatStereoPan({
      seatCenterX: 100,
      tableLeft: 0,
      tableWidth: 1_000,
    }),
    -0.464,
  );
  assert.equal(
    coffeeAmbientSeatStereoPan({
      seatCenterX: 500,
      tableLeft: 0,
      tableWidth: 1_000,
    }),
    0,
  );
  assert.equal(
    coffeeAmbientSeatStereoPan({
      seatCenterX: 900,
      tableLeft: 0,
      tableWidth: 1_000,
    }),
    0.464,
  );
});

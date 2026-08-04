import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE,
  COFFEE_AMBIENT_FOLEY_PROFILE,
  COFFEE_AMBIENT_FOLEY_URLS,
  coffeeAmbientPresenceWord,
} from "./coffeeAmbientPresence.ts";

test("Coffee uses a richer but bounded local physical Foley cadence", () => {
  assert.deepEqual(COFFEE_AMBIENT_FOLEY_PROFILE, {
    minDelayMs: 8_000,
    maxDelayMs: 19_000,
    trim: 0.52,
  });
  assert.ok(COFFEE_AMBIENT_FOLEY_URLS.length >= 7);
  for (const url of COFFEE_AMBIENT_FOLEY_URLS) {
    assert.match(url, /^\/audio\//u);
    assert.ok(
      statSync(new URL(`../../public${url}`, import.meta.url)).size > 1_000,
      `${url} should be bundled locally`,
    );
  }
});

test("Coffee ambient words are deterministic, sparse, and non-conversational", () => {
  assert.deepEqual(COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE, {
    minDelayMs: 18_000,
    maxDelayMs: 34_000,
    trim: 0.58,
  });
  const plans = Array.from({ length: 60 }, (_, index) =>
    coffeeAmbientPresenceWord("coffee-a", index, "bot-a"),
  );
  assert.equal(plans.filter(Boolean).length, 40);
  for (const [index, plan] of plans.entries()) {
    assert.deepEqual(
      plan,
      coffeeAmbientPresenceWord("coffee-a", index, "bot-a"),
    );
    if (!plan) continue;
    assert.match(plan.text, /^(?:Mm|Hm|Mhm|Ah|Oh|Hmm)\.$/u);
    assert.ok(plan.text.split(/\s+/u).length <= 1);
    assert.ok(plan.durationMs >= 800 && plan.durationMs <= 1_100);
    assert.match(plan.sequenceKey, /coffee-ambient-word/u);
  }
});

test("Coffee ambient words vary by bot without becoming dialogue", () => {
  const firstBot = Array.from(
    { length: 12 },
    (_, index) => coffeeAmbientPresenceWord("coffee-a", index, "bot-a")?.text,
  );
  const secondBot = Array.from(
    { length: 12 },
    (_, index) => coffeeAmbientPresenceWord("coffee-a", index, "bot-b")?.text,
  );
  assert.notDeepEqual(firstBot, secondBot);
});

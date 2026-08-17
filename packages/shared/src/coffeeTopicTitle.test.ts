import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanGeneratedCoffeeTopicTitle,
  heuristicCoffeeTopicTitle,
  isCleanCoffeeTopicTitle,
  resolveCoffeeTopicDisplayTitle,
} from "./coffeeTopicTitle.ts";

const HARRY_POTTER_PROMPT =
  "Ask Harry Potter, what is the most memorable part of your story so far?";

test("heuristic Coffee titles keep short seeds and clean instruction prompts", () => {
  assert.equal(heuristicCoffeeTopicTitle("Silent reactions"), "Silent reactions");
  assert.equal(
    heuristicCoffeeTopicTitle("Mercy and power in one room"),
    "Mercy and power in one room",
  );
  assert.equal(
    heuristicCoffeeTopicTitle(HARRY_POTTER_PROMPT),
    "Harry Potter's Most Memorable Moment",
  );
  assert.equal(
    heuristicCoffeeTopicTitle("Listen up: keep the kettle honest"),
    "Keep the Kettle Honest",
  );
});

test("clean Coffee titles reject raw prompts and accept short headlines", () => {
  assert.equal(isCleanCoffeeTopicTitle("Silent reactions"), true);
  assert.equal(isCleanCoffeeTopicTitle(HARRY_POTTER_PROMPT), false);
  assert.equal(
    isCleanCoffeeTopicTitle("Ask Harry Potter, what is the most..."),
    false,
  );
  assert.equal(
    isCleanCoffeeTopicTitle("Harry Potter's Memorable Chapter", HARRY_POTTER_PROMPT),
    true,
  );
});

test("generated Coffee titles accept JSON and reject leftover prompts", () => {
  assert.equal(
    cleanGeneratedCoffeeTopicTitle(
      '{"title":"Harry Potter\'s Memorable Chapter"}',
      HARRY_POTTER_PROMPT,
    ),
    "Harry Potter's Memorable Chapter",
  );
  assert.equal(
    cleanGeneratedCoffeeTopicTitle(HARRY_POTTER_PROMPT, HARRY_POTTER_PROMPT),
    null,
  );
});

test("Coffee display titles prefer a clean stored title over the raw prompt", () => {
  assert.equal(
    resolveCoffeeTopicDisplayTitle({
      title: "Harry Potter's Memorable Chapter",
      coffeeTopic: HARRY_POTTER_PROMPT,
    }),
    "Harry Potter's Memorable Chapter",
  );
  assert.equal(
    resolveCoffeeTopicDisplayTitle({
      title: "Ask Harry Potter, what is the most...",
      coffeeTopic: HARRY_POTTER_PROMPT,
    }),
    "Harry Potter's Most Memorable Moment",
  );
  assert.equal(
    resolveCoffeeTopicDisplayTitle({
      title: "",
      coffeeTopic: HARRY_POTTER_PROMPT,
    }),
    "Harry Potter's Most Memorable Moment",
  );
});

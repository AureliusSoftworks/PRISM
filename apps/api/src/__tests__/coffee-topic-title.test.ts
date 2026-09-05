import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heuristicCoffeeTopicTitle } from "@localai/shared";
import {
  persistableCoffeeTopicTitle,
  summarizeCoffeeTopicTitle,
} from "../coffee-topic-title.ts";
import type { LlmProvider } from "../providers.ts";

const HARRY_POTTER_PROMPT =
  "Ask Harry Potter, what is the most memorable part of your story so far?";

function mockProvider(raw: string): LlmProvider {
  return {
    name: "local",
    generateResponse: async () => raw,
    embedText: async () => [],
  };
}

describe("summarizeCoffeeTopicTitle", () => {
  it("skips the model for an already-clean seed", async () => {
    let called = false;
    const title = await summarizeCoffeeTopicTitle({
      topic: "Silent reactions",
      provider: {
        name: "local",
        generateResponse: async () => {
          called = true;
          return '{"title":"Should Not Win"}';
        },
        embedText: async () => [],
      },
    });
    assert.equal(called, false);
    assert.equal(title, "Silent reactions");
  });

  it("accepts a structured model title for an instruction prompt", async () => {
    const title = await summarizeCoffeeTopicTitle({
      topic: HARRY_POTTER_PROMPT,
      provider: mockProvider('{"title":"Harry Potter\'s Memorable Chapter"}'),
    });
    assert.equal(title, "Harry Potter's Memorable Chapter");
  });

  it("returns null when the model repeats the raw prompt", async () => {
    const title = await summarizeCoffeeTopicTitle({
      topic: HARRY_POTTER_PROMPT,
      provider: mockProvider(HARRY_POTTER_PROMPT),
    });
    assert.equal(title, null);
  });
});

describe("persistableCoffeeTopicTitle", () => {
  it("keeps the fallback when no provider is available", async () => {
    const fallback = heuristicCoffeeTopicTitle(HARRY_POTTER_PROMPT);
    const title = await persistableCoffeeTopicTitle({
      topic: HARRY_POTTER_PROMPT,
      fallbackTitle: fallback,
    });
    assert.equal(title, fallback);
  });

  it("uses the model title when cleanup accepts it", async () => {
    const title = await persistableCoffeeTopicTitle({
      topic: HARRY_POTTER_PROMPT,
      fallbackTitle: heuristicCoffeeTopicTitle(HARRY_POTTER_PROMPT),
      provider: mockProvider('{"title":"Harry Potter\'s Memorable Chapter"}'),
    });
    assert.equal(title, "Harry Potter's Memorable Chapter");
  });
});

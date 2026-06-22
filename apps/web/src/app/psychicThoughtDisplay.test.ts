import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { psychicThoughtDisplayLineForMessage } from "./psychicThoughtDisplay.ts";

describe("psychicThoughtDisplayLineForMessage", () => {
  it("returns a subtle Psychic line for user messages with a summary", () => {
    assert.deepEqual(
      psychicThoughtDisplayLineForMessage({
        role: "user",
        psychicThought: {
          v: 1,
          summary: "  I checked the constraints first.  ",
          effort: "high",
          provider: "local",
          model: "llama3.2",
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      }),
      { label: "Psychic", summary: "I checked the constraints first." }
    );
  });

  it("does not render under assistant messages or empty summaries", () => {
    assert.equal(
      psychicThoughtDisplayLineForMessage({
        role: "assistant",
        psychicThought: {
          v: 1,
          summary: "Hidden from assistant rows.",
          effort: "medium",
          provider: "local",
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      }),
      null
    );
    assert.equal(
      psychicThoughtDisplayLineForMessage({
        role: "user",
        psychicThought: {
          v: 1,
          summary: "   ",
          effort: "medium",
          provider: "openai",
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      }),
      null
    );
  });
});

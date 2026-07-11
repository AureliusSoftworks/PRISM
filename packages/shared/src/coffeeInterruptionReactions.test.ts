import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeInterruptionReactionCandidates,
  pickCoffeeInterruptionReaction,
  type CoffeeReactionStyle,
  type CoffeeReactionTone,
} from "./coffeeInterruptionReactions.ts";

describe("Coffee interruption reactions", () => {
  it("provides more than eighty reviewed style/tone/outcome combinations", () => {
    const styles: CoffeeReactionStyle[] = ["neutral", "warm", "concise", "playful", "formal"];
    const tones: CoffeeReactionTone[] = ["surprised", "annoyed", "firm", "wounded"];
    const outcomes = ["react", "yield", "resume"] as const;
    const lines = new Set(
      styles.flatMap((style) =>
        tones.flatMap((tone) => outcomes.flatMap((outcome) =>
          coffeeInterruptionReactionCandidates(style, tone, outcome)
        ))
      )
    );
    assert.ok(lines.size >= 80);
  });

  it("is deterministic and avoids recent repeats", () => {
    const first = pickCoffeeInterruptionReaction({
      style: "playful",
      tone: "annoyed",
      outcome: "yield",
      seed: "turn-1",
    });
    assert.equal(first, pickCoffeeInterruptionReaction({
      style: "playful",
      tone: "annoyed",
      outcome: "yield",
      seed: "turn-1",
    }));
    assert.notEqual(pickCoffeeInterruptionReaction({
      style: "playful",
      tone: "annoyed",
      outcome: "yield",
      seed: "turn-1",
      avoid: [first],
    }), first);
  });
});

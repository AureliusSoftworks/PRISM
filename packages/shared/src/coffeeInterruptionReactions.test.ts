import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeInterruptionTranscriptSegments,
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

  it("projects only audible bot-to-bot pause cues in speaker order", () => {
    const segments = coffeeInterruptionTranscriptSegments({
      sourceMessageId: "pause-1",
      sourceContent: "...",
      interruption: {
        kind: "botInterruptsBot",
        interruptedBotId: "speaker",
        interrupterBotId: "interrupter",
        pauseBeat: true,
        interrupterCue: "Hold on.",
        interruptedSpeakerCue: "... sure. Go ahead.",
        reactionText: "This normal reply must not be duplicated.",
        socialConsequences: [],
      },
    });

    assert.deepEqual(segments, [
      {
        id: "pause-1:coffee-interruption:interrupter",
        sourceMessageId: "pause-1",
        kind: "interrupterCue",
        speakerBotId: "interrupter",
        text: "Hold on.",
        sequence: 0,
      },
      {
        id: "pause-1:coffee-interruption:interrupted",
        sourceMessageId: "pause-1",
        kind: "interruptedSpeakerCue",
        speakerBotId: "speaker",
        text: "... sure. Go ahead.",
        sequence: 1,
      },
    ]);
    assert.equal(
      segments.some((segment) =>
        segment.text.includes("normal reply"),
      ),
      false,
    );
  });

  it("rejects actions, non-bot interruptions, and malformed carriers", () => {
    assert.deepEqual(
      coffeeInterruptionTranscriptSegments({
        sourceMessageId: "pause-gesture",
        sourceContent: "*raises a finger*",
        interruption: {
          kind: "playerInterruptsBot",
          interruptedBotId: "speaker",
          pauseBeat: true,
          reactionText: "I was not done.",
          socialConsequences: [],
        },
      }),
      [],
    );
    assert.deepEqual(
      coffeeInterruptionTranscriptSegments({
        sourceMessageId: "pause-malformed",
        sourceContent: "...",
        interruption: {
          kind: "botInterruptsBot",
          interruptedBotId: "speaker",
          pauseBeat: true,
          socialConsequences: [],
        },
      }),
      [],
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_EVIDENCE_EMOJI_CHOICES,
  debateEvidenceObjectFromPrismCandidate,
  debateEvidenceEmojiForObject,
  normalizeDebateEvidenceEmojiChoice,
  randomDebateEvidenceObject,
} from "./debateEvidenceExhibits.ts";

describe("Debate evidence object generator", () => {
  it("always returns one adjective plus one concrete object phrase", () => {
    const values = [0.01, 0.2, 0.49, 0.72, 0.99];
    let cursor = 0;
    const draft = randomDebateEvidenceObject(
      () => values[cursor++ % values.length]!,
    );

    assert.match(draft.adjective, /^\S+$/u);
    assert.ok(draft.object.trim().length > 0);
    assert.equal(draft.observation, `${draft.adjective} ${draft.object}.`);
    assert.equal(draft.createdBy, "prism");
    assert.equal(draft.visualKind, "emoji");
    assert.equal(draft.imageId, null);
    assert.equal(draft.emojiCustomized, false);
    assert.ok(
      DEBATE_EVIDENCE_EMOJI_CHOICES.some((emoji) => emoji === draft.emoji),
    );
  });

  it("walks past exhibit titles that are already in the evidence packet", () => {
    const first = randomDebateEvidenceObject(() => 0);
    const next = randomDebateEvidenceObject(() => 0, [
      `${first.adjective} ${first.object}`,
    ]);
    assert.notEqual(
      `${next.adjective} ${next.object}`,
      `${first.adjective} ${first.object}`,
    );
  });

  it("gives recognizable examples their natural emoji fallback", () => {
    assert.equal(debateEvidenceEmojiForObject("spoon", "Rusty"), "🥄");
    assert.equal(debateEvidenceEmojiForObject("potato", "Old"), "🥔");
    assert.equal(debateEvidenceEmojiForObject("freight train", "Chubby"), "🚂");
    assert.equal(debateEvidenceEmojiForObject("orangutan", "Red"), "🦧");
    assert.equal(debateEvidenceEmojiForObject("green glove", "Velvet"), "🧤");
    assert.equal(debateEvidenceEmojiForObject("transit map", "Weathered"), "🗺️");
    assert.equal(debateEvidenceEmojiForObject("toy rocket", "Tin"), "🚀");
    assert.equal(debateEvidenceEmojiForObject("coffee mug", "Cracked"), "☕");
  });

  it("turns one contextual Prism pair into an editable evidence draft", () => {
    assert.deepEqual(
      debateEvidenceObjectFromPrismCandidate("Weathered transit map"),
      {
        adjective: "Weathered",
        object: "transit map",
        observation: "Weathered transit map.",
        emoji: "🗺️",
        emojiCustomized: false,
        createdBy: "prism",
        visualKind: "emoji",
        imageId: null,
      },
    );
    assert.equal(debateEvidenceObjectFromPrismCandidate("Spoon"), null);
    assert.equal(
      debateEvidenceObjectFromPrismCandidate("Weathered transit map."),
      null,
    );
  });

  it("keeps one complete user-selected emoji grapheme", () => {
    assert.equal(normalizeDebateEvidenceEmojiChoice("🧑🏽‍🚀"), "🧑🏽‍🚀");
    assert.equal(normalizeDebateEvidenceEmojiChoice("📦🏳️‍🌈"), "🏳️‍🌈");
    assert.equal(normalizeDebateEvidenceEmojiChoice("", "🥄"), "🥄");
  });
});

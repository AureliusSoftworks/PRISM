import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_EVIDENCE_EMOJI_CHOICES,
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

  it("gives recognizable examples their natural emoji fallback", () => {
    assert.equal(debateEvidenceEmojiForObject("spoon", "Rusty"), "🥄");
    assert.equal(debateEvidenceEmojiForObject("potato", "Old"), "🥔");
    assert.equal(debateEvidenceEmojiForObject("freight train", "Chubby"), "🚂");
    assert.equal(debateEvidenceEmojiForObject("orangutan", "Red"), "🦧");
  });

  it("keeps one complete user-selected emoji grapheme", () => {
    assert.equal(normalizeDebateEvidenceEmojiChoice("🧑🏽‍🚀"), "🧑🏽‍🚀");
    assert.equal(normalizeDebateEvidenceEmojiChoice("📦🏳️‍🌈"), "🏳️‍🌈");
    assert.equal(normalizeDebateEvidenceEmojiChoice("", "🥄"), "🥄");
  });
});

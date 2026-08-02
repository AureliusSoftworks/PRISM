import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_EVIDENCE_EMOJI_CHOICES,
  applyDebateEvidenceExhibitAssetReuse,
  applyDebateEvidenceObjectNameEdit,
  debateEvidenceObjectFromPrismCandidate,
  debateEvidenceEmojiForObject,
  normalizeDebateEvidenceEmojiChoice,
  randomDebateEvidenceObject,
  searchDebateEvidenceEmojis,
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
    const next = randomDebateEvidenceObject(
      () => 0,
      [`${first.adjective} ${first.object}`],
    );
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
    assert.equal(
      debateEvidenceEmojiForObject("transit map", "Weathered"),
      "🗺️",
    );
    assert.equal(debateEvidenceEmojiForObject("toy rocket", "Tin"), "🚀");
    assert.equal(debateEvidenceEmojiForObject("coffee mug", "Cracked"), "☕");
  });

  it("ranks exactly three live search previews by relevant terms", () => {
    assert.deepEqual(
      searchDebateEvidenceEmojis("glove").map(({ emoji }) => emoji),
      ["🧤", "🥊", "✋"],
    );
    const transit = searchDebateEvidenceEmojis("public transportation").map(
      ({ emoji }) => emoji,
    );
    assert.equal(transit.length, 3);
    assert.ok(
      transit.includes("🚂") || transit.includes("🚆"),
      `expected a train in transit results, got ${transit.join(" ")}`,
    );
    assert.ok(
      transit.some((emoji) => ["🚌", "🚗", "🚎", "🚐", "🚇"].includes(emoji)),
      `expected a road/transit vehicle, got ${transit.join(" ")}`,
    );
    const celebrate = searchDebateEvidenceEmojis("Celebrate").map(
      ({ emoji }) => emoji,
    );
    assert.ok(
      celebrate.includes("🎉"),
      `expected party popper in celebrate results, got ${celebrate.join(" ")}`,
    );
    assert.equal(celebrate.length, 3);
    assert.equal(
      celebrate.every((emoji) =>
        ["🎉", "🎊", "🥳", "🎈", "🎂", "🎆", "🎇", "🍾", "🥂", "🍻", "🎁", "🪅"].includes(
          emoji,
        ),
      ),
      true,
      `celebrate results should be festive symbols, got ${celebrate.join(" ")}`,
    );
    const unknown = searchDebateEvidenceEmojis("uncategorizable artifact");
    assert.equal(unknown.length, 3);
    assert.equal(new Set(unknown.map(({ emoji }) => emoji)).size, 3);
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

  it("reuses only the selected evidence sprite", () => {
    const current = {
      adjective: "Weathered",
      object: "transit map",
      observation: "The eastern route is circled in red.",
      emoji: "🗺️",
      emojiCustomized: true,
      createdBy: "player" as const,
      visualKind: "emoji" as const,
      imageId: null,
    };
    assert.deepEqual(
      applyDebateEvidenceExhibitAssetReuse(current, {
        id: "img-rusty-spoon",
      }),
      {
        ...current,
        visualKind: "synthesized",
        imageId: "img-rusty-spoon",
      },
    );
  });

  it("keeps a synthesized sprite when renaming adjective/object", () => {
    const withSprite = applyDebateEvidenceObjectNameEdit(
      {
        adjective: "Mobile",
        object: "Phone",
        observation: "Mobile Phone.",
        emoji: "📱",
        emojiCustomized: false,
        createdBy: "player",
        visualKind: "synthesized",
        imageId: "img-mobile-phone",
      },
      "adjective",
      "Victim's",
    );
    assert.equal(withSprite.adjective, "Victim's");
    assert.equal(withSprite.object, "Phone");
    assert.equal(withSprite.observation, "Victim's Phone.");
    assert.equal(withSprite.visualKind, "synthesized");
    assert.equal(withSprite.imageId, "img-mobile-phone");
    assert.equal(withSprite.emoji, "📱");

    const renamedObject = applyDebateEvidenceObjectNameEdit(
      withSprite,
      "object",
      "Mobile Phone",
    );
    assert.equal(renamedObject.object, "Mobile Phone");
    assert.equal(renamedObject.observation, "Victim's Mobile Phone.");
    assert.equal(renamedObject.visualKind, "synthesized");
    assert.equal(renamedObject.imageId, "img-mobile-phone");
  });

  it("still auto-picks emoji when renaming before a sprite exists", () => {
    const next = applyDebateEvidenceObjectNameEdit(
      {
        adjective: "Rusty",
        object: "key",
        observation: "Rusty key.",
        emoji: "🔑",
        emojiCustomized: false,
        createdBy: "player",
        visualKind: "emoji",
        imageId: null,
      },
      "object",
      "spoon",
    );
    assert.equal(next.emoji, "🥄");
    assert.equal(next.visualKind, "emoji");
    assert.equal(next.imageId, null);
  });

  it("keeps one complete user-selected emoji grapheme", () => {
    assert.equal(normalizeDebateEvidenceEmojiChoice("🧑🏽‍🚀"), "🧑🏽‍🚀");
    assert.equal(normalizeDebateEvidenceEmojiChoice("📦🏳️‍🌈"), "🏳️‍🌈");
    assert.equal(normalizeDebateEvidenceEmojiChoice("", "🥄"), "🥄");
  });
});

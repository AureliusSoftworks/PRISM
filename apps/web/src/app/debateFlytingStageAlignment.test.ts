import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
  DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS,
  copyDebateFlytingStageAlignment,
  formatDebateFlytingStageAlignmentClipboard,
  normalizeDebateFlytingStageAlignment,
  updateDebateFlytingStagePlacement,
} from "./debateFlytingStageAlignment.ts";

describe("Flyting stage alignment", () => {
  it("presents the two Flyting sides as Challenger and Defender", () => {
    for (const item of DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS) {
      if (item.id.includes("For")) assert.match(item.label, /^Challenger/u);
      if (item.id.includes("Against")) assert.match(item.label, /^Defender/u);
    }
  });

  it("covers the stage, throne, competitor heraldry, helmets, nameplates, and rug glyphs", () => {
    const ids = new Set(
      DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.map((item) => item.id),
    );
    assert.equal(ids.size, 18);
    assert.ok(ids.has("wideForHelmet"));
    assert.ok(ids.has("moderatorModeratorHelmet"));
    assert.ok(ids.has("wideAgainstHeraldry"));
    assert.ok(!new Set<string>(ids).has("galleryModeratorRugGlyph"));
  });

  it("updates one placement without disturbing the others", () => {
    const updated = updateDebateFlytingStagePlacement(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
      "galleryAgainstRugGlyph",
      { x: 8.5, y: -4, scale: 135, rotation: 12, skewX: 18 },
    );
    assert.deepEqual(updated.placements.galleryAgainstRugGlyph, {
      x: 8.5,
      y: -4,
      scale: 135,
      rotation: 12,
      skewX: 18,
    });
    assert.deepEqual(
      updated.placements.wideForBot,
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideForBot,
    );
  });

  it("normalizes unsafe pasted values and emits source-ready clipboard text", () => {
    const normalized = normalizeDebateFlytingStageAlignment({
      placements: {
        wideForBot: {
          x: 999,
          y: -999,
          scale: 999,
          rotation: -999,
          skewX: 999,
        },
      },
    });
    assert.deepEqual(normalized.placements.wideForBot, {
      x: 100,
      y: -100,
      scale: 250,
      rotation: -180,
      skewX: 60,
    });
    assert.deepEqual(copyDebateFlytingStageAlignment(normalized), normalized);
    const clipboard = formatDebateFlytingStageAlignmentClipboard(normalized);
    assert.match(clipboard, /DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT/u);
    assert.match(clipboard, /"galleryForRugGlyph"/u);
  });
});

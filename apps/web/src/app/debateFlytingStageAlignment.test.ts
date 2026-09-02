import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
  DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS,
  DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS,
  copyDebateFlytingStageAlignment,
  debateFlytingStageRehearsalItems,
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
    assert.equal(ids.size, 21);
    assert.ok(ids.has("wideForHelmet"));
    assert.ok(ids.has("moderatorModeratorHelmet"));
    assert.ok(ids.has("wideAgainstHeraldry"));
    assert.ok(ids.has("wideModeratorHeraldry"));
    assert.ok(ids.has("moderatorModeratorHeraldry"));
    assert.ok(ids.has("galleryModeratorRugGlyph"));
  });

  it("lets each independently authored helmet rotate and skew", () => {
    const items = new Map(
      DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.map((item) => [item.id, item]),
    );
    for (const id of [
      "wideForHelmet",
      "wideAgainstHelmet",
      "wideModeratorHelmet",
      "moderatorModeratorHelmet",
    ] as const) {
      assert.equal(items.get(id)?.supportsRotation, true);
      assert.equal(items.get(id)?.supportsSkew, true);
    }
  });

  it("merges gallery rug tuning into the Wide rehearsal view", () => {
    const wideIds = new Set(
      debateFlytingStageRehearsalItems("wide").map((item) => item.id),
    );
    assert.ok(wideIds.has("wideForBot"));
    assert.ok(wideIds.has("wideModeratorHeraldry"));
    assert.ok(wideIds.has("galleryForRugGlyph"));
    assert.ok(wideIds.has("galleryModeratorRugGlyph"));
    assert.ok(wideIds.has("galleryAgainstRugGlyph"));
    assert.ok(
      debateFlytingStageRehearsalItems("moderator").every(
        (item) => item.view === "moderator",
      ),
    );
  });

  it("installs the approved rug placements and gallery controls", () => {
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.galleryForRugGlyph,
      {
        x: 0.02,
        y: -8.45,
        scale: 100,
        rotation: 0,
        skewX: -20,
      },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
        .galleryModeratorRugGlyph,
      { x: 0, y: 0, scale: 100, rotation: 0, skewX: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.galleryAgainstRugGlyph,
      {
        x: 0.59,
        y: -4.84,
        scale: 100,
        rotation: 0,
        skewX: 20,
      },
    );
    assert.deepEqual(DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS, {
      galleryBotScale: 60,
      galleryMaxVerticalRoam: 30,
    });
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
    const clipboard = formatDebateFlytingStageAlignmentClipboard(normalized, {
      galleryBotScale: 135,
      galleryMaxVerticalRoam: 18,
    });
    assert.match(clipboard, /DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT/u);
    assert.match(clipboard, /"galleryForRugGlyph"/u);
    assert.match(clipboard, /"galleryModeratorRugGlyph"/u);
    assert.match(clipboard, /DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS/u);
    assert.match(clipboard, /"galleryBotScale": 135/u);
    assert.match(clipboard, /"galleryMaxVerticalRoam": 18/u);
  });
});

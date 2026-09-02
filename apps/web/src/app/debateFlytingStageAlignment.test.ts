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
    assert.equal(ids.size, 23);
    assert.ok(ids.has("wideForHelmet"));
    assert.ok(ids.has("moderatorModeratorHelmet"));
    assert.ok(ids.has("wideAgainstHeraldry"));
    assert.ok(ids.has("wideModeratorHeraldry"));
    assert.ok(ids.has("moderatorModeratorHeraldry"));
    assert.ok(ids.has("galleryBotsContainer"));
    assert.ok(ids.has("galleryHelmets"));
    assert.ok(ids.has("galleryModeratorRugGlyph"));
  });

  it("gives the shared gallery helmets the same geometry controls as stage helmets", () => {
    const item = DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.find(
      (candidate) => candidate.id === "galleryHelmets",
    );
    assert.equal(item?.supportsRotation, true);
    assert.equal(item?.supportsSkew, true);
    assert.equal(item?.supportsSkewY, undefined);
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
      assert.equal(items.get(id)?.supportsSkewY, undefined);
    }
  });

  it("offers independent vertical skew only for the three rug glyphs", () => {
    for (const item of DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS) {
      assert.equal(
        item.supportsSkewY,
        item.id.endsWith("RugGlyph") || undefined,
      );
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

  it("installs the approved Wide, Moderator, rug, and gallery defaults", () => {
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideForHeraldry,
      { x: -0.25, y: -14, scale: 90, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideModeratorBot,
      { x: 0, y: -4.5, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideModeratorHelmet,
      {
        x: -11,
        y: -10.25,
        scale: 80,
        rotation: 0,
        skewX: 0,
        skewY: 0,
      },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideModeratorNameplate,
      { x: 0, y: -4, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideModeratorHeraldry,
      { x: -0.25, y: 3, scale: 80, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideAgainstNameplate,
      { x: 0, y: 0.02, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.wideAgainstHeraldry,
      { x: -0.5, y: -14, scale: 90, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.moderatorForHeraldry,
      { x: 0.6, y: -14, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.moderatorModeratorBot,
      { x: 0, y: -1.5, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
        .moderatorModeratorHelmet,
      { x: 0, y: 0, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
        .moderatorModeratorNameplate,
      { x: 0, y: 7, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
        .moderatorModeratorHeraldry,
      { x: -0.25, y: -3, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
        .moderatorAgainstHeraldry,
      { x: -1.4, y: -14, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.galleryBotsContainer,
      { x: 0, y: -2.75, scale: 97, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.galleryHelmets,
      { x: -21.38, y: -13.02, scale: 73, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.galleryForRugGlyph,
      {
        x: -0.77,
        y: -13.87,
        scale: 100,
        rotation: 0,
        skewX: -20,
        skewY: 0,
      },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
        .galleryModeratorRugGlyph,
      { x: -0.04, y: -14.77, scale: 100, rotation: 0, skewX: 0, skewY: 0 },
    );
    assert.deepEqual(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements.galleryAgainstRugGlyph,
      {
        x: 1.22,
        y: -11.7,
        scale: 100,
        rotation: 0,
        skewX: 20,
        skewY: 0,
      },
    );
    assert.deepEqual(DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS, {
      galleryBotScale: 60,
      galleryMaxVerticalRoam: 60,
    });
  });

  it("updates one placement without disturbing the others", () => {
    const updated = updateDebateFlytingStagePlacement(
      DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
      "galleryAgainstRugGlyph",
      { x: 8.5, y: -4, scale: 135, rotation: 12, skewX: 18, skewY: -11 },
    );
    assert.deepEqual(updated.placements.galleryAgainstRugGlyph, {
      x: 8.5,
      y: -4,
      scale: 135,
      rotation: 12,
      skewX: 18,
      skewY: -11,
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
          skewY: -999,
        },
      },
    });
    assert.deepEqual(normalized.placements.wideForBot, {
      x: 100,
      y: -100,
      scale: 250,
      rotation: -180,
      skewX: 60,
      skewY: -60,
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

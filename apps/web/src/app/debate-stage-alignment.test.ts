import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEBATE_STAGE_ALIGNMENT,
  DEBATE_STAGE_LIGHT_BLEND_MODES,
  debateStageAlignmentOffset,
  debateStageAlignmentStorageKey,
  debateStageAlignmentStyle,
  debateStageAlignmentTarget,
  formatDebateStageAlignmentClipboard,
  normalizeDebateStageAlignment,
  readDebateStageAlignment,
  updateDebateStageAlignmentOffset,
  updateDebateStageLightBlendMode,
  writeDebateStageAlignment,
} from "./debateStageAlignment.ts";

describe("Debate stage alignment", () => {
  it("normalizes every movable item in independent Wide and Moderator views", () => {
    assert.deepEqual(
      normalizeDebateStageAlignment({
        wide: {
          for: {
            bot: { x: -99, y: 2.125 },
            nameplate: { x: "4.5", y: Number.NaN },
            glyph: { x: 6, y: 99 },
          },
          moderator: {
            bot: { x: 1, y: 2 },
            nameplate: { x: 3, y: 4 },
            glyph: { x: 5, y: 6 },
          },
          against: {
            bot: { x: -1, y: -2 },
            nameplate: { x: -3, y: -4 },
            glyph: { x: -5, y: -6 },
          },
        },
        moderator: {
          bot: { x: -3.25, y: 7.5 },
          nameplate: { x: 2.25, y: -1.5 },
          glyph: { x: 0.5, y: -0.5 },
        },
        lightBlendModes: {
          dark: "overlay",
          light: "screen",
        },
      }),
      {
        version: 3,
        wide: {
          for: {
            bot: { x: -12, y: 2.13 },
            nameplate: { x: 4.5, y: 0 },
            glyph: { x: 6, y: 12 },
          },
          moderator: {
            bot: { x: 1, y: 2 },
            nameplate: { x: 3, y: 4 },
            glyph: { x: 5, y: 6 },
          },
          against: {
            bot: { x: -1, y: -2 },
            nameplate: { x: -3, y: -4 },
            glyph: { x: -5, y: -6 },
          },
        },
        moderator: {
          bot: { x: -3.25, y: 7.5 },
          nameplate: { x: 2.25, y: -1.5 },
          glyph: { x: 0.5, y: -0.5 },
        },
        lightBlendModes: {
          dark: "overlay",
          light: "screen",
        },
      },
    );
  });

  it("uses tenant-scoped storage and migrates V1 and V2 placements without visual drift", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    assert.equal(
      debateStageAlignmentStorageKey("user-1"),
      "prism_debate_stage_alignment_v3:user-1",
    );
    assert.deepEqual(
      readDebateStageAlignment(storage, "user-1"),
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
    );
    values.set(
      "prism_debate_stage_alignment_v2:user-1",
      JSON.stringify({
        version: 2,
        wide: {
          for: { x: 1, y: -2 },
          moderator: { x: 4, y: 3 },
          against: { x: -1, y: -2 },
        },
        moderator: { x: 6, y: -4 },
      }),
    );
    const migrated = readDebateStageAlignment(storage, "user-1");
    assert.deepEqual(migrated.wide.moderator.bot, { x: 4, y: 3 });
    assert.deepEqual(migrated.wide.moderator.nameplate, { x: 4, y: 3 });
    assert.deepEqual(migrated.wide.moderator.glyph, { x: 0, y: 0 });
    assert.deepEqual(migrated.moderator.bot, { x: 6, y: -4 });
    assert.deepEqual(migrated.moderator.nameplate, { x: 6, y: -4 });
    assert.deepEqual(migrated.moderator.glyph, { x: 0, y: 0 });
    writeDebateStageAlignment(storage, "user-1", {
      version: 3,
      wide: {
        for: {
          bot: { x: 1, y: -2 },
          nameplate: { x: 2, y: -1 },
          glyph: { x: 3, y: 0 },
        },
        moderator: {
          bot: { x: 0, y: 3 },
          nameplate: { x: 0, y: 2 },
          glyph: { x: 0, y: 1 },
        },
        against: {
          bot: { x: -1, y: -2 },
          nameplate: { x: -2, y: -1 },
          glyph: { x: -3, y: 0 },
        },
      },
      moderator: {
        bot: { x: 6, y: -4 },
        nameplate: { x: 5, y: -3 },
        glyph: { x: 4, y: -2 },
      },
      lightBlendModes: {
        dark: "overlay",
        light: "screen",
      },
    });
    assert.deepEqual(
      readDebateStageAlignment(storage, "user-1").moderator.glyph,
      { x: 4, y: -2 },
    );
  });

  it("maps individual Wide and Moderator items into live forum CSS variables", () => {
    const alignment = normalizeDebateStageAlignment({
      version: 3,
      wide: {
        for: {
          bot: { x: 1, y: -2 },
          nameplate: { x: 2, y: -3 },
          glyph: { x: 3, y: -4 },
        },
      },
      moderator: {
        bot: { x: 6, y: -4 },
        nameplate: { x: 5, y: -3 },
        glyph: { x: 4, y: -2 },
      },
      lightBlendModes: {
        dark: "overlay",
        light: "screen",
      },
    });
    const style = debateStageAlignmentStyle(alignment) as Record<
      string,
      string
    >;
    assert.equal(style["--debate-for-offset-x"], "1%");
    assert.equal(style["--debate-for-nameplate-offset-y"], "-3%");
    assert.equal(style["--debate-for-glyph-offset-x"], "3%");
    assert.equal(style["--debate-moderator-view-offset-x"], "6%");
    assert.equal(style["--debate-moderator-view-nameplate-offset-y"], "-3%");
    assert.equal(style["--debate-moderator-view-glyph-offset-x"], "4%");
    assert.equal(style["--debate-light-blend-mode-dark"], "overlay");
    assert.equal(style["--debate-light-blend-mode-light"], "screen");
  });

  it("updates one close-up item without mutating its bot or the Wide moderator", () => {
    const target = debateStageAlignmentTarget(
      "moderator",
      "nameplate",
      "moderator",
    );
    const updated = updateDebateStageAlignmentOffset(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      target,
      { x: 2.5, y: -1 },
    );
    assert.deepEqual(
      debateStageAlignmentOffset(
        updated,
        debateStageAlignmentTarget("moderator", "bot", "wide"),
      ),
      { x: 0, y: 0 },
    );
    assert.deepEqual(
      debateStageAlignmentOffset(
        updated,
        debateStageAlignmentTarget("moderator", "bot", "moderator"),
      ),
      { x: 0, y: 0 },
    );
    assert.deepEqual(debateStageAlignmentOffset(updated, target), {
      x: 2.5,
      y: -1,
    });
    assert.equal(
      JSON.parse(formatDebateStageAlignmentClipboard(updated)).moderator
        .nameplate.x,
      2.5,
    );
  });

  it("keeps independent Light and Dark blend modes inside the saved alignment", () => {
    assert.deepEqual(DEBATE_STAGE_LIGHT_BLEND_MODES, ["screen", "overlay"]);
    const darkOverlay = updateDebateStageLightBlendMode(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "dark",
      "overlay",
    );
    const tuned = updateDebateStageLightBlendMode(
      darkOverlay,
      "light",
      "screen",
    );
    assert.deepEqual(tuned.lightBlendModes, {
      dark: "overlay",
      light: "screen",
    });
    assert.deepEqual(
      normalizeDebateStageAlignment({
        lightBlendModes: { dark: "multiply", light: "invalid" },
      }).lightBlendModes,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes,
    );
    assert.deepEqual(
      JSON.parse(formatDebateStageAlignmentClipboard(tuned)).lightBlendModes,
      tuned.lightBlendModes,
    );
  });
});

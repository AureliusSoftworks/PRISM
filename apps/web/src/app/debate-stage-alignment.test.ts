import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEBATE_STAGE_ALIGNMENT,
  DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
  DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
  DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
  DEBATE_STAGE_GAVEL_POSITION_MAX,
  DEBATE_STAGE_GAVEL_POSITION_MIN,
  DEBATE_STAGE_GAVEL_ROTATION_MAX,
  DEBATE_STAGE_GAVEL_ROTATION_MIN,
  DEBATE_STAGE_GAVEL_SIZE_MAX,
  DEBATE_STAGE_GAVEL_SIZE_MIN,
  DEBATE_STAGE_LIGHT_BLEND_MODES,
  debateStageAlignmentOffset,
  debateStageAlignmentStorageKey,
  debateStageAlignmentStyle,
  debateStageAlignmentTarget,
  debateStageEvidenceViewForCamera,
  formatDebateStageAlignmentClipboard,
  formatDebateStageEvidenceTableClipboard,
  formatDebateStageGavelClipboard,
  normalizeDebateStageAlignment,
  readDebateStageAlignment,
  updateDebateStageAlignmentOffset,
  updateDebateStageEvidenceTable,
  updateDebateStageGavelPose,
  updateDebateStageLightBlendMode,
  updateDebateStageLightMaskOpacity,
  writeDebateStageAlignment,
} from "./debateStageAlignment.ts";

describe("Debate stage alignment", () => {
  it("uses the readable source composition from each lectern camera", () => {
    assert.equal(
      debateStageEvidenceViewForCamera("moderator", "source"),
      "moderator",
    );
    assert.equal(
      debateStageEvidenceViewForCamera("left", "source"),
      "moderator",
    );
    assert.equal(
      debateStageEvidenceViewForCamera("right", "source"),
      "moderator",
    );
    assert.equal(debateStageEvidenceViewForCamera("wide", "source"), "wide");
    assert.equal(debateStageEvidenceViewForCamera("jury", "source"), "wide");
    assert.equal(debateStageEvidenceViewForCamera("moderator"), "moderator");
    for (const camera of ["wide", "left", "right", "jury"] as const) {
      assert.equal(debateStageEvidenceViewForCamera(camera), "wide");
    }
  });

  it("gives both gavel pose axes a generous six-hundred-percent span", () => {
    assert.equal(DEBATE_STAGE_GAVEL_POSITION_MIN, -300);
    assert.equal(DEBATE_STAGE_GAVEL_POSITION_MAX, 300);
  });

  it("uses the approved version-nine stage composition as its canonical default", () => {
    const expected = {
      version: 9,
      wide: {
        for: {
          bot: { x: 0.01, y: -2 },
          nameplate: { x: 3, y: -4 },
          glyph: { x: 2.5, y: -6.5 },
        },
        moderator: {
          bot: { x: -0.02, y: -4 },
          nameplate: { x: -0.02, y: -11 },
          glyph: { x: 0, y: 1.5 },
        },
        against: {
          bot: { x: -0.03, y: -2 },
          nameplate: { x: -3, y: -4 },
          glyph: { x: -2.5, y: -6.5 },
        },
      },
      moderator: {
        bot: { x: -0.02, y: -1.5 },
        nameplate: { x: -0.02, y: -12 },
        glyph: { x: 0, y: 7 },
      },
      gavel: {
        lowered: { x: -138.5, y: 12.5, rotation: -131, size: 75 },
        raised: { x: -130.5, y: -4.5, rotation: -77, size: 90 },
      },
      evidenceTable: {
        exhibit: {
          wide: { x: 0, y: 111.5, size: 100 },
          moderator: { x: 0, y: 174, size: 220 },
        },
        source: {
          wide: { x: 0, y: 111.5, size: 100 },
          moderator: { x: 0, y: 174, size: 220 },
        },
      },
      lightBlendModes: {
        dark: "hard-light",
        light: "color",
      },
      lightMaskOpacities: {
        dark: 100,
        light: 100,
      },
    };

    assert.deepEqual(DEFAULT_DEBATE_STAGE_ALIGNMENT, expected);
    assert.deepEqual(normalizeDebateStageAlignment({}), expected);
  });

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
        gavel: {
          size: 900,
          lowered: { x: -999, y: 999, rotation: 999 },
          raised: { x: 25, y: -30, rotation: -999 },
        },
        lightBlendModes: {
          dark: "overlay",
          light: "screen",
        },
        lightMaskOpacities: {
          dark: -20,
          light: 72.5,
        },
        evidenceTable: { x: -999, y: 999, size: 12 },
      }),
      {
        version: 9,
        wide: {
          for: {
            bot: { x: -12, y: 2.13 },
            nameplate: { x: 4.5, y: -4 },
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
        gavel: {
          lowered: {
            x: DEBATE_STAGE_GAVEL_POSITION_MIN,
            y: DEBATE_STAGE_GAVEL_POSITION_MAX,
            rotation: DEBATE_STAGE_GAVEL_ROTATION_MAX,
            size: DEBATE_STAGE_GAVEL_SIZE_MAX,
          },
          raised: {
            x: 25,
            y: -30,
            rotation: DEBATE_STAGE_GAVEL_ROTATION_MIN,
            size: DEBATE_STAGE_GAVEL_SIZE_MAX,
          },
        },
        evidenceTable: {
          exhibit: {
            wide: {
              x: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              y: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              size: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
            },
            moderator: {
              x: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              y: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              size: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
            },
          },
          source: {
            wide: {
              x: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              y: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              size: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
            },
            moderator: {
              x: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              y: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              size: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
            },
          },
        },
        lightBlendModes: {
          dark: "overlay",
          light: "screen",
        },
        lightMaskOpacities: {
          dark: 0,
          light: 72.5,
        },
      },
    );
  });

  it("uses tenant-scoped storage and migrates prior saved placements without visual drift", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    assert.equal(
      debateStageAlignmentStorageKey("user-1"),
      "prism_debate_stage_alignment_v9:user-1",
    );
    assert.deepEqual(
      readDebateStageAlignment(storage, "user-1"),
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
    );
    values.set(
      "prism_debate_stage_alignment_v3:user-1",
      JSON.stringify({
        version: 3,
        wide: {
          for: {
            bot: { x: 1, y: -2 },
            nameplate: { x: 1, y: -2 },
            glyph: { x: 0, y: 0 },
          },
          moderator: {
            bot: { x: 4, y: 3 },
            nameplate: { x: 4, y: 3 },
            glyph: { x: 0, y: 0 },
          },
          against: {
            bot: { x: -1, y: -2 },
            nameplate: { x: -1, y: -2 },
            glyph: { x: 0, y: 0 },
          },
        },
        moderator: {
          bot: { x: 6, y: -4 },
          nameplate: { x: 6, y: -4 },
          glyph: { x: 0, y: 0 },
        },
        lightBlendModes: {
          dark: "screen",
          light: "overlay",
        },
      }),
    );
    const migrated = readDebateStageAlignment(storage, "user-1");
    assert.deepEqual(migrated.wide.moderator.bot, { x: 4, y: 3 });
    assert.deepEqual(migrated.wide.moderator.nameplate, { x: 4, y: 3 });
    assert.deepEqual(migrated.wide.moderator.glyph, { x: 0, y: 0 });
    assert.deepEqual(migrated.moderator.bot, { x: 6, y: -4 });
    assert.deepEqual(migrated.moderator.nameplate, { x: 6, y: -4 });
    assert.deepEqual(migrated.moderator.glyph, { x: 0, y: 0 });
    assert.deepEqual(migrated.gavel, DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel);
    assert.deepEqual(
      migrated.evidenceTable,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable,
    );
    assert.deepEqual(
      migrated.lightMaskOpacities,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.lightMaskOpacities,
    );
    values.set(
      "prism_debate_stage_alignment_v4:user-1",
      JSON.stringify({
        version: 4,
        gavel: { x: 2, y: -3, size: 125 },
      }),
    );
    assert.deepEqual(readDebateStageAlignment(storage, "user-1").gavel, {
      lowered: { x: 2, y: -3, rotation: 0, size: 125 },
      raised: { x: 10, y: -27, rotation: 0, size: 125 },
    });
    values.set(
      "prism_debate_stage_alignment_v5:user-1",
      JSON.stringify({
        version: 5,
        gavel: {
          size: 135,
          lowered: { x: 3, y: -4, rotation: 12 },
          raised: { x: 11, y: -28, rotation: -18 },
        },
      }),
    );
    assert.deepEqual(readDebateStageAlignment(storage, "user-1").gavel, {
      lowered: { x: 3, y: -4, rotation: 12, size: 135 },
      raised: { x: 11, y: -28, rotation: -18, size: 135 },
    });
    writeDebateStageAlignment(storage, "user-1", {
      version: 7,
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
      gavel: {
        lowered: { x: 2, y: -3, rotation: 12, size: 125 },
        raised: { x: 10, y: -27, rotation: -34, size: 140 },
      },
      // Legacy v7 stored one placement; V9 lifts it to both asset classes.
      evidenceTable: { x: 8, y: -12, size: 115 },
      lightBlendModes: {
        dark: "overlay",
        light: "screen",
      },
      lightMaskOpacities: {
        dark: 65,
        light: 80,
      },
    } as unknown as Parameters<typeof writeDebateStageAlignment>[2]);
    assert.deepEqual(
      readDebateStageAlignment(storage, "user-1").moderator.glyph,
      { x: 4, y: -2 },
    );
    assert.deepEqual(readDebateStageAlignment(storage, "user-1").evidenceTable, {
      exhibit: {
        wide: { x: 8, y: -12, size: 115 },
        moderator: { x: 8, y: -12, size: 115 },
      },
      source: {
        wide: { x: 8, y: -12, size: 115 },
        moderator: { x: 8, y: -12, size: 115 },
      },
    });
    values.delete("prism_debate_stage_alignment_v9:user-1");
    values.set(
      "prism_debate_stage_alignment_v8:user-1",
      JSON.stringify({
        version: 8,
        evidenceTable: {
          wide: { x: 11, y: -13, size: 105 },
          moderator: { x: -22, y: 17, size: 175 },
        },
      }),
    );
    const migratedV8 = readDebateStageAlignment(storage, "user-1");
    assert.deepEqual(migratedV8.evidenceTable.exhibit, {
      wide: { x: 11, y: -13, size: 105 },
      moderator: { x: -22, y: 17, size: 175 },
    });
    assert.deepEqual(migratedV8.evidenceTable.source, {
      wide: { x: 11, y: -13, size: 105 },
      moderator: { x: -22, y: 17, size: 175 },
    });
  });

  it("maps individual Wide and Moderator items into live forum CSS variables", () => {
    const alignment = normalizeDebateStageAlignment({
      version: 7,
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
      gavel: {
        lowered: { x: 2.5, y: -4, rotation: 11, size: 135 },
        raised: { x: 14, y: -31.5, rotation: -28, size: 80 },
      },
      evidenceTable: { x: 7.5, y: -9, size: 120 },
      lightBlendModes: {
        dark: "overlay",
        light: "screen",
      },
      lightMaskOpacities: {
        dark: 65,
        light: 80,
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
    assert.equal(style["--debate-gavel-lowered-offset-x"], "2.5%");
    assert.equal(style["--debate-gavel-lowered-offset-y"], "-4%");
    assert.equal(style["--debate-gavel-lowered-rotation"], "11deg");
    assert.equal(style["--debate-gavel-lowered-scale"], "1.35");
    assert.equal(style["--debate-gavel-raised-offset-x"], "14%");
    assert.equal(style["--debate-gavel-raised-offset-y"], "-31.5%");
    assert.equal(style["--debate-gavel-raised-rotation"], "-28deg");
    assert.equal(style["--debate-gavel-raised-scale"], "0.8");
    assert.equal(style["--debate-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-evidence-scale"], "1.2");
    assert.equal(style["--debate-moderator-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-moderator-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-moderator-evidence-scale"], "1.2");
    assert.equal(style["--debate-source-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-source-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-source-evidence-scale"], "1.2");
    assert.equal(
      style["--debate-moderator-source-evidence-offset-x"],
      "7.5%",
    );
    assert.equal(
      style["--debate-moderator-source-evidence-offset-y"],
      "-9%",
    );
    assert.equal(style["--debate-moderator-source-evidence-scale"], "1.2");
    assert.equal(style["--debate-light-blend-mode-dark"], "overlay");
    assert.equal(style["--debate-light-blend-mode-light"], "screen");
    assert.equal(style["--debate-light-mask-opacity-dark"], "65%");
    assert.equal(style["--debate-light-mask-opacity-light"], "80%");
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
      DEFAULT_DEBATE_STAGE_ALIGNMENT.wide.moderator.bot,
    );
    assert.deepEqual(
      debateStageAlignmentOffset(
        updated,
        debateStageAlignmentTarget("moderator", "bot", "moderator"),
      ),
      { x: -0.02, y: -1.5 },
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
    assert.deepEqual(DEBATE_STAGE_LIGHT_BLEND_MODES, [
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
    ]);
    assert.deepEqual(DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes, {
      dark: "hard-light",
      light: "color",
    });
    const darkMultiply = updateDebateStageLightBlendMode(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "dark",
      "multiply",
    );
    const tuned = updateDebateStageLightBlendMode(
      darkMultiply,
      "light",
      "soft-light",
    );
    assert.deepEqual(tuned.lightBlendModes, {
      dark: "multiply",
      light: "soft-light",
    });
    assert.deepEqual(
      normalizeDebateStageAlignment({
        lightBlendModes: { dark: "color-dodge", light: "invalid" },
      }).lightBlendModes,
      {
        dark: "color-dodge",
        light: DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes.light,
      },
    );
    assert.deepEqual(
      JSON.parse(formatDebateStageAlignmentClipboard(tuned)).lightBlendModes,
      tuned.lightBlendModes,
    );
  });

  it("updates both gavel poses and Light/Dark color-mask opacity independently", () => {
    const lowered = updateDebateStageGavelPose(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "lowered",
      {
        x: 3.5,
        y: -2,
        rotation: 17,
        size: DEBATE_STAGE_GAVEL_SIZE_MIN - 20,
      },
    );
    const raised = updateDebateStageGavelPose(lowered, "raised", {
      x: 13,
      y: -32,
      rotation: -41,
      size: 145,
    });
    assert.deepEqual(raised.gavel, {
      lowered: {
        x: 3.5,
        y: -2,
        rotation: 17,
        size: DEBATE_STAGE_GAVEL_SIZE_MIN,
      },
      raised: { x: 13, y: -32, rotation: -41, size: 145 },
    });
    assert.deepEqual(
      JSON.parse(formatDebateStageGavelClipboard(raised.gavel)),
      {
        lowered: {
          x: 3.5,
          y: -2,
          rotation: 17,
          size: DEBATE_STAGE_GAVEL_SIZE_MIN,
        },
        raised: { x: 13, y: -32, rotation: -41, size: 145 },
      },
    );
    const darkTuned = updateDebateStageLightMaskOpacity(raised, "dark", 35);
    const tuned = updateDebateStageLightMaskOpacity(darkTuned, "light", 70);
    assert.deepEqual(tuned.lightMaskOpacities, {
      dark: 35,
      light: 70,
    });
    assert.deepEqual(
      JSON.parse(formatDebateStageAlignmentClipboard(tuned)).gavel,
      tuned.gavel,
    );
  });

  it("preserves pose spacing when linked gavel controls move either frame", () => {
    const positioned = updateDebateStageGavelPose(
      updateDebateStageGavelPose(DEFAULT_DEBATE_STAGE_ALIGNMENT, "lowered", {
        x: 10,
        y: 5,
        rotation: 12,
        size: 80,
      }),
      "raised",
      { x: 30, y: -25, rotation: -8, size: 120 },
    );
    const linked = updateDebateStageGavelPose(
      positioned,
      "raised",
      { x: 42, y: -15, rotation: 17, size: 140 },
      true,
    );
    assert.deepEqual(linked.gavel, {
      lowered: { x: 22, y: 15, rotation: 37, size: 100 },
      raised: { x: 42, y: -15, rotation: 17, size: 140 },
    });
    const independent = updateDebateStageGavelPose(linked, "lowered", {
      x: -20,
    });
    assert.deepEqual(independent.gavel.lowered, {
      x: -20,
      y: 15,
      rotation: 37,
      size: 100,
    });
    assert.deepEqual(independent.gavel.raised, linked.gavel.raised);
  });

  it("places and scales each evidence asset independently per camera view", () => {
    const tunedWide = updateDebateStageEvidenceTable(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "exhibit",
      "wide",
      {
        x: 18.5,
        y: -22,
        size: 12,
      },
    );
    assert.deepEqual(tunedWide.evidenceTable.exhibit.wide, {
      x: 18.5,
      y: -22,
      size: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
    });
    assert.deepEqual(
      tunedWide.evidenceTable.exhibit.moderator,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.exhibit.moderator,
    );
    const tunedModerator = updateDebateStageEvidenceTable(
      tunedWide,
      "source",
      "moderator",
      { x: -40, y: 12, size: 150 },
    );
    assert.deepEqual(tunedModerator.evidenceTable.source.moderator, {
      x: -40,
      y: 12,
      size: 150,
    });
    assert.deepEqual(
      tunedModerator.evidenceTable.source.wide,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.source.wide,
    );
    assert.deepEqual(
      tunedModerator.evidenceTable.exhibit,
      tunedWide.evidenceTable.exhibit,
    );
    assert.deepEqual(
      tunedModerator.gavel,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel,
    );
    assert.deepEqual(
      JSON.parse(
        formatDebateStageEvidenceTableClipboard(tunedModerator.evidenceTable),
      ),
      tunedModerator.evidenceTable,
    );
  });
});

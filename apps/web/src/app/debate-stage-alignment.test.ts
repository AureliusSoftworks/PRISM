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
  DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
  DEBATE_STAGE_MODERATOR_MICRO_SCALE_MAX,
  DEBATE_STAGE_MODERATOR_MICRO_SCALE_MIN,
  DEBATE_STAGE_LIGHT_BLEND_MODES,
  debateStageAlignmentOffset,
  debateStageAlignmentStorageKey,
  debateStageAlignmentStyle,
  debateStageAlignmentTarget,
  debateStageEvidenceViewForCamera,
  debateStageCourtPropForCamera,
  defaultDebateStageEvidenceShadow,
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
  updateDebateStageModeratorMicroScale,
  updateDebateStageJuryMemberPlacement,
  updateDebateStageJuryPlacement,
  updateDebateStageGalleryVolume,
  updateDebateStageVoiceLevel,
  updateDebateStageWhodunnitCourtPlacement,
  writeDebateStageAlignment,
  debateStageVoiceLevelForRole,
  normalizeDebateStageGalleryVolume,
  normalizeDebateStageVoiceLevel,
} from "./debateStageAlignment.ts";

function evidencePlacement(
  x: number,
  y: number,
  size: number,
  view: "wide" | "left" | "moderator" | "right",
  kind: "exhibit" | "source" = "exhibit",
) {
  return {
    x,
    y,
    size,
    blurRadius: 0,
    shadow: defaultDebateStageEvidenceShadow(view, kind),
  };
}

describe("Debate stage alignment", () => {
  it("selects a separate foreground table only for the Moderator camera", () => {
    for (const camera of ["wide", "left", "moderator", "right", "jury"] as const) {
      assert.equal(
        debateStageCourtPropForCamera("wideEvidenceTable", camera),
        camera === "moderator" ? "moderatorEvidenceTable" : "wideEvidenceTable",
      );
      assert.equal(
        debateStageCourtPropForCamera("wideWitnessSilhouette", camera),
        "wideWitnessSilhouette",
      );
    }
  });

  it("migrates a saved shared table without shifting either camera", () => {
    const oldTable = { x: -13.5, y: 7, scale: 125 };
    const normalized = normalizeDebateStageAlignment({
      version: 14,
      whodunnitCourt: { wideEvidenceTable: oldTable },
    });
    assert.deepEqual(normalized.whodunnitCourt.wideEvidenceTable, oldTable);
    assert.deepEqual(normalized.whodunnitCourt.moderatorEvidenceTable, oldTable);
    assert.notEqual(
      normalized.whodunnitCourt.moderatorEvidenceTable,
      normalized.whodunnitCourt.wideEvidenceTable,
    );
    assert.deepEqual(normalizeDebateStageAlignment(normalized), normalized);
  });

  it("edits and resets the Moderator table without changing Main, evidence, or Jury", () => {
    const main = updateDebateStageWhodunnitCourtPlacement(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "wideEvidenceTable",
      { x: -13.5, y: 7, scale: 125 },
    );
    const moderator = updateDebateStageWhodunnitCourtPlacement(
      main,
      debateStageCourtPropForCamera("wideEvidenceTable", "moderator"),
      { x: 12, y: -16, scale: 80 },
    );
    assert.deepEqual(
      moderator.whodunnitCourt.wideEvidenceTable,
      main.whodunnitCourt.wideEvidenceTable,
    );
    assert.deepEqual(moderator.whodunnitCourt.moderatorEvidenceTable, {
      x: 12, y: -16, scale: 80,
    });
    assert.deepEqual(moderator.evidenceTable, main.evidenceTable);
    assert.deepEqual(moderator.juryChamber, main.juryChamber);
    assert.deepEqual(
      moderator.whodunnitCourt.wideWitnessSilhouette,
      main.whodunnitCourt.wideWitnessSilhouette,
    );
    const reset = updateDebateStageWhodunnitCourtPlacement(
      moderator,
      "moderatorEvidenceTable",
      DEFAULT_DEBATE_STAGE_ALIGNMENT.whodunnitCourt.moderatorEvidenceTable,
    );
    assert.deepEqual(reset, main);
    const mainReset = updateDebateStageWhodunnitCourtPlacement(
      moderator,
      "wideEvidenceTable",
      DEFAULT_DEBATE_STAGE_ALIGNMENT.whodunnitCourt.wideEvidenceTable,
    );
    assert.deepEqual(
      mainReset.whodunnitCourt.moderatorEvidenceTable,
      moderator.whodunnitCourt.moderatorEvidenceTable,
    );
  });

  it("saves, reloads, exports, and renders independent Main and Moderator table values", () => {
    const normalized = normalizeDebateStageAlignment({
      whodunnitCourt: {
        wideEvidenceTable: { x: -8, y: 6, scale: 120 },
        moderatorEvidenceTable: { x: 15, y: -10, scale: 85 },
      },
    });
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    writeDebateStageAlignment(storage, "forum-table", normalized);
    const restored = readDebateStageAlignment(storage, "forum-table");
    assert.deepEqual(restored, normalized);
    const copied = formatDebateStageAlignmentClipboard(restored);
    assert.deepEqual(
      JSON.parse(copied.slice(copied.indexOf("\n") + 1, -1)),
      normalized,
    );
    const style = debateStageAlignmentStyle(restored) as Record<string, string>;
    assert.equal(style["--whodunnit-wide-evidence-table-offset-x"], "-8%");
    assert.equal(style["--whodunnit-wide-evidence-table-offset-y"], "6%");
    assert.equal(style["--whodunnit-wide-evidence-table-scale"], "1.2");
    assert.equal(style["--debate-moderator-table-offset-x"], "15%");
    assert.equal(style["--debate-moderator-table-offset-y"], "-10%");
    assert.equal(style["--debate-moderator-table-scale"], "0.85");
  });

  it("exports complete normalized V14 Main defaults as source-ready TypeScript", () => {
    const copied = formatDebateStageAlignmentClipboard(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
    );

    assert.match(
      copied,
      /^export const DEFAULT_DEBATE_STAGE_ALIGNMENT: DebateStageAlignmentV14 =/u,
    );
    assert.deepEqual(
      JSON.parse(copied.slice(copied.indexOf("\n") + 1, -1)),
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
    );
  });

  it("stores every public-floor placement in the canonical Main layout", () => {
    const moved = updateDebateStageAlignmentOffset(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      debateStageAlignmentTarget("for", "bot", "wide"),
      { x: 4, y: -1 },
    );

    assert.deepEqual(moved.main.for.bot, { x: 4, y: -1 });
    assert.deepEqual(
      moved.evidenceTable,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable,
    );
    assert.deepEqual(moved.gavel, DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel);
  });

  it("persists Court and Jury camera placements in the shared alignment contract", () => {
    const tableAdjusted = updateDebateStageWhodunnitCourtPlacement(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "wideEvidenceTable",
      { x: -9, y: 6, scale: 92 },
    );
    const silhouetteAdjusted = updateDebateStageWhodunnitCourtPlacement(
      tableAdjusted,
      "wideWitnessSilhouette",
      { x: 11, y: -4, scale: 108 },
    );
    const courtAdjusted = updateDebateStageWhodunnitCourtPlacement(
      silhouetteAdjusted,
      "prosecutionMini",
      { x: -18, y: 7.5, scale: 85 },
    );
    const jurorAdjusted = updateDebateStageJuryMemberPlacement(
      courtAdjusted,
      3,
      { x: 12.5, y: -6, scale: 115 },
    );
    const adjusted = updateDebateStageJuryPlacement(
      jurorAdjusted,
      "votes",
      { x: 4, y: 8, scale: 90 },
    );
    const style = debateStageAlignmentStyle(adjusted) as Record<string, string>;

    assert.deepEqual(adjusted.whodunnitCourt.prosecutionMini, {
      x: -18,
      y: 7.5,
      scale: 85,
    });
    assert.deepEqual(adjusted.whodunnitCourt.wideEvidenceTable, {
      x: -9,
      y: 6,
      scale: 92,
    });
    assert.deepEqual(adjusted.whodunnitCourt.wideWitnessSilhouette, {
      x: 11,
      y: -4,
      scale: 108,
    });
    assert.deepEqual(adjusted.juryChamber.members[3], {
      x: 12.5,
      y: -6,
      scale: 115,
    });
    assert.deepEqual(adjusted.juryChamber.votes, {
      x: 4,
      y: 8,
      scale: 90,
    });
    assert.equal(style["--whodunnit-prosecution-mini-offset-x"], "-18%");
    assert.equal(style["--whodunnit-prosecution-mini-scale"], "0.85");
    assert.equal(style["--whodunnit-wide-evidence-table-offset-x"], "-9%");
    assert.equal(
      style["--whodunnit-wide-witness-silhouette-offset-x"],
      "11%",
    );
    assert.equal(style["--debate-jury-member-3-offset-y"], "-6%");
    assert.equal(style["--debate-jury-member-3-scale"], "1.15");
    assert.equal(style["--debate-jury-votes-offset-x"], "4%");
    assert.equal(style["--debate-jury-votes-scale"], "0.9");
  });

  it("keeps independent evidence geometry for every public-floor camera", () => {
    for (const camera of ["wide", "left", "moderator", "right"] as const) {
      assert.equal(debateStageEvidenceViewForCamera(camera), camera);
    }
    assert.equal(debateStageEvidenceViewForCamera("jury"), "wide");
  });

  it("gives both gavel pose axes a generous six-hundred-percent span", () => {
    assert.equal(DEBATE_STAGE_GAVEL_POSITION_MIN, -300);
    assert.equal(DEBATE_STAGE_GAVEL_POSITION_MAX, 300);
  });

  it("uses the approved Main stage composition as its canonical default", () => {
    const expected = {
      version: 14,
      main: {
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
          wide: evidencePlacement(0, 111.5, 100, "wide", "exhibit"),
          left: evidencePlacement(0, 111.5, 100, "left", "exhibit"),
          moderator: evidencePlacement(0, 174, 220, "moderator", "exhibit"),
          right: evidencePlacement(0, 111.5, 100, "right", "exhibit"),
        },
        source: {
          wide: evidencePlacement(0, 111.5, 100, "wide", "source"),
          left: evidencePlacement(0, 174, 220, "left", "source"),
          moderator: evidencePlacement(0, 174, 220, "moderator", "source"),
          right: evidencePlacement(0, 174, 220, "right", "source"),
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
      voiceLevels: {
        for: 1,
        moderator: 1,
        against: 1,
      },
      galleryVolume: 1,
      moderatorMicroScales: {
        wide: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
        left: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
        right: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
      },
      whodunnitCourt: {
        wideEvidenceTable: { x: 0, y: 0, scale: 100 },
        moderatorEvidenceTable: { x: 0, y: 0, scale: 100 },
        wideWitnessSilhouette: { x: 0, y: 0, scale: 100 },
        witness: { x: 0, y: 0, scale: 100 },
        prosecutionMini: { x: 0, y: 0, scale: 100 },
        defenseMini: { x: 0, y: 0, scale: 100 },
        witnessNameplate: { x: 0, y: 0, scale: 100 },
        witnessGlyph: { x: 0, y: 0, scale: 100 },
      },
      juryChamber: {
        members: Array.from({ length: 5 }, () => ({
          x: 0,
          y: 0,
          scale: 100,
        })),
        evidenceTable: { x: 0, y: 0, scale: 100 },
        votes: { x: 0, y: 0, scale: 100 },
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
        version: 14,
        main: {
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
            wide: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "wide",
              "exhibit",
            ),
            left: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "left",
              "exhibit",
            ),
            moderator: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "moderator",
              "exhibit",
            ),
            right: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "right",
              "exhibit",
            ),
          },
          source: {
            wide: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "wide",
              "source",
            ),
            left: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "left",
              "source",
            ),
            moderator: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "moderator",
              "source",
            ),
            right: evidencePlacement(
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
              DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
              DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
              "right",
              "source",
            ),
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
        voiceLevels: {
          for: 1,
          moderator: 1,
          against: 1,
        },
        galleryVolume: 1,
        moderatorMicroScales: {
          wide: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
          left: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
          right: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
        },
        whodunnitCourt: DEFAULT_DEBATE_STAGE_ALIGNMENT.whodunnitCourt,
        juryChamber: DEFAULT_DEBATE_STAGE_ALIGNMENT.juryChamber,
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
      "prism_debate_stage_alignment_v14:user-1",
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
    assert.deepEqual(migrated.main.moderator.bot, { x: 4, y: 3 });
    assert.deepEqual(migrated.main.moderator.nameplate, { x: 4, y: 3 });
    assert.deepEqual(migrated.main.moderator.glyph, { x: 0, y: 0 });
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
      version: 14,
      main: {
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
      // Legacy v7 stored one placement; V10 lifts it to every asset and camera.
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
    assert.deepEqual(
      readDebateStageAlignment(storage, "user-1").evidenceTable,
      {
        exhibit: {
          wide: evidencePlacement(8, -12, 115, "wide", "exhibit"),
          left: evidencePlacement(8, -12, 115, "left", "exhibit"),
          moderator: evidencePlacement(8, -12, 115, "moderator", "exhibit"),
          right: evidencePlacement(8, -12, 115, "right", "exhibit"),
        },
        source: {
          wide: evidencePlacement(8, -12, 115, "wide", "source"),
          left: evidencePlacement(8, -12, 115, "left", "source"),
          moderator: evidencePlacement(8, -12, 115, "moderator", "source"),
          right: evidencePlacement(8, -12, 115, "right", "source"),
        },
      },
    );
    assert.deepEqual(
      migrated.voiceLevels,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.voiceLevels,
    );
    assert.equal(
      migrated.galleryVolume,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.galleryVolume,
    );
    values.delete("prism_debate_stage_alignment_v14:user-1");
    values.delete("prism_debate_stage_alignment_v12:user-1");
    values.delete("prism_debate_stage_alignment_v11:user-1");
    values.delete("prism_debate_stage_alignment_v10:user-1");
    values.set(
      "prism_debate_stage_alignment_v9:user-1",
      JSON.stringify({
        version: 9,
        evidenceTable: {
          exhibit: {
            wide: { x: 12, y: -14, size: 110 },
            moderator: { x: -20, y: 16, size: 180 },
          },
          source: {
            wide: { x: 9, y: -11, size: 115 },
            moderator: { x: -24, y: 19, size: 190 },
          },
        },
      }),
    );
    const migratedV9 = readDebateStageAlignment(storage, "user-1");
    assert.deepEqual(migratedV9.evidenceTable.exhibit, {
      wide: evidencePlacement(12, -14, 110, "wide", "exhibit"),
      left: evidencePlacement(12, -14, 110, "left", "exhibit"),
      moderator: evidencePlacement(-20, 16, 180, "moderator", "exhibit"),
      right: evidencePlacement(12, -14, 110, "right", "exhibit"),
    });
    assert.deepEqual(migratedV9.evidenceTable.source, {
      wide: evidencePlacement(9, -11, 115, "wide", "source"),
      left: evidencePlacement(-24, 19, 190, "left", "source"),
      moderator: evidencePlacement(-24, 19, 190, "moderator", "source"),
      right: evidencePlacement(-24, 19, 190, "right", "source"),
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
      wide: evidencePlacement(11, -13, 105, "wide", "exhibit"),
      left: evidencePlacement(11, -13, 105, "left", "exhibit"),
      moderator: evidencePlacement(-22, 17, 175, "moderator", "exhibit"),
      right: evidencePlacement(11, -13, 105, "right", "exhibit"),
    });
    assert.deepEqual(migratedV8.evidenceTable.source, {
      wide: evidencePlacement(11, -13, 105, "wide", "source"),
      left: evidencePlacement(-22, 17, 175, "left", "source"),
      moderator: evidencePlacement(-22, 17, 175, "moderator", "source"),
      right: evidencePlacement(-22, 17, 175, "right", "source"),
    });
  });

  it("maps independent camera evidence placements into live forum CSS variables", () => {
    const alignment = normalizeDebateStageAlignment({
      version: 14,
      main: {
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
    assert.equal(
      style["--debate-moderator-micro-scale-wide"],
      `${DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT / 100}`,
    );
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
    assert.equal(style["--debate-left-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-left-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-left-evidence-scale"], "1.2");
    assert.equal(style["--debate-moderator-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-moderator-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-moderator-evidence-scale"], "1.2");
    assert.equal(style["--debate-right-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-right-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-right-evidence-scale"], "1.2");
    assert.equal(style["--debate-source-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-source-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-source-evidence-scale"], "1.2");
    assert.equal(style["--debate-left-source-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-left-source-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-left-source-evidence-scale"], "1.2");
    assert.equal(style["--debate-moderator-source-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-moderator-source-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-moderator-source-evidence-scale"], "1.2");
    assert.equal(style["--debate-right-source-evidence-offset-x"], "7.5%");
    assert.equal(style["--debate-right-source-evidence-offset-y"], "-9%");
    assert.equal(style["--debate-right-source-evidence-scale"], "1.2");
    assert.equal(style["--debate-evidence-shadow-cast-x"], "1px");
    assert.equal(style["--debate-evidence-shadow-cast-y"], "13px");
    assert.equal(style["--debate-evidence-shadow-blur"], "11px");
    assert.equal(style["--debate-evidence-shadow-opacity"], "0.88");
    assert.equal(style["--debate-evidence-shadow-floor-x"], "0px");
    assert.equal(style["--debate-evidence-shadow-floor-scale-x"], "1");
    assert.equal(style["--debate-left-evidence-shadow-cast-x"], "7px");
    assert.equal(style["--debate-right-evidence-shadow-cast-x"], "-7px");
    assert.equal(style["--debate-moderator-evidence-shadow-cast-y"], "15px");
    assert.equal(style["--debate-source-evidence-shadow-floor-scale-x"], "0.86");
    assert.equal(style["--debate-light-blend-mode-dark"], "overlay");
    assert.equal(style["--debate-light-blend-mode-light"], "screen");
    assert.equal(style["--debate-light-mask-opacity-dark"], "65%");
    assert.equal(style["--debate-light-mask-opacity-light"], "80%");
  });

  it("persists independent public-camera Moderator micro scales and defaults legacy data safely", () => {
    const tuned = updateDebateStageModeratorMicroScale(
      updateDebateStageModeratorMicroScale(
        DEFAULT_DEBATE_STAGE_ALIGNMENT,
        "wide",
        DEBATE_STAGE_MODERATOR_MICRO_SCALE_MAX + 20,
      ),
      "left",
      DEBATE_STAGE_MODERATOR_MICRO_SCALE_MIN - 20,
    );
    const independentlyTuned = updateDebateStageModeratorMicroScale(
      tuned,
      "right",
      145,
    );
    assert.deepEqual(independentlyTuned.moderatorMicroScales, {
      wide: DEBATE_STAGE_MODERATOR_MICRO_SCALE_MAX,
      left: DEBATE_STAGE_MODERATOR_MICRO_SCALE_MIN,
      right: 145,
    });
    assert.deepEqual(
      normalizeDebateStageAlignment({ version: 12 }).moderatorMicroScales,
      {
        wide: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
        left: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
        right: DEBATE_STAGE_MODERATOR_MICRO_SCALE_DEFAULT,
      },
    );
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    };
    writeDebateStageAlignment(storage, "moderator-scale", independentlyTuned);
    assert.deepEqual(
      readDebateStageAlignment(storage, "moderator-scale").moderatorMicroScales,
      independentlyTuned.moderatorMicroScales,
    );
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
      DEFAULT_DEBATE_STAGE_ALIGNMENT.main.moderator.bot,
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
    const copied = formatDebateStageAlignmentClipboard(updated);
    assert.match(
      copied,
      /^export const DEFAULT_DEBATE_STAGE_ALIGNMENT: DebateStageAlignmentV14 =/u,
    );
    assert.equal(
      JSON.parse(copied.slice(copied.indexOf("\n") + 1, -1)).moderator
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
      JSON.parse(
        formatDebateStageAlignmentClipboard(tuned).slice(
          formatDebateStageAlignmentClipboard(tuned).indexOf("\n") + 1,
          -1,
        ),
      ).lightBlendModes,
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
      JSON.parse(
        formatDebateStageAlignmentClipboard(tuned).slice(
          formatDebateStageAlignmentClipboard(tuned).indexOf("\n") + 1,
          -1,
        ),
      ).gavel,
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
      blurRadius: 0,
      shadow: defaultDebateStageEvidenceShadow("wide", "exhibit"),
    });
    assert.deepEqual(
      tunedWide.evidenceTable.exhibit.moderator,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.exhibit.moderator,
    );
    const tunedLeft = updateDebateStageEvidenceTable(
      tunedWide,
      "source",
      "left",
      { x: -40, y: 12, size: 150 },
    );
    assert.deepEqual(tunedLeft.evidenceTable.source.left, {
      x: -40,
      y: 12,
      size: 150,
      blurRadius: 0,
      shadow: defaultDebateStageEvidenceShadow("left", "source"),
    });
    const shadowed = updateDebateStageEvidenceTable(
      tunedLeft,
      "exhibit",
      "wide",
      {
        shadow: {
          castX: -12,
          castY: 22,
          blur: 18,
          opacity: 70,
          floorX: -4,
          floorWidth: 120,
        },
      },
    );
    assert.deepEqual(shadowed.evidenceTable.exhibit.wide.shadow, {
      castX: -12,
      castY: 22,
      blur: 18,
      opacity: 70,
      floorX: -4,
      floorWidth: 120,
    });
    assert.equal(
      (
        debateStageAlignmentStyle(shadowed) as Record<string, string>
      )["--debate-evidence-shadow-cast-x"],
      "-12px",
    );
    assert.equal(
      (
        debateStageAlignmentStyle(shadowed) as Record<string, string>
      )["--debate-evidence-shadow-floor-scale-x"],
      "1.2",
    );
    assert.deepEqual(
      tunedLeft.evidenceTable.source.right,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.source.right,
    );
    assert.deepEqual(
      tunedLeft.evidenceTable.source.moderator,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.source.moderator,
    );
    assert.deepEqual(
      tunedLeft.evidenceTable.source.wide,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.source.wide,
    );
    assert.deepEqual(
      tunedLeft.evidenceTable.exhibit,
      tunedWide.evidenceTable.exhibit,
    );
    assert.deepEqual(tunedLeft.gavel, DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel);
    assert.deepEqual(
      JSON.parse(
        formatDebateStageEvidenceTableClipboard(tunedLeft.evidenceTable),
      ),
      tunedLeft.evidenceTable,
    );
  });

  it("normalizes and updates the alignment voice mixer without drifting placements", () => {
    assert.equal(normalizeDebateStageVoiceLevel(9), 1.25);
    assert.equal(normalizeDebateStageVoiceLevel(-1), 0);
    assert.equal(normalizeDebateStageGalleryVolume(undefined), 1);
    const tuned = updateDebateStageVoiceLevel(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "for",
      0.7,
    );
    const withGallery = updateDebateStageGalleryVolume(tuned, 0.4);
    assert.equal(debateStageVoiceLevelForRole(withGallery.voiceLevels, "for"), 0.7);
    assert.equal(
      debateStageVoiceLevelForRole(withGallery.voiceLevels, "against"),
      1,
    );
    assert.equal(withGallery.galleryVolume, 0.4);
    assert.deepEqual(withGallery.main, DEFAULT_DEBATE_STAGE_ALIGNMENT.main);
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    writeDebateStageAlignment(storage, "mixer-user", withGallery);
    assert.ok(values.has("prism_debate_stage_alignment_v14:mixer-user"));
    assert.deepEqual(
      readDebateStageAlignment(storage, "mixer-user").voiceLevels,
      withGallery.voiceLevels,
    );
    assert.equal(
      readDebateStageAlignment(storage, "mixer-user").galleryVolume,
      0.4,
    );
  });
});

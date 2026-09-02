import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS,
  DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS,
  debateMysteryV2ExamineGridCellIndexes,
  resolveDebateMysteryV2Lens,
} from "./debateMysteryV2Lens.ts";

const experience = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./debateMysteryV2.module.css", import.meta.url),
  "utf8",
);

test("uses one coarse, flat examination grid for Mosaic and Upgraded room art", () => {
  assert.equal(DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS, 24);
  assert.equal(DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS, 15);
  assert.match(styles, /--examine-grid-cell-width/u);
  assert.match(styles, /--examine-grid-cell-height/u);
  assert.match(experience, /className=\{styles\.examinationGrid\} data-art-style=\{currentRoomArtStyle\}/u);
  assert.doesNotMatch(experience, /currentRoomArtStyle === "mosaic" \? <div className=\{styles\.examinationGrid\}/u);
  assert.match(styles, /\.examinationGrid\s*\{[\s\S]*transform:\s*none/u);
  assert.match(styles, /\.examinationGrid i\s*\{[\s\S]*filter:\s*none;[\s\S]*transform:\s*none/u);
  assert.doesNotMatch(styles, /prismGlintSweep|titleDoorPrismGlint/u);
});

test("renders only bounded illuminated examination cells instead of the complete lattice", () => {
  const hotspot = [{
    id: "target",
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    unlocked: true,
    examined: false,
  }];
  const cells = debateMysteryV2ExamineGridCellIndexes(
    resolveDebateMysteryV2Lens(50, 50, hotspot),
    hotspot,
  );
  assert.ok(cells.length > 1);
  assert.ok(cells.length < DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS * DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS);
  assert.match(experience, /\[\.\.\.examinationIlluminatedCells\]\.map/u);
  assert.match(experience, /column \/ DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS/u);
  assert.match(experience, /row \/ DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS/u);
});

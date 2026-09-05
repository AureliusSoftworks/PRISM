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

test("hides the fine Mosaic presentation grid while Examine is active", () => {
  assert.match(
    experience,
    /const currentRoomMosaicGrid = command === "examine" \? "hidden" : "visible";/u,
  );
  assert.match(
    experience,
    /style: "mosaic",[\s\S]{0,100}mosaicGrid: currentRoomMosaicGrid/u,
  );
  assert.match(
    experience,
    /whodunnitSavedRoomArtUrl\(currentRoom\.imageId, "mosaic", currentRoomMosaicGrid\)/u,
  );
});

test("resolves each eligible lens position to exactly one cell", () => {
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
  assert.deepEqual(cells, [180]);
  assert.match(experience, /\[\.\.\.examinationIlluminatedCells\]\.map/u);
  assert.match(experience, /column \/ DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS/u);
  assert.match(experience, /row \/ DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS/u);
});

test("keeps the single illuminated cell directly beneath the lens", () => {
  const broadTarget = [{
    id: "broad",
    polygon: [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
    ],
    unlocked: true,
    examined: false,
  }];
  const upperLeftCell = debateMysteryV2ExamineGridCellIndexes(
    resolveDebateMysteryV2Lens(42, 42, broadTarget),
    broadTarget,
  );
  const lowerRightCell = debateMysteryV2ExamineGridCellIndexes(
    resolveDebateMysteryV2Lens(58, 58, broadTarget),
    broadTarget,
  );
  assert.deepEqual(upperLeftCell, [154]);
  assert.deepEqual(lowerRightCell, [205]);
  assert.equal(upperLeftCell.length, 1);
  assert.equal(lowerRightCell.length, 1);
});

test("keeps the hovered cell illuminated outside hidden hotspot boundaries", () => {
  const hotspot = [{
    id: "target",
    polygon: [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
    ],
    unlocked: true,
    examined: false,
  }];
  const firstBlankPosition = resolveDebateMysteryV2Lens(10, 10, hotspot);
  const secondBlankPosition = resolveDebateMysteryV2Lens(12, 12, hotspot);
  assert.equal(firstBlankPosition.hotspotId, null);
  assert.equal(secondBlankPosition.hotspotId, null);
  assert.deepEqual(
    debateMysteryV2ExamineGridCellIndexes(firstBlankPosition, hotspot),
    [26],
  );
  assert.deepEqual(
    debateMysteryV2ExamineGridCellIndexes(secondBlankPosition, hotspot),
    [26],
  );
  assert.match(
    experience,
    /const examinationGridTrackingActive = examinationPointerInside \|\| examinationKeyboardFocusActive/u,
  );
  assert.match(
    experience,
    /lensActive && currentRoom && examinationGridTrackingActive/u,
  );
  assert.match(
    experience,
    /const handleRoomPointerLeave = \(\): void => \{[\s\S]*setExaminationPointerInside\(false\)/u,
  );
});

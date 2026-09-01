import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS,
  DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS,
  debateMysteryV2LensMosaicCellIndexes,
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

test("matches the investigation lattice one-to-one with the Mosaic tessera contract", () => {
  assert.equal(DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS, 320);
  assert.equal(DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS, 180);
  assert.match(styles, /--mosaic-lens-cell-width/u);
  assert.match(styles, /--mosaic-lens-cell-height/u);
  assert.doesNotMatch(styles, /repeat\(24, 1fr\)/u);
  assert.doesNotMatch(experience, /length:\s*24 \* 15/u);
});

test("renders only bounded illuminated Mosaic cells instead of the complete lattice", () => {
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
  const cells = debateMysteryV2LensMosaicCellIndexes(
    resolveDebateMysteryV2Lens(50, 50, hotspot),
    hotspot,
  );
  assert.ok(cells.length > 100);
  assert.ok(cells.length < 1_000);
  assert.match(experience, /\[\.\.\.mosaicIlluminatedCells\]\.map/u);
  assert.match(experience, /column \/ DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS/u);
  assert.match(experience, /row \/ DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS/u);
});

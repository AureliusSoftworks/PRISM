import assert from "node:assert/strict";
import test from "node:test";
import {
  debateMysteryV2ExamineGridCellIndexes,
  debateMysteryV2HotspotAccessiblePoint,
  debateMysteryV2ImagePointFromClientPoint,
  debateMysteryV2RoomComplete,
  resolveDebateMysteryV2Lens,
} from "./debateMysteryV2Lens.ts";

const box = (id: string, min: number, max: number, examined = false) => ({ id, examined, unlocked: true, polygon: [{ x: min, y: min }, { x: max, y: min }, { x: max, y: max }, { x: min, y: max }] });

test("rooms with no meaningful targets do not require inspecting blank space", () => {
  assert.equal(debateMysteryV2RoomComplete([]), true);
  assert.equal(debateMysteryV2RoomComplete([box("clue", 20, 40)]), false);
});

test("maps examination input through the fitted image and ignores letterbox space", () => {
  const surface = { left: 100, top: 50, width: 800, height: 450 };
  assert.deepEqual(
    debateMysteryV2ImagePointFromClientPoint(
      { clientX: 500, clientY: 275 },
      surface,
    ),
    { x: 50, y: 50 },
  );
  assert.equal(
    debateMysteryV2ImagePointFromClientPoint(
      { clientX: 500, clientY: 25 },
      surface,
    ),
    null,
  );
});

test("examined details shield broad overlaps without hiding their own unexamined descendants", () => {
  const hotspots = [box("ambient", 0, 100), box("reviewed", 20, 80, true), box("detail", 45, 55)];
  assert.equal(resolveDebateMysteryV2Lens(30, 30, hotspots).hotspotId, null);
  assert.equal(resolveDebateMysteryV2Lens(50, 50, hotspots).hotspotId, "detail");
  assert.equal(resolveDebateMysteryV2Lens(10, 10, hotspots).hotspotId, "ambient");
  assert.deepEqual(debateMysteryV2ExamineGridCellIndexes({ x: 30, y: 30, hotspotId: "ambient" }, hotspots), []);
  assert.equal(debateMysteryV2HotspotAccessiblePoint(hotspots[1], hotspots), null);
  for (const hotspot of [hotspots[0], hotspots[2]]) {
    const point = debateMysteryV2HotspotAccessiblePoint(hotspot, hotspots);
    assert.ok(point);
    assert.equal(resolveDebateMysteryV2Lens(point.x, point.y, hotspots).hotspotId, hotspot.id);
  }
});

test("locked descendants do not steal eligible parent focus and equal-size targets are not broader fallthrough", () => {
  const hotspots = [box("old", 20, 80, true), box("new", 20, 80), { ...box("locked", 30, 70), unlocked: false }];
  assert.equal(resolveDebateMysteryV2Lens(50, 50, hotspots).hotspotId, "new");
});

test("keyboard can reach a thin valid strip between reviewed overlaps that a probe grid misses", () => {
  const rect = (id: string, left: number, right: number, examined = false) => ({
    id, examined, unlocked: true,
    polygon: [{ x: left, y: 0 }, { x: right, y: 0 }, { x: right, y: 100 }, { x: left, y: 100 }],
  });
  const hotspots = [rect("scene", 0, 100), rect("left", 0, 40.1, true), rect("right", 40.2, 100, true)];
  const point = debateMysteryV2HotspotAccessiblePoint(hotspots[0], hotspots);
  assert.ok(point);
  assert.ok(point.x > 40.1 && point.x < 40.2);
  assert.equal(resolveDebateMysteryV2Lens(point.x, point.y, hotspots).hotspotId, "scene");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  prismMenuTypeaheadMatch,
  resolvePrismMenuPosition,
} from "./prismMenuModel.ts";

const viewport = {
  top: 0,
  right: 1000,
  bottom: 700,
  left: 0,
  width: 1000,
  height: 700,
};

test("PRISM menu flips above a pointer when the lower boundary would collide", () => {
  const result = resolvePrismMenuPosition({
    anchor: { top: 660, right: 500, bottom: 660, left: 500, width: 0, height: 0 },
    menuWidth: 220,
    menuHeight: 240,
    boundary: viewport,
    placement: "bottom-start",
  });
  assert.equal(result.placement, "top-start");
  assert.equal(result.top, 414);
});

test("PRISM menu shifts inside the viewport and respects a composer boundary", () => {
  const result = resolvePrismMenuPosition({
    anchor: { top: 480, right: 995, bottom: 480, left: 995, width: 0, height: 0 },
    menuWidth: 260,
    menuHeight: 300,
    boundary: { ...viewport, bottom: 540, height: 540 },
    placement: "bottom-start",
  });
  assert.equal(result.left, 732);
  assert.ok(result.top >= 8);
  assert.equal(result.maxHeight, 524);
});

test("PRISM menu typeahead wraps from the current item", () => {
  assert.equal(prismMenuTypeaheadMatch(["Copy", "Delete", "Duplicate"], "d", 2), 1);
  assert.equal(prismMenuTypeaheadMatch(["Copy", "Delete"], "z", 0), -1);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  modelPickerStepValue,
  modelPickerWheelDirection,
} from "./modelPickerControl.ts";

test("steps through model candidates and clamps at both ends", () => {
  const values = ["auto", "local-a", "online-b"];
  assert.equal(modelPickerStepValue(values, "auto", 1), "local-a");
  assert.equal(modelPickerStepValue(values, "local-a", 1), "online-b");
  assert.equal(modelPickerStepValue(values, "online-b", 1), "online-b");
  assert.equal(modelPickerStepValue(values, "auto", -1), "auto");
});

test("starts unknown candidates in the direction of travel", () => {
  const values = ["auto", "local-a", "online-b"];
  assert.equal(modelPickerStepValue(values, null, 1), "auto");
  assert.equal(modelPickerStepValue(values, "missing", -1), "online-b");
  assert.equal(modelPickerStepValue([], null, 1), null);
});

test("uses the dominant wheel axis to choose a model step direction", () => {
  assert.equal(modelPickerWheelDirection(0, -12), -1);
  assert.equal(modelPickerWheelDirection(0, 12), 1);
  assert.equal(modelPickerWheelDirection(12, 1), 1);
  assert.equal(modelPickerWheelDirection(0, 0), 0);
});

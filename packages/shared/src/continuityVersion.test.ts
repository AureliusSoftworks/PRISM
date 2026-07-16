import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTINUITY_FRAMEWORK,
  continuityFrameworkVersionLabel,
} from "./continuityVersion.ts";

test("Continuity begins as an independently versioned planned framework", () => {
  assert.deepEqual(CONTINUITY_FRAMEWORK, {
    name: "Continuity",
    version: "0.0",
    status: "planned",
  });
  assert.equal(continuityFrameworkVersionLabel(), "v0.0");
});

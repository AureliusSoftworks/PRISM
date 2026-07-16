import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTINUITY_FRAMEWORK,
  CONTINUITY_INTERNAL_VERSIONS,
  continuityFrameworkVersionLabel,
  currentContinuityProducerVersions,
} from "./continuityVersion.ts";

test("Continuity begins as an independently versioned planned framework", () => {
  assert.deepEqual(CONTINUITY_FRAMEWORK, {
    name: "Continuity",
    version: "0.0",
    status: "planned",
  });
  assert.equal(continuityFrameworkVersionLabel(), "v0.0");
});

test("Continuity persists explicit internal producer versions", () => {
  assert.deepEqual(currentContinuityProducerVersions(), {
    continuity: "0.0",
    schema: 1,
    extraction: 1,
    reconciliation: 1,
    contextCompilation: 1,
    recap: 2,
    atmosphere: 1,
  });
  for (const version of Object.values(CONTINUITY_INTERNAL_VERSIONS)) {
    assert.ok(Number.isInteger(version) && version > 0);
  }
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { debateEvidencePropRotationDeg } from "./debateEvidenceProp.ts";

describe("debateEvidenceProp", () => {
  it("returns a stable non-zero tilt from an evidence id", () => {
    const first = debateEvidencePropRotationDeg("source-abc");
    const second = debateEvidencePropRotationDeg("source-abc");
    assert.equal(first, second);
    assert.ok(Math.abs(first) >= 3.5);
    assert.ok(Math.abs(first) <= 14);
  });

  it("varies tilt across different evidence ids", () => {
    const a = debateEvidencePropRotationDeg("source-one");
    const b = debateEvidencePropRotationDeg("source-two");
    assert.notEqual(a, b);
  });
});

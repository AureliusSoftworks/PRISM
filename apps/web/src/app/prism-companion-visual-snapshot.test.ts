import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPrismCompanionVisualServerSnapshot,
  getPrismCompanionVisualSnapshot,
  publishPrismCompanionVisualSnapshot,
  subscribePrismCompanionVisualSnapshot,
} from "./prismCompanionVisualSnapshot.ts";

describe("Prism companion visual handoff snapshot", () => {
  it("keeps a stable server snapshot for hydration", () => {
    assert.strictEqual(
      getPrismCompanionVisualServerSnapshot(),
      getPrismCompanionVisualServerSnapshot(),
    );
  });

  it("publishes a clamped presentation-only position", () => {
    let publications = 0;
    const unsubscribe = subscribePrismCompanionVisualSnapshot(() => {
      publications += 1;
    });
    publishPrismCompanionVisualSnapshot({
      position: { x: 1.2, y: -0.1 },
      available: true,
    });
    assert.deepEqual(getPrismCompanionVisualSnapshot(), {
      position: { x: 1, y: 0 },
      available: true,
    });
    assert.equal(publications, 1);
    unsubscribe();
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPrismCompanionViewRequestServerSnapshot,
  getPrismCompanionViewRequestSnapshot,
  requestPrismCompanionView,
  resetPrismCompanionViewRequestsForTests,
  subscribePrismCompanionViewRequests,
} from "./prismCompanionViews.ts";

describe("Prism companion view requests", () => {
  it("publishes repeatable view requests and keeps hydration stable", () => {
    resetPrismCompanionViewRequestsForTests();
    let publications = 0;
    const unsubscribe = subscribePrismCompanionViewRequests(() => {
      publications += 1;
    });
    requestPrismCompanionView("notes");
    requestPrismCompanionView("notes");
    assert.deepEqual(getPrismCompanionViewRequestSnapshot(), {
      view: "notes",
      requestId: 2,
    });
    assert.equal(publications, 2);
    assert.strictEqual(
      getPrismCompanionViewRequestServerSnapshot(),
      getPrismCompanionViewRequestServerSnapshot(),
    );
    unsubscribe();
  });
});

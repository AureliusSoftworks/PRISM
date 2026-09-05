import assert from "node:assert/strict";
import test from "node:test";
import { cleanMysteryItemDescriptionV1 } from "../debate-mystery-item-repair.ts";

test("collapses a title word echoed as an adjective and drops boilerplate and exact repeats", () => {
  assert.equal(
    cleanMysteryItemDescriptionV1(
      "A plain stained glass fragment recovered for examination. The stained Stained Glass Fragment records the private conflict. The stained Stained Glass Fragment records the private conflict. PRISM's bundled fallback artwork stands in for it.",
    ),
    "A plain stained glass fragment recovered for examination. The Stained Glass Fragment records the private conflict.",
  );
  assert.equal(
    cleanMysteryItemDescriptionV1("The silvered Silver Key carries a trace. It opens a lock."),
    "The silvered Silver Key carries a trace. It opens a lock.",
    "different words stay, even when one begins the other",
  );
});

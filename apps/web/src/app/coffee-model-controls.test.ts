import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_AUTO_MODEL_LABEL,
  COFFEE_AUTO_MODEL_META,
  coffeeModelPickerAriaLabel,
} from "./coffee-model-controls.ts";

describe("Coffee model controls", () => {
  it("describes contextual Auto inside the selected response lane", () => {
    assert.equal(COFFEE_AUTO_MODEL_LABEL, "Auto");
    assert.equal(
      COFFEE_AUTO_MODEL_META,
      "Picks model & effort",
    );
    assert.equal(
      coffeeModelPickerAriaLabel("online"),
      "Coffee session model for online replies. Auto lets Prism choose the model and Effort contextually.",
    );
    assert.equal(
      coffeeModelPickerAriaLabel("auto"),
      "Coffee session model. Auto lets Prism choose the model and Effort inside the selected privacy lane.",
    );
  });
});

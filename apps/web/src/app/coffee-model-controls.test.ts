import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_ACCOUNT_DEFAULT_MODEL_LABEL,
  COFFEE_ACCOUNT_DEFAULT_MODEL_META,
  coffeeModelPickerAriaLabel,
} from "./coffee-model-controls.ts";

describe("Coffee model controls", () => {
  it("distinguishes the account model from automatic response routing", () => {
    assert.equal(COFFEE_ACCOUNT_DEFAULT_MODEL_LABEL, "Account default");
    assert.equal(
      COFFEE_ACCOUNT_DEFAULT_MODEL_META,
      "uses the model saved in Settings",
    );
    assert.equal(
      coffeeModelPickerAriaLabel("online"),
      "Coffee session model for online replies. Account default uses the model saved in Settings.",
    );
    assert.equal(
      coffeeModelPickerAriaLabel("auto"),
      "Coffee session primary model for Auto replies. Includes all local and online models; Account default uses the model saved in Settings.",
    );
  });
});

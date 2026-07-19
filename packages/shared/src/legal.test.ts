import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  PRISM_EULA_ACCEPTANCE_SNAPSHOT,
  PRISM_EULA_CONTENT_SHA256,
  PRISM_EULA_MARKDOWN,
  PRISM_EULA_MINIMUM_AGE,
  PRISM_EULA_VERSION,
  PRISM_MODEL_VARIABILITY_NOTICE,
} from "./legal.ts";

describe("PRISM signup agreement", () => {
  it("pins versioned agreement copy to an exact content hash", () => {
    assert.match(PRISM_EULA_VERSION, /^\d{4}-\d{2}-\d{2}$/u);
    assert.equal(
      createHash("sha256").update(PRISM_EULA_ACCEPTANCE_SNAPSHOT).digest("hex"),
      PRISM_EULA_CONTENT_SHA256,
    );
  });

  it("states the product-critical AI limitations plainly", () => {
    assert.equal(PRISM_EULA_MINIMUM_AGE, 18);
    assert.match(PRISM_MODEL_VARIABILITY_NOTICE, /Results vary by model/u);
    assert.match(PRISM_MODEL_VARIABILITY_NOTICE, /Every PRISM experience/u);
    assert.match(PRISM_EULA_MARKDOWN, /characters are software, not human beings/u);
    assert.match(PRISM_EULA_MARKDOWN, /not an emergency or crisis service/u);
    assert.match(PRISM_EULA_MARKDOWN, /TO THE FULLEST EXTENT PERMITTED BY LAW/u);
    assert.match(PRISM_EULA_MARKDOWN, /US\$100/u);
  });
});

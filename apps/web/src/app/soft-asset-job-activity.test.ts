import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./SoftAssetJobActivity.tsx", import.meta.url),
  "utf8",
);

describe("global soft asset activity", () => {
  it("rehydrates and polls jobs independently of the current applet", () => {
    assert.match(source, /request<\{ jobs: PrismSoftAssetJobSnapshot\[\] \}>\(/u);
    assert.match(source, /"\/api\/soft-asset-jobs"/u);
    assert.match(source, /window\.setInterval\(\(\) => void refresh\(\), 1_500\)/u);
    assert.match(source, /announcePrismSoftAssetJob\(job\)/u);
    assert.match(source, /registerPrismSoftSynthesisJobs\("durable-soft-assets"/u);
  });

  it("keeps completion, cancellation, and destination navigation available", () => {
    assert.match(source, /\/api\/soft-asset-jobs\/\$\{encodeURIComponent\(job\.id\)\}\/cancel/u);
    assert.match(source, /method: "DELETE"/u);
    assert.match(source, />\s*View Debate\s*</u);
    assert.match(source, /Already attached|already attached|already attached/u);
  });
});

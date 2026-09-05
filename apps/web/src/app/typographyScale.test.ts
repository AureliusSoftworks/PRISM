import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPrismTypographyScaleToDocument,
  PRISM_TYPOGRAPHY_SCALE_LABELS,
  prismTypographyScalePreviewPx,
} from "./typographyScale.ts";

describe("account typography scale", () => {
  it("applies the normalized preset to the document root", () => {
    const target = { documentElement: { dataset: {} as Record<string, string> } };
    assert.equal(applyPrismTypographyScaleToDocument(target, "large"), "large");
    assert.equal(target.documentElement.dataset.prismTypographyScale, "large");
    assert.equal(
      applyPrismTypographyScaleToDocument(target, "unbounded"),
      "standard",
    );
    assert.equal(target.documentElement.dataset.prismTypographyScale, "standard");
  });

  it("keeps five ordered preview sizes and identifies Standard as current", () => {
    assert.deepEqual(
      ["compact", "small", "standard", "large", "extra-large"].map(
        (value) =>
          prismTypographyScalePreviewPx(
            value as keyof typeof PRISM_TYPOGRAPHY_SCALE_LABELS,
          ),
      ),
      [14, 15, 16, 17, 18],
    );
    assert.match(
      PRISM_TYPOGRAPHY_SCALE_LABELS.standard.detail,
      /current size/i,
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  useViewportAssetSrc,
  viewportAssetSrcShouldStayLoaded,
} from "./useViewportAssetSrc.ts";

describe("useViewportAssetSrc", () => {
  it("exports a viewport unload helper", () => {
    assert.equal(typeof useViewportAssetSrc, "function");
  });

  it("keeps src when intersecting", () => {
    assert.equal(
      viewportAssetSrcShouldStayLoaded({
        isIntersecting: true,
        width: 120,
        height: 80,
      }),
      true,
    );
  });

  it("unloads only when clearly off-screen with a real layout box", () => {
    assert.equal(
      viewportAssetSrcShouldStayLoaded({
        isIntersecting: false,
        width: 120,
        height: 80,
      }),
      false,
    );
  });

  it("never unloads zero-size boxes so library thumbs cannot stick blank", () => {
    assert.equal(
      viewportAssetSrcShouldStayLoaded({
        isIntersecting: false,
        width: 0,
        height: 0,
      }),
      true,
    );
    assert.equal(
      viewportAssetSrcShouldStayLoaded({
        isIntersecting: false,
        width: 100,
        height: 0,
      }),
      true,
    );
  });
});

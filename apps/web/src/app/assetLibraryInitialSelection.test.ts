import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageAssetSet } from "@localai/shared";
import { resolveAssetLibraryInitialSelection } from "./assetLibraryInitialSelection.ts";

function asset(id: string): ImageAssetSet {
  return { id } as ImageAssetSet;
}

describe("asset library initial selection", () => {
  it("uses exact lookup when the requested asset is beyond the visible page", async () => {
    const lookedUp: string[] = [];
    const selected = await resolveAssetLibraryInitialSelection({
      assets: [asset("newer-asset")],
      initialAssetId: "older-asset",
      loadExact: async (assetId) => {
        lookedUp.push(assetId);
        return asset(assetId);
      },
    });

    assert.equal(selected?.id, "older-asset");
    assert.deepEqual(lookedUp, ["older-asset"]);
  });

  it("uses the visible asset without an unnecessary exact lookup", async () => {
    let lookupCount = 0;
    const visible = asset("visible-asset");
    const selected = await resolveAssetLibraryInitialSelection({
      assets: [visible],
      initialAssetId: visible.id,
      loadExact: async () => {
        lookupCount += 1;
        return null;
      },
    });

    assert.equal(selected, visible);
    assert.equal(lookupCount, 0);
  });

  it("rejects a mismatched exact response", async () => {
    const selected = await resolveAssetLibraryInitialSelection({
      assets: [],
      initialAssetId: "expected-asset",
      loadExact: async () => asset("wrong-asset"),
    });

    assert.equal(selected, null);
  });
});

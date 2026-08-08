import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  imageAssetKindForImage,
  imageAssetMemberRoleForImage,
  isImageAssetKind,
  isImageAssetStorageTier,
  IMAGE_ASSET_SMART_TAG_MAX,
  IMAGE_ASSET_SMART_TAG_MIN,
} from "./imageAssets.ts";

describe("image asset classification", () => {
  it("classifies every reusable image surface by exact kind", () => {
    assert.equal(
      imageAssetKindForImage({ origin: "images_panel", purpose: "gallery" }),
      "general_image",
    );
    assert.equal(
      imageAssetKindForImage({ origin: "debate", purpose: "debate_exhibit" }),
      "debate_exhibit",
    );
    assert.equal(
      imageAssetKindForImage({ origin: "botcast", purpose: "signal_studio_day" }),
      "signal_studio",
    );
    assert.equal(
      imageAssetKindForImage({ origin: "slate_cover", purpose: "slate_cover" }),
      "slate_cover",
    );
    assert.equal(
      imageAssetKindForImage({ origin: "zen_wallpaper", purpose: "wallpaper" }),
      "zen_atmosphere",
    );
  });

  it("uses a positive general-image classification", () => {
    assert.equal(
      imageAssetKindForImage({ origin: "botcast", purpose: "gallery" }),
      null,
    );
    assert.equal(
      imageAssetKindForImage({
        origin: "slate_visual_bible",
        purpose: "slate_visual_bible",
      }),
      "slate_visual_study",
    );
    assert.equal(
      imageAssetKindForImage({
        origin: "coffee_bar",
        purpose: "coffee_drink_surface",
      }),
      null,
    );
  });

  it("assigns Signal studio roles without confusing variants", () => {
    assert.equal(
      imageAssetMemberRoleForImage({ purpose: "signal_studio_day" }),
      "light",
    );
    assert.equal(
      imageAssetMemberRoleForImage({ purpose: "signal_studio_night" }),
      "dark",
    );
    assert.equal(imageAssetMemberRoleForImage({ purpose: "signal_logo" }), "primary");
    assert.equal(isImageAssetKind("signal_studio"), true);
    assert.equal(isImageAssetKind("signal_studio_day"), false);
    assert.equal(isImageAssetStorageTier("hot"), true);
    assert.equal(isImageAssetStorageTier("cold"), true);
    assert.equal(isImageAssetStorageTier("warm"), false);
    assert.equal(IMAGE_ASSET_SMART_TAG_MIN, 3);
    assert.equal(IMAGE_ASSET_SMART_TAG_MAX, 6);
  });
});

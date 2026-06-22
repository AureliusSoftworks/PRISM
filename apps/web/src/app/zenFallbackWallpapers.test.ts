import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ZEN_FALLBACK_WALLPAPER_ASSETS,
  resolveZenFallbackWallpaperVariant,
  shouldShowZenFallbackWallpaper,
} from "./zenFallbackWallpapers.ts";

describe("resolveZenFallbackWallpaperVariant", () => {
  it("returns a stable preset and flips for the same seed", () => {
    const first = resolveZenFallbackWallpaperVariant("conversation-1:bot-a");
    const second = resolveZenFallbackWallpaperVariant("conversation-1:bot-a");

    assert.deepEqual(second, first);
    assert.ok(first);
    assert.ok(ZEN_FALLBACK_WALLPAPER_ASSETS.some((asset) => asset === first.src));
    assert.equal(typeof first.flipX, "boolean");
    assert.equal(typeof first.flipY, "boolean");
  });

  it("derives horizontal and vertical flips independently", () => {
    const variants = Array.from({ length: 24 }, (_, index) =>
      resolveZenFallbackWallpaperVariant(`seed-${index}`)
    ).filter((variant): variant is NonNullable<typeof variant> => variant !== null);

    assert.ok(variants.some((variant) => variant.flipX !== variant.flipY));
    assert.ok(variants.some((variant) => variant.flipX));
    assert.ok(variants.some((variant) => variant.flipY));
  });
});

describe("shouldShowZenFallbackWallpaper", () => {
  const baseline = {
    chatSurface: true,
    hasRememberedWallpaper: false,
    atmosphereTimelineLength: 0,
  };

  it("shows the fallback whenever Zen has no remembered or generated Atmosphere", () => {
    assert.equal(shouldShowZenFallbackWallpaper(baseline), true);
  });

  it("does not wait for remembered Atmosphere lookup state", () => {
    assert.equal(
      shouldShowZenFallbackWallpaper({
        ...baseline,
      }),
      true
    );
  });

  it("does not show while remembered or generated Atmosphere data is present", () => {
    assert.equal(
      shouldShowZenFallbackWallpaper({ ...baseline, hasRememberedWallpaper: true }),
      false
    );
    assert.equal(
      shouldShowZenFallbackWallpaper({ ...baseline, atmosphereTimelineLength: 1 }),
      false
    );
  });

  it("does not show outside Zen chat surfaces", () => {
    assert.equal(
      shouldShowZenFallbackWallpaper({
        ...baseline,
        chatSurface: false,
      }),
      false
    );
  });
});

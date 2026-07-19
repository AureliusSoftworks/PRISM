import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveBotMarketplaceGroupAtmosphere } from "./botMarketplaceGroupAtmosphere.ts";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../public/bot-marketplace/manifest.json", import.meta.url),
    "utf8",
  ),
) as { themes: Array<{ id: string }> };

describe("marketplace group atmosphere presets", () => {
  it("provides a stable bundled wallpaper for every marketplace theme", () => {
    for (const theme of manifest.themes) {
      const first = resolveBotMarketplaceGroupAtmosphere(theme.id);
      const second = resolveBotMarketplaceGroupAtmosphere(theme.id);
      assert.deepEqual(second, first);
      assert.ok(first);
      assert.match(first.src, /^\/zen-fallback-wallpapers\/[a-z-]+\.png$/u);
    }
  });

  it("fails closed for unknown and blank theme ids", () => {
    assert.equal(resolveBotMarketplaceGroupAtmosphere("future-pack"), null);
    assert.equal(resolveBotMarketplaceGroupAtmosphere(" "), null);
    assert.equal(resolveBotMarketplaceGroupAtmosphere(null), null);
  });
});

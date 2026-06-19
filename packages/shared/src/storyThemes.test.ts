import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRISM_DEFAULT_STORY_THEME,
  PRISM_DEFAULT_STORY_THEME_ID,
  STORY_ITEM_GLYPH_CATEGORIES,
  STORY_SPRITE_POSES,
  getBuiltinStoryThemes,
  getStoryThemeById,
  isBuiltinStoryThemeAsset,
  type StoryAssetKind,
} from "./storyThemes.ts";

const REQUIRED_ASSET_KINDS: readonly StoryAssetKind[] = [
  "sprite_reference",
  "sprite_fallback",
  "background_reference",
  "cutscene_reference",
  "projection_fallback",
  "map_style_reference",
];

describe("storyThemes", () => {
  it("exposes the immutable prism_default builtin theme", () => {
    const themes = getBuiltinStoryThemes();
    assert.equal(themes.length, 1);
    assert.equal(themes[0]?.id, PRISM_DEFAULT_STORY_THEME_ID);
    assert.equal(getStoryThemeById(PRISM_DEFAULT_STORY_THEME_ID), PRISM_DEFAULT_STORY_THEME);
    assert.equal(getStoryThemeById(" missing "), undefined);

    assert.equal(PRISM_DEFAULT_STORY_THEME.builtin, true);
    assert.equal(PRISM_DEFAULT_STORY_THEME.immutable, true);
    assert.equal(PRISM_DEFAULT_STORY_THEME.deletable, false);
    assert.equal(PRISM_DEFAULT_STORY_THEME.editable, false);
    assert.equal(PRISM_DEFAULT_STORY_THEME.exportable, false);
  });

  it("keeps bundled asset paths unique, stable, and immutable", () => {
    const urls = new Set<string>();
    const ids = new Set<string>();

    for (const asset of PRISM_DEFAULT_STORY_THEME.assets) {
      assert.equal(asset.themeId, PRISM_DEFAULT_STORY_THEME_ID);
      assert.equal(asset.immutable, true);
      assert.equal(asset.deletable, false);
      assert.equal(asset.editable, false);
      assert.equal(asset.exportable, false);
      assert.equal(asset.format, "png");
      assert.match(asset.url, /^\/story-themes\/prism_default\/[a-z0-9_]+\.png$/);
      assert.equal(ids.has(asset.id), false, `duplicate asset id: ${asset.id}`);
      assert.equal(urls.has(asset.url), false, `duplicate asset url: ${asset.url}`);
      assert.equal(isBuiltinStoryThemeAsset(asset), true);
      ids.add(asset.id);
      urls.add(asset.url);
    }

    assert.equal(isBuiltinStoryThemeAsset({ themeId: "user_theme", id: "sprite_reference_sheet" }), false);
  });

  it("includes required asset kinds, sprite poses, and glyph categories", () => {
    const kinds = new Set(PRISM_DEFAULT_STORY_THEME.assets.map((asset) => asset.kind));
    for (const kind of REQUIRED_ASSET_KINDS) {
      assert.equal(kinds.has(kind), true, `missing asset kind: ${kind}`);
    }

    assert.deepEqual(PRISM_DEFAULT_STORY_THEME.sprite.poses, STORY_SPRITE_POSES);
    assert.deepEqual(PRISM_DEFAULT_STORY_THEME.itemGlyphCategories, STORY_ITEM_GLYPH_CATEGORIES);
    assert.equal(PRISM_DEFAULT_STORY_THEME.sprite.blankFaceRequired, true);
    assert.equal(PRISM_DEFAULT_STORY_THEME.sprite.asciiFaceOverlay, true);

    const spriteReference = PRISM_DEFAULT_STORY_THEME.assets.find(
      (asset) => asset.kind === "sprite_reference"
    );
    assert.deepEqual(spriteReference?.spritePoses, STORY_SPRITE_POSES);
    assert.equal(PRISM_DEFAULT_STORY_THEME.sprite.poses.includes("action"), true);
    assert.equal(PRISM_DEFAULT_STORY_THEME.sprite.poses.includes("folded" as never), false);
    assert.equal(PRISM_DEFAULT_STORY_THEME.sprite.poses.includes("concerned" as never), false);
  });

  it("pins the bundled baseline assets to HD dimensions", () => {
    const byId = new Map(PRISM_DEFAULT_STORY_THEME.assets.map((asset) => [asset.id, asset]));
    const spriteReference = byId.get("sprite_reference_sheet");
    const spriteFallback = byId.get("sprite_fallback_silhouette");

    assert.equal(spriteReference?.width, 2048);
    assert.equal(spriteReference?.height, 1536);
    assert.equal(spriteFallback?.width, 1024);
    assert.equal(spriteFallback?.height, 1536);

    for (const asset of PRISM_DEFAULT_STORY_THEME.assets) {
      if (
        asset.kind === "background_reference" ||
        asset.kind === "cutscene_reference" ||
        asset.kind === "projection_fallback" ||
        asset.kind === "map_style_reference"
      ) {
        assert.equal(asset.width, 1920, `${asset.id} width`);
        assert.equal(asset.height, 1080, `${asset.id} height`);
      }
    }
  });

  it("locks prompt rules to PRISM blank-face guidance and avoids named-artist styles", () => {
    const promptText = Object.values(PRISM_DEFAULT_STORY_THEME.style).join("\n").toLowerCase();
    assert.match(promptText, /blank-face/);
    assert.match(promptText, /ascii/);
    assert.match(promptText, /middle-light/);
    assert.match(promptText, /white tintable/);
    assert.match(promptText, /no text/);
    assert.match(promptText, /named artist style/);
    assert.doesNotMatch(promptText, /tim burton|studio ghibli|disney|pixar|hayao|miyazaki/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Images library navigation", () => {
  it("keeps the grouped hub while offering a flat PRISM collection", () => {
    assert.match(
      pageSource,
      /type ImagePanelScope = "all" \| "prism" \| "bot" \| "general";/,
    );
    assert.match(
      pageSource,
      /imagePanelScope === "all" && view !== "chat"[\s\S]*?buildImageLibrarySections/,
    );
    assert.match(
      pageSource,
      /imagePanelScope === "prism"[\s\S]*?\? "All images"/,
    );
  });

  it("puts PRISM alongside the bot choices and loads every image", () => {
    assert.match(pageSource, /aria-label="Image collections"/);
    assert.match(
      pageSource,
      /aria-selected=\{prismSelected\}[\s\S]*?<BotGlyph name="triangle"[\s\S]*?>PRISM</,
    );
    assert.match(
      pageSource,
      /onPickPrism=\{\(\) => \{[\s\S]*?setImagePanelScope\("prism"\);[\s\S]*?setImagePanelBotId\(null\);[\s\S]*?refreshImages\(null\)/,
    );
    assert.match(
      pageSource,
      /scope === "all" \|\| scope === "prism"[\s\S]*?refreshImages\(null\)/,
    );
  });

  it("keeps PRISM on the global gallery chrome with a path back to the hub", () => {
    assert.match(
      pageSource,
      /data-image-scope=\{[\s\S]*?imagePanelScope === "prism" \? "all" : imagePanelScope/,
    );
    assert.match(
      pageSource,
      /imagePanelScope === "bot" \|\|[\s\S]*?imagePanelScope === "prism"[\s\S]*?setImagePanelScope\("all"\)/,
    );
  });
});

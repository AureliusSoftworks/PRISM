import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(appDir, "page.module.css"), "utf8");
const publicCoffeeBarDir = join(appDir, "..", "..", "public", "coffee-bar");

describe("Coffee bar scene", () => {
  it("renders the selected service bot as a full live mannequin", () => {
    assert.match(
      pageSource,
      /const coffeeBarServiceBot = coffeeBarRitual\?\.serviceBot\.id[\s\S]*coffeeBotsById\.get\(coffeeBarRitual\.serviceBot\.id\)/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.coffeeBarServiceAvatar\}[\s\S]*<ZenLiveBotMannequin[\s\S]*glyph=\{coffeeBarServiceGlyph\}[\s\S]*faceStyle=\{coffeeBarServiceFaceStyle\}[\s\S]*avatarDetails=\{[\s\S]*coffeeBarServiceAvatarDetails/u,
    );
    assert.doesNotMatch(
      pageSource,
      /className=\{styles\.coffeeBarGlyph\}[\s\S]{0,80}☕/u,
    );
  });

  it("presents the ritual in a viewport-level modal", () => {
    assert.match(
      pageSource,
      /createPortal\([\s\S]*className=\{styles\.coffeeBarSceneBackdrop\}[\s\S]*role="dialog"[\s\S]*aria-modal="true"[\s\S]*data-tutorial-target="coffee-bar-ritual"/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarSceneBackdrop\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*950;/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarServiceAvatar\s*\{[\s\S]*--zen-live-bot-avatar-size:\s*clamp\(224px, 31vmin, 360px\);/u,
    );
  });

  it("ships one shared matched environment for each app theme", () => {
    assert.match(cssSource, /url\("\/coffee-bar\/coffee-bar-dark\.webp"\)/u);
    assert.match(cssSource, /url\("\/coffee-bar\/coffee-bar-light\.webp"\)/u);
    assert.equal(existsSync(join(publicCoffeeBarDir, "coffee-bar-dark.webp")), true);
    assert.equal(existsSync(join(publicCoffeeBarDir, "coffee-bar-light.webp")), true);
  });
});

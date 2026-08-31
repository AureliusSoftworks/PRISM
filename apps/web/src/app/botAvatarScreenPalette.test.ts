import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { botAvatarScreenContrastRatio, botAvatarScreenPaletteVariables, deriveBotAvatarScreenPalette } from "./botAvatarScreenPalette.ts";

const IDENTITIES = {
  cyan: "#35cfff",
  red: "#ff3f6f",
  violet: "#8b7cff",
  green: "#78f26d",
  yellowOrange: "#ffb62e",
} as const;

test("light avatar screens derive saturated non-black glass with white glyph contrast", () => {
  for (const [name, identity] of Object.entries(IDENTITIES)) {
    const palette = deriveBotAvatarScreenPalette(identity, "light");
    assert.ok(palette, `${name} should derive a light-mode palette`);
    for (const tone of [palette.edge, palette.mid, palette.center]) {
      assert.notEqual(tone, "#000000", `${name} must not collapse to black`);
      assert.ok(botAvatarScreenContrastRatio(palette.glyph, tone) >= 3, `${name} glyph should keep 3:1 graphic contrast on ${tone}`);
    }
    const edgeContrast = botAvatarScreenContrastRatio(palette.glyph, palette.edge);
    const midContrast = botAvatarScreenContrastRatio(palette.glyph, palette.mid);
    const centerContrast = botAvatarScreenContrastRatio(palette.glyph, palette.center);
    assert.ok(edgeContrast > midContrast, `${name} middle should be brighter than its edge`);
    assert.ok(midContrast > centerContrast, `${name} center should be brighter than its middle`);
    assert.ok(centerContrast < 4.6, `${name} center should read as illuminated colored glass rather than near-black`);
    assert.equal(palette.glyph, "#fbfdff");
    assert.deepEqual(Object.keys(botAvatarScreenPaletteVariables(palette)), [
      "--bot-avatar-screen-edge",
      "--bot-avatar-screen-mid",
      "--bot-avatar-screen-center",
      "--bot-avatar-screen-glyph",
      "--bot-avatar-screen-glow",
    ]);
  }
});

test("dark avatar screens preserve the existing authored palette", () => {
  for (const identity of Object.values(IDENTITIES)) {
    const palette = deriveBotAvatarScreenPalette(identity, "dark");
    assert.equal(palette, null);
    assert.deepEqual(botAvatarScreenPaletteVariables(palette), {});
  }
});

test("the canonical full avatar style feeds one palette to both screen sizes", () => {
  const appDirectory = fileURLToPath(new URL(".", import.meta.url));
  const pageSource = readFileSync(`${appDirectory}/page.tsx`, "utf8");
  const cssSource = readFileSync(`${appDirectory}/page.module.css`, "utf8");
  const cssRuleFrom = (selector: string): string => {
    const start = cssSource.indexOf(selector);
    assert.notEqual(start, -1, `missing CSS selector: ${selector}`);
    const end = cssSource.indexOf("\n}", start);
    assert.notEqual(end, -1, `unterminated CSS rule: ${selector}`);
    return cssSource.slice(start, end + 2);
  };
  const styleStart = pageSource.indexOf("function botAvatarFullScaleIdentityStyle");
  assert.notEqual(styleStart, -1);
  const styleSource = pageSource.slice(styleStart, styleStart + 2_000);
  const lightPlateRule = cssRuleFrom(".themeLight .zenLiveBotPresencePlate,");
  const lightBodyRule = cssRuleFrom(
    '.zenLiveBotPresencePlate[data-theme="light"] .zenLiveBotPresenceBody,',
  );
  const lightEmissionRule = cssRuleFrom(
    '.zenLiveBotPresencePlate[data-theme="light"]\n  .zenLiveBotPresenceFaceEmissionMask,',
  );
  const bodyGlyphRule = cssRuleFrom("\n.zenLiveBotPresenceBotGlyph {");

  assert.match(
    styleSource,
    /deriveBotAvatarScreenPalette\(rawHex, resolvedTheme\)/,
  );
  for (const token of [
    "--bot-avatar-screen-glass-overlay",
    "--bot-avatar-screen-center",
    "--bot-avatar-screen-mid",
    "--bot-avatar-screen-edge",
    "transparent",
    "--zen-presence-face-bg",
    "--bot-avatar-screen-dark-base",
  ]) {
    assert.ok(lightPlateRule.includes(token), `light face rule should include ${token}`);
  }
  for (const token of [
    "--zen-live-bot-buckle-rim-screen-stops",
    "--bot-avatar-screen-center",
    "--bot-avatar-screen-mid",
    "--bot-avatar-screen-edge",
    "transparent",
    "--zen-live-bot-buckle-rim-screen-base: linear-gradient",
  ]) {
    assert.ok(lightBodyRule.includes(token), `light lower display should include ${token}`);
  }
  assert.match(
    lightEmissionRule,
    /background:[\s\S]*--bot-avatar-screen-glass-overlay[\s\S]*--bot-avatar-screen-dark-base/,
  );
  assert.ok(bodyGlyphRule.includes("--bot-avatar-screen-glow"));
  assert.ok(
    bodyGlyphRule.includes("color: var(--bot-avatar-screen-glyph, #ffffff)"),
  );
});

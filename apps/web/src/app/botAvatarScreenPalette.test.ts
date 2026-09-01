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
    const centerToEdgeContrast = botAvatarScreenContrastRatio(palette.center, palette.edge);
    assert.ok(edgeContrast > midContrast, `${name} middle should be brighter than its edge`);
    assert.ok(midContrast > centerContrast, `${name} center should be brighter than its middle`);
    assert.ok(centerToEdgeContrast >= 3.25, `${name} center should separate clearly from its edge`);
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
    "--bot-avatar-screen-radial-geometry",
    "--bot-avatar-screen-radial-stops",
    "--bot-avatar-screen-center",
    "--bot-avatar-screen-mid",
    "--bot-avatar-screen-edge",
    "transparent",
    "--zen-presence-face-bg",
    "--bot-avatar-screen-dark-base",
    "transparent 90%",
    "--bot-face-screen-glass-blend-mode: plus-lighter",
    "--zen-live-bot-screen-specular-opacity: 0.22",
    "--bot-avatar-screen-bottom-reflection",
    "--zen-live-bot-shared-phosphor-glow-color",
  ]) {
    assert.ok(lightPlateRule.includes(token), `light face rule should include ${token}`);
  }
  for (const token of [
    "--zen-live-bot-buckle-rim-screen-stops",
    "--bot-avatar-buckle-screen-radial-stops",
    "--zen-live-bot-buckle-screen-radial-geometry: ellipse 58% 64% at 50% 44%",
    "--zen-live-bot-buckle-rim-screen-base: var(--bot-avatar-screen-dark-base)",
  ]) {
    assert.ok(lightBodyRule.includes(token), `light lower display should include ${token}`);
  }
  assert.match(
    lightEmissionRule,
    /background:[\s\S]*--bot-avatar-screen-glass-overlay[\s\S]*--bot-avatar-screen-dark-base/,
  );
  for (const token of [
    "--bot-face-glow-strength-scale: 0.68",
    "--zen-live-bot-shared-phosphor-contact-opacity: 78%",
    "--zen-live-bot-shared-phosphor-tight-opacity: 62%",
    "--crt-face-screen-wash-tight-opacity: 44%",
    "--crt-face-screen-wash-near-opacity: 27%",
    "--crt-face-screen-wash-mid-opacity: 14%",
    "--crt-face-screen-wash-far-opacity: 7%",
  ]) {
    assert.ok(
      lightEmissionRule.includes(token),
      `Light face and Ink glow should include ${token}`,
    );
  }
  assert.match(
    cssSource,
    /--zen-live-bot-shared-phosphor-glow-filter:[\s\S]*?--zen-live-bot-shared-phosphor-contact-opacity[\s\S]*?--zen-live-bot-shared-phosphor-tight-opacity/,
    "the shared face and Ink filter must expose Light-only close-halo controls",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-radial-geometry:\s*ellipse 46% 54% at 50% 42%/,
    "the face identity field must darken before the circular aperture edge",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-radial-stops:[\s\S]*?93%,\s*white 7%[\s\S]*?98%,\s*transparent[\s\S]*?0 8%[\s\S]*?92%,\s*transparent[\s\S]*?22%[\s\S]*?58%,\s*transparent[\s\S]*?48%[\s\S]*?16%,\s*transparent[\s\S]*?70%,\s*transparent 90%/,
    "the face identity light must peak in a compact bright core and fall to the CRT substrate before the aperture edge",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-glass-overlay:\s*radial-gradient\(\s*var\(--bot-avatar-screen-radial-geometry\),/,
    "the face must use the explicitly sized shared identity field",
  );
  assert.match(
    lightBodyRule,
    /--zen-live-bot-buckle-rim-screen-stops:\s*var\(\s*--bot-avatar-buckle-screen-radial-stops\s*\)/,
    "the lower display must retain its independently broader identity light",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-buckle-screen-radial-stops:[\s\S]*?14%,\s*transparent[\s\S]*?72%,\s*transparent 92%/,
    "the lower screen must retain a colored center while revealing a darker perimeter",
  );
  assert.match(
    cssSource,
    /\.zenLiveBotPresenceBody::before\s*\{[\s\S]*?radial-gradient\([\s\S]*?--zen-live-bot-buckle-screen-radial-geometry/,
    "the lower display must consume its independently enlarged identity field",
  );
  assert.doesNotMatch(
    lightPlateRule.match(/--bot-avatar-screen-dark-base:[\s\S]*?\);/)?.[0] ?? "",
    /--coffee-bot-color/,
    "the black substrate must stay neutral beneath the identity light",
  );
  assert.match(
    cssSource,
    /\.botFaceScreenGlass::after\s*\{[\s\S]*?mix-blend-mode:\s*screen\s*;/,
    "the retained white specular uses an optical screen blend",
  );
  assert.match(
    cssSource,
    /\.botFaceScreenGlass::after\s*\{[\s\S]*?background:[\s\S]*?--bot-avatar-screen-bottom-reflection[\s\S]*?--bot-face-screen-glare-x[\s\S]*?mix-blend-mode:\s*screen\s*;/,
    "the Light bezel reflection must composite in the same foreground specular pass as the existing glare",
  );
  assert.match(
    cssSource,
    /\.botFaceScreenGlass::before\s*\{[\s\S]*?background:\s*none\s*;[\s\S]*?opacity:\s*0\s*;/,
    "the background glass pseudo must not carry the white bezel reflection",
  );
  assert.match(
    cssSource,
    /--bot-face-screen-specular-opacity:\s*var\(\s*--zen-live-bot-screen-specular-opacity,\s*0\.055\s*\)/,
    "the shared lens must consume the bounded Light-only specular opacity",
  );
  assert.ok(bodyGlyphRule.includes("--bot-avatar-screen-glow"));
  assert.ok(
    bodyGlyphRule.includes("color: var(--bot-avatar-screen-glyph, #ffffff)"),
  );
});

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
  const exposureByTone = {
    deep: [] as number[],
    edge: [] as number[],
    mid: [] as number[],
    center: [] as number[],
  };
  for (const [name, identity] of Object.entries(IDENTITIES)) {
    const palette = deriveBotAvatarScreenPalette(identity, "light");
    assert.ok(palette, `${name} should derive a light-mode palette`);
    for (const tone of [palette.deep, palette.edge, palette.mid, palette.center]) {
      assert.notEqual(tone, "#000000", `${name} must not collapse to black`);
      assert.ok(botAvatarScreenContrastRatio(palette.glyph, tone) >= 3, `${name} glyph should keep 3:1 graphic contrast on ${tone}`);
    }
    const deepContrast = botAvatarScreenContrastRatio(palette.glyph, palette.deep);
    const edgeContrast = botAvatarScreenContrastRatio(palette.glyph, palette.edge);
    const midContrast = botAvatarScreenContrastRatio(palette.glyph, palette.mid);
    const centerContrast = botAvatarScreenContrastRatio(palette.glyph, palette.center);
    const centerToEdgeContrast = botAvatarScreenContrastRatio(palette.center, palette.edge);
    exposureByTone.deep.push(deepContrast);
    exposureByTone.edge.push(edgeContrast);
    exposureByTone.mid.push(midContrast);
    exposureByTone.center.push(centerContrast);
    assert.ok(deepContrast > edgeContrast, `${name} deep field should be darker than its edge`);
    assert.ok(edgeContrast > midContrast, `${name} middle should be brighter than its edge`);
    assert.ok(midContrast > centerContrast, `${name} center should be brighter than its middle`);
    assert.ok(centerToEdgeContrast >= 3.25, `${name} center should separate clearly from its edge`);
    assert.ok(centerContrast < 4.6, `${name} center should read as illuminated colored glass rather than near-black`);
    assert.equal(palette.glyph, "#fbfdff");
    assert.deepEqual(Object.keys(botAvatarScreenPaletteVariables(palette)), [
      "--bot-avatar-screen-deep",
      "--bot-avatar-screen-edge",
      "--bot-avatar-screen-mid",
      "--bot-avatar-screen-center",
      "--bot-avatar-screen-glyph",
      "--bot-avatar-screen-glow",
    ]);
  }
  for (const [tone, contrasts] of Object.entries(exposureByTone)) {
    const exposureSpread = Math.max(...contrasts) - Math.min(...contrasts);
    assert.ok(
      exposureSpread <= 0.1,
      `${tone} exposure should stay perceptually even across identity hues`,
    );
  }
});

test("dark avatar screens preserve the existing authored palette", () => {
  for (const identity of Object.values(IDENTITIES)) {
    const palette = deriveBotAvatarScreenPalette(identity, "dark");
    assert.equal(palette, null);
    assert.deepEqual(botAvatarScreenPaletteVariables(palette), {});
  }
});

test("the canonical full avatar style keeps the face palette and complete lower-screen stack", () => {
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
  const lightEmissionRule = cssRuleFrom(
    '.zenLiveBotPresencePlate[data-theme="light"]\n  .zenLiveBotPresenceFaceEmissionMask,',
  );
  const lightInkGlowRule = cssRuleFrom(
    '.zenLiveBotPresencePlate[data-theme="light"]\n  .zenLiveBotPresenceFaceEmissionMask\n  [data-avatar-details-emission="glow"],',
  );
  const lowerOrbRule = cssRuleFrom("\n.zenLiveBotPresenceBody::before {");
  const lowerLatticeRule = cssRuleFrom("\n.zenLiveBotPresenceBody::after {");
  const lowerGlassRule = cssRuleFrom("\n.botAvatarFoundryBuckleGlass {");
  const bodyGlyphRule = cssRuleFrom("\n.zenLiveBotPresenceBotGlyph {");
  const lightBodyGlyphRule = cssRuleFrom(
    '.zenLiveBotPresencePlate[data-theme="light"] .zenLiveBotPresenceBotGlyph,',
  );

  assert.match(
    styleSource,
    /deriveBotAvatarScreenPalette\(rawHex, resolvedTheme\)/,
  );
  for (const token of [
    "--bot-avatar-screen-glass-overlay",
    "--bot-avatar-screen-radial-geometry",
    "--bot-avatar-screen-radial-stops",
    "--bot-avatar-screen-black-edge: #010203",
    "--bot-avatar-screen-inner-orb",
    "--bot-avatar-screen-deep",
    "--bot-avatar-screen-center",
    "--bot-avatar-screen-mid",
    "--bot-avatar-screen-edge",
    "transparent",
    "--zen-presence-face-bg",
    "--bot-avatar-screen-dark-base",
    "--bot-face-screen-glass-blend-mode: plus-lighter",
    "--zen-live-bot-screen-specular-opacity: 0.22",
    "--bot-avatar-screen-bottom-reflection",
    "--bot-avatar-screen-arc-reflection",
    "--zen-live-bot-shared-phosphor-glow-color",
  ]) {
    assert.ok(lightPlateRule.includes(token), `light face rule should include ${token}`);
  }
  assert.match(
    lightEmissionRule,
    /background:[\s\S]*--bot-avatar-screen-inner-orb[\s\S]*--bot-avatar-screen-glass-overlay[\s\S]*--bot-avatar-screen-dark-base/,
    "the internal lamp must sit behind the phosphor content and above the identity-color field",
  );
  for (const token of [
    "--bot-face-glow-strength-scale: 0.74",
    "--zen-live-bot-shared-phosphor-white-glow-opacity: 26%",
    "--zen-live-bot-shared-phosphor-contact-opacity: 82%",
    "--zen-live-bot-shared-phosphor-tight-opacity: 64%",
    "--crt-face-screen-wash-tight-opacity: 36%",
    "--crt-face-screen-wash-near-opacity: 22%",
    "--crt-face-screen-wash-mid-opacity: 11%",
    "--crt-face-screen-wash-far-opacity: 5%",
  ]) {
    assert.ok(
      lightEmissionRule.includes(token),
      `Light face and Ink glow should include ${token}`,
    );
  }
  assert.match(
    cssSource,
    /--zen-live-bot-shared-phosphor-glow-filter:[\s\S]*?--zen-live-bot-shared-phosphor-white-glow-opacity[\s\S]*?--zen-live-bot-shared-phosphor-contact-opacity[\s\S]*?--zen-live-bot-shared-phosphor-tight-opacity/,
    "the shared face and Ink filter must expose a tight white halo plus close-halo controls",
  );
  assert.match(
    lightInkGlowRule,
    /--zen-live-bot-shared-phosphor-glow-color:\s*#ffffff;[\s\S]*--avatar-details-phosphor-glow-color:\s*#ffffff;[\s\S]*mix-blend-mode:\s*plus-lighter;/,
    "Light authored Ink must emit a linear-dodge white rather than identity-colored halo",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-black-edge:\s*#010203;[\s\S]*?--bot-avatar-screen-radial-geometry:\s*ellipse 52% 54% at 50% 48%/,
    "the face identity field must contract before the black screen edge",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-radial-stops:[\s\S]*?--bot-avatar-screen-center[\s\S]*?0 16%[\s\S]*?--bot-avatar-screen-mid[\s\S]*?40%[\s\S]*?--bot-avatar-screen-edge[\s\S]*?62%[\s\S]*?24%[\s\S]*?--bot-avatar-screen-black-edge[\s\S]*?76%[\s\S]*?78%[\s\S]*?--bot-avatar-screen-black-edge[\s\S]*?100%/,
    "the face field must fade from a smaller identity pool into the black screen edge",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-inner-orb:\s*radial-gradient\([\s\S]*?ellipse 34% 31% at 50% 43%[\s\S]*?--bot-avatar-screen-glow[\s\S]*?white 38%[\s\S]*?transparent 70%/,
    "a compact identity-tinted lamp must glow from behind the face and Ink",
  );
  assert.match(
    lightPlateRule,
    /--bot-avatar-screen-glass-overlay:\s*radial-gradient\(\s*var\(--bot-avatar-screen-radial-geometry\),/,
    "the face must use the explicitly sized shared identity field",
  );
  assert.match(lowerOrbRule, /content:\s*""\s*;/);
  assert.match(lowerLatticeRule, /content:\s*""\s*;/);
  assert.doesNotMatch(lowerGlassRule, /display:\s*none\s*;/);
  assert.match(
    lightBodyGlyphRule,
    /color:\s*var\(--coffee-bot-color\)\s*;[\s\S]*?opacity:\s*1\s*;[\s\S]*?filter:\s*none\s*;/,
    "the Light lower glyph must use the normalized bot color without phosphor glow",
  );
  assert.match(
    pageSource,
    /<PhosphorPixelSvgGlyph[\s\S]{0,180}className=\{styles\.zenLiveBotPresenceBotGlyph\}[\s\S]{0,180}enabled=\{pixelRasterizationEnabled && theme === "dark"\}/,
    "the lower glyph rasterizer must remain enabled only for Dark Mode",
  );
  assert.match(
    lightPlateRule.match(/--bot-avatar-screen-dark-base:[\s\S]*?;\n/)?.[0] ?? "",
    /--bot-avatar-screen-deep[\s\S]*?--bot-avatar-screen-edge[\s\S]*?black 8%/,
    "the near-black substrate must preserve identity hue rather than turning neutral black",
  );
  assert.match(
    cssSource,
    /\.botFaceScreenGlass::after\s*\{[\s\S]*?mix-blend-mode:\s*screen\s*;/,
    "the retained white specular uses an optical screen blend",
  );
  assert.match(
    cssSource,
    /\.botFaceScreenGlass::after\s*\{[\s\S]*?background:[\s\S]*?--bot-avatar-screen-bottom-reflection[\s\S]*?--bot-avatar-screen-arc-reflection[\s\S]*?--bot-face-screen-glare-x[\s\S]*?mix-blend-mode:\s*screen\s*;/,
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

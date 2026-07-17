import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";

const appDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8").replace(/\s+/gu, " ");

function sourceBetween(startNeedle: string, endNeedle: string): string {
  const start = pageSource.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing source start: ${startNeedle}`);
  const end = pageSource.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Missing source end: ${endNeedle}`);
  return pageSource.slice(start, end);
}

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function readRgbaPng(png: Buffer): { width: number; height: number; pixels: Buffer } {
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  assert.equal(bitDepth, 8, "Cursor PNGs must stay 8-bit");
  assert.equal(colorType, 6, "Cursor PNGs must stay RGBA");
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset] ?? 0;
    rawOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const rawValue = raw[rawOffset + x] ?? 0;
      const left = x >= 4 ? pixels[y * stride + x - 4] ?? 0 : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] ?? 0 : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] ?? 0 : 0;
      let value = rawValue;
      if (filter === 1) value = rawValue + left;
      if (filter === 2) value = rawValue + up;
      if (filter === 3) value = rawValue + Math.floor((left + up) / 2);
      if (filter === 4) value = rawValue + paethPredictor(left, up, upperLeft);
      pixels[y * stride + x] = value & 255;
    }
    rawOffset += stride;
  }

  return { width, height, pixels };
}

function countVisibleContrastPixels(base64: string): { dark: number; light: number } {
  const { pixels } = readRgbaPng(Buffer.from(base64, "base64"));
  let dark = 0;
  let light = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] ?? 0;
    if (alpha <= 128) continue;
    const luminance = (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
    if (luminance < 180) dark += 1;
    if (luminance > 600) light += 1;
  }
  return { dark, light };
}

describe("Prism app cursor", () => {
  it("keeps the custom cursor controller available but disabled", () => {
    const cursorSource = sourceBetween(
      "function PrismAppCursor(): React.JSX.Element | null",
      "function resolveZenLiveBotActionCopyPlacement"
    );
    const homeStart = pageSource.indexOf("export default function Home(): React.JSX.Element");
    assert.notEqual(homeStart, -1, "Missing Home component");
    const homeSource = pageSource.slice(homeStart);

    assert.match(pageSource, /const PRISM_APP_CUSTOM_CURSOR_ENABLED = false;/);
    assert.match(homeSource, /\{PRISM_APP_CUSTOM_CURSOR_ENABLED \? <PrismAppCursor \/> : null\}/);
    assert.doesNotMatch(homeSource, /<PrismAppCursor resolvedTheme=/);
    assert.match(pageSource, /const PRISM_APP_CURSOR_BODY_CLASS = "prismAppCursorActive";/);
    assert.match(
      pageSource,
      /const PRISM_APP_CURSOR_DARK_BODY_CLASS = "prismAppCursorThemeDark";/
    );
    assert.match(
      pageSource,
      /const PRISM_APP_CURSOR_LIGHT_BODY_CLASS = "prismAppCursorThemeLight";/
    );
    assert.match(
      pageSource,
      /const PRISM_APP_CURSOR_GRABBING_BODY_CLASS = "prismAppCursorGrabbing";/
    );
    assert.match(cursorSource, /<style>\{PRISM_APP_CURSOR_GLOBAL_STYLE\}<\/style>/);
    assert.match(cursorSource, /ref=\{cursorNodeRef\}/);
    assert.match(cursorSource, /data-prism-app-cursor="true"/);
    assert.match(cursorSource, /pointerEvents: "none"/);
    assert.match(cursorSource, /document\.body\.classList\.add\(PRISM_APP_CURSOR_BODY_CLASS\)/);
    assert.match(cursorSource, /document\.body\.classList\.remove\(PRISM_APP_CURSOR_BODY_CLASS\)/);
    assert.doesNotMatch(css, /\.prismAppCursor\b/);
  });

  it("inlines cursor art as outlined PNG data URIs so runtime asset paths cannot fail", () => {
    assert.match(pageSource, /function prismAppCursorPngDataUri\(base64: string\): string/);
    assert.match(pageSource, /data:image\/png;base64,\$\{base64\}/);
    assert.equal(
      pageSource.match(/path: prismAppCursorPngDataUri\(PRISM_APP_CURSOR_PNG_DATA\./g)?.length,
      10
    );
    assert.doesNotMatch(pageSource, /path: "\/cursors\//);
    assert.doesNotMatch(pageSource, /data:image\/svg\+xml/);
  });

  it("keeps native cursor outlines baked into the embedded PNGs", () => {
    const pngDataBlock = sourceBetween(
      "const PRISM_APP_CURSOR_PNG_DATA = {",
      "} as const;"
    );
    const entries = [...pngDataBlock.matchAll(/\s+([a-zA-Z]+): "([A-Za-z0-9+/=]+)",/g)];
    assert.equal(entries.length, 10);

    for (const [, key, base64] of entries) {
      assert.ok(base64, `${key} is missing PNG data`);
      const { dark, light } = countVisibleContrastPixels(base64);
      assert.ok(dark >= 80, `${key} is missing dark outline/fill pixels`);
      assert.ok(light >= 80, `${key} is missing light outline/fill pixels`);
    }
  });

  it("uses compact hotspots to align the rendered follower", () => {
    assert.doesNotMatch(pageSource, /function prismNativeCursorRule/);
    assert.match(
      pageSource,
      /\$\{PRISM_APP_CURSOR_ACTIVE_SCOPE\}, \$\{PRISM_APP_CURSOR_ACTIVE_SCOPE\} \* \{ cursor: none !important; \}/
    );
    assert.match(pageSource, /renderedX - hotspotX[\s\S]*renderedY - hotspotY/);
    assert.match(pageSource, /PRISM_APP_CURSOR_PNG_DATA\.pointerDark\)[\s\S]*hotspotX:\s*7,[\s\S]*hotspotY:\s*6/);
    assert.match(pageSource, /PRISM_APP_CURSOR_PNG_DATA\.fingerDark\)[\s\S]*hotspotX:\s*10,[\s\S]*hotspotY:\s*6/);
    assert.match(pageSource, /PRISM_APP_CURSOR_PNG_DATA\.textDark\)[\s\S]*hotspotX:\s*11,[\s\S]*hotspotY:\s*17/);
    assert.match(pageSource, /PRISM_APP_CURSOR_PNG_DATA\.grabDark\)[\s\S]*hotspotX:\s*14,[\s\S]*hotspotY:\s*15/);
    assert.match(pageSource, /PRISM_APP_CURSOR_PNG_DATA\.grabbingDark\)[\s\S]*hotspotX:\s*13,[\s\S]*hotspotY:\s*17/);
  });

  it("keeps app cursor kinds for text, controls, grab, disabled, and excluded surfaces", () => {
    assert.match(pageSource, /const PRISM_APP_CURSOR_TEXT_SELECTOR = \[/);
    assert.match(pageSource, /"textarea"/);
    assert.match(pageSource, /"\[contenteditable='true'\]"/);
    assert.match(pageSource, /"\[role='textbox'\]"/);
    assert.match(pageSource, /"\.tiptap"/);
    assert.match(pageSource, /const PRISM_APP_CURSOR_FINGER_SELECTOR = \[/);
    assert.match(pageSource, /"a\[href\]"/);
    assert.match(pageSource, /"button"/);
    assert.match(pageSource, /"\[role='button'\]"/);
    assert.match(pageSource, /const PRISM_APP_CURSOR_GRAB_SELECTOR = \[/);
    assert.match(pageSource, /"\[data-zen-live-bot-body-hit-target='true'\]"/);
    assert.match(pageSource, /"\[data-zen-live-bot-presence-plate='true'\]"/);
    assert.match(pageSource, /const PRISM_APP_CURSOR_DISABLED_SELECTOR = \[/);
    assert.match(pageSource, /const PRISM_APP_CURSOR_EXCLUDED_SELECTOR = \[/);
    assert.match(pageSource, /const PRISM_APP_CURSOR_POINTER_SELECTOR = "\[data-app-cursor='pointer'\]";/);
    assert.match(pageSource, /"\[class\*='chatBotPickerPixelGrid'\]"/);
    assert.match(pageSource, /function prismAppCursorKindForTarget/);
    assert.match(pageSource, /if \(target\.closest\(PRISM_APP_CURSOR_EXCLUDED_SELECTOR\)\) return null;/);
    assert.match(pageSource, /if \(target\.closest\(PRISM_APP_CURSOR_POINTER_SELECTOR\)\) return "pointer";/);
    assert.match(pageSource, /if \(grabbing\) return "grabbing";/);
    assert.match(pageSource, /if \(target\.closest\(PRISM_APP_CURSOR_DISABLED_SELECTOR\)\) return "pointer";/);
    assert.match(pageSource, /if \(target\.closest\(PRISM_APP_CURSOR_TEXT_SELECTOR\)\) return "text";/);
    assert.match(pageSource, /if \(target\.closest\(PRISM_APP_CURSOR_GRAB_SELECTOR\)\) return "grab";/);
    assert.match(pageSource, /if \(target\.closest\(PRISM_APP_CURSOR_FINGER_SELECTOR\)\) return "finger";/);
    assert.match(pageSource, /PRISM_APP_CURSOR_EXCLUDED_SELECTOR[\s\S]*cursor: auto !important/);
    assert.match(
      pageSource,
      /className=\{styles\.botPanelHubAvatarPreview\}[\s\S]*data-app-cursor=\{isMarketplacePreview \? undefined : "pointer"\}/,
    );
  });

  it("uses the dark cursor art for contrast in Light mode", () => {
    assert.match(pageSource, /document\.body\.dataset\.prismTheme = resolvedTheme;/);
    assert.match(pageSource, /delete document\.body\.dataset\.prismTheme;/);
    assert.match(pageSource, /data-app-cursor-theme=\{previewTheme\}/);
    assert.match(pageSource, /function prismAppCursorThemeForTarget/);
    assert.match(pageSource, /target\.closest<HTMLElement>\("\[data-app-cursor-theme\]"\)/);
    assert.match(pageSource, /surfaceTheme === "light" \|\| surfaceTheme === "dark"/);
    assert.match(pageSource, /function prismAppCursorAsset/);
    const lightSurfaceStart = pageSource.indexOf(
      "const PRISM_APP_CURSOR_NATIVE_LIGHT_SURFACE"
    );
    const lightSurfaceEnd = pageSource.indexOf(
      "const PRISM_APP_CURSOR_ACTIVE_SCOPE",
      lightSurfaceStart
    );
    const lightSurfaceSource = pageSource.slice(lightSurfaceStart, lightSurfaceEnd);
    assert.match(lightSurfaceSource, /PRISM_APP_CURSOR_PNG_DATA\.pointerDark/);
    assert.match(lightSurfaceSource, /PRISM_APP_CURSOR_PNG_DATA\.fingerDark/);
    assert.match(lightSurfaceSource, /PRISM_APP_CURSOR_PNG_DATA\.textDark/);
    assert.match(lightSurfaceSource, /PRISM_APP_CURSOR_PNG_DATA\.grabDark/);
    assert.match(lightSurfaceSource, /PRISM_APP_CURSOR_PNG_DATA\.grabbingDark/);
    assert.doesNotMatch(lightSurfaceSource, /PRISM_APP_CURSOR_PNG_DATA\.[a-z]+Light/);
    assert.match(
      pageSource,
      /theme === "light"[\s\S]*\? PRISM_APP_CURSOR_NATIVE_LIGHT_SURFACE[\s\S]*: PRISM_APP_CURSOR_NATIVE_DARK_SURFACE/
    );
    assert.match(
      pageSource,
      /document\.body\.classList\.toggle\([\s\S]*?PRISM_APP_CURSOR_DARK_BODY_CLASS,[\s\S]*?theme === "dark"[\s\S]*?\);/
    );
    assert.match(
      pageSource,
      /document\.body\.classList\.toggle\([\s\S]*?PRISM_APP_CURSOR_LIGHT_BODY_CLASS,[\s\S]*?theme === "light"[\s\S]*?\);/
    );
    assert.match(pageSource, /const observer = new MutationObserver\(refreshCursorTheme\);/);
    assert.match(pageSource, /attributeFilter: \["data-prism-theme"\]/);
    assert.match(pageSource, /observer\.disconnect\(\);/);
  });

  it("follows pointer position with deliberate frame-lag easing", () => {
    const cursorSource = sourceBetween(
      "function PrismAppCursor(): React.JSX.Element | null",
      "function resolveZenLiveBotActionCopyPlacement"
    );

    assert.match(pageSource, /const PRISM_APP_CURSOR_FOLLOW_EASING = 0\.34;/);
    assert.match(cursorSource, /let activeGrabPointerId: number \| null = null;/);
    assert.match(cursorSource, /event\.target\.closest\(PRISM_APP_CURSOR_GRAB_SELECTOR\)/);
    assert.match(cursorSource, /document\.body\.classList\.add\(PRISM_APP_CURSOR_GRABBING_BODY_CLASS\)/);
    assert.match(cursorSource, /document\.body\.classList\.remove\(PRISM_APP_CURSOR_GRABBING_BODY_CLASS\)/);
    assert.match(cursorSource, /window\.addEventListener\("pointermove", handlePointerMove, true\);/);
    assert.match(cursorSource, /window\.addEventListener\("pointerdown", startGrabCursor, true\);/);
    assert.match(cursorSource, /window\.addEventListener\("pointerup", finishGrabCursor, true\);/);
    assert.match(cursorSource, /window\.addEventListener\("pointercancel", handlePointerCancel, true\);/);
    assert.match(cursorSource, /const next = prismCursorMotionStep\(/);
    assert.match(
      cursorSource,
      /PRISM_APP_CURSOR_FOLLOW_EASING,[\s\S]*PRISM_APP_CURSOR_SNAP_DISTANCE_PX/,
    );
    assert.match(
      cursorSource,
      /if \(next\.settled\) \{[\s\S]*animationFrameId = null;[\s\S]*return;/,
    );
    assert.match(cursorSource, /window\.requestAnimationFrame\(animateCursor\)/);
    assert.match(cursorSource, /window\.cancelAnimationFrame\(animationFrameId\)/);
    assert.match(cursorSource, /targetX = event\.clientX;/);
    assert.match(cursorSource, /targetY = event\.clientY;/);
    assert.match(cursorSource, /if \(!hasPosition\)[\s\S]*renderedX = targetX;[\s\S]*renderedY = targetY;/);
    assert.match(cursorSource, /cursorNode\.style\.opacity = "0";/);
  });
});

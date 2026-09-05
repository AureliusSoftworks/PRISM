import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("default Prism restores a rainbow phosphor aura only while talking", () => {
  assert.match(
    css,
    /\.zenLiveBotPresencePlate\[data-prism-persona="true"\]\[data-talking="true"\]:not\(\s*\[data-private-mode="true"\]\s*\)\s*\.zenLiveBotPresenceFace::before\s*\{[\s\S]*?background:\s*var\(--bot-face-frame-led-spectrum\);[\s\S]*?animation:\s*zenLivePrismRainbowPhosphor 1\.7s linear infinite;/,
  );
  assert.match(
    css,
    /@keyframes zenLivePrismRainbowPhosphor\s*\{[\s\S]*?rotate\(0deg\)[\s\S]*?rotate\(360deg\)/,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.zenLiveBotPresencePlate\[data-prism-persona="true"\]\[data-talking="true"\]:not\(\s*\[data-private-mode="true"\]\s*\)\s*\.zenLiveBotPresenceFace::before\s*\{[\s\S]*?animation:\s*none;/,
  );
  assert.match(
    css,
    /\.zenLiveBotPresencePlate\[data-prism-persona="true"\]\[data-talking="true"\]\s+\.zenLiveBotPresenceFaceGlyph\s+\[data-coffee-plate-emoji-part\]\s*\{[\s\S]*?--crt-prism-face-rim-strength-scale:\s*calc\(\s*var\(--crt-prism-face-glow-strength-scale,\s*1\) \* 0\.96\s*\)[\s\S]*?--crt-prism-face-halo-strength-scale:\s*calc\(\s*var\(--crt-prism-face-glow-strength-scale,\s*1\) \* 0\.86\s*\)[\s\S]*?--crt-glyph-emission-opacity:\s*1\s*;[\s\S]*?--crt-face-glow-filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\);/,
    "Prism talking keeps a visible spectrum bloom on the emission layer, not the core",
  );
  assert.match(
    css,
    /\.zenLiveBotPresencePlate\[data-prism-persona="true"\]\[data-talking="true"\][\s\S]*?\[data-crt-glyph-layer="true"\]::before\s*\{[\s\S]*?animation:\s*zenLivePrismFaceGlowHueRotate 1\.7s linear infinite;/,
    "only the Prism bloom clone receives the talking spectrum animation",
  );
  assert.match(
    css,
    /\[data-crt-glyph-layer="true"\]::before\s*\{[\s\S]*?opacity:\s*var\(--crt-glyph-emission-opacity,\s*1\);/,
    "the bloom clone has an explicit nonzero emission opacity contract",
  );
  const rainbowBloomRules = [
    ...css.matchAll(
      /([^{}]+)\{[^{}]*animation:\s*zenLivePrismFaceGlowHueRotate 1\.7s linear infinite;[^{}]*\}/g,
    ),
  ];
  assert.equal(rainbowBloomRules.length, 1);
  assert.match(
    rainbowBloomRules[0]?.[1] ?? "",
    /\[data-prism-persona="true"\]\[data-talking="true"\][\s\S]*?\[data-crt-glyph-layer="true"\]::before/,
    "non-default bot blooms never inherit Prism's spectrum animation",
  );
});

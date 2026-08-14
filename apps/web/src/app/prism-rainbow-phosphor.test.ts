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
});

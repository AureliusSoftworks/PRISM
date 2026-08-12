import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageCss = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const inkCss = readFileSync(
  new URL("./avatar-details-mask.module.css", import.meta.url),
  "utf8",
);
const inkSource = readFileSync(
  new URL("./AvatarDetailsMask.tsx", import.meta.url),
  "utf8",
);
const lowerGlyphCss = readFileSync(
  new URL("./phosphor-pixel-glyph.module.css", import.meta.url),
  "utf8",
);

function ruleFor(css: string, selector: string, marker?: string): string {
  const markerIndex = marker ? css.indexOf(marker) : -1;
  if (marker) assert.notEqual(markerIndex, -1, `Missing ${marker}`);
  const start = marker
    ? css.lastIndexOf(`${selector} {`, markerIndex)
    : css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing ${selector}`);
  const end = css.indexOf("}", start);
  assert.notEqual(end, -1, `Unclosed ${selector}`);
  return css.slice(start, end + 1);
}

describe("full-size CRT phosphor brush", () => {
  it("derives every beam and halo radius from one global focus scale", () => {
    const bodyRule = ruleFor(
      pageCss,
      ".zenLiveBotPresenceBody",
      "--zen-live-bot-body-frame-size",
    );
    assert.match(
      bodyRule,
      /--bot-phosphor-focus-radius-scale:\s*var\(--prism-crt-focus-radius-scale,\s*1\)/,
    );
    for (const token of [
      "beam-softness",
      "bloom-narrow-radius",
      "bloom-wide-radius",
      "halo-contact-radius",
      "halo-tight-radius",
      "halo-near-radius",
      "halo-mid-radius",
      "halo-far-radius",
      "halo-ambient-radius",
    ]) {
      assert.match(
        bodyRule,
        new RegExp(
          `--bot-phosphor-${token}:[\\s\\S]*?var\\(--bot-phosphor-focus-radius-scale\\)`,
        ),
      );
    }
  });

  it("uses the same coverage, crisp core, beam, and halo for face features and Ink", () => {
    assert.match(inkSource, /resamplePhosphorRgbaForPresentation\(/);
    assert.match(
      inkSource,
      /const resampleMode = pixelPerfectInk \? "nearest" : "coverage"/,
    );

    const inkBloomRule = ruleFor(inkCss, ".bloom");
    assert.match(
      inkBloomRule,
      /blur\(\s*var\(--bot-phosphor-beam-softness,\s*0\.45px\)\s*\)/,
    );
    for (const token of [
      "halo-contact-radius",
      "halo-tight-radius",
      "halo-near-radius",
      "halo-mid-radius",
      "halo-far-radius",
      "halo-ambient-radius",
    ]) {
      assert.match(inkBloomRule, new RegExp(`--bot-phosphor-${token}`));
    }

    const inkCoreRule = ruleFor(inkCss, ".core");
    assert.match(
      inkCoreRule,
      /--zen-live-bot-crt-flicker-base-filter:\s*none/,
    );
    assert.doesNotMatch(inkCoreRule, /blur\(/);

    assert.match(
      pageCss,
      /--crt-beam-softness:\s*var\(--bot-phosphor-beam-softness,\s*0\.45px\)/,
    );
    assert.match(
      pageCss,
      /--crt-glyph-beam-softness:\s*var\(--crt-beam-softness,\s*0\.45px\)/,
    );
    assert.match(
      pageCss,
      /--crt-face-glow-radius-scale:\s*var\(\s*--bot-phosphor-focus-radius-scale,/,
    );
    assert.match(
      lowerGlyphCss,
      /var\(--bot-phosphor-beam-softness,\s*0\.45px\)/,
    );
  });
});

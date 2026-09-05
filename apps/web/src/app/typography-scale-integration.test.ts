import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("universal typography scale integration", () => {
  it("renders five account presets in order and previews changes immediately", () => {
    assert.match(pageSource, /PRISM_TYPOGRAPHY_SCALE_VALUES\.map/);
    assert.match(pageSource, /data-typography-scale-selector="true"/);
    assert.match(pageSource, /name="typographyScale"/);
    assert.match(pageSource, /typographyScale: scale/);
    assert.match(pageSource, /applyPrismTypographyScaleToDocument/);
    assert.match(pageSource, /Standard is today&apos;s size/);
  });

  it("maps the conservative five-step scale onto the document root", () => {
    for (const [preset, pixels] of [
      ["compact", 14],
      ["small", 15],
      ["standard", 16],
      ["large", 17],
      ["extra-large", 18],
    ] as const) {
      assert.match(
        globalsCss,
        new RegExp(
          `data-prism-typography-scale="${preset}"[\\s\\S]*?--prism-type-root: ${pixels}px`,
        ),
      );
    }
    assert.match(globalsCss, /html \{[\s\S]*?font-size: var\(--prism-type-root\)/);
    assert.doesNotMatch(globalsCss, /data-prism-typography-scale[^}]*\bzoom:/);
    assert.doesNotMatch(
      globalsCss,
      /data-prism-typography-scale[^}]*\btransform:/,
    );
  });

  it("keeps dense Settings and navbar text on semantic roles with safe wrapping", () => {
    assert.match(
      pageCss,
      /\.settingsTypographyScaleGrid \{[\s\S]*?repeat\(auto-fit, minmax\(9\.5rem, 1fr\)\)/,
    );
    assert.match(
      pageCss,
      /\.settingsTypographyScaleOption small \{[\s\S]*?overflow-wrap: anywhere/,
    );
    assert.match(
      pageCss,
      /--font-size-message: 1rem;[\s\S]*?--font-size-compose: 1rem;/,
    );
    assert.match(
      pageCss,
      /\.sharedAppletHeader[\s\S]*?\.chatHeader h2 \{[\s\S]*?font-size: var\(--prism-type-body-large\)/,
    );
  });
});

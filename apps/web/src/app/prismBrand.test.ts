import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PRISM_BRAND_COLORS,
  PRISM_BRAND_COPY,
  PRISM_BRAND_MARKS,
} from "./prismBrand.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const manifestSource = readFileSync(
  new URL("./manifest.ts", import.meta.url),
  "utf8",
);
const landingSource = readFileSync(
  new URL("./prism/page.tsx", import.meta.url),
  "utf8",
);
const emblemSource = readFileSync(
  new URL("../../public/refraction-emblem.svg", import.meta.url),
  "utf8",
);
const appEmblemSource = pageSource.slice(
  pageSource.indexOf("function PrismRefractionEmblem"),
  pageSource.indexOf("// ── Chat-mode picker geometry"),
);

describe("PRISM brand system", () => {
  it("keeps the user as the creative source", () => {
    assert.equal(
      PRISM_BRAND_COPY.coreBelief,
      "You are the light. Prism reveals the spectrum.",
    );
    assert.equal(PRISM_BRAND_COPY.slogan, "One light. Many colors.");
    assert.match(PRISM_BRAND_COPY.foundationalTruth, /does not create/u);
  });

  it("uses the canonical slogan across current brand-facing surfaces", () => {
    for (const source of [
      pageSource,
      layoutSource,
      manifestSource,
      landingSource,
    ]) {
      assert.match(source, /PRISM_BRAND_COPY\.slogan/u);
    }

    const brandSurfaceSource = [
      pageSource,
      layoutSource,
      manifestSource,
      landingSource,
    ].join("\n");
    assert.doesNotMatch(
      brandSurfaceSource,
      /Private by default\. Creative by design\.|Local-first AI playground/u,
    );
  });

  it("keeps one canonical five-color signature palette", () => {
    assert.deepEqual(Object.keys(PRISM_BRAND_COLORS), [
      "p",
      "r",
      "i",
      "s",
      "m",
    ]);
    for (const color of Object.values(PRISM_BRAND_COLORS)) {
      assert.match(color, /^#[0-9a-f]{6}$/u);
      assert.match(emblemSource, new RegExp(color, "iu"));
    }
  });

  it("treats the refraction emblem, wordmark, and triangle as distinct roles", () => {
    assert.deepEqual(PRISM_BRAND_MARKS, {
      primary: "refraction-emblem",
      signature: "wordmark",
      compact: "triangle",
    });
    assert.match(pageSource, /function PrismRefractionEmblem/u);
    assert.match(pageSource, /data-prism-refraction-part="source-light"/u);
    assert.match(pageSource, /data-prism-refraction-part="spectrum"/u);
    assert.doesNotMatch(pageSource, /function GlyphSandbox/u);
  });

  it("pins the exact original Sandbox emblem geometry", () => {
    const exactPaths = [
      "M24 8 L10 34 L38 34 Z",
      "M2 24 L15 24",
      "M31 24 L46 8",
      "M31 24 L46 16",
      "M31 24 L46 24",
      "M31 24 L46 32",
      "M31 24 L46 40",
    ];

    assert.match(appEmblemSource, /viewBox="0 0 48 48"/u);
    assert.match(emblemSource, /viewBox="0 0 48 48"/u);
    for (const path of exactPaths) {
      assert.equal(appEmblemSource.includes(path), true, `missing app path: ${path}`);
      assert.equal(emblemSource.includes(path), true, `missing asset path: ${path}`);
    }
    assert.match(appEmblemSource, /strokeWidth=\{2\}[\s\S]*opacity="0\.55"/u);
    assert.match(emblemSource, /stroke-width="2"[\s\S]*opacity="0\.55"/u);
    assert.doesNotMatch(emblemSource, /keyline/u);
  });
});

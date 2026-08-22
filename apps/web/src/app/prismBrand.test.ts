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
const companionCss = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const orbCss = readFileSync(
  new URL("./prism-orb.module.css", import.meta.url),
  "utf8",
);
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const globalsCss = readFileSync(
  new URL("./globals.css", import.meta.url),
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

  it("keeps Default Prism identity monochrome while spectrum emitters stay rainbow", () => {
    assert.match(
      pageSource,
      /const PRISM_DEFAULT_IDENTITY_INK = \{\s*dark: "#f7fbff",\s*light: "#242a33",\s*\} as const;/u,
    );
    assert.match(
      pageSource,
      /if \(options\.prismPersona\) return prismDefaultAccentStyle\(resolvedTheme\);/u,
    );
    assert.doesNotMatch(
      pageSource,
      /const PRISM_DEFAULT_ACCENT = PRISM_COLORS\.s/u,
    );
    assert.match(
      pageSource,
      /memoryPanelScope === "bot"[\s\S]{0,180}: prismDefaultAccentForTheme\(resolvedTheme\)/u,
    );
    assert.match(
      pageSource,
      /label: "Switch Prism app"[\s\S]{0,260}accent: prismDefaultAccentForTheme\(resolvedTheme\)/u,
    );
    assert.match(
      pageSource,
      /const debateAvatarAccentColor = playerJudgePrism\s*\? prismDefaultAccentForTheme\(resolvedTheme\)[\s\S]{0,180}: botOrPrismAccentForTheme/u,
    );
    assert.match(
      pageSource,
      /playerJudgePrism\s*\? prismDefaultAccentStyle\(resolvedTheme\)\s*:\s*botAccentStyle\(botSnapshot\.color, resolvedTheme\)/u,
    );
    assert.match(
      pageSource,
      /data-signal-role=\{avatarState\.role\}[\s\S]{0,1200}\.\.\.prismDefaultAccentStyle\(renderTheme\)/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-prism-persona="true"\][\s\S]{0,180}--coffee-bot-color:\s*#f7fbff/u,
    );
    assert.match(
      pageCss,
      /--bot-face-frame-led-spectrum:\s*conic-gradient\([\s\S]{0,220}#ff3f6f[\s\S]{0,120}#31d7ff[\s\S]{0,80}#8b7cff/u,
    );
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

  it("maps companion and focus I accents to brand lime, not cyan", () => {
    assert.match(companionCss, /--companion-i:\s*#b7e63a/u);
    assert.match(companionCss, /--companion-s:\s*#2fd3e3/u);
    assert.match(companionCss, /--companion-m:\s*#7b5cff/u);
    assert.doesNotMatch(companionCss, /--companion-i:\s*#6fe3ff/u);
    assert.match(orbCss, /--prism-orb-i:\s*var\(--companion-i,\s*#b7e63a\)/u);
    assert.match(globalsCss, /var\(--prism-i,\s*#b7e63a\)/u);
    assert.match(
      pageCss,
      /settingsSection\[data-settings-section="behavior"\][\s\S]*?--settings-section-color:\s*#b7e63a/u,
    );
  });

  it("skins developer chrome in bronze outside the brand spectrum", () => {
    assert.match(pageCss, /--prism-dev-accent:\s*#b8895a/u);
    assert.match(pageCss, /--prism-dev-accent-strong:\s*#d4a574/u);
    assert.match(
      pageCss,
      /settingsSection\[data-settings-section="experimental"\][\s\S]*?--settings-section-color:\s*var\(--prism-dev-accent/u,
    );
    assert.doesNotMatch(pageCss, /#48d6c8/u);
  });
});

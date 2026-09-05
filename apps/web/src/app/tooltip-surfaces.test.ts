import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const glyphTooltipCss = readFileSync(
  new URL("./glyph-tooltip.module.css", import.meta.url),
  "utf8",
);
const debateCss = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);

function ruleFor(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u"))?.[1] ?? ""
  );
}

function assertOpaqueTooltipChrome(rule: string, label: string): void {
  assert.notEqual(rule, "", `${label} must exist`);
  const backgroundRule = rule.match(/background:\s*([^;]+)\s*;/u)?.[1];
  assert.ok(backgroundRule, `${label} must set a background`);
  assert.match(
    backgroundRule,
    /var\(--prism-tooltip-bg\)/u,
    `${label} must use the shared opaque tooltip token so portaled labels still paint a card`,
  );
  assert.doesNotMatch(
    rule,
    /background:[^;]*(?:transparent|rgba\()/u,
    `${label} must not use a see-through background`,
  );
  assert.match(rule, /border:\s*1px solid var\(--prism-tooltip-border\)/u);
  assert.match(rule, /color:\s*var\(--prism-tooltip-fg\)/u);
  assert.match(rule, /box-shadow:\s*var\(--prism-tooltip-shadow\)/u);
}

describe("tooltip surfaces", () => {
  it("publishes opaque tooltip tokens at :root and on the light body theme", () => {
    const root = globalsCss.match(/:root\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
    assert.match(root, /--prism-tooltip-bg:\s*#151311/u);
    assert.match(root, /--prism-tooltip-fg:\s*#edf3f8/u);
    assert.match(root, /--prism-tooltip-border:\s*#342f2a/u);
    assert.match(root, /--prism-tooltip-shadow:/u);

    const lightBody =
      globalsCss.match(
        /body\[data-prism-theme="light"\]\s*\{([\s\S]*?)\n\}/u,
      )?.[1] ?? "";
    assert.match(lightBody, /--prism-tooltip-bg:\s*#ffffff/u);
    assert.match(lightBody, /--prism-tooltip-fg:\s*#172638/u);
    assert.match(lightBody, /--prism-tooltip-border:\s*#b7c9d8/u);
  });

  it("keeps every authored tooltip surface opaque", () => {
    const tooltipRules = [
      [".glyphTooltip", ruleFor(glyphTooltipCss, ".glyphTooltip")],
      [".panelSectionInfoTooltip", ruleFor(pageCss, ".panelSectionInfoTooltip")],
      [".messageMoodTooltip", ruleFor(pageCss, ".messageMoodTooltip")],
      [
        ".promptCenterPromptWildcardTooltip",
        ruleFor(pageCss, ".promptCenterPromptWildcardTooltip"),
      ],
      [".botParameterHelpTooltip", ruleFor(pageCss, ".botParameterHelpTooltip")],
      [".juryThoughtPreview", ruleFor(debateCss, ".juryThoughtPreview")],
    ] as const;

    for (const [label, rule] of tooltipRules) {
      if (
        label === ".messageMoodTooltip" ||
        label === ".juryThoughtPreview"
      ) {
        assert.notEqual(rule, "", `${label} must exist`);
        const backgroundRule = rule.match(/background:\s*([^;]+)\s*;/u)?.[1];
        assert.ok(backgroundRule, `${label} must set a background`);
        assert.match(
          backgroundRule,
          /(?:var\(--bg-surface\)|var\(--prism-tooltip-bg\)|color-mix\(|#[0-9a-f]{6})/iu,
        );
        assert.doesNotMatch(rule, /background:[^;]*(?:transparent|rgba\()/u);
        continue;
      }
      assertOpaqueTooltipChrome(rule, label);
    }

    const radialPreviewTooltip = pageCss.match(
      /\.botAvatarPreviewModeToggle\s+button::after\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(radialPreviewTooltip);
    assert.match(
      radialPreviewTooltip,
      /background:\s*var\(--prism-tooltip-bg\)\s*;/u,
    );
  });

  it("marks portaled and inline help tooltips for the shared chrome contract", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const glyphSource = readFileSync(
      new URL("./GlyphTooltipLayer.tsx", import.meta.url),
      "utf8",
    );
    assert.match(glyphSource, /data-prism-tooltip="true"/u);
    assert.match(
      pageSource,
      /className=\{styles\.panelSectionInfoTooltip\}[\s\S]{0,80}data-prism-tooltip="true"/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.promptCenterPromptWildcardTooltip\}[\s\S]{0,80}data-prism-tooltip="true"/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.botParameterHelpTooltip\}[\s\S]{0,80}data-prism-tooltip="true"/u,
    );
  });

  it("hides glyph tooltips while a dropdown picker is open", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const glyphSource = readFileSync(
      new URL("./GlyphTooltipLayer.tsx", import.meta.url),
      "utf8",
    );
    assert.match(glyphSource, /export function glyphTooltipIsSuppressedForAnchor/u);
    assert.match(glyphSource, /data-navbar-picker-surface="true"/u);
    assert.match(glyphSource, /data-compose-model-menu="true"/u);
    assert.match(glyphSource, /prism:navbar-picker-open/u);
    assert.match(
      glyphSource,
      /glyphTooltipIsSuppressedForAnchor\(anchor\)/u,
    );
    assert.match(
      pageSource,
      /data-glyph-tooltip=\{\s*menuOpen\s*\?\s*undefined\s*:\s*loading/u,
    );
    assert.match(
      pageSource,
      /data-glyph-tooltip=\{effortMenuOpen \? undefined : effortTriggerTooltip\}/u,
    );
  });
});

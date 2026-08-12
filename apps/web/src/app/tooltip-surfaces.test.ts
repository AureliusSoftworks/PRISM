import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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

describe("tooltip surfaces", () => {
  it("keeps every authored tooltip surface opaque", () => {
    const tooltipRules = [
      ruleFor(glyphTooltipCss, ".glyphTooltip"),
      ruleFor(pageCss, ".panelSectionInfoTooltip"),
      ruleFor(pageCss, ".messageMoodTooltip"),
      ruleFor(pageCss, ".promptCenterPromptWildcardTooltip"),
      ruleFor(pageCss, ".botParameterHelpTooltip"),
      ruleFor(debateCss, ".juryThoughtPreview"),
    ];

    for (const rule of tooltipRules) {
      assert.notEqual(rule, "");
      const backgroundRule = rule.match(/background:\s*([^;]+)\s*;/u)?.[1];
      assert.ok(backgroundRule);
      assert.match(backgroundRule, /(?:var\(--bg-surface\)|color-mix\(|#[0-9a-f]{6})/iu);
      assert.doesNotMatch(rule, /background:[^;]*(?:transparent|rgba\()/u);
    }

    const radialPreviewTooltip = pageCss.match(
      /button::after\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(radialPreviewTooltip);
    assert.match(radialPreviewTooltip, /background:\s*#[0-9a-f]{6}\s*;/u);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const orbCss = readFileSync(
  new URL("./prism-orb.module.css", import.meta.url),
  "utf8",
);
const companionCss = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const tabsCss = readFileSync(
  new URL("./prism-companion-view-tabs.module.css", import.meta.url),
  "utf8",
);

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u"));
  assert.ok(match, `missing ${selector}`);
  return match[1] ?? "";
}

function groupedRule(css: string, firstSelector: string): string {
  const start = css.indexOf(firstSelector);
  assert.ok(start >= 0, `missing ${firstSelector}`);
  const end = css.indexOf("}\n", start);
  assert.ok(end >= 0, `unterminated ${firstSelector}`);
  return css.slice(start, end + 1);
}

describe("Prism companion light material", () => {
  it("uses a pearl orb with a visible triangle only under the light selector", () => {
    const lightOrb = rule(orbCss, ':global([data-theme="light"]) .orb');
    const lightGlyph = rule(orbCss, ':global([data-theme="light"]) .orb svg');
    assert.match(lightOrb, /#fffefb|#e9f4ff/u);
    assert.doesNotMatch(lightOrb, /#080b13|#15202b|#0008/u);
    assert.match(lightGlyph, /stroke:\s*#263d59/u);
  });

  it("uses a cool separation field and translucent panels only in light mode", () => {
    const lightFocus = rule(
      companionCss,
      ':global([data-theme="light"]) .focusOrb',
    );
    const lightPanels = groupedRule(
      companionCss,
      ':global([data-theme="light"]) .bubble,',
    );
    assert.match(lightFocus, /#dcefff/u);
    assert.doesNotMatch(lightFocus, /#020307/u);
    assert.match(lightPanels, /#ffffffd9/u);
    assert.match(lightPanels, /color:\s*#1f3148/u);
  });

  it("keeps the Synthesis, Chat, and Notes switcher luminous in light mode", () => {
    const selectedTab = rule(
      tabsCss,
      ':global([data-theme="light"]) .tab[aria-selected="true"]',
    );
    assert.match(selectedTab, /linear-gradient/u);
    assert.match(selectedTab, /color:\s*#203c56/u);
  });
});

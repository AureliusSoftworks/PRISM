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

  it("gives only the light tiny wielding pearl a compact prismatic rim", () => {
    const lightTinyAvatar = rule(
      companionCss,
      ':global(body[data-prism-theme="light"]) .anchor[data-wielding="true"] .avatar',
    );
    const lightTinyHalo = rule(
      companionCss,
      ':global(body[data-prism-theme="light"]) .anchor[data-wielding="true"] .avatar::before',
    );
    const lightTinyPearl = rule(
      companionCss,
      ':global(body[data-prism-theme="light"]) .anchor[data-wielding="true"] .avatar::after',
    );
    const wieldingAnchor = rule(
      companionCss,
      '.anchor[data-wielding="true"]',
    );

    assert.match(wieldingAnchor, /width:\s*28px/u);
    assert.match(wieldingAnchor, /height:\s*28px/u);
    assert.match(lightTinyAvatar, /#668ca066/u);
    assert.match(lightTinyHalo, /conic-gradient/u);
    assert.match(lightTinyHalo, /#ff7894/u);
    assert.match(lightTinyHalo, /#42d7e5/u);
    assert.match(lightTinyPearl, /#f7fbff/u);
    assert.match(lightTinyPearl, /border-color:\s*#a8bed0/u);
    assert.doesNotMatch(
      `${lightTinyAvatar}${lightTinyHalo}${lightTinyPearl}`,
      /#000|black/u,
    );
  });
});

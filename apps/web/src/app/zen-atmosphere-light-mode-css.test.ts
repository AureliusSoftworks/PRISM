import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

function ruleForExactSelector(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(
    new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"),
  );
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1]!;
}

describe("light-mode zen atmosphere wallpaper visibility", () => {
  it("keeps wallpaper on a normal blend in light mode instead of multiply", () => {
    const imgRule = ruleForExactSelector(".themeLight .zenAtmosphereBackdrop img");
    assert.match(imgRule, /mix-blend-mode:\s*normal/);
    assert.doesNotMatch(imgRule, /mix-blend-mode:\s*multiply/);
    assert.match(imgRule, /opacity:\s*calc\(/);
    assert.match(imgRule, /\*\s*2\.35/);
  });

  it("softens the light-mode readability frost, and removes it while replying", () => {
    const overlayRule = ruleForExactSelector(
      ".themeLight .zenAtmosphereReadabilityOverlay",
    );
    assert.match(
      overlayRule,
      /opacity:\s*calc\(var\(--zen-atmosphere-overlay-opacity,\s*0\)\s*\*\s*0\.42\)/,
    );
    assert.match(overlayRule, /backdrop-filter:\s*blur\(28px\)/);
    assert.doesNotMatch(overlayRule, /blur\(104px\)/);

    const liveRule = ruleForExactSelector(
      ".themeLight\n  .messagesFrame[data-replying-live=\"true\"]\n  .zenAtmosphereReadabilityOverlay",
    );
    assert.match(liveRule, /opacity:\s*0\s*;/);
    assert.match(liveRule, /backdrop-filter:\s*none/);
  });

  it("does not cover light-mode wallpaper with an opaque deep plate", () => {
    const backdropRule = ruleForExactSelector(
      ".themeLight .zenAtmosphereBackdrop",
    );
    assert.match(
      backdropRule,
      /color-mix\(in srgb, var\(--bg-surface\) 42%, transparent\)/,
    );
    assert.doesNotMatch(backdropRule, /var\(--bg-deep\)\s*;/);
  });

  it("keeps the light-mode chat plate transparent when atmosphere is active", () => {
    assert.match(
      css,
      /data-zen-atmosphere-active="true"\]\[data-bot-gradient-active="true"/,
    );
    assert.match(
      css,
      /var\(--bot-chat-persona-fill,\s*0\)\s*\*\s*22%/,
    );
  });
});

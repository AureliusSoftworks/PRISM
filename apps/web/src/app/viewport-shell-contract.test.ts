import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function cssRuleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    cssSource.match(new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "mu"))?.[1] ??
    ""
  );
}

describe("responsive PRISM shell", () => {
  it("fills the logical viewport without a fixed 1280 by 900 canvas", () => {
    const appLayoutRule = cssRuleBody(".appLayout");

    assert.match(appLayoutRule, /width:\s*100%;/u);
    assert.match(appLayoutRule, /min-width:\s*0;/u);
    assert.match(appLayoutRule, /min-height:\s*0;/u);
    assert.match(appLayoutRule, /height:\s*100dvh;/u);
    assert.match(appLayoutRule, /overflow:\s*hidden;/u);
    assert.doesNotMatch(cssSource, /max\(100vw,\s*1280px\)/u);
    assert.doesNotMatch(cssSource, /max\(100dvh,\s*900px\)/u);
  });

  it("uses the existing compact drawer and phone layouts instead of blocking them", () => {
    assert.match(
      cssSource,
      /@media \(min-width: 561px\) and \(max-width: 1080px\) \{[\s\S]*?\.appLayout \{[\s\S]*?grid-template-columns:\s*1fr;/u,
    );
    assert.match(
      cssSource,
      /@media \(max-width: 720px\) \{[\s\S]*?\.appLayout \{[\s\S]*?height:\s*100svh;/u,
    );
    assert.doesNotMatch(pageSource, /DesktopViewportNotice/u);
    assert.doesNotMatch(pageSource, /Scale your viewport up/u);
  });

  it("bounds global drawers to the real viewport", () => {
    assert.match(
      cssSource,
      /--panel-width:\s*min\(479px,\s*calc\(100vw - 32px\)\);/u,
    );
    assert.match(
      cssSource,
      /--panel-width:\s*min\(1040px,\s*calc\(100vw - 32px\)\);/u,
    );
    assert.match(cssSource, /max-height:\s*calc\(100dvh - 40px\);/u);
  });
});

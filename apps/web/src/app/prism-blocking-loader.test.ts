import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./PrismBlockingLoader.tsx", import.meta.url), "utf8");
const css = readFileSync(
  new URL("./prism-blocking-loader.module.css", import.meta.url),
  "utf8",
);

describe("PrismBlockingLoader", () => {
  it("blocks the full app through a body portal and restores it on exit", () => {
    assert.match(source, /createPortal\([\s\S]*document\.body/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /element\.setAttribute\("inert", ""\)/u);
    assert.match(source, /element\.removeAttribute\("inert"\)/u);
    assert.match(source, /document\.body\.style\.overflow = "hidden"/u);
    assert.match(source, /previouslyFocused\.focus/u);
    assert.match(css, /position:\s*fixed;[\s\S]{0,80}inset:\s*0/iu);
  });

  it("communicates determinate and indeterminate PRISM progress accessibly", () => {
    assert.match(source, /role="progressbar"/u);
    assert.match(source, /aria-valuenow=\{progressPercent \?\? undefined\}/u);
    assert.match(source, /data-indeterminate=/u);
    assert.match(css, /var\(--prism-p\)[\s\S]*var\(--prism-r\)[\s\S]*var\(--prism-i\)[\s\S]*var\(--prism-s\)[\s\S]*var\(--prism-m\)/u);
    assert.match(css, /prefers-reduced-motion:\s*reduce/iu);
    assert.match(css, /\.backdrop\[data-theme="light"\]/u);
  });

  it("offers explicit click and keyboard cancellation only when supported", () => {
    assert.match(source, /onCancel\?: \(\) => void/u);
    assert.match(source, /aria-label=\{cancelLabel\}/u);
    assert.match(source, /className=\{styles\.cancelButton\}/u);
    assert.match(source, /event\.key === "Escape"[\s\S]{0,100}onCancel\?\.\(\)/u);
    assert.match(source, /cancelButtonRef\.current \?\? rootRef\.current/u);
    assert.match(css, /\.cancelButton\s*\{/u);
  });
});

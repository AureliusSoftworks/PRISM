import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("triple-clicking a code block copies its contents", () => {
  assert.match(
    pageSource,
    /if \(event\.detail >= 3\) \{\s*void handleCopy\(\);\s*return;/u
  );
  assert.match(pageSource, /className=\{styles\.markdownCodeCopyStatus\}/u);
  assert.match(pageSource, /role="status"\s*aria-live="polite"/u);
  assert.match(pageSource, /✓ Copied!/u);
});

test("collapsible code blocks retain the original Chat reading width", () => {
  assert.doesNotMatch(stylesSource, /--zen-code-reading-width/u);
  assert.doesNotMatch(pageSource, /data-has-code-block/u);
  assert.match(stylesSource, /--chat-reading-width:\s*min\(var\(--zen-live-bot-prose-width, 860px\), 94%\)/u);
});

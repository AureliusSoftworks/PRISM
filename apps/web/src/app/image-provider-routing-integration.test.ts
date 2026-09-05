import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

describe("independent image provider routing", () => {
  it("gives the Images panel its own provider control", () => {
    const picker = sourceBetween(
      "const renderImagesPanelModelPicker",
      "const visibleConversations",
    );
    assert.match(picker, /effectiveImageProvider/u);
    assert.match(picker, /renderImageProviderModeToggle/u);
    assert.doesNotMatch(picker, /renderProviderModeToggle/u);
  });

  it("routes image generation through the image lane, not the chat lane", () => {
    const generation = sourceBetween(
      "function createQueuedImageGeneration",
      "function drainImageGenerationQueue",
    );
    assert.match(generation, /let provider = effectiveImageProvider/u);
    assert.match(generation, /if \(effectiveImageProvider !== "local"\)/u);
    assert.match(generation, /requestBody\.preferredProvider/u);
    assert.doesNotMatch(generation, /effectivePreferredProvider/u);
  });

  it("discloses the online image boundary without changing chat routing", () => {
    assert.match(
      pageSource,
      /Image prompts and required visual context go to OpenAI; chat routing is unchanged\./u,
    );
    assert.match(pageSource, /Images \$\{imageModeLabel\} · chat \$\{chatModeLabel\}/u);
  });

  it("gives the Settings toggle enough room for complete rounded edges", () => {
    const start = cssSource.indexOf(".settingsImageProviderMode {");
    const end = cssSource.indexOf("}", start);
    assert.ok(start >= 0 && end > start);
    const rule = cssSource.slice(start, end);
    assert.match(rule, /justify-self: start;/u);
    assert.match(rule, /margin: 2px;/u);
    assert.match(rule, /padding-inline: 5px;/u);
  });
});

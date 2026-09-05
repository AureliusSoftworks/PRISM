import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8");
const overlayCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Signal setup composer caret", () => {
  it("shares one content box between the overlay words and the native caret", () => {
    assert.match(
      overlayCss,
      /\.composeTextareaVisualOverlay\s*\{[\s\S]*?inset:\s*var\(--compose-textarea-overlay-inset, 1px\);[\s\S]*?padding:\s*var\(--compose-textarea-overlay-padding\)/u,
    );
    assert.match(
      css,
      /\.shell\s+\.pickAwareSetupField\s*\{[\s\S]*?--compose-textarea-padding:\s*10px 11px;[\s\S]*?--compose-textarea-overlay-inset:\s*1px;[\s\S]*?--compose-textarea-overlay-padding:\s*var\(--compose-textarea-padding\)/u,
    );
    assert.match(
      css,
      /\.shell\s+\.pickAwareSetupField\s+textarea\s*\{[\s\S]*?padding:\s*var\(--compose-textarea-padding\);[\s\S]*?font-size:\s*var\(--compose-textarea-font-size\);[\s\S]*?line-height:\s*var\(--compose-textarea-line-height\)/u,
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const policySource = readFileSync(
  new URL("./DisableNativeTextCorrection.tsx", import.meta.url),
  "utf8",
);

test("root layout installs the native text-correction fallback", () => {
  assert.match(layoutSource, /spellCheck=\{false\}/u);
  assert.match(layoutSource, /autoCorrect="off"/u);
  assert.match(layoutSource, /<DisableNativeTextCorrection\s*\/>/u);
});

test("fallback covers current and dynamically mounted editable text without changing intentional completion", () => {
  assert.match(policySource, /input, textarea, \[contenteditable\]/u);
  assert.match(policySource, /textEntry\.spellcheck = false/u);
  assert.match(policySource, /setAttribute\("autocorrect", "off"\)/u);
  assert.match(policySource, /getAttribute\("spellcheck"\) !== "false"/u);
  assert.match(policySource, /getAttribute\("autocorrect"\) !== "off"/u);
  assert.match(policySource, /MutationObserver/u);
  assert.match(
    policySource,
    /__PRISM_NATIVE_TEXT_CORRECTION_POLICY__ === true/u,
  );
  assert.match(policySource, /attributeFilter: \["spellcheck", "autocorrect"\]/u);
  assert.doesNotMatch(
    policySource,
    /(?:setAttribute|removeAttribute)\(["']auto(?:complete|capitalize)/iu,
  );
});

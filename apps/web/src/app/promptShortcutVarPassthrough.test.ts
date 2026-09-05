import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearLeftoverPromptShortcutVarPassthrough,
  resolvePromptShortcutBodyVarPassthrough,
} from "./promptShortcutVarPassthrough.ts";

describe("prompt shortcut {VAR} passthrough", () => {
  it("splices trailing composer text into {VAR} and consumes the trailing slice", () => {
    const body =
      'Say nothing other than the text following this prompt:\n\n"{VAR}"';
    const result = resolvePromptShortcutBodyVarPassthrough(
      body,
      " hello world!",
    );
    assert.equal(result.consumeTrailing, true);
    assert.equal(result.passthrough, "hello world!");
    assert.equal(
      result.prompt,
      'Say nothing other than the text following this prompt:\n\n"hello world!"',
    );
  });

  it("allows empty capture for bare /prompt with {VAR}", () => {
    const result = resolvePromptShortcutBodyVarPassthrough('Say "{VAR}"', "");
    assert.equal(result.consumeTrailing, true);
    assert.equal(result.passthrough, "");
    assert.equal(result.prompt, 'Say ""');
  });

  it("leaves trailing text alone when the template has no {VAR}", () => {
    const result = resolvePromptShortcutBodyVarPassthrough(
      "Be a pirate.",
      " ahoy",
    );
    assert.equal(result.consumeTrailing, false);
    assert.equal(result.passthrough, null);
    assert.equal(result.prompt, "Be a pirate.");
  });

  it("fills every {VAR} with the same captured text", () => {
    const result = resolvePromptShortcutBodyVarPassthrough(
      "First {VAR}, then {var}.",
      "  same blob",
    );
    assert.equal(result.prompt, "First same blob, then same blob.");
    assert.equal(result.passthrough, "same blob");
  });

  it("treats legacy numbered {VAR1}/{VAR2} as the same shared capture", () => {
    const result = resolvePromptShortcutBodyVarPassthrough(
      "A {VAR1} and B {VAR2}",
      " one value",
    );
    assert.equal(result.prompt, "A one value and B one value");
    assert.equal(result.passthrough, "one value");
  });

  it("clears leftover {VAR} tokens to an empty string", () => {
    const cleared = clearLeftoverPromptShortcutVarPassthrough(
      'Orphan "{VAR}" token',
    );
    assert.equal(cleared.prompt, 'Orphan "" token');
  });
});

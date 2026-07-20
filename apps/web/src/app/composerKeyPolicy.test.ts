import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy.ts";

describe("composer Enter key policy", () => {
  it("submits on plain Enter", () => {
    assert.equal(
      shouldSubmitComposerOnEnter({ key: "Enter", shiftKey: false }),
      true,
    );
  });

  it("keeps Shift+Enter available for multiline input", () => {
    assert.equal(
      shouldSubmitComposerOnEnter({ key: "Enter", shiftKey: true }),
      false,
    );
  });

  it("does not submit while an IME composition is active", () => {
    assert.equal(
      shouldSubmitComposerOnEnter({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
      }),
      false,
    );
  });

  it("ignores non-Enter keys", () => {
    assert.equal(
      shouldSubmitComposerOnEnter({ key: "Tab", shiftKey: false }),
      false,
    );
  });
});

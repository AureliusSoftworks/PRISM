import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Prompt Center whitespace preservation", () => {
  it("keeps authored prompt body whitespace through expand, insert, and send", () => {
    assert.match(
      pageSource,
      /resolvePromptRandomizationGroups\(\s*command\.command,/u,
    );
    assert.doesNotMatch(
      pageSource,
      /resolvePromptRandomizationGroups\(\s*command\.command\.trim\(\)/u,
    );
    assert.match(
      pageSource,
      /const body = command\.command;\s*if \(!body\.trim\(\)\) return null;/u,
    );
    assert.match(
      pageSource,
      /outboundPrompt = commandCenterPromptActive\s*\?\s*preservePromptBodyWhitespace\(expandedPrompt\)/u,
    );
    assert.match(
      pageSource,
      /resolvedCommandCenterPrompt: outboundPrompt/u,
    );
    assert.match(
      pageSource,
      /const resolvedPrompt = preservePromptBodyWhitespace\(prompt\)/u,
    );
  });
});

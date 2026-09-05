import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee contextual Auto request routing", () => {
  it("sends a binary privacy lane for every Coffee request", () => {
    assert.match(
      pageSource,
      /const coffeeResponseModeForSend = responseModeForProvider\(/u,
    );
    assert.equal(
      pageSource.match(/responseMode: coffeeResponseModeForSend(?!Ref)/gu)
        ?.length,
      6,
    );
    assert.equal(
      pageSource.match(/responseMode: coffeeResponseModeForSendRef\.current/gu)
        ?.length,
      2,
    );
    assert.doesNotMatch(
      pageSource,
      /responseMode:\s*settings\?\.autoModeEnabled\s*&&\s*!coffeeAnyOfflineProtected/gu,
    );
  });
});

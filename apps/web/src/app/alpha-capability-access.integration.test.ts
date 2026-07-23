import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("alpha capability access", () => {
  it("keeps Marketplace, Signal, and Coffee visible without milestone gates", () => {
    assert.doesNotMatch(
      pageSource,
      /capabilityRevelations\.(?:marketplace|signal|coffee)\.revealed/u,
    );
    assert.match(pageSource, /<strong>Marketplace<\/strong>/u);
    assert.match(pageSource, /id: "experience-signal"/u);
    assert.match(pageSource, /id: "experience-coffee"/u);
  });

  it("does not mutate capability access after completed events", () => {
    assert.doesNotMatch(apiSource, /revealSignalAfterZenReplyMilestone/u);
    assert.doesNotMatch(apiSource, /revealLivingShellCapability/u);
    assert.doesNotMatch(apiSource, /"\/api\/living-shell\/reveal"/u);
  });
});

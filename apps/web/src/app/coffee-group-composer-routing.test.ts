import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8"
).replace(/\s+/gu, " ");

describe("Coffee group dashboard composer routing", () => {
  it("renders a Start Session action instead of an editable composer", () => {
    assert.match(
      pageSource,
      /coffeeSessionPhase === "selecting" && !conversationActive && coffeeSelectedGroup !== null/
    );
    assert.match(pageSource, /data-coffee-group-start-composer="true"/);
    assert.match(pageSource, /`Start session with \$\{coffeeGroupStartCount\}`/);
    assert.match(pageSource, /void startCoffeeSessionFromGroup\(\);/);
    assert.match(
      pageSource,
      /coffeeGroupStartComposerVisible\s*\? renderCoffeeGroupStartComposer\(\)/
    );
  });

  it("keeps the typed topic composer behind an active Coffee conversation", () => {
    const shellStart = pageSource.indexOf("const renderCoffeeShell = ()");
    const shellEnd = pageSource.indexOf("return (", shellStart);
    assert.ok(shellStart >= 0 && shellEnd > shellStart);
    const shellSetup = pageSource.slice(shellStart, shellEnd);

    assert.match(
      shellSetup,
      /const coffeeComposerVisible =\s*conversationActive &&/
    );
    assert.match(
      shellSetup,
      /coffeeSessionPhase === "topic"/
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pickerSource = readFileSync(
  new URL("./BotPicker.tsx", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

function sourceAround(source: string, marker: string): string {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `Missing bot-search marker: ${marker}`);
  return source.slice(Math.max(0, index - 4_000), index + 4_000);
}

describe("global singleton-result bot search keyboard contract", () => {
  it("lives in the shared picker used by Signal and Debate", () => {
    assert.match(pickerSource, /handleBotSearchSingletonKey\(/u);
    assert.match(pickerSource, /singleActionableResult/u);
    assert.match(pickerSource, /onSingleActionableResultSelect/u);
    assert.equal(
      signalSource.match(/singleActionableResult=/gu)?.length,
      2,
    );
    assert.match(
      debateSource,
      /singleActionableResult=\{singleActionableCastPickerBot\}/u,
    );
    assert.match(debateSource, /chooseCastPickerBot/u);
  });

  it("covers every bespoke bot-search surface", () => {
    for (const marker of [
      'placeholder="Filter bots..."',
      'aria-label="Search bots by name"',
      'searchAriaLabel: "Search bots for Chat"',
      'aria-label="Search bots in this group"',
      'aria-label="Search available bots"',
      'aria-label="Search bots by name or purpose"',
      'aria-label="Search inspiration bots"',
      'searchAriaLabel: "Search bots for Coffee Group"',
      'aria-label="Search bots for Story Mode"',
    ]) {
      assert.match(
        sourceAround(pageSource, marker),
        /handleBotSearchSingletonKey\(/u,
        `${marker} must use the shared keyboard contract`,
      );
    }
  });

  it("teaches the keyboard shortcut without weakening Tab navigation", () => {
    assert.match(
      tutorialSource,
      /when one eligible bot remains, press Enter to choose it or Tab to complete its full name/u,
    );
    assert.match(
      tutorialSource,
      /Shift\+Tab and ordinary Tab navigation remain unchanged/u,
    );
  });
});

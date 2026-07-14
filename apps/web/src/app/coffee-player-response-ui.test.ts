import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee player response UI wiring", () => {
  it("renders the table composer through the rich mention-capable input", () => {
    assert.match(
      pageSource,
      /enabled=\{coffeeComposerUsesRichInput\(\{[\s\S]*?variant,[\s\S]*?markdownEditorEnabled:\s*composerMarkdownEditorEnabled,[\s\S]*?\}\)\}/,
    );
  });

  it("waits for the player line and a social beat before requesting a reply", () => {
    assert.match(
      pageSource,
      /await waitForCoffeeUserRevealToSettle\(\);[\s\S]*?await waitForCoffeeJobPoll\([\s\S]*?coffeePlayerResponseBeatMs\(/,
    );
    assert.match(
      pageSource,
      /resolveCoffeeUserRevealSettledWaiters\(\);[\s\S]*?setCoffeeTurnRhythmState\("botThinking"\)/,
    );
  });

  it("lets the active thinking state suppress the matching seat's sip", () => {
    assert.match(pageSource, /const seatIsThinking = thinkingBotId === bot\.id;/);
    assert.match(
      pageSource,
      /buildCoffeeCupVisualState\(\{[\s\S]*?thinking:\s*seatIsThinking,/,
    );
    assert.match(
      pageSource,
      /completedSipAnimationActive\s*=\s*[\s\S]*?!seatIsThinking/,
    );
  });
});

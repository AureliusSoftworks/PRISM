import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee turn recovery UI integration", () => {
  it("ties every automatic retry to the failed job and message cursor", () => {
    assert.match(pageSource, /retryOfJobId: failedJob\.id/u);
    assert.match(
      pageSource,
      /expectedLatestMessageCursor:[\s\S]{0,100}failedJob\.failure\?\.latestMessageCursor/u,
    );
    assert.match(
      pageSource,
      /retryPayloadFor\(retryError\.job, decision\.speakerBotId\)/u,
    );
  });

  it("settles terminal failures without leaving a thinking seat behind", () => {
    assert.match(
      pageSource,
      /const settleCoffeeTurnFailure =[\s\S]{0,1700}coffeeActiveTurnJobIdRef\.current = null/u,
    );
    assert.match(
      pageSource,
      /const settleCoffeeTurnFailure =[\s\S]{0,2100}setCoffeePendingSpeakerBotId\(null\)/u,
    );
    assert.match(
      pageSource,
      /const settleCoffeeTurnFailure =[\s\S]{0,2400}setCoffeePendingRevealConversation\(null\)/u,
    );
    assert.match(pageSource, /Finding another route…/u);
    assert.match(pageSource, />\s*Switch model\s*</u);
    assert.match(pageSource, />\s*End session\s*</u);
  });

  it("does not let an aborted turn write failure UI after Coffee exits", () => {
    assert.match(
      pageSource,
      /const settleCoffeeTurnFailure =[\s\S]{0,420}coffeeConversationRef\.current\?\.id !== conversationId[\s\S]{0,220}coffeeSessionPhaseRef\.current === "selecting"[\s\S]{0,120}return false/u,
    );
    assert.match(
      pageSource,
      /if \(\s*settleCoffeeTurnFailure\([\s\S]{0,260}activeConversation\.id[\s\S]{0,120}\)\s*\) \{[\s\S]{0,220}setCoffeeDraft\(trimmed\)/u,
    );
  });

  it("uses selection-specific terminal copy and never mislabels a fixed model as Auto", () => {
    assert.match(
      pageSource,
      /Coffee could not find an available route\. Switch models or end the session\./u,
    );
    assert.match(
      pageSource,
      /The selected model could not complete this turn\. Switch models, choose Auto, or end the session\./u,
    );
    assert.doesNotMatch(pageSource, /All Auto models failed/u);
  });

  it("restores the exact player draft when bounded recovery cannot deliver", () => {
    assert.match(
      pageSource,
      /catch \(err\) \{[\s\S]{0,700}setCoffeeDraft\(trimmed\)[\s\S]{0,200}coffeeDraftRef\.current = trimmed[\s\S]{0,200}coffeeComposerRichRef\.current\?\.setValue\(trimmed\)/u,
    );
  });
});

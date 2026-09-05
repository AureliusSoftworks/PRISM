import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Signal face alignment", () => {
  it("keeps Signal presentation outside the canonical face and Ink plane", () => {
    assert.doesNotMatch(
      pageCss,
      /\.signalBotPresencePlate[^{}]*\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*translate:/iu,
    );
    assert.doesNotMatch(
      pageCss,
      /\.signalBotPresencePlate\[data-signal-surface="stage"\][^{]*\[data-avatar-details-ink-role="talking"\]/iu,
    );

    const signalPresenceTalkingContracts = pageSource.match(
      /className=\{`\$\{styles\.zenLiveBotPresencePlate\} \$\{styles\.signalBotPresencePlate\}`\}[\s\S]{0,900}?data-signal-surface=\{avatarState\.surface\}[\s\S]{0,900}?data-talking=\{avatarState\.talking \? "true" : undefined\}/gu,
    );
    assert.equal(signalPresenceTalkingContracts?.length, 2);
  });
});

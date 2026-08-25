import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Signal face alignment", () => {
  it("keeps the complete face and Ink plane raised while a Signal bot talks", () => {
    assert.match(
      pageCss,
      /\.signalBotPresencePlate\[data-signal-surface="stage"\]\s*\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*translate:\s*0 clamp\(-6px, -0\.42vw, -4px\)/iu,
    );
    assert.doesNotMatch(
      pageCss,
      /\.signalBotPresencePlate\[data-signal-surface="stage"\]:not\(\[data-talking="true"\]\)[^{]*\.zenLiveBotPresenceScreenContentRig/iu,
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

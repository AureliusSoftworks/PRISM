import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("shared routing model picker integration", () => {
  it("can enter AUTO from a duplicate current fallback by selecting a valid Primary", () => {
    assert.match(pageSource, /autoFallbackSelectablePrimary\(\{/u);
    assert.match(
      pageSource,
      /nextMode === "auto"[\s\S]{0,900}switchProvider\(autoPrimaryCandidate\.provider\)/u,
    );
    assert.match(
      pageSource,
      /mode === "auto"[\s\S]{0,900}switchProvider\([\s\S]{0,80}debateAutoPrimaryCandidate\.provider/u,
    );
  });

  it("shares the full mode-aware catalog with Chat, Coffee, Signal, and Debate", () => {
    assert.match(pageSource, /modeAwareModelOptions\(\{/u);
    assert.match(pageSource, /signalNavbarModelOptions/u);
    assert.match(pageSource, /debateNavbarResponseMode/u);
    assert.ok(
      (pageSource.match(/selectedProvider=\{/gu) ?? []).length >= 5,
      "expected the shared account, Chat, Coffee, Signal, and Debate pickers to tint from their selected provider",
    );
  });

  it("marks model rows by provider and gives each lane a distinct accent", () => {
    assert.match(pageSource, /data-model-provider=\{model\.provider\}/u);
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="local"\][\s\S]{0,120}#68e6a6/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="openai"\][\s\S]{0,120}#7db7ff/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="anthropic"\][\s\S]{0,120}#d97757/u,
    );
  });
});

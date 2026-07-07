import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");

function ruleForExactSelector(selector: string): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((entry) =>
    (entry[1] ?? "")
      .split(",")
      .map((candidate) => candidate.trim())
      .includes(selector)
  );
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[2]!;
}

describe("Zen live presence body hit target", () => {
  it("keeps the cursor surface aligned to the rendered body frame", () => {
    const bodyRule = ruleForExactSelector(".zenLiveBotPresenceBody");
    assert.match(bodyRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(bodyRule, /cursor:\s*grab\s*;/);

    const hitTargetRule = ruleForExactSelector(".zenLiveBotPresenceHitTarget");
    assert.match(hitTargetRule, /width:\s*var\(--zen-live-bot-body-frame-size\)\s*;/);
    assert.match(hitTargetRule, /height:\s*var\(--zen-live-bot-body-frame-size\)\s*;/);
    assert.match(hitTargetRule, /transform:\s*translate\(-50%,\s*-50%\)\s*;/);
    assert.match(hitTargetRule, /clip-path:\s*circle\(50% at 50% 50%\)\s*;/);
    assert.match(hitTargetRule, /pointer-events:\s*auto\s*;/);
    assert.match(hitTargetRule, /cursor:\s*grab\s*;/);

    const draggingRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-dragging="true"] .zenLiveBotPresenceHitTarget'
    );
    assert.match(draggingRule, /cursor:\s*grabbing\s*;/);
  });

  it("uses the same body frame rect for drag eligibility", () => {
    assert.match(
      pageSource,
      /data-zen-live-bot-body-hit-target="true"[\s\S]*?data-zen-live-bot-body-frame="true"/
    );
    assert.match(
      pageSource,
      /querySelector<HTMLElement>\("\[data-zen-live-bot-body-frame='true'\]"\)\s*\?\?\s*node\.querySelector<HTMLElement>\("\[data-zen-live-bot-body-hit-target='true'\]"\)/
    );
  });
});

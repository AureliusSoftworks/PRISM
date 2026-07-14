import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("active Coffee centrally locks configuration while preserving End Session", () => {
  assert.match(
    pageSource,
    /coffeeSessionPhase === "arriving" \|\| coffeeSessionPhase === "live"/u
  );
  assert.match(
    pageSource,
    /End the Coffee session to change bots, settings, or modes\./u
  );
  assert.match(pageSource, /blockCoffeeConfigurationMutation/u);
  assert.match(pageSource, /coffeeConfigurationLockedRef\.current/u);
  assert.match(pageSource, /setBotAvatarCustomizerOpen\(false\)/u);
  assert.match(pageSource, /setCoffeeSettingsModalOpen\(false\)/u);
  assert.doesNotMatch(
    pageSource,
    /if \(panel === "settings"\) setPanel\(null\)/u,
  );
  assert.match(
    pageSource,
    /disabledActions:\s*shellPolicy\.disabledNavbarActions/u,
  );
  assert.match(
    pageSource,
    /shellPolicy\.showEndSessionInSwitcher[\s\S]*End session[\s\S]*renderAppSwitcher\(\)/u,
  );
  assert.match(pageSource, />\s*End session\s*</iu);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("active Coffee centrally locks configuration while preserving End Session", () => {
  assert.match(
    pageSource,
    /const coffeeConfigurationLocked = coffeeChromePolicy\.liveSessionActive/u,
  );
  assert.match(
    pageSource,
    /End the Coffee session to change bots, settings, or modes\./u,
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
    /disabledActions:\s*coffeeChromePolicy\.disabledNavbarActions/u,
  );
  assert.match(
    pageSource,
    /disabledActionTooltips:\s*coffeeChromePolicy\.disabledNavbarActionTooltips/u,
  );
  assert.match(
    pageSource,
    /buildSharedWorkspaceMenuEntries\(\{[\s\S]*?disabledActions:\s*coffeeChromePolicy\.disabledNavbarActions,[\s\S]*?disabledActionTooltips:\s*coffeeChromePolicy\.disabledNavbarActionTooltips,[\s\S]*?importBots:\s*true,[\s\S]*?\}\)/u,
  );
  assert.match(
    pageSource,
    /function buildSharedWorkspaceMenuEntries[\s\S]*?disabledActions\?:\s*UniversalNavbarDisabledMap;[\s\S]*?disabledActionTooltips\?:\s*UniversalNavbarTooltipMap;[\s\S]*?disabled:\s*actionDisabled\("promptCenter"\)[\s\S]*?disabled:\s*actionDisabled\("usage"\)[\s\S]*?disabled:\s*actionDisabled\("memories"\)[\s\S]*?disabled:\s*actionDisabled\("images"\)[\s\S]*?disabled:\s*actionDisabled\("theme"\)/u,
  );
  assert.match(
    pageSource,
    /function renderCoffeeBotContextMenu[\s\S]*?coffeeChromePolicy\.disabledNavbarActions\[action\][\s\S]*?disabled:\s*botActionsDisabled[\s\S]*?disabled:\s*memoriesDisabled[\s\S]*?disabled:\s*imagesDisabled[\s\S]*?disabled:\s*botActionsDisabled \|\| protectedBot/u,
  );
  assert.doesNotMatch(pageSource, /Favorites unavailable in Coffee/u);
  assert.match(
    pageSource,
    /const coffeeHeaderModelControlsLockReason = \(\): string \| null =>\s*coffeeConfigurationLocked/u,
  );
  assert.match(
    pageSource,
    /const coffeeHeaderModelControlsLocked = \(\): boolean =>\s*coffeeHeaderModelControlsLockReason\(\) !== null/u,
  );
  assert.match(pageSource, /disabled=\{coffeeHeaderModelControlsLocked\(\)\}/u);
  assert.match(pageSource, /disabled:\s*coffeeHeaderModelControlsLocked\(\)/u);
  assert.match(
    pageSource,
    /renderCoffeeHeaderModelPicker\(\)[\s\S]*renderVoiceModeSelector\(\{[\s\S]*disabled:\s*coffeeConfigurationLocked/u,
  );
  assert.match(
    pageSource,
    /coffeeChromePolicy\.showEndSessionInSwitcher[\s\S]*End session[\s\S]*renderLocationStrip\(\)/u,
  );
  assert.match(pageSource, />\s*End session\s*</iu);
  assert.match(
    pageSource,
    /data-live-session-locked=\{[\s\S]*coffeeChromePolicy\.liveSessionActive/u,
  );
});

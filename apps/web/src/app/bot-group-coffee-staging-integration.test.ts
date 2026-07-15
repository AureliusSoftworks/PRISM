import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("waiting-room Coffee staging integration", () => {
  it("turns the room composer into a local Listen up staging action", () => {
    assert.match(pageSource, /beginBotGroupCoffeeStaging\(liveDraft\)/u);
    assert.match(pageSource, /\? "Listen up"/u);
    assert.match(pageSource, /data-room-coffee-staging="true"/u);
    assert.match(pageSource, /Local room read · no model call/u);
    assert.match(pageSource, /createBotGroupCoffeeStagingModel/u);
    assert.match(pageSource, /botGroupCoffeeStagingReplacementRoster/u);
    assert.match(pageSource, /replaceBotGroupCoffeeStagingSelection/u);
  });

  it("restores the exact editable prompt when staging is cancelled", () => {
    assert.match(
      pageSource,
      /function cancelBotGroupCoffeeStaging\(\)[\s\S]*?setComposerDraftNow\(staging\.model\.submittedPrompt\)/u,
    );
    assert.match(
      pageSource,
      /draftComposerRef\.current\?\.focus\(\{ preventScroll: true \}\)/u,
    );
  });

  it("hands focus from the composer into staging and back on cancel", () => {
    assert.match(
      pageSource,
      /ref=\{botGroupCoffeeStagingRef\}[\s\S]{0,180}data-room-coffee-staging="true"/u,
    );
    assert.match(
      pageSource,
      /useEffect\(\(\) => \{[\s\S]{0,260}botGroupCoffeeStaging[\s\S]{0,260}botGroupCoffeeStagingRef\.current[\s\S]{0,560}focus\(\{ preventScroll: true \}\)/u,
    );
    assert.match(
      pageSource,
      /function cancelBotGroupCoffeeStaging\(\)[\s\S]{0,700}draftComposerRef\.current\?\.focus\(\{ preventScroll: true \}\)/u,
    );
  });

  it("forwards the room topic through exact-group reuse and one-off creation", () => {
    assert.match(
      pageSource,
      /availableGroups\.find\([\s\S]*?coffeeGroupRosterSignature\(group\.botGroupIds\)[\s\S]*?selectedSignature/u,
    );
    assert.match(
      pageSource,
      /startCoffeeSessionFromGroup\(exactGroup, \{[\s\S]*?initialTopic: launch\.prompt/u,
    );
    assert.match(
      pageSource,
      /startCoffeeSessionFromGroup\(exactGroup, \{[\s\S]*?useGroupDefaults: true,[\s\S]*?forceAttendance: true/u,
    );
    assert.match(
      pageSource,
      /!options\.useGroupDefaults && coffeeSelectedPresetId/u,
    );
    assert.match(
      pageSource,
      /createCoffeeSession\(\{[\s\S]*?seatBotIds,[\s\S]*?initialTopic: launch\.prompt/u,
    );
    assert.match(
      pageSource,
      /body: JSON\.stringify\(\{[\s\S]*?groupBotIds: requestedSeatBotIds,[\s\S]*?initialTopic: options\.initialTopic/u,
    );
  });

  it("persists a session-keyed return checkpoint and resolves a fresh room or safe Chat fallback", () => {
    assert.match(pageSource, /window\.sessionStorage\.setItem\(storageKey, serialized\)/u);
    assert.match(pageSource, /parseBotGroupCoffeeReturnCheckpoint/u);
    assert.match(pageSource, /resolveBotGroupCoffeeReturn/u);
    assert.match(pageSource, /createBotGroupWaitingRoomVisit\(\{[\s\S]*?visitSeed: outcome\.visitSeed/u);
    assert.match(pageSource, /setBotLibraryGroupFilterId\(BOT_LIBRARY_GROUP_FILTER_ALL\)/u);
    assert.match(
      pageSource,
      /botGroupCoffeeReturnFocusRef\.current = \{[\s\S]{0,180}target: "room"[\s\S]{0,180}visitSeed: outcome\.visitSeed[\s\S]{0,900}navigateToView\("chat"\)/u,
    );
    const focusEffectStart = pageSource.indexOf(
      "const request = botGroupCoffeeReturnFocusRef.current;",
    );
    const focusEffectEnd = pageSource.indexOf(
      "\n  useEffect(() => {",
      focusEffectStart,
    );
    assert.ok(focusEffectStart >= 0 && focusEffectEnd > focusEffectStart);
    const focusEffectSource = pageSource.slice(focusEffectStart, focusEffectEnd);
    assert.match(focusEffectSource, /request\.target === "room"/u);
    assert.match(
      focusEffectSource,
      /data-room-presence-state="stable"[^']*button:not\(:disabled\)/u,
    );
    assert.match(
      focusEffectSource,
      /focusTarget\.focus\(\{ preventScroll: true \}\)/u,
    );
    assert.match(pageSource, /Return to group room/u);
    assert.match(pageSource, /Return to Chat/u);
  });

  it("keeps one-off saving available after completion and includes responsive staging styles", () => {
    assert.match(pageSource, /coffeeSessionPhase === "finished"[\s\S]*?Save as Coffee Group/u);
    assert.match(cssSource, /\.botGroupCoffeeStaging\s*\{/u);
    assert.match(cssSource, /\.botGroupCoffeeStagingRoster\s*\{/u);
    assert.match(cssSource, /@media \(max-height: 720px\)/u);
    assert.match(tutorialSource, /Listen up prompt/u);
    assert.match(tutorialSource, /locally ranked table already staged/u);
  });
});

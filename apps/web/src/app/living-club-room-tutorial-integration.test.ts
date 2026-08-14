import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MODE_TUTORIALS } from "./modeTutorials.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

describe("living club-room tutorial", () => {
  it("walks from the complete roster through the focused bot actions", () => {
    const expected = [
      {
        heading: "Meet every bot in the club",
        target:
          '[data-tutorial-target="chat-bot-picker"][data-room-presence-button-bot-id]',
      },
      {
        heading: "Open the focused bot",
        target:
          '[data-tutorial-target="chat-bot-picker"][data-room-presence-button-bot-id][aria-label^="Open "]',
      },
      {
        heading: "See connected resources",
        target: '[data-tutorial-target="bot-hub-resources"] > header',
      },
      {
        heading: "Browse this bot's assets",
        target: '[data-tutorial-target="bot-hub-assets"] > header',
      },
      {
        heading: "Send a direct message",
        target: '[data-tutorial-target="bot-hub-composer"] textarea',
      },
      {
        heading: "Let the bot begin",
        target: '[data-tutorial-target="bot-hub-talk-to-me"]',
      },
    ] as const;
    const stepIndexes = expected.map(({ heading, target }) => {
      const index = MODE_TUTORIALS.zen.steps.findIndex(
        (step) => step.heading === heading,
      );
      assert.ok(index >= 0, `Missing tutorial step: ${heading}`);
      assert.equal(MODE_TUTORIALS.zen.steps[index]?.targetSelector, target);
      return index;
    });
    assert.deepEqual(stepIndexes, [...stepIndexes].sort((a, b) => a - b));

    const copy = expected
      .map(({ heading }) =>
        MODE_TUTORIALS.zen.steps.find((step) => step.heading === heading)?.body,
      )
      .join(" ");
    assert.match(copy, /every room presence is the real saved member/iu);
    assert.match(copy, /activate a Micro bot once to promote it in place to Mini/u);
    assert.match(copy, /steps forward at full size/u);
    assert.match(copy, /club room stays mounted and undisturbed/u);
    assert.match(copy, /Signal show appears here only when this exact bot hosts one/u);
    assert.match(copy, /nonempty thumbnail rails/u);
    assert.match(copy, /fresh user-first one-on-one/u);
    assert.match(copy, /Enter sends, Shift\+Enter adds a line/u);
    assert.match(copy, /fresh bot-first one-on-one/u);
  });

  it("binds every authored step to a stable live selector and skips impossible branches", () => {
    assert.match(
      pageSource,
      /data-tutorial-target="chat-bot-picker"[\s\S]*?data-room-presence-button-bot-id=\{bot\.id\}/u,
    );
    for (const selector of [
      "bot-hub-talk-to-me",
      "bot-hub-resources",
      "bot-hub-assets",
      "bot-hub-composer",
    ]) {
      assert.match(pageSource, new RegExp(`data-tutorial-target="${selector}"`, "u"));
    }
    const tutorialBinding = sourceBetween(
      "useEffect(() => {\n    if (!activeTutorialMode || typeof document",
      "useEffect(() => {\n    if (!activeTutorialMode || !settings",
    );
    assert.match(tutorialBinding, /groupTutorialStartIndex/u);
    assert.match(tutorialBinding, /groupTutorialEndIndex/u);
    assert.match(tutorialBinding, /!selectedTutorialGroup\.builtIn/u);
    assert.match(tutorialBinding, /tutorialBotIds\.has\(botId\)/u);
    assert.match(tutorialBinding, /BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS/u);
    assert.match(tutorialBinding, /advanceLivingTutorialToStep\("zen", groupTutorialEndIndex \+ 1\)/u);
    assert.match(
      tutorialBinding,
      /step\.heading === "Open the focused bot"[\s\S]*?data-room-panel-open/u,
    );
    assert.match(tutorialBinding, /skipAlreadyOpenedBotStep/u);
  });

  it("keeps a group-origin hub compact and returns focus to the room bot", () => {
    const roomActivation = sourceBetween(
      "const handleBotGroupWaitingRoomPresenceClick",
      "const renderFocusedBotLibraryGroupWaitingRoom",
    );
    assert.match(roomActivation, /origin: "group-room"/u);
    assert.match(roomActivation, /returnFocusBotId: placement\.botId/u);
    assert.match(roomActivation, /groupId: activeBotLibraryGroupFilter/u);
    assert.match(roomActivation, /promotedBotId: botGroupWaitingRoomPromotedBotId/u);

    const showcase = sourceBetween(
      "const renderBotHubShowcase",
      "const renderSharedPanels",
    );
    assert.doesNotMatch(showcase, /botHubOpenContext\.origin === "group-room"/u);
    assert.match(showcase, /data-bot-view=\{panel === "bots" \? botPanelView : undefined\}/u);

    const panelNavigation = sourceBetween(
      "const botPanelBackLabel",
      "const showBotPanelBack",
    );
    assert.match(panelNavigation, /"Back to club room"/u);
    assert.match(
      panelNavigation,
      /botHubOpenContext\.origin === "group-room"[\s\S]*?closePanel\(\)/u,
    );

    const roomPanelLifecycle = sourceBetween(
      "const botGroupWaitingRoomPanelOpen",
      "const botGroupWaitingRoomTyping",
    );
    assert.match(roomPanelLifecycle, /botGroupWaitingRoomRestoreFocusBotIdRef/u);
    assert.match(
      roomPanelLifecycle,
      /data-room-presence-button-bot-id[\s\S]*?focus\(\{ preventScroll: true \}\)/u,
    );
    assert.match(pageSource, /data-room-panel-open=/u);
    assert.match(pageSource, /inert=\{botGroupWaitingRoomPanelOpen/u);
  });
});

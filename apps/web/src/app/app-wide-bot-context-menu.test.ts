import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("bot context targets resolve across shared app surfaces", () => {
  assert.match(pageSource, /APP_WIDE_BOT_CONTEXT_TARGET_SELECTOR/u);
  for (const attribute of [
    "data-bot-id",
    "data-coffee-seat-bot-id",
    "data-room-presence-bot-id",
    "data-zen-persona-bot-id",
  ]) {
    assert.match(pageSource, new RegExp(`\\[${attribute}\\]`, "u"));
  }
  assert.match(
    pageSource,
    /const openAppWideBotContextMenu = useCallback\([\s\S]*?openBotContextMenu\(bot, event\.clientX, event\.clientY\)/u,
  );
});

test("app shells give bot context targets priority over background menus", () => {
  for (const handler of [
    "handleAppContextMenu",
    "handleCoffeeShellContextMenu",
    "handleStoryShellContextMenu",
    "handleMessagesFrameContextMenu",
  ]) {
    assert.match(
      pageSource,
      new RegExp(
        `const ${handler} = useCallback\\([\\s\\S]*?if \\(openAppWideBotContextMenu\\(event\\)\\) return;`,
        "u",
      ),
    );
  }
});

test("Signal avatars identify their bot and inherit the standard menu", () => {
  assert.match(
    pageSource,
    /signalBotPresencePlate[^>]*>[\s\S]*?data-bot-id=\{bot\.id\}|signalBotPresencePlate[^\n]*[\s\S]{0,240}data-bot-id=\{bot\.id\}/u,
  );
  assert.match(
    pageSource,
    /data-bot-id=\{bot\.id\}[\s\S]{0,240}data-signal-bot-presence="true"[\s\S]{0,1400}onContextMenu=\{\(event\) => \{[\s\S]*?openAppWideBotContextMenu\(event\)/u,
  );
  assert.match(pageSource, /label: "Avatar Studio"/u);
  assert.match(
    pageSource,
    /if \(view === "botcast"\)[\s\S]*?<BotcastExperience[\s\S]*?renderContextMenuPortal\(renderBotContextMenu\(\)\)[\s\S]*?if \(view === "slate"\)/u,
  );
});

test("mode tutorials teach the app-wide bot shortcut", () => {
  assert.match(
    tutorialSource,
    /Right-click a host or guest anywhere in Signal/u,
  );
});

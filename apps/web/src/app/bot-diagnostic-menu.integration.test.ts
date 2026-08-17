import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("one bot diagnostic copier feeds the Bot Lobby and bot context menus", () => {
  assert.match(
    pageSource,
    /async function copyBotDiagnosticToClipboard\(bot: Bot\)/u,
  );
  assert.match(pageSource, /formatBotDiagnosticClipboardText\(\{/u);
  assert.match(
    pageSource,
    /botPanelView === "botHub"[\s\S]{0,900}Copy bot details for testing/u,
  );

  const standardMenu = pageSource.slice(
    pageSource.indexOf("function renderBotContextMenu"),
    pageSource.indexOf("function renderConversationGroupContextMenu"),
  );
  assert.match(
    standardMenu,
    /id: "copy-bot-details"[\s\S]{0,160}label: "Copy bot details"/u,
  );
  assert.match(standardMenu, /copyBotDiagnosticToClipboard\(bot\)/u);

  const zenMenu = pageSource.slice(
    pageSource.indexOf("function renderZenLiveBotContextMenu"),
    pageSource.indexOf("function buildSharedWorkspaceMenuEntries"),
  );
  assert.match(zenMenu, /label: "Copy bot details"/u);

  const coffeeMenu = pageSource.slice(
    pageSource.indexOf("function renderCoffeeBotContextMenu"),
    pageSource.indexOf("function renderStoryShellContextMenu"),
  );
  assert.match(coffeeMenu, /label: "Copy bot details"/u);
});

test("Chat guidance explains the review-ready bot details copy", () => {
  assert.match(tutorialSource, /review-ready bot diagnostic/u);
  assert.match(tutorialSource, /Copy bot details/u);
});

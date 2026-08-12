import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appDir = path.resolve(process.cwd(), "src/app");
const page = fs.readFileSync(path.join(appDir, "page.tsx"), "utf8");
const tutorials = fs.readFileSync(
  path.join(appDir, "modeTutorials.ts"),
  "utf8",
);

test("the Zen Home mini bot opens the existing bot panel without starting a turn", () => {
  const handler = page.slice(
    page.indexOf("function handleZenHeroBotPanelOpen"),
    page.indexOf("function handleSandboxHeroStarter"),
  );

  assert.match(handler, /openBotPanelHub\(zenPersonaBot\);/u);
  assert.doesNotMatch(handler, /sendMessage/u);
  assert.doesNotMatch(handler, /setForceNewConversationOnNextSend/u);
  assert.doesNotMatch(handler, /focusDraftInput/u);
  assert.match(page, /data-zen-bot-panel-hero="true"/u);
  assert.match(page, /onClick=\{handleZenHeroBotPanelOpen\}/u);
});

test("Zen Home keeps its picker and has no pre-message roaming state", () => {
  assert.match(
    page,
    /const directBotSelectionVisible =\s*emptyStateLensVisible \|\|\s*\(activeConversationIsEmpty && canvasBotDirectoryInteractive\);/u,
  );
  assert.doesNotMatch(
    page,
    /zenPreMessageConversationActive|zenHomeRoamOrigin|zenHomeDock|data-zen-home-roaming|data-zen-home-drop-target/u,
  );
});

test("every new persona Zen retains the bot Home atmosphere rule", () => {
  assert.match(
    tutorials,
    /Every new persona Zen starts in that bot’s Home atmosphere/u,
  );
  assert.doesNotMatch(tutorials, /let it roam before you send|drag the bot back/u);
});

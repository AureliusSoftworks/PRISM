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

test("clicking the already focused bot tile unfocuses it instead of opening management", () => {
  const renderBlock = page.slice(
    page.indexOf("if (canvasBotClickTogglesBatchSelection(e)) {"),
    page.indexOf(
      "const isDesktopMousePixelClick",
      page.indexOf("if (canvasBotClickTogglesBatchSelection(e)) {"),
    ),
  );

  assert.match(
    renderBlock,
    /if \(tileActivation === "unfocus"\) \{[\s\S]*?resetEmptyStateBotSelection\(\);[\s\S]*?if \(isActivePanelTarget\) \{[\s\S]*?returnBotPanelHubToLibrary\(\);[\s\S]*?return;/u,
  );
  assert.doesNotMatch(renderBlock, /openBotPanelHub\(b\)/u);
});

test("the focused card dismissal path uses panel identity state", () => {
  const stateBlock = page.slice(
    page.indexOf("const isActivePanelTarget ="),
    page.indexOf("if (canvasBotClickTogglesBatchSelection(e)) {"),
  );

  assert.match(
    stateBlock,
    /const isActivePanelTarget =\s*panel === "bots"\s*&&\s*botPanelView === "botHub"\s*&&\s*selectedBotPanelBotId === b\.id/u,
  );
  assert.match(stateBlock, /"selected; activate to unfocus"/u);
  assert.match(stateBlock, /`Unfocus \$\{b\.name\}`/u);
});

test("focused-card dismissal reuses the complete bot-hub back path", () => {
  const helper = page.slice(
    page.indexOf("function returnBotPanelHubToLibrary"),
    page.indexOf("function openBotPanelHome"),
  );

  assert.match(helper, /resetBotPanelDraftNavigation\(\);/u);
  assert.match(helper, /setBotPanelView\("library"\);/u);
  assert.match(helper, /setBotLibraryExpanded\(true\);/u);
});

test("non-focused cards still focus normally rather than opening bot management", () => {
  assert.match(
    page,
    /if \(tileActivation === "unfocus"\) \{[\s\S]{0,500}return;[\s\S]{0,500}commitEmptyStateBotSelection\(b\.id, e\.currentTarget\);/u,
  );
  assert.doesNotMatch(
    page,
    /if \(tileActivation === "unfocus"\) \{[\s\S]{0,500}openBotPanelHub\(b\)/u,
  );
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

test("the Zen tutorial explains focused-card and empty-canvas unfocus", () => {
  assert.match(
    tutorials,
    /Selecting a focused bot card again unfocuses it; clicking empty canvas clears bot or hue depth without changing the navbar’s current group/u,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("the global batch menu is document-captured, gated, and viewport bounded", () => {
  assert.match(pageSource, /handleGlobalBotBatchContextMenu/u);
  assert.match(pageSource, /document\.addEventListener\("contextmenu", handleGlobalBotBatchContextMenu, true\)/u);
  assert.match(pageSource, /openGlobalBotBatchContextMenu\(event\.clientX, event\.clientY\)/u);
  assert.match(pageSource, /clampCanvasBotBatchMenuAnchor/u);
  assert.match(pageSource, /resolveCanvasBotBatchMenuSelection/u);
  const globalHandler = pageSource.slice(
    pageSource.indexOf("function handleGlobalBotBatchContextMenu"),
    pageSource.indexOf("// Capture at the document boundary"),
  );
  assert.doesNotMatch(globalHandler, /shouldAllowNativeContextMenu/u);
  assert.match(
    pageSource,
    /openBotContextMenu\([\s\S]*?selectedBotIds,[\s\S]*?activeBotLibraryGroupFilter\?\.id/u,
  );
});

test("batch menu forwards every selected bot to the existing group workflows", () => {
  const menuSource = pageSource.slice(
    pageSource.indexOf("function renderBotContextMenu"),
    pageSource.indexOf("function renderConversationGroupContextMenu"),
  );
  assert.match(menuSource, /label: "Create new group"/u);
  assert.match(menuSource, /label: "Add to group"/u);
  assert.match(menuSource, /label: "Remove selected from current group"/u);
  assert.match(menuSource, /openCreateBotLibraryGroupDialog\(multiSelectedBotIds\)/u);
  assert.match(
    menuSource,
    /openCreateBotLibraryGroupDialog\(\s*multiSelectedBotIds,\s*existingGroupId,/u,
  );
});

test("batch selection exposes selected semantics and dismisses before it clears", () => {
  assert.match(pageSource, /"aria-description": isMarqueeSelected/u);
  assert.match(pageSource, /batch selected`/u);
  assert.match(pageSource, /canvasBotClickTogglesBatchSelection\(e\)/u);
  assert.match(pageSource, /canvasBotSelectionAfterPlainActivation\(\)/u);
  assert.match(
    pageSource,
    /canvasBotMenuDismissalSuppressesCardActivation\([\s\S]*?botContextSuppressClickRef\.current = true/u,
  );
  assert.match(pageSource, /event\.key !== "Escape" \|\| botContextMenu/u);
  assert.match(pageSource, /setCanvasSelectedBotIds\(new Set\(\)\)/u);
});

test("Chat guidance teaches the complete batch-selection gesture", () => {
  assert.match(tutorialSource, /Shift-click bot cards/u);
  assert.match(tutorialSource, /right-click anywhere on the PRISM surface/u);
  assert.match(tutorialSource, /create a group or add the whole selection/u);
  assert.match(tutorialSource, /Escape closes that menu first/u);
});

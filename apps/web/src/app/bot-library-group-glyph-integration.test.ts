import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

test("legacy group glyph identity remains readable in portable group transfer", () => {
  const normalization = sourceBetween(
    "function normalizeBotLibraryGroups(raw: unknown)",
    "function protectedBotIdsForBotLibraryGroups",
  );
  const transfer = sourceBetween(
    "async function exportBotsAsCollection",
    "function parseBotGroupManifest",
  );
  const importSource = sourceBetween(
    "async function importBotCollectionBundle",
    "async function fetchMarketplaceBotBundle",
  );

  assert.match(normalization, /normalizeBotLibraryGroupGlyphIdentity\(record\.glyph\)/u);
  assert.match(transfer, /glyph:\s*options\.group\?\.glyph \?\? null/u);
  assert.match(importSource, /const manifestGlyph = normalizeBotLibraryGroupGlyphIdentity/u);
  assert.match(importSource, /\{ glyph: manifestGlyph \}/u);
});

test("the bot hub renders accessible spectrum-tile group memberships", () => {
  const hub = sourceBetween(
    "{botPanelView === \"botHub\" && selectedBotPanelBot ? (",
    "{/* One form, two modes.",
  );

  assert.match(hub, /selectedBotLibraryGroups\.map\(\(group\)/u);
  assert.match(hub, /<BotLibraryGroupSpectrumTile[\s\S]*groupName=\{group\.name\}/u);
  assert.match(hub, /imageUrl=\{botLibraryGroupSpectrumImageUrl\(group\)\}/u);
  assert.match(hub, /botLibraryGroupVisualStyle\([\s\S]*groupBots/u);
  assert.match(hub, /aria-label=\{`Open \$\{group\.name\} group`\}/u);
  assert.match(cssSource, /\.botPanelHubMembership\s*\{/u);
  assert.match(cssSource, /border-radius:\s*14px/u);
  assert.match(cssSource, /var\(--bot-library-group-gradient\)/u);
});

test("the focused group dashboard uses spectrum identity without a reroll affordance", () => {
  const hero = sourceBetween(
    "const renderFocusedBotLibraryGroupHero =",
    "const renderChatCanvasPickerControls =",
  );

  assert.match(hero, /<BotLibraryGroupSpectrumTile[\s\S]*focusedBotLibraryGroup\.name/u);
  assert.match(hero, /botLibraryGroupSpectrumImageUrl\([\s\S]*focusedBotLibraryGroup/u);
  assert.match(hero, /data-tutorial-target="chat-group-spectrum-tile"/u);
  assert.doesNotMatch(hero, /Reroll glyph|rerollBotLibraryGroupGlyph/u);
});

test("the bot hub requests and renders ephemeral local-only group suggestions", () => {
  const effect = sourceBetween(
    "const botPanelSuggestionBot = useMemo(",
    "useEffect(() => {\n    if (!user) {\n      const defaults = normalizeCommandCenterState(null);",
  );
  const hub = sourceBetween(
    "{botPanelView === \"botHub\" && selectedBotPanelBot ? (",
    "{/* One form, two modes.",
  );

  assert.match(effect, /\/api\/library\/groups\/suggestions/u);
  assert.match(effect, /AbortController/u);
  assert.match(effect, /botLibraryEligibleGroupRevision/u);
  assert.match(hub, /botPanelGroupSuggestionsCurrent/u);
  assert.match(hub, /Suggested groups/u);
  assert.match(hub, /Asking your local auxiliary model/u);
  assert.match(hub, /data-tutorial-target="chat-bot-group-suggestions"/u);
  assert.match(hub, /addBotToExistingLibraryGroup/u);
  assert.match(hub, /\{ focusGroup: false \}/u);
  assert.match(hub, /aria-label=\{`Add \$\{selectedBotPanelBot\.name\} to \$\{group\.name\}`\}/u);
  assert.match(cssSource, /\.botPanelHubSuggestion\s*\{/u);
  assert.match(cssSource, /\.botPanelHubSuggestionsRefresh/u);
});

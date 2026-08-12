import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const memorySettingsSource = readFileSync(
  new URL("./MemorySettings.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageStylesSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const modeTutorialsSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Settings memory controls", () => {
  it("splits the old General mega-category into smaller coherent navigation groups", () => {
    assert.doesNotMatch(settingsPanelSource, /label: "General"/u);
    assert.match(settingsPanelSource, /label: "Prism"/u);
    assert.match(settingsPanelSource, /label: "AI & Voice"/u);
    assert.match(settingsPanelSource, /label: "Data & Network"/u);
    assert.match(settingsPanelSource, /scope: "memories", title: "Memories"/u);
  });

  it("mounts Memories outside the persisted-settings form", () => {
    assert.match(pageSource, /activeSettingsScope === "memories"[\s\S]{0,160}<MemorySettings/u);
    assert.match(pageSource, /activeSettingsScope !== "memories" && \(/u);
  });

  it("links the navbar Memories panel to Storage and Memory settings", () => {
    assert.match(
      pageSource,
      /data-memory-settings-shortcut="storage"[\s\S]{0,180}openSettingsPanel\("storage"\)/u,
    );
    assert.match(
      pageSource,
      /data-memory-settings-shortcut="memories"[\s\S]{0,180}openSettingsPanel\("memories"\)/u,
    );
    assert.match(pageSource, />Storage Settings</u);
    assert.match(pageSource, />Memory Settings</u);
  });

  it("replaces Automatic memory with independent ecology permissions", () => {
    assert.doesNotMatch(pageSource, />\s*Auto memory\s*</u);
    assert.doesNotMatch(memorySettingsSource, /Automatic memory/u);
    assert.match(memorySettingsSource, /Learn about the player/u);
    assert.match(memorySettingsSource, /Learn about other bots/u);
    assert.match(
      memorySettingsSource,
      /Direct remember and\s+forget requests always remain available/u,
    );
    assert.match(memorySettingsSource, /role="switch"/u);
    assert.match(memorySettingsSource, /Cautious/u);
    assert.match(memorySettingsSource, /Balanced/u);
    assert.match(memorySettingsSource, /Curious/u);
    assert.match(memorySettingsSource, /Short-term lifetime/u);
    assert.match(memorySettingsSource, /Long-term threshold/u);
    assert.match(memorySettingsSource, /Opinion evidence/u);
    assert.match(memorySettingsSource, /Opinion confidence/u);
  });

  it("loads live prose usage with clear loading, error, empty, and size semantics", () => {
    assert.match(memorySettingsSource, /fetch\("\/api\/settings\/memories"/u);
    assert.match(memorySettingsSource, /Measuring memory prose/u);
    assert.match(memorySettingsSource, /Try again/u);
    assert.match(memorySettingsSource, /No persisted memory prose yet/u);
    assert.match(memorySettingsSource, /persisted UTF-8 prose/u);
    assert.match(memorySettingsSource, /overview\.longTerm/u);
    assert.match(memorySettingsSource, /overview\.shortTerm/u);
    assert.match(memorySettingsSource, /overview\.derived/u);
    assert.match(memorySettingsSource, /overview\.total/u);
  });

  it("confirms each independent destructive action and refreshes after success", () => {
    assert.match(memorySettingsSource, /pendingClear/u);
    assert.match(memorySettingsSource, /role="alertdialog"/u);
    assert.match(memorySettingsSource, /Your \{pendingOther\} memories stay untouched/u);
    assert.match(memorySettingsSource, /`\/api\/settings\/memories\/\$\{memoryClass\}`/u);
    assert.match(
      memorySettingsSource,
      /const deleted = await deleteMemoryClass\(memoryClass\);[\s\S]{0,520}await refresh\(\)/u,
    );
  });

  it("renders Derived opinions as evidence enclosures with accessible source navigation", () => {
    assert.match(pageSource, /visibleDerivedMemories/u);
    assert.match(pageSource, /memoryDerivedEnclosure/u);
    assert.match(pageSource, /evidenceMemoryIds/u);
    assert.match(pageSource, /data-tier=\{memoryTier\(source\)\}/u);
    assert.match(pageSource, /draggable=\{Boolean\(memoryBubbleScopeKey\)\}/u);
    assert.match(pageSource, /ArrowLeft/u);
    assert.match(pageSource, /Evidence unavailable for this historical Derived item/u);
  });

  it("uses the persistent live ! only for unread bot-to-bot memory receipts", () => {
    assert.match(pageSource, /fetch|api/u);
    assert.match(pageSource, /"\/api\/memory-receipts\?kind=bot_relation"/u);
    assert.match(pageSource, /memory-receipts\/\$\{encodeURIComponent\(receipt\.id\)\}\/read/u);
    assert.match(
      pageSource,
      /memory-receipts\/sessions\/\$\{encodeURIComponent\(normalizedSessionId\)\}\/read/u,
    );
    assert.match(pageSource, /receipt\.kind !== "bot_relation"/u);
    assert.match(pageSource, /unreadMemoryReceiptBotIds/u);
    assert.match(pageSource, /renderLiveBotMemoryReceiptChip/u);
    assert.match(
      pageSource,
      /debateBotPresencePlate[\s\S]{0,9000}renderLiveBotMemoryReceiptChip/u,
    );
    assert.match(
      pageSource,
      /signalBotPresencePlate[\s\S]{0,9000}renderLiveBotMemoryReceiptChip/u,
    );
    assert.match(
      pageStylesSource,
      /\.zenLiveBotPresencePlate > \.liveBotMemoryReceiptChip\s*\{\s*pointer-events: auto/u,
    );
    assert.match(pageSource, /DEBATE_MEMORY_RECEIPT_BADGE_DURATION_MS = 5_000/u);
    assert.match(pageSource, /data-transient=\{props\.transient \? "true" : undefined\}/u);
    assert.match(
      pageSource,
      /renderLiveBotMemoryReceiptChip\(\s*liveBot\.id,\s*liveBot\.name,\s*\{ transient: true \},/u,
    );
    assert.match(pageSource, /aria-live="polite"/u);
    assert.match(pageSource, /View in Memories/u);
    assert.doesNotMatch(pageSource, /was just addressed/u);
  });

  it("clears only finished Signal session receipts while preserving Coffee and Debate behavior", () => {
    assert.match(
      pageSource,
      /onSessionEnded=\{\(sessionId\) => \{[\s\S]{0,140}resolveSignalSessionMemoryReceipts\(sessionId\)/u,
    );
    assert.match(
      pageSource,
      /receipt\.kind === "bot_relation"[\s\S]{0,100}receipt\.conversationId === normalizedSessionId/u,
    );
    assert.match(
      pageSource,
      /resolvedSignalSessionReceiptIdsRef\.current\.add\(normalizedSessionId\)/u,
    );
    assert.match(
      pageSource,
      /resolvedSignalSessionReceiptIdsRef\.current\.has\([\s\S]{0,120}receipt\.conversationId/u,
    );
    const signalAvatarStart = pageSource.indexOf("data-signal-bot-presence=\"true\"");
    const signalAvatarEnd = pageSource.indexOf("renderMug={(botSummary", signalAvatarStart);
    const signalAvatar = pageSource.slice(signalAvatarStart, signalAvatarEnd);
    assert.match(
      pageSource,
      /const signalDashboardAvatar = avatarState\.surface === "dashboard"/u,
    );
    assert.doesNotMatch(signalAvatar, /screenMode=/u);
    assert.match(
      signalAvatar,
      /!signalDashboardAvatar && signalLiveSessionId[\s\S]*?renderLiveBotMemoryReceiptChip\(bot\.id, bot\.name, \{[\s\S]*?sessionId: signalLiveSessionId/u,
    );
    assert.doesNotMatch(pageSource, /BotPowerBadge/u);
    assert.match(
      pageSource,
      /candidate\.conversationId === options\.sessionId/u,
    );
    assert.doesNotMatch(pageSource, /activeSignalMemoryReceiptSessionIdRef/u);
    assert.match(
      pageSource,
      /debateBotPresencePlate[\s\S]{0,9000}renderLiveBotMemoryReceiptChip/u,
    );
  });

  it("updates Coffee guidance without changing the talking indicator", () => {
    assert.match(
      modeTutorialsSource,
      /The \.\.\. chip still means a bot is talking or preparing to reply/u,
    );
    assert.match(
      modeTutorialsSource,
      /A persistent ! beside a bot now means it learned a new memory about another bot/u,
    );
  });
});

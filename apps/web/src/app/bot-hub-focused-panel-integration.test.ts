import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("focused bot panel integration", () => {
  it("opens a full-screen Bot Lobby while keeping a group-origin room mounted", () => {
    assert.match(pageSource, /export interface BotHubOpenContext/);
    assert.match(
      pageSource,
      /origin: "default" \| "library" \| "group-room"/,
    );
    assert.match(
      pageSource,
      /data-bot-lobby=\{[\s\S]{0,100}botPanelView === "botHub" \? "true" : undefined/,
    );
    assert.match(pageSource, /aria-label=\{`\$\{selectedBotPanelBot\.name\} Bot Lobby`\}/);
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="botHub"\]\s*\{[\s\S]*?--panel-width:\s*100vw;[\s\S]*?height:\s*calc\(100dvh - var\(--bot-lobby-nav-height\)\)/,
    );
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="botHub"\]\s*\{[\s\S]*?background:\s*transparent;/,
    );
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="botHub"\] > \.panelHeader[\s\S]*?width:\s*var\(--bot-lobby-management-width\);[\s\S]*?margin-left:\s*auto;/,
    );
    assert.match(
      cssSource,
      /\.botPanelHubShowcase\[data-panel="bots"\]\[data-bot-view="botHub"\][\s\S]*?right:\s*min\(58vw, 1080px\);/,
    );
    assert.match(
      cssSource,
      /\.botPanelHubShowcase\[data-panel="bots"\]\[data-bot-view="botHub"\][\s\S]*?\.botPanelHubAvatarPlate[\s\S]*?--zen-live-bot-avatar-size:\s*min\(520px, 58vh, 38vw\) !important;/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.panelOverlay\}[\s\S]{0,180}data-panel=\{panel\}[\s\S]{0,180}data-bot-view=\{panel === "bots" \? botPanelView : undefined\}/,
    );
    assert.match(
      cssSource,
      /\.panelOverlay\[data-panel="bots"\]\[data-bot-view="botHub"\][\s\S]*?backdrop-filter:\s*blur\(16px\) saturate\(0\.78\);/,
    );
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="botHub"\] \.botPanelHubManagement\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    const showcase = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    assert.doesNotMatch(showcase, /botHubOpenContext\.origin === "group-room"/);
    assert.match(
      pageSource,
      /const botGroupWaitingRoomPanelOpen = Boolean\([\s\S]{0,220}botHubOpenContext\.origin === "group-room"/,
    );
    assert.match(
      pageSource,
      /botHubOpenContext\.origin === "group-room"\) \{[\s\S]{0,80}closePanel\(\)/,
    );
    assert.match(pageSource, /"Back to club room"/);
  });

  it("returns surface-opened Lobbies to Zen and Library-opened Lobbies to the Library", () => {
    assert.match(pageSource, /botHubOpenContext\.origin === "library"[\s\S]{0,120}"Back to bot library"[\s\S]{0,120}"Back to Zen"/);
    assert.match(
      pageSource,
      /if \(botHubOpenContext\.origin === "library"\) \{[\s\S]{0,100}returnBotPanelHubToLibrary\(\)/,
    );
    assert.match(
      pageSource,
      /openBotPanelHub\(b, \{[\s\S]{0,80}origin: "library"/,
    );
  });

  it("organizes the focused experience into navigable Overview, Customize, and Library sections", () => {
    const start = pageSource.indexOf(
      '{botPanelView === "botHub" && selectedBotPanelBot ?',
    );
    const end = pageSource.indexOf("{/* One form, two modes.", start);
    assert.ok(start >= 0 && end > start);
    const hubSource = pageSource.slice(start, end);
    const navigation = hubSource.indexOf('aria-label="Bot Lobby sections"');
    const overview = hubSource.indexOf('id="bot-lobby-overview"');
    const talk = hubSource.indexOf('data-tutorial-target="bot-hub-talk-to-me"');
    const customize = hubSource.indexOf('id="bot-lobby-customize"');
    const library = hubSource.indexOf('id="bot-lobby-library"');
    const resources = hubSource.indexOf(
      'data-tutorial-target="bot-hub-resources"',
    );
    const assets = hubSource.indexOf('data-tutorial-target="bot-hub-assets"');
    const composer = hubSource.indexOf("<FocusedBotPanelComposer");
    assert.ok(
      navigation >= 0 &&
        overview > navigation &&
        talk > overview &&
        customize > talk &&
        library > customize &&
        resources > library &&
        assets > resources &&
        composer > library,
    );
    assert.match(hubSource, /href="#bot-lobby-overview"[\s\S]*?href="#bot-lobby-customize"[\s\S]*?href="#bot-lobby-library"/u);
    assert.match(hubSource, /<footer className=\{styles\.botPanelHubComposerDock\}>[\s\S]*?<FocusedBotPanelComposer/u);
    assert.match(hubSource, /<strong>Talk to me<\/strong>[\s\S]*?Start a fresh one-on-one with this bot\./u);
    assert.doesNotMatch(
      hubSource.slice(overview, customize),
      /BotAssetLibraryIndex/u,
    );
    assert.doesNotMatch(hubSource, /openImagesPanelForBot/);
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="botHub"\] > \.botPanelHub\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto;[\s\S]*?overflow:\s*hidden;/u,
    );
    assert.match(
      cssSource,
      /\.botPanelHubComposerDock\s*\{[\s\S]*?border-top:\s*1px solid var\(--line\)/u,
    );
    assert.match(
      cssSource,
      /@media \(min-width: 821px\)[\s\S]*?#bot-lobby-library\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?align-items:\s*start;/u,
    );
    assert.match(
      cssSource,
      /@media \(max-width: 820px\)[\s\S]*?\.botPanelHubSectionNav\s*\{[\s\S]*?overflow-x:\s*auto;/u,
    );
    assert.match(
      cssSource,
      /\.botPanelHubSectionNav a:hover,[\s\S]*?\.botPanelHubSectionNav a:focus-visible\s*\{[\s\S]*?outline:\s*none;/u,
    );
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="botHub"\]\s*\{[\s\S]*?--bot-lobby-pane:[\s\S]*?--bot-lobby-card:[\s\S]*?--bot-lobby-subtle:/u,
    );
    assert.match(
      cssSource,
      /\.themeLight \.panel\.panelBots\[data-bot-panel-view="botHub"\]\s*\{[\s\S]*?--bot-lobby-pane:[\s\S]*?--bot-lobby-card:[\s\S]*?--bot-lobby-subtle:/u,
    );
  });

  it("neutralizes only the focused bot's server-owned global mood", () => {
    assert.match(
      pageSource,
      /async function neutralizeBotMood\(bot: Bot\)[\s\S]*?`\/api\/bots\/\$\{encodeURIComponent\(bot\.id\)\}\/mood\/neutralize`[\s\S]*?method: "POST"/u,
    );
    assert.match(
      pageSource,
      /data-tutorial-target="bot-hub-neutralize-mood"[\s\S]*?void neutralizeBotMood\(selectedBotPanelBot\)[\s\S]*?<strong>[\s\S]*?Neutralize mood/u,
    );
    assert.match(
      pageSource,
      /Reset this bot&apos;s shared mood across modes\./u,
    );
  });

  it("resolves Signal by exact host identity and reuses its logo and navigation", () => {
    assert.match(
      pageSource,
      /show\.hostBotId === botPanelSuggestionBot\.id/,
    );
    assert.match(pageSource, /<SignalShowLogo show=\{botHubSignalShow\} compact/);
    assert.match(
      pageSource,
      /setSignalInitialCastBotIds\(\[bot\.id\]\);[\s\S]{0,120}navigateToView\("botcast"\)/,
    );
    assert.match(
      pageSource,
      /if \(!botHubSignalShow\) return \{ status: "unavailable" \}/,
    );
  });

  it("starts exact fresh bot-first and user-first conversations after state commits", () => {
    assert.match(pageSource, /type FocusedBotConversationLaunch/);
    assert.match(
      pageSource,
      /const launch = createFocusedBotConversationLaunch\(\{[\s\S]{0,160}botId: bot\.id,[\s\S]{0,100}mode,[\s\S]{0,100}message,[\s\S]{0,140}context: botHubOpenContext,[\s\S]{0,140}validGroupBotIds: botGroupWaitingRoomCanonicalBotIds/,
    );
    assert.match(pageSource, /setFocusedBotConversationLaunch\(launch\)/);
    assert.match(
      pageSource,
      /const surfaceReady =[\s\S]{0,240}zenPersonaBotId === launch\.botId[\s\S]{0,240}forceNewConversationOnNextSend/,
    );
    assert.match(
      pageSource,
      /startFreshConversation\(false, \{ zenHomeBotId: launch\.botId \}\)/,
    );
    assert.match(
      pageSource,
      /starterPrompt: true,[\s\S]{0,100}starterPromptWarrantsIntro: true/,
    );
    assert.match(pageSource, /draftOverride: launch\.message/);
    assert.match(
      pageSource,
      /\.catch\(\(caught\) => \{[\s\S]{0,220}setComposerDraftNow\(launch\.message\)/,
    );
  });

  it("restores the compact avatar and focus only when its exact club room returns", () => {
    assert.match(
      pageSource,
      /setFocusedBotRoomReturnCheckpoint\(launch\.roomReturnCheckpoint\)/,
    );
    const restoreStart = pageSource.indexOf(
      "const resolution = resolveFocusedBotRoomReturn",
    );
    const restoreEnd = pageSource.indexOf(
      "const botGroupWaitingRoomRenderedPresences",
      restoreStart,
    );
    assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
    const restoreSource = pageSource.slice(restoreStart, restoreEnd);
    assert.match(
      restoreSource,
      /visibleGroupId: activeBotLibraryGroupFilter\?\.id/,
    );
    assert.match(
      restoreSource,
      /botGroupWaitingRoomRestoreFocusBotIdRef\.current =\s*resolution\.returnFocusBotId/,
    );
    assert.match(
      restoreSource,
      /setBotGroupWaitingRoomPromotedBotId\(resolution\.promotedBotId\)/,
    );
    assert.doesNotMatch(
      restoreSource,
      /visitZenHome|startFreshConversation|navigateToView/,
    );
  });

  it("keeps panel draft updates below the room parent render boundary", () => {
    const composerStart = pageSource.indexOf(
      "const FocusedBotPanelComposer = memo",
    );
    const composerEnd = pageSource.indexOf(
      "// ── Empty-state icon",
      composerStart,
    );
    const homeStart = pageSource.indexOf("function HomeContent()");
    assert.ok(composerStart >= 0 && composerEnd > composerStart);
    assert.ok(homeStart > composerEnd);
    const composerSource = pageSource.slice(composerStart, composerEnd);
    const homeSource = pageSource.slice(homeStart);

    assert.match(composerSource, /const \[draft, setDraft\] = useState\(""\)/);
    assert.match(composerSource, /value=\{draft\}/);
    assert.doesNotMatch(homeSource, /botHubMessageDraft|setBotHubMessageDraft/);
    assert.match(
      homeSource,
      /<FocusedBotPanelComposer[\s\S]{0,120}key=\{selectedBotPanelBot\.id\}/,
    );
    assert.match(
      composerSource,
      /event\.key !== "Enter" \|\|[\s\S]{0,100}event\.shiftKey[\s\S]{0,100}event\.nativeEvent\.isComposing/,
    );
    assert.match(
      composerSource,
      /event\.currentTarget\.form\?\.requestSubmit\(\)/,
    );
    assert.match(composerSource, /Enter sends · Shift\+Enter adds a new line/);
  });
});

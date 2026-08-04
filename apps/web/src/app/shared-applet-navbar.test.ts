import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const slateSource = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const slateCss = readFileSync(
  new URL("./slateWorkspace.module.css", import.meta.url),
  "utf8",
);
const slateStoryMapCss = readFileSync(
  new URL("./slateStoryMap.module.css", import.meta.url),
  "utf8",
);

test("every active applet consumes the Debate PRISM navbar contract", () => {
  const brandHelper = pageSource.slice(
    pageSource.indexOf("const renderSharedAppletBrand"),
    pageSource.indexOf("const renderSharedAppletNavbar"),
  );
  const navbarHelper = pageSource.slice(
    pageSource.indexOf("const renderSharedAppletNavbar"),
    pageSource.indexOf("/** Conversation tools"),
  );

  assert.match(brandHelper, /PrismWordmarkWithVersion/);
  assert.match(brandHelper, /AppletHeaderLabel appletId=\{appletId\}/);
  assert.match(brandHelper, /data-shared-applet-brand=\{appletId\}/);
  assert.match(navbarHelper, /styles\.chatHeader/);
  assert.match(navbarHelper, /styles\.sharedAppletHeader/);
  assert.match(
    navbarHelper,
    /liveSessionChromePolicy\(options\.liveSessionName \?\? "Signal"\)/,
  );
  assert.match(
    navbarHelper,
    /options\.liveSessionActive && options\.liveSessionExit[\s\S]{0,120}coffeeExitSessionButton[\s\S]{0,400}renderAppSwitcher/u,
  );
  assert.match(
    navbarHelper,
    /const voiceSelectorOptions = \{[\s\S]*disabled:[\s\S]*disabledNavbarActions\.voice[\s\S]*options\.voiceTutorialTarget \?\? "botcast-voice-mode"[\s\S]*options\.showVoiceSelector[\s\S]*renderVoiceModeSelector\(voiceSelectorOptions\)/,
  );
  assert.match(pageSource, /data-tutorial-target=\{options\.tutorialTarget\}/);
  assert.match(
    navbarHelper,
    /renderUniversalNavbarButtons\(\{[\s\S]*disabledActions:[\s\S]*disabledActionTooltips:/,
  );
  assert.match(navbarHelper, /data-shared-app-navbar="true"/);
  assert.match(navbarHelper, /data-live-session-locked=/);
  assert.match(
    navbarHelper,
    /options\.brandAppletId[\s\S]*renderSharedAppletBrand\(options\.brandAppletId\)/u,
  );

  for (const appletId of ["chat", "coffee", "debate", "botcast", "slate"]) {
    assert.match(pageSource, new RegExp(`brandAppletId:\\s*"${appletId}"`));
  }
  assert.match(
    pageSource,
    /navigationHeader=\{\(\{[\s\S]*liveSessionActive,[\s\S]*episodeModelControl,[\s\S]*\}\) => \{[\s\S]*renderSharedAppletNavbar\("Signal tools", \{[\s\S]*showVoiceSelector: true,[\s\S]*liveSessionActive,[\s\S]*modelControls:/u,
  );
  assert.match(
    pageSource,
    /modelControls:\s*\([\s\S]*renderProviderModeToggle\([\s\S]*styles\.chatHeaderModeToggle,[\s\S]*liveChromePolicy\?\.lockMessage[\s\S]*false[\s\S]*<ComposerModelPicker/u,
  );
  assert.match(
    pageSource,
    /const episodePrimaryForAuto = resolvedAutoPrimaryForComposer\([\s\S]{0,260}const episodeEffortTarget = modelEffortTargetForSelection\(\{[\s\S]{0,220}episodePrimaryForAuto\?\.provider[\s\S]{0,180}episodePrimaryForAuto\?\.model/u,
  );
  assert.doesNotMatch(signalSource, /providerModeToggle/u);
  assert.doesNotMatch(signalSource, /signalGlobalProviderControl/u);
  assert.doesNotMatch(signalCss, /\.signalGlobalProviderControl/u);
  assert.match(
    pageSource,
    /navigationHeader=\{renderSharedAppletNavbar\("Slate tools", \{[\s\S]*showVoiceSelector: true,[\s\S]*modelControls: renderSharedAccountRoutingControls\("Slate"\),[\s\S]*\}\)\}/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Debate tools",\s*\{[\s\S]*brandAppletId:\s*"debate"[\s\S]*showVoiceSelector:\s*true/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Chat tools", \{[\s\S]*brandAppletId: "chat"[\s\S]*headerRef: chatHeaderRef[\s\S]*controlRail: renderHeaderModelPicker\(\)/u,
  );
  assert.doesNotMatch(pageSource, /data-zen-header-hidden=/u);
  assert.match(
    pageCss,
    /\.appLayout\[data-zen-surface="true"\] \.chatHeader\.sharedAppletHeader\s*\{[\s\S]*position:\s*relative;[\s\S]*inset:\s*auto;/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Coffee tools", \{[\s\S]*brandAppletId: "coffee"[\s\S]*liveSessionName: "Coffee"/u,
  );
  assert.match(
    pageCss,
    /\.coffeeShell > \.sharedAppletHeader\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*grid-row:\s*1;/u,
  );
  assert.match(
    pageSource,
    /const renderSharedAccountRoutingControls =[\s\S]*renderProviderModeToggle\([\s\S]*styles\.chatHeaderModeToggle,[\s\S]*null,[\s\S]*false[\s\S]*<ComposerModelPicker/u,
  );
  const responseLaneControl = pageSource.slice(
    pageSource.indexOf("const renderProviderModeToggle ="),
    pageSource.indexOf("const renderSharedAccountRoutingControls ="),
  );
  assert.match(responseLaneControl, /\(\["local", "online"\] as const\)\.map/u);
  assert.match(responseLaneControl, /styles\.autoModeOption/u);
  assert.match(responseLaneControl, /styles\.autoModeOptionActive/u);
  assert.doesNotMatch(responseLaneControl, /styles\.modeToggleTrack/u);
  assert.match(pageSource, /sharedAppletModelChoiceByProvider/u);
  assert.doesNotMatch(pageSource, /persistSharedAppletAccountModelChoice/u);
});

test("contextual Signal entry preserves the chosen cast", () => {
  assert.match(signalSource, /initialCastBotIds\?: string\[\]/u);
  assert.match(
    pageSource,
    /setSignalInitialCastBotIds\(botIds\.slice\(0, 2\)\)[\s\S]*navigateToView\("botcast"\)/u,
  );
  assert.match(
    pageSource,
    /<BotcastExperience[\s\S]*initialCastBotIds=\{signalInitialCastBotIds\}/u,
  );
  assert.match(
    signalSource,
    /nextShows\.find\(\(show\) => show\.hostBotId === initialHostBotId\)/u,
  );
  assert.match(signalSource, /useState\(initialCast\[1\] \?\? ""\)/u);
});

test("Signal gives the shared navbar the complete full-width shell row", () => {
  assert.doesNotMatch(signalSource, /sidebarHeader:\s*ReactNode/);
  assert.match(
    signalSource,
    /navigationHeader:[\s\S]*ReactNode[\s\S]*liveSessionActive: boolean[\s\S]*showLiveExit: boolean/u,
  );
  assert.match(
    signalSource,
    /typeof navigationHeader === "function"[\s\S]*navigationHeader\(\{[\s\S]*liveSessionActive,[\s\S]*showLiveExit,[\s\S]*cuttingShow,[\s\S]*onCutShow:[\s\S]*episodeModelControl:/u,
  );
  assert.doesNotMatch(signalSource, /styles\.sidebarNavigation/);
  assert.match(signalSource, /styles\.mainNavigation/);
  assert.doesNotMatch(signalSource, /libraryBrand|headerActions/);
  assert.match(
    signalCss,
    /\.shell\s*\{[\s\S]*grid-template-columns:\s*286px minmax\(0, 1fr\);[\s\S]*grid-template-rows:\s*66px minmax\(0, 1fr\);/,
  );
  assert.match(
    signalCss,
    /\.mainNavigation\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*grid-row:\s*1;/,
  );
});

test("Slate aligns the complete shared navbar above its structure rail", () => {
  assert.doesNotMatch(slateSource, /sidebarHeader:\s*ReactNode/);
  assert.match(slateSource, /navigationHeader:\s*ReactNode/);
  assert.match(
    slateCss,
    /\.shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(250px, 320px\) minmax\(0, 1fr\);[\s\S]*grid-template-rows:\s*66px minmax\(0, 1fr\);/,
  );
  assert.match(
    slateCss,
    /\.mainNavigation\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*grid-row:\s*1;/,
  );
  assert.match(
    slateCss,
    /\.shell > :not\(\.mainNavigation\) button,[\s\S]{0,220}font:\s*inherit;/u,
  );
  assert.doesNotMatch(slateCss, /\.shell button,\s*\n\.shell input/u);
  assert.match(
    slateCss,
    /\[data-shared-app-navbar="true"\][\s\S]*\[data-app-switcher-trigger="true"\][\s\S]*font-size:\s*0\.76rem;/u,
  );
  assert.match(
    slateCss,
    /\[data-tutorial-target="auto-response-mode"\][\s\S]*> button[\s\S]*font-size:\s*9px;/u,
  );
  assert.match(
    slateCss,
    /\[data-prism-model-picker-trigger="true"\][\s\S]*font-size:\s*12px;/u,
  );
  assert.match(
    slateCss,
    /\[data-voice-mode\][\s\S]*> button[\s\S]*font-size:\s*0\.73rem;/u,
  );
  assert.match(
    slateCss,
    /\.workspace\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*grid-row:\s*2;[\s\S]*height:\s*100%;/,
  );
  assert.match(
    pageCss,
    /\.sharedAppletHeader\s*\{[\s\S]*min-height:\s*66px;[\s\S]*height:\s*100%;/,
  );
});

test("shared sidebar and navbar materials remain owned by the active theme", () => {
  for (const css of [signalCss, slateCss]) {
    assert.match(
      css,
      /\.mainNavigation\s*\{[\s\S]*background:\s*var\(--bg-surface/,
    );
  }
  assert.match(pageCss, /\.themeDark\s*\{[\s\S]*--bg-surface:/);
  assert.match(pageCss, /\.themeLight\s*\{[\s\S]*--bg-surface:/);
  assert.match(
    pageCss,
    /\.sharedAppletHeader\s*\{[\s\S]*box-sizing:\s*border-box;/,
  );
});

test("Signal, Slate, and immersive Zen child navigation follows Debate Studio geometry", () => {
  assert.match(
    signalCss,
    /\.showRow\s*\{[\s\S]*border-left:\s*2px solid transparent;[\s\S]*border-radius:\s*0 8px 8px 0;/u,
  );
  assert.match(
    signalCss,
    /\.showRow\[data-selected="true"\]\s*\{[\s\S]*border-left-color:\s*var\(--show-accent\);[\s\S]*linear-gradient/u,
  );
  assert.match(
    slateStoryMapCss,
    /\.row\s*\{[\s\S]*border-left:\s*2px solid transparent;[\s\S]*border-radius:\s*0 8px 8px 0;/u,
  );
  assert.match(
    slateStoryMapCss,
    /\.row\[data-selected="true"\]\s*\{[\s\S]*border-left-color:[\s\S]*linear-gradient/u,
  );
  assert.match(
    pageCss,
    /\.appLayout\[data-zen-surface="true"\]\[data-chat-sidebar-hidden="true"\][\s\S]*\.conversationTitleButton,[\s\S]*border-left:\s*2px solid transparent;[\s\S]*border-radius:\s*0 8px 8px 0;/u,
  );
  assert.match(
    pageCss,
    /\.appLayout\[data-zen-surface="true"\]\[data-chat-sidebar-hidden="true"\][\s\S]*\.conversationTitleButton\.selected,[\s\S]*border-left-color:\s*var\(--row-color, var\(--accent\)\);[\s\S]*linear-gradient/u,
  );
  assert.match(
    pageCss,
    /\.appLayout\[data-zen-surface="true"\]\[data-chat-sidebar-hidden="true"\][\s\S]*\.conversationGroupTile,[\s\S]*border-left:\s*2px solid transparent;[\s\S]*border-radius:\s*0 8px 8px 0;/u,
  );
  assert.match(
    pageCss,
    /\.conversationGroupAccordionItem:has\(\.conversationGroupCollapseExpanded\)[\s\S]*border-left-color:\s*var\(--row-color, var\(--accent\)\);/u,
  );
});

test("sidebar-open Chat keeps the premium conversation chip treatment", () => {
  assert.match(
    pageCss,
    /\.conversationRow\[style\*="--row-color"\] \.conversationTitleButton\s*\{[\s\S]*radial-gradient[\s\S]*border-color:\s*color-mix[\s\S]*color:\s*var\(--fg\);/u,
  );
  assert.doesNotMatch(
    pageCss,
    /\.appLayout\[data-zen-surface="true"\](?!\[data-chat-sidebar-hidden="true"\])[^{,]*\.conversationTitleButton/u,
  );
  assert.doesNotMatch(
    pageCss,
    /\.appLayout\[data-zen-surface="true"\](?!\[data-chat-sidebar-hidden="true"\])[^{,]*\.conversationGroupTile/u,
  );
});

test("shared navbar model names stay readable beside the effort control", () => {
  assert.match(
    pageCss,
    /\.chatHeaderModelPicker \.composeModelControl\s*\{[\s\S]*max-width:\s*min\(11rem, 32vw\);/u,
  );
  assert.match(
    pageCss,
    /\.chatHeaderModelPicker \.composeModelTriggerName\s*\{[\s\S]*max-width:\s*min\(14ch, 24vw\);/u,
  );
});

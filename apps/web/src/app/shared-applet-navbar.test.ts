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

test("Slate, Signal, and Debate consume one shared PRISM navbar contract", () => {
  const sidebarHelper = pageSource.slice(
    pageSource.indexOf("const renderSharedAppletSidebarHeader"),
    pageSource.indexOf("const renderSharedAppletNavbar"),
  );
  const navbarHelper = pageSource.slice(
    pageSource.indexOf("const renderSharedAppletNavbar"),
    pageSource.indexOf("/** Conversation tools"),
  );

  assert.match(sidebarHelper, /PrismWordmarkWithVersion/);
  assert.match(sidebarHelper, /AppletHeaderLabel appletId=\{appletId\}/);
  assert.match(sidebarHelper, /data-shared-app-sidebar-brand=\{appletId\}/);
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
    /options\.brandAppletId[\s\S]*renderSharedAppletSidebarHeader\(options\.brandAppletId\)/u,
  );

  for (const appletId of ["botcast", "slate"]) {
    assert.match(
      pageSource,
      new RegExp(
        `sidebarHeader=\\{renderSharedAppletSidebarHeader\\("${appletId}"\\)\\}`,
      ),
    );
  }
  assert.match(
    pageSource,
    /navigationHeader=\{\(\{[\s\S]*liveSessionActive,[\s\S]*showLiveExit,[\s\S]*cuttingShow,[\s\S]*onCutShow,[\s\S]*episodeModelControl,[\s\S]*\}\) => \{[\s\S]*renderSharedAppletNavbar\("Signal tools", \{[\s\S]*showVoiceSelector: !replayActive,[\s\S]*liveSessionActive,[\s\S]*liveSessionExit: showLiveExit/u,
  );
  assert.match(
    pageSource,
    /modelControls:\s*\([\s\S]*renderProviderModeToggle\([\s\S]*styles\.chatHeaderModeToggle,[\s\S]*true,[\s\S]*liveChromePolicy\?\.lockMessage[\s\S]*<ComposerModelPicker/u,
  );
  assert.doesNotMatch(signalSource, /providerModeToggle/u);
  assert.doesNotMatch(signalSource, /signalGlobalProviderControl/u);
  assert.doesNotMatch(signalCss, /\.signalGlobalProviderControl/u);
  assert.match(
    pageSource,
    /navigationHeader=\{renderSharedAppletNavbar\("Slate tools", \{[\s\S]*modelControls: renderSharedAccountRoutingControls\("Slate"\),[\s\S]*\}\)\}/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Debate tools",\s*\{[\s\S]*brandAppletId:\s*"debate"[\s\S]*showVoiceSelector:\s*true/u,
  );
  assert.match(
    pageSource,
    /const renderSharedAccountRoutingControls =[\s\S]*renderProviderModeToggle\([\s\S]*styles\.chatHeaderModeToggle,[\s\S]*true,[\s\S]*null,[\s\S]*false,[\s\S]*<ComposerModelPicker/u,
  );
  assert.match(
    pageSource,
    /async function persistSharedAppletAccountModelChoice[\s\S]*preferredLocalModel[\s\S]*preferredOnlineModel[\s\S]*api\("\/api\/settings"/u,
  );
  assert.match(
    pageSource,
    /async function persistSharedAppletResponseMode[\s\S]*autoModeEnabled:[\s\S]*preferredProvider,[\s\S]*api\("\/api\/settings"/u,
  );
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
  assert.match(
    signalSource,
    /useState\(initialCast\[1\] \?\? ""\)/u,
  );
});

test("Signal gives shared navigation its own aligned shell row", () => {
  assert.match(signalSource, /sidebarHeader:\s*ReactNode/);
  assert.match(
    signalSource,
    /navigationHeader:[\s\S]*ReactNode[\s\S]*liveSessionActive: boolean[\s\S]*showLiveExit: boolean/u,
  );
  assert.match(
    signalSource,
    /typeof navigationHeader === "function"[\s\S]*navigationHeader\(\{[\s\S]*liveSessionActive,[\s\S]*showLiveExit,[\s\S]*cuttingShow,[\s\S]*onCutShow:[\s\S]*episodeModelControl:/u,
  );
  assert.match(
    signalSource,
    /styles\.sidebarNavigation\}[\s\S]*styles\.mainNavigation\}/,
  );
  assert.doesNotMatch(signalSource, /libraryBrand|headerActions/);
  assert.match(
    signalCss,
    /\.shell\s*\{[\s\S]*grid-template-columns:\s*286px minmax\(0, 1fr\);[\s\S]*grid-template-rows:\s*66px minmax\(0, 1fr\);/,
  );
  assert.match(
    signalCss,
    /\.sidebarNavigation\s*\{[\s\S]*grid-column:\s*1;[\s\S]*border-right:[\s\S]*border-bottom:/,
  );
  assert.match(
    signalCss,
    /\.mainNavigation\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1;/,
  );
});

test("Slate aligns the shared navigation row to its structure rail", () => {
  assert.match(slateSource, /sidebarHeader:\s*ReactNode/);
  assert.match(slateSource, /navigationHeader:\s*ReactNode/);
  assert.match(
    slateCss,
    /\.shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(250px, 320px\) minmax\(0, 1fr\);[\s\S]*grid-template-rows:\s*66px minmax\(0, 1fr\);/,
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
      /\.sidebarNavigation,\s*\.mainNavigation\s*\{[\s\S]*background:\s*var\(--bg-surface/,
    );
    assert.match(
      css,
      /\.sidebarNavigation\s*\{[\s\S]*border-right:\s*1px solid var\(--line/,
    );
  }
  assert.match(pageCss, /\.themeDark\s*\{[\s\S]*--bg-surface:/);
  assert.match(pageCss, /\.themeLight\s*\{[\s\S]*--bg-surface:/);
  assert.match(
    pageCss,
    /\.sharedAppletHeader\s*\{[\s\S]*box-sizing:\s*border-box;/,
  );
});

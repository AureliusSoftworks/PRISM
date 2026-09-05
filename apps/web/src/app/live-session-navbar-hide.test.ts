import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globalsCss = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const pageCss = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const botcastCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const coffeeIntroCss = readFileSync(
  new URL("./CoffeeIntroCurtain.module.css", import.meta.url),
  "utf8",
);
const warmupCss = readFileSync(
  new URL("./model-warmup-intermission.module.css", import.meta.url),
  "utf8",
);
const warmupSource = readFileSync(
  new URL("./ModelWarmupIntermission.tsx", import.meta.url),
  "utf8",
);
const coffeePolicy = readFileSync(
  new URL("./coffee-shell-policy.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const coffeeIntro = readFileSync(
  new URL("./CoffeeIntroCurtain.tsx", import.meta.url),
  "utf8",
);
const mysterySource = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const legacyMysterySource = readFileSync(
  new URL("./DebateMysteryExperience.tsx", import.meta.url),
  "utf8",
);

test("ordinary applet surfaces retain the full shared-navbar height", () => {
  assert.match(globalsCss, /--app-navbar-height:\s*66px/u);
  assert.doesNotMatch(globalsCss, /data-app-navbar-session-hidden/u);
  assert.doesNotMatch(globalsCss, /data-app-navbar-hidden/u);
});

test("active sessions keep Back, route provenance, and Theme while exposing contextual slots", () => {
  const helperStart = pageSource.indexOf("const renderSharedAppletNavbar");
  const helperEnd = pageSource.indexOf("/** Conversation tools", helperStart);
  const helper = pageSource.slice(helperStart, helperEnd);
  const liveStart = helper.indexOf("if (options.liveSessionActive)");
  const liveReturn = helper.indexOf("    return (", liveStart);
  const ordinaryReturn = helper.indexOf("    return (", liveReturn + 1);
  const liveBranch = helper.slice(liveStart, ordinaryReturn);

  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.ok(liveStart >= 0 && ordinaryReturn > liveReturn);
  assert.doesNotMatch(pageSource, /setAppNavbarSessionHidden/u);
  assert.doesNotMatch(pageSource, /hideAppNavbarForImmersion/u);
  assert.match(liveBranch, /data-live-session-minimal-chrome="true"/u);
  assert.match(liveBranch, /className=\{styles\.liveSessionBackButton\}/u);
  assert.match(liveBranch, /<span>Back<\/span>/u);
  assert.match(liveBranch, /<LiveSessionModelChip/u);
  assert.match(liveBranch, /options\.liveSessionRoutingChip/u);
  assert.match(liveBranch, /data-live-session-context-title-slot="true"/u);
  assert.match(liveBranch, /data-live-session-context-actions-slot="true"/u);
  assert.match(liveBranch, /<ThemeGlyph mode=\{effectiveThemeMode\}/u);
  assert.doesNotMatch(liveBranch, /renderAppSwitcher/u);
  assert.doesNotMatch(liveBranch, /renderUniversalNavbarButtons/u);
  assert.doesNotMatch(liveBranch, /renderVoiceModeSelector/u);
});

test("Coffee, Story, Debate, Whodunnit Court, and Signal use the compact full-viewport session row", () => {
  assert.match(
    pageCss,
    /\.coffeeShell\[data-session-active="true"\]\s*\{[^}]*--app-shell-top-nav-height:\s*50px;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
  );
  assert.match(
    pageCss,
    /\.storyShell\[data-session-active="true"\]\s*\{[^}]*--app-shell-top-nav-height:\s*50px;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
  );
  assert.match(
    pageCss,
    /\.storyShell\[data-session-active="true"\] \.storySidebar\s*\{\s*display:\s*none/u,
  );
  assert.match(
    pageCss,
    /\.debateShell\[data-session-active="true"\]\s*\{[^}]*--app-shell-top-nav-height:\s*50px/u,
  );
  assert.match(
    botcastCss,
    /\.shell\[data-live-episode="true"\]\s*\{[^}]*--app-shell-top-nav-height:\s*50px;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
  );
});

test("each active-session family supplies its real Back action and locked route", () => {
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Coffee tools", \{[\s\S]{0,420}liveSessionExit: coffeeChromePolicy\.liveSessionActive[\s\S]{0,260}label: "Back"[\s\S]{0,260}liveSessionRoutingChip: coffeeLiveRoutingChip/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Story tools", \{[\s\S]{0,520}liveSessionExit: storyLiveSessionActive[\s\S]{0,260}label: "Back"[\s\S]{0,260}liveSessionRoutingChip: storyLiveRoutingChip/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Debate tools", \{[\s\S]{0,520}liveSessionExit: debateLiveSessionActive[\s\S]{0,260}label: "Back"[\s\S]{0,260}liveSessionRoutingChip: debateLiveRoutingChip/u,
  );
  assert.match(
    pageSource,
    /navigationHeader=\{\(\{[\s\S]{0,320}liveSessionBack,[\s\S]{0,120}lockedRoutingChip[\s\S]{0,3000}liveSessionExit: liveSessionActive[\s\S]{0,300}label: "Back"[\s\S]{0,300}liveSessionRoutingChip: lockedRoutingChip/u,
  );
  assert.match(
    signalSource,
    /liveSessionBack:\s*\{[\s\S]{0,420}onClick: returnFromLiveSession[\s\S]{0,500}lockedRoutingChip: resolvedLockedRoutingChip/u,
  );
});

test("Whodunnit investigation combines its context with the shared session row", () => {
  assert.equal(
    (mysterySource.match(/onClick=\{props\.onExit\}/gu) ?? []).length,
    (mysterySource.match(/data-session-local-back="true"/gu) ?? []).length,
  );
  assert.equal(
    (legacyMysterySource.match(/onClick=\{props\.onExit\}/gu) ?? []).length,
    (legacyMysterySource.match(/data-session-local-back="true"/gu) ?? []).length,
  );
  assert.match(
    pageCss,
    /\.debateShell\[data-session-active="true"\][\s\S]{0,180}:global\(\[data-live-session-model-chip="true"\]\)[\s\S]{0,80}display:\s*none/u,
  );
  assert.match(
    pageCss,
    /\.debateShell\[data-session-active="true"\][\s\S]{0,120}:global\(\[data-session-local-back="true"\]\)[\s\S]{0,100}visibility:\s*hidden/u,
  );
  assert.match(mysterySource, /useLiveSessionHeaderPortalTargets/u);
  assert.match(mysterySource, /createPortal\([\s\S]*liveSessionHeaderPortalTargets\.title/u);
  assert.match(mysterySource, /createPortal\([\s\S]*liveSessionHeaderPortalTargets\.actions/u);
  assert.match(pageCss, /\.liveSessionHeader:has\(\.liveSessionContextTitleSlot:not\(:empty\)\)\s*\{\s*grid-template-columns:\s*auto auto minmax\(0, 1fr\) auto auto/u);
});

test("blocking transitions continue to honor the compact measured session row", () => {
  for (const css of [coffeeIntroCss, warmupCss]) {
    assert.match(
      css,
      /inset:[\s\S]{0,100}var\(--app-shell-top-nav-height/u,
    );
  }
  assert.doesNotMatch(
    warmupSource,
    /document\.body\.children|setAttribute\("inert"/u,
    "model warmup must leave the minimal Back and Theme controls interactive",
  );
});

test("Coffee intro gates arrivals and the shared Back replaces duplicate End chrome", () => {
  assert.match(coffeeIntro, /COFFEE_INTRO_CURTAIN_MS/u);
  assert.match(coffeeIntro, /data-coffee-intro-curtain="true"/u);
  assert.match(pageSource, /await playCoffeeIntroCurtain\(\)/u);
  assert.match(pageSource, /coffeeLiveSessionChrome/u);
  assert.doesNotMatch(
    pageSource,
    /data-tutorial-target="coffee-end-session"[\s\S]{0,180}End session/u,
  );
  assert.match(coffeePolicy, /showEndSessionInSwitcher:\s*false/u);
});

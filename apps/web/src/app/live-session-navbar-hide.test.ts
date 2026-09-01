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
const debateCss = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);
const mysteryCss = readFileSync(
  new URL("./debateMysteryV2.module.css", import.meta.url),
  "utf8",
);
const legacyMysteryCss = readFileSync(
  new URL("./debateMystery.module.css", import.meta.url),
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

test("the shared navbar permanently reserves its shell row", () => {
  assert.match(globalsCss, /--app-navbar-height:\s*66px/u);
  assert.doesNotMatch(globalsCss, /data-app-navbar-session-hidden/u);
  assert.doesNotMatch(globalsCss, /data-app-navbar-hidden/u);
});

test("Coffee, Signal, and Debate keep the real shared navbar visible while locked", () => {
  assert.doesNotMatch(pageSource, /setAppNavbarSessionHidden/u);
  assert.doesNotMatch(pageSource, /hideAppNavbarForImmersion/u);
  assert.match(
    pageSource,
    /data-live-session-locked=\{[\s\S]{0,80}options\.liveSessionActive/u,
  );
  assert.match(
    pageSource,
    /liveSessionActive: coffeeChromePolicy\.liveSessionActive[\s\S]{0,700}renderCoffeeHeaderModelPicker\(\)/u,
  );
  assert.match(
    pageSource,
    /liveSessionActive: debateLiveSessionActive[\s\S]{0,6000}<ComposerModelPicker/u,
  );
  assert.match(
    pageSource,
    /navigationHeader=\{\(\{[\s\S]{0,800}liveSessionActive[\s\S]{0,6000}<ComposerModelPicker/u,
  );
  assert.match(
    pageSource,
    /renderSharedAppletNavbar\("Story tools", \{[\s\S]{0,500}liveSessionActive: storyLiveSessionActive/u,
  );
  assert.match(
    pageCss,
    /\.botGeneratorBackdrop\[data-avatar-foundry="true"\][\s\S]{0,180}inset:[\s\S]{0,100}var\(--app-shell-top-nav-height/u,
  );
});

test("Coffee, Signal, and Debate shells reserve the measured shared-navbar height", () => {
  assert.match(
    pageCss,
    /\.coffeeShell\s*\{[^}]*grid-template-rows:[^}]*var\(--app-shell-top-nav-height/u,
  );
  assert.match(
    botcastCss,
    /grid-template-rows:[^}]*var\(--app-shell-top-nav-height[^}]*minmax\(0,\s*1fr\)/u,
  );
  assert.match(
    botcastCss,
    /inset:\s*var\(--app-shell-top-nav-height[^;]*\s0\s0/u,
  );
  assert.match(
    debateCss,
    /inset:[^;]*var\(--app-shell-top-nav-height[^;]*\s0\s0/u,
  );
});

test("bespoke live headers follow the shared three-zone navbar grammar", () => {
  assert.match(
    debateCss,
    /\.persistentLeaveDock\s*\{[\s\S]{0,220}top:\s*calc\([\s\S]{0,120}var\(--app-shell-top-nav-height/u,
    "Debate's persistent escape must sit below the retained shared navbar",
  );
  assert.match(
    signalSource,
    /className=\{styles\.liveToplineStatus\}[\s\S]{0,1600}className=\{styles\.liveToplineIdentity\}[\s\S]{0,800}className=\{styles\.liveToplineActions\}/u,
  );
  assert.doesNotMatch(
    signalSource,
    /LiveSessionModelChip/u,
    "Signal provenance belongs in the real top picker instead of a duplicate topline chip",
  );
  assert.match(
    botcastCss,
    /\.liveTopline\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto minmax\(0,\s*1fr\)/u,
  );
  assert.match(
    mysteryCss,
    /@media \(max-width:\s*1120px\)[\s\S]{0,260}\.investigationHeaderActions\s*\{[\s\S]{0,120}grid-column:\s*1 \/ -1/u,
    "Whodunnit presentation controls must drop to a second row before crowding the case identity",
  );
});

test("session-local actions and blocking transitions start below the measured navbar", () => {
  assert.match(
    mysteryCss,
    /\.archiveButton\s*\{[\s\S]{0,240}top:\s*calc\([\s\S]{0,120}var\(--app-shell-top-nav-height/u,
    "Whodunnit's Continue, Return, and Archive control must not occupy the global navbar",
  );
  assert.match(
    legacyMysteryCss,
    /\.compiler\s*>\s*\.exitButton\s*\{[\s\S]{0,240}top:\s*calc\([\s\S]{0,120}var\(--app-shell-top-nav-height/u,
  );
  for (const css of [coffeeIntroCss, warmupCss]) {
    assert.match(
      css,
      /inset:[\s\S]{0,100}var\(--app-shell-top-nav-height/u,
    );
  }
  assert.doesNotMatch(
    warmupSource,
    /document\.body\.children|setAttribute\("inert"/u,
    "model warmup must leave the permanent navbar and Appearance control interactive",
  );
});

test("Coffee intro curtain gates arrivals and End lives in table chrome", () => {
  assert.match(coffeeIntro, /COFFEE_INTRO_CURTAIN_MS/u);
  assert.match(coffeeIntro, /data-coffee-intro-curtain="true"/u);
  assert.match(pageSource, /await playCoffeeIntroCurtain\(\)/u);
  assert.match(pageSource, /coffeeLiveSessionChrome/u);
  assert.match(coffeePolicy, /showEndSessionInSwitcher:\s*false/u);
});

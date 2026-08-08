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
const coffeePolicy = readFileSync(
  new URL("./coffee-shell-policy.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const coffeeIntro = readFileSync(
  new URL("./CoffeeIntroCurtain.tsx", import.meta.url),
  "utf8",
);

test("session-hidden navbar collapses --app-navbar-height", () => {
  assert.match(globalsCss, /--app-navbar-height:\s*66px/u);
  assert.match(
    globalsCss,
    /html\[data-app-navbar-session-hidden="true"\]\s*\{[^}]*--app-navbar-height:\s*0px/u,
  );
  assert.match(
    globalsCss,
    /html\[data-app-navbar-session-hidden="true"\]\s*\[data-shared-app-navbar="true"\]/u,
  );
});

test("Coffee, Signal, and Debate shells use --app-navbar-height", () => {
  assert.match(
    pageCss,
    /\.coffeeShell\s*\{[^}]*grid-template-rows:\s*var\(--app-navbar-height/u,
  );
  assert.match(
    botcastCss,
    /grid-template-rows:\s*var\(--app-navbar-height,\s*66px\)\s*minmax\(0,\s*1fr\)/u,
  );
  assert.match(
    botcastCss,
    /inset:\s*var\(--app-navbar-height,\s*66px\)\s*0\s*0/u,
  );
  assert.match(
    debateCss,
    /inset:\s*var\(--app-navbar-height,\s*66px\)\s*0\s*0/u,
  );
});

test("Coffee intro curtain gates arrivals and End lives in table chrome", () => {
  assert.match(coffeeIntro, /COFFEE_INTRO_CURTAIN_MS/u);
  assert.match(coffeeIntro, /data-coffee-intro-curtain="true"/u);
  assert.match(pageSource, /await playCoffeeIntroCurtain\(\)/u);
  assert.match(pageSource, /coffeeLiveSessionChrome/u);
  assert.match(coffeePolicy, /showEndSessionInSwitcher:\s*false/u);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const blockingLoaderSource = readFileSync(
  new URL("./PrismBlockingLoader.tsx", import.meta.url),
  "utf8",
);
const psychicThoughtSource = readFileSync(
  new URL("./psychicThoughtDisplay.ts", import.meta.url),
  "utf8",
);
const coffeeRevealSource = readFileSync(
  new URL("./coffee-user-reveal-flow.ts", import.meta.url),
  "utf8",
);
const voiceSyncRouteSource = readFileSync(
  new URL("./qa-voice-sync/page.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const coffeeApiSource = readFileSync(
  new URL("../../../api/src/coffee.ts", import.meta.url),
  "utf8",
);
const botsApiSource = readFileSync(
  new URL("../../../api/src/bots.ts", import.meta.url),
  "utf8",
);

const legacyRuntimeSource = [
  pageSource,
  pageCss,
  settingsPanelSource,
  blockingLoaderSource,
  psychicThoughtSource,
  coffeeRevealSource,
  voiceSyncRouteSource,
  apiSource,
  coffeeApiSource,
  botsApiSource,
].join("\n");

const removedModules = [
  "./devPanelSafeArea.ts",
  "./devPanelSafeArea.test.ts",
  "./zenToolLab.ts",
  "./zenToolLab.test.ts",
  "./coffee-dev-debug.ts",
  "./coffee-dev-debug.test.ts",
].map((path) => new URL(path, import.meta.url));

describe("Help diagnostics migration", () => {
  it("keeps shippable diagnostics and maintenance controls in Help", () => {
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.settingsSection\} \$\{styles\.settingsSectionWide\}`\}[\s\S]{0,100}data-settings-section="help"/u,
    );
    assert.match(pageSource, /data-settings-action="test-local-service"/u);
    assert.match(pageSource, /data-settings-action="copy-support-report"/u);
    assert.match(pageSource, /data-settings-action="download-support-report"/u);
    assert.match(pageSource, /<PrismRenderingDiagnosticsCard \/>/u);
    assert.match(pageSource, /data-settings-action="clean-unused-assets"/u);
    assert.match(pageSource, /role="status"[\s\S]{0,100}aria-live="polite"/u);
    assert.match(pageCss, /\.helpToolGroups[\s\S]*grid-template-columns/u);
    assert.match(pageCss, /@media \(max-width: 560px\)[\s\S]*\.helpToolActions/u);
    assert.match(apiSource, /\/api\/maintenance\/restart/u);
  });

  it("links the safe standalone labs from an accessible same-window group", () => {
    assert.match(pageSource, />Advanced</u);
    assert.match(pageSource, />\s*Diagnostics labs\s*</u);
    assert.match(
      pageSource,
      /data-settings-action="open-voice-sync-lab"[\s\S]{0,100}href="\/qa-voice-sync"[\s\S]{0,160}>Voice Sync Lab</u,
    );
    assert.match(
      pageSource,
      /data-settings-action="open-sound-fx-bench"[\s\S]{0,120}href="\/tools\/sound-fx-bench\.html"[\s\S]{0,160}>Sound FX Bench</u,
    );
    assert.match(pageSource, /data-settings-action="open-debate-alignment-lab"/u);
    assert.match(pageSource, />Stage layout</u);
    assert.doesNotMatch(
      pageSource,
      /data-settings-action="open-(?:voice-sync-lab|sound-fx-bench)"[^>]*target=/u,
    );
    assert.doesNotMatch(voiceSyncRouteSource, /notFound|NODE_ENV|production/u);
    assert.match(apiSource, /\/api\/dev\/sound-fx-bench\/generate/u);
  });

  it("removes the legacy runtime instead of hiding it behind flags", () => {
    assert.doesNotMatch(legacyRuntimeSource, /\bDEV_TOOLS_[A-Z0-9_]+\b/u);
    assert.doesNotMatch(legacyRuntimeSource, /\b(?:devTools|DevTools)[A-Za-z0-9_]*\b/u);
    assert.doesNotMatch(
      legacyRuntimeSource,
      /\b(?:coffeeDev|CoffeeDev|coffeeSeatDebug|CoffeeSeatDebug|compactedSummaryDebug|debugComposer|devChatDebug|zenToolLab|ZenToolLab|zenPauseTester|ZenPauseTester|devMoodVisual|DevMoodVisual|metricsTerminal|showScratchpad|psychicScratchpadBlock)[A-Za-z0-9_]*\b|data-(?:debug-composer|dev-panel-safe-area)/u,
    );
    for (const moduleUrl of removedModules) {
      assert.equal(existsSync(moduleUrl), false, `${moduleUrl.pathname} still exists`);
    }
  });

  it("removes fixture and mutation APIs while retaining independent provenance", () => {
    assert.doesNotMatch(
      apiSource,
      /\/api\/(?:conversations|memories)\/dev-seed|\/dev-(?:connection|opinion)|\/mood-debug|\/api\/coffee\/sessions\/:id\/debug\//u,
    );
    assert.doesNotMatch(coffeeApiSource, /CoffeeDebug|coffeeDebug|SocialDebug/u);
    assert.doesNotMatch(botsApiSource, /\bdeleteBots\b|includeProtected/u);
    assert.match(apiSource, /const developerTranscript\s*=/u);
    assert.match(apiSource, /recordSlateDeveloperEvent/u);
  });
});

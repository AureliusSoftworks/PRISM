import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createAccountWorkspaceStartupProgress,
  formatAccountWorkspaceStartupResources,
  settleAccountWorkspaceStartupResources,
} from "./accountWorkspaceStartup.ts";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = page.indexOf(start);
  const endIndex = page.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source end: ${end}`);
  return page.slice(startIndex, endIndex);
}

describe("account workspace startup gate", () => {
  it("keeps startup blocked while the saved session is being checked", () => {
    assert.match(
      page,
      /useState<AccountWorkspaceStartupState>\(\{\s*phase: "checking-session"/u,
    );
    assert.match(
      page,
      /accountWorkspaceStartup\.phase === "checking-session"[\s\S]*accountWorkspaceStartupBlocked/u,
    );
    assert.match(page, /<PrismStartupScreen/u);
    assert.match(page, /"Checking your saved session\.\.\."/u);
  });

  it("does not reveal an authenticated shell until its account data settles", () => {
    const hydration = sourceBetween(
      "async function hydrateAccountWorkspaceForStartup",
      "const recoverBackendConnection",
    );
    assert.match(hydration, /captureAccountOwnerGeneration\(\)/u);
    assert.match(hydration, /ownerGeneration\.ownerId !== activeUser\.id/u);
    assert.match(
      hydration,
      /refreshAll\(\{[\s\S]*ownerGeneration,[\s\S]*onStartupProgress/u,
    );
    assert.match(
      hydration,
      /accountWorkspaceStartupRunRef\.current === runId[\s\S]*isCurrentAccountOwnerGeneration\(ownerGeneration\)[\s\S]*userRef\.current\?\.id === activeUser\.id/u,
    );
    assert.match(hydration, /ready[\s\S]*phase: "ready"[\s\S]*phase: "error"/u);
  });

  it("rides through bounded transient API startup races before showing retry", () => {
    assert.match(
      page,
      /ACCOUNT_WORKSPACE_STARTUP_RETRY_DELAYS_MS = \[1200, 2600\]/u,
    );
    const hydration = sourceBetween(
      "async function hydrateAccountWorkspaceForStartup",
      "const recoverBackendConnection",
    );
    assert.match(
      hydration,
      /attempt <= ACCOUNT_WORKSPACE_STARTUP_RETRY_DELAYS_MS\.length/u,
    );
    assert.match(hydration, /if \(!startupStillCurrent\(\)\) return;/u);
    assert.match(hydration, /window\.setTimeout\(resolve, retryDelayMs\)/u);
    assert.match(hydration, /startupProgress,/u);
    assert.match(
      hydration,
      /Still opening \$\{formatAccountWorkspaceStartupResources\(pending\)\}/u,
    );
    assert.doesNotMatch(
      hydration,
      /Retrying workspace readiness|attempt \$\{/u,
    );
  });

  it("continues the native boot presentation with truthful workspace logs", () => {
    for (const expectedLog of [
      "Decrypting account settings...",
      "Loading conversations...",
      "Loading private memories...",
      "Loading bot library...",
      "Loading account asset library...",
      "Preparing model catalog...",
    ]) {
      assert.ok(page.includes(expectedLog), `Missing boot log: ${expectedLog}`);
    }
    assert.match(
      page,
      /Bot library ready · \$\{loadedBotCount \?\? 0\} bots\./u,
    );
    assert.doesNotMatch(
      sourceBetween(
        "if (accountWorkspaceStartupBlocked)",
        "function renderModeTutorialOverlay",
      ),
      /PrismBlockingLoader/u,
    );
  });

  it("holds the completed refraction before an atomic Home crossfade", () => {
    const hydration = sourceBetween(
      "async function hydrateAccountWorkspaceForStartup",
      "const recoverBackendConnection",
    );
    assert.match(
      hydration,
      /Private workspace ready\.[\s\S]*PRISM_STARTUP_COMPLETION_HOLD_MS/u,
    );
    assert.match(
      hydration,
      /data(?:set)?\.prismStartupHandoff = "true"[\s\S]*startViewTransition\(revealWorkspace\)/u,
    );
    assert.match(
      hydration,
      /flushSync\(\(\) => setAccountWorkspaceStartup\(readyState\)\)/u,
    );
    assert.match(hydration, /PRISM_STARTUP_CROSSFADE_MS/u);
  });

  it("fills only genuine quiet gaps with ambient startup flavor", () => {
    assert.match(page, /PRISM_STARTUP_FLAVOR_INITIAL_DELAY_MS/u);
    assert.match(page, /PRISM_STARTUP_FLAVOR_INTERVAL_MS/u);
    assert.match(
      page,
      /appendAccountWorkspaceStartupLog[\s\S]*accountWorkspaceStartupNextFlavorAtRef\.current\s*=\s*Date\.now\(\) \+ PRISM_STARTUP_FLAVOR_INITIAL_DELAY_MS/u,
    );
    assert.match(
      page,
      /now < accountWorkspaceStartupNextFlavorAtRef\.current[\s\S]*appendAccountWorkspaceStartupFlavorLog\(\)/u,
    );
    assert.match(page, /kind: "flavor"/u);
  });

  it("requires settings, conversations, memories, bots, images, and models before readiness", () => {
    const refresh = sourceBetween(
      "async function refreshAll",
      "async function hydrateAccountWorkspaceForStartup",
    );
    for (const requiredLoad of [
      "refreshSettings(ownerGeneration)",
      "refreshConversations()",
      "refreshMemories()",
      "refreshBots(ownerGeneration)",
      "refreshImagesChatCanvasDirectory()",
      "refreshImages()",
    ]) {
      assert.ok(
        refresh.includes(requiredLoad),
        `Missing startup load: ${requiredLoad}`,
      );
    }
    assert.match(
      refresh,
      /await refreshModels\([\s\S]*progress\.comfyUiHost \?\? undefined[\s\S]*ownerGeneration/u,
    );
    assert.match(
      refresh,
      /pendingAccountWorkspaceStartupResources\(progress\)\.length === 0/u,
    );
    assert.match(
      refresh,
      /await settle\(ACCOUNT_WORKSPACE_PRIMARY_RESOURCES\)/u,
    );
    assert.doesNotMatch(refresh, /await Promise\.all\(\[/u);
  });

  it("offers retry without exposing a partial account workspace", () => {
    assert.match(page, /phase: "error"[\s\S]*Your account data stayed closed/u);
    assert.match(page, /onRetry=\{[\s\S]*retryAccountWorkspaceStartup\(\)/u);
  });
});

describe("incremental account workspace startup", () => {
  it("waits for slow siblings and retries only the unfinished resource", async () => {
    const progress = createAccountWorkspaceStartupProgress();
    let settingsCalls = 0;
    let botCalls = 0;
    let resolveSettings!: () => void;
    const slowSettings = new Promise<void>((resolve) => {
      resolveSettings = resolve;
    });
    let firstRunSettled = false;

    const firstRun = settleAccountWorkspaceStartupResources({
      progress,
      resources: ["settings", "bots"],
      load: async (resource) => {
        if (resource === "settings") {
          settingsCalls += 1;
          await slowSettings;
          return;
        }
        botCalls += 1;
        throw new Error("transient bot response failure");
      },
    }).then(() => {
      firstRunSettled = true;
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(firstRunSettled, false);
    resolveSettings();
    await firstRun;
    assert.deepEqual([...progress.completed], ["settings"]);

    await settleAccountWorkspaceStartupResources({
      progress,
      resources: ["settings", "bots"],
      load: async (resource) => {
        if (resource === "settings") settingsCalls += 1;
        if (resource === "bots") botCalls += 1;
      },
    });

    assert.equal(settingsCalls, 1);
    assert.equal(botCalls, 2);
    assert.deepEqual([...progress.completed], ["settings", "bots"]);
  });

  it("names only the resources that still need attention", () => {
    assert.equal(
      formatAccountWorkspaceStartupResources(["bots", "images"]),
      "bot library and account assets",
    );
  });
});

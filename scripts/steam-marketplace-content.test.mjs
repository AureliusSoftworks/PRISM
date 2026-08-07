import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderSteamContentReport,
  resolveSteamMarketplaceContent,
  stageSteamMarketplace,
  verifyStagedSteamMarketplace,
} from "./steam-marketplace-content.mjs";
import { verifySteamRuntimeContent } from "./verify-steam-content.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function manifestFixture() {
  return {
    schema: "prism-bot-marketplace-v1",
    version: 1,
    updatedAt: "2026-08-02T00:00:00.000Z",
    themes: [
      { id: "public", name: "Public", description: "", botIds: ["original"] },
      { id: "backup", name: "Backup", description: "", branchLock: "dev", botIds: ["licensed-character"] },
    ],
    bots: [
      {
        id: "original",
        name: "Original",
        bundlePath: "/bot-marketplace/bots/bot-original.bot",
        botHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        themeIds: ["public"],
      },
      {
        id: "licensed-character",
        name: "Licensed Character",
        bundlePath: "/bot-marketplace/bots/bot-licensed-character.bot",
        botHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        themeIds: ["backup"],
        branchLock: "dev",
      },
    ],
  };
}

function policyFixture(approvedBotIds = ["original"]) {
  return {
    schema: "prism-steam-marketplace-allowlist-v1",
    version: 1,
    approvedBotIds,
  };
}

test("filters dev-locked bots and themes from Steam content", () => {
  const result = resolveSteamMarketplaceContent(manifestFixture(), policyFixture());
  assert.deepEqual(result.manifest.bots.map((bot) => bot.id), ["original"]);
  assert.deepEqual(result.manifest.themes.map((theme) => theme.id), ["public"]);
  assert.equal(result.report.excludedDevBotCount, 1);
});

test("fails closed when a public bot is not explicitly approved", () => {
  const manifest = manifestFixture();
  manifest.bots.push({
    id: "new-public-bot",
    name: "New Public Bot",
    bundlePath: "/bot-marketplace/bots/bot-new-public-bot.bot",
    botHash: "cccccccccccccccccccccccccccccccc",
    themeIds: ["public"],
  });
  assert.throws(
    () => resolveSteamMarketplaceContent(manifest, policyFixture()),
    /missing from the Steam allowlist/u,
  );
});

test("refuses Steam bots that still package memories", () => {
  const manifest = manifestFixture();
  manifest.bots[0].memoryCount = 12;
  assert.throws(
    () => resolveSteamMarketplaceContent(manifest, policyFixture()),
    /memoryCount 0/u,
  );
});

test("refuses to approve a dev-locked bot", () => {
  assert.throws(
    () => resolveSteamMarketplaceContent(manifestFixture(), policyFixture(["original", "licensed-character"])),
    /Dev-locked bots cannot be approved/u,
  );
});

test("refuses duplicate approved bundle paths", () => {
  const manifest = manifestFixture();
  manifest.bots.push({
    id: "second-original",
    name: "Second Original",
    bundlePath: "/bot-marketplace/bots/bot-original.bot",
    botHash: "cccccccccccccccccccccccccccccccc",
    themeIds: ["public"],
  });
  assert.throws(
    () => resolveSteamMarketplaceContent(manifest, policyFixture(["original", "second-original"])),
    /unique bundle paths/u,
  );
});

test("stages only approved bundles and detects a rogue bundle", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), "prism-steam-marketplace-"));
  const sourcePublicRoot = path.join(fixtureRoot, "source-public");
  const destinationPublicRoot = path.join(fixtureRoot, "destination-public");
  const sourceMarketplaceRoot = path.join(sourcePublicRoot, "bot-marketplace");
  const policyPath = path.join(fixtureRoot, "policy.json");
  try {
    await fs.mkdir(path.join(sourceMarketplaceRoot, "bots"), { recursive: true });
    await fs.writeFile(
      path.join(sourceMarketplaceRoot, "manifest.json"),
      JSON.stringify(manifestFixture()),
    );
    await fs.writeFile(policyPath, JSON.stringify(policyFixture()));
    await fs.writeFile(path.join(sourceMarketplaceRoot, "bots", "bot-original.bot"), "approved");
    await fs.writeFile(
      path.join(sourceMarketplaceRoot, "bots", "bot-licensed-character.bot"),
      "dev-only",
    );

    await stageSteamMarketplace({ sourcePublicRoot, destinationPublicRoot, policyPath });
    const stagedFiles = await fs.readdir(path.join(destinationPublicRoot, "bot-marketplace", "bots"));
    assert.deepEqual(stagedFiles, ["bot-original.bot"]);

    await fs.writeFile(path.join(destinationPublicRoot, "bot-marketplace", "bots", "rogue.bot"), "rogue");
    await assert.rejects(
      verifyStagedSteamMarketplace({ destinationPublicRoot, policyPath }),
      /bundle mismatch/u,
    );
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("the repository Marketplace satisfies the current Steam allowlist", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), "prism-steam-marketplace-live-"));
  try {
    const runtimeDir = path.join(fixtureRoot, "runtime");
    const destinationPublicRoot = path.join(
      runtimeDir,
      "apps",
      "web",
      ".next",
      "standalone",
      "apps",
      "web",
      "public",
    );
    const policyPath = path.join(repoRoot, "steam-marketplace-allowlist.json");
    const report = await stageSteamMarketplace({
      sourcePublicRoot: path.join(repoRoot, "apps", "web", "public"),
      destinationPublicRoot,
      policyPath,
    });
    await fs.copyFile(policyPath, path.join(runtimeDir, "steam-marketplace-allowlist.json"));
    await fs.writeFile(
      path.join(runtimeDir, "STEAM_CONTENT_REPORT.md"),
      renderSteamContentReport(report),
    );
    assert.equal(report.approvedBots.length, 64);
    assert.equal(report.excludedDevBotCount, 42);
    assert.deepEqual(
      await verifySteamRuntimeContent({ runtimeDir, policyPath }),
      { botCount: 64, bundleCount: 64 },
    );
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("desktop scripts make Steam-safe staging the default and preserve the dev shelf", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.match(packageJson.scripts["desktop:stage-runtime"], /--distribution steam/u);
  assert.match(packageJson.scripts["desktop:stage-runtime:dev"], /--distribution development/u);
  assert.match(packageJson.scripts["desktop:dev"], /desktop:stage-runtime:dev/u);
  assert.match(packageJson.scripts["desktop:build:mac-app"], /desktop:stage-runtime:dev/u);
});

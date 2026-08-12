import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildSteamAssetRightsLedger,
  verifySteamAssetRights,
} from "./steam-asset-rights-ledger.mjs";

async function createFixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), "prism-steam-asset-rights-"));
  const sourcePublicRoot = path.join(root, "source-public");
  const runtimeDir = path.join(root, "runtime");
  const runtimePublicRoot = path.join(
    runtimeDir,
    "apps",
    "web",
    ".next",
    "standalone",
    "apps",
    "web",
    "public",
  );
  await fs.mkdir(path.join(sourcePublicRoot, "audio"), { recursive: true });
  await fs.mkdir(path.join(sourcePublicRoot, "art"), { recursive: true });
  await fs.mkdir(path.join(sourcePublicRoot, "fonts"), { recursive: true });
  await fs.mkdir(path.join(sourcePublicRoot, "tools", "assets"), { recursive: true });
  await fs.mkdir(path.join(sourcePublicRoot, "bot-marketplace", "bots"), { recursive: true });
  await fs.writeFile(path.join(sourcePublicRoot, "audio", "tap.mp3"), "audio");
  await fs.writeFile(path.join(sourcePublicRoot, "art", "frame.png"), "image");
  await fs.writeFile(path.join(sourcePublicRoot, "fonts", "prism.woff2"), "font");
  await fs.writeFile(path.join(sourcePublicRoot, "tools", "assets", "dev.png"), "dev-only");
  await fs.writeFile(path.join(sourcePublicRoot, "bot-marketplace", "bots", "dev.bot"), "dev-only");
  return { root, sourcePublicRoot, runtimeDir, runtimePublicRoot };
}

async function installFixtureLedger(fixture) {
  const ledger = await buildSteamAssetRightsLedger({ publicRoot: fixture.sourcePublicRoot });
  await fs.mkdir(fixture.runtimePublicRoot, { recursive: true });
  for (const entry of ledger.assets) {
    const source = path.join(fixture.sourcePublicRoot, entry.path);
    const destination = path.join(fixture.runtimePublicRoot, entry.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  await fs.writeFile(
    path.join(fixture.root, "ledger.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(fixture.runtimeDir, "steam-asset-rights-ledger.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
  return ledger;
}

test("builds a rights ledger for Steam media and excludes development shelves", async () => {
  const fixture = await createFixture();
  try {
    const ledger = await buildSteamAssetRightsLedger({ publicRoot: fixture.sourcePublicRoot });
    assert.deepEqual(
      ledger.assets.map((entry) => entry.path),
      ["art/frame.png", "audio/tap.mp3", "fonts/prism.woff2"],
    );
    assert.equal(ledger.assets.find((entry) => entry.path === "fonts/prism.woff2")?.kind, "font");
    assert.equal(ledger.aiDisclosure.preGeneratedAiContent, true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("verifies source and staged Steam media against the ledger", async () => {
  const fixture = await createFixture();
  try {
    const ledger = await installFixtureLedger(fixture);
    const result = await verifySteamAssetRights({
      publicRoot: fixture.sourcePublicRoot,
      runtimeDir: fixture.runtimeDir,
      ledgerPath: path.join(fixture.root, "ledger.json"),
    });
    assert.equal(result.assetCount, ledger.assets.length);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed when a staged media file is not registered", async () => {
  const fixture = await createFixture();
  try {
    await installFixtureLedger(fixture);
    await fs.writeFile(path.join(fixture.runtimePublicRoot, "art", "rogue.png"), "rogue");
    await assert.rejects(
      verifySteamAssetRights({
        publicRoot: fixture.sourcePublicRoot,
        runtimeDir: fixture.runtimeDir,
        ledgerPath: path.join(fixture.root, "ledger.json"),
      }),
      /unregistered Steam asset: art\/rogue\.png/u,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

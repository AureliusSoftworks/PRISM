#!/usr/bin/env node
/**
 * Remove packaged memories from every Marketplace bot bundle.
 *
 * Marketplace personas keep identity in bot.json (prompt / profile / powers).
 * Memories must be earned in play with the player and other bots — never shipped
 * as a pre-written diary inside the Marketplace pack.
 *
 * Usage:
 *   node scripts/strip-marketplace-bot-memories.mjs --dry-run [--only id[,id...]]
 *   node scripts/strip-marketplace-bot-memories.mjs --apply \
 *     --backup artifacts/power-cast-pass/marketplace-backup-no-memories-TIMESTAMP \
 *     [--only id[,id...]]
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const backupArgument = flagValue("--backup");
const onlyArgument = flagValue("--only");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply.");
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying requires --backup PATH.");
}

const onlyIds = onlyArgument
  ? new Set(
      onlyArgument
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  : null;

function readBundle(entry) {
  const bundlePath = join(
    marketplaceRoot,
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
  const entryNames = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .filter(Boolean);
  if (!entryNames.includes("bot.json")) {
    throw new Error(`${entry.name} bundle is missing bot.json.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }

  let memoryCountInBundle = 0;
  if (entryNames.includes("memories.json")) {
    const memories = JSON.parse(
      execFileSync("unzip", ["-p", bundlePath, "memories.json"], {
        encoding: "utf8",
      }),
    );
    if (!Array.isArray(memories)) {
      throw new Error(`${entry.name} memories.json must be a JSON array.`);
    }
    memoryCountInBundle = memories.length;
  }

  const manifestMemoryCount = Number(entry.memoryCount ?? 0);
  const changed =
    entryNames.includes("memories.json") ||
    memoryCountInBundle > 0 ||
    manifestMemoryCount !== 0;

  return {
    entry,
    bundlePath,
    entryNames,
    document,
    memoryCountInBundle,
    manifestMemoryCount,
    changed,
  };
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifestById = new Map(manifest.bots.map((entry) => [entry.id, entry]));
if (onlyIds) {
  const unknown = [...onlyIds].filter((id) => !manifestById.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown Marketplace bot id(s): ${unknown.join(", ")}`);
  }
}

const targets = manifest.bots
  .filter((entry) => !onlyIds || onlyIds.has(entry.id))
  .map(readBundle);
const changing = targets.filter((target) => target.changed);

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      totals: {
        marketplaceBotsChecked: targets.length,
        marketplaceBundlesChanging: changing.length,
        packagedMemoriesRemoved: changing.reduce(
          (sum, target) => sum + target.memoryCountInBundle,
          0,
        ),
      },
      changes: changing.map((target) => ({
        id: target.entry.id,
        name: target.entry.name,
        branchLock: target.entry.branchLock ?? null,
        memoryCountInBundle: target.memoryCountInBundle,
        manifestMemoryCount: target.manifestMemoryCount,
      })),
    },
    null,
    2,
  ),
);

if (!shouldApply) process.exit(0);

const backupPath = resolve(backupArgument);
if (existsSync(backupPath)) {
  throw new Error(`Refusing to overwrite backup: ${backupPath}`);
}
mkdirSync(backupPath, { recursive: true });
copyFileSync(manifestPath, join(backupPath, "manifest.json"));
for (const target of changing) {
  copyFileSync(target.bundlePath, join(backupPath, basename(target.bundlePath)));
}

const revision = new Date().toISOString();
const stage = mkdtempSync(join(tmpdir(), "prism-no-marketplace-memories-"));
try {
  for (const target of changing) {
    const scratch = mkdtempSync(join(stage, `${target.entry.id}-`));
    execFileSync("unzip", ["-qq", target.bundlePath, "-d", scratch]);
    const memoriesPath = join(scratch, "memories.json");
    if (existsSync(memoriesPath)) {
      unlinkSync(memoriesPath);
    }

    const keptEntries = target.entryNames.filter((name) => name !== "memories.json");
    if (!keptEntries.includes("bot.json")) {
      throw new Error(`${target.entry.name} lost bot.json during rebuild.`);
    }

    const rebuiltPath = join(stage, basename(target.bundlePath));
    execFileSync("zip", ["-X", "-q", rebuiltPath, ...keptEntries], {
      cwd: scratch,
    });
    const rebuiltNames = execFileSync("unzip", ["-Z1", rebuiltPath], {
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter(Boolean);
    if (rebuiltNames.includes("memories.json")) {
      throw new Error(`${target.entry.name} still contains memories.json.`);
    }
    const rebuilt = JSON.parse(
      execFileSync("unzip", ["-p", rebuiltPath, "bot.json"], {
        encoding: "utf8",
      }),
    );
    if (
      rebuilt.botHash !== target.entry.botHash ||
      rebuilt.bot?.name !== target.entry.name
    ) {
      throw new Error(`${target.entry.name} identity changed during rebuild.`);
    }
    renameSync(rebuiltPath, target.bundlePath);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

let manifestChanged = false;
for (const entry of manifest.bots) {
  if (onlyIds && !onlyIds.has(entry.id)) continue;
  if (Number(entry.memoryCount ?? 0) !== 0) {
    entry.memoryCount = 0;
    manifestChanged = true;
  }
}
if (changing.length > 0 || manifestChanged) {
  manifest.updatedAt = revision;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      applied: true,
      backupPath,
      marketplaceBundlesUpdated: changing.length,
      marketplaceUpdatedAt: changing.length > 0 || manifestChanged ? revision : null,
    },
    null,
    2,
  ),
);

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import {
  fullySaturateBotColor,
  hexToHsl,
} from "../packages/shared/src/color.ts";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(
  root,
  "apps/web/public/bot-marketplace/manifest.json",
);

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
if (shouldApply === explicitDryRun) {
  throw new Error(
    "Usage: node --experimental-strip-types scripts/saturate-bot-colors.mjs (--dry-run | --apply) [--database /path/to/localai.db]",
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function marketplaceBundlePath(entry) {
  return join(
    dirname(manifestPath),
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
}

function readArchive(entry, explicitPath = null) {
  const bundlePath = explicitPath ?? marketplaceBundlePath(entry);
  const entries = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!entries.includes("bot.json")) {
    throw new Error(`${entry.id} archive is missing bot.json.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.id} archive identity does not match the manifest.`);
  }
  if (typeof document.bot?.color !== "string") {
    throw new Error(`${entry.id} archive is missing a bot color.`);
  }
  return {
    bundlePath,
    entries,
    document,
    memoriesSha256: entries.includes("memories.json")
      ? sha256(execFileSync("unzip", ["-p", bundlePath, "memories.json"]))
      : null,
  };
}

function archiveWithoutColorHash(document) {
  const clone = structuredClone(document);
  delete clone.bot.color;
  return sha256(JSON.stringify(clone));
}

function rebuildArchive(target, outputPath) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-saturated-bot-"));
  try {
    execFileSync("unzip", ["-qq", target.archive.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    document.bot.color = target.saturatedColor;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.archive.entries], {
      cwd: scratch,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function migrateDatabase(databasePath) {
  if (!databasePath) return { scanned: 0, changed: 0, invalid: 0 };
  const db = new DatabaseSync(resolve(databasePath));
  try {
    const rows = db
      .prepare(
        "SELECT id, color FROM bots WHERE color IS NOT NULL AND TRIM(color) <> ''",
      )
      .all();
    const changes = rows
      .map((row) => ({
        id: row.id,
        before: row.color,
        after: fullySaturateBotColor(row.color),
      }))
      .filter((row) => row.before !== row.after);
    const invalid = rows.filter(
      (row) => !/^#[0-9a-fA-F]{6}$/u.test(row.color.trim()),
    ).length;
    if (shouldApply && changes.length > 0) {
      const update = db.prepare("UPDATE bots SET color = ? WHERE id = ?");
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        for (const change of changes) update.run(change.after, change.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    return { scanned: rows.length, changed: changes.length, invalid };
  } finally {
    db.close();
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const targets = manifest.bots.map((entry) => {
  const archive = readArchive(entry);
  const saturatedColor = fullySaturateBotColor(archive.document.bot.color);
  if (!/^#[0-9a-f]{6}$/u.test(saturatedColor)) {
    throw new Error(`${entry.id} has a non-hex bot color: ${saturatedColor}`);
  }
  return {
    entry,
    archive,
    saturatedColor,
    archiveChanged: archive.document.bot.color !== saturatedColor,
    manifestChanged: entry.color !== saturatedColor,
    protectedHash: archiveWithoutColorHash(archive.document),
  };
});
const changedTargets = targets.filter(
  (target) => target.archiveChanged || target.manifestChanged,
);

const stage = mkdtempSync(join(tmpdir(), "prism-saturated-marketplace-"));
try {
  if (shouldApply) {
    for (const target of targets.filter((candidate) => candidate.archiveChanged)) {
      const stagedBundle = join(stage, basename(target.archive.bundlePath));
      rebuildArchive(target, stagedBundle);
      const rebuilt = readArchive(target.entry, stagedBundle);
      if (
        JSON.stringify(rebuilt.entries) !== JSON.stringify(target.archive.entries) ||
        rebuilt.memoriesSha256 !== target.archive.memoriesSha256 ||
        archiveWithoutColorHash(rebuilt.document) !== target.protectedHash ||
        rebuilt.document.bot.color !== target.saturatedColor
      ) {
        throw new Error(`${target.entry.id} failed staged archive validation.`);
      }
    }

    for (const target of targets.filter((candidate) => candidate.archiveChanged)) {
      renameSync(
        join(stage, basename(target.archive.bundlePath)),
        target.archive.bundlePath,
      );
    }
    for (const target of targets) {
      target.entry.color = target.saturatedColor;
    }
    if (changedTargets.length > 0) {
      manifest.version = Math.max(1, Number(manifest.version) || 1) + 1;
      manifest.updatedAt = new Date().toISOString();
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const database = migrateDatabase(flagValue("--database"));
const remainingMarketplaceFailures = targets.filter((target) => {
  const color = shouldApply
    ? readArchive(target.entry).document.bot.color
    : target.saturatedColor;
  return hexToHsl(color).s < 99.5;
});
if (remainingMarketplaceFailures.length > 0) {
  throw new Error(
    `Marketplace colors are not fully saturated: ${remainingMarketplaceFailures
      .map((target) => target.entry.id)
      .join(", ")}`,
  );
}

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      marketplace: {
        scanned: targets.length,
        changed: changedTargets.length,
        version: shouldApply && changedTargets.length > 0
          ? manifest.version
          : manifest.version,
      },
      database,
    },
    null,
    2,
  ),
);

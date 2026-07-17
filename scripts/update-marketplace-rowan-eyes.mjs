#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(
  root,
  "apps/web/public/bot-marketplace/manifest.json",
);
const targetMarketplaceId = "rowan";
const targetFace = {
  faceEyeCharacter: "⌁",
  faceEyeCount: 2,
  faceEyeRotationDeg: -90,
};
const mutableFields = Object.keys(targetFace);

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const backupArgument = flagValue("--backup-dir");
const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
if (shouldApply === explicitDryRun) {
  throw new Error(
    "Usage: update-marketplace-rowan-eyes.mjs (--dry-run | --apply --backup-dir /new/directory)",
  );
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying requires an explicit --backup-dir path.");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function protectedBotHash(bot) {
  return sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(bot).filter(([field]) => !mutableFields.includes(field)),
      ),
    ),
  );
}

function readArchive(entry, explicitPath = null) {
  const bundlePath =
    explicitPath ??
    join(
      dirname(manifestPath),
      entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
    );
  const entries = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!entries.includes("bot.json") || !entries.includes("memories.json")) {
    throw new Error("Rowan archive is missing a required entry.");
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error("Rowan archive identity does not match the manifest.");
  }
  return {
    bundlePath,
    entries,
    document,
    sha256: sha256(readFileSync(bundlePath)),
    memoriesSha256: sha256(
      execFileSync("unzip", ["-p", bundlePath, "memories.json"]),
    ),
  };
}

function changedFields(bot) {
  return Object.entries(targetFace)
    .filter(([field, value]) => bot[field] !== value)
    .map(([field]) => field);
}

function rebuildArchive(target, outputPath, revision) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-rowan-eyes-"));
  try {
    execFileSync("unzip", ["-qq", target.archive.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    Object.assign(document.bot, targetFace);
    document.exportedAt = revision;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.archive.entries], {
      cwd: scratch,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entry = manifest.bots.find((candidate) => candidate.id === targetMarketplaceId);
if (!entry) throw new Error("Rowan is missing from the Marketplace manifest.");
const archive = readArchive(entry);
const target = {
  entry,
  archive,
  changedFields: changedFields(archive.document.bot),
  protectedBotHash: protectedBotHash(archive.document.bot),
};
let backupPath = null;
let workspaceFilesApplied = false;

try {
  if (shouldApply) {
    backupPath = resolve(backupArgument);
    if (existsSync(backupPath)) {
      throw new Error(`Refusing to overwrite backup: ${backupPath}`);
    }
    mkdirSync(backupPath, { recursive: true });
    copyFileSync(manifestPath, join(backupPath, "manifest.json"));
    copyFileSync(
      archive.bundlePath,
      join(backupPath, basename(archive.bundlePath)),
    );
    writeFileSync(
      join(backupPath, "audit.json"),
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          manifestSha256: sha256(readFileSync(manifestPath)),
          bundleSha256: archive.sha256,
          botHash: entry.botHash,
          archiveEntries: archive.entries,
          changedFields: target.changedFields,
        },
        null,
        2,
      )}\n`,
    );

    if (target.changedFields.length > 0) {
      const revision = new Date().toISOString();
      const stage = mkdtempSync(join(tmpdir(), "prism-rowan-eyes-stage-"));
      try {
        const stagedBundle = join(stage, basename(archive.bundlePath));
        rebuildArchive(target, stagedBundle, revision);
        const rebuilt = readArchive(entry, stagedBundle);
        if (JSON.stringify(rebuilt.entries) !== JSON.stringify(archive.entries)) {
          throw new Error("Rowan archive entries changed while rebuilding.");
        }
        if (rebuilt.memoriesSha256 !== archive.memoriesSha256) {
          throw new Error("Rowan memories changed while rebuilding.");
        }
        if (protectedBotHash(rebuilt.document.bot) !== target.protectedBotHash) {
          throw new Error("Rowan protected portable fields changed.");
        }
        if (changedFields(rebuilt.document.bot).length > 0) {
          throw new Error("Rowan target eyes did not survive rebuilding.");
        }
        renameSync(stagedBundle, archive.bundlePath);
        workspaceFilesApplied = true;
        manifest.updatedAt = revision;
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

        const live = readArchive(entry);
        if (
          live.document.botHash !== entry.botHash ||
          live.memoriesSha256 !== archive.memoriesSha256 ||
          protectedBotHash(live.document.bot) !== target.protectedBotHash ||
          changedFields(live.document.bot).length > 0
        ) {
          throw new Error("Rowan live archive failed post-write validation.");
        }
      } finally {
        rmSync(stage, { recursive: true, force: true });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        marketplaceId: entry.id,
        marketplaceName: entry.name,
        botHash: entry.botHash,
        archiveEntries: archive.entries,
        changedFields: target.changedFields,
        targetFace,
        backupPath,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (workspaceFilesApplied && backupPath) {
    copyFileSync(join(backupPath, "manifest.json"), manifestPath);
    copyFileSync(
      join(backupPath, basename(archive.bundlePath)),
      archive.bundlePath,
    );
  }
  throw error;
}

#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fileExists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

async function findFile(root, filename) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isFile() && entry.name === filename) return target;
    if (entry.isDirectory()) {
      const match = await findFile(target, filename);
      if (match) return match;
    }
  }
  return "";
}

export async function verifyThirdPartyNotices({
  runtimeDir = path.join(repoRoot, "runtime"),
} = {}) {
  const resolvedRuntimeDir = path.resolve(runtimeDir);
  const sourceNoticePath = path.join(repoRoot, "THIRD_PARTY_NOTICES.md");
  const stagedNoticePath = path.join(resolvedRuntimeDir, "THIRD_PARTY_NOTICES.md");
  const packageLockPath = path.join(resolvedRuntimeDir, "package-lock.json");
  const sourceNotice = await fs.readFile(sourceNoticePath, "utf8");
  const stagedNotice = await fs.readFile(stagedNoticePath, "utf8");
  const packageLockRaw = await fs.readFile(packageLockPath, "utf8");
  const requiredSourceSections = [
    "## Node.js Desktop Runtime",
    "## Desktop Runtime Components",
    "### Qdrant",
    "### Playwright Chromium",
    "### Sharp and libvips",
  ];
  for (const section of requiredSourceSections) {
    if (!sourceNotice.includes(section) || !stagedNotice.includes(section)) {
      throw new Error(`Third-party notice is missing required section: ${section}`);
    }
  }
  if (!stagedNotice.includes("## Reproducible Runtime Dependency Inventory")) {
    throw new Error("Staged third-party notice is missing its generated inventory.");
  }
  if (!stagedNotice.startsWith(sourceNotice.trimEnd())) {
    throw new Error("Staged third-party notice does not preserve the source notice.");
  }

  const packageLockSha256 = crypto
    .createHash("sha256")
    .update(packageLockRaw)
    .digest("hex");
  if (!stagedNotice.includes(`package-lock.json SHA-256: \`${packageLockSha256}\``)) {
    throw new Error("Staged third-party notice is not bound to its package-lock hash.");
  }
  const packageCountMatch = stagedNotice.match(
    /- Runtime package directories inventoried: (\d+)/u,
  );
  if (!packageCountMatch) {
    throw new Error("Staged third-party notice has no generated package count.");
  }
  const tableStart = stagedNotice.indexOf(
    "| Package | Version | Declared license | Source | Staged path |",
  );
  const tableRows = stagedNotice
    .slice(tableStart)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"));
  const packageTableCount = Math.max(0, tableRows.length - 1);
  if (packageTableCount !== Number(packageCountMatch[1])) {
    throw new Error(
      `Generated package count mismatch: declared ${packageCountMatch[1]}, table ${packageTableCount}.`,
    );
  }

  const requiredArtifacts = [
    path.join(resolvedRuntimeDir, "node", "LICENSE"),
    path.join(resolvedRuntimeDir, "node", "node-runtime-provenance.json"),
  ];
  for (const artifact of requiredArtifacts) {
    if (!(await fileExists(artifact))) {
      throw new Error(`Steam runtime is missing third-party provenance artifact: ${artifact}`);
    }
  }
  const qdrantCandidates = [
    path.join(resolvedRuntimeDir, "qdrant", "qdrant"),
    path.join(resolvedRuntimeDir, "qdrant", "qdrant.exe"),
  ];
  if (!(await Promise.all(qdrantCandidates.map(fileExists))).some(Boolean)) {
    throw new Error("Steam runtime is missing its bundled Qdrant executable.");
  }
  const chromiumLicense = await findFile(
    path.join(resolvedRuntimeDir, "playwright-browsers"),
    "LICENSE.headless_shell",
  );
  if (!chromiumLicense) {
    throw new Error("Steam runtime is missing Chromium headless-shell license text.");
  }
  return {
    packageCount: Number(packageCountMatch[1]),
    packageLockSha256,
    chromiumLicense,
  };
}

async function main() {
  const runtimeIndex = process.argv.indexOf("--runtime-dir");
  const runtimeDir = runtimeIndex >= 0 ? process.argv[runtimeIndex + 1] : undefined;
  const result = await verifyThirdPartyNotices({ runtimeDir });
  console.log(
    `Third-party notices verified: ${result.packageCount} runtime packages, package-lock SHA-256 ${result.packageLockSha256}.`,
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyStagedSteamMarketplace } from "./steam-marketplace-content.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function verifySteamRuntimeContent(options = {}) {
  const runtimeDir = path.resolve(options.runtimeDir ?? path.join(repoRoot, "runtime"));
  const policyPath = path.resolve(
    options.policyPath ?? path.join(repoRoot, "steam-marketplace-allowlist.json"),
  );
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
  const packagedPolicyPath = path.join(runtimeDir, "steam-marketplace-allowlist.json");
  const [expectedPolicy, packagedPolicy] = await Promise.all([
    fs.readFile(policyPath),
    fs.readFile(packagedPolicyPath),
  ]);
  if (!expectedPolicy.equals(packagedPolicy)) {
    throw new Error("Packaged Steam Marketplace allowlist does not match the release source.");
  }
  const result = await verifyStagedSteamMarketplace({
    destinationPublicRoot,
    policyPath: packagedPolicyPath,
  });
  const report = await fs.readFile(path.join(runtimeDir, "STEAM_CONTENT_REPORT.md"), "utf8");
  if (!report.includes(`- Approved Marketplace bots: ${result.botCount}`)) {
    throw new Error("Packaged Steam content report does not match the staged Marketplace roster.");
  }
  return result;
}

async function main() {
  const runtimeIndex = process.argv.indexOf("--runtime-dir");
  const runtimeDir = runtimeIndex >= 0 ? process.argv[runtimeIndex + 1] : undefined;
  const result = await verifySteamRuntimeContent({ runtimeDir });
  console.log(`Steam content verified: ${result.botCount} approved Marketplace bots, ${result.bundleCount} bundles.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

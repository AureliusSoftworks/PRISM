#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeRuntimeThirdPartyNotices } from "./stage-desktop-runtime.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const runtimeIndex = process.argv.indexOf("--runtime-dir");
  const runtimeDir = path.resolve(
    runtimeIndex >= 0
      ? process.argv[runtimeIndex + 1]
      : path.join(repoRoot, "runtime"),
  );
  const packageLockRaw = await fs.readFile(
    path.join(runtimeDir, "package-lock.json"),
    "utf8",
  );
  const sourceNotice = await fs.readFile(
    path.join(repoRoot, "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  const result = await writeRuntimeThirdPartyNotices({
    runtimeRoot: runtimeDir,
    packageLockRaw,
    sourceNotice,
  });
  console.log(
    `Regenerated third-party inventory: ${result.packageCount} runtime packages; ` +
    `package-lock SHA-256 ${result.lockfileSha256}`,
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

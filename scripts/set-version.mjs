#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function usage() {
  console.log(`Usage:
  node scripts/set-version.mjs --version <x.y.z> [--build <number>]

Examples:
  node scripts/set-version.mjs --version 0.2.0
  node scripts/set-version.mjs --version 0.2.0 --build 11`);
}

function parseArgs(argv) {
  let version = "";
  let build = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      version = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--build") {
      build = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { version, build };
}

function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Version must follow SemVer core format, e.g. 0.2.0");
  }
}

function assertBuild(build) {
  if (!build) {
    return;
  }
  if (!/^\d+$/.test(build) || Number(build) < 1) {
    throw new Error("Build number must be a positive integer, e.g. 11");
  }
}

async function updateJsonVersion(relativePath, version) {
  const absolutePath = path.join(repoRoot, relativePath);
  let raw;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
  const parsed = JSON.parse(raw);
  const previousVersion = parsed.version;
  parsed.version = version;
  const updated = `${JSON.stringify(parsed, null, 2)}\n`;
  if (updated !== raw) {
    await writeFile(absolutePath, updated, "utf8");
  }
  return previousVersion !== version;
}

async function updatePackageLockVersion(relativePath, version) {
  const absolutePath = path.join(repoRoot, relativePath);
  let raw;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }

  const parsed = JSON.parse(raw);
  parsed.version = version;
  for (const entry of Object.values(parsed.packages ?? {})) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.name === "string" &&
      (entry.name === "localai-chatgov" || entry.name.startsWith("@localai/")) &&
      Object.hasOwn(entry, "version")
    ) {
      entry.version = version;
    }
  }

  const updated = `${JSON.stringify(parsed, null, 2)}\n`;
  if (updated !== raw) {
    await writeFile(absolutePath, updated, "utf8");
    return true;
  }
  return false;
}

async function replaceInFile(relativePath, replacer) {
  const absolutePath = path.join(repoRoot, relativePath);
  let original;
  try {
    original = await readFile(absolutePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
  const updated = replacer(original);
  if (updated !== original) {
    await writeFile(absolutePath, updated, "utf8");
    return true;
  }
  return false;
}

async function main() {
  const { version, build } = parseArgs(process.argv.slice(2));
  if (!version) {
    usage();
    process.exit(64);
  }
  assertVersion(version);
  assertBuild(build);

  const jsonVersionFiles = [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "apps/desktop/package.json",
    "apps/desktop/src-tauri/tauri.conf.json",
    "packages/shared/package.json",
    "packages/config/package.json",
    "runtime/package.json",
  ];

  const packageLockFiles = [
    "package-lock.json",
    "apps/api/package-lock.json",
    "apps/web/package-lock.json",
    "packages/shared/package-lock.json",
    "packages/config/package-lock.json",
    "runtime/package-lock.json",
  ];

  let changeCount = 0;
  for (const file of jsonVersionFiles) {
    const changed = await updateJsonVersion(file, version);
    if (changed) {
      changeCount += 1;
    }
  }

  for (const file of packageLockFiles) {
    const changed = await updatePackageLockVersion(file, version);
    if (changed) {
      changeCount += 1;
    }
  }

  if (await replaceInFile("apps/web/src/prismAppVersion.ts", (content) =>
    content.replace(
      /export const PRISM_APP_VERSION = "[^"]+";/,
      `export const PRISM_APP_VERSION = "${version}";`
    )
  )) {
    changeCount += 1;
  }

  if (await replaceInFile("apps/api/src/health.ts", (content) =>
    content.replace(
      /export const PRISM_SERVER_VERSION = "[^"]+";/,
      `export const PRISM_SERVER_VERSION = "${version}";`
    )
  )) {
    changeCount += 1;
  }

  if (await replaceInFile("apps/desktop/src-tauri/Cargo.toml", (content) =>
    content.replace(/^version = "[^"]+"$/m, `version = "${version}"`)
  )) {
    changeCount += 1;
  }

  if (await replaceInFile("apps/desktop/src-tauri/Cargo.lock", (content) =>
    content.replace(
      /(\[\[package\]\]\nname = "prism_desktop"\nversion = ")[^"]+("\n)/,
      `$1${version}$2`
    )
  )) {
    changeCount += 1;
  }

  if (await replaceInFile("apps/server-windows/src/PrismServer.csproj", (content) =>
    content.replace(/<Version>[^<]+<\/Version>/, `<Version>${version}</Version>`)
  )) {
    changeCount += 1;
  }

  const xcodeProjectFiles = [
    "apps/ios-client/PrismIOS.xcodeproj/project.pbxproj",
    "apps/client-mac/PrismClient.xcodeproj/project.pbxproj",
    "apps/server-mac/PrismServer.xcodeproj/project.pbxproj",
  ];
  for (const file of xcodeProjectFiles) {
    if (
      await replaceInFile(file, (content) => {
        let updated = content.replace(
          /MARKETING_VERSION = [^;]+;/g,
          `MARKETING_VERSION = ${version};`
        );
        if (build) {
          updated = updated.replace(
            /CURRENT_PROJECT_VERSION = [^;]+;/g,
            `CURRENT_PROJECT_VERSION = ${build};`
          );
        }
        return updated;
      })
    ) {
      changeCount += 1;
    }
  }

  if (changeCount === 0) {
    console.log(`Version is already ${version}${build ? ` (build ${build})` : ""}; no files changed.`);
    return;
  }
  console.log(`Updated shared version to ${version}${build ? ` (build ${build})` : ""} across ${changeCount} files.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

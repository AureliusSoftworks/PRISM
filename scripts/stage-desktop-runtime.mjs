#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { ensureBuiltinTtsModel } from "./fetch-builtin-tts-model.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workspaceRuntimePackages = new Set([
  "@localai/config",
  "@localai/shared"
]);
// Transformers.js selects onnxruntime-node through its Node export. Its browser
// backend is not used by the bundled API and would add roughly 90 MB.
const omittedDesktopRuntimePackages = new Set(["onnxruntime-web"]);
const includedPrismVoiceFiles = new Set([
  "af_heart.bin",
  "af_bella.bin",
  "am_michael.bin",
  "bf_emma.bin",
  "bm_george.bin",
  "af_aoede.bin",
  "af_kore.bin",
  "af_nicole.bin",
  "af_sarah.bin",
  "am_fenrir.bin",
  "am_puck.bin",
  "bm_fable.bin"
]);

function parseArgs(argv) {
  const args = {
    outputDir: "",
    skipBuild: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      args.outputDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--skip-build") {
      args.skipBuild = true;
      continue;
    }
  }
  return args;
}

async function runCommand(command, commandArgs, cwd, env = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? -1}`));
    });
  });
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function copyDir(source, destination) {
  await fs.cp(source, destination, { recursive: true, force: true });
}

async function copyFile(source, destination) {
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}

async function readJsonFile(target) {
  const raw = await fs.readFile(target, "utf8");
  return JSON.parse(raw);
}

async function fileExists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

function nodeModulesPackagePath(packageName) {
  return `node_modules/${packageName}`;
}

function lockPackageName(lockPackagePath) {
  const parts = lockPackagePath.split("/");
  const markerIndex = parts.lastIndexOf("node_modules");
  const firstNamePart = parts[markerIndex + 1] ?? "";
  if (firstNamePart.startsWith("@")) {
    return `${firstNamePart}/${parts[markerIndex + 2] ?? ""}`;
  }
  return firstNamePart;
}

function resolveDependencyLockPath(lockPackages, fromLockPackagePath, dependencyName) {
  let currentPath = fromLockPackagePath;
  while (currentPath) {
    const nestedCandidate = `${currentPath}/node_modules/${dependencyName}`;
    if (lockPackages[nestedCandidate]) {
      return nestedCandidate;
    }

    const markerIndex = currentPath.lastIndexOf("/node_modules/");
    if (markerIndex === -1) {
      break;
    }
    currentPath = currentPath.slice(0, markerIndex);
  }

  const rootCandidate = nodeModulesPackagePath(dependencyName);
  if (lockPackages[rootCandidate]) {
    return rootCandidate;
  }

  return "";
}

async function copyLockedNodePackage(lockPackagePath, destinationRoot, options = {}) {
  const { optional = false } = options;
  const source = path.join(repoRoot, ...lockPackagePath.split("/"));
  if (!(await fileExists(source))) {
    const packageName = lockPackageName(lockPackagePath);
    if (optional) {
      console.log(`Skipping unavailable optional runtime package: ${packageName}`);
      return false;
    }
    throw new Error(`Missing runtime package: ${packageName} (${source})`);
  }
  await copyDir(source, path.join(destinationRoot, ...lockPackagePath.split("/")));
  return true;
}

async function copyRuntimeDependencyClosure(lockfile, packageName, destinationRoot, copiedPackages, options = {}) {
  const { optional = false, fromLockPackagePath = "" } = options;
  if (workspaceRuntimePackages.has(packageName) || omittedDesktopRuntimePackages.has(packageName)) {
    return;
  }

  const lockPackages = lockfile.packages ?? {};
  const lockPackagePath = fromLockPackagePath
    ? resolveDependencyLockPath(lockPackages, fromLockPackagePath, packageName)
    : nodeModulesPackagePath(packageName);
  if (!lockPackagePath) {
    if (optional) {
      console.log(`Skipping unavailable optional runtime package: ${packageName}`);
      return;
    }
    throw new Error(`Missing package-lock entry for runtime package: ${packageName}`);
  }

  const lockEntry = lockPackages[lockPackagePath];
  if (!lockEntry) {
    if (optional) {
      console.log(`Skipping unavailable optional runtime package: ${packageName}`);
      return;
    }
    throw new Error(`Missing package-lock entry for runtime package: ${packageName}`);
  }

  if (copiedPackages.has(lockPackagePath)) {
    return;
  }

  const packageWasCopied = await copyLockedNodePackage(lockPackagePath, destinationRoot, {
    optional: optional || lockEntry.optional === true
  });
  if (!packageWasCopied) {
    return;
  }
  copiedPackages.add(lockPackagePath);

  for (const dependencyName of Object.keys(lockEntry.dependencies ?? {})) {
    await copyRuntimeDependencyClosure(lockfile, dependencyName, destinationRoot, copiedPackages, {
      fromLockPackagePath: lockPackagePath
    });
  }

  for (const dependencyName of Object.keys(lockEntry.optionalDependencies ?? {})) {
    await copyRuntimeDependencyClosure(lockfile, dependencyName, destinationRoot, copiedPackages, {
      optional: true,
      fromLockPackagePath: lockPackagePath
    });
  }
}

async function pruneOnnxRuntimeNativeBinaries(destinationRoot) {
  const nativeRoot = path.join(
    destinationRoot,
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v3"
  );
  if (!(await fileExists(nativeRoot))) return;
  for (const platform of await fs.readdir(nativeRoot)) {
    const platformPath = path.join(nativeRoot, platform);
    if (platform !== process.platform) {
      await fs.rm(platformPath, { recursive: true, force: true });
      continue;
    }
    for (const architecture of await fs.readdir(platformPath)) {
      if (architecture !== process.arch) {
        await fs.rm(path.join(platformPath, architecture), {
          recursive: true,
          force: true
        });
      }
    }
  }
}

async function pruneUnusedKokoroVoices(destinationRoot) {
  const voicesRoot = path.join(
    destinationRoot,
    "node_modules",
    "kokoro-js",
    "voices"
  );
  if (!(await fileExists(voicesRoot))) return;
  for (const filename of await fs.readdir(voicesRoot)) {
    if (!includedPrismVoiceFiles.has(filename)) {
      await fs.rm(path.join(voicesRoot, filename), { force: true });
    }
  }
}

async function main() {
  const { outputDir, skipBuild } = parseArgs(process.argv.slice(2));
  if (!outputDir) {
    throw new Error("Usage: stage-desktop-runtime.mjs --output-dir <absolute-or-relative-path> [--skip-build]");
  }

  const resolvedOutputDir = path.resolve(outputDir);
  const modelCacheRoot = process.env.PRISM_BUILTIN_TTS_MODEL_CACHE
    ? path.resolve(process.env.PRISM_BUILTIN_TTS_MODEL_CACHE)
    : path.join(repoRoot, ".cache", "prism-models");
  const builtinTtsModel = await ensureBuiltinTtsModel(modelCacheRoot);

  if (!skipBuild) {
    console.log("Building workspace runtime artifacts...");
    await runCommand("npm", ["run", "build"], repoRoot);
  }

  await fs.rm(resolvedOutputDir, { recursive: true, force: true });
  await ensureDir(path.join(resolvedOutputDir, "apps", "api"));
  await ensureDir(path.join(resolvedOutputDir, "apps", "web", ".next"));
  await ensureDir(path.join(resolvedOutputDir, "node_modules", "@localai"));
  await ensureDir(path.join(resolvedOutputDir, "node"));
  await ensureDir(path.join(resolvedOutputDir, "node", "bin"));
  await ensureDir(path.join(resolvedOutputDir, "qdrant"));
  await ensureDir(path.join(resolvedOutputDir, "models"));

  const nestedApiEntry = path.join(repoRoot, "apps", "api", "dist", "apps", "api", "src", "server.js");
  const apiDistSource = (await fileExists(nestedApiEntry))
    ? path.join(repoRoot, "apps", "api", "dist", "apps", "api", "src")
    : path.join(repoRoot, "apps", "api", "dist");

  console.log("Staging API runtime...");
  await copyDir(apiDistSource, path.join(resolvedOutputDir, "apps", "api", "dist"));
  const stagedApiEntry = path.join(resolvedOutputDir, "apps", "api", "dist", "server.js");
  const apiEntryExists = await fileExists(stagedApiEntry);
  if (!apiEntryExists) {
    throw new Error(`Missing staged API entrypoint: ${stagedApiEntry}`);
  }
  await copyFile(
    path.join(repoRoot, "apps", "api", "package.json"),
    path.join(resolvedOutputDir, "apps", "api", "package.json")
  );
  await copyFile(path.join(repoRoot, "package.json"), path.join(resolvedOutputDir, "package.json"));
  await copyFile(path.join(repoRoot, "package-lock.json"), path.join(resolvedOutputDir, "package-lock.json"));

  console.log("Staging runtime dependencies...");
  const apiPackageJson = await readJsonFile(path.join(repoRoot, "apps", "api", "package.json"));
  const lockfile = await readJsonFile(path.join(repoRoot, "package-lock.json"));
  const runtimeNodeModules = path.join(resolvedOutputDir, "node_modules");
  await copyDir(
    path.join(repoRoot, "packages", "config"),
    path.join(runtimeNodeModules, "@localai", "config")
  );
  await copyDir(
    path.join(repoRoot, "packages", "shared"),
    path.join(runtimeNodeModules, "@localai", "shared")
  );

  const copiedPackages = new Set();
  for (const packageName of Object.keys(apiPackageJson.dependencies ?? {})) {
    await copyRuntimeDependencyClosure(lockfile, packageName, resolvedOutputDir, copiedPackages);
  }
  await pruneOnnxRuntimeNativeBinaries(resolvedOutputDir);
  await pruneUnusedKokoroVoices(resolvedOutputDir);

  console.log("Staging Playwright Chromium renderer...");
  const playwrightBrowsersRoot = path.join(resolvedOutputDir, "playwright-browsers");
  await runCommand(
    process.execPath,
    [path.join(repoRoot, "node_modules", "playwright", "cli.js"), "install", "chromium"],
    repoRoot,
    { PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersRoot }
  );

  console.log("Staging built-in voice model...");
  await copyDir(
    builtinTtsModel.modelDir,
    path.join(resolvedOutputDir, "models", "onnx-community", "Kokoro-82M-v1.0-ONNX")
  );

  console.log("Staging Node runtime...");
  if (process.platform === "win32") {
    await copyFile(process.execPath, path.join(resolvedOutputDir, "node", "node.exe"));
  } else {
    const targetNode = path.join(resolvedOutputDir, "node", "bin", "node");
    await copyFile(process.execPath, targetNode);
    await fs.chmod(targetNode, 0o755);
  }

  console.log("Staging Qdrant runtime...");
  let stagedQdrantEntrypoint = "qdrant/qdrant";
  if (process.platform === "win32") {
    const windowsCandidates = [
      process.env.PRISM_QDRANT_WINDOWS_PATH ?? "",
      path.join(repoRoot, "apps", "server-windows", "src", "Resources", "qdrant", "qdrant.exe"),
      path.join(repoRoot, "apps", "server-windows", "Resources", "qdrant.exe")
    ].filter(Boolean);

    let source = "";
    for (const candidate of windowsCandidates) {
      if (await fileExists(candidate)) {
        source = candidate;
        break;
      }
    }

    if (!source) {
      throw new Error(
        "Missing qdrant.exe for Windows runtime staging. Set PRISM_QDRANT_WINDOWS_PATH or provide apps/server-windows/src/Resources/qdrant/qdrant.exe."
      );
    }
    await copyFile(source, path.join(resolvedOutputDir, "qdrant", "qdrant.exe"));
    stagedQdrantEntrypoint = "qdrant/qdrant.exe";
  } else {
    const source = path.join(repoRoot, "apps", "server-mac", "Resources", "qdrant");
    const exists = await fileExists(source);
    if (!exists) {
      throw new Error("Missing qdrant binary. Build server-mac resources first.");
    }
    const target = path.join(resolvedOutputDir, "qdrant", "qdrant");
    await copyFile(source, target);
    await fs.chmod(target, 0o755);
  }

  console.log("Staging Next standalone runtime...");
  await copyDir(
    path.join(repoRoot, "apps", "web", ".next", "standalone"),
    path.join(resolvedOutputDir, "apps", "web", ".next", "standalone")
  );
  await ensureDir(
    path.join(resolvedOutputDir, "apps", "web", ".next", "standalone", "apps", "web", ".next")
  );
  await copyDir(
    path.join(repoRoot, "apps", "web", ".next", "static"),
    path.join(
      resolvedOutputDir,
      "apps",
      "web",
      ".next",
      "standalone",
      "apps",
      "web",
      ".next",
      "static"
    )
  );

  const publicDir = path.join(repoRoot, "apps", "web", "public");
  const publicExists = await fileExists(publicDir);
  if (publicExists) {
    await copyDir(
      publicDir,
      path.join(resolvedOutputDir, "apps", "web", ".next", "standalone", "apps", "web", "public")
    );
  }

  const runtimeLayout = {
    appName: "Prism Desktop",
    apiPort: 18787,
    webPort: 18788,
    runtimeEntrypoints: {
      api: "apps/api/dist/server.js",
      web: "apps/web/.next/standalone/apps/web/server.js",
      qdrant: stagedQdrantEntrypoint
    },
    dataAndLogPaths: {
      macOS: {
        data: "~/Library/Application Support/Prism",
        logs: "~/Library/Logs/Prism"
      },
      windows: {
        data: "%LOCALAPPDATA%\\Prism",
        logs: "%LOCALAPPDATA%\\Prism\\Logs"
      },
      linux: {
        data: "~/.local/share/prism",
        logs: "~/.local/state/prism/logs"
      }
    }
  };
  await fs.writeFile(
    path.join(resolvedOutputDir, "runtime-layout.json"),
    `${JSON.stringify(runtimeLayout, null, 2)}\n`,
    "utf8"
  );

  console.log(`Runtime staged at ${resolvedOutputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

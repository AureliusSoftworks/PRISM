#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

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

async function runCommand(command, commandArgs, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
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

async function fileExists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

async function main() {
  const { outputDir, skipBuild } = parseArgs(process.argv.slice(2));
  if (!outputDir) {
    throw new Error("Usage: stage-desktop-runtime.mjs --output-dir <absolute-or-relative-path> [--skip-build]");
  }

  const resolvedOutputDir = path.resolve(outputDir);

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
  await copyDir(
    path.join(repoRoot, "packages", "config"),
    path.join(resolvedOutputDir, "node_modules", "@localai", "config")
  );
  await copyDir(
    path.join(repoRoot, "packages", "shared"),
    path.join(resolvedOutputDir, "node_modules", "@localai", "shared")
  );
  await copyDir(
    path.join(repoRoot, "node_modules", "dnssd-advertise"),
    path.join(resolvedOutputDir, "node_modules", "dnssd-advertise")
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

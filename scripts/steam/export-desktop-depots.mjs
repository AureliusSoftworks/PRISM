#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = {
    version: "",
    appId: "",
    windowsDepotId: "",
    macDepotId: "",
    linuxDepotId: "",
    branch: "prerelease",
    artifactsDir: "dist-desktop",
    outputDir: "steam-build"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case "--version":
        args.version = next ?? "";
        index += 1;
        break;
      case "--app-id":
        args.appId = next ?? "";
        index += 1;
        break;
      case "--windows-depot-id":
        args.windowsDepotId = next ?? "";
        index += 1;
        break;
      case "--mac-depot-id":
        args.macDepotId = next ?? "";
        index += 1;
        break;
      case "--linux-depot-id":
        args.linuxDepotId = next ?? "";
        index += 1;
        break;
      case "--branch":
        args.branch = next ?? "prerelease";
        index += 1;
        break;
      case "--artifacts-dir":
        args.artifactsDir = next ?? "dist-desktop";
        index += 1;
        break;
      case "--output-dir":
        args.outputDir = next ?? "steam-build";
        index += 1;
        break;
      default:
        break;
    }
  }
  return args;
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function copyIfExists(source, destination) {
  try {
    await fs.access(source);
  } catch {
    return false;
  }
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
  return true;
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

function createDepotVdf(depotId, localPath) {
  return `"DepotBuildConfig"
{
  "DepotID" "${depotId}"
  "ContentRoot" "..\\\\content\\\\${localPath}"
  "FileMapping"
  {
    "LocalPath" "*"
    "DepotPath" "."
    "Recursive" "1"
  }
}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.version || !args.appId || !args.windowsDepotId || !args.macDepotId || !args.linuxDepotId) {
    throw new Error(
      "Usage: export-desktop-depots.mjs --version <x.y.z> --app-id <id> --windows-depot-id <id> --mac-depot-id <id> --linux-depot-id <id> [--branch prerelease] [--artifacts-dir dist-desktop] [--output-dir steam-build]"
    );
  }

  const projectRoot = process.cwd();
  const artifactsDir = path.resolve(projectRoot, args.artifactsDir);
  const outputDir = path.resolve(projectRoot, args.outputDir);
  const contentDir = path.join(outputDir, "content");
  const scriptsDir = path.join(outputDir, "scripts");

  await fs.rm(outputDir, { recursive: true, force: true });
  await ensureDir(path.join(contentDir, "windows"));
  await ensureDir(path.join(contentDir, "macos"));
  await ensureDir(path.join(contentDir, "linux"));
  await ensureDir(scriptsDir);

  const copied = [];
  if (
    await copyIfExists(
      path.join(artifactsDir, `Prism-Desktop-Setup-v${args.version}-win-x64.exe`),
      path.join(contentDir, "windows", `Prism-Desktop-Setup-v${args.version}-win-x64.exe`)
    )
  ) {
    copied.push("windows-exe");
  }
  if (
    await copyIfExists(
      path.join(artifactsDir, `Prism-Desktop-Setup-v${args.version}-win-x64.msi`),
      path.join(contentDir, "windows", `Prism-Desktop-Setup-v${args.version}-win-x64.msi`)
    )
  ) {
    copied.push("windows-msi");
  }
  if (
    await copyIfExists(
      path.join(artifactsDir, `Prism-Desktop-v${args.version}.dmg`),
      path.join(contentDir, "macos", `Prism-Desktop-v${args.version}.dmg`)
    )
  ) {
    copied.push("macos-dmg");
  }
  if (
    await copyIfExists(
      path.join(artifactsDir, `Prism-Desktop-v${args.version}-linux-x64.AppImage`),
      path.join(contentDir, "linux", `Prism-Desktop-v${args.version}-linux-x64.AppImage`)
    )
  ) {
    copied.push("linux-appimage");
  }

  if (!copied.includes("windows-exe") || !copied.includes("macos-dmg") || !copied.includes("linux-appimage")) {
    throw new Error(
      `Missing required desktop artifacts in ${artifactsDir}. Required: Windows EXE, macOS DMG, Linux AppImage.`
    );
  }

  await writeFile(
    path.join(scriptsDir, `depot_build_${args.windowsDepotId}.vdf`),
    createDepotVdf(args.windowsDepotId, "windows")
  );
  await writeFile(path.join(scriptsDir, `depot_build_${args.macDepotId}.vdf`), createDepotVdf(args.macDepotId, "macos"));
  await writeFile(
    path.join(scriptsDir, `depot_build_${args.linuxDepotId}.vdf`),
    createDepotVdf(args.linuxDepotId, "linux")
  );

  const appBuild = `"AppBuild"
{
  "AppID" "${args.appId}"
  "Desc" "Prism Desktop v${args.version}"
  "BuildOutput" "..\\\\output"
  "ContentRoot" "..\\\\content"
  "SetLive" "${args.branch}"
  "Depots"
  {
    "${args.windowsDepotId}" "depot_build_${args.windowsDepotId}.vdf"
    "${args.macDepotId}" "depot_build_${args.macDepotId}.vdf"
    "${args.linuxDepotId}" "depot_build_${args.linuxDepotId}.vdf"
  }
}
`;
  await writeFile(path.join(scriptsDir, `app_build_${args.appId}.vdf`), appBuild);

  await writeFile(
    path.join(outputDir, "README.txt"),
    [
      `Prism Desktop Steam build export v${args.version}`,
      "",
      "Generated files:",
      "- content/windows",
      "- content/macos",
      "- content/linux",
      "- scripts/app_build_<appid>.vdf",
      "- scripts/depot_build_<depotid>.vdf",
      "",
      "Next:",
      "1) Review the staged artifacts manually.",
      "2) Run steamcmd with the generated app_build file.",
      `3) Verify branch '${args.branch}' in Steamworks before setting wider live channels.`
    ].join("\n")
  );

  console.log(`Steam depots exported to ${outputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

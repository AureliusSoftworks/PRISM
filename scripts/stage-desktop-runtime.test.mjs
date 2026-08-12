import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import {
  STEAM_PUBLIC_EXCLUDED_TOP_LEVEL,
  STEAM_PUBLIC_EXCLUDED_FILES,
  nodeRuntimeResourceExecutable,
  nodeRuntimeSourceCandidates,
  voicePlusRequiredForDistribution,
} from "./stage-desktop-runtime.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const vendoredMacNode = path.join(
  repositoryRoot,
  "apps/server-mac/Resources/node/bin/node",
);

test("macOS desktop staging prefers PRISM's relocatable Node runtime", () => {
  assert.deepEqual(
    nodeRuntimeSourceCandidates({
      platform: "darwin",
      executablePath: "/opt/homebrew/bin/node",
      repositoryRoot,
      configuredPath: "",
    }),
    [vendoredMacNode, "/opt/homebrew/bin/node"],
  );
});

test("desktop staging preserves host Node behavior on Linux and Windows", () => {
  assert.deepEqual(
    nodeRuntimeSourceCandidates({
      platform: "linux",
      executablePath: "/usr/bin/node",
      repositoryRoot,
      configuredPath: "",
    }),
    ["/usr/bin/node"],
  );
  assert.deepEqual(
    nodeRuntimeSourceCandidates({
      platform: "win32",
      executablePath: "C:\\nodejs\\node.exe",
      repositoryRoot,
      configuredPath: "",
    }),
    ["C:\\nodejs\\node.exe"],
  );
});

test("Steam staging never falls back to the developer's host Node", () => {
  const steamLinuxNode = nodeRuntimeResourceExecutable({
    platform: "linux",
    repositoryRoot,
  });
  const steamWindowsNode = nodeRuntimeResourceExecutable({
    platform: "win32",
    repositoryRoot,
  });

  assert.deepEqual(
    nodeRuntimeSourceCandidates({
      platform: "linux",
      distribution: "steam",
      executablePath: "/usr/bin/node",
      repositoryRoot,
      configuredPath: "/tmp/unverified-node",
    }),
    [steamLinuxNode],
  );
  assert.deepEqual(
    nodeRuntimeSourceCandidates({
      platform: "win32",
      distribution: "steam",
      executablePath: "C:\\nodejs\\node.exe",
      repositoryRoot,
      configuredPath: "C:\\unverified\\node.exe",
    }),
    [steamWindowsNode],
  );
});

test("Steam staging excludes development-only public tools", () => {
  assert.deepEqual(STEAM_PUBLIC_EXCLUDED_TOP_LEVEL, [
    "bot-marketplace",
    "tools",
  ]);
  assert.deepEqual(STEAM_PUBLIC_EXCLUDED_FILES, [
    "file.svg",
    "globe.svg",
    "next.svg",
    "vercel.svg",
    "window.svg",
  ]);
});

test("Steam staging uses Instant by default and keeps Voice+ opt-in", () => {
  assert.equal(
    voicePlusRequiredForDistribution({ distribution: "steam" }),
    false,
  );
  assert.equal(
    voicePlusRequiredForDistribution({
      distribution: "steam",
      explicitlyEnabled: true,
    }),
    true,
  );
  assert.equal(
    voicePlusRequiredForDistribution({
      distribution: "development",
      explicitlyEnabled: true,
    }),
    false,
  );
});

test(
  "the available macOS Node runtime still launches after relocation",
  { skip: process.platform !== "darwin" || !existsSync(vendoredMacNode) },
  async (context) => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "prism-node-runtime-test-"),
    );
    context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
    const relocatedNode = path.join(temporaryRoot, "node", "bin", "node");
    await fs.mkdir(path.dirname(relocatedNode), { recursive: true });
    await fs.copyFile(vendoredMacNode, relocatedNode);
    await fs.chmod(relocatedNode, 0o755);

    const { stdout } = await execFileAsync(relocatedNode, ["--version"]);
    assert.match(stdout.trim(), /^v22\.22\.2$/u);
  },
);

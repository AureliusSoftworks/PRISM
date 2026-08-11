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
  nodeRuntimeSourceCandidates,
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

test("Steam staging excludes development-only public tools", () => {
  assert.deepEqual(STEAM_PUBLIC_EXCLUDED_TOP_LEVEL, [
    "bot-marketplace",
    "tools",
  ]);
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

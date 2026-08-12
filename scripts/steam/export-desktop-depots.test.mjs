import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL("./export-desktop-depots.mjs", import.meta.url));

async function runExporter(branch) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prism-steam-export-"));
  const artifactsDir = path.join(root, "artifacts");
  const outputDir = path.join(root, "steam-build");
  try {
    await execFileAsync(
      process.execPath,
      [
        scriptPath,
        "--version",
        "9.9.9",
        "--app-id",
        "5000460",
        "--windows-depot-id",
        "5000461",
        "--mac-depot-id",
        "5000462",
        "--linux-depot-id",
        "5000463",
        "--branch",
        branch,
        "--artifacts-dir",
        artifactsDir,
        "--output-dir",
        outputDir,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    return { failed: false, stderr: "", stdout: "" };
  } catch (error) {
    return {
      failed: true,
      stderr: String(error.stderr ?? ""),
      stdout: String(error.stdout ?? ""),
    };
  }
}

test("refuses to export a build directly to Steam's public default branch", async () => {
  const result = await runExporter("default");
  assert.equal(result.failed, true);
  assert.match(result.stderr, /Refusing to export a Steam build for the public default branch/u);
});

test("allows a prerelease branch to reach artifact validation", async () => {
  const result = await runExporter("prerelease");
  assert.equal(result.failed, true);
  assert.match(result.stderr, /Missing required Windows Steam depot zip/u);
});

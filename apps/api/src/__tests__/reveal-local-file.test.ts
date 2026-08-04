import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prismBranchIsDev,
  prismLocalFileRevealEnabled,
  resolvePrismBranchName,
} from "../prism-branch.ts";
import { revealLocalFileInFolder } from "../reveal-local-file.ts";

describe("prism branch gate", () => {
  it("treats only the exact dev branch as allowed", () => {
    assert.equal(prismBranchIsDev("dev"), true);
    assert.equal(prismBranchIsDev("DEV"), true);
    assert.equal(prismBranchIsDev("main"), false);
    assert.equal(prismBranchIsDev("feature/dev-tools"), false);
    assert.equal(prismBranchIsDev("unknown"), false);
  });

  it("prefers explicit env over git when resolving the branch name", () => {
    assert.equal(
      resolvePrismBranchName({ PRISM_BRANCH: "dev" } as NodeJS.ProcessEnv),
      "dev",
    );
    assert.equal(
      resolvePrismBranchName({
        NEXT_PUBLIC_PRISM_BRANCH: "main",
      } as NodeJS.ProcessEnv),
      "main",
    );
  });

  it("allows bundled desktop runtimes without Git branch metadata", () => {
    assert.equal(
      prismLocalFileRevealEnabled({
        PRISM_DESKTOP_MODE: "1",
        PRISM_BRANCH: "unknown",
      } as NodeJS.ProcessEnv),
      true,
    );
    assert.equal(
      prismLocalFileRevealEnabled({
        PRISM_DESKTOP_MODE: "0",
        PRISM_BRANCH: "dev",
      } as NodeJS.ProcessEnv),
      true,
    );
    assert.equal(
      prismLocalFileRevealEnabled({
        PRISM_DESKTOP_MODE: "0",
        PRISM_BRANCH: "main",
      } as NodeJS.ProcessEnv),
      false,
    );
  });
});

describe("reveal local file", () => {
  it("refuses missing paths without throwing", () => {
    const result = revealLocalFileInFolder(
      join(tmpdir(), `missing-prism-asset-${Date.now()}.png`),
    );
    assert.deepEqual(result, { ok: false, reason: "missing" });
  });

  it("accepts an existing file path on this platform", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-reveal-"));
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "sprite.png");
    writeFileSync(filePath, Buffer.from([137, 80, 78, 71]));
    const result = revealLocalFileInFolder(filePath);
    // Desktop sessions should succeed; headless CI may report spawn_failed.
    assert.ok(
      result.ok === true ||
        (result.ok === false && result.reason === "spawn_failed"),
    );
  });

  it("uses absolute launcher paths so a thin PATH still works", () => {
    const source = readFileSync(
      new URL("../reveal-local-file.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /spawnSync/u);
    assert.match(source, /\/usr\/bin\/open/u);
    assert.match(source, /explorer\.exe/u);
    assert.match(source, /\/usr\/bin\/xdg-open/u);
  });
});

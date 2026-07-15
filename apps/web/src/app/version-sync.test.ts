import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRISM_APP_VERSION } from "../prismAppVersion.ts";

const repoRoot = new URL("../../../../", import.meta.url);

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, repoRoot), "utf8");
}

function readRepoJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readRepoFile(relativePath)) as Record<string, unknown>;
}

const canonicalVersion = String(readRepoJson("package.json").version ?? "");

test("the auth page and every product manifest use the root app version", () => {
  assert.match(canonicalVersion, /^\d+\.\d+\.\d+$/u);
  assert.equal(PRISM_APP_VERSION, canonicalVersion);
  assert.match(
    readRepoFile("apps/web/src/app/page.tsx"),
    /pillTestId="auth-app-version"/,
  );

  for (const relativePath of [
    "apps/api/package.json",
    "apps/web/package.json",
    "apps/desktop/package.json",
    "apps/desktop/src-tauri/tauri.conf.json",
    "packages/shared/package.json",
    "packages/config/package.json",
  ]) {
    assert.equal(
      readRepoJson(relativePath).version,
      canonicalVersion,
      `${relativePath} drifted from the root app version`,
    );
  }
});

test("local package-lock entries use the root app version", () => {
  for (const relativePath of [
    "package-lock.json",
    "apps/api/package-lock.json",
    "apps/web/package-lock.json",
    "packages/shared/package-lock.json",
    "packages/config/package-lock.json",
  ]) {
    const lock = readRepoJson(relativePath);
    assert.equal(
      lock.version,
      canonicalVersion,
      `${relativePath} root version drifted`,
    );

    const packages = lock.packages as Record<
      string,
      { name?: string; version?: string }
    >;
    for (const [packagePath, entry] of Object.entries(packages ?? {})) {
      if (
        entry.name === "localai-chatgov" ||
        entry.name?.startsWith("@localai/")
      ) {
        assert.equal(
          entry.version,
          canonicalVersion,
          `${relativePath}:${packagePath || "root"} drifted`,
        );
      }
    }
  }
});

test("native and server version constants use the root app version", () => {
  assert.match(
    readRepoFile("apps/api/src/health.ts"),
    new RegExp(`PRISM_SERVER_VERSION = "${canonicalVersion}"`),
  );
  assert.match(
    readRepoFile("apps/desktop/src-tauri/Cargo.toml"),
    new RegExp(`^version = "${canonicalVersion}"$`, "m"),
  );
  assert.match(
    readRepoFile("apps/desktop/src-tauri/Cargo.lock"),
    new RegExp(
      `\\[\\[package\\]\\]\\nname = "prism_desktop"\\nversion = "${canonicalVersion}"`,
    ),
  );
  assert.match(
    readRepoFile("apps/server-windows/src/PrismServer.csproj"),
    new RegExp(`<Version>${canonicalVersion}</Version>`),
  );

  for (const relativePath of [
    "apps/client-mac/PrismClient.xcodeproj/project.pbxproj",
    "apps/server-mac/PrismServer.xcodeproj/project.pbxproj",
  ]) {
    const versions = [
      ...readRepoFile(relativePath).matchAll(/MARKETING_VERSION = ([^;]+);/g),
    ].map((match) => match[1]);
    assert.ok(versions.length > 0, `${relativePath} has no marketing version`);
    assert.deepEqual(
      new Set(versions),
      new Set([canonicalVersion]),
      `${relativePath} drifted from the root app version`,
    );
  }
});

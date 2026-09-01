import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  ABOUT_CREDIT_GROUPS,
  ABOUT_CREDIT_MAINTENANCE_NOTE,
} from "./aboutCredits.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const packageManifestPaths = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "apps/desktop/package.json",
  "packages/config/package.json",
  "packages/shared/package.json",
] as const;

function directNpmPackages(): string[] {
  const names = new Set<string>();
  for (const relativePath of packageManifestPaths) {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, relativePath), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const group of [manifest.dependencies, manifest.devDependencies]) {
      for (const name of Object.keys(group ?? {})) {
        if (!name.startsWith("@localai/")) names.add(name);
      }
    }
  }
  return [...names].sort();
}

function directCargoPackages(): string[] {
  const lines = readFileSync(
    resolve(repoRoot, "apps/desktop/src-tauri/Cargo.toml"),
    "utf8",
  ).split(/\r?\n/u);
  const names = new Set<string>();
  let dependenciesSection = false;
  for (const line of lines) {
    const section = line.match(/^\[([^\]]+)\]\s*$/u)?.[1];
    if (section) {
      dependenciesSection = /(?:^|\.)(?:build-)?dependencies$/u.test(section);
      continue;
    }
    if (!dependenciesSection) continue;
    const name = line.match(/^([A-Za-z0-9_-]+)\s*=/u)?.[1];
    if (name) names.add(name);
  }
  return [...names].sort();
}

describe("About credits", () => {
  it("keeps every direct npm and Cargo dependency represented", () => {
    const credits = ABOUT_CREDIT_GROUPS.flatMap((group) => group.credits);
    const creditedNpmPackages = new Set(
      credits.flatMap((credit) => credit.packageNames ?? []),
    );
    const creditedCargoPackages = new Set(
      credits.flatMap((credit) => credit.cargoPackageNames ?? []),
    );

    assert.deepEqual(
      directNpmPackages().filter((name) => !creditedNpmPackages.has(name)),
      [],
      "Add each new direct npm package to its visible About credit.",
    );
    assert.deepEqual(
      directCargoPackages().filter((name) => !creditedCargoPackages.has(name)),
      [],
      "Add each new direct Cargo dependency to its visible About credit.",
    );
  });

  it("keeps credits complete, linked, and grouped for the Settings surface", () => {
    assert.deepEqual(
      ABOUT_CREDIT_GROUPS.map((group) => group.id),
      ["frameworks", "services", "assets", "tooling"],
    );
    const credits = ABOUT_CREDIT_GROUPS.flatMap((group) => group.credits);
    assert.equal(new Set(credits.map((credit) => credit.id)).size, credits.length);
    assert.equal(
      credits.find((credit) => credit.id === "natural-earth")?.license,
      "Public domain",
    );
    assert.equal(
      credits.find((credit) => credit.id === "the-midnight-clue")?.name,
      "The Midnight Clue",
    );
    assert.equal(
      credits.find((credit) => credit.id === "whodunnit-traversal-foley")?.name,
      "Whodunnit Venue Traversal Foley",
    );
    for (const group of ABOUT_CREDIT_GROUPS) {
      assert.ok(group.description.trim());
      assert.ok(group.credits.length > 0);
      for (const credit of group.credits) {
        assert.ok(credit.name.trim());
        assert.ok(credit.description.trim());
        if (credit.href) assert.match(credit.href, /^https:\/\//u);
      }
    }
    assert.match(ABOUT_CREDIT_MAINTENANCE_NOTE, /new frameworks/u);
    assert.match(ABOUT_CREDIT_MAINTENANCE_NOTE, /external assets/u);
  });

  it("renders the living registry inside Settings About", () => {
    const pageSource = readFileSync(
      resolve(repoRoot, "apps/web/src/app/page.tsx"),
      "utf8",
    );
    const cssSource = readFileSync(
      resolve(repoRoot, "apps/web/src/app/page.module.css"),
      "utf8",
    );

    assert.match(pageSource, /ABOUT_CREDIT_GROUPS\.map/u);
    assert.match(pageSource, /data-settings-about-credits="true"/u);
    assert.match(pageSource, /target="_blank"/u);
    assert.match(cssSource, /\.settingsCreditsGroup/u);
  });
});

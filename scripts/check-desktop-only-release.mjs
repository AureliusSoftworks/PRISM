#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const checkedFiles = [
  "README.md",
  "docs/distribution-model.md",
  "docs/release-process.md",
  ".github/workflows/release-main.yml",
  ".github/workflows/release-desktop-all.yml"
];

const forbiddenPatterns = [
  /server\/v<version>/i,
  /server\/v\$\{?[^}\s]+/i,
  /client\/v<version>/i,
  /client\/v\$\{?[^}\s]+/i,
  /release-server-[a-z-]+\.yml/i
];

async function main() {
  const failures = [];

  for (const relativePath of checkedFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    const contents = await fs.readFile(absolutePath, "utf8");
    const lines = contents.split("\n");

    lines.forEach((line, index) => {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          failures.push(`${relativePath}:${index + 1}: ${line.trim()}`);
          break;
        }
      }
    });
  }

  if (failures.length > 0) {
    console.error("Desktop-only guardrail failed. Remove split-lane references:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Desktop-only guardrail passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

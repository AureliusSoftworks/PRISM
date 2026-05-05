#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { augmentVault } from "./kb/augmenter.mjs";
import { generateVault } from "./kb/generator.mjs";
import { scanRepository } from "./kb/scanner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const KB_CONFIG = {
  vaultDir: "vault",
  qdrantCollection: "prism_kb",
};

async function ensureVaultScaffold() {
  const vaultRoot = path.join(repoRoot, KB_CONFIG.vaultDir);
  const dirs = [
    "00-inbox",
    "01-overview",
    "02-apps",
    "03-packages",
    "04-docs",
    "05-lessons",
    "06-releases",
    "07-features",
    "99-templates",
    ".obsidian",
  ];
  for (const rel of dirs) {
    await mkdir(path.join(vaultRoot, rel), { recursive: true });
  }

  const files = [
    {
      relPath: ".indexignore",
      content: [".obsidian/", "99-templates/", "08-attachments/", ""].join("\n"),
    },
    {
      relPath: ".obsidian/app.json",
      content: JSON.stringify(
        {
          attachmentFolderPath: "08-attachments",
          newFileLocation: "current",
          useMarkdownLinks: true,
        },
        null,
        2,
      ),
    },
    {
      relPath: ".obsidian/core-plugins.json",
      content: JSON.stringify(
        [
          "backlink",
          "graph",
          "outgoing-link",
          "page-preview",
          "search",
          "templates",
          "daily-notes",
        ],
        null,
        2,
      ),
    },
    {
      relPath: "99-templates/note.md",
      content: [
        "---",
        'title: "{{title}}"',
        "type: note",
        "domain: inbox",
        "tags:",
        "  - prism",
        "status: draft",
        "---",
        "",
        "# {{title}}",
        "",
        "## Context",
        "",
        "## Notes",
        "",
      ].join("\n"),
    },
    {
      relPath: "99-templates/feature.md",
      content: [
        "---",
        'title: "{{title}}"',
        "type: feature",
        "domain: feature",
        "tags:",
        "  - prism",
        "  - feature",
        "status: draft",
        "---",
        "",
        "# {{title}}",
        "",
        "## Problem",
        "",
        "## Solution",
        "",
        "## Linked files",
        "",
      ].join("\n"),
    },
  ];

  for (const file of files) {
    const abs = path.join(vaultRoot, file.relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    let previous = null;
    try {
      previous = await readFile(abs, "utf8");
    } catch {
      previous = null;
    }
    if (previous !== file.content) {
      await writeFile(abs, file.content, "utf8");
    }
  }
}

function changedFilesFromHead() {
  try {
    const stdout = execFileSync(
      "git",
      ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    return new Set(
      stdout
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

async function runSync({ incremental = false, augmentOnly = false }) {
  process.env.KB_QDRANT_COLLECTION = KB_CONFIG.qdrantCollection;
  await ensureVaultScaffold();

  if (!augmentOnly) {
    const scanData = await scanRepository(repoRoot);
    const generated = await generateVault({
      repoRoot,
      vaultDir: KB_CONFIG.vaultDir,
      scanData,
    });
    console.log(
      `[kb] generated notes: ${generated.generatedCount}, changed files: ${generated.changedCount}`,
    );
  }

  const changedSourcePaths = incremental ? changedFilesFromHead() : null;
  const augmentLimitFromEnv = Number(process.env.KB_AUGMENT_LIMIT ?? "40");
  const maxNotes =
    Number.isFinite(augmentLimitFromEnv) && augmentLimitFromEnv >= 0
      ? augmentLimitFromEnv
      : 40;
  const augmented = await augmentVault({
    repoRoot,
    vaultDir: KB_CONFIG.vaultDir,
    changedSourcePaths,
    maxNotes,
  });
  if (augmented.aiEnabled) {
    console.log(
      `[kb] AI augmentation complete for ${augmented.processedNotes} notes (limit: ${maxNotes}, skipped: ${augmented.skippedNotes})`,
    );
  } else {
    console.log(
      `[kb] AI augmentation skipped (set OLLAMA_HOST and QDRANT_URL to enable)`,
    );
  }
}

const command = process.argv[2] ?? "sync";

if (command === "sync") {
  await runSync({ incremental: false, augmentOnly: false });
} else if (command === "incremental") {
  await runSync({ incremental: true, augmentOnly: false });
} else if (command === "augment") {
  await runSync({ incremental: false, augmentOnly: true });
} else {
  console.error(`Unknown kb command: ${command}`);
  console.error("Usage: node scripts/kb.mjs [sync|incremental|augment]");
  process.exitCode = 1;
}

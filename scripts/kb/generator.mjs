import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashText } from "./cache.mjs";

const SUMMARY_START = "<!-- kb:summary:start -->";
const SUMMARY_END = "<!-- kb:summary:end -->";
const RELATED_START = "<!-- kb:related:start -->";
const RELATED_END = "<!-- kb:related:end -->";

function toUnixPath(value) {
  return value.split(path.sep).join("/");
}

function withoutMdExtension(relPath) {
  return relPath.endsWith(".md") ? relPath.slice(0, -3) : relPath;
}

function buildWikiLinkFromNotePath(noteRelPath) {
  const noMd = withoutMdExtension(noteRelPath);
  return `[[${noMd}]]`;
}

function frontmatterBlock(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
      continue;
    }
    lines.push(`${key}: "${String(value).replaceAll('"', '\\"')}"`);
  }
  lines.push("---");
  return lines.join("\n");
}

function kebabCase(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeDirname(filePath) {
  return path.dirname(filePath);
}

async function writeIfChanged(absPath, content) {
  let previous = null;
  try {
    previous = await readFile(absPath, "utf8");
  } catch {
    previous = null;
  }
  let merged = content;
  if (previous) {
    const currentSummary = extractBetween(previous, SUMMARY_START, SUMMARY_END);
    const currentRelated = extractBetween(previous, RELATED_START, RELATED_END);
    if (currentSummary) {
      merged = replaceBetween(merged, SUMMARY_START, SUMMARY_END, currentSummary);
    }
    if (currentRelated) {
      merged = replaceBetween(merged, RELATED_START, RELATED_END, currentRelated);
    }
  }
  if (previous === merged) {
    return false;
  }
  await mkdir(makeDirname(absPath), { recursive: true });
  await writeFile(absPath, merged, "utf8");
  return true;
}

function sourceNotePath(relPath) {
  if (relPath.startsWith("apps/")) {
    return `02-apps/${relPath.slice("apps/".length)}.md`;
  }
  if (relPath.startsWith("packages/")) {
    return `03-packages/${relPath.slice("packages/".length)}.md`;
  }
  return `03-packages/misc/${kebabCase(relPath)}.md`;
}

function docNotePath(relPath) {
  if (relPath.startsWith("docs/")) {
    return `04-docs/${relPath}.md`;
  }
  return `04-docs/${relPath}.md`;
}

function lessonNotePath(entry) {
  const slug = kebabCase(entry.heading).slice(0, 60);
  return `05-lessons/${entry.date}-${slug}-${entry.id}.md`;
}

function releaseNotePath(release) {
  return `06-releases/v${release.version}.md`;
}

function featureNotePath(index, text) {
  return `07-features/${String(index + 1).padStart(2, "0")}-${kebabCase(text).slice(0, 70)}.md`;
}

function summaryPlaceholder() {
  return [
    "## AI Summary",
    SUMMARY_START,
    "_Pending Ollama summary._",
    SUMMARY_END,
    "",
  ].join("\n");
}

function relatedPlaceholder() {
  return [
    "## Related (semantic)",
    RELATED_START,
    "_Pending semantic related links._",
    RELATED_END,
    "",
  ].join("\n");
}

function extractBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return content.slice(start + startMarker.length, end).trim();
}

function replaceBetween(content, startMarker, endMarker, replacement) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  return `${content.slice(0, start + startMarker.length)}\n${replacement}\n${content.slice(end)}`;
}

function createNoteBody({
  title,
  type,
  sourcePath,
  tags,
  domain,
  links,
  referencedBy,
  sections,
}) {
  const frontmatter = frontmatterBlock({
    title,
    type,
    domain,
    tags: tags.length ? tags : ["prism"],
    source: sourcePath ?? "",
    status: "active",
  });
  const linkLines = links.length ? links.map((link) => `- ${link}`).join("\n") : "- _None yet_";
  const inboundLines = referencedBy.length
    ? referencedBy.map((link) => `- ${link}`).join("\n")
    : "- _No backlinks yet_";

  return [
    frontmatter,
    "",
    `# ${title}`,
    "",
    summaryPlaceholder(),
    "## Linked notes",
    linkLines,
    "",
    "## Referenced by",
    inboundLines,
    "",
    ...sections,
    "",
    relatedPlaceholder(),
  ].join("\n");
}

export async function generateVault({
  repoRoot,
  vaultDir,
  scanData,
}) {
  const noteRecords = [];
  const sourcePathToNote = new Map();

  for (const sourceFile of scanData.sourceFiles) {
    const noteRelPath = sourceNotePath(sourceFile.relPath);
    sourcePathToNote.set(sourceFile.relPath, noteRelPath);
  }

  const docsWithRoot = [...scanData.docs, scanData.readme, scanData.design];
  for (const doc of docsWithRoot) {
    sourcePathToNote.set(doc.relPath, docNotePath(doc.relPath));
  }

  for (const sourceFile of scanData.sourceFiles) {
    const outgoing = new Set();
    for (const relImport of sourceFile.resolvedImports) {
      const targetNote = sourcePathToNote.get(relImport);
      if (targetNote) {
        outgoing.add(buildWikiLinkFromNotePath(targetNote));
      }
    }
    for (const mention of sourceFile.mentions) {
      const targetNote = sourcePathToNote.get(mention);
      if (targetNote) {
        outgoing.add(buildWikiLinkFromNotePath(targetNote));
      }
    }
    const noteRelPath = sourcePathToNote.get(sourceFile.relPath);
    noteRecords.push({
      id: sourceFile.relPath,
      sourcePath: sourceFile.relPath,
      noteRelPath,
      title: sourceFile.relPath,
      type: "note",
      domain: sourceFile.relPath.startsWith("apps/") ? "apps" : "packages",
      tags: [
        "prism",
        sourceFile.relPath.startsWith("apps/") ? "apps" : "packages",
      ],
      links: [...outgoing],
      sections: [
        "## Source path",
        `- \`${sourceFile.relPath}\``,
        "",
        "## Import references",
        sourceFile.rawImports.length
          ? sourceFile.rawImports.map((value) => `- \`${value}\``).join("\n")
          : "- _No imports detected_",
        "",
        "## Source preview",
        "```text",
        sourceFile.preview.trim(),
        sourceFile.preview.length >= 1400 ? "\n... (truncated)" : "",
        "```",
      ],
      embeddingText: `${sourceFile.relPath}\n${sourceFile.preview}`,
    });
  }

  for (const doc of docsWithRoot) {
    const outgoing = new Set();
    for (const mention of doc.mentions) {
      const targetNote = sourcePathToNote.get(mention);
      if (targetNote) {
        outgoing.add(buildWikiLinkFromNotePath(targetNote));
      }
    }
    const noteRelPath = sourcePathToNote.get(doc.relPath);
    noteRecords.push({
      id: doc.relPath,
      sourcePath: doc.relPath,
      noteRelPath,
      title: doc.relPath,
      type: "note",
      domain: "docs",
      tags: ["prism", "docs"],
      links: [...outgoing],
      sections: [
        "## Source path",
        `- \`${doc.relPath}\``,
        "",
        "## Body preview",
        "```markdown",
        doc.content.slice(0, 2200).trim(),
        doc.content.length >= 2200 ? "\n... (truncated)" : "",
        "```",
      ],
      embeddingText: `${doc.relPath}\n${doc.content.slice(0, 6000)}`,
    });
  }

  for (const lesson of scanData.lessons) {
    const outgoing = new Set();
    const appliesMentions = [...lesson.appliesTo.matchAll(/\b(?:apps|packages|docs|tasks)\/[^\s`]+/g)];
    for (const match of appliesMentions) {
      const targetNote = sourcePathToNote.get(match[0]);
      if (targetNote) {
        outgoing.add(buildWikiLinkFromNotePath(targetNote));
      }
    }
    noteRecords.push({
      id: `lesson:${lesson.heading}`,
      sourcePath: "tasks/lessons.md",
      noteRelPath: lessonNotePath(lesson),
      title: `${lesson.date} · ${lesson.category}`,
      type: "lesson",
      domain: lesson.category,
      tags: ["prism", "lesson", lesson.category],
      links: [...outgoing],
      sections: [
        "## Trigger",
        lesson.trigger || "_Missing_",
        "",
        "## Lesson",
        lesson.lesson || "_Missing_",
        "",
        "## Applies to",
        lesson.appliesTo || "_Missing_",
        "",
        "## Raw entry",
        "```markdown",
        lesson.raw,
        "```",
      ],
      embeddingText: `${lesson.heading}\n${lesson.trigger}\n${lesson.lesson}\n${lesson.appliesTo}`,
    });
  }

  for (const release of scanData.releases) {
    const mentions = release.body.match(/\b(?:apps|packages|docs|tasks)\/[a-zA-Z0-9._\-\/]+(?:\.[a-zA-Z0-9]+)?\b/g) ?? [];
    const outgoing = new Set();
    for (const mention of mentions) {
      const targetNote = sourcePathToNote.get(mention);
      if (targetNote) {
        outgoing.add(buildWikiLinkFromNotePath(targetNote));
      }
    }
    noteRecords.push({
      id: `release:${release.version}`,
      sourcePath: "CHANGELOG.md",
      noteRelPath: releaseNotePath(release),
      title: `Release ${release.version}`,
      type: "release",
      domain: "release",
      tags: ["prism", "release"],
      links: [...outgoing],
      sections: [
        "## Release metadata",
        `- Version: \`${release.version}\``,
        `- Date: \`${release.date}\``,
        "",
        "## Changelog excerpt",
        "```markdown",
        release.body.slice(0, 4000),
        release.body.length > 4000 ? "\n... (truncated)" : "",
        "```",
      ],
      embeddingText: `Release ${release.version}\n${release.body.slice(0, 6000)}`,
    });
  }

  scanData.featureBullets.forEach((feature, index) => {
    noteRecords.push({
      id: `feature:${index}`,
      sourcePath: "README.md",
      noteRelPath: featureNotePath(index, feature),
      title: `Feature ${index + 1}`,
      type: "feature",
      domain: "feature",
      tags: ["prism", "feature"],
      links: [buildWikiLinkFromNotePath("04-docs/README.md.md")],
      sections: ["## Feature description", feature],
      embeddingText: feature,
    });
  });

  const backlinkMap = new Map();
  for (const record of noteRecords) {
    for (const wikiLink of record.links) {
      const normalized = wikiLink.replace(/^\[\[/, "").replace(/\]\]$/, "");
      if (!backlinkMap.has(normalized)) {
        backlinkMap.set(normalized, new Set());
      }
      backlinkMap.get(normalized).add(buildWikiLinkFromNotePath(record.noteRelPath));
    }
  }

  const generated = [];
  for (const record of noteRecords) {
    const noteKey = withoutMdExtension(record.noteRelPath);
    const referencedBy = [...(backlinkMap.get(noteKey) ?? [])].sort();
    const content = createNoteBody({
      title: record.title,
      type: record.type,
      sourcePath: record.sourcePath,
      tags: record.tags,
      domain: record.domain,
      links: [...record.links].sort(),
      referencedBy,
      sections: record.sections,
    });
    const absolutePath = path.join(repoRoot, vaultDir, record.noteRelPath);
    const changed = await writeIfChanged(absolutePath, content);
    generated.push({
      ...record,
      hash: hashText(content),
      changed,
    });
  }

  const mocNotes = [
    {
      noteRelPath: "01-overview/PRISM.md",
      title: "PRISM",
      description: "Top-level map of PRISM knowledge areas.",
      links: [
        "[[01-overview/Apps MOC]]",
        "[[01-overview/Packages MOC]]",
        "[[01-overview/Docs MOC]]",
        "[[01-overview/Lessons MOC]]",
        "[[01-overview/Releases MOC]]",
        "[[01-overview/Features MOC]]",
      ],
    },
    {
      noteRelPath: "01-overview/Apps MOC.md",
      title: "Apps MOC",
      description: "Code notes generated from apps/.",
      links: generated
        .filter((item) => item.sourcePath.startsWith("apps/"))
        .map((item) => buildWikiLinkFromNotePath(item.noteRelPath)),
    },
    {
      noteRelPath: "01-overview/Packages MOC.md",
      title: "Packages MOC",
      description: "Code notes generated from packages/.",
      links: generated
        .filter((item) => item.sourcePath.startsWith("packages/"))
        .map((item) => buildWikiLinkFromNotePath(item.noteRelPath)),
    },
    {
      noteRelPath: "01-overview/Docs MOC.md",
      title: "Docs MOC",
      description: "Documentation notes and architecture references.",
      links: generated
        .filter((item) => item.domain === "docs")
        .map((item) => buildWikiLinkFromNotePath(item.noteRelPath)),
    },
    {
      noteRelPath: "01-overview/Lessons MOC.md",
      title: "Lessons MOC",
      description: "Project lessons mined from tasks/lessons.md.",
      links: generated
        .filter((item) => item.type === "lesson")
        .map((item) => buildWikiLinkFromNotePath(item.noteRelPath)),
    },
    {
      noteRelPath: "01-overview/Releases MOC.md",
      title: "Releases MOC",
      description: "Release notes by semantic version.",
      links: generated
        .filter((item) => item.type === "release")
        .map((item) => buildWikiLinkFromNotePath(item.noteRelPath)),
    },
    {
      noteRelPath: "01-overview/Features MOC.md",
      title: "Features MOC",
      description: "Feature bullets extracted from README.",
      links: generated
        .filter((item) => item.type === "feature")
        .map((item) => buildWikiLinkFromNotePath(item.noteRelPath)),
    },
  ];

  for (const moc of mocNotes) {
    const content = [
      frontmatterBlock({
        title: moc.title,
        type: "moc",
        domain: "overview",
        tags: ["prism", "moc"],
        source: "generated",
        status: "active",
      }),
      "",
      `# ${moc.title}`,
      "",
      moc.description,
      "",
      summaryPlaceholder(),
      "## Linked notes",
      moc.links.length ? moc.links.map((link) => `- ${link}`).join("\n") : "- _No links yet_",
      "",
      relatedPlaceholder(),
    ].join("\n");
    const absPath = path.join(repoRoot, vaultDir, moc.noteRelPath);
    await writeIfChanged(absPath, content);
  }

  const manifestPath = path.join(repoRoot, vaultDir, ".kb-manifest.json");
  const nextRecords = generated.map((item) => ({
    id: item.id,
    sourcePath: item.sourcePath,
    noteRelPath: toUnixPath(item.noteRelPath),
    title: item.title,
    type: item.type,
    domain: item.domain,
    hash: item.hash,
    embeddingText: item.embeddingText,
  }));

  let previousUpdatedAt = null;
  let previousRecordsJson = null;
  try {
    const previousManifestRaw = await readFile(manifestPath, "utf8");
    const previousManifest = JSON.parse(previousManifestRaw);
    if (typeof previousManifest.updatedAt === "string") {
      previousUpdatedAt = previousManifest.updatedAt;
    }
    if (Array.isArray(previousManifest.records)) {
      previousRecordsJson = JSON.stringify(previousManifest.records);
    }
  } catch {
    // No previous manifest yet or invalid JSON.
  }

  const nextRecordsJson = JSON.stringify(nextRecords);
  const recordsChanged = previousRecordsJson !== nextRecordsJson;
  const manifest = {
    updatedAt:
      recordsChanged || !previousUpdatedAt
        ? new Date().toISOString()
        : previousUpdatedAt,
    records: nextRecords,
  };

  await writeIfChanged(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    manifestPath,
    generatedCount: generated.length,
    changedCount: generated.filter((item) => item.changed).length,
  };
}

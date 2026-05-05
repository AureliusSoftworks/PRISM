import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".swift",
  ".json",
]);

const TEXT_EXTENSIONS = new Set([".md", ...SOURCE_EXTENSIONS]);
const GENERATED_DIR_NAMES = new Set([
  ".next",
  "DerivedData",
  "build",
  "dist",
  "bin",
  "obj",
]);

function toUnixPath(value) {
  return value.split(path.sep).join("/");
}

async function walkFiles(rootDir) {
  const items = [];
  async function walk(currentPath) {
    let entries = [];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(currentPath, entry.name);
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      if (entry.isDirectory()) {
        if (GENERATED_DIR_NAMES.has(entry.name)) {
          continue;
        }
        await walk(absolute);
        continue;
      }
      if (entry.isFile()) {
        items.push(absolute);
      }
    }
  }
  await walk(rootDir);
  return items;
}

function parseImports(sourceText) {
  const results = [];
  const importPattern =
    /\bimport\s+(?:[^"'`]+\s+from\s+)?["'`]([^"'`]+)["'`]/g;
  const requirePattern = /\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  const exportPattern = /\bexport\s+[^"'`]*\sfrom\s+["'`]([^"'`]+)["'`]/g;
  for (const pattern of [importPattern, requirePattern, exportPattern]) {
    for (const match of sourceText.matchAll(pattern)) {
      if (match[1]) {
        results.push(match[1]);
      }
    }
  }
  return [...new Set(results)];
}

async function resolveImport(fromFile, rawImport, repoRoot) {
  if (!rawImport.startsWith(".")) {
    return null;
  }
  const basePath = path.resolve(path.dirname(fromFile), rawImport);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.mjs"),
  ];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        return toUnixPath(path.relative(repoRoot, candidate));
      }
    } catch {
      // Continue trying other candidates.
    }
  }
  return null;
}

function parseLessons(content) {
  const chunks = content.split(/\n### /g);
  const parsed = [];
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const lines = chunk.split("\n");
    const heading = lines[0]?.trim() ?? "";
    const dateMatch = heading.match(/^(\d{4}-\d{2}-\d{2})\s+·\s+\[(.+?)\]/);
    const triggerMatch = chunk.match(/\*\*Trigger\*\*:\s*(.+)/);
    const lessonMatch = chunk.match(/\*\*Lesson\*\*:\s*(.+)/);
    const appliesMatch = chunk.match(/\*\*Applies to\*\*:\s*(.+)/);
    parsed.push({
      id: `lesson-${index}`,
      date: dateMatch?.[1] ?? "unknown-date",
      category: dateMatch?.[2] ?? "uncategorized",
      heading,
      trigger: triggerMatch?.[1]?.trim() ?? "",
      lesson: lessonMatch?.[1]?.trim() ?? "",
      appliesTo: appliesMatch?.[1]?.trim() ?? "",
      raw: `### ${chunk}`.trim(),
    });
  }
  return parsed;
}

function parseReleases(changelog) {
  const regex = /^## \[(.+?)\]\s*-\s*(.+)$/gm;
  const headers = [...changelog.matchAll(regex)];
  const results = [];
  for (let i = 0; i < headers.length; i += 1) {
    const match = headers[i];
    const next = headers[i + 1];
    const version = match[1];
    const date = match[2];
    const start = match.index + match[0].length;
    const end = next ? next.index : changelog.length;
    const body = changelog.slice(start, end).trim();
    results.push({
      version,
      date,
      body,
    });
  }
  return results;
}

function parseFeatureBullets(readme) {
  const match = readme.match(/## Features([\s\S]*?)(\n## |\n# |$)/);
  if (!match) {
    return [];
  }
  const lines = match[1].split("\n");
  const features = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) {
      continue;
    }
    const clean = trimmed.replace(/^-+\s*/, "");
    features.push(clean);
  }
  return features;
}

function collectPathMentions(text) {
  const results = new Set();
  const pathPattern =
    /\b(?:apps|packages|docs|tasks)\/[a-zA-Z0-9._\-\/]+(?:\.[a-zA-Z0-9]+)?\b/g;
  for (const match of text.matchAll(pathPattern)) {
    if (match[0]) {
      results.add(match[0]);
    }
  }
  return [...results];
}

export async function scanRepository(repoRoot) {
  const appRoot = path.join(repoRoot, "apps");
  const packageRoot = path.join(repoRoot, "packages");
  const docsRoot = path.join(repoRoot, "docs");

  const appFiles = await walkFiles(appRoot);
  const packageFiles = await walkFiles(packageRoot);

  const sourceFiles = [];
  for (const absoluteFile of [...appFiles, ...packageFiles]) {
    const extension = path.extname(absoluteFile);
    if (!TEXT_EXTENSIONS.has(extension)) {
      continue;
    }
    const sourceText = await readFile(absoluteFile, "utf8");
    const relPath = toUnixPath(path.relative(repoRoot, absoluteFile));
    const rawImports = SOURCE_EXTENSIONS.has(extension)
      ? parseImports(sourceText)
      : [];
    const resolvedImports = [];
    for (const rawImport of rawImports) {
      const resolved = await resolveImport(absoluteFile, rawImport, repoRoot);
      if (resolved) {
        resolvedImports.push(resolved);
      }
    }
    sourceFiles.push({
      relPath,
      extension,
      rawImports,
      resolvedImports: [...new Set(resolvedImports)],
      mentions: collectPathMentions(sourceText),
      preview: sourceText.slice(0, 1400),
    });
  }

  const docFiles = await walkFiles(docsRoot);
  const docs = [];
  for (const absoluteDoc of docFiles) {
    if (path.extname(absoluteDoc) !== ".md") {
      continue;
    }
    const relPath = toUnixPath(path.relative(repoRoot, absoluteDoc));
    const content = await readFile(absoluteDoc, "utf8");
    docs.push({
      relPath,
      content,
      mentions: collectPathMentions(content),
    });
  }

  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const design = await readFile(path.join(repoRoot, "DESIGN.md"), "utf8");
  const changelog = await readFile(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  const lessonsRaw = await readFile(
    path.join(repoRoot, "tasks", "lessons.md"),
    "utf8",
  );

  return {
    sourceFiles,
    docs,
    readme: {
      relPath: "README.md",
      content: readme,
      mentions: collectPathMentions(readme),
    },
    design: {
      relPath: "DESIGN.md",
      content: design,
      mentions: collectPathMentions(design),
    },
    lessons: parseLessons(lessonsRaw),
    releases: parseReleases(changelog),
    featureBullets: parseFeatureBullets(readme),
  };
}

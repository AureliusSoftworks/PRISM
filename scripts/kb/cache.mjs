import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join("scripts", "kb", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "state.json");

function createEmptyCache() {
  return {
    hashes: {},
    summaries: {},
    related: {},
    updatedAt: new Date().toISOString(),
  };
}

export function hashText(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadCache(repoRoot) {
  const filePath = path.join(repoRoot, CACHE_FILE);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyCache(),
      ...parsed,
      hashes: parsed.hashes ?? {},
      summaries: parsed.summaries ?? {},
      related: parsed.related ?? {},
    };
  } catch {
    return createEmptyCache();
  }
}

export async function saveCache(repoRoot, cache) {
  const dirPath = path.join(repoRoot, CACHE_DIR);
  const filePath = path.join(repoRoot, CACHE_FILE);
  await mkdir(dirPath, { recursive: true });
  const payload = {
    ...cache,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

export function cacheFilePath(repoRoot) {
  return path.join(repoRoot, CACHE_FILE);
}

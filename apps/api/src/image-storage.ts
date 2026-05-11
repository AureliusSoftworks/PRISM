import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { resolveDbPath } from "./db.ts";

const GENERATED_SUBDIR = "generated-images";

/** Directory containing `localai.db` — generated images live alongside it. */
export function resolveLocalAiDataRoot(): string {
  return dirname(resolveDbPath());
}

/**
 * Relative path stored in SQLite (POSIX-style segments), never absolute.
 * Example: `generated-images/{userId}/{imageId}.png`
 */
export function buildGeneratedImageRelativePath(userId: string, imageId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(imageId)) {
    throw new Error("Invalid image path segment.");
  }
  return `${GENERATED_SUBDIR}/${userId}/${imageId}.png`;
}

/**
 * Resolves a DB-relative path to an absolute path under the data root.
 * Rejects values that escape the root (path traversal).
 */
export function resolveAbsoluteUnderDataRoot(localRelPath: string): string {
  const trimmed = localRelPath.trim();
  if (!trimmed || trimmed.includes("..")) {
    throw new Error("Invalid stored image path.");
  }
  const root = resolve(resolveLocalAiDataRoot());
  const candidate = resolve(root, trimmed);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || rel === "") {
    throw new Error("Resolved path escapes data directory.");
  }
  return candidate;
}

export function writeGeneratedImageBytes(localRelPath: string, bytes: Buffer): void {
  const absolute = resolveAbsoluteUnderDataRoot(localRelPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

export function readGeneratedImageBytes(localRelPath: string): Buffer {
  const absolute = resolveAbsoluteUnderDataRoot(localRelPath);
  return readFileSync(absolute);
}

/** Best-effort delete of one stored file; ignores missing files. */
export function tryUnlinkGeneratedImageFile(localRelPath: string | null | undefined): void {
  if (!localRelPath?.trim()) return;
  try {
    const absolute = resolveAbsoluteUnderDataRoot(localRelPath.trim());
    if (existsSync(absolute)) {
      unlinkSync(absolute);
    }
  } catch {
    // Caller logs persistence cleanup failures.
  }
}

/**
 * Removes `generated-images/{userId}/` after DB rows are gone (account deletion).
 */
export function removeGeneratedImagesDirectoryForUser(userId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return;
  }
  const root = resolve(resolveLocalAiDataRoot());
  const dir = resolve(root, GENERATED_SUBDIR, userId);
  const rel = relative(root, dir);
  if (rel.startsWith("..") || rel === "") {
    return;
  }
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Fetch remote image bytes after provider returns a temporary URL. */
export async function downloadRemoteImage(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<Buffer> {
  const res = await fetch(url, { signal: options?.signal });
  if (!res.ok) {
    throw new Error(`Failed to persist generated image (download ${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("Persisted image download was empty.");
  }
  return buf;
}
